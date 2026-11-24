import React, { useState, useEffect } from 'react';
import { 
  ClientRecord, 
  ConsumptionRecord, 
  PaymentRecord, 
  MesaCounterRecord,
  ExtraItem,
  normalizePiso
} from './types';
import { INITIAL_EXTRAS } from './data/initialData';
import {
  dbService,
  INITIAL_CLIENTS,
  getTodayDateString,
  SaveOptions
} from './db/database';
import { parseBackup } from './db/backupParser';
import { Navbar } from './components/Navbar';
import { CuadernoLedger } from './components/CuadernoLedger';
import { downloadZipBackup, FullBackupPayload } from './utils/backupExport';

export default function App() {
  const todayStr = getTodayDateString();

  // Digital notebook database states
  const [clients, setClients] = useState<ClientRecord[]>(INITIAL_CLIENTS);
  const [consumptions, setConsumptions] = useState<ConsumptionRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [mesaRecords, setMesaRecords] = useState<MesaCounterRecord[]>([]);
  const [newClientSignal, setNewClientSignal] = useState<number>(0);

  // Extras catalog persisted in localStorage
  const [extras, setExtras] = useState<ExtraItem[]>(() => {
    const saved = localStorage.getItem('criss_extras');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved extras', e);
      }
    }
    return INITIAL_EXTRAS;
  });

  // Cambios en tiempo real desde otras pantallas (Supabase Realtime)
  useEffect(() => {
    return dbService.subscribe({
      onChange: (snap) => {
        if (snap.clients) setClients(snap.clients.map((c) => ({ ...c, piso: normalizePiso(c.piso) })));
        if (snap.consumptions) setConsumptions(snap.consumptions.map((c) => ({ ...c, piso: normalizePiso(c.piso) })));
        if (snap.payments) setPayments(snap.payments.map((p) => ({ ...p, piso: normalizePiso(p.piso) })));
        if (snap.mesaRecords) setMesaRecords(snap.mesaRecords);
        if (snap.extras && snap.extras.length > 0) setExtras(snap.extras);
      },
      onError: (message) => showToast(message),
    });
  }, []);

  // Carga inicial. La pantalla de trabajo NO se muestra hasta tener TODAS las tablas:
  // anotar con la lista a medio cargar fue lo que borró los pedidos el 21/11/2026.
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadDb() {
      setLoadState('loading');
      try {
        const [loadedClients, loadedConsumptions, loadedPayments, loadedMesaRecords, loadedExtras] =
          await Promise.all([
            dbService.getClients(),
            dbService.getConsumptions(),
            dbService.getPayments(),
            dbService.getMesaRecords(),
            dbService.getExtras(),
          ]);
        if (cancelled) return;
        setClients(loadedClients.map(c => ({ ...c, piso: normalizePiso(c.piso) })));
        setConsumptions(loadedConsumptions.map(c => ({ ...c, piso: normalizePiso(c.piso) })));
        setPayments(loadedPayments.map(p => ({ ...p, piso: normalizePiso(p.piso) })));
        setMesaRecords(loadedMesaRecords);
        if (loadedExtras && loadedExtras.length > 0) {
          setExtras(loadedExtras);
        }
        setLoadState('ready');
      } catch (e) {
        console.error('Error loading data from dbService', e);
        if (!cancelled) setLoadState('error');
      }
    }
    loadDb();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // Save extras changes to localStorage and DB
  useEffect(() => {
    localStorage.setItem('criss_extras', JSON.stringify(extras));
  }, [extras]);

  // Toast notification
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Database operation handlers
  const handleSaveConsumptions = async (data: ConsumptionRecord[], opts?: SaveOptions) => {
    if (loadState !== 'ready') return;
    setConsumptions(data);
    await dbService.saveConsumptions(data, opts);
  };

  const handleSavePayments = async (data: PaymentRecord[], opts?: SaveOptions) => {
    if (loadState !== 'ready') return;
    setPayments(data);
    await dbService.savePayments(data, opts);
  };

  const handleSaveMesaRecords = async (data: MesaCounterRecord[]) => {
    setMesaRecords(data);
    await dbService.saveMesaRecords(data);
  };

  const handleSaveExtras = async (newExtras: ExtraItem[]) => {
    setExtras(newExtras);
    await dbService.saveExtras(newExtras);
    showToast('Catálogo de adicionales actualizado');
  };

  const handleSaveClients = async (data: ClientRecord[], opts?: SaveOptions) => {
    if (loadState !== 'ready') return;
    setClients(data);
    await dbService.saveClients(data, opts);
  };

  // Export full ZIP backup containing both JSON and Excel (CSV)
  const handleExportZipBackup = async () => {
    try {
      const payload: FullBackupPayload = {
        app: 'Fuente de Soda Criss',
        version: 2,
        exportDate: new Date().toISOString(),
        clients,
        consumptions,
        payments,
        mesaRecords,
        extras,
      };
      await downloadZipBackup(payload, todayStr);
      showToast('Copia de seguridad ZIP descargada (Excel + JSON con adicionales)');
    } catch (e) {
      console.error(e);
      showToast('Error al generar copia de seguridad');
    }
  };

  const handleImportBackup = async (jsonStr: string) => {
    // Restaurar REEMPLAZA todo lo que hay en la nube: se pide confirmación mostrando
    // de cuándo es el respaldo y cuántos pedidos tiene frente a los que hay ahora.
    let preview: ReturnType<typeof parseBackup> = null;
    let exportDate = '';
    try {
      preview = parseBackup(jsonStr, extras);
      const raw = JSON.parse(jsonStr);
      if (raw && typeof raw.exportDate === 'string') exportDate = raw.exportDate;
    } catch {
      preview = null;
    }
    if (!preview) {
      showToast('El archivo no contiene un formato de JSON válido');
      return;
    }
    const fecha = exportDate
      ? new Date(exportDate).toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short' })
      : 'fecha desconocida';
    const ok = window.confirm(
      `⚠️ RESTAURAR BORRA TODO LO QUE HAY AHORA y lo reemplaza por el respaldo.\n\n` +
        `Respaldo del: ${fecha}\n` +
        `Pedidos en el respaldo: ${preview.consumptions.length} (ahora hay ${consumptions.length})\n` +
        `Abonos en el respaldo: ${preview.payments.length} (ahora hay ${payments.length})\n` +
        `Clientes en el respaldo: ${preview.clients.length} (ahora hay ${clients.length})\n\n` +
        `Todo lo anotado después de esa fecha se perderá. ¿Seguro que quieres restaurar?`
    );
    if (!ok) return;
    const typed = window.prompt('Para confirmar, escribe RESTAURAR en mayúsculas:');
    if ((typed || '').trim() !== 'RESTAURAR') {
      showToast('Restauración cancelada');
      return;
    }
    try {
      const restored = await dbService.importFullBackup(jsonStr);
      if (restored) {
        setClients(restored.clients.map((c) => ({ ...c, piso: normalizePiso(c.piso) })));
        setConsumptions(restored.consumptions.map((c) => ({ ...c, piso: normalizePiso(c.piso) })));
        setPayments(restored.payments.map((p) => ({ ...p, piso: normalizePiso(p.piso) })));
        setMesaRecords(restored.mesaRecords);
        if (Array.isArray(restored.extras)) {
          setExtras(restored.extras);
        }

        showToast('Base de datos y adicionales cargados tal cual el archivo JSON');
      } else {
        showToast('El archivo no contiene un formato de JSON válido');
      }
    } catch (e) {
      console.error(e);
      showToast('Error al restaurar el archivo JSON');
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans selection:bg-amber-200">
      {/* Navbar with brand & actions (+ Cliente, ZIP Excel+JSON, Restaurar) */}
      <Navbar
        onNewClientClick={() => setNewClientSignal((prev) => prev + 1)}
        onExportZip={handleExportZipBackup}
        onImportBackup={handleImportBackup}
      />

      {/* Floating toast notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-stone-900 text-white text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-xl shadow-xl border border-stone-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {notification}
        </div>
      )}

      {/* Main Single-screen Viewport: Registro de Ventas */}
      <main className="flex-1 pb-12">
        {loadState !== 'ready' ? (
          <div className="max-w-md mx-auto mt-16 px-4 text-center">
            {loadState === 'loading' ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full border-4 border-amber-200 border-t-amber-700 animate-spin" />
                <p className="font-bold text-stone-800">Cargando pedidos, abonos y clientes…</p>
                <p className="text-xs text-stone-500 mt-1">
                  Espera a que termine antes de anotar. Con señal lenta puede tardar unos segundos.
                </p>
              </div>
            ) : (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-xs">
                <p className="font-bold text-rose-800">No se pudieron cargar los datos de la nube.</p>
                <p className="text-xs text-rose-700 mt-1">Revisa tu conexión a internet y vuelve a intentarlo.</p>
                <button
                  type="button"
                  onClick={() => setLoadAttempt((n) => n + 1)}
                  className="mt-4 bg-amber-800 hover:bg-amber-900 text-white font-bold text-sm px-4 py-2.5 rounded-xl"
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>
        ) : (
        <CuadernoLedger
          clients={clients}
          consumptions={consumptions}
          payments={payments}
          mesaRecords={mesaRecords}
          extrasCatalog={extras}
          openNewClientSignal={newClientSignal}
          onSaveConsumptions={handleSaveConsumptions}
          onSavePayments={handleSavePayments}
          onSaveMesaRecords={handleSaveMesaRecords}
          onSaveExtras={handleSaveExtras}
          onSaveClients={handleSaveClients}
          onExportBackup={handleExportZipBackup}
          onImportBackup={handleImportBackup}
        />
        )}
      </main>

      {/* Clean Footer */}
      <footer className="bg-stone-900 text-stone-400 text-xs py-4 px-4 border-t border-stone-800 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong className="text-stone-200">"Fuente de Soda Criss"</strong> — Sistema de Registro de Ventas y Cobros.
          </div>
          <div className="flex items-center gap-3 text-stone-400">
            <span>Afuera: Menú S/ 13 • Segundo S/ 12</span>
            <span>•</span>
            <span>Tienda: Menú S/ 12 • Segundo S/ 11</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
