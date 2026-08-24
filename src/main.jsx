import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { CommunityProvider } from "./community/CommunityProvider.jsx";
import "./styles.css";

const directPath = window.location.pathname.replace(/\/+$/u, "") || "/";

if (directPath === "/admin/setup") {
  window.location.replace("/#/admin/setup");
} else if (directPath === "/admin" || directPath.startsWith("/admin/")) {
  window.location.replace("/#/");
} else {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <CommunityProvider><App /></CommunityProvider>
    </React.StrictMode>,
  );
}
