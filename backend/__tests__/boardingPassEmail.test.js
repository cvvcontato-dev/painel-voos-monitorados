const { buildBoardingPassEmailHtml, buildSubject } = require('../services/boardingPassEmail');

const seg = (extra = {}) => ({
  label: 'AD2730 · Salvador → Recife · 24/09', url: 'https://painel.test/c/Abc12345',
  instructionKey: 'google',
  data: { flightNumber: 'AD2730', date: '2026-09-24', origin: 'SSA', destination: 'REC' },
  ...extra
});

test('assunto com voo e data; plural quando há mais de um cartão', () => {
  expect(buildSubject({ passengers: [{ name: 'Maria Silva', segments: [seg()] }] }))
    .toBe('Seu cartão de embarque está pronto ✈️ AD2730 · 24/09');
  expect(buildSubject({ passengers: [{ name: 'Maria Silva', segments: [seg(), seg()] }] }))
    .toBe('Seus cartões de embarque estão prontos ✈️ AD2730 · 24/09');
  expect(buildSubject({ passengers: [{ name: 'Maria Silva', segments: [seg({ data: null })] }] }))
    .toBe('Seu cartão de embarque está pronto ✈️');
});

test('HTML: logo CID, botão por trecho, instruções da cia e dicas', () => {
  const html = buildBoardingPassEmailHtml({
    passengers: [
      { name: 'SILVA, MARIA', segments: [seg()] },
      { name: 'João <b>Souza</b>', segments: [seg({ instructionKey: 'latam', url: 'https://painel.test/c/Lat12345' })] }
    ]
  });
  expect(html).toContain('cid:clube-do-voo-logo');
  expect(html).toContain('Check-in realizado!');
  expect(html).toContain('href="https://painel.test/c/Abc12345"');
  expect(html).toContain('href="https://painel.test/c/Lat12345"');
  expect(html.match(/Adicionar à carteira<\/a>/g)).toHaveLength(2);
  expect(html).toContain('<strong>Entendi</strong>');
  expect(html).toContain('tire um print do QR code');
  expect(html).toContain('Toque no botão azul do seu trecho, acima');
  expect(html).not.toContain('Toque no link acima');
  expect(html).toContain('No aeroporto');
  expect(html).toContain('João &lt;b&gt;Souza&lt;/b&gt;'); // escapado
});
