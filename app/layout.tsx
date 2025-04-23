import type React from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PostHogProvider } from "./providers";
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
        url: "/og-image.png",
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
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
