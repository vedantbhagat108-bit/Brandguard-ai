"use client";

import type { ReactNode } from "react";
import { ReviewProvider } from "@/components/providers/review-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ReviewProvider>{children}</ReviewProvider>
    </ToastProvider>
  );
}
