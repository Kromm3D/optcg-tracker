-- 0003 — propuestas de intercambio entre amigos.
--
-- Hasta ahora la pestaña Trade de un perfil de amigo era **informativa**:
-- cruzaba wishlists con colecciones y decía "podríais intercambiar esto". El
-- siguiente paso, y el que ningún competidor del nicho OPTCG tiene, es poder
-- **proponerlo**: seleccionar cartas de ambos lados, mandarlo, y que el otro
-- acepte o rechace.
--
-- Modelo: una cabecera (`trade_offers`) con las dos partes y el estado, y una
-- fila por carta (`trade_offer_items`) con el lado al que pertenece.
--
-- Las cartas se guardan como texto plano (code + suffix), NO como referencia a
-- collection_items: una oferta es un registro histórico de lo que se acordó y
-- no debe cambiar ni romperse porque alguien venda la carta después.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_offer_status') then
    create type trade_offer_status as enum ('pending', 'accepted', 'declined', 'cancelled');
  end if;
end $$;

create table if not exists trade_offers (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references profiles(id) on delete cascade,
  to_user      uuid not null references profiles(id) on delete cascade,
  status       trade_offer_status not null default 'pending',
  note         text,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create index if not exists trade_offers_to_idx on trade_offers(to_user, status);
create index if not exists trade_offers_from_idx on trade_offers(from_user, status);

create table if not exists trade_offer_items (
  id       uuid primary key default gen_random_uuid(),
  offer_id uuid not null references trade_offers(id) on delete cascade,
  -- 'give'    = la pone el proponente (from_user → to_user)
  -- 'receive' = se la pide al destinatario (to_user → from_user)
  side     text not null check (side in ('give', 'receive')),
  code     text not null,
  suffix   text not null default '',
  qty      int  not null check (qty between 1 and 99)
);
create index if not exists trade_offer_items_offer_idx on trade_offer_items(offer_id);

alter table trade_offers      enable row level security;
alter table trade_offer_items enable row level security;

-- ── Políticas ───────────────────────────────────────────────────────────────
-- Una oferta la ven sólo sus dos participantes: no es contenido público ni
-- está sujeto a `vis_of` (la visibilidad del binder no debería exponer con
-- quién negocias).

drop policy if exists trade_offers_select on trade_offers;
create policy trade_offers_select on trade_offers
  for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- Sólo se puede proponer a un amigo confirmado. Sin esto, cualquiera con un
-- user_id podría enviar ofertas a desconocidos — spam por diseño.
drop policy if exists trade_offers_insert on trade_offers;
create policy trade_offers_insert on trade_offers
  for insert to authenticated
  with check (from_user = auth.uid() and are_friends(auth.uid(), to_user));

-- Ambos lados pueden actualizar el estado: el destinatario acepta/rechaza, el
-- proponente cancela. Qué transición es legal se valida en el trigger de
-- abajo, no aquí: RLS decide QUIÉN, el trigger decide QUÉ.
drop policy if exists trade_offers_update on trade_offers;
create policy trade_offers_update on trade_offers
  for update to authenticated
  using (from_user = auth.uid() or to_user = auth.uid())
  with check (from_user = auth.uid() or to_user = auth.uid());

drop policy if exists trade_offers_delete on trade_offers;
create policy trade_offers_delete on trade_offers
  for delete to authenticated
  using (from_user = auth.uid());

drop policy if exists trade_offer_items_select on trade_offer_items;
create policy trade_offer_items_select on trade_offer_items
  for select to authenticated
  using (exists (
    select 1 from trade_offers o
    where o.id = offer_id and (o.from_user = auth.uid() or o.to_user = auth.uid())
  ));

-- Las líneas las escribe sólo el proponente, y sólo mientras la oferta sigue
-- pendiente: una oferta aceptada es inmutable o no significa nada.
drop policy if exists trade_offer_items_insert on trade_offer_items;
create policy trade_offer_items_insert on trade_offer_items
  for insert to authenticated
  with check (exists (
    select 1 from trade_offers o
    where o.id = offer_id and o.from_user = auth.uid() and o.status = 'pending'
  ));

drop policy if exists trade_offer_items_delete on trade_offer_items;
create policy trade_offer_items_delete on trade_offer_items
  for delete to authenticated
  using (exists (
    select 1 from trade_offers o
    where o.id = offer_id and o.from_user = auth.uid() and o.status = 'pending'
  ));

-- ── Transiciones de estado ──────────────────────────────────────────────────
-- RLS deja actualizar a los dos participantes, pero no todas las transiciones
-- son legítimas: el proponente no puede auto-aceptarse su oferta, y una oferta
-- ya resuelta no debe reabrirse.

create or replace function trade_offer_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'trade offer is already %', old.status;
  end if;

  if new.status = 'cancelled' and auth.uid() <> old.from_user then
    raise exception 'only the sender can cancel an offer';
  end if;

  if new.status in ('accepted', 'declined') and auth.uid() <> old.to_user then
    raise exception 'only the recipient can accept or decline an offer';
  end if;

  -- Las partes y las líneas no se renegocian in situ: se cancela y se manda
  -- otra. Así el histórico dice de verdad qué se acordó.
  new.from_user := old.from_user;
  new.to_user   := old.to_user;
  new.responded_at := now();
  return new;
end $$;

drop trigger if exists trade_offer_guard_trg on trade_offers;
create trigger trade_offer_guard_trg
  before update on trade_offers
  for each row execute function trade_offer_guard();
