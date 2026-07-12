import type { Metadata } from "next";

import { ThemeInitScript } from "./theme-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "Label Lens TTB",
  description: "Fast, explainable alcohol label verification.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* Applies the persisted theme/size/motion before body content paints. */}
        <ThemeInitScript />
        {children}
      </body>
    </html>
  );
}
