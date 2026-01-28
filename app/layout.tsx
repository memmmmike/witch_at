import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c090d",
};

export const metadata: Metadata = {
  title: "Witchat — Ephemeral Stream",
  description: "Digital orality. The stream, not the archive.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "witch@",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen font-display antialiased bg-witch-soot-950 text-witch-parchment mood-neutral">
        {children}
      </body>
    </html>
  );
}
