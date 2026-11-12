
"use client";

import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';
import { MemberProvider } from '@/context/MemberContext';
import { Toaster } from '@/components/ui/toaster';
import SplashScreen from '@/components/splash-screen'; // Import SplashScreen
import OfflineSupport from '@/components/offline-support';

// Configure Clash Grotesk using localFont
// Paths are relative to this file (src/app/layout.tsx)
// This expects the font files to be in src/app/fonts/
const clashGrotesk = localFont({
  src: [
    {
      path: './fonts/ClashGrotesk-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/ClashGrotesk-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/ClashGrotesk-Semibold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/ClashGrotesk-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-clashgrotesk',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        <title>Kurukshetra Gym</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <link rel="manifest" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/manifest.webmanifest`} />
        <link rel="apple-touch-icon" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icon.png`} />
      </head>
      <body className={`${clashGrotesk.variable} font-sans antialiased`} suppressHydrationWarning={true}>
        <SplashScreen /> {/* Render splash screen here */}
        <OfflineSupport />
        <MemberProvider>
          {children}
          <Toaster />
        </MemberProvider>
      </body>
    </html>
  );
}
