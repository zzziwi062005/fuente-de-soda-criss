-- =====================================================================
--  Papelera / historial de cambios — Fuente de Soda Criss
--
--  Cada vez que se BORRA o se MODIFICA un pedido, un abono o un cliente,
--  se guarda una copia de cómo estaba antes en public.row_history.
--  Así, si un equipo borra o revierte datos por error (como el 21/11/2026),
--  se pueden recuperar con SQL. Se guarda lo de los últimos 90 días.
--
--  Ejecutar una sola vez en Supabase → SQL Editor. Se puede volver a
--  ejecutar sin problema (es idempotente).
-- =====================================================================

create table if not exists public.row_history (
  id          bigserial primary key,
  table_name  text        not null,
  row_id      text        not null,
  operation   text        not null check (operation in ('DELETE', 'UPDATE')),
  old_row     jsonb       not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid        default auth.uid()
);

create index if not exists row_history_lookup_idx  on public.row_history (table_name, row_id, changed_at desc);
create index if not exists row_history_changed_idx on public.row_history (changed_at);

-- Solo se lee desde el panel de Supabase: la app no puede ver ni tocar esta tabla.
alter table public.row_history enable row level security;
revoke all on public.row_history from anon, authenticated;

create or replace function public.archive_old_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- En un UPDATE, solo se guarda si de verdad cambió algo (no por tocar updated_at).
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;

  insert into public.row_history (table_name, row_id, operation, old_row)
  values (tg_table_name, old.id::text, tg_op, to_jsonb(old));

  -- Limpieza ocasional: se conserva el historial de los últimos 90 días.
  if random() < 0.01 then
    delete from public.row_history where changed_at < now() - interval '90 days';
  end if;

  return null;
end;
$$;

drop trigger if exists archive_consumptions on public.consumptions;
create trigger archive_consumptions
  after update or delete on public.consumptions
  for each row execute function public.archive_old_row();

drop trigger if exists archive_payments on public.payments;
create trigger archive_payments
  after update or delete on public.payments
  for each row execute function public.archive_old_row();

drop trigger if exists archive_clients on public.clients;
create trigger archive_clients
  after update or delete on public.clients
  for each row execute function public.archive_old_row();

-- ---------------------------------------------------------------------
--  Cómo recuperar (ejemplos, NO se ejecutan solos):
--
--  Ver lo borrado hoy:
--    select changed_at, table_name, row_id, old_row->>'client_name', old_row->>'total'
--    from public.row_history
--    where operation = 'DELETE' and changed_at > now() - interval '1 day'
--    order by changed_at desc;
--
--  Devolver los pedidos borrados en un rango de tiempo (sin duplicar los que ya existen):
--    insert into public.consumptions
--    select (jsonb_populate_record(null::public.consumptions, h.old_row)).*
--    from (
--      select distinct on (row_id) row_id, old_row
--      from public.row_history
--      where table_name = 'consumptions' and operation = 'DELETE'
--        and changed_at between '2026-11-21 16:38-05' and '2026-11-21 16:40-05'
--      order by row_id, changed_at desc
--    ) h
--    on conflict (id) do nothing;
-- ---------------------------------------------------------------------
