import { use, useEffect, useState } from "react";
import { getCollectionDescriptor, loadCollectionPageChunk } from "./content/index.js";

/** Render the first collection chunk, then append later chunks one at a time while idle. */
export function useProgressiveCollection(type) {
  const firstChunk = use(loadCollectionPageChunk(type, 0));
  const [items, setItems] = useState(firstChunk);

  useEffect(() => {
    let active = true;
    let idleId = null;
    let timerId = null;
    let nextIndex = 1;
    const chunkCount = getCollectionDescriptor(type)?.pageChunkCount || 0;
    setItems(firstChunk);
    const schedule = () => {
      if (!active || nextIndex >= chunkCount) return;
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(loadNext, { timeout: 2500 });
      else timerId = window.setTimeout(loadNext, 400);
    };
    const loadNext = async () => {
      if (!active) return;
      const chunk = await loadCollectionPageChunk(type, nextIndex).catch(() => []);
      if (!active) return;
      nextIndex += 1;
      if (chunk.length) setItems((current) => [...current, ...chunk]);
      schedule();
    };
    schedule();
    return () => {
      active = false;
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [firstChunk, type]);

  return items;
}
