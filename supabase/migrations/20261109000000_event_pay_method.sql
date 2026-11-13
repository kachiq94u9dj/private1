-- イベント作成画面のデザイン対応: 集金方法と招待メッセージ（DM 用の文面）を保存する。
-- invite_message が空のときは、入力内容から自動で作った文面を使う。

alter table public.ig_events
  add column pay_method text not null default 'cash'
    check (pay_method in ('cash', 'transfer', 'duitnow', 'none')),
  add column invite_message text not null default '';
