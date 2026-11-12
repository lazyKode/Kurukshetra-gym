"use client";

import { useParams, usePathname } from "next/navigation";

/** Placeholder ID the static (GitHub Pages) build pre-renders dynamic routes with. */
export const STATIC_ROUTE_PLACEHOLDER = "_";

/**
 * The `[id]` segment of the current route.
 *
 * On a server the router provides it. On the static build every ID is served by
 * one pre-rendered shell, so the real ID is read from the address instead.
 */
export function useRouteId(): string {
  const params = useParams();
  const pathname = usePathname();
  const fromParams = typeof params?.id === "string" ? params.id : "";
  if (fromParams && fromParams !== STATIC_ROUTE_PLACEHOLDER) {
    return fromParams;
  }
  const segments = (pathname ?? "").split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
