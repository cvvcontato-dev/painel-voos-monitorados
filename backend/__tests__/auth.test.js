const { hash, compare } = require('../helpers/password');

describe('password helpers', () => {
  test('hash returns a bcrypt string', async () => {
    const h = await hash('secret123');
    expect(h).toMatch(/^\$2[ab]\$/);
  });

  test('compare returns true for correct password', async () => {
    const h = await hash('hello');
    expect(await compare('hello', h)).toBe(true);
  });

  test('compare returns false for wrong password', async () => {
    const h = await hash('hello');
    expect(await compare('world', h)).toBe(false);
  });
});
