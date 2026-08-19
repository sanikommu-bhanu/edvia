import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app/globals.css";
import App from "./App";
import { AppErrorBoundary } from "./app/ErrorBoundary";

// ==========================================================================
// Bootstrap
// --------------------------------------------------------------------------
// Two things happen here that are not ceremony:
//
//   1. The root element is checked rather than asserted with `!`. A missing
//      #root used to throw a TypeError inside createRoot, which in a
//      production bundle is an unreadable minified stack over a blank page.
//   2. The error boundary is OUTSIDE App, so it also catches a crash inside
//      AuthProvider/BrowserRouter themselves — the exact place where a
//      startup failure is both most likely and least visible.
// ==========================================================================
const container = document.getElementById("root");

if (!container) {
  // Nothing React can do about this, so say it in plain HTML.
  document.body.innerHTML =
    '<div style="font-family:system-ui;padding:2rem;text-align:center;color:#334155">' +
    "<h1 style=\"font-size:1.1rem\">EDVIA couldn't start</h1>" +
    '<p style="font-size:.9rem;color:#64748b">The page is missing its application container. Please reload.</p>' +
    "</div>";
  throw new Error("EDVIA: #root element not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
