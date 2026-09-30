import { responsiveImageProps } from "./responsiveImages.ts";

/** Route modules resolve together with their image metadata, so src is never empty. */
export function useResponsiveImage(source: string | undefined, sizes?: string): ReturnType<typeof responsiveImageProps> {
  return responsiveImageProps(source, sizes);
}
