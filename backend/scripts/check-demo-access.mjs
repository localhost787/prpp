#!/usr/bin/env node
// POR-51 · demo accesible: checks, from any machine, that a browser on another origin (the public
// portal, e.g. a Vercel URL) can use the Medplum API: HTTPS with a valid certificate, CORS preflight
// allowed for that origin, and the WebSocket upgrade for subscriptions (API-11, API-28).
// No login, no secrets: only public endpoints and OPTIONS / upgrade requests.
// Usage: node scripts/check-demo-access.mjs [baseUrl] [origin]
//   baseUrl defaults to MEDPLUM_BASE_URL from the local env file; origin to https://example.vercel.app
import { request } from 'node:https';
import { randomBytes } from 'node:crypto';
import { env } from '../lib/env.mjs';

const base = (process.argv[2] ?? env.MEDPLUM_BASE_URL ?? '').replace(/\/?$/, '/');
const origin = process.argv[3] ?? 'https://example.vercel.app';
if (!base.startsWith('https://')) {
  console.log(`FAIL base URL must be https:// (got "${base}")`);
  process.exit(1);
}

let failures = 0;
function report(ok, name, detail) {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    const { ok, detail } = await fn();
    report(ok, name, detail);
  } catch (err) {
    // fetch() rejects an invalid/expired/self-signed certificate: that lands here.
    report(false, name, String(err?.cause?.code ?? err?.cause?.message ?? err.message));
  }
}

// 1. HTTPS with a certificate Node trusts (default CA store, verification on).
await check('HTTPS con certificado válido (GET healthcheck)', async () => {
  const res = await fetch(`${base}healthcheck`);
  const body = await res.json();
  return { ok: res.ok && body.ok === true, detail: `${res.status}, Medplum ${body.version}` };
});

// 2. Certificate details (issuer and days left), through a raw TLS socket.
await check('certificado vigente al menos 7 días más', () => {
  return new Promise((resolve, reject) => {
    const req = request(`${base}healthcheck`, { method: 'HEAD' }, (res) => {
      const cert = res.socket.getPeerCertificate();
      const days = Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000);
      res.resume();
      resolve({ ok: res.socket.authorized && days >= 7, detail: `emisor ${cert.issuer?.O ?? '?'} ${cert.issuer?.CN ?? ''}, vence en ${days} días` });
    });
    req.on('error', reject);
    req.end();
  });
});

// 3. CORS preflight like the browser sends it before a FHIR request with a token.
async function preflight(path, method, headers) {
  const res = await fetch(`${base}${path}`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers },
  });
  const allowOrigin = res.headers.get('access-control-allow-origin');
  const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  const allowMethods = (res.headers.get('access-control-allow-methods') ?? '').toUpperCase();
  const ok =
    res.status < 300 &&
    (allowOrigin === origin || allowOrigin === '*') &&
    headers.split(',').every((h) => allowHeaders === '*' || allowHeaders.includes(h.trim())) &&
    (allowMethods === '*' || allowMethods.includes(method));
  return { ok, detail: `${res.status}, allow-origin=${allowOrigin}, allow-headers=${allowHeaders}` };
}
await check(`CORS preflight POST fhir/R4/Patient desde ${origin}`, () =>
  preflight('fhir/R4/Patient', 'POST', 'authorization,content-type')
);
await check(`CORS preflight POST auth/login desde ${origin}`, () => preflight('auth/login', 'POST', 'content-type'));
await check(`CORS preflight POST oauth2/token desde ${origin}`, () => preflight('oauth2/token', 'POST', 'content-type'));

// 4. Simple CORS request: the real response also carries the allow-origin header.
// (healthcheck is outside the CORS middleware, so use FHIR metadata and an unauthenticated auth/me.)
for (const path of ['fhir/R4/metadata', 'auth/me']) {
  await check(`respuesta GET ${path} con Access-Control-Allow-Origin`, async () => {
    const res = await fetch(`${base}${path}`, { headers: { Origin: origin } });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    return { ok: allowOrigin === origin || allowOrigin === '*', detail: `${res.status}, allow-origin=${allowOrigin}` };
  });
}

// 5. WebSocket upgrade on ws/subscriptions-r4 (the SDK opens it for useSubscription).
await check('WebSocket ws/subscriptions-r4 -> 101 Switching Protocols', () => {
  return new Promise((resolve, reject) => {
    const req = request(`${base}ws/subscriptions-r4`, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        Origin: origin,
      },
      timeout: 10000,
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({ ok: res.statusCode === 101, detail: `${res.statusCode} ${res.headers.upgrade ?? ''}` });
    });
    req.on('response', (res) => {
      res.resume();
      resolve({ ok: false, detail: `${res.statusCode} (sin upgrade)` });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
});

// 6. Plain HTTP is not served as-is (redirects to HTTPS or refused).
await check('HTTP sin cifrar redirige a HTTPS o no responde', async () => {
  const http = base.replace(/^https:/, 'http:');
  try {
    const res = await fetch(`${http}healthcheck`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const location = res.headers.get('location') ?? '';
    return { ok: res.status >= 300 && res.status < 400 && location.startsWith('https://'), detail: `${res.status} -> ${location}` };
  } catch (err) {
    return { ok: true, detail: `sin respuesta por HTTP (${err?.cause?.code ?? err.name})` };
  }
});

console.log(`\n${failures ? 'FAIL' : 'PASS'} ${failures} check(s) failed · base ${base} · origin ${origin}`);
process.exit(failures ? 1 : 0);
