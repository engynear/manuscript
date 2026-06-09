import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manuscript Forge",
  description: "Turn Markdown into medieval fantasy manuscript PDFs."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
