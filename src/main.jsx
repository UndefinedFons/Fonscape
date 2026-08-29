import React from "react";
import { createRoot } from "react-dom/client";
import { App, preloadRoute } from "./App.jsx";
import { CommunityProvider } from "./community/CommunityProvider.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import "./styles.css";

const directPath = window.location.pathname.replace(/\/+$/u, "") || "/";

if (directPath === "/admin/setup") {
  window.location.replace("/#/admin/setup");
} else if (directPath === "/admin" || directPath.startsWith("/admin/")) {
  window.location.replace("/#/");
} else {
  const initialRoute = window.location.hash.slice(1).split("?")[0] || "/";
  const render = () => createRoot(document.getElementById("root")).render(
    <React.StrictMode><AppErrorBoundary><React.Suspense fallback={null}><CommunityProvider><App /></CommunityProvider></React.Suspense></AppErrorBoundary></React.StrictMode>,
  );
  const initialLoader = initialRoute === "/" ? null : preloadRoute(initialRoute);
  if (initialLoader) initialLoader.then(render, render);
  else render();
}
