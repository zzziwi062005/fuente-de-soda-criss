import type { ConsumptionRecord } from '../types';

// Avisos de Lonches: detecta lonches nuevos o modificados comparando la lista
// de pedidos antes y después de cada cambio (propio o llegado por tiempo real).

export type LoncheAlertKind = 'nuevo' | 'cambio';

export interface LoncheAlertEvent {
  consumptionId: string;
  clientName: string;
  kind: LoncheAlertKind;
}

// Si llegan más avisos que esto de golpe (por ejemplo al restaurar un respaldo)
// no se muestra ninguno, para no llenar la pantalla.
export const MAX_ALERTS_AT_ONCE = 5;

// Solo cuenta lo que pidió el cliente (productos, cantidades y nota).
// Cambiar de fase, cobrar o corregir el nombre del cliente no es "cambiar su lonche".
export const loncheSignature = (c: ConsumptionRecord): string => {
  const items = c.extras
    .map((e) => `${e.name.trim().toLowerCase()}|${e.quantity}`)
    .sort();
  return JSON.stringify([items, (c.notes || '').trim()]);
};

export const snapshotLonches = (consumptions: ConsumptionRecord[]): Map<string, string> => {
  const map = new Map<string, string>();
  consumptions.forEach((c) => {
    if (c.lonche) map.set(c.id, loncheSignature(c));
  });
  return map;
};

export const diffLoncheEvents = (
  previous: Map<string, string>,
  consumptions: ConsumptionRecord[],
  today: string
): { events: LoncheAlertEvent[]; snapshot: Map<string, string> } => {
  const snapshot = snapshotLonches(consumptions);
  const events: LoncheAlertEvent[] = [];
  consumptions.forEach((c) => {
    if (!c.lonche || c.date !== today) return;
    const before = previous.get(c.id);
    const now = snapshot.get(c.id)!;
    if (before === undefined) {
      events.push({ consumptionId: c.id, clientName: c.clientName, kind: 'nuevo' });
    } else if (before !== now) {
      events.push({ consumptionId: c.id, clientName: c.clientName, kind: 'cambio' });
    }
  });
  return { events: events.length > MAX_ALERTS_AT_ONCE ? [] : events, snapshot };
};

export const loncheAlertText = (e: LoncheAlertEvent): string =>
  e.kind === 'nuevo'
    ? `${e.clientName} ha pedido un lonche`
    : `${e.clientName} ha cambiado su lonche`;

// ---------------------------------------------------------------------------
// Sonido (Web Audio, sin archivos). Los navegadores solo dejan sonar audio
// después de que la persona toca la pantalla una vez, así que el contexto se
// "desbloquea" con el primer toque o tecla.
// ---------------------------------------------------------------------------
let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
};

export const unlockLoncheAudio = (): void => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => undefined);
};

// Lonche nuevo: "din-don" subiendo. Cambio: "don-din" bajando, para distinguirlos.
export const playLoncheChime = (kind: LoncheAlertKind): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  const notes = kind === 'nuevo' ? [784, 1047, 1319] : [1047, 784];
  const start = ctx.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const t = start + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
  try {
    navigator.vibrate?.(kind === 'nuevo' ? [180, 80, 180] : 200);
  } catch {
    // algunos navegadores no permiten vibrar
  }
};
