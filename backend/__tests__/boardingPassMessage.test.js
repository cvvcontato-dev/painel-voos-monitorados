const {
  segmentLabel, buildRecipientGroups, buildWhatsappText, buildWhatsappMessages
} = require('../helpers/boardingPassMessage');

const OPTS = { baseUrl: 'https://painel.test', useOriginal: false };

const azulLink = (pi, si, extra = {}) => ({
  passengerIndex: pi, segmentIndex: si, cleanUrl: `https://pay.google.com/gp/v/save/x${pi}${si}`,
  shortCode: `Code${pi}${si}AB`, carrier: 'azul', recognized: true,
  data: { carrierCode: 'AD', flightNumber: 'AD2730', date: '2026-09-24', origin: 'SSA', destination: 'REC', locator: 'RNWDKT' },
  ...extra
});
const latamLink = (pi, si) => ({
  passengerIndex: pi, segmentIndex: si, cleanUrl: 'https://www.latamairlines.com/br/pt/boarding-pass?orderId=X',
  shortCode: `Lat${pi}${si}ABCD`.slice(0, 8), carrier: 'latam', recognized: true,
  data: { orderId: 'X', lastName: 'Silva', segmentIndex: si }
});

function payload(passengers, extra = {}) {
  return { passengers, emailMode: 'individual', whatsappMode: 'individual', singleEmail: null, singlePhone: null, ...extra };
}

describe('segmentLabel', () => {
  test('usa dados do JWT com nome da cidade', () => {
    expect(segmentLabel(azulLink(0, 0), null, 0)).toBe('AD2730 · Salvador → Recife · 24/09');
  });
  test('sem dados: usa rótulo do voucher, senão "Cia · Trecho N"', () => {
    expect(segmentLabel(latamLink(0, 1), 'LA3456 · São Paulo → Recife · 01/10', 1)).toBe('LA3456 · São Paulo → Recife · 01/10');
    expect(segmentLabel(latamLink(0, 1), null, 1)).toBe('Latam · Trecho 2');
    expect(segmentLabel({ carrier: null, data: null }, null, 0)).toBe('Trecho 1');
  });
});

describe('buildWhatsappText', () => {
  test('1 passageiro Azul: saudação pelo primeiro nome, link curto e passos Google', () => {
    const p = payload([{ name: 'SILVA, MARIA', phone: '5575992020012', segments: [{ url: 'u', label: null }] }]);
    const [g] = buildRecipientGroups(p, [azulLink(0, 0)], 'whatsapp', OPTS);
    const text = buildWhatsappText(g);
    expect(text).toMatch(/^Olá, Maria! ✈️\nSeu check-in está feito\. Este é o seu cartão de embarque:/);
    expect(text).toContain('*AD2730 · Salvador → Recife · 24/09*\n👉 https://painel.test/c/Code00AB');
    expect(text).toContain('2. Toque em *Adicionar à carteira* (Google Wallet no Android, Apple Wallet no iPhone)');
    expect(text).toContain('Se a opção de carteira não aparecer, tire um print do QR code.');
    expect(text).toContain('*No aeroporto:*');
    expect(text.endsWith('*Clube do Voo Viagens*')).toBe(true);
  });

  test('Latam: passos Entendi / Adicionar à minha carteira', () => {
    const p = payload([{ name: 'Maria Silva', segments: [{ url: 'u', label: null }] }]);
    const [g] = buildRecipientGroups(p, [latamLink(0, 0)], 'whatsapp', OPTS);
    const text = buildWhatsappText(g);
    expect(text).toContain('2. Toque em *Entendi*');
    expect(text).toContain('3. Toque em *Adicionar à minha carteira*');
    expect(text).toContain('4. Pronto!');
  });

  test('modo single com 2 passageiros e 2 trechos: agrupa por passageiro, instruções uma vez', () => {
    const p = payload([
      { name: 'Maria Silva', segments: [{ url: 'a' }, { url: 'b' }] },
      { name: 'João Souza', segments: [{ url: 'c' }, { url: 'd' }] }
    ], { whatsappMode: 'single', singlePhone: '5575992020012' });
    const links = [azulLink(0, 0), azulLink(0, 1), azulLink(1, 0), azulLink(1, 1)];
    const groups = buildRecipientGroups(p, links, 'whatsapp', OPTS);
    expect(groups).toHaveLength(1);
    expect(groups[0].contact).toBe('5575992020012');
    const text = buildWhatsappText(groups[0]);
    expect(text.startsWith('Olá! ✈️\nO check-in de vocês está feito.')).toBe(true);
    expect(text).toContain('*Maria Silva*');
    expect(text).toContain('*João Souza*');
    expect(text.match(/Como salvar no celular/g)).toHaveLength(1);
  });

  test('cias misturadas: um bloco de instruções por cia, rotulado', () => {
    const p = payload([{ name: 'Maria Silva', segments: [{ url: 'a' }, { url: 'b' }] }]);
    const [g] = buildRecipientGroups(p, [azulLink(0, 0), latamLink(0, 1)], 'whatsapp', OPTS);
    const text = buildWhatsappText(g);
    expect(text).toContain('*Como salvar no celular (Azul / Gol):*');
    expect(text).toContain('*Como salvar no celular (Latam):*');
  });

  test('useOriginal ou link sem código curto → usa cleanUrl', () => {
    const p = payload([{ name: 'Maria Silva', segments: [{ url: 'a' }] }]);
    const [g1] = buildRecipientGroups(p, [azulLink(0, 0)], 'whatsapp', { ...OPTS, useOriginal: true });
    expect(buildWhatsappText(g1)).toContain('👉 https://pay.google.com/gp/v/save/x00');
    const [g2] = buildRecipientGroups(p, [azulLink(0, 0, { shortCode: null, recognized: false, carrier: null, data: null })], 'whatsapp', OPTS);
    expect(buildWhatsappText(g2)).toContain('👉 https://pay.google.com/gp/v/save/x00');
  });
});

describe('buildRecipientGroups (email)', () => {
  test('individual: um grupo por passageiro com o e-mail dele', () => {
    const p = payload([
      { name: 'Maria Silva', email: 'm@x.com', segments: [{ url: 'a' }] },
      { name: 'João Souza', email: null, segments: [{ url: 'b' }] }
    ]);
    const groups = buildRecipientGroups(p, [azulLink(0, 0), azulLink(1, 0)], 'email', OPTS);
    expect(groups.map(g => g.contact)).toEqual(['m@x.com', null]);
    expect(groups[0].passengers[0].segments[0].data.flightNumber).toBe('AD2730');
  });
});

describe('buildWhatsappMessages', () => {
  test('gera wa.me com número, ou sem número quando ausente', () => {
    const p = payload([
      { name: 'Maria Silva', phone: '5575992020012', segments: [{ url: 'a' }] },
      { name: 'João Souza', phone: null, segments: [{ url: 'b' }] }
    ]);
    const msgs = buildWhatsappMessages(p, [azulLink(0, 0), azulLink(1, 0)], OPTS);
    expect(msgs[0].waUrl.startsWith('https://wa.me/5575992020012?text=')).toBe(true);
    expect(msgs[1].waUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(msgs[0].waUrl.split('text=')[1])).toBe(msgs[0].text);
    expect(msgs[0].label).toBe('Maria Silva');
  });
});
