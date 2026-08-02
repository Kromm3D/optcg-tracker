-- 0002 — metadatos físicos de la colección.
--
-- La app pasó de guardar sólo "cuántas copias tengo" a describir también el
-- montón: estado, idioma, gradeo y lo que se pagó. Sin estas columnas, un
-- usuario con dos dispositivos perdería esos datos en cada reconcile (la sync
-- es un mirror: lo que no sube, no baja).
--
-- Todo aditivo y nullable: las filas existentes siguen siendo válidas y una
-- versión antigua de la app que no conozca estas columnas sigue funcionando.

alter table public.collection_items
  add column if not exists condition text,
  add column if not exists language text,
  add column if not exists graded_company text,
  add column if not exists graded_grade numeric(3,1),
  -- Coste de adquisición POR COPIA, siempre en EUR (la divisa base del
  -- catálogo). La divisa de presentación es una preferencia de cliente.
  add column if not exists acquired_unit_price numeric(10,2),
  add column if not exists acquired_at timestamptz;

-- Se validan los dominios en el servidor: el cliente es la única fuente hoy,
-- pero un check barato evita que un bug de la app corrompa datos de forma
-- silenciosa y difícil de detectar después.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'collection_items_condition_check'
  ) then
    alter table public.collection_items
      add constraint collection_items_condition_check
      check (condition is null or condition in ('NM', 'LP', 'MP', 'HP', 'DMG'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'collection_items_grade_check'
  ) then
    alter table public.collection_items
      add constraint collection_items_grade_check
      check (graded_grade is null or (graded_grade >= 0 and graded_grade <= 10));
  end if;
end $$;
