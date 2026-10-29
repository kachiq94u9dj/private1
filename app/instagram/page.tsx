import type { Metadata } from "next";
import InstagramApp from "@/components/instagram/InstagramApp";

export const metadata: Metadata = {
  title: "Instagram 友達ダッシュボード",
  description: "Instagram の友達を整理し、イベント参加者を管理するダッシュボード",
};

export default function Page() {
  return <InstagramApp />;
}
