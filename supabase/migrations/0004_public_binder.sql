-- 0004 — binder público: lectura anónima de lo que el usuario marcó 'public'.
--
-- El modelo de visibilidad ya distinguía 'public' / 'friends' / 'private', y
-- `can_view()` ya devuelve true para 'public' sin mirar quién pregunta. Lo que
-- faltaba era el ROL: todas las políticas de 0001 son `to authenticated`, así
-- que un enlace compartido sólo funcionaba para quien ya tuviera cuenta — que
-- es justo la gente que no lo necesita.
--
-- Esto añade políticas paralelas `to anon` con la MISMA condición de
-- visibilidad. No amplía qué es visible: amplía a quién. Todo lo que no esté
-- explícitamente en 'public' sigue invisible, y 'friends' es el valor por
-- defecto para un usuario nuevo (ver vis_of), así que nadie se expone sin
-- haberlo elegido.

-- Perfiles: sólo los de usuarios que hayan hecho público ALGO. Sin este
-- filtro, un anónimo podría enumerar todos los nombres de usuario del
-- servicio, que es un problema de privacidad distinto y gratuito de evitar.
drop policy if exists profiles_select_anon on profiles;
create policy profiles_select_anon on profiles
  for select to anon
  using (
    vis_of(id, 'collection') = 'public'
    or vis_of(id, 'wishlist') = 'public'
    or vis_of(id, 'decks') = 'public'
  );

drop policy if exists collection_select_anon on collection_items;
create policy collection_select_anon on collection_items
  for select to anon
  using (vis_of(user_id, 'collection') = 'public');

drop policy if exists wishlists_select_anon on wishlists;
create policy wishlists_select_anon on wishlists
  for select to anon
  using (vis_of(user_id, 'wishlist') = 'public');

drop policy if exists wishlist_cards_select_anon on wishlist_cards;
create policy wishlist_cards_select_anon on wishlist_cards
  for select to anon
  using (exists (
    select 1 from wishlists w
    where w.id = wishlist_id and vis_of(w.user_id, 'wishlist') = 'public'
  ));

drop policy if exists decks_select_anon on decks;
create policy decks_select_anon on decks
  for select to anon
  using (vis_of(user_id, 'decks') = 'public');

drop policy if exists deck_cards_select_anon on deck_cards;
create policy deck_cards_select_anon on deck_cards
  for select to anon
  using (exists (
    select 1 from decks d
    where d.id = deck_id and vis_of(d.user_id, 'decks') = 'public'
  ));
