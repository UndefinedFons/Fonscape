import { responsiveImages } from "../functions/_generated/responsive-images.js";

type ResponsiveImageCandidate = { src: string; width: number };
type ResponsiveImage = { width: number; height: number; candidates: ResponsiveImageCandidate[] };

export const detailImageSizes = "(max-width: 760px) calc(100vw - 68px), min(calc(100vw - 116px), 790px)";

const responsiveImageCatalog = responsiveImages as Record<string, ResponsiveImage>;
const loadedResponsiveImages: Record<string, ResponsiveImage> = {};
let fullManifestIndexPromise: Promise<typeof import("../functions/_generated/responsive-images-full.js")> | undefined;
const responsiveImageChunkPromises = new Map<number, Promise<void>>();

function isLocalRasterSource(source: string) {
  return /^\/(?:assets|fonscape)\/[^?#]+\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/iu.test(source);
}

export function preloadResponsiveImageIndex() {
  fullManifestIndexPromise ||= import("../functions/_generated/responsive-images-full.js");
  return fullManifestIndexPromise.then(() => undefined);
}

export async function loadResponsiveImage(source: string) {
  if (!isLocalRasterSource(source) || responsiveImageCatalog[source] || loadedResponsiveImages[source]) return;
  const { responsiveImageChunkLoaders, responsiveImageSourceChunks } = await (fullManifestIndexPromise ||= import("../functions/_generated/responsive-images-full.js"));
  const chunkIndex = (responsiveImageSourceChunks as Readonly<Record<string, number>>)[source];
  if (!Number.isInteger(chunkIndex)) return;
  let chunkPromise = responsiveImageChunkPromises.get(chunkIndex);
  if (!chunkPromise) {
    chunkPromise = responsiveImageChunkLoaders[chunkIndex]().then(({ responsiveImageChunk }) => {
      Object.assign(loadedResponsiveImages, responsiveImageChunk as Record<string, ResponsiveImage>);
    });
    responsiveImageChunkPromises.set(chunkIndex, chunkPromise);
  }
  await chunkPromise;
}

export function responsiveImageMetadataLoaded(source: string) {
  return !isLocalRasterSource(source) || Boolean(responsiveImageCatalog[source] || loadedResponsiveImages[source]);
}

export function responsiveImageCandidates(source: string) {
  return loadedResponsiveImages[source]?.candidates || responsiveImageCatalog[source]?.candidates || [];
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
