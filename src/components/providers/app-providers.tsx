"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ReviewProvider } from "@/components/providers/review-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <ReviewProvider>{children}</ReviewProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
