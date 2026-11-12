"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

const Loading = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-12 w-12 animate-spin text-primary" />
  </div>
);

const MemberDetailPage = dynamic(() => import("./member/[id]/member-detail-page"), { ssr: false, loading: Loading });
const EditMemberPage = dynamic(() => import("./admin/users/edit/[id]/edit-member-page"), {
  ssr: false,
  loading: Loading,
});

// On static hosting (GitHub Pages) member pages such as /member/1234 have no file of
// their own, so the host falls back to this page. Render the right screen for them.
export default function NotFound() {
  const pathname = usePathname() ?? "";
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <Loading />;
  if (/^\/member\/[^/]+\/?$/.test(pathname) && !/^\/member\/(payment|services|chat)\/?$/.test(pathname)) {
    return <MemberDetailPage />;
  }
  if (/^\/admin\/users\/edit\/[^/]+\/?$/.test(pathname)) {
    return <EditMemberPage />;
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Link href="/" className="text-primary hover:underline">
        Go to the home page
      </Link>
    </main>
  );
}
