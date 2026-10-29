import React from 'react';
import { Plane, User, Calendar, Hash } from 'lucide-react';

const CARRIER_STYLES = {
  azul: {
    accent: '#003da5',
    tagBg: 'bg-blue-50 dark:bg-blue-950/50',
    tagText: 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    name: 'Azul'
  },
  gol: {
    accent: '#ea580c',
    tagBg: 'bg-orange-50 dark:bg-orange-950/50',
    tagText: 'text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    name: 'Gol'
  },
  latam: {
    accent: '#be123c',
    tagBg: 'bg-rose-50 dark:bg-rose-950/50',
    tagText: 'text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    name: 'Latam'
  },
  default: {
    accent: '#00569e',
    tagBg: 'bg-sky-50 dark:bg-sky-950/50',
    tagText: 'text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    name: 'Voo'
  }
};

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  try {
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

  const routeParts = route && (/[→\->]/.test(route) ? route.split(/[→\->]/).map(s => s.trim()).filter(Boolean) : null);

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
      className={`group relative text-left rounded-2xl transition-all duration-200 cursor-pointer overflow-hidden border select-none min-h-[68px] ${
        isSelected
          ? 'bg-gradient-to-r from-blue-50/80 via-white to-white dark:from-slate-800/90 dark:to-slate-900 border-[#00569e] ring-2 ring-[#00569e]/30 shadow-md shadow-[#00569e]/15 -translate-y-1'
          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/70 hover:border-[#3871c1] hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      {/* Faixa lateral colorida com a cor da cia aérea */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 transition-colors"
        style={{ backgroundColor: carrierInfo.accent }}
      />

      <div className="pl-4 pr-3.5 py-3 flex flex-col justify-between h-full">
        {/* Linha superior: Trecho em destaque monoespaçado + Tag Cia */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold tracking-wider">
            {routeParts && routeParts.length >= 2 ? (
              <>
                <span className="text-[#00569e] dark:text-[#3871c1] font-bold">{routeParts[0]}</span>
                <Plane className="w-3.5 h-3.5 text-slate-400 rotate-90 shrink-0" />
                <span className="text-[#00569e] dark:text-[#3871c1] font-bold">{routeParts[1]}</span>
              </>
            ) : route ? (
              <span className="text-[#00569e] dark:text-[#3871c1] font-bold">{route}</span>
            ) : (
              <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1 font-sans font-semibold">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                Voo #{voucher.id}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Tag Cia Aérea */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${carrierInfo.tagBg} ${carrierInfo.tagText}`}
            >
              {carrierInfo.name}
            </span>

            {/* ID do voucher */}
            <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-slate-500">
              #{voucher.id}
            </span>
          </div>
        </div>

        {/* Linha inferior: Passageiro + Localizador / Data */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            {passenger ? (
              <>
                <User className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate font-semibold text-slate-700 dark:text-slate-300">
                  {passenger}
                </span>
              </>
            ) : (
              <span className="italic text-slate-400 font-sans">Sem passageiro</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {locator && (
              <span className="font-mono text-[10.5px] font-bold text-[#00569e] dark:text-[#3871c1] bg-blue-50/80 dark:bg-slate-700/60 px-1.5 py-0.5 rounded border border-blue-100 dark:border-slate-600">
                {locator}
              </span>
            )}
            {dateFormatted && (
              <span className="flex items-center gap-1 text-[10.5px] text-slate-400 dark:text-slate-500 font-medium">
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
