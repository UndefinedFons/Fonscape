import { responsiveImages } from "../functions/_generated/responsive-images.js";

/** @typedef {{ src: string, width: number }} ResponsiveImageCandidate */
/** @typedef {{ width: number, height: number, candidates: ResponsiveImageCandidate[] }} ResponsiveImage */
const responsiveImageCatalog = /** @type {Record<string, ResponsiveImage>} */ (responsiveImages);
/** @type {Record<string, ResponsiveImage> | null} */
let fullResponsiveImageCatalog = null;
/** @type {Promise<void> | undefined} */
let fullResponsiveImageCatalogPromise;

export function ensureFullResponsiveImages() {
  if (!fullResponsiveImageCatalogPromise) {
    fullResponsiveImageCatalogPromise = import("../functions/_generated/responsive-images-full.js").then(({ fullResponsiveImages }) => {
      fullResponsiveImageCatalog = /** @type {Record<string, ResponsiveImage>} */ (fullResponsiveImages);
    });
  }
  return fullResponsiveImageCatalogPromise;
}

/** @param {string} source */
export function responsiveImageCandidates(source) {
  return fullResponsiveImageCatalog?.[source]?.candidates || responsiveImageCatalog[source]?.candidates || [];
}

/**
 * @param {string} source
 * @param {string} sizes
 */
export function responsiveImageProps(source, sizes) {
  const candidates = responsiveImageCandidates(source);
  if (candidates.length < 2) return {};
  return {
    srcSet: candidates.map(({ src, width }) => `${src} ${width}w`).join(", "),
    sizes,
  };
}

/**
 * Pick the smallest generated candidate that meets the intended rendered
 * width. The original remains the lossless fallback for larger surfaces.
 *
 * @param {string} source
 * @param {number} intendedWidth
 */
export function responsiveImageUrl(source, intendedWidth) {
  const candidates = responsiveImageCandidates(source);
  return candidates.find(({ width }) => width >= intendedWidth)?.src || candidates.at(-1)?.src || source;
}
