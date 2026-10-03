export interface LyricLine { time: number; text: string; translation?: string }

function timedLines(text: string): LyricLine[] {
  const offset = Number(text.match(/\[offset:([+-]?\d+)\]/iu)?.[1] || 0) / 1000;
  const lines: LyricLine[] = [];
  for (const row of text.split(/\r?\n/u)) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/gu)];
    const content = row.replace(/\[[^\]]*\]/gu, "").trim();
    if (!content) continue;
    for (const stamp of stamps) {
      lines.push({ time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + Number(`0.${stamp[3] || 0}`) + offset), text: content });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function parseMusicLyrics(lyric: string, translation = ""): LyricLine[] {
  const translated = timedLines(translation);
  return timedLines(lyric).map((line) => {
    const match = translated.find((item) => Math.abs(item.time - line.time) < .1);
    return match && match.text !== line.text ? { ...line, translation: match.text } : line;
  });
}

export function activeLyricIndex(lines: readonly LyricLine[], time: number): number {
  let index = -1;
  for (let i = 0; i < lines.length && lines[i].time <= time; i += 1) index = i;
  return index;
}

export function formatMusicTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Scroll only the lyric viewport; document position never participates. */
export function centerLyricLine(container: HTMLElement, line: HTMLElement, reducedMotion: boolean) {
  const relativeTop = line.offsetParent === container ? line.offsetTop - container.scrollTop : line.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTo({ top: container.scrollTop + relativeTop - container.clientHeight / 2 + line.clientHeight / 2, behavior: reducedMotion ? "instant" : "smooth" });
}
