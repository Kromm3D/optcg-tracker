-- Un binder público no debe enseñar lo que pagaste por las cartas.
--
-- 0004 abrió `collection_items` al rol `anon` cuando la visibilidad es
-- 'public'. La condición de fila es correcta, pero **RLS es row-level**: una
-- vez la fila es visible, TODAS sus columnas lo son. Y la migración 0002 había
-- añadido `acquired_unit_price` / `acquired_at` a esa misma tabla.
--
-- Resultado: cualquiera podía pedirle a PostgREST las columnas de coste de un
-- binder público, aunque la app sólo pida code/suffix/count. El usuario que
-- pone su binder en público está diciendo "mira mis cartas", no "mira cuánto
-- me costaron y cuánto llevo ganado".
--
-- Se arregla con permisos a nivel de COLUMNA, que actúan además de RLS: se
-- retira el select global a `anon` y se le devuelve sólo sobre las columnas
-- que describen la carta. `authenticated` no se toca — el dueño y sus amigos
-- siguen viendo lo suyo según las políticas de 0001/0004.

revoke select on collection_items from anon;

grant select (
  user_id,
  code,
  suffix,
  count,
  updated_at,
  condition,
  language,
  graded_company,
  graded_grade
) on collection_items to anon;

-- Nota para quien añada columnas a collection_items en el futuro: un `grant
-- select (...)` NO se actualiza solo. Una columna nueva queda invisible para
-- `anon` por omisión — que es el lado seguro del fallo, pero significa que si
-- la columna es pública hay que añadirla aquí a mano.
