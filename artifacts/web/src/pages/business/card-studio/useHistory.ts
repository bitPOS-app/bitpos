import { useCallback, useRef, useState } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const MAX_HISTORY = 100;
const COALESCE_MS = 800;

/**
 * Undo/redo history for a single document value.
 *
 * `commit` accepts either a next value or a producer `(prev) => next`. Pass a
 * `coalesceKey` for high-frequency edits (color sliders, arrow-key nudging) so
 * consecutive changes with the same key within a short window collapse into one
 * undo step instead of flooding the history stack.
 */
export function useHistory<T>(initial: T) {
  const [hist, setHist] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });
  const lastKey = useRef<string | null>(null);
  const lastAt = useRef(0);

  const commit = useCallback((next: T | ((prev: T) => T), coalesceKey?: string) => {
    setHist((h) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(h.present) : next;
      const now = Date.now();
      const coalesce =
        !!coalesceKey && coalesceKey === lastKey.current && now - lastAt.current < COALESCE_MS;
      lastKey.current = coalesceKey ?? null;
      lastAt.current = now;
      return {
        past: coalesce ? h.past : [...h.past.slice(-(MAX_HISTORY - 1)), h.present],
        present: value,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    lastKey.current = null;
    setHist((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: prev,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    lastKey.current = null;
    setHist((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((value: T) => {
    lastKey.current = null;
    lastAt.current = 0;
    setHist({ past: [], present: value, future: [] });
  }, []);

  return {
    doc: hist.present,
    commit,
    undo,
    redo,
    reset,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
  };
}
