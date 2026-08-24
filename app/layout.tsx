import type React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://clyp-omega.vercel.app"),
  title: "clyp - create better screenshots",
  description:
    "clyp makes your screenshots look better by allowing you to add beautiful backgrounds, custom styling, and various style attributes.",
  keywords: [
    "clyp",
    "image enhancer",
    "screenshot tool",
    "gradient backgrounds",
    "screenshot editor",
    "image editor",
    "screenshot styling",
    "presentation tool",
  ],
  authors: [{ name: "SanyamPunia" }],
  creator: "SanyamPunia",
  publisher: "SanyamPunia",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://clyp-omega.vercel.app",
    title: "clyp - create better screenshots",
    description:
      "clyp makes your screenshots look better by allowing you to add beautiful backgrounds, custom styling, and various style attributes.",
    siteName: "clyp",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "clyp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "clyp - create better screenshots",
    description:
      "clyp makes your screenshots look better by allowing you to add beautiful backgrounds, custom styling, and various style attributes.",
    images: ["/opengraph-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser chrome cannot read a CSS variable, so this mirrors the
  // `--gray-100` app background in globals.css and must change with it.
  themeColor: "#0f0e0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(inter.variable, "font-sans")}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <Script
          defer
          src="https://assets.onedollarstats.com/stonks.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
