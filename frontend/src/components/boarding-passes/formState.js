// Estado do formulário da aba Cartões de Embarque + helpers puros.

export const inputCls =
  "w-full px-3 py-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
  "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
  "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

export const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";

export const sectionCls =
  "border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 bg-white/70 dark:bg-slate-900/30";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 " +
  "dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer";

let seq = 0;
export function newKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${seq++}`;
}

export const emptySegment = (label = null) => ({ key: newKey(), url: '', label, parsed: null, error: null });

export const emptyPassenger = () => ({ key: newKey(), name: '', email: '', phone: '', segments: [emptySegment()] });

export const emptyForm = () => ({
  voucherId: null,
  flightDate: null,
  passengers: [emptyPassenger()],
  emailMode: 'individual',
  singleEmail: '',
  whatsappMode: 'individual',
  singlePhone: ''
});

export function formToPayload(form) {
  return {
    voucherId: form.voucherId,
    flightDate: form.flightDate,
    emailMode: form.emailMode,
    singleEmail: form.singleEmail,
    whatsappMode: form.whatsappMode,
    singlePhone: form.singlePhone,
    passengers: form.passengers.map(p => ({
      name: p.name,
      email: p.email,
      phone: p.phone,
      segments: p.segments.map(s => ({ url: s.url, label: s.label }))
    }))
  };
}

// Converte um envio salvo (GET /:id) de volta para o formulário.
export function sendToForm(send) {
  const { payload, links } = send;
  return {
    voucherId: send.voucherId,
    flightDate: send.flightDate,
    emailMode: payload.emailMode,
    singleEmail: payload.singleEmail || '',
    whatsappMode: payload.whatsappMode,
    singlePhone: payload.singlePhone || '',
    passengers: payload.passengers.map((p, pi) => ({
      key: newKey(),
      name: p.name,
      email: p.email || '',
      phone: p.phone || '',
      segments: p.segments.map((s, si) => {
        const link = links.find(l => l.passengerIndex === pi && l.segmentIndex === si);
        return {
          key: newKey(),
          url: s.url,
          label: s.label || null,
          error: null,
          parsed: link
            ? { ok: true, cleanUrl: link.cleanUrl, carrier: link.carrier, recognized: link.recognized, data: link.data }
            : null
        };
      })
    }))
  };
}

export function errorMessage(err, fallback) {
  const d = err?.response?.data;
  if (d?.errors?.length) return d.errors.join(' · ');
  return d?.error || fallback;
}

const CIA = { azul: 'Azul', gol: 'Gol', latam: 'Latam' };

// Selo exibido abaixo do campo do link.
export function badgeFor(parsed) {
  if (!parsed) return null;
  if (!parsed.recognized) return { tone: 'warn', text: 'Link não reconhecido — será enviado como está' };
  const d = parsed.data || {};
  const cia = CIA[parsed.carrier] || 'Google Wallet';
  if (d.flightNumber) {
    return { tone: 'ok', text: `${cia} · ${d.flightNumber} · ${d.origin}→${d.destination} · ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` };
  }
  if (d.orderId) return { tone: 'ok', text: `${cia} · pedido ${d.orderId}` };
  return { tone: 'ok', text: `${cia} · link limpo` };
}
