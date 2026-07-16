const { sign, verify } = require('../helpers/voucherToken');

describe('voucherToken', () => {
  test('token legado (sem tipo) valida e retorna type null', () => {
    const r = verify(sign(7));
    expect(r.ok).toBe(true);
    expect(r.voucherId).toBe(7);
    expect(r.type).toBeNull();
  });

  test('token tipado valida e retorna o tipo', () => {
    const r = verify(sign(7, undefined, 'pkg'));
    expect(r.ok).toBe(true);
    expect(r.voucherId).toBe(7);
    expect(r.type).toBe('pkg');
  });

  test('separação de namespace: token de voucher (id N) != token de pacote (id N)', () => {
    // Mesmo id, tipos diferentes → tokens diferentes; cada um só verifica no seu tipo.
    const vch = verify(sign(9));            // itinerário/voucher
    const pkg = verify(sign(9, undefined, 'pkg')); // pacote
    expect(vch.type).toBeNull();     // rota de pacote exige type==='pkg' → rejeita este
    expect(pkg.type).toBe('pkg');    // rota de itinerário exige !type → rejeita este
  });

  test('assinatura adulterada é rejeitada', () => {
    const t = sign(3, undefined, 'pkg');
    const tampered = t.slice(0, -2) + (t.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(verify(tampered).ok).toBe(false);
  });

  test('token expirado é rejeitado', () => {
    expect(verify(sign(3, -10)).ok).toBe(false);
  });
});
