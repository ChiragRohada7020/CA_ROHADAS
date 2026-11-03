"use client";

import { useEffect } from "react";
import { Toaster } from "./sonner-toaster";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // No-op provider for compatibility
  }, []);

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
