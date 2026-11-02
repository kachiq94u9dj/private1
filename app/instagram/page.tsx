import type { Metadata } from "next";
import InstagramApp from "@/components/instagram/InstagramApp";
import "./instagram.css";

export const metadata: Metadata = {
  title: "ともだちノート",
  description: "Instagram の友達とイベントをまとめて管理",
};

export default function Page() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        precedence="default"
      />
      <InstagramApp />
    </>
  );
}
