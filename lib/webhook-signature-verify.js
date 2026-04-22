import crypto from 'crypto';

/**
 * Comprueba X-Webhook-Signature (HMAC-SHA256) del body en bruto.
 * Mismo criterio que el envío saliente: HMAC-SHA256(secret, rawBodyUtf8) en hex minúsculas.
 *
 * Acepta cabeceras con prefijos habituales: "sha256=", "v1=", etc.
 *
 * @param {string} rawBody - Cuerpo exacto recibido (típicamente request.text())
 * @param {string} secret - Secreto compartido con el origen
 * @param {string|null|undefined} signatureHeader - Valor de X-Webhook-Signature
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function verifyIncomingXWebhookSignature(rawBody, secret, signatureHeader) {
  if (!secret || typeof secret !== 'string') {
    return { ok: true };
  }

  if (signatureHeader === null || signatureHeader === undefined) {
    return { ok: false, error: 'Missing X-Webhook-Signature header' };
  }

  if (typeof signatureHeader !== 'string' || signatureHeader.trim() === '') {
    return { ok: false, error: 'Missing X-Webhook-Signature header' };
  }

  let sig = signatureHeader.trim();
  const eqIdx = sig.indexOf('=');
  if (eqIdx !== -1 && sig.slice(0, eqIdx).trim().match(/^[a-zA-Z0-9_-]+$/)) {
    sig = sig.slice(eqIdx + 1).trim();
  }

  sig = sig.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(sig) || sig.length % 2 !== 0) {
    return { ok: false, error: 'Invalid X-Webhook-Signature format' };
  }

  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const receivedBuf = Buffer.from(sig, 'hex');

  if (expectedBuf.length !== receivedBuf.length) {
    return { ok: false, error: 'Invalid X-Webhook-Signature' };
  }

  if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return { ok: false, error: 'Invalid X-Webhook-Signature' };
  }

  return { ok: true };
}
