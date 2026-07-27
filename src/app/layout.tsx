import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skylark BI Agent — Monday.com Intelligence",
  description: "AI-powered business intelligence agent for Skylark Drones, querying Monday.com work orders and deals data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0e1a] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
