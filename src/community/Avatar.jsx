import { useState } from "react";

export function Avatar({ user, size = "medium", className = "" }) {
  const label = user?.nickname || "访客";
  const source = user?.avatarUrl || "";
  const [failedSource, setFailedSource] = useState("");
  return source && failedSource !== source
    ? <img className={`community-avatar community-avatar--${size} ${className}`.trim()} src={source} alt={`${label}的头像`} loading="lazy" decoding="async" onError={() => setFailedSource(source)} />
    : <span className={`community-avatar community-avatar--${size} community-avatar--fallback ${className}`.trim()} aria-label={`${label}的默认头像`}>{Array.from(label)[0]?.toUpperCase() || "?"}</span>;
}
