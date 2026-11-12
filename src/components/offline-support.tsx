"use client";

import * as React from "react";

// Registers the service worker that makes the static (GitHub Pages) build work offline.
export default function OfflineSupport() {
  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_OFFLINE !== "1" || !("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch((error) => {
      console.warn("Offline support could not be enabled:", error);
    });
  }, []);
  return null;
}
