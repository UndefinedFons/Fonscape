import { use, useEffect, useRef, useState } from "react";
import type { ContentMetadataByType, ContentType } from "./types.ts";
import { getCollectionDescriptor, loadCollectionPageChunk } from "./content/index.ts";

/** Render the first collection chunk, then append later chunks one at a time while idle. */
export function useProgressiveCollection<T extends ContentType>(type: T): {
  items: readonly ContentMetadataByType[T][];
  error: unknown;
  retry: () => void;
} {
  const firstChunk = use(loadCollectionPageChunk(type, 0));
  const [items, setItems] = useState<readonly ContentMetadataByType[T][]>(firstChunk);
  const [error, setError] = useState<unknown>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const nextIndexRef = useRef({ type, firstChunk, index: 1 });

  useEffect(() => {
    nextIndexRef.current = { type, firstChunk, index: 1 };
    setItems(firstChunk);
    setError(null);
  }, [firstChunk, type]);

  useEffect(() => {
    let active = true;
    let idleId: number | null = null;
    let timerId: number | null = null;
    const chunkCount = getCollectionDescriptor(type)?.pageChunkCount || 0;
    const schedule = () => {
      if (!active || nextIndexRef.current.index >= chunkCount) return;
      if ("requestIdleCallback" in (window as Partial<Window>)) idleId = (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout?: number }) => number }).requestIdleCallback(loadNext, { timeout: 2500 });
      else timerId = window.setTimeout(loadNext, 400);
    };
    const loadNext = async () => {
      if (!active) return;
      const index = nextIndexRef.current.index;
      let chunk: readonly ContentMetadataByType[T][];
      try {
        chunk = await loadCollectionPageChunk(type, index);
      } catch (loadError) {
        if (active) setError(loadError);
        return;
      }
      if (!active) return;
      nextIndexRef.current.index = index + 1;
      setError(null);
      if (chunk.length) setItems((current) => [...current, ...chunk]);
      schedule();
    };
    schedule();
    return () => {
      active = false;
      if (idleId !== null) (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [firstChunk, retryVersion, type]);

  return {
    items,
    error,
    retry: () => {
      setError(null);
      setRetryVersion((version) => version + 1);
    },
  };
}
