import type { StudioDoc } from "./types";

const DRAFTS_KEY = "cardStudio.drafts.v1";
const BRAND_KEY = "cardStudio.brandKit.v1";
const AUTOSAVE_KEY = "cardStudio.autosave.v1";

export interface Draft {
  id: string;
  name: string;
  updatedAt: number;
  doc: StudioDoc;
  thumb: string | null;
}

export interface BrandKit {
  colors: string[];
  logo: string | null;
  font: string | null;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Most likely a quota error (designs embed images as data URLs).
    return false;
  }
}

// ── Drafts ────────────────────────────────────────────────────────────────────

export function listDrafts(): Draft[] {
  return read<Draft[]>(DRAFTS_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveDraft(draft: Draft): boolean {
  const drafts = read<Draft[]>(DRAFTS_KEY, []);
  const idx = drafts.findIndex((d) => d.id === draft.id);
  if (idx >= 0) drafts[idx] = draft;
  else drafts.push(draft);
  return write(DRAFTS_KEY, drafts);
}

export function deleteDraft(id: string): void {
  write(DRAFTS_KEY, read<Draft[]>(DRAFTS_KEY, []).filter((d) => d.id !== id));
}

// ── Autosave ────────────────────────────────────────────────────────────────

export function loadAutosave(): StudioDoc | null {
  return read<StudioDoc | null>(AUTOSAVE_KEY, null);
}

export function saveAutosave(doc: StudioDoc): boolean {
  return write(AUTOSAVE_KEY, doc);
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

// ── Brand kit ─────────────────────────────────────────────────────────────────

export function loadBrandKit(): BrandKit {
  return read<BrandKit>(BRAND_KEY, { colors: [], logo: null, font: null });
}

export function saveBrandKit(kit: BrandKit): boolean {
  return write(BRAND_KEY, kit);
}
