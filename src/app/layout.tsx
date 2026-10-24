import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: {
    default: "BrandGuard AI - Two-RAG Brand Governance Backend",
    template: "%s · BrandGuard AI",
  },
  description:
    "High-assurance enterprise Two-RAG backend for brand compliance, unsupported-claim detection, hybrid pgvector retrieval, and automated review packages.",
  applicationName: "BrandGuard AI",
  openGraph: {
    title: "BrandGuard AI - Two-RAG Brand Governance Backend",
    description:
      "High-assurance enterprise Two-RAG backend for brand compliance, unsupported-claim detection, hybrid pgvector retrieval, and automated review packages.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0f20",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
