import createDOMPurify from "dompurify";

function roundMermaidRectangles(root: ParentNode): void {
  root.querySelectorAll("g.node rect.basic.label-container, rect.actor.actor-top, rect.actor.actor-bottom").forEach((node) => {
    if (!node.getAttribute("rx") || node.getAttribute("rx") === "0") node.setAttribute("rx", "8");
    if (!node.getAttribute("ry") || node.getAttribute("ry") === "0") node.setAttribute("ry", "8");
  });
}

export function sanitizeMermaidSvg(svg: unknown): string {
  if (typeof window === "undefined" || typeof svg !== "string") return "";
  // Mermaid serializes HTML line breaks as void tags; XML requires a closing slash.
  const parsed = new window.DOMParser().parseFromString(svg.replace(/<br\s*\/?>/giu, "<br/>"), "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg"
    || parsed.documentElement.namespaceURI !== "http://www.w3.org/2000/svg") return "";
  roundMermaidRectangles(parsed);
  const root = parsed.documentElement as unknown as SVGSVGElement;
  const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/u).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    root.setAttribute("width", String(viewBox[2]));
    root.setAttribute("height", String(viewBox[3]));
    root.style.width = `${viewBox[2]}px`;
    root.style.maxWidth = "none";
    root.style.height = "auto";
  }
  return createDOMPurify(window).sanitize(root, {
    USE_PROFILES: { svg: true, svgFilters: true, mathMl: true },
    // Math enables HTML labels for the whole diagram, including ordinary Markdown text.
    ADD_TAGS: ["foreignObject", "div", "span", "p", "br", "strong", "em"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
}
