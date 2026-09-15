import { useEffect, useState } from "react";
import { loadCollectionPageChunk } from "./content/index.ts";
import type { CollectionPageEntry, ContentFacetEntry } from "./content/types.ts";

/** Resolve only the chunks represented on the visible pagination page. */
export function useCollectionPage(type: string, selection: readonly ContentFacetEntry[]) {
  const selectionKey = JSON.stringify(selection.map(({ key, page }) => [key, page]));
  const resultKey = `${type}:${selectionKey}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    items: readonly CollectionPageEntry[];
    error: boolean;
    loading: boolean;
  }>({ key: "", items: [], error: false, loading: true });

  useEffect(() => {
    let active = true;
    const selected: [string, number][] = JSON.parse(selectionKey);
    setResult((previous) => ({ key: resultKey, items: previous.key === resultKey ? previous.items : [], error: previous.key === resultKey && previous.error, loading: selected.length > 0 }));
    const load = async () => {
      const entries = new Map<string, CollectionPageEntry>();
      try {
        for (const page of new Set(selected.map(([, page]) => page))) {
          if (!active) return;
          const chunk = await loadCollectionPageChunk(type, page);
          if (!active) return;
          chunk.forEach((entry) => entries.set(entry.key, entry));
        }
        const items = selected.map(([key]) => entries.get(key));
        if (items.some((entry) => !entry)) throw new Error("内容索引与分块不一致。");
        setResult({ key: resultKey, items: items as CollectionPageEntry[], error: false, loading: false });
      } catch {
        if (active) setResult({ key: resultKey, items: selected.flatMap(([key]) => entries.has(key) ? [entries.get(key)!] : []), error: true, loading: false });
      }
    };
    void load();
    return () => { active = false; };
  }, [type, selectionKey, resultKey, attempt]);

  const current = result.key === resultKey;
  return {
    items: current ? result.items : [],
    error: current && result.error,
    loading: !current || result.loading,
    retrying: current && result.loading && attempt > 0,
    retry: () => { if (!result.loading) setAttempt((value) => value + 1); },
  };
}
