// Reusable minimal DDP client for DiceCloud.
//
// Node 22+ (`meteor node` included) has a built-in WebSocket; it is wrapped in
// the small `on`/`send`/`close` interface of the `ws` package that this client
// was written against. `ws` itself left app/node_modules with the npm upgrades
// of 2026-09-30; WS_PATH still points at a copy of it if wanted.
function openSocket(url) {
  if (!process.env.WS_PATH && typeof WebSocket === 'function') {
    const socket = new WebSocket(url);
    return {
      send: data => socket.send(data),
      close: () => socket.close(),
      on(event, listener) {
        socket.addEventListener(event, e => {
          if (event === 'message') listener(e.data);
          else if (event === 'error') listener(e.error || new Error(`websocket error on ${url}`));
          else listener(e);
        });
      },
    };
  }
  const WS = require(process.env.WS_PATH || require('path').join(__dirname, '../../app/node_modules/ws'));
  return new WS(url);
}

function connect(url = 'wss://dicecloud.com/websocket') {
  const ws = openSocket(url);
  const store = {};
  const subs = new Map();
  const calls = new Map();
  let n = 0;
  const send = o => ws.send(JSON.stringify(o));

  let onConnected;
  const ready = new Promise((res, rej) => { onConnected = res; ws.on('error', rej); });

  const api = {
    store,
    ready,
    sub(name, params, timeout = 60000) {
      const id = String(++n);
      return new Promise((res, rej) => {
        subs.set(id, { res, rej, name });
        send({ msg: 'sub', id, name, params });
        setTimeout(() => { if (subs.has(id)) { subs.delete(id); rej(new Error('timeout: ' + name)); } }, timeout);
      });
    },
    call(method, params, timeout = 60000) {
      const id = String(++n);
      return new Promise((res, rej) => {
        calls.set(id, { res, rej, method });
        send({ msg: 'method', method, params, id });
        setTimeout(() => { if (calls.has(id)) { calls.delete(id); rej(new Error('timeout: ' + method)); } }, timeout);
      });
    },
    docs(coll) { return Object.values(store[coll] || {}); },
    close() { ws.close(); },
  };

  ws.on('open', () => send({ msg: 'connect', version: '1', support: ['1'] }));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    switch (m.msg) {
      case 'ping': return send({ msg: 'pong', id: m.id });
      case 'connected': return onConnected(api);
      case 'added': case 'changed': {
        const c = store[m.collection] || (store[m.collection] = {});
        const d = c[m.id] || (c[m.id] = { _id: m.id });
        Object.assign(d, m.fields || {});
        (m.cleared || []).forEach(f => delete d[f]);
        return;
      }
      case 'removed': { if (store[m.collection]) delete store[m.collection][m.id]; return; }
      case 'ready': return m.subs.forEach(i => { const p = subs.get(i); if (p) { subs.delete(i); p.res(); } });
      case 'nosub': {
        const p = subs.get(m.id);
        if (p) { subs.delete(m.id); p.rej(new Error(`${p.name}: ${m.error ? m.error.reason : 'stopped'}`)); }
        return;
      }
      case 'result': {
        const p = calls.get(m.id);
        if (p) { calls.delete(m.id); m.error ? p.rej(new Error(`${p.method}: ${m.error.reason || m.error.message}`)) : p.res(m.result); }
        return;
      }
    }
  });
  return api;
}

async function login(conn, token) {
  const r = await conn.call('login', [{ resume: token }]);
  return r;
}

module.exports = { connect, login };
