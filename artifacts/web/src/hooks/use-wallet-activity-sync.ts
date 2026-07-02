import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetBalanceQueryKey,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";

type WalletActivity = {
  txCount: number;
  lastActivityAt: string | null;
};

const POLL_INTERVAL_MS = 5000;

/**
 * Keeps balance and transaction queries fresh by polling a cheap DB-only
 * activity endpoint (no NWC relay traffic). When wallet activity changes,
 * the balance and transactions queries are invalidated so the UI updates
 * within a few seconds of a payment - no manual refresh needed.
 */
export function useWalletActivitySync(accountId: string | undefined) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["wallet-activity", accountId],
    queryFn: () =>
      customFetch<WalletActivity>(`/api/accounts/${accountId}/activity`),
    enabled: !!accountId,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const prevSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!accountId || !data) return;
    const signature = `${data.lastActivityAt ?? ""}:${data.txCount}`;
    if (prevSignature.current !== null && prevSignature.current !== signature) {
      queryClient.invalidateQueries({ queryKey: getGetBalanceQueryKey(accountId) });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(accountId) });
    }
    prevSignature.current = signature;
  }, [data, accountId, queryClient]);
}
