import { responsiveImages } from "../functions/_generated/responsive-images.js";

type ResponsiveImageCandidate = { src: string; width: number };
type ResponsiveImage = { width: number; height: number; candidates: ResponsiveImageCandidate[]; lqip?: string };

export const detailImageSizes = "(max-width: 760px) calc(100vw - 68px), min(calc(100vw - 116px), 790px)";

const responsiveImageCatalog = responsiveImages as Record<string, ResponsiveImage>;
const registeredResponsiveImages: Record<string, ResponsiveImage> = {};

export function registerResponsiveImages(entries: unknown) {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return;
  for (const [source, value] of Object.entries(entries)) {
    if (!value || typeof value !== "object" || !Array.isArray((value as ResponsiveImage).candidates)) continue;
    registeredResponsiveImages[source] = value as ResponsiveImage;
  }
}

function responsiveImage(source: string) {
  return registeredResponsiveImages[source] || responsiveImageCatalog[source];
}

export function responsiveImageCandidates(source: string) {
  return responsiveImage(source)?.candidates || [];
}

export function responsiveImageProps(source: string, sizes: string) {
  const candidates = responsiveImageCandidates(source);
  const src = candidates[0]?.src || source;
  return {
    src,
    ...(candidates.length > 1 ? {
      srcSet: candidates.map(({ src: candidateSource, width }) => `${candidateSource} ${width}w`).join(", "),
      sizes,
    } : {}),
  };
}

export function responsiveImageLqip(source: string) {
  return responsiveImage(source)?.lqip || "";
}

/** Pick the smallest candidate that covers the intended rendered width. */
export function responsiveImageUrl(source: string, intendedWidth: number) {
  const candidates = responsiveImageCandidates(source);
  return candidates.find(({ width }) => width >= intendedWidth)?.src || candidates.at(-1)?.src || source;
}
