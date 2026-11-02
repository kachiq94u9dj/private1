-- 「ともだちノート」デザイン対応: 友達のプロフィール項目・タグ・イベントの会費/定員・招待状況の4項目。

alter table public.ig_friends
  add column display_name text not null default '',
  add column met_where text not null default '',
  add column last_met_on date;

create table public.ig_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('community', 'attribute')),
  color text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, kind, name)
);

create table public.ig_friend_tags (
  friend_id uuid not null references public.ig_friends (id) on delete cascade,
  tag_id uuid not null references public.ig_tags (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (friend_id, tag_id)
);

create index ig_tags_owner_idx on public.ig_tags (owner_id);
create index ig_friend_tags_owner_idx on public.ig_friend_tags (owner_id);
create index ig_friend_tags_tag_idx on public.ig_friend_tags (tag_id);

alter table public.ig_events
  add column start_time time,
  add column fee integer check (fee >= 0),
  add column currency text not null default 'RM',
  add column capacity integer check (capacity > 0);

-- 1つのステータスを「誘った / 返事 / 出席 / 支払い」の4項目に分ける。
alter table public.ig_event_attendees
  add column invited boolean not null default false,
  add column reply text not null default 'none' check (reply in ('none', 'yes', 'maybe', 'no')),
  add column attended boolean not null default false,
  add column paid boolean not null default false;

update public.ig_event_attendees set
  invited = status <> 'candidate',
  reply = case status
    when 'attending' then 'yes'
    when 'attended' then 'yes'
    when 'declined' then 'no'
    else 'none'
  end,
  attended = status = 'attended';

alter table public.ig_event_attendees drop column status;

alter table public.ig_tags enable row level security;
alter table public.ig_friend_tags enable row level security;

create policy "owner only" on public.ig_tags
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner only" on public.ig_friend_tags
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.ig_tags, public.ig_friend_tags from anon;
