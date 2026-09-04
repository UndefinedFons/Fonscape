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
  <React.StrictMode><AppErrorBoundary><React.Suspense fallback={null}><CommunityProvider><App /></CommunityProvider></React.Suspense></AppErrorBoundary></React.StrictMode>,
);
const initialLoader = initialRoute === "/" ? null : preloadRoute(initialRoute);
if (initialLoader) initialLoader.then(render, render);
else render();
