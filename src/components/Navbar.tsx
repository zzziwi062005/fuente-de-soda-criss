import React, { useRef } from 'react';
import { Store, Download, UserPlus, Upload, FileSpreadsheet } from 'lucide-react';
import JSZip from 'jszip';

interface NavbarProps {
  onNewClientClick: () => void;
  onExportZip: () => void;
  onImportBackup: (jsonStr: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onNewClientClick,
  onExportZip,
  onImportBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const jsonFile = Object.values(zip.files).find(
          (f) => f.name.toLowerCase().endsWith('.json') && !f.dir
        );
        if (jsonFile) {
          const content = await jsonFile.async('text');
          onImportBackup(content);
        } else {
          console.error('No se encontró archivo .json dentro del archivo ZIP');
        }
      } else {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const content = evt.target?.result as string;
          if (content) {
            onImportBackup(content);
          }
        };
        reader.readAsText(file);
      }
    } catch (err) {
      console.error('Error procesando archivo de respaldo:', err);
    }
    // reset input so the same file can be chosen again if needed
    e.target.value = '';
  };

  return (
    <header className="sticky top-0 z-40 bg-amber-800 text-white shadow-md border-b border-amber-900/40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Store Name */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/60 flex items-center justify-center border border-amber-400/40 shadow-xs">
              <Store className="w-6 h-6 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg sm:text-xl tracking-tight text-white">
                  "Fuente de Soda Criss"
                </h1>
                <span className="hidden sm:inline-block text-[11px] bg-amber-950/70 px-2 py-0.5 rounded-md font-semibold text-amber-200 border border-amber-700/50">
                  Control de Cobros
                </span>
              </div>
              <p className="text-[11px] text-amber-200/90 hidden md:block">
                Cuentas Semanales, Diarias y Arqueo de Caja
              </p>
            </div>
          </div>

          {/* Action Buttons in the Top Bar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Button: + Cliente (Single clean name) */}
            <button
              type="button"
              onClick={onNewClientClick}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
              title="Registrar cliente"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Cliente</span>
            </button>

            {/* Button: Descargar ZIP con Excel + JSON */}
            <button
              type="button"
              onClick={onExportZip}
              className="bg-amber-900/80 hover:bg-amber-900 text-amber-100 border border-amber-700/70 text-xs sm:text-sm font-bold px-3 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
              title="Descargar ZIP con copia en Excel (CSV) y JSON"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span className="hidden sm:inline">Descargar ZIP (Excel + JSON)</span>
              <span className="sm:hidden">Excel/JSON</span>
            </button>

            {/* Button: Restaurar Copia JSON */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-amber-900/60 hover:bg-amber-900 text-amber-200 border border-amber-700/60 rounded-xl transition-colors"
              title="Restaurar copia de seguridad (.JSON o .ZIP)"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,.zip,application/json,application/zip"
              className="hidden"
            />
          </div>
        </div>
      </div>
    </header>
  );
};
