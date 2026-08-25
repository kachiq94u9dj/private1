import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Usage Tracker",
  description: "Claude Code のトークン消費量を可視化するダッシュボード",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
