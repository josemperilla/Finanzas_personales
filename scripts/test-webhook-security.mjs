#!/usr/bin/env node
// test-webhook-security.mjs
//
// Integration test harness for the security-critical paths of apps_script/webhook.gs.
// GAS code runs outside Node (it's not unit-testable in isolation — see TODOS.md
// "P1 — Tests de integración para webhook.gs"), so this hits the REAL deployed
// endpoint over HTTP and asserts on the JSON contract, the same way a client would.
//
// ⚠️ HONESTY NOTE: this script was authored and self-tested against a local mock
// server that reproduces the response shapes read directly from webhook.gs (see
// `--self-test` below). It has NOT been run against a real GAS deployment — this
// sandbox has neither credentials nor network egress to script.google.com. Before
// trusting the "live" results, a human with access to the deployment must run it
// for real (see README below and the PR description).
//
// ── Safety model ─────────────────────────────────────────────────────────────
// Tests are split into three groups:
//   SAFE         — read-only or rejected-before-any-mutation. Safe to run against
//                  production at any time with just WEBHOOK_EXEC_URL + WEBHOOK_SECRET.
//   ADMIN        — creates a disposable throwaway user via createInvite, exercises
//                  setupPin/revokeInvite/generateEmergencyPin against it, and DELETES
//                  it again at the end (best-effort cleanup in a finally block).
//                  Requires ADMIN_TOKEN + RUN_DESTRUCTIVE=1.
//   RATE_LIMIT   — deliberately trips per-user / per-code rate limits. This WILL lock
//                  out the target user/code for up to 1h. Requires TEST_USER_ID +
//                  RUN_DESTRUCTIVE=1.
//   GLOBAL_RATE_LIMIT — trips the GLOBAL redeemInvite rate limit (30/h shared by ALL
//                  users of the deployment). Gated separately behind
//                  RUN_GLOBAL_RATE_LIMIT_TEST=1 because it has a blast radius beyond
//                  the test's own target.
//
// ── Env vars ─────────────────────────────────────────────────────────────────
//   WEBHOOK_EXEC_URL     (required) Base URL of the /exec deployment, no query string.
//                        e.g. https://script.google.com/macros/s/AKfycb.../exec
//   WEBHOOK_SECRET       (required) Value of WEBHOOK_SECRET in Script Properties
//                        (the "shortcut" channel secret — see webhook.gs _checkSecret).
//   WEB_SECRET           (optional) Value of WEB_SECRET, to also exercise the "web"
//                        channel branch of _checkSecret.
//   ADMIN_USER_ID        (optional, default "jose") userId of the admin account.
//   ADMIN_TOKEN          (optional) A valid session token for ADMIN_USER_ID. Obtain by
//                        calling validatePin once with the real PIN and reusing the
//                        returned token (tokens live 6h in CacheService). Needed for
//                        the ADMIN test group.
//   TEST_USER_ID         (optional) A DISPOSABLE, non-production userId already
//                        provisioned (via createUser/createInvite) specifically for
//                        this harness. NEVER point this at "jose"/"dani" or any real
//                        account — the RATE_LIMIT group WILL lock its login for 1h.
//   RUN_DESTRUCTIVE      ("1" to enable) Gates the ADMIN and RATE_LIMIT groups. Off by
//                        default so a plain `node scripts/test-webhook-security.mjs`
//                        with just the base creds is always safe against production.
//   RUN_GLOBAL_RATE_LIMIT_TEST ("1" to enable) Separately gates the global 30/h
//                        redeemInvite rate-limit test — see warning above.
//
// ── Usage ────────────────────────────────────────────────────────────────────
//   WEBHOOK_EXEC_URL=https://script.google.com/macros/s/XXX/exec \
//   WEBHOOK_SECRET=xxx \
//   node scripts/test-webhook-security.mjs
//
//   # self-test the harness logic against a local mock (no real endpoint needed):
//   node scripts/test-webhook-security.mjs --self-test
//
// Exits 1 if any attempted test fails (for future CI use once a staging deployment
// exists — see PR body for why this isn't wired into ci.yml yet).

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');

// ── tiny test runner ──────────────────────────────────────────────────────────
const results = []; // { name, group, status: 'pass'|'fail'|'skip', detail }

function record(name, group, status, detail) {
  results.push({ name, group, status, detail });
  const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '○';
  console.log(`  ${icon} [${group}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function runTest(name, group, fn) {
  try {
    await fn();
    record(name, group, 'pass');
  } catch (err) {
    record(name, group, 'fail', err.message);
  }
}

function skip(name, group, reason) {
  record(name, group, 'skip', reason);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function makeClient(baseUrl) {
  return async function callWebhook(body) {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`respuesta no-JSON (status ${res.status}): ${text.slice(0, 200)}`);
    }
  };
}

// ── SAFE test group — no auth/test-user required beyond base creds ────────────
async function runSafeGroup(call, { webhookSecret, webSecret }) {
  const G = 'SAFE';
  const probeUser = '__probe_' + randomUUID().slice(0, 8);

  await runTest('checkSecret: falta _secret → Unauthorized', G, async () => {
    const r = await call({ type: 'hasPin', userId: probeUser });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
  });

  await runTest('checkSecret: _secret incorrecto → Unauthorized', G, async () => {
    const r = await call({ type: 'hasPin', userId: probeUser, _secret: 'not-the-secret-' + randomUUID() });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
  });

  await runTest('checkSecret: WEBHOOK_SECRET válido → canal shortcut aceptado', G, async () => {
    const r = await call({ type: 'hasPin', userId: probeUser, _secret: webhookSecret });
    assert(r.ok === true, `esperaba ok:true, recibí ${JSON.stringify(r)}`);
    assert(r.exists === false, `usuario probe no debería existir, recibí exists=${r.exists}`);
  });

  if (webSecret) {
    await runTest('checkSecret: WEB_SECRET válido → canal web aceptado', G, async () => {
      const r = await call({ type: 'hasPin', userId: probeUser, _secret: webSecret });
      assert(r.ok === true, `esperaba ok:true, recibí ${JSON.stringify(r)}`);
    });
  } else {
    skip('checkSecret: WEB_SECRET válido → canal web aceptado', G, 'WEB_SECRET no configurado');
  }

  await runTest('validateToken: token inexistente → Unauthorized', G, async () => {
    const r = await call({ type: 'validateToken', token: 'not-a-real-token-' + randomUUID(), _secret: webhookSecret });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
  });

  await runTest('validateToken: sin token → Unauthorized', G, async () => {
    const r = await call({ type: 'validateToken', _secret: webhookSecret });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
  });

  await runTest('_validateUserId (vía validatePin): usuario inexistente no expone la lista de usuarios', G, async () => {
    const r = await call({ type: 'validatePin', userId: probeUser, pin: '0000', _secret: webhookSecret });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
    assert(
      r.error === 'userId inválido o no registrado',
      `mensaje de error debe ser genérico, recibí: ${JSON.stringify(r.error)}`
    );
  });

  await runTest('_validateUserId (vía setupPin): PIN con formato válido pero usuario inexistente → rechazado sin exponer estado', G, async () => {
    const r = await call({ type: 'setupPin', userId: probeUser, pin: '1234', _secret: webhookSecret });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
    assert(
      r.error === 'userId inválido o no registrado',
      `mensaje de error debe ser genérico, recibí: ${JSON.stringify(r.error)}`
    );
  });

  await runTest('setupPin: PIN con formato inválido rechazado antes de tocar el usuario', G, async () => {
    const r = await call({ type: 'setupPin', userId: probeUser, pin: '12', _secret: webhookSecret });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
    assert(/4-6/.test(r.error || ''), `mensaje debería mencionar 4-6 dígitos, recibí: ${JSON.stringify(r.error)}`);
  });

  await runTest('redeemInvite: código faltante → error', G, async () => {
    const r = await call({ type: 'redeemInvite', _secret: webhookSecret });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
    assert(r.error === 'Código requerido', `recibí: ${JSON.stringify(r.error)}`);
  });

  await runTest('redeemInvite: código inexistente → inválido/expirado (no revela si existió)', G, async () => {
    const bogusCode = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const r = await call({ type: 'redeemInvite', code: bogusCode, _secret: webhookSecret });
    assert(r.ok === false, `esperaba ok:false, recibí ${JSON.stringify(r)}`);
    assert(r.error === 'Código inválido o expirado', `recibí: ${JSON.stringify(r.error)}`);
  });
}

// ── RATE_LIMIT group — trips per-user / per-code limits, requires opt-in ──────
async function runRateLimitGroup(call, { webhookSecret, testUserId }) {
  const G = 'RATE_LIMIT';

  await runTest(
    'validatePin: bloquea tras 20 intentos fallidos/hora (anti fuerza-bruta)',
    G,
    async () => {
      let lastMsg = null;
      for (let i = 0; i < 21; i++) {
        const r = await call({ type: 'validatePin', userId: testUserId, pin: '000000', _secret: webhookSecret });
        lastMsg = r.error;
        if (i < 20) {
          assert(
            r.ok === false && r.error === 'PIN incorrecto',
            `intento ${i + 1}: esperaba "PIN incorrecto", recibí ${JSON.stringify(r)}`
          );
        }
      }
      assert(
        lastMsg === 'Demasiados intentos. Intenta mas tarde.' || /Demasiados intentos/i.test(lastMsg || ''),
        `intento 21 debía estar rate-limited, recibí: ${JSON.stringify(lastMsg)}`
      );
    }
  );

  await runTest(
    'redeemInvite: bloquea tras 8 intentos/hora sobre el mismo código',
    G,
    async () => {
      const code = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
      let lastMsg = null;
      for (let i = 0; i < 9; i++) {
        const r = await call({ type: 'redeemInvite', code, _secret: webhookSecret });
        lastMsg = r.error;
      }
      assert(/Demasiados intentos/i.test(lastMsg || ''), `intento 9 debía estar rate-limited, recibí: ${JSON.stringify(lastMsg)}`);
    }
  );
}

// ── GLOBAL_RATE_LIMIT — trips the 30/h global redeemInvite limit ──────────────
async function runGlobalRateLimitGroup(call, { webhookSecret }) {
  const G = 'GLOBAL_RATE_LIMIT';
  await runTest('redeemInvite: bloquea globalmente tras 30 intentos/hora (TODOS los códigos)', G, async () => {
    let lastMsg = null;
    for (let i = 0; i < 31; i++) {
      const code = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
      const r = await call({ type: 'redeemInvite', code, _secret: webhookSecret });
      lastMsg = r.error;
    }
    assert(/Demasiados intentos/i.test(lastMsg || ''), `intento 31 debía estar rate-limited, recibí: ${JSON.stringify(lastMsg)}`);
  });
}

// ── ADMIN group — disposable user roundtrip, requires ADMIN_TOKEN ─────────────
async function runAdminGroup(call, { webhookSecret, adminToken }) {
  const G = 'ADMIN';
  const displayName = 'Test Harness ' + randomUUID().slice(0, 6);
  let createdUserId = null;

  try {
    await runTest('createInvite + setupPin + revokeInvite: no borra usuario con PIN ya fijado', G, async () => {
      const inv = await call({ type: 'createInvite', displayName, token: adminToken, _secret: webhookSecret });
      assert(inv.ok === true, `createInvite falló: ${JSON.stringify(inv)}`);
      createdUserId = inv.userId;

      const setup = await call({ type: 'setupPin', userId: createdUserId, pin: '135790', code: inv.code, _secret: webhookSecret });
      assert(setup.ok === true, `setupPin falló: ${JSON.stringify(setup)}`);

      const revoke = await call({ type: 'revokeInvite', code: inv.code, token: adminToken, _secret: webhookSecret });
      assert(revoke.ok === true, `revokeInvite falló: ${JSON.stringify(revoke)}`);
      assert(
        revoke.userDeleted === false,
        `usuario con PIN ya fijado NO debía borrarse, recibí userDeleted=${revoke.userDeleted}`
      );

      const stillThere = await call({ type: 'hasPin', userId: createdUserId, _secret: webhookSecret });
      assert(stillThere.exists === true, `el usuario debía seguir existiendo con su PIN, recibí ${JSON.stringify(stillThere)}`);
    });

    await runTest('generateEmergencyPin: código de un solo uso, expira a 24h', G, async () => {
      assert(createdUserId, 'requiere que el test anterior haya creado un usuario');
      const gen = await call({ type: 'generateEmergencyPin', targetId: createdUserId, token: adminToken, _secret: webhookSecret });
      assert(gen.ok === true, `generateEmergencyPin falló: ${JSON.stringify(gen)}`);
      assert(/^\d{6}$/.test(gen.code || ''), `código debía ser 6 dígitos, recibí ${JSON.stringify(gen.code)}`);
      const expiresInMs = new Date(gen.expiresAt).getTime() - Date.now();
      assert(
        expiresInMs > 23.5 * 3600 * 1000 && expiresInMs < 24.5 * 3600 * 1000,
        `expiresAt debía ser ~24h, fue ${Math.round(expiresInMs / 3600000)}h`
      );

      const firstUse = await call({ type: 'validatePin', userId: createdUserId, pin: gen.code, _secret: webhookSecret });
      assert(firstUse.ok === true && firstUse.emergency === true, `primer uso del PIN de emergencia debía aceptarse: ${JSON.stringify(firstUse)}`);

      const secondUse = await call({ type: 'validatePin', userId: createdUserId, pin: gen.code, _secret: webhookSecret });
      assert(secondUse.ok === false, `el PIN de emergencia es de un solo uso, segundo intento debía fallar: ${JSON.stringify(secondUse)}`);
    });
  } finally {
    // Best-effort cleanup: el plan de Sheets tiene un límite de 10 usuarios (ver
    // webhook.gs), así que es importante no dejar basura de cada corrida.
    if (createdUserId) {
      try {
        const del = await call({ type: 'deleteUser', targetId: createdUserId, deleteData: true, token: adminToken, _secret: webhookSecret });
        if (!del.ok) console.warn(`  ⚠ cleanup: no se pudo borrar ${createdUserId}: ${JSON.stringify(del)}`);
      } catch (err) {
        console.warn(`  ⚠ cleanup: no se pudo borrar ${createdUserId}: ${err.message}`);
      }
    }
  }
}

// ── Self-test: mock server reproducing the documented response shapes ─────────
// Lets us verify the harness's own request/assertion logic without a live GAS
// deployment. Mirrors ONLY the branches exercised by the SAFE group — it is not a
// reimplementation of webhook.gs, just enough to catch bugs in this script.
function startMockServer() {
  const SECRET = 'mock-secret';
  const invites = {};
  const pinAttempts = {};

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let payload = {};
      try {
        payload = JSON.parse(body || '{}');
      } catch {}
      const secret = payload._secret;
      const reply = (obj) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (secret !== SECRET) return reply({ ok: false, error: 'Unauthorized' });

      const type = payload.type;
      if (type === 'hasPin') {
        return reply({ ok: true, exists: false });
      }
      if (type === 'validateToken') {
        return reply({ ok: false, error: 'Unauthorized' });
      }
      if (type === 'validatePin') {
        const uid = (payload.userId || '').toLowerCase();
        if (!/^[a-z0-9]+$/.test(uid) || uid.startsWith('__probe_')) {
          return reply({ ok: false, error: 'userId inválido o no registrado' });
        }
        const key = uid;
        pinAttempts[key] = (pinAttempts[key] || 0) + 1;
        if (pinAttempts[key] > 20) return reply({ ok: false, error: 'Demasiados intentos. Intenta mas tarde.' });
        return reply({ ok: false, error: 'PIN incorrecto' });
      }
      if (type === 'setupPin') {
        const pin = String(payload.pin || '');
        if (!/^\d{4,6}$/.test(pin)) return reply({ ok: false, error: 'PIN debe tener 4-6 digitos' });
        return reply({ ok: false, error: 'userId inválido o no registrado' });
      }
      if (type === 'redeemInvite') {
        if (!payload.code) return reply({ ok: false, error: 'Código requerido' });
        const codeKey = payload.code;
        invites[codeKey] = (invites[codeKey] || 0) + 1;
        if (invites[codeKey] > 8) return reply({ ok: false, error: 'Demasiados intentos. Intenta más tarde.' });
        return reply({ ok: false, error: 'Código inválido o expirado' });
      }
      return reply({ ok: false, error: 'unknown type in mock: ' + type });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, secret: SECRET, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function selfTest() {
  console.log('── self-test: corriendo el harness contra un mock local (no es webhook.gs real) ──\n');
  const { server, secret, url } = await startMockServer();
  const call = makeClient(url);
  await runSafeGroup(call, { webhookSecret: secret, webSecret: null });
  // El mock también soporta suficiente de validatePin/redeemInvite para probar la
  // lógica de rate-limit del harness mismo.
  await runRateLimitGroup(call, { webhookSecret: secret, testUserId: 'selftestuser' });
  server.close();
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (SELF_TEST) {
    await selfTest();
  } else {
    const execUrl = process.env.WEBHOOK_EXEC_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const webSecret = process.env.WEB_SECRET || null;
    const adminUserId = process.env.ADMIN_USER_ID || 'jose';
    const adminToken = process.env.ADMIN_TOKEN || null;
    const testUserId = process.env.TEST_USER_ID || null;
    const runDestructive = process.env.RUN_DESTRUCTIVE === '1';
    const runGlobalRateLimit = process.env.RUN_GLOBAL_RATE_LIMIT_TEST === '1';

    if (!execUrl || !webhookSecret) {
      console.error(
        'Faltan WEBHOOK_EXEC_URL y/o WEBHOOK_SECRET. Ver el encabezado de este archivo para\n' +
        'la lista completa de variables, o corre `node scripts/test-webhook-security.mjs --self-test`\n' +
        'para validar la lógica del harness sin un deployment real.'
      );
      process.exit(2);
    }

    const call = makeClient(execUrl);

    console.log(`── SAFE (contra ${execUrl}) ──`);
    await runSafeGroup(call, { webhookSecret, webSecret });

    console.log('\n── RATE_LIMIT ──');
    if (runDestructive && testUserId) {
      await runRateLimitGroup(call, { webhookSecret, testUserId });
    } else {
      skip('validatePin: bloquea tras 20 intentos fallidos/hora', 'RATE_LIMIT', 'requiere TEST_USER_ID + RUN_DESTRUCTIVE=1');
      skip('redeemInvite: bloquea tras 8 intentos/hora sobre el mismo código', 'RATE_LIMIT', 'requiere RUN_DESTRUCTIVE=1');
    }

    console.log('\n── GLOBAL_RATE_LIMIT ──');
    if (runGlobalRateLimit) {
      await runGlobalRateLimitGroup(call, { webhookSecret });
    } else {
      skip('redeemInvite: bloquea globalmente tras 30 intentos/hora', 'GLOBAL_RATE_LIMIT', 'requiere RUN_GLOBAL_RATE_LIMIT_TEST=1 (bloquea redenciones para TODOS)');
    }

    console.log('\n── ADMIN ──');
    if (runDestructive && adminToken) {
      await runAdminGroup(call, { webhookSecret, adminToken });
    } else {
      skip('createInvite + setupPin + revokeInvite: no borra usuario con PIN ya fijado', 'ADMIN', 'requiere ADMIN_TOKEN + RUN_DESTRUCTIVE=1');
      skip('generateEmergencyPin: código de un solo uso, expira a 24h', 'ADMIN', 'requiere ADMIN_TOKEN + RUN_DESTRUCTIVE=1');
    }
    void adminUserId; // reservado para futuras pruebas que necesiten distinguir admin de no-admin
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  console.log(`\n${pass} pasaron, ${fail} fallaron, ${skipped} omitidas.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Error fatal en el harness:', err);
  process.exit(1);
});
