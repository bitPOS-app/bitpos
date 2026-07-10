import { db, cardOrdersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";

// Authoritative Printags lifecycle, arranged in real fulfilment order.
// Source: GET https://api.printags.com/statuses
// NOTE: Printags' numeric status ids are NOT in lifecycle order (e.g. in_queue
// is id 19 but happens early), so we order them explicitly here.
export const PRINTAGS_LIFECYCLE = [
  "creating",
  "draft",
  "in_queue",
  "created",
  "validated",
  "processing",
  "treated",
  "batching",
  "sent_for_printing",
  "manufacturing",
  "packaging",
  "packaged",
  "ready_for_shipping",
  "shipped",
  "delivered",
] as const;

// Non-linear Printags statuses, mapped to the internal bitPOS status we store.
export const PRINTAGS_EXCEPTIONS: Record<string, string> = {
  cancelled: "cancelled",
  canceled: "cancelled", // American spelling variant
  on_hold: "on_hold",
  returned: "returned",
  refunded: "refunded",
  failed: "failed",
};

// Every Printags lifecycle status maps to exactly one coarse bitPOS status used
// by the 5-step order timeline (Pending -> Confirmed -> Printing -> Shipped ->
// Delivered). The exact Printags status is stored separately in printStatus.
const COARSE_BY_PRINTAGS: Record<string, string> = {
  creating:           "confirmed",
  draft:              "confirmed",
  in_queue:           "confirmed",
  created:            "confirmed",
  validated:          "confirmed",
  processing:         "confirmed",
  treated:            "confirmed",
  batching:           "confirmed",
  sent_for_printing:  "printing",
  manufacturing:      "printing",
  packaging:          "printing",
  packaged:           "printing",
  ready_for_shipping: "printing",
  shipped:            "shipped",
  delivered:          "delivered",
};

// Internal coarse pipeline, in order, for forward-only guarding of the timeline.
export const COARSE_LINEAR = [
  "awaiting_payment",
  "pending",
  "confirmed",
  "printing",
  "shipped",
  "delivered",
] as const;

// Hard-terminal coarse statuses: once an order lands here it must not be dragged
// back into the pipeline by a later/stale event (delivered is handled via the
// lifecycle rank, not here, so delivered -> returned stays possible).
const HARD_TERMINAL_EXCEPTIONS = new Set(["cancelled", "returned", "refunded"]);

export function cleanStatus(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().trim();
}

/** Map a raw Printags status string to the internal coarse timeline status. */
export function toCoarseStatus(rawStatus: string): string {
  const s = cleanStatus(rawStatus);
  if (PRINTAGS_EXCEPTIONS[s]) return PRINTAGS_EXCEPTIONS[s]!;
  return COARSE_BY_PRINTAGS[s] ?? "confirmed";
}

function lifecycleRank(printStatus: string): number {
  return (PRINTAGS_LIFECYCLE as readonly string[]).indexOf(printStatus);
}
function coarseRank(coarse: string): number {
  return (COARSE_LINEAR as readonly string[]).indexOf(coarse);
}

export interface OrderStatusState {
  status: string;
  printStatus: string | null;
  trackingNumber: string | null;
}

export interface StatusUpdate {
  status?: string;
  printStatus?: string;
  trackingNumber?: string;
}

/**
 * Decide what to persist given the current stored state and a new raw Printags
 * status (+ optional tracking number). Returns null when nothing should change.
 *
 * Pure (no DB access) so it can be unit tested. The same logic backs all three
 * update paths: the webhook, the page-load enrich, and the background poller.
 *
 * Forward-only: a later or stale event can never move an order backwards through
 * the Printags lifecycle. Exception statuses (cancelled/returned/refunded/failed/
 * on_hold) are authoritative and applied directly, except a hard-terminal order
 * (cancelled/returned/refunded) is never resurrected.
 */
export function computeStatusUpdate(
  current: OrderStatusState,
  rawStatus: string,
  trackingNumber?: string | null,
): StatusUpdate | null {
  const update: StatusUpdate = {};

  if (trackingNumber && trackingNumber !== current.trackingNumber) {
    update.trackingNumber = trackingNumber;
  }

  const nextPrint = cleanStatus(rawStatus);
  if (nextPrint) {
    const curPrint = current.printStatus ? cleanStatus(current.printStatus) : null;
    const nextIsException = nextPrint in PRINTAGS_EXCEPTIONS;
    const curMappedException = curPrint ? PRINTAGS_EXCEPTIONS[curPrint] : undefined;

    // Determine the current hard-terminal coarse state from EITHER the exact
    // printStatus OR the coarse status. Legacy rows (created before the
    // print_status column existed) can be coarse-terminal with a null
    // printStatus, and those must still be protected from resurrection.
    const curStatusClean = cleanStatus(current.status);
    const curTerminalCoarse =
      (curMappedException && HARD_TERMINAL_EXCEPTIONS.has(curMappedException) ? curMappedException : undefined) ??
      (HARD_TERMINAL_EXCEPTIONS.has(curStatusClean) ? curStatusClean : undefined);
    const curIsHardTerminal = curTerminalCoarse !== undefined;

    // A hard-terminal order only accepts re-affirmation of the same terminal state.
    const blocked =
      curIsHardTerminal &&
      !(nextIsException && PRINTAGS_EXCEPTIONS[nextPrint] === curTerminalCoarse);

    if (!blocked) {
      let advance = false;
      if (nextIsException) {
        advance = curPrint !== nextPrint;
      } else if (curPrint == null || curPrint in PRINTAGS_EXCEPTIONS) {
        // First status ever, or resuming from on_hold/failed -> accept.
        advance = curPrint !== nextPrint;
      } else {
        // Both in the lifecycle: strictly forward only.
        advance = lifecycleRank(nextPrint) > lifecycleRank(curPrint);
      }

      if (advance) {
        update.printStatus = nextPrint;
        const nextCoarse = toCoarseStatus(nextPrint);
        if (nextCoarse !== current.status) {
          const forwardCoarse =
            nextIsException ||
            coarseRank(current.status) < 0 || // resuming from a non-linear coarse (on_hold/failed)
            coarseRank(nextCoarse) > coarseRank(current.status);
          if (forwardCoarse) update.status = nextCoarse;
        }
      }
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}

/**
 * Read the order by its Printags order id, compute the forward-only update, and
 * persist it. The write is guarded on the coarse status read a moment ago so two
 * concurrent updaters (webhook + poller) cannot clobber each other; the loser is
 * re-reconciled on the next poll. Returns true when a row was updated.
 */
export async function applyPrintagsStatus(
  printOrderId: string,
  rawStatus: string,
  trackingNumber?: string | null,
): Promise<boolean> {
  const [existing] = await db
    .select({
      id: cardOrdersTable.id,
      status: cardOrdersTable.status,
      printStatus: cardOrdersTable.printStatus,
      trackingNumber: cardOrdersTable.trackingNumber,
    })
    .from(cardOrdersTable)
    .where(eq(cardOrdersTable.printOrderId, printOrderId));

  if (!existing) {
    logger.warn(
      { printOrderId, rawStatus },
      "Printags status update: no order matches printOrderId (not submitted yet?)",
    );
    return false;
  }

  const update = computeStatusUpdate(
    { status: existing.status, printStatus: existing.printStatus, trackingNumber: existing.trackingNumber },
    rawStatus,
    trackingNumber ?? undefined,
  );

  if (!update) return false;

  // Optimistic compare-and-swap guarded on BOTH the coarse status and the exact
  // printStatus we read a moment ago. This prevents two concurrent updaters
  // (webhook + poller) whose statuses map to the same coarse stage (e.g.
  // manufacturing and packaging both -> printing) from clobbering each other and
  // moving printStatus backwards. The loser is re-reconciled on the next poll.
  const printGuard =
    existing.printStatus === null
      ? isNull(cardOrdersTable.printStatus)
      : eq(cardOrdersTable.printStatus, existing.printStatus);

  const result = await db
    .update(cardOrdersTable)
    .set(update)
    .where(
      and(
        eq(cardOrdersTable.id, existing.id),
        eq(cardOrdersTable.status, existing.status),
        printGuard,
      ),
    )
    .returning({ id: cardOrdersTable.id });

  if (result.length === 0) {
    logger.info(
      { printOrderId, internalOrderId: existing.id },
      "Printags status update skipped (concurrent update won the race)",
    );
    return false;
  }

  logger.info(
    { printOrderId, internalOrderId: existing.id, rawStatus, update },
    "Printags status applied",
  );
  return true;
}
