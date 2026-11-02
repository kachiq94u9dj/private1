-- Instagram 友達ダッシュボード用テーブル。
-- すべての行は owner_id = auth.uid() のユーザーだけが読み書きできる（匿名キーでは読めない）。

create table public.ig_friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  username text not null,
  is_follower boolean not null default false,
  is_following boolean not null default false,
  followed_me_at timestamptz,
  i_followed_at timestamptz,
  dm_count integer not null default 0,
  last_dm_at timestamptz,
  note text not null default '',
  imported_at timestamptz not null default now(),
  unique (owner_id, username)
);

create table public.ig_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  event_date date,
  location text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.ig_event_attendees (
  event_id uuid not null references public.ig_events (id) on delete cascade,
  friend_id uuid not null references public.ig_friends (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'candidate'
    check (status in ('candidate', 'invited', 'replied', 'attending', 'declined', 'attended')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (event_id, friend_id)
);

create index ig_friends_owner_idx on public.ig_friends (owner_id);
create index ig_events_owner_idx on public.ig_events (owner_id);
create index ig_event_attendees_owner_idx on public.ig_event_attendees (owner_id);
create index ig_event_attendees_friend_idx on public.ig_event_attendees (friend_id);

alter table public.ig_friends enable row level security;
alter table public.ig_events enable row level security;
alter table public.ig_event_attendees enable row level security;

create policy "owner only" on public.ig_friends
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner only" on public.ig_events
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner only" on public.ig_event_attendees
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.ig_friends, public.ig_events, public.ig_event_attendees from anon;
