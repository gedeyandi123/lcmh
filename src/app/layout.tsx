import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Concrete EPD Comparator",
  description: "Honest, provenance-first comparison of concrete EPDs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="mx-auto max-w-6xl px-4 py-8">{children}</body>
    </html>
  );
}
