import React from 'react';
import { Plane, User, Calendar, Hash } from 'lucide-react';

const CARRIER_STYLES = {
  azul: {
    accent: '#003da5',
    tagBg: 'bg-blue-50 dark:bg-blue-950/40',
    tagText: 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    name: 'Azul'
  },
  gol: {
    accent: '#ea580c',
    tagBg: 'bg-orange-50 dark:bg-orange-950/40',
    tagText: 'text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    name: 'Gol'
  },
  latam: {
    accent: '#be123c',
    tagBg: 'bg-rose-50 dark:bg-rose-950/40',
    tagText: 'text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    name: 'Latam'
  },
  default: {
    accent: '#00569e',
    tagBg: 'bg-sky-50 dark:bg-sky-950/40',
    tagText: 'text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    name: 'Voo'
  }
};

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  try {
    // Trata tanto ISO (YYYY-MM-DDTHH:mm:ss) quanto SQLite (YYYY-MM-DD HH:mm:ss) ou apenas data (YYYY-MM-DD)
    const cleaned = String(dateStr).trim().split(/[T ]/)[0];
    const parts = cleaned.split('-');
    if (parts.length === 3) {
      const day = parts[2].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      return `${day}/${month}`;
    }
  } catch (_) {}
  return '';
}

export default function VoucherBoardingCard({ voucher, isSelected, onClick }) {
  const carrierKey = (voucher.carrier || '').toLowerCase();
  const carrierInfo = CARRIER_STYLES[carrierKey] || CARRIER_STYLES.default;
  const route = voucher.route || '';
  const passenger = voucher.passenger || '';
  const locator = voucher.locator || '';
  const dateFormatted = formatDateShort(voucher.departureDate || voucher.created_at);

  const routeParts = route && (route.includes('→') ? route.split('→') : (route.includes('->') ? route.split('->') : null));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative text-left rounded-xl transition-all duration-200 cursor-pointer overflow-hidden border select-none min-h-[64px] ${
        isSelected
          ? 'bg-gradient-to-r from-blue-50/70 via-white to-white dark:from-slate-800/90 dark:to-slate-900 border-[#00569e] ring-2 ring-[#00569e]/20 shadow-md shadow-[#00569e]/10 -translate-y-0.5'
          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/70 hover:border-[#3871c1]/60 hover:shadow-sm hover:-translate-y-0.5'
      }`}
    >
      {/* Faixa lateral colorida com a cor da cia aérea */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 transition-colors"
        style={{ backgroundColor: carrierInfo.accent }}
      />

      <div className="pl-3.5 pr-3 py-2.5 flex flex-col justify-between h-full">
        {/* Linha superior: Rota / Cia / ID */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {routeParts && routeParts.length >= 2 ? (
              <>
                <span className="text-[#00569e] dark:text-[#3871c1]">{routeParts[0].trim()}</span>
                <Plane className="w-3 h-3 text-slate-400 rotate-90" />
                <span className="text-[#00569e] dark:text-[#3871c1]">{routeParts[1].trim()}</span>
              </>
            ) : route ? (
              <span className="text-[#00569e] dark:text-[#3871c1]">{route}</span>
            ) : (
              <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1 font-sans font-semibold">
                <Hash className="w-3 h-3 text-slate-400" />
                Voo #{voucher.id}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Tag Cia Aérea */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${carrierInfo.tagBg} ${carrierInfo.tagText}`}
            >
              {carrierInfo.name}
            </span>

            {/* ID discreto se rota exibida */}
            {route && (
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                #{voucher.id}
              </span>
            )}
          </div>
        </div>

        {/* Linha inferior: Passageiro + Localizador / Data */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1 min-w-0 truncate">
            {passenger ? (
              <>
                <User className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {passenger}
                </span>
              </>
            ) : (
              <span className="italic text-slate-400">Sem passageiro</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {locator && (
              <span className="font-mono text-[10.5px] font-bold text-[#00569e] dark:text-[#3871c1] bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                {locator}
              </span>
            )}
            {dateFormatted && (
              <span className="flex items-center gap-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
                <Calendar className="w-3 h-3" />
                {dateFormatted}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
