import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recitation Coach",
  description:
    "Voice-matched recitation practice — calibrated range, live pitch lane, kind cues.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav className="site-nav">
          <Link href="/" className="brand">
            Recitation Coach
          </Link>
          <Link href="/calibrate">Calibrate</Link>
          <Link href="/practice">Practice</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
