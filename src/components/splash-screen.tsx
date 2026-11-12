
"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import logoImage from '@/assets/new_logo.png'; // Import the image

const SplashScreen: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2500); // Splash screen visible for 2.5 seconds

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black text-foreground">
      <Image
        src={logoImage} // Use the imported image variable
        alt="Kurukshetra Gym Official Logo"
        width={400} // Increased width
        height={400} // Increased height
        priority // Prioritizes loading for LCP
        placeholder="blur" // Optional: provides a blur-up effect if the image is large
        data-ai-hint="gym logo"
      />
      <Loader2 className="h-12 w-12 animate-spin text-primary mt-8" /> {/* Increased size and margin */}
      <p className="mt-4 text-muted-foreground font-sans text-lg">Loading your experience...</p> {/* Increased size and margin */}
    </div>
  );
};

export default SplashScreen;
