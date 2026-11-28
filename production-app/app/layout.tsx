import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora, Manrope } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  preload: false,
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Aesthenda Production App",
  description: "Aesthenda production foundation for real business-facing product work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
