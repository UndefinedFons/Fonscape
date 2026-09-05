import { useEffect, useState } from "react";
import { loadResponsiveImage, responsiveImageMetadataLoaded, responsiveImageProps } from "./responsiveImages.ts";

/** Load only this source's metadata before allowing the browser to request it. */
export function useResponsiveImage(source, sizes) {
  const [resolvedSource, setResolvedSource] = useState(() => source && responsiveImageMetadataLoaded(source) ? source : "");
  const ready = Boolean(source) && (responsiveImageMetadataLoaded(source) || resolvedSource === source);

  useEffect(() => {
    if (!source || ready) return undefined;
    let active = true;
    loadResponsiveImage(source)
      .catch(() => {})
      .finally(() => { if (active) setResolvedSource(source); });
    return () => { active = false; };
  }, [ready, source]);

  return ready
    ? { src: source, ...(sizes ? responsiveImageProps(source, sizes) : {}) }
    : { src: undefined };
}
