import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { preloadRoute } from "./appRoutes.jsx";
import { CommunityProvider } from "./community/CommunityProvider.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { legacyHashRoute } from "./routes.js";
import { parseRoutePath } from "./routeState.js";
import "./styles.css";

const legacyRoute = legacyHashRoute(window.location.hash);
if (legacyRoute) window.history.replaceState(window.history.state || {}, "", legacyRoute);

const initialRoute = parseRoutePath();
const render = () => createRoot(document.getElementById("root")).render(
  <React.StrictMode><AppErrorBoundary><React.Suspense fallback={<InitialRouteLoading />}><CommunityProvider><App /></CommunityProvider></React.Suspense></AppErrorBoundary></React.StrictMode>,
);
if (initialRoute !== "/") preloadRoute(initialRoute).catch(() => {});
render();

function InitialRouteLoading() {
  return <main className="initial-route-loading" role="status" aria-live="polite"><span />正在打开页面…</main>;
}
