import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import type { ConsumptionRecord } from '../types';
import { getTodayDateString } from '../db/database';
import {
  diffLoncheEvents,
  loncheAlertText,
  playLoncheChime,
  snapshotLonches,
  unlockLoncheAudio,
  type LoncheAlertKind,
} from '../utils/loncheAlerts';

interface LoncheAlertsProps {
  consumptions: ConsumptionRecord[];
  onOpenLonches: () => void;
}

interface Toast {
  key: string;
  text: string;
  kind: LoncheAlertKind;
}

const TOAST_MS = 10000;
const MAX_TOASTS = 4;

// Avisos con sonido cuando alguien anota o cambia un lonche (en este equipo o en otro).
export const LoncheAlerts: React.FC<LoncheAlertsProps> = ({ consumptions, onOpenLonches }) => {
  const snapshotRef = useRef<Map<string, string> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Desbloquear el audio con el primer toque (requisito de los navegadores)
  useEffect(() => {
    const unlock = () => unlockLoncheAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    // La primera carga de datos solo sirve de punto de partida: no avisa de lo que ya existía.
    if (snapshotRef.current === null) {
      if (consumptions.length > 0) snapshotRef.current = snapshotLonches(consumptions);
      return;
    }
    const { events, snapshot } = diffLoncheEvents(snapshotRef.current, consumptions, getTodayDateString());
    snapshotRef.current = snapshot;
    if (events.length === 0) return;

    playLoncheChime(events.some((e) => e.kind === 'nuevo') ? 'nuevo' : 'cambio');
    const stamp = Date.now();
    const fresh: Toast[] = events.map((e, i) => ({
      key: `${e.consumptionId}-${stamp}-${i}`,
      text: loncheAlertText(e),
      kind: e.kind,
    }));
    setToasts((prev) => [...fresh, ...prev].slice(0, MAX_TOASTS));
    fresh.forEach((t) => {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.key !== t.key));
      }, TOAST_MS);
    });
  }, [consumptions]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-md space-y-2 pointer-events-none"
      aria-live="assertive"
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          data-lonche-aviso={t.kind}
          className={`pointer-events-auto flex items-center gap-3 rounded-2xl shadow-2xl border-2 px-4 py-3 text-white animate-in fade-in slide-in-from-top-2 duration-200 ${
            t.kind === 'nuevo' ? 'bg-amber-600 border-amber-300' : 'bg-sky-700 border-sky-300'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onOpenLonches();
              setToasts((prev) => prev.filter((x) => x.key !== t.key));
            }}
            className="flex-1 flex items-center gap-3 text-left"
            title="Ir a Lonches"
          >
            <span className="shrink-0 p-2 bg-white/20 rounded-xl">
              <Bell className="w-5 h-5" />
            </span>
            <span className="text-base sm:text-lg font-black leading-tight">{t.text}</span>
          </button>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((x) => x.key !== t.key))}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/20"
            aria-label="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
