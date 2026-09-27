import type { Metadata } from "next";
import { Geist_Mono, Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/*
 * The workspace's type (JSV2S1172). Loaded here because next/font must be
 * called at module scope, and self-hosting is what keeps the CSP clean — no
 * request to fonts.googleapis.com at render.
 *
 * Playfair Display carries the titles and the big numbers, Inter does the work,
 * and JetBrains Mono is for run ids and timestamps, where a fixed advance width
 * is the whole point.
 */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-mono-city", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JobScan",
  description: "Application workspace for a visa-sponsored product management search",
};

/*
 * NO EXPLICIT <head> HERE, AND THAT IS THE POINT.
 *
 * This layout carried `<head><script>…</script></head>` to pre-apply a stored
 * theme before first paint. Next owns <head> in the App Router and injects the
 * client bootstrap scripts into it; declaring one by hand displaced them, so
 * the page shipped only the polyfill and devtools chunks and NO application
 * client JavaScript at all.
 *
 * React therefore never hydrated. Every onClick in the app was inert — the
 * filter panel, the tabs, bulk selection, all of it — while the server-rendered
 * markup looked perfectly correct, which is why it read as "the filter is
 * broken" rather than "nothing is interactive". It was reported six times
 * before the cause was found, and it was never in the filter.
 *
 * The script it existed for is gone anyway: the palette is global dark and
 * there is no theme left to pre-apply.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${geistMono.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
