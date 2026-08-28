import { responsiveImages } from "../functions/_generated/responsive-images.js";

type ResponsiveImageCandidate = { src: string; width: number };
type ResponsiveImage = { width: number; height: number; candidates: ResponsiveImageCandidate[] };

export const detailImageSizes = "(max-width: 760px) calc(100vw - 68px), min(calc(100vw - 116px), 790px)";

const responsiveImageCatalog = responsiveImages as Record<string, ResponsiveImage>;
let fullResponsiveImageCatalog: Record<string, ResponsiveImage> | null = null;
let fullResponsiveImageCatalogPromise: Promise<void> | undefined;

export function ensureFullResponsiveImages() {
  if (!fullResponsiveImageCatalogPromise) {
    fullResponsiveImageCatalogPromise = import("../functions/_generated/responsive-images-full.js")
      .then(({ responsiveImageChunkLoaders }) => Promise.all(responsiveImageChunkLoaders.map((loadChunk) => loadChunk())))
      .then((modules) => {
        fullResponsiveImageCatalog = Object.assign(
          {},
          ...modules.map(({ responsiveImageChunk }) => responsiveImageChunk as Record<string, ResponsiveImage>),
        );
      });
  }
  return fullResponsiveImageCatalogPromise;
}

export function responsiveImageCandidates(source: string) {
  return fullResponsiveImageCatalog?.[source]?.candidates || responsiveImageCatalog[source]?.candidates || [];
}

export function responsiveImageProps(source: string, sizes: string) {
  const candidates = responsiveImageCandidates(source);
  if (candidates.length < 2) return {};
  return {
    srcSet: candidates.map(({ src, width }) => `${src} ${width}w`).join(", "),
    sizes,
  };
}

/** Pick the smallest candidate that covers the intended rendered width. */
export function responsiveImageUrl(source: string, intendedWidth: number) {
  const candidates = responsiveImageCandidates(source);
  return candidates.find(({ width }) => width >= intendedWidth)?.src || candidates.at(-1)?.src || source;
}
