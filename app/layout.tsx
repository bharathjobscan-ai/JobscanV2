import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/ui/theme-toggle";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JobScan",
  description: "Application workspace for a visa-sponsored product management search",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /*
     * `suppressHydrationWarning` is required here, not cosmetic (JSV2S1160).
     *
     * The script below stamps `data-theme` on this element before React
     * hydrates, so the client DOM deliberately differs from the server HTML —
     * which is the entire point, and which React cannot distinguish from a real
     * mismatch. Without this it logs a hydration error on every page load.
     *
     * It suppresses one level only: this element's own attributes. Nothing
     * inside is affected, so a genuine mismatch anywhere else still reports.
     */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applied before first paint (JSV2S1160). A deferred script runs after
          the browser has painted the default, which is the white flash this
          exists to prevent — so it is inline and synchronous by necessity.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
