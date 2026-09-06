import { responsiveImageProps } from "./responsiveImages.ts";

/** Route modules resolve together with their image metadata, so src is never empty. */
export function useResponsiveImage(source, sizes) {
  return responsiveImageProps(source, sizes);
}
