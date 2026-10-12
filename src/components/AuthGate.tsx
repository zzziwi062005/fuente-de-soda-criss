import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Store, LogIn, LogOut, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

/* ------------------------------------------------------------------ */
/*  Contexto de autenticación                                          */
/*  Permite que cualquier componente lea la sesión con useAuth()       */
/*  (p. ej. mostrar el correo o un botón de salir en el Navbar).       */
/* ------------------------------------------------------------------ */
interface AuthContextValue {
  session: Session;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() debe usarse dentro de <AuthGate>');
  return ctx;
}

/** Traduce los errores de Supabase Auth a mensajes claros para la caja. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'El correo aún no está confirmado en Supabase.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión con el servidor. Revisa tu internet.';
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

/* ------------------------------------------------------------------ */
/*  Pantalla de login                                                  */
/* ------------------------------------------------------------------ */
const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setError(friendlyAuthError(authError.message));
      setSubmitting(false);
    }
    // En caso de éxito, onAuthStateChange en <AuthGate> muestra la app.
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex items-center justify-center px-4 py-10 font-sans selection:bg-amber-200">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
        {/* Encabezado con la marca */}
        <div className="bg-amber-800 text-white px-6 py-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-600/60 flex items-center justify-center border border-amber-400/40">
            <Store className="w-6 h-6 text-amber-100" />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight">"Fuente de Soda Criss"</h1>
            <p className="text-[11px] text-amber-200/90">Control de Cobros — acceso de caja</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="auth-email" className="block text-xs font-bold text-stone-600 uppercase tracking-wide">
              Correo
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="tu@correo.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="auth-password" className="block text-xs font-bold text-stone-600 uppercase tracking-wide">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 pl-3.5 pr-11 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-stone-400 hover:text-stone-700"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 disabled:text-stone-500 text-white text-sm font-bold py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="text-[11px] text-stone-400 text-center">
            Solo personal autorizado. Las cuentas se crean desde el panel de Supabase.
          </p>
        </form>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  AuthGate: muestra login o la app según haya sesión                 */
/* ------------------------------------------------------------------ */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // undefined = todavía comprobando; null = sin sesión
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (active) setSession(newSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
  };

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-700 animate-spin" aria-label="Cargando" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <AuthContext.Provider value={{ session, signOut }}>
      {children}

      {/* Botón flotante de salida (abajo a la izquierda; los avisos usan la derecha) */}
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        title={`Sesión: ${session.user.email ?? ''}`}
        className="fixed bottom-5 left-5 z-50 bg-stone-900/90 hover:bg-stone-900 text-stone-100 text-xs font-semibold py-2 px-3 rounded-xl shadow-lg border border-stone-700 flex items-center gap-1.5 transition-colors disabled:opacity-60"
      >
        {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
        <span>Cerrar sesión</span>
      </button>
    </AuthContext.Provider>
  );
};
