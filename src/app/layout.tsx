import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: {
    default: "BrandLens AI — Pre-publication brand review",
    template: "%s · BrandLens AI",
  },
  description:
    "An explainable, human-in-the-loop workspace for checking content against approved brand guidelines, facts and disclosures.",
  applicationName: "BrandLens AI",
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
