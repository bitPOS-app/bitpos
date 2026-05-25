import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    });
  } else {
    // In development, unregister every service worker on load so stale
    // cached JS never blocks HMR updates in the workspace preview.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
