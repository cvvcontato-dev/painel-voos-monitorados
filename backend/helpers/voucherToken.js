const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function getSecret() {
  return process.env.VOUCHER_TOKEN_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-in-production';
}

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Tokens podem ser tipados para separar namespaces de recursos que compartilham
// o mesmo secret (voucher/itinerário vs pacote). Sem `type`, o formato é o
// legado de 3 partes (`id.exp.sig`) — mantém tokens de voucher já emitidos.
// Com `type`, o formato é `type.id.exp.sig` (4 partes) e o tipo entra no payload
// assinado, então um token de um tipo não valida como outro.
function sign(voucherId, ttlSeconds = DEFAULT_TTL_SECONDS, type = null) {
  const id = String(voucherId);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = type ? `${type}.${id}.${exp}` : `${id}.${exp}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest();
  return type ? `${type}.${id}.${exp}.${base64UrlEncode(sig)}` : `${id}.${exp}.${base64UrlEncode(sig)}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'token vazio' };
  const parts = token.split('.');
  if (parts.length !== 3 && parts.length !== 4) return { ok: false, reason: 'formato inválido' };
  const type = parts.length === 4 ? parts[0] : null;
  const [id, expStr, sigB64] = parts.length === 4 ? parts.slice(1) : parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'expiry inválido' };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expirado' };
  const payload = type ? `${type}.${id}.${expStr}` : `${id}.${expStr}`;
  const expectedSig = crypto.createHmac('sha256', getSecret()).update(payload).digest();
  const givenSig = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((sigB64.length + 3) % 4), 'base64');
  if (givenSig.length !== expectedSig.length) return { ok: false, reason: 'assinatura inválida' };
  if (!crypto.timingSafeEqual(givenSig, expectedSig)) return { ok: false, reason: 'assinatura inválida' };
  return { ok: true, voucherId: Number(id), type };
}

module.exports = { sign, verify };
