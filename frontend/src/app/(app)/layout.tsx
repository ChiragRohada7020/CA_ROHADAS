"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

import AppLayout from "@/components/AppLayout";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppLayout>
      <div className="min-h-full">
        {children}
      </div>
    </AppLayout>
  );
}
