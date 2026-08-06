import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "streamdown/styles.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sharables",
  description:
    "Describe an app, watch AI build it in React Native, preview it live, run it on your phone with Expo Go, and share it with a link. Powered by nanocodana.",
  // Favicon/apple-icon are auto-served from src/app/icon.png by Next.js.
  openGraph: {
    title: "Sharables",
    description:
      "AI-built React Native apps in your browser — describe, preview, share. Powered by nanocodana.",
    images: [{ url: "/logo.png", width: 1254, height: 1254, alt: "Sharables" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        {/*
          Vercel Web Analytics. Renders nothing and injects a script that only
          loads on Vercel, so local runs and any other host are unaffected.

          The builder (sharables.ai) and every shared app (<id>.sharable.app)
          are one project behind one middleware, so both land in the same
          dashboard. They are told apart by path: the builder is "/", a shared
          app is "/preview" — the middleware rewrites every share subdomain
          there. Read the top-pages panel, not the total, or "people building"
          and "people viewing someone else's app" are one indistinguishable
          number.
        */}
        <Analytics />
      </body>
    </html>
  );
}
