import { AccountAuth } from "./AccountAuth.tsx";
import { AccountCenter } from "./AccountCenter.tsx";
import { useCommunity } from "./CommunityProvider.tsx";

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { viewer } = useCommunity();
  return viewer ? <AccountCenter onClose={onClose} /> : <AccountAuth />;
}
