import type { Metadata } from "next";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Header } from "@/components/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const display = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "sheetly.art · Turn any photo into a sticker sheet",
  description: "Add a picture, pick a look, and watch your sticker sheet come together. Print it at home.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full scroll-smooth antialiased`}
    >
      <head>
        {/* Styled stickers come back from fal's CDN; open the connection early. */}
        <link rel="preconnect" href="https://v3.fal.media" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fal.media" />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <AuthProvider>
          <Header />
          <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
