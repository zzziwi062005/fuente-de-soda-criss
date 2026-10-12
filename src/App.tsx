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
  getTodayDateString 
} from './db/database';
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

  // Load from dbService on mount
  useEffect(() => {
    async function loadDb() {
      try {
        const loadedClients = await dbService.getClients();
        setClients(loadedClients.map(c => ({ ...c, piso: normalizePiso(c.piso) })));

        const loadedConsumptions = await dbService.getConsumptions();
        setConsumptions(loadedConsumptions.map(c => ({ ...c, piso: normalizePiso(c.piso) })));

        const loadedPayments = await dbService.getPayments();
        setPayments(loadedPayments.map(p => ({ ...p, piso: normalizePiso(p.piso) })));

        const loadedMesaRecords = await dbService.getMesaRecords();
        setMesaRecords(loadedMesaRecords);

        const loadedExtras = await dbService.getExtras();
        if (loadedExtras && loadedExtras.length > 0) {
          setExtras(loadedExtras);
        }
      } catch (e) {
        console.error('Error loading data from dbService', e);
      }
    }
    loadDb();
  }, []);

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
  const handleSaveConsumptions = async (data: ConsumptionRecord[]) => {
    setConsumptions(data);
    await dbService.saveConsumptions(data);
  };

  const handleSavePayments = async (data: PaymentRecord[]) => {
    setPayments(data);
    await dbService.savePayments(data);
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

  const handleSaveClients = async (data: ClientRecord[]) => {
    setClients(data);
    await dbService.saveClients(data);
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
      </main>

      {/* Clean Footer */}
      <footer className="bg-stone-900 text-stone-400 text-xs py-4 px-4 border-t border-stone-800 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong className="text-stone-200">"Fuente de Soda Criss"</strong> — Sistema de Registro de Ventas y Cobros.
          </div>
          <div className="flex items-center gap-3 text-stone-400">
            <span>Mesa: Menú S/ 13 • Segundo S/ 12</span>
            <span>•</span>
            <span>Tienda: Menú S/ 12 • Segundo S/ 11</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
