import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { preloadRoute } from "./appRoutes.tsx";
import { CommunityProvider } from "./community/CommunityProvider.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import { legacyHashRoute } from "./routes.ts";
import { parseRoutePath } from "./routeState.ts";
import "./styles.css";

const legacyRoute = legacyHashRoute(window.location.hash);
if (legacyRoute) window.history.replaceState(window.history.state || {}, "", legacyRoute);

const initialRoute = parseRoutePath();
if (initialRoute !== "/") void preloadRoute(initialRoute).catch(() => {});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><AppErrorBoundary><React.Suspense fallback={null}><CommunityProvider><App /></CommunityProvider></React.Suspense></AppErrorBoundary></React.StrictMode>,
);
