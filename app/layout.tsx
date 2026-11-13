import type { Metadata } from "next";
import { Fredoka, Geist } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const display = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "sheetly.art · Turn any photo into a sticker sheet",
  description: "Add a picture, pick a look, and watch your sticker sheet come together. Print it at home.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${display.variable} h-full antialiased`}>
      <head>
        {/* Styled stickers come back from fal's CDN; open the connection early. */}
        <link rel="preconnect" href="https://v3.fal.media" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fal.media" />
      </head>
      <body>
        <AuthProvider>
          <Header />
          <main>{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
