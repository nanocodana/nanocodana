import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      </body>
    </html>
  );
}
