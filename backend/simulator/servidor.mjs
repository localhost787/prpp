#!/usr/bin/env node
// POR-42 · "Simulador del hospital": small server, ONLY on 127.0.0.1.
// It keeps the simulator client secret (read from the local env file) and talks to Medplum.
// The page it serves only calls this server: the secret never reaches the browser.
//
// Routes: GET / (page) · GET /estado · POST /siguiente · POST /tour (one message every 3 s)
//         POST /reiniciar (body {"confirmar": true}) · POST /alta · POST /ingreso · busy -> 409
// Usage: node simulator/servidor.mjs   (PORT env var, default 5181)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { required } from '../lib/env.mjs';
import { loginClient } from '../lib/medplum.mjs';
import { publishDischarge } from './alta.mjs';
import { sendHl7 } from './core.mjs';
import { buildMessages, todayPR } from './mensajes.mjs';
import { resetVisit } from './reiniciar.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5181);
const TOUR_DELAY_MS = 3000;
const PAGE = readFileSync(new URL('./pagina.html', import.meta.url), 'utf8');

const state = {
  busy: false,
  messages: buildMessages(todayPR()),
  sent: {}, // id -> { at, ok, msa }
  last: 'Listo.',
};

let client;
async function medplum() {
  if (!client) {
    client = await loginClient(required('SIMULATOR_CLIENT_ID'), required('SIMULATOR_CLIENT_SECRET'));
  }
  return client;
}

/** Runs `fn` with a fresh token once if the first try gets 401. */
async function withClient(fn) {
  try {
    return await fn(await medplum());
  } catch (err) {
    if (/401|Unauthorized/i.test(String(err?.message))) {
      client = undefined;
      return fn(await medplum());
    }
    throw err;
  }
}

async function send(message) {
  const r = await withClient(async (c) => {
    const res = await sendHl7(c, required('BOT_HL7_ID'), message.texto);
    if (res.status === 401) {
      throw new Error('401');
    }
    return res;
  });
  state.sent[message.id] = { at: new Date().toISOString(), ok: r.ok, msa: r.msa || `HTTP ${r.status}` };
  state.last = `${message.hora} ${message.titulo}: ${r.ok ? 'OK' : r.msa || r.status}`;
  return r;
}

const tourList = () => state.messages.filter((m) => m.tour);
const nextMessage = () => tourList().find((m) => !state.sent[m.id]?.ok);

function publicState() {
  return {
    busy: state.busy,
    last: state.last,
    events: state.messages.map((m) => ({
      id: m.id,
      hora: m.hora,
      titulo: m.titulo,
      tipo: m.tipo,
      tour: m.tour,
      enviado: !!state.sent[m.id]?.ok,
      ack: state.sent[m.id]?.msa ?? null,
    })),
  };
}

async function exclusive(res, work) {
  if (state.busy) {
    return reply(res, 409, { error: 'ocupado', ...publicState() });
  }
  state.busy = true;
  try {
    const result = await work();
    return reply(res, 200, { ok: true, result, ...publicState() });
  } catch (err) {
    state.last = `Error: ${err.message}`;
    return reply(res, 500, { error: err.message, ...publicState() });
  } finally {
    state.busy = false;
  }
}

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 10_000) {
      break;
    }
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const routes = {
  'GET /estado': (req, res) => reply(res, 200, publicState()),
  'POST /siguiente': (req, res) =>
    exclusive(res, async () => {
      const m = nextMessage();
      if (!m) {
        return 'El tour ya terminó. Use Alta, Ingreso o Reiniciar.';
      }
      return (await send(m)).msa;
    }),
  'POST /tour': (req, res) =>
    exclusive(res, async () => {
      const out = [];
      for (let m = nextMessage(); m; m = nextMessage()) {
        const r = await send(m);
        out.push(`${m.id}: ${r.msa}`);
        if (!r.ok) {
          break;
        }
        if (nextMessage()) {
          await new Promise((resolve) => setTimeout(resolve, TOUR_DELAY_MS));
        }
      }
      return out;
    }),
  'POST /alta': (req, res) =>
    exclusive(res, async () => {
      const out = await withClient((c) => publishDischarge(c));
      state.last = 'Alta publicada (recetas, cita e instrucciones, simuladas).';
      return out;
    }),
  'POST /ingreso': (req, res) =>
    exclusive(res, async () => (await send(state.messages.find((m) => m.id === 'ingreso'))).msa),
  'POST /reiniciar': async (req, res) => {
    const body = await readBody(req);
    if (body.confirmar !== true) {
      return reply(res, 400, { error: 'Reiniciar borra la visita: mande {"confirmar": true}' });
    }
    return exclusive(res, async () => {
      const deleted = await withClient((c) => resetVisit(c));
      state.sent = {};
      state.messages = buildMessages(todayPR());
      state.last = 'Visita borrada. Recargue el portal (borrar no avisa en vivo).';
      return deleted;
    });
  },
};

const server = createServer(async (req, res) => {
  // Only this machine: refuse anything that did not come from loopback.
  if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') {
    res.writeHead(403).end();
    return;
  }
  const path = new URL(req.url, `http://${HOST}`).pathname;
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(PAGE);
    return;
  }
  const route = routes[`${req.method} ${path}`];
  if (!route) {
    return reply(res, 404, { error: 'no existe' });
  }
  return route(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Simulador del hospital: http://${HOST}:${PORT}/ (solo esta máquina)`);
});
