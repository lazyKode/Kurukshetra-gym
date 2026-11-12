
"use client"; // Keep this for the dynamic import loader

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Dynamically import the client-side page content
const ForumClientPage = dynamic(
  () => import('./forum-client-page'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="mt-4 text-lg font-semibold text-muted-foreground">Loading Forum...</p>
      </div>
    )
  }
);

export default function ForumPage() {
  return <ForumClientPage />;
}
