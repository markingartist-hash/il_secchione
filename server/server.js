#!/usr/bin/env node
/*
 * Il Secchione v3.5 · server locale (HTTP + WebSocket), zero dipendenze, Node >= 8.
 *
 *   node server/server.js [--port 8765] [--open] [--data <cartella>] [--quiet]
 *
 * Rotte:  /host (solo da questo PC)  /player  /show  /network-test  /ws
 * Funziona senza Internet: serve solo che PC e tablet siano sulla stessa rete locale.
 * È isolato in questa cartella per poter essere impacchettato in futuro (exe/installer).
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var URL_ = require('url').URL;
/* pathname della richiesta senza url.parse (deprecato nelle versioni recenti di Node) */
function pathOf(reqUrl) { try { return new URL_(reqUrl || '/', 'http://localhost').pathname; } catch (e) { return null; } }
var crypto = require('crypto');
var childProcess = require('child_process');

var ws = require('./ws.js');
var Room = require('./room.js').Room;
var storeMod = require('./store.js');
var packDisk = require('./packstore-disk.js');
var netinfo = require('./netinfo.js');

var VERSION = '1.0.0-rc2a.3';
var ROOT = path.join(__dirname, '..');
var DEFAULT_PORT = 8765;

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

/* File raggiungibili da QUALSIASI dispositivo della rete. Tutto il resto solo dal PC docente (loopback). */
var PUBLIC_PAGES = { '/player': 'player.html', '/show': 'show.html', '/network-test': 'network-test.html' };
var PUBLIC_FILES = ['css/player.css', 'css/show.css', 'js/player.js', 'js/show-client.js', 'js/network-test.js'];
var PUBLIC_PREFIXES = ['assets/mascot/', 'assets/logo_clean.svg'];
var PUBLIC_PACK_IMAGES = /^packs\/[a-z0-9_-]+\/images\/[^/]+\.(jpe?g|png|webp|gif|svg)$/i;
var DENY_PREFIXES = ['data/', 'server/', 'tools/', 'tests/', 'runtime/', 'node_modules/'];
var PAGE_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'";

function arg(name, fb) {
  var i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0 ? process.argv[i + 1] : fb;
}

function isLoopback(req) {
  var a = (req.socket && req.socket.remoteAddress) || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

/* Evita DNS rebinding e connessioni da pagine estranee al server locale. */
function trustedRequest(req) {
  try {
    var host = req.headers.host;
    if (!host || /[\\/@\s]/.test(host)) return false;
    var base = new URL_('http://' + host);
    var name = base.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    var localName = require('os').hostname().toLowerCase();
    if (!require('net').isIP(name) && name !== 'localhost' && name !== localName && name !== localName + '.local') return false;
    if (req.headers.origin && req.headers.origin !== base.origin) return false;
    return true;
  } catch (e) { return false; }
}

function remoteIp(req) { return ((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, ''); }

/** Crea il server senza metterlo in ascolto (riusato dai test e dalla simulazione). */
function createServer(opts) {
  var o = opts || {};
  var dataDir = o.dataDir || path.join(ROOT, 'data');
  var log = o.quiet ? function () {} : function (m) { console.log(m); };
  var store = new storeMod.FileStore(dataDir);
  var packsDir = o.packsDir || path.join(ROOT, 'packs');
  var library = packDisk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dataDir, 'cestino_pacchetti') });
  var hostKey = o.hostKey || crypto.randomBytes(18).toString('hex');
  var clock = o.clock || Date.now;
  var room = Room.fromJSON(o.freshRoom ? null : store.loadRoom(), { clock: clock, graceMs: o.graceMs, onLog: function (e) { store.appendLog(room.sessionId, e); } });
  var port = 0;

  var hostConn = null;
  var deviceSockets = {};
  var shows = [];
  var nettests = [];
  var showCache = { stage: null, timer: null };
  var ipJoinFails = {};
  var connections = 0;

  /* ---------------- persistenza ---------------- */
  var persistTO = null;
  function persist() {
    clearTimeout(persistTO);
    persistTO = setTimeout(function () {
      try { store.saveRoom(room.toJSON()); } catch (e) { log('Avviso: salvataggio stanza non riuscito: ' + e.message); }
    }, 120);
  }
  function persistNow() {
    clearTimeout(persistTO);
    try { store.saveRoom(room.toJSON()); } catch (e) { /* ignore */ }
  }

  /* ---------------- invio messaggi ---------------- */
  function sendTo(conn, msg) { if (conn && !conn.closed) conn.sendJSON(msg); }
  function toHost(msg) { sendTo(hostConn, msg); }
  function toDevice(deviceId, msg) { (deviceSockets[deviceId] || []).forEach(function (c) { sendTo(c, msg); }); }
  function toShows(msg) { shows.forEach(function (c) { sendTo(c, msg); }); }
  function urls() {
    return netinfo.lanAddresses().map(function (a) {
      return { address: a.address, interface: a.interface, virtual: a.virtual, hotspot: a.hotspot, player: 'http://' + a.address + ':' + port + '/player', networkTest: 'http://' + a.address + ':' + port + '/network-test' };
    });
  }
  function hostRoomView() {
    return {
      pin: room.pin, joinLocked: room.joinLocked, sessionId: room.sessionId, port: port, urls: urls(),
      devices: room.devicesView(), round: room.hostRoundView(), showClients: shows.length, testClients: nettests.length,
      serverTime: clock(), version: VERSION
    };
  }
  var devicesTO = null;
  function notifyDevices() {
    clearTimeout(devicesTO);
    devicesTO = setTimeout(function () { toHost({ type: 'devices', devices: room.devicesView(), showClients: shows.length, testClients: nettests.length }); }, 80);
  }
  function roundToDevice(deviceId) {
    var d = room.devices[deviceId];
    toDevice(deviceId, { type: 'round', round: d && d.status === 'assigned' ? room.publicRoundFor(deviceId) : null });
  }
  function roundToAllDevices() { Object.keys(deviceSockets).forEach(roundToDevice); }
  function roundToHost() { toHost({ type: 'round.state', round: room.hostRoundView() }); }
  function welcome(conn, device, reconnected) {
    var p = device.participantId ? room.participants[device.participantId] : null;
    sendTo(conn, {
      type: 'welcome', deviceId: device.deviceId, label: device.label, status: device.status, reconnected: !!reconnected,
      joinToken: device.status === 'pending' ? device.joinToken : null,
      deviceToken: device.status === 'assigned' ? device.deviceToken : null,
      participant: p ? { id: p.id, name: p.name } : null,
      requestedParticipantId: device.requestedParticipantId,
      teams: room.teamsForPlayers(), joinLocked: room.joinLocked,
      round: device.status === 'assigned' ? room.publicRoundFor(device.deviceId) : null
    });
  }

  /* ---------------- HTTP ---------------- */
  function send(res, status, body, type, extra) {
    var headers = Object.assign({ 'Content-Type': type || 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }, extra || {});
    res.writeHead(status, headers);
    res.end(body);
  }
  function sendJSON(res, status, obj) { send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8'); }
  function readBody(req, limit, cb) {
    var chunks = [];
    var size = 0;
    var done = false;
    req.on('data', function (c) {
      size += c.length;
      if (size > limit && !done) { done = true; cb(new Error('troppo grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { if (!done) { done = true; cb(null, Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', function (e) { if (!done) { done = true; cb(e); } });
  }
  function readRaw(req, limit, cb) {
    var chunks = [];
    var size = 0;
    var done = false;
    req.on('data', function (c) {
      size += c.length;
      if (size > limit && !done) { done = true; cb(new Error('file troppo grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { if (!done) { done = true; cb(null, Buffer.concat(chunks)); } });
    req.on('error', function (e) { if (!done) { done = true; cb(e); } });
  }
  function isHostRequest(req) {
    return isLoopback(req) && typeof req.headers['x-secchione-host'] === 'string' && req.headers['x-secchione-host'] === hostKey;
  }
  function staticAccess(rel) {
    if (!rel || rel.split('/').some(function (s) { return !s || s.charAt(0) === '.'; })) return 'deny';
    if (DENY_PREFIXES.some(function (p) { return rel.indexOf(p) === 0; })) return 'deny';
    if (PUBLIC_FILES.indexOf(rel) >= 0 || PUBLIC_PACK_IMAGES.test(rel)) return 'public';
    if (PUBLIC_PREFIXES.some(function (p) { return rel.indexOf(p) === 0; })) return 'public';
    return 'local';
  }
  function serveFile(req, res, rel, extraHeaders, transform) {
    var file = path.join(ROOT, rel);
    if (file.indexOf(ROOT) !== 0) return send(res, 403, 'Vietato');
    fs.stat(file, function (err, st) {
      if (err || !st.isFile()) return send(res, 404, 'Non trovato');
      var ext = path.extname(file).toLowerCase();
      var type = MIME[ext] || 'application/octet-stream';
      var cache = /\.(png|jpe?g|webp|gif|svg|wav|mp3|m4a)$/.test(ext) ? 'public, max-age=3600' : 'no-store';
      if (transform) {
        fs.readFile(file, 'utf8', function (e, txt) {
          if (e) return send(res, 500, 'Errore');
          send(res, 200, transform(txt), type, Object.assign({ 'Cache-Control': 'no-store' }, extraHeaders || {}));
        });
        return;
      }
      if (PUBLIC_PACK_IMAGES.test(rel)) extraHeaders = Object.assign({ 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }, extraHeaders || {});
      res.writeHead(200, Object.assign({ 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }, extraHeaders || {}));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', function () { res.destroy(); }).pipe(res);
    });
  }
  function hostPage(txt) {
    return txt.replace('<meta name="secchione-host-key" content="">', '<meta name="secchione-host-key" content="' + hostKey + '">');
  }

  function handleApi(req, res, pathname) {
    if (pathname === '/api/ping') return sendJSON(res, 200, { ok: true, app: 'il-secchione', version: VERSION, time: clock() });
    if (pathname.indexOf('/api/host/') !== 0) return send(res, 404, 'Non trovato');
    if (!isHostRequest(req)) return sendJSON(res, 403, { ok: false, error: 'solo la regia su questo PC' });
    var what = pathname.slice('/api/host/'.length);
    if (what === 'network' && req.method === 'GET') return sendJSON(res, 200, hostRoomView());
    if (what === 'log' && req.method === 'GET') return sendJSON(res, 200, store.readLog(room.sessionId, 50000));
    if (what === 'snapshot' && req.method === 'GET') {
      var snap = store.loadSnapshot();
      return snap ? sendJSON(res, 200, snap) : send(res, 204, '');
    }
    if ((what === 'snapshot' || what === 'archive') && req.method === 'POST') {
      return readBody(req, 30 * 1024 * 1024, function (err, body) {
        if (err) return sendJSON(res, 413, { ok: false, error: err.message });
        var obj;
        try { obj = JSON.parse(body); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'JSON non valido' }); }
        if (!obj || obj.format !== 'secchione-snapshot' || !obj.session || !obj.session.sessionId) return sendJSON(res, 400, { ok: false, error: 'snapshot non valido' });
        try {
          if (what === 'archive') store.archiveSnapshot(obj); else store.saveSnapshot(body);
          sendJSON(res, 200, { ok: true });
        } catch (e) { sendJSON(res, 500, { ok: false, error: e.message }); }
      });
    }
    if (what === 'packs' || what.indexOf('packs/') === 0) return handlePacks(req, res, what.slice(5).replace(/^\//, ''));
    if (what === 'prefs' && req.method === 'GET') { var p = store.loadPrefs(); return p ? sendJSON(res, 200, p) : send(res, 204, ''); }
    if (what === 'prefs' && req.method === 'PUT') {
      return readBody(req, 30 * 1024 * 1024, function (err, body) {
        if (err) return sendJSON(res, 413, { ok: false, error: err.message });
        try { store.savePrefs(JSON.parse(body)); sendJSON(res, 200, { ok: true }); } catch (e) { sendJSON(res, 400, { ok: false, error: e.message }); }
      });
    }
    return send(res, 404, 'Non trovato');
  }

  /* ---------- Gestore Pacchetti (libreria su disco: packs/) ---------- */
  function packResult(res, p) {
    p.then(function (r) { sendJSON(res, r && r.ok === false ? 400 : 200, r); }, function (e) { sendJSON(res, 500, { ok: false, errors: [e.message] }); });
  }
  function handlePacks(req, res, rest) {
    var parts = rest ? rest.split('/') : [];
    var id = parts[0] || '';
    if (id && id !== 'import' && !/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id)) return sendJSON(res, 400, { ok: false, errors: ['id non valido'] });
    if (!id && req.method === 'GET') {
      return packResult(res, library.list().then(function (list) { return { ok: true, storage: 'disco', packs: list }; }));
    }
    if (id === 'import' && req.method === 'POST') {
      var name = String(req.headers['x-file-name'] || 'pacchetto.zip').slice(0, 200);
      try { name = decodeURIComponent(name); } catch (e) { /* nome lasciato com'è */ }
      return readRaw(req, 300 * 1048576, function (err, buf) {
        if (err) return sendJSON(res, 413, { ok: false, action: 'rejected', errors: [err.message] });
        packResult(res, library.importFile(name, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), { inflate: packDisk.inflate }));
      });
    }
    if (id && parts[1] === 'duplicate' && req.method === 'POST') {
      return readBody(req, 64 * 1024, function (err, body) {
        var opts = {};
        try { opts = body ? JSON.parse(body) : {}; } catch (e) { opts = {}; }
        packResult(res, library.duplicate(id, { newId: opts.newId, title: opts.title }));
      });
    }
    if (id && parts[1] === 'export' && req.method === 'GET') {
      return library.exportZip(id).then(function (r) {
        if (!r.ok) return sendJSON(res, 400, r);
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': r.bytes.length, 'Content-Disposition': 'attachment; filename="' + r.filename + '"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Export-Warnings': encodeURIComponent(JSON.stringify(r.warnings || [])) });
        res.end(Buffer.from(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength));
      }, function (e) { sendJSON(res, 500, { ok: false, errors: [e.message] }); });
    }
    if (id && !parts[1] && req.method === 'DELETE') return packResult(res, library.remove(id));
    // Pack Studio: salva un pacchetto (zip) come nuovo o sostituendo esplicitamente quello con lo stesso codice
    if (id && id !== 'import' && !parts[1] && req.method === 'PUT') {
      var mode = /(^|[?&])mode=replace(&|$)/.test(String((req.url || '').split('?')[1] || '')) ? 'replace' : 'new';
      return readRaw(req, 300 * 1048576, function (err, buf) {
        if (err) return sendJSON(res, 413, { ok: false, errors: [err.message] });
        packResult(res, library.save(id + '.zip', new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), { inflate: packDisk.inflate, mode: mode, expectedId: id }));
      });
    }
    return sendJSON(res, 404, { ok: false, errors: ['operazione sconosciuta'] });
  }

  function handleHttp(req, res) {
    if (!trustedRequest(req)) return send(res, 403, 'Origine non autorizzata');
    var pathname = pathOf(req.url);
    if (pathname == null) return send(res, 400, 'URL non valido');
    try { pathname = decodeURIComponent(pathname); } catch (e) { return send(res, 400, 'URL non valido'); }
    if (pathname.indexOf('\0') >= 0) return send(res, 400, 'URL non valido');
    if (pathname.indexOf('/api/') === 0) return handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Metodo non consentito');
    if (pathname === '/') {
      res.writeHead(302, { Location: isLoopback(req) ? '/host' : '/player' });
      return res.end();
    }
    if (pathname === '/studio' || pathname === '/studio.html') {
      // Pack Studio contiene domande e soluzioni: solo dal PC del docente, con la chiave della regia
      if (!isLoopback(req)) return send(res, 403, 'Pack Studio si apre solo dal PC del docente.');
      return serveFile(req, res, 'studio.html', null, hostPage);
    }
    if (pathname === '/host' || pathname === '/index.html') {
      if (!isLoopback(req)) return send(res, 403, 'La regia si apre solo dal PC del docente. Per rispondere usa /player.');
      return serveFile(req, res, 'index.html', null, hostPage);
    }
    if (PUBLIC_PAGES[pathname]) return serveFile(req, res, PUBLIC_PAGES[pathname], { 'Content-Security-Policy': PAGE_CSP });
    var rel = path.posix.normalize(pathname).replace(/^\/+/, '');
    var access = staticAccess(rel);
    if (access === 'deny') return send(res, 403, 'Vietato');
    if (access === 'local' && !isLoopback(req)) return send(res, 403, 'Disponibile solo sul PC del docente');
    return serveFile(req, res, rel);
  }

  /* ---------------- WebSocket ---------------- */
  function bucket(rate, burst) { return { tokens: burst, last: Date.now(), rate: rate, burst: burst }; }
  function allow(b) {
    var now = Date.now();
    b.tokens = Math.min(b.burst, b.tokens + (now - b.last) / 1000 * b.rate);
    b.last = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  function attachDevice(conn, device) {
    conn.meta.deviceId = device.deviceId;
    var list = deviceSockets[device.deviceId] = deviceSockets[device.deviceId] || [];
    if (list.indexOf(conn) < 0) list.push(conn);
    room.setConnected(device.deviceId, true, conn.rttMs);
  }

  function playerJoin(conn, msg) {
    var ip = conn.meta.ip;
    var fails = ipJoinFails[ip] = ipJoinFails[ip] || { n: 0, since: Date.now() };
    if (Date.now() - fails.since > 10 * 60000) { fails.n = 0; fails.since = Date.now(); }
    if (fails.n >= 30 || conn.meta.pinFails >= 6) { sendTo(conn, { type: 'join.error', reason: 'too_many_attempts' }); conn.close(1008, 'troppi tentativi'); return; }
    var r = room.join({ pin: msg.pin, deviceToken: msg.deviceToken, joinToken: msg.joinToken, userAgent: msg.userAgent });
    if (!r.ok) {
      if (r.reason === 'bad_pin') { conn.meta.pinFails = (conn.meta.pinFails || 0) + 1; fails.n++; }
      sendTo(conn, { type: 'join.error', reason: r.reason });
      return;
    }
    conn.meta.role = 'player';
    attachDevice(conn, r.device);
    welcome(conn, r.device, r.reconnected);
    notifyDevices();
    persist();
  }

  function handlePlayer(conn, msg) {
    var deviceId = conn.meta.deviceId;
    if (msg.type === 'ping') return sendTo(conn, { type: 'pong', t: msg.t, serverTime: clock() });
    if (msg.type === 'join' || msg.type === 'hello') return playerJoin(conn, msg);
    if (!deviceId || !room.devices[deviceId]) return sendTo(conn, { type: 'join.error', reason: 'not_joined' });
    if (msg.type === 'request') {
      if (room.requestParticipant(deviceId, msg.participantId == null ? null : String(msg.participantId))) { notifyDevices(); persist(); }
      return;
    }
    if (msg.type === 'answer') {
      var res = room.answer(deviceId, { roundInstanceId: msg.roundInstanceId, answer: msg.answer, deviceToken: msg.deviceToken });
      sendTo(conn, { type: 'ack', accepted: res.accepted, reason: res.reason || null, duplicate: !!res.duplicate, roundInstanceId: msg.roundInstanceId, answer: res.record ? res.record.selectedAnswer : (res.answer || null), clientMsgId: msg.clientMsgId || null });
      var d = room.devices[deviceId];
      if (res.accepted && !res.duplicate) {
        toHost({ type: 'response', record: res.record });
        // gli altri dispositivi della stessa squadra vedono la risposta bloccata
        Object.keys(room.devices).forEach(function (id) { if (id !== deviceId && room.devices[id].participantId === d.participantId) roundToDevice(id); });
        persist();
      } else if (!res.accepted) {
        toHost({ type: 'response.rejected', roundInstanceId: msg.roundInstanceId, participantId: d && d.participantId, deviceId: deviceId, answer: typeof msg.answer === 'string' ? msg.answer.slice(0, 20) : null, reason: res.reason });
      }
    }
  }

  function handleHost(conn, msg) {
    var t = msg.type;
    var changed = true;
    if (t === 'ping') { sendTo(conn, { type: 'pong', t: msg.t, serverTime: clock() }); return; }
    if (t === 'session.set') { room.setSession(String(msg.sessionId || '')); }
    else if (t === 'participants') {
      room.syncParticipants(msg.list);
      Object.keys(deviceSockets).forEach(function (id) { var d = room.devices[id]; if (d) (deviceSockets[id] || []).forEach(function (c) { welcome(c, d, true); }); });
      notifyDevices();
    } else if (t === 'join.lock') { room.setJoinLocked(!!msg.locked); toHost({ type: 'room.update', pin: room.pin, joinLocked: room.joinLocked }); }
    else if (t === 'device.assign') {
      var d = room.assign(String(msg.deviceId || ''), msg.participantId == null ? null : String(msg.participantId));
      if (d) (deviceSockets[d.deviceId] || []).forEach(function (c) { welcome(c, d, false); });
      notifyDevices();
    } else if (t === 'device.kick') {
      var k = room.kick(String(msg.deviceId || ''));
      if (k) { (deviceSockets[k.deviceId] || []).forEach(function (c) { sendTo(c, { type: 'kicked' }); c.close(1000, 'espulso'); }); delete deviceSockets[k.deviceId]; }
      notifyDevices();
    } else if (t === 'device.forget') { room.forget(String(msg.deviceId || '')); notifyDevices(); }
    else if (t === 'round.open') {
      var r = room.openRound(msg);
      if (!r.ok) { sendTo(conn, { type: 'error', code: r.reason, context: 'round.open' }); changed = false; }
      else { roundToAllDevices(); roundToHost(); }
    } else if (t === 'round.pause') { if (room.pauseRound(msg.roundInstanceId)) { roundToAllDevices(); roundToHost(); } }
    else if (t === 'round.resume') { if (room.resumeRound(msg.roundInstanceId, msg.remainingMs)) { roundToAllDevices(); roundToHost(); } }
    else if (t === 'round.addTime') { if (room.addTime(msg.roundInstanceId, msg.ms)) { roundToAllDevices(); roundToHost(); } }
    else if (t === 'round.close') { if (room.closeRound(msg.roundInstanceId, 'docente')) { roundToAllDevices(); roundToHost(); } }
    else if (t === 'round.reveal') { if (room.revealRound(msg.roundInstanceId)) { roundToAllDevices(); roundToHost(); } }
    else if (t === 'round.unlock') {
      if (room.unlock(msg.roundInstanceId, String(msg.participantId || ''))) {
        toHost({ type: 'response.voided', roundInstanceId: msg.roundInstanceId, participantId: msg.participantId });
        Object.keys(room.devices).forEach(function (id) { if (room.devices[id].participantId === msg.participantId) roundToDevice(id); });
      }
    } else if (t === 'round.commit') {
      var c = room.commit(msg);
      if (c.ok) toHost({ type: 'round.committed', roundInstanceId: msg.roundInstanceId, scoreEvents: c.scoreEvents, corrected: c.corrected });
      else sendTo(conn, { type: 'error', code: c.reason, context: 'round.commit' });
    } else if (t === 'round.uncommit') { room.uncommit(msg.roundInstanceId); }
    else if (t === 'show.stage') {
      if (typeof msg.html === 'string' && msg.html.length < 2000000) { showCache.stage = { type: 'stage', html: msg.html, meta: msg.meta || {} }; toShows(showCache.stage); }
      changed = false;
    } else if (t === 'show.timer') { showCache.timer = { type: 'timer', timer: msg.timer || {}, sentAt: clock() }; toShows(showCache.timer); changed = false; }
    else if (t === 'show.transition') { toShows({ type: 'transition', data: msg.data || {} }); changed = false; }
    else changed = false;
    if (changed) persist();
  }

  function onConnection(conn, req) {
    connections++;
    conn.meta = { role: null, ip: remoteIp(req), loopback: isLoopback(req), bucket: bucket(10, 30) };
    var helloTO = setTimeout(function () { if (!conn.meta.role) conn.close(1008, 'hello mancante'); }, 15000);
    conn.on('pong', function (rtt) {
      if (conn.meta.deviceId && room.devices[conn.meta.deviceId]) {
        var d = room.devices[conn.meta.deviceId];
        var prev = d.rttMs;
        room.setConnected(conn.meta.deviceId, true, rtt);
        if (prev == null || Math.abs(prev - rtt) > 15) notifyDevices();
      }
    });
    conn.on('message', function (text) {
      if (conn.meta.role !== 'host' && conn.meta.role !== 'show' && !allow(conn.meta.bucket)) {
        conn.meta.drops = (conn.meta.drops || 0) + 1;
        if (conn.meta.drops === 1 || conn.meta.drops % 20 === 0) sendTo(conn, { type: 'error', code: 'rate_limited' });
        if (conn.meta.drops > 200) conn.close(1008, 'troppi messaggi');
        return;
      }
      var msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'hello' && conn.meta.role) {
        // Il Player può rinnovare il proprio token; SHOW/HOST non cambiano ruolo.
        if (conn.meta.role !== 'player' || (msg.role && msg.role !== 'player')) return;
      }
      if (!conn.meta.role || msg.type === 'hello') {
        if (msg.type !== 'hello' && msg.type !== 'join') return;
        var role = msg.role || 'player';
        if (role === 'host') {
          if (!conn.meta.loopback || msg.hostKey !== hostKey) { sendTo(conn, { type: 'error', code: 'bad_host_key' }); conn.close(1008, 'regia non autorizzata'); return; }
          if (hostConn && hostConn !== conn) { sendTo(hostConn, { type: 'error', code: 'replaced' }); hostConn.close(1000, 'regia aperta altrove'); }
          hostConn = conn;
          conn.meta.role = 'host';
          clearTimeout(helloTO);
          if (msg.sessionId) room.setSession(String(msg.sessionId));
          if (Array.isArray(msg.participants)) room.syncParticipants(msg.participants);
          sendTo(conn, { type: 'room.state', room: hostRoomView() });
          persist();
          return;
        }
        if (role === 'show') { conn.meta.role = 'show'; clearTimeout(helloTO); shows.push(conn); if (showCache.stage) sendTo(conn, showCache.stage); if (showCache.timer) sendTo(conn, showCache.timer); notifyDevices(); toHost({ type: 'show.request' }); return; }
        if (role === 'nettest') { conn.meta.role = 'nettest'; clearTimeout(helloTO); nettests.push(conn); sendTo(conn, { type: 'nettest.ok', serverTime: clock(), version: VERSION }); notifyDevices(); return; }
        if (!conn.meta.playerBucketSet) {
          conn.meta.bucket = bucket(8, 15);
          conn.meta.playerBucketSet = true;
        }
        playerJoin(conn, msg);
        if (conn.meta.role === 'player') clearTimeout(helloTO);
        return;
      }
      if (conn.meta.role === 'host') return handleHost(conn, msg);
      if (conn.meta.role === 'player') return handlePlayer(conn, msg);
      if (conn.meta.role === 'nettest' && msg.type === 'ping') return sendTo(conn, { type: 'pong', t: msg.t, serverTime: clock() });
    });
    conn.on('close', function () {
      connections--;
      clearTimeout(helloTO);
      if (hostConn === conn) hostConn = null;
      shows = shows.filter(function (c) { return c !== conn; });
      nettests = nettests.filter(function (c) { return c !== conn; });
      var id = conn.meta.deviceId;
      if (id && deviceSockets[id]) {
        deviceSockets[id] = deviceSockets[id].filter(function (c) { return c !== conn; });
        if (!deviceSockets[id].length) { delete deviceSockets[id]; room.setConnected(id, false); persist(); }
      }
      notifyDevices();
    });
  }

  var server = http.createServer(handleHttp);
  server.on('upgrade', function (req, socket, head) {
    var pathname = pathOf(req.url);
    if (!trustedRequest(req) || pathname !== '/ws' || connections >= 400) { socket.destroy(); return; }
    var conn = ws.handleUpgrade(req, socket, head, { maxPayload: isLoopback(req) ? 4 * 1024 * 1024 : 8 * 1024 });
    if (conn) onConnection(conn, req);
  });
  server.on('clientError', function (err, socket) { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (e) { /* ignore */ } });

  var tickTimer = setInterval(function () {
    if (room.tick()) { roundToAllDevices(); roundToHost(); persist(); }
  }, 200);
  var pingTimer = setInterval(function () {
    var all = [hostConn].concat(shows, nettests);
    Object.keys(deviceSockets).forEach(function (id) { all = all.concat(deviceSockets[id]); });
    all.forEach(function (c) {
      if (!c || c.closed) return;
      if (!c.isAlive && c.lastPingAt && Date.now() - c.lastPingAt > 14000) { c.terminate(); return; }
      if (c.isAlive) { c.lastPingAt = Date.now(); c.ping(); }
    });
  }, o.pingIntervalMs || 5000);

  function close(cb) {
    clearInterval(tickTimer);
    clearInterval(pingTimer);
    persistNow();
    var all = [hostConn].concat(shows, nettests);
    Object.keys(deviceSockets).forEach(function (id) { all = all.concat(deviceSockets[id]); });
    all.forEach(function (c) { if (c) c.terminate(); });
    server.close(function () { if (cb) cb(); });
  }

  return {
    server: server,
    room: room,
    store: store,
    library: library,
    hostKey: hostKey,
    close: close,
    listen: function (p, host, cb) {
      /* A failed listen (EADDRINUSE) must not leave its callback queued for a later retry. */
      function onListening() {
        server.removeListener('error', onAttemptError);
        port = server.address().port;
        try { storeMod.writeJSONAtomic(path.join(dataDir, 'runtime.json'), { port: port, hostKey: hostKey, pid: process.pid, startedAt: new Date().toISOString(), version: VERSION }); } catch (e) { /* ignore */ }
        if (cb) cb(port);
      }
      function onAttemptError() { server.removeListener('listening', onListening); }
      server.once('listening', onListening);
      server.once('error', onAttemptError);
      server.listen(p, host);
    },
    get port() { return port; },
    urls: urls
  };
}

/* ---------------- avvio da riga di comando ---------------- */
function openBrowser(url) {
  var cmd = process.platform === 'win32' ? 'start "" "' + url + '"' : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
  childProcess.exec(cmd, function () { /* ignora errori: l'indirizzo è comunque stampato */ });
}

function checkExisting(port, cb) {
  var req = http.get({ host: '127.0.0.1', port: port, path: '/api/ping', timeout: 1500 }, function (res) {
    var body = '';
    res.on('data', function (c) { body += c; });
    res.on('end', function () {
      try { var info = JSON.parse(body); cb(info && info.app === 'il-secchione' ? info : null); }
      catch (e) { cb(null); }
    });
  });
  req.on('error', function () { cb(null); });
  req.on('timeout', function () { req.destroy(); cb(null); });
}

function rebuildPacksIfNeeded() {
  try {
    var bp = require('../tools/build_packs.js');
    if (bp.bundleIsStale()) {
      var c = bp.build();
      console.log('Pack aggiornati: ' + c.report.map(function (r) { return r.dir + (r.ok ? ' OK' : ' ERRORE'); }).join(', '));
      c.report.filter(function (r) { return !r.ok; }).forEach(function (r) { console.log('  ' + r.dir + ': ' + r.errors.slice(0, 3).join(' · ')); });
    }
  } catch (e) {
    console.log('Avviso: impossibile ricostruire i pack (' + e.message + '). Uso il bundle esistente.');
  }
}

function main() {
  var port = Number(arg('--port', process.env.SECCHIONE_PORT || DEFAULT_PORT)) || DEFAULT_PORT;
  var wantOpen = process.argv.indexOf('--open') > 0 && !process.env.SECCHIONE_NO_OPEN;
  var dataDir = path.resolve(arg('--data', path.join(ROOT, 'data')));
  var fallbackAttempts = 0;
  try {
    var migrated = packDisk.diskLibrary({}).disk.migrate();
    if (migrated.length) console.log('Libreria pacchetti: registrati ' + migrated.join(', '));
  } catch (e) { console.log('Avviso: migrazione della libreria non riuscita (' + e.message + ')'); }
  rebuildPacksIfNeeded();
  var app = createServer({ dataDir: dataDir });

  function onListening(p) {
    var list = app.urls();
    var mainUrl = list[0];
    var line = new Array(64).join('=');
    console.log('\n' + line);
    console.log('  IL SECCHIONE v' + VERSION + ' CLASSROOM · server locale attivo (Node ' + process.version + ')');
    console.log(line);
    console.log('  Regia (solo su questo PC):  http://localhost:' + p + '/host');
    if (mainUrl) {
      console.log('  Pulsantiere (tablet):       ' + mainUrl.player + '    PIN: ' + app.room.pin);
      console.log('  Test della rete:            ' + mainUrl.networkTest);
      list.slice(1).forEach(function (a) { console.log('    altro indirizzo:          ' + a.player + (a.virtual ? '  (adattatore virtuale)' : '') + (a.hotspot ? '  (hotspot Windows)' : '')); });
    } else {
      console.log('  Nessuna rete locale trovata: i tablet non possono collegarsi.');
      console.log('  Collega il PC al Wi-Fi o attiva l\'hotspot. La modalità manuale funziona comunque.');
    }
    console.log('');
    console.log('  NON CHIUDERE questa finestra durante la lezione.');
    console.log('  Per spegnere il server: chiudi la finestra oppure premi Ctrl+C.');
    console.log(line + '\n');
    if (wantOpen) openBrowser('http://localhost:' + p + '/host');
  }
  function listenHere(p) { port = p; app.listen(port, '0.0.0.0', onListening); }

  app.server.on('error', function (e) {
    if (e.code === 'EADDRINUSE') {
      checkExisting(port, function (existing) {
        if (existing && existing.version === VERSION) {
          console.log('Il Secchione v' + VERSION + ' è già in esecuzione sulla porta ' + port + ': apro quella regia.');
          if (wantOpen) openBrowser('http://localhost:' + port + '/host');
          setTimeout(function () { process.exit(0); }, 600);
          return;
        }
        if (existing && fallbackAttempts < 10) {
          var occupied = port, oldVersion = existing.version || 'sconosciuta';
          fallbackAttempts += 1;
          console.log('\nATTENZIONE: sulla porta ' + occupied + ' è ancora aperto Il Secchione v' + oldVersion + '.');
          console.log('Non apro la vecchia versione. Avvio v' + VERSION + ' sulla porta ' + (occupied + 1) + '.');
          listenHere(occupied + 1);
          return;
        }
        console.log('\nERRORE: la porta ' + port + ' è occupata da un altro programma.');
        console.log("Chiudi l'altro programma (oppure riavvia il computer) e fai di nuovo doppio clic su AVVIA_IL_SECCHIONE.\n");
        process.exit(2);
      });
      return;
    }
    console.log('ERRORE del server: ' + e.message);
    process.exit(1);
  });
  listenHere(port);
  function shutdown() { console.log('\nSalvataggio e chiusura…'); app.close(function () { process.exit(0); }); setTimeout(function () { process.exit(0); }, 1500); }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();

module.exports = { createServer: createServer, VERSION: VERSION, staticAccessForTest: null };
