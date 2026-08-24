import { memo, useEffect, useState } from "react";
import { siteConfig } from "../siteConfig.js";
import { formatCopyrightYears, normalizeLaunchedAt } from "../siteUtils.js";

export const Footer = memo(function Footer() {
  const [launchedAt, setLaunchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/site/runtime", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setLaunchedAt((current) => normalizeLaunchedAt(result.launchedAt, current)))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const totalSeconds = Math.max(0, Math.floor((now - launchedAt) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const theme = siteConfig.footer.themeRepository
    ? <a className="footer-theme-link" href={siteConfig.footer.themeRepository} target="_blank" rel="noreferrer">{siteConfig.footer.themeName}</a>
    : siteConfig.footer.themeName;
  return <footer><div>© {formatCopyrightYears(now, launchedAt)} {siteConfig.footer.owner} · {theme}</div><div className="blog-age" aria-live="off">本站已运行 <strong>{days}</strong> 天 <strong>{hours}</strong> 小时 <strong>{minutes}</strong> 分 <strong>{seconds}</strong> 秒</div></footer>;
});
