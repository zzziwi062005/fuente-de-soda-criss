-- =====================================================================
--  Fuente de Soda Criss — Esquema PostgreSQL para Supabase
--  Ejecutar completo en: Supabase → SQL Editor → New query → Run
--  Es idempotente: se puede volver a correr sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Función genérica para mantener updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. clients  ←  ClientRecord
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id            text        primary key,                -- ej. 'cli-p1-1' (ids actuales son texto, no UUID)
  name          text        not null,
  piso          text        not null default '1ro',
  account_type  text        not null check (account_type in ('semanal', 'diaria')),
  phone         text,
  notes         text,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists clients_piso_idx on public.clients (piso);

-- ---------------------------------------------------------------------
-- 2. extras  ←  ExtraItem (catálogo de adicionales)
-- ---------------------------------------------------------------------
create table if not exists public.extras (
  id           text          primary key,               -- ej. 'ext-1'
  name         text          not null,
  description  text,
  price        numeric(10,2) not null default 0 check (price >= 0),   -- S/.
  category     text,                                    -- libre: los datos reales usan también 'postre', 'guarnicion'…
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

-- Bases creadas con una versión anterior de este script tenían un CHECK en category
alter table public.extras drop constraint if exists extras_category_check;

-- ---------------------------------------------------------------------
-- 3. consumptions  ←  ConsumptionRecord
--    lunches / extras se guardan como JSONB: son "fotos" del pedido
--    (precio al momento de la venta) y siempre se leen junto al consumo.
-- ---------------------------------------------------------------------
create table if not exists public.consumptions (
  id              text          primary key,
  client_id       text          references public.clients (id) on delete set null,
                                -- NULL = pedido sin cliente registrado ('' en el front)
  client_name     text          not null,                -- snapshot del nombre
  piso            text          not null,
  account_type    text          not null check (account_type in ('semanal', 'diaria')),
  date            date          not null,                -- YYYY-MM-DD
  day_of_week     text          not null check (day_of_week in ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado')),
  recorded_at     timestamptz   not null default now(),  -- ← ConsumptionRecord.timestamp
  lunches         jsonb         not null default '[]'::jsonb check (jsonb_typeof(lunches) = 'array'),  -- LunchItem[]
  extras          jsonb         not null default '[]'::jsonb check (jsonb_typeof(extras)  = 'array'),  -- OrderExtraItem[]
  total           numeric(10,2) not null default 0,
  payment_status  text          not null default 'pendiente' check (payment_status in ('pagado', 'pendiente')),
  payment_method  text          check (payment_method in ('efectivo', 'yape', 'abono')),  -- 'abono' = liquidado con abonos previos
  payment_date    date,
  notes           text,
  lonche          jsonb         check (lonche is null or jsonb_typeof(lonche) = 'object'),
                                -- LoncheInfo {status, preparedAt?, readyAt?}; NULL = no es lonche
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

-- Bases creadas con una versión anterior: columna para el seguimiento de lonches
alter table public.consumptions add column if not exists lonche jsonb;
alter table public.consumptions drop constraint if exists consumptions_lonche_check;
alter table public.consumptions add constraint consumptions_lonche_check
  check (lonche is null or jsonb_typeof(lonche) = 'object');

-- Bases creadas con una versión anterior: permitir 'abono' como método de cobro del pedido
alter table public.consumptions drop constraint if exists consumptions_payment_method_check;
alter table public.consumptions add constraint consumptions_payment_method_check
  check (payment_method in ('efectivo', 'yape', 'abono'));

create index if not exists consumptions_date_idx      on public.consumptions (date);
create index if not exists consumptions_client_id_idx on public.consumptions (client_id);
create index if not exists consumptions_piso_idx      on public.consumptions (piso);

-- ---------------------------------------------------------------------
-- 4. payments  ←  PaymentRecord (abonos)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id              text          primary key,
  client_id       text          references public.clients (id) on delete set null,
  client_name     text          not null,
  piso            text          not null,
  account_type    text          not null check (account_type in ('semanal', 'diaria')),
  date            date          not null,
  day_of_week     text          not null check (day_of_week in ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado')),
  amount          numeric(10,2) not null,                -- S/.
  method          text          not null check (method in ('efectivo', 'yape')),
  notes           text,
  recorded_at     timestamptz   not null default now(),  -- ← PaymentRecord.timestamp
  is_dp_payment   boolean       not null default false,
  is_da_payment   boolean       not null default false,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists payments_date_idx      on public.payments (date);
create index if not exists payments_client_id_idx on public.payments (client_id);

-- ---------------------------------------------------------------------
-- 5. mesa_records  ←  MesaCounterRecord (contador de la mesa del salón)
--    En IndexedDB la clave era la fecha → un solo registro por día (UNIQUE).
-- ---------------------------------------------------------------------
create table if not exists public.mesa_records (
  id                   text          primary key,         -- ej. 'mesa-2026-10-12'
  date                 date          not null unique,
  day_of_week          text          not null check (day_of_week in ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado')),
  menu_completo_count  integer       not null default 0 check (menu_completo_count >= 0),
  solo_segundo_count   integer       not null default 0 check (solo_segundo_count  >= 0),
  extras               jsonb         not null default '[]'::jsonb check (jsonb_typeof(extras) = 'array'),  -- OrderExtraItem[]
  efectivo_amount      numeric(10,2) not null default 0,
  yape_amount          numeric(10,2) not null default 0,
  total_amount         numeric(10,2) not null default 0,
  recorded_at          timestamptz   not null default now(),  -- ← MesaCounterRecord.timestamp
  notes                text,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Triggers updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','extras','consumptions','payments','mesa_records'] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Seguridad: Row Level Security
--    La anon key va dentro del JS público (Vercel/Netlify). Sin RLS,
--    cualquiera con la URL podría leer o borrar la caja.
--    Política: solo usuarios autenticados (Supabase Auth) tienen acceso.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','extras','consumptions','payments','mesa_records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated_full_access" on public.%I', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. Realtime: emitir INSERT/UPDATE/DELETE a las pantallas conectadas
--    (respeta RLS: solo usuarios autenticados reciben los cambios)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','extras','consumptions','payments','mesa_records'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. Importación atómica de respaldo (todo o nada, en una transacción)
--    Usada por dbService.importFullBackup(). security invoker ⇒ aplica RLS.
-- ---------------------------------------------------------------------
create or replace function public.import_backup(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.consumptions where true;
  delete from public.payments where true;
  delete from public.mesa_records where true;
  delete from public.extras where true;
  delete from public.clients where true;

  insert into public.clients (id, name, piso, account_type, phone, notes, active)
  select id, name, piso, account_type, phone, notes, coalesce(active, true)
  from jsonb_populate_recordset(null::public.clients, coalesce(payload->'clients', '[]'::jsonb));

  insert into public.extras (id, name, description, price, category)
  select id, name, description, coalesce(price, 0), category
  from jsonb_populate_recordset(null::public.extras, coalesce(payload->'extras', '[]'::jsonb));

  insert into public.consumptions (id, client_id, client_name, piso, account_type, date, day_of_week,
                                   recorded_at, lunches, extras, total, payment_status, payment_method,
                                   payment_date, notes, lonche)
  select id, client_id, client_name, piso, account_type, date, day_of_week,
         coalesce(recorded_at, now()), coalesce(lunches, '[]'::jsonb), coalesce(extras, '[]'::jsonb),
         coalesce(total, 0), coalesce(payment_status, 'pendiente'), payment_method, payment_date, notes, lonche
  from jsonb_populate_recordset(null::public.consumptions, coalesce(payload->'consumptions', '[]'::jsonb));

  insert into public.payments (id, client_id, client_name, piso, account_type, date, day_of_week,
                               amount, method, notes, recorded_at, is_dp_payment, is_da_payment)
  select id, client_id, client_name, piso, account_type, date, day_of_week,
         coalesce(amount, 0), method, notes, coalesce(recorded_at, now()),
         coalesce(is_dp_payment, false), coalesce(is_da_payment, false)
  from jsonb_populate_recordset(null::public.payments, coalesce(payload->'payments', '[]'::jsonb));

  insert into public.mesa_records (id, date, day_of_week, menu_completo_count, solo_segundo_count, extras,
                                   efectivo_amount, yape_amount, total_amount, recorded_at, notes)
  select id, date, day_of_week, coalesce(menu_completo_count, 0), coalesce(solo_segundo_count, 0),
         coalesce(extras, '[]'::jsonb), coalesce(efectivo_amount, 0), coalesce(yape_amount, 0),
         coalesce(total_amount, 0), coalesce(recorded_at, now()), notes
  from jsonb_populate_recordset(null::public.mesa_records, coalesce(payload->'mesaRecords', '[]'::jsonb));
end;
$$;

revoke all on function public.import_backup(jsonb) from public, anon;
grant execute on function public.import_backup(jsonb) to authenticated;
