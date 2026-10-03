import { useSyncExternalStore } from "react";
import { musicSession } from "./musicSession.ts";

export function useMusicSession() {
  return useSyncExternalStore(musicSession.subscribe, musicSession.getSnapshot, musicSession.getSnapshot);
}
