import { AccountAuth } from "./AccountAuth.jsx";
import { AccountCenter } from "./AccountCenter.jsx";
import { useCommunity } from "./CommunityProvider.jsx";

export function AccountDialog({ onClose }) {
  const { viewer } = useCommunity();
  return viewer ? <AccountCenter onClose={onClose} /> : <AccountAuth />;
}
