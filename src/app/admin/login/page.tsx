
"use client";

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react'; // Import Loader2 for the loading state

const AdminLoginForm = dynamic(() =>
  import('@/components/auth/admin-login-form').then(mod => mod.AdminLoginForm),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading login form...</p>
      </div>
    ),
  }
);

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8">
      <AdminLoginForm />
    </main>
  );
}
