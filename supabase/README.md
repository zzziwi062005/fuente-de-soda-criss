# Migración a Supabase — Fuente de Soda Criss

Persistencia: IndexedDB/localStorage ➜ Supabase (PostgreSQL) + Supabase Auth.

## Estado

| # | Paso | Estado |
|---|------|--------|
| 0 | Respaldo del proyecto (`_backups/criss-pre-supabase-2026-10-12.tar.gz`) | ✅ |
| 1 | Esquema SQL (`supabase/schema.sql`) — 5 tablas, FKs, índices, RLS | ✅ escrito y probado en PostgreSQL 16 |
| 2 | Ejecutar `schema.sql` en Supabase → SQL Editor | ✅ 5 tablas, RLS + política `authenticated`, triggers, FKs verificados |
| 3 | Cliente Supabase (`src/lib/supabase.ts`, `src/vite-env.d.ts`, `.env.example`) | ✅ |
| 4 | `.env.local` con URL + publishable key | ✅ (anon sin sesión: lectura `[]`, escritura `42501`) |
| 5a | Auth: desactivar registro público | ✅ (`signup_disabled` verificado) |
| 5b | Crear usuario de caja: Authentication → Users → Add user → *Create new user* (marcar **Auto Confirm User**) | ✅ |
| 6 | Login: `src/components/AuthGate.tsx` envolviendo `<App />` en `main.tsx` (+ hook `useAuth()`, botón *Cerrar sesión*) | ✅ probado: login visible sin sesión, error en credenciales malas |
| 7 | `src/db/database.ts` sobre Supabase (misma API de `dbService`) + guardado por diferencias + cola global + reintentos | ✅ 13 pruebas de sincronización con datos reales |
| 7b | Tiempo real: tablas en `supabase_realtime` + `dbService.subscribe()` en `App.tsx` | ✅ |
| 7c | Importación atómica: función `import_backup(jsonb)` (todo o nada) | ✅ probada en PostgreSQL 16 con el respaldo real |
| 8 | Importar el respaldo real (`12-10-2026.json`) desde la app ➜ botón *Restaurar* | ⏳ Paolo |
| 9 | Deploy en Vercel/Netlify (variables `VITE_SUPABASE_*` en el panel) | 🔜 |

## Proyecto Supabase

- Proyecto: **Fuente de Soda Criss** · región `us-east-1` · plan Free
- URL y clave pública: en `.env.local` (no se versiona) y en las variables de entorno de Vercel.

## Puesta en marcha local

```bash
npm install                    # instala @supabase/supabase-js
cp .env.example .env.local     # y completa los 2 valores
npm run dev
```

## Mapeo interfaz ➜ tabla

| TypeScript (`src/types.ts`) | PostgreSQL | Notas |
|---|---|---|
| `ClientRecord` | `clients` | `accountType` ➜ `account_type` |
| `ExtraItem` | `extras` | `category` restringida a las 5 categorías |
| `ConsumptionRecord` | `consumptions` | `lunches`/`extras` en JSONB, `timestamp` ➜ `recorded_at`, `clientId ''` ➜ `NULL` |
| `PaymentRecord` | `payments` | `isDpPayment`/`isDaPayment` ➜ `is_dp_payment`/`is_da_payment` |
| `MesaCounterRecord` | `mesa_records` | `date` UNIQUE (1 registro por día) |

## Decisiones

- **IDs `text`**: se conservan los IDs actuales (`cli-p1-1`, `mesa-YYYY-MM-DD`) para importar el respaldo sin transformarlo.
- **Líneas de pedido en JSONB**: son una foto del pedido con el precio del momento; siempre se leen con su consumo. Se pueden normalizar en la fase Spring Boot.
- **FK `ON DELETE SET NULL`**: borrar un cliente nunca borra dinero registrado; la app ya elimina explícitamente sus consumos/abonos.
- **RLS solo `authenticated`**: la anon key es pública en el bundle; sin sesión no se lee ni escribe nada.
  ⚠️ Con esta política **cualquier usuario autenticado** tiene acceso total, por eso el registro público (*Allow new users to sign up*) debe estar **desactivado**.

## Cómo sincroniza `dbService`

- **Lectura**: al entrar se cargan las 5 tablas (paginadas de 1000 en 1000).
- **Guardado por diferencias (diff a 3 vías)**: `saveX(arrayCompleto)` compara contra lo que *esta pantalla* tenía. Solo sube filas que el usuario creó o editó y solo borra las que quitó. Una copia vieja nunca pisa el cambio de otra persona.
- **Cola global**: los guardados se aplican en orden de llamada (cliente nuevo → su pedido), evitando errores de clave foránea.
- **Tiempo real**: cambios de otras pantallas llegan por Supabase Realtime y se aplican a `App.tsx` vía `dbService.subscribe()`. Al reconectar o volver a la pestaña se resincroniza.
- **Errores**: si falla un guardado se muestra un aviso y se reintenta a los 5 s (o al volver la conexión).
- **Respaldo**: *Descargar ZIP* sigue igual. *Restaurar* reemplaza TODO en la nube en una sola transacción.

## Estructura

```
src/lib/supabase.ts       cliente Supabase + nombres de tablas
src/db/database.ts        dbService (mapeo, diff, cola, realtime)
src/db/backupParser.ts    lectura/normalización de respaldos JSON
src/utils/dates.ts        getDayOfWeekName / getTodayDateString
src/data/demoData.ts      datos de demostración (ya no se siembran)
src/components/AuthGate.tsx  login + useAuth()
supabase/schema.sql       esquema completo (idempotente)
```

