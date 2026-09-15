import { useEffect, useState } from "react";
import { loadCollectionFacets } from "./content/index.ts";
import type { ContentFacetEntry } from "./content/types.ts";

/** Lightweight metadata supplies complete filtering and pagination counts. */
export function useCollectionIndex(type: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    type: string;
    items: readonly (ContentFacetEntry & { slug: string })[];
    loading: boolean;
    error: boolean;
  }>({ type, items: [], loading: true, error: false });
  useEffect(() => {
    let active = true;
    setState({ type, items: [], loading: true, error: false });
    void loadCollectionFacets(type).then((entries) => {
      if (active) setState({ type, items: entries.map((entry) => ({
        ...entry, slug: type === "music" ? entry.key.slice(entry.key.indexOf("/") + 1) : entry.key,
      })), loading: false, error: false });
    }).catch(() => {
      if (active) setState({ type, items: [], loading: false, error: true });
    });
    return () => { active = false; };
  }, [type, attempt]);
  const current = state.type === type;
  return {
    items: current ? state.items : [],
    loading: !current || state.loading,
    error: current && state.error,
    retrying: current && state.loading && attempt > 0,
    retry: () => { if (!state.loading) setAttempt((value) => value + 1); },
  };
}
