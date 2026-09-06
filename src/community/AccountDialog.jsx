import { use, useMemo } from "react";
import { AccountAuth } from "./AccountAuth.jsx";
import { AccountCenter } from "./AccountCenter.jsx";
import { useCommunity } from "./CommunityProvider.jsx";
import { loadSearchIndex } from "../content/index.js";

export function AccountDialog({ onClose }) {
  const indexedContent = use(loadSearchIndex());
  const contentLookup = useMemo(() => new Map(indexedContent.map((entry) => [`${entry.type}:${entry.key}`, entry])), [indexedContent]);
  const { viewer } = useCommunity();
  return viewer ? <AccountCenter contentLookup={contentLookup} onClose={onClose} /> : <AccountAuth />;
}
