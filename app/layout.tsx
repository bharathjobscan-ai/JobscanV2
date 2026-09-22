import type { Metadata } from "next";
import { Geist_Mono, Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/ui/theme-toggle";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/*
 * The city workspace's type (JSV2S1172). Loaded here rather than in the page
 * because next/font must be called at module scope, and self-hosting them is
 * what keeps the CSP clean — no request to fonts.googleapis.com at render.
 *
 * Playfair Display carries the city names and the big numbers; Inter does the
 * work;
 * JetBrains Mono is for run ids and timestamps, where a fixed advance width is
 * the whole point.
 */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-mono-city", subsets: ["latin"] });

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
      className={`${inter.variable} ${playfair.variable} ${geistMono.variable} ${jetbrains.variable} h-full antialiased`}
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
