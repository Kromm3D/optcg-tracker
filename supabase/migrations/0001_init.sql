-- HoroHoro.tcg — Supabase initial schema (accounts, cloud sync, friends).
--
-- Local-first model: the app works fully offline with no account. Signing in
-- enables cross-device backup/sync of collection, decks, wishlists and settings,
-- plus a friends system that lets users view each other's collection / wishlist /
-- decks subject to per-resource visibility (public / friends / private).
--
-- Static reference data (card catalog, prices, images) is NOT stored here — it is
-- bundled in the app / served from the jsDelivr CDN. Only per-user mutable data
-- and the social graph live in Supabase.
--
-- Apply via the Supabase SQL editor or `supabase db push`. Idempotent-ish: uses
-- "if not exists" / "drop policy if exists" where practical so it can be re-run
-- during development.

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";      -- case-insensitive usernames

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type visibility as enum ('public', 'friends', 'private');
exception when duplicate_object then null; end $$;

do $$ begin
  create type friend_status as enum ('pending', 'accepted', 'blocked');
exception when duplicate_object then null; end $$;

-- ── Tables ──────────────────────────────────────────────────────────────────

-- Public-facing profile, 1:1 with auth.users. `username` powers friend search.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext unique not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Per-resource visibility. One row per user; defaults to "friends".
create table if not exists privacy_settings (
  user_id    uuid primary key references profiles(id) on delete cascade,
  collection visibility not null default 'friends',
  wishlist   visibility not null default 'friends',
  decks      visibility not null default 'friends'
);

-- Mirror of the client Settings object (kept as jsonb; LWW via updated_at).
create table if not exists user_settings (
  user_id    uuid primary key references profiles(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Collection: maps 1:1 to the client's CollectionItem (key = code+suffix).
create table if not exists collection_items (
  user_id    uuid not null references profiles(id) on delete cascade,
  code       text not null,
  suffix     text not null default '',
  count      int  not null check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, code, suffix)
);

-- id is the client-generated string id ("wl_<ts>") so local == server with no
-- remapping; sync is a plain natural-key mirror (see lib/sync.ts).
create table if not exists wishlists (
  id         text primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wishlists_user_idx on wishlists(user_id);

create table if not exists wishlist_cards (
  wishlist_id text not null references wishlists(id) on delete cascade,
  code        text not null,
  suffix      text not null default '',
  needed      int  not null check (needed >= 0),
  added_at    timestamptz not null default now(),
  primary key (wishlist_id, code, suffix)
);

-- id is the client-generated string id ("deck_<ts>") — see note on wishlists.
create table if not exists decks (
  id         text primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  leader_id  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decks_user_idx on decks(user_id);

create table if not exists deck_cards (
  deck_id text not null references decks(id) on delete cascade,
  code    text not null,
  qty     int  not null check (qty between 1 and 4),
  primary key (deck_id, code)
);

-- One row per relationship. Both directions are queried via are_friends().
create table if not exists friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status       friend_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on friendships(addressee_id);
create index if not exists friendships_requester_idx on friendships(requester_id);

-- ── Helper functions ────────────────────────────────────────────────────────

-- Accepted-friendship test between two users (order-independent).
-- security definer so it can read friendships regardless of the caller's RLS.
create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ( (f.requester_id = a and f.addressee_id = b)
         or (f.requester_id = b and f.addressee_id = a) )
  );
$$;

-- Can the current user (auth.uid()) view a resource owned by `owner` whose
-- visibility is `vis`? Owner always can; otherwise public, or friends-only +
-- an accepted friendship.
create or replace function can_view(owner uuid, vis visibility)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select owner = auth.uid()
      or vis = 'public'
      or (vis = 'friends' and are_friends(auth.uid(), owner));
$$;

-- Convenience: read a user's per-resource visibility (defaults to 'friends'
-- when no privacy_settings row exists yet).
create or replace function vis_of(owner uuid, resource text)
returns visibility
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    case resource
      when 'collection' then (select collection from privacy_settings where user_id = owner)
      when 'wishlist'   then (select wishlist   from privacy_settings where user_id = owner)
      when 'decks'      then (select decks      from privacy_settings where user_id = owner)
    end,
    'friends'::visibility
  );
$$;

-- ── New-user trigger: auto-create profile + privacy defaults ─────────────────
-- username seeded from metadata.username, else the email local-part, with a
-- short random suffix to satisfy the unique constraint on collision.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  final_name text;
begin
  base_name := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1),
    'user'
  );
  final_name := base_name;
  if exists (select 1 from profiles where username = final_name) then
    final_name := base_name || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  insert into profiles (id, username, display_name)
    values (new.id, final_name, new.raw_user_meta_data->>'display_name');
  insert into privacy_settings (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table profiles         enable row level security;
alter table privacy_settings enable row level security;
alter table user_settings    enable row level security;
alter table collection_items enable row level security;
alter table wishlists        enable row level security;
alter table wishlist_cards   enable row level security;
alter table decks            enable row level security;
alter table deck_cards       enable row level security;
alter table friendships      enable row level security;

-- profiles: readable by any authenticated user (needed for friend search);
-- writable only by the owner.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (true);
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- privacy_settings: owner-only read+write.
drop policy if exists privacy_all on privacy_settings;
create policy privacy_all on privacy_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- user_settings: owner-only read+write.
drop policy if exists settings_all on user_settings;
create policy settings_all on user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- collection_items: owner writes; viewers gated by collection visibility.
-- Split into INSERT/UPDATE/DELETE to avoid the FOR ALL USING-on-upsert PostgreSQL issue
-- where the USING expression is applied to the new row in INSERT ON CONFLICT DO UPDATE.
drop policy if exists collection_select on collection_items;
create policy collection_select on collection_items
  for select to authenticated
  using (can_view(user_id, vis_of(user_id, 'collection')));
drop policy if exists collection_write on collection_items;
drop policy if exists collection_insert on collection_items;
create policy collection_insert on collection_items
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists collection_update on collection_items;
create policy collection_update on collection_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists collection_delete on collection_items;
create policy collection_delete on collection_items
  for delete to authenticated using (user_id = auth.uid());

-- wishlists: owner writes; viewers gated by wishlist visibility.
drop policy if exists wishlists_select on wishlists;
create policy wishlists_select on wishlists
  for select to authenticated
  using (can_view(user_id, vis_of(user_id, 'wishlist')));
drop policy if exists wishlists_write on wishlists;
drop policy if exists wishlists_insert on wishlists;
create policy wishlists_insert on wishlists
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wishlists_update on wishlists;
create policy wishlists_update on wishlists
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists wishlists_delete on wishlists;
create policy wishlists_delete on wishlists
  for delete to authenticated using (user_id = auth.uid());

-- wishlist_cards: inherit the parent wishlist's owner + visibility.
drop policy if exists wishlist_cards_select on wishlist_cards;
create policy wishlist_cards_select on wishlist_cards
  for select to authenticated using (
    exists (
      select 1 from wishlists w
      where w.id = wishlist_cards.wishlist_id
        and can_view(w.user_id, vis_of(w.user_id, 'wishlist'))
    )
  );
drop policy if exists wishlist_cards_write on wishlist_cards;
drop policy if exists wishlist_cards_insert on wishlist_cards;
create policy wishlist_cards_insert on wishlist_cards
  for insert to authenticated with check (
    exists (select 1 from wishlists w where w.id = wishlist_id and w.user_id = auth.uid())
  );
drop policy if exists wishlist_cards_update on wishlist_cards;
create policy wishlist_cards_update on wishlist_cards
  for update to authenticated
  using (exists (select 1 from wishlists w where w.id = wishlist_id and w.user_id = auth.uid()))
  with check (exists (select 1 from wishlists w where w.id = wishlist_id and w.user_id = auth.uid()));
drop policy if exists wishlist_cards_delete on wishlist_cards;
create policy wishlist_cards_delete on wishlist_cards
  for delete to authenticated using (
    exists (select 1 from wishlists w where w.id = wishlist_id and w.user_id = auth.uid())
  );

-- decks: owner writes; viewers gated by decks visibility.
drop policy if exists decks_select on decks;
create policy decks_select on decks
  for select to authenticated
  using (can_view(user_id, vis_of(user_id, 'decks')));
drop policy if exists decks_write on decks;
drop policy if exists decks_insert on decks;
create policy decks_insert on decks
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists decks_update on decks;
create policy decks_update on decks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists decks_delete on decks;
create policy decks_delete on decks
  for delete to authenticated using (user_id = auth.uid());

-- deck_cards: inherit the parent deck's owner + visibility.
drop policy if exists deck_cards_select on deck_cards;
create policy deck_cards_select on deck_cards
  for select to authenticated using (
    exists (
      select 1 from decks d
      where d.id = deck_cards.deck_id
        and can_view(d.user_id, vis_of(d.user_id, 'decks'))
    )
  );
drop policy if exists deck_cards_write on deck_cards;
drop policy if exists deck_cards_insert on deck_cards;
create policy deck_cards_insert on deck_cards
  for insert to authenticated with check (
    exists (select 1 from decks d where d.id = deck_id and d.user_id = auth.uid())
  );
drop policy if exists deck_cards_update on deck_cards;
create policy deck_cards_update on deck_cards
  for update to authenticated
  using (exists (select 1 from decks d where d.id = deck_id and d.user_id = auth.uid()))
  with check (exists (select 1 from decks d where d.id = deck_id and d.user_id = auth.uid()));
drop policy if exists deck_cards_delete on deck_cards;
create policy deck_cards_delete on deck_cards
  for delete to authenticated using (
    exists (select 1 from decks d where d.id = deck_id and d.user_id = auth.uid())
  );

-- friendships:
--  * read rows where you are either party
--  * create requests only as yourself (requester), never pre-accepted
--  * the addressee may accept/decline/block; the requester may cancel (delete)
drop policy if exists friendships_select on friendships;
create policy friendships_select on friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists friendships_insert on friendships;
create policy friendships_insert on friendships
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');

-- Addressee responds (accept/decline/block). Requester may also block.
drop policy if exists friendships_update on friendships;
create policy friendships_update on friendships
  for update to authenticated
  using (addressee_id = auth.uid() or requester_id = auth.uid())
  with check (addressee_id = auth.uid() or requester_id = auth.uid());

-- Either party can remove the relationship (cancel request / unfriend).
drop policy if exists friendships_delete on friendships;
create policy friendships_delete on friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
