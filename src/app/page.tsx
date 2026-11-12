
"use client";

import * as React from 'react';
import { LoginForm } from '@/components/auth/login-form';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-background">
      <LoginForm />
    </main>
  );
}
