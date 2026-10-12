import { createClient } from '@supabase/supabase-js';

/**
 * Cliente único de Supabase para toda la app.
 *
 * Las credenciales vienen de `.env.local` (nunca se suben a GitHub):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * La anon/publishable key es pública por diseño: la seguridad real la dan
 * las políticas RLS de `supabase/schema.sql` (solo usuarios autenticados).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env.local, completa los valores y reinicia `npm run dev`.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // la sesión de caja sobrevive a recargas
    autoRefreshToken: true,
    detectSessionInUrl: false, // login por correo/contraseña, sin redirects OAuth
  },
});

/** Nombres de tablas centralizados para evitar strings sueltos en el código. */
export const TABLES = {
  clients: 'clients',
  extras: 'extras',
  consumptions: 'consumptions',
  payments: 'payments',
  mesaRecords: 'mesa_records',
} as const;
