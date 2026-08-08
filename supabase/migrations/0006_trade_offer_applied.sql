-- 0006 — idempotencia al aplicar un trade aceptado a la colección.
--
-- applyAcceptedOffer() (lib/tradeOffers.ts) resta/suma cartas en la colección
-- local cuando el usuario confirma "ya se hizo el intercambio físico". No
-- había ningún registro de que ya se había aplicado: FriendProfileScreen
-- ofrecía el botón "Apply to collection" indefinidamente en toda oferta
-- aceptada, en todos los dispositivos, así que un doble tap (o reabrir la
-- oferta desde otro móvil) volvía a mover las cartas.
--
-- `applied_at` es el guard: se pone la primera vez que se aplica y desde
-- entonces el cliente no vuelve a ofrecer el botón. No se usa para nada más
-- (no dispara reglas, no bloquea nada del lado servidor salvo el trigger de
-- abajo, que ya no lo trataría como una transición de estado).

alter table trade_offers add column if not exists applied_at timestamptz;

-- El trigger original rechazaba CUALQUIER update sobre una oferta que ya
-- hubiese salido de 'pending' — bloquearía también el update que sólo pone
-- applied_at sobre una oferta 'accepted'. Se relaja: sólo se bloquea si de
-- verdad se intenta cambiar el status de una oferta ya resuelta.
create or replace function trade_offer_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'pending' and new.status <> old.status then
    raise exception 'trade offer is already %', old.status;
  end if;

  if new.status = 'cancelled' and auth.uid() <> old.from_user then
    raise exception 'only the sender can cancel an offer';
  end if;

  if new.status in ('accepted', 'declined') and new.status <> old.status and auth.uid() <> old.to_user then
    raise exception 'only the recipient can accept or decline an offer';
  end if;

  -- Las partes y las líneas no se renegocian in situ: se cancela y se manda
  -- otra. Así el histórico dice de verdad qué se acordó.
  new.from_user := old.from_user;
  new.to_user   := old.to_user;
  if new.status <> old.status then
    new.responded_at := now();
  end if;
  return new;
end $$;
