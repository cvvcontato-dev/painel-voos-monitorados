// Classes e helpers compartilhados da aba Alterações.
export { inputCls, labelCls, sectionCls, btnPrimary, btnGhost } from '../boarding-passes/formState';

export const STATUS = {
  aviso_pendente: { label: 'Aviso pendente', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  aviso_enviado: { label: 'Aviso enviado', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300' },
  confirmado: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' }
};

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function validEmails(raw) {
  const list = String(raw || '').split(/[,;\s]+/).filter(Boolean);
  return list.length > 0 && list.every(e => EMAIL_RE.test(e));
}

export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// ISO "2026-03-10T14:30:00-03:00" -> "2026-03-10T14:30" (valor do datetime-local, sem converter fuso).
export function isoToLocalInput(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(iso || ''));
  return m ? `${m[1]}T${m[2]}` : '';
}

// "2026-03-10T14:30" -> "2026-03-10T14:30:00-03:00"
export function localInputToIso(v) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(String(v || ''));
  return m ? `${m[1]}:00-03:00` : '';
}

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

// ISO "2026-09-05T08:30:00-03:00" -> "05 SET 2026" (formato do extrator; usa a data escrita no ISO, sem converter fuso).
export function isoToDateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${m[3]} ${mes} ${m[1]}` : '';
}

// Dia/mês/ano de dois ISO são iguais? (compara só a parte da data escrita)
export const sameIsoDate = (a, b) => String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
