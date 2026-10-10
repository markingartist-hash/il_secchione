'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib');
var test = require('./harness').test;
var H = require('./helpers');
var Z = require('../js/lib/zip');
var disk = require('../server/packstore-disk');
var Room = require('../server/room').Room;

test('P0: token Unicode non termina join o answer', function () {
  var room = new Room();
  room.syncParticipants([{ id: 't1', name: 'Uno' }]);
  var d = room.join({ pin: room.pin }).device;
  room.assign(d.deviceId, 't1');
  assert.doesNotThrow(function () { room.join({ deviceToken: 'é'.repeat(32) }); });
  assert.doesNotThrow(function () { room.join({ joinToken: 'é'.repeat(32) }); });
  assert.strictEqual(room.join({ deviceToken: d.deviceToken }).device.deviceId, d.deviceId);
});

test('P0: token Unicode via WebSocket rifiutato, server ancora operativo', async function () {
  var app = await H.startServer();
  try {
    await H.classroom(app, 1);
    var p = await H.ws.open(app.wsUrl);
    p.sendJSON({ type: 'hello', role: 'player', deviceToken: 'é'.repeat(32) });
    await p.waitFor(function (m) { return m.type === 'join.error'; }, 2000, true);
    assert.strictEqual((await H.get(app.base + '/api/ping')).status, 200);
  } finally { if (p) p.destroy(); await H.stopServer(app); }
});

test('P1: limite DEFLATE durante decompressione (browser e Node)', function () {
  var plain = Buffer.alloc(1024 * 1024, 65);
  var comp = zlib.deflateRawSync(plain);
  [Z.inflateRaw, disk.inflate].forEach(function (inflate) {
    assert.throws(function () { inflate(comp, 1); }, /limite|larger|size|length/i);
    assert.throws(function () { inflate(comp, 0); }, /limite|larger|size|length/i);
    assert.deepStrictEqual(Buffer.from(inflate(comp, plain.length)), plain);
    assert.strictEqual(inflate(zlib.deflateRawSync(Buffer.alloc(0)), 0).length, 0);
  });
});

test('P1: ZIP con dimensione contraffatta bloccato prima del CRC', function () {
  var comp = zlib.deflateRawSync(Buffer.alloc(1024 * 1024, 65));
  var bytes = Buffer.from(Z.zip([{ name: 'test.json', data: comp }]));
  var cd = bytes.readUInt32LE(bytes.length - 6);
  bytes.writeUInt16LE(8, 8); bytes.writeUInt32LE(1, 22);
  bytes.writeUInt16LE(8, cd + 10); bytes.writeUInt32LE(1, cd + 24);
  [Z.inflateRaw, disk.inflate].forEach(function (inflate) {
    assert.throws(function () { Z.unzip(bytes, { maxTotal: 1024, inflate: inflate }); }, /limite|larger|size|length/i);
  });
});

function playerVM() {
  var nodes = {};
  ['app', 'netBar', 'fsBtn'].forEach(function (id) { nodes[id] = { innerHTML: '', addEventListener: function () {} }; });
  var ctx = {
    document: { getElementById: function (id) { return nodes[id] || null; }, addEventListener: function () {}, documentElement: {}, activeElement: null },
    navigator: {}, location: { search: '', protocol: 'http:', host: 'localhost' },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, console: console
  };
  var code = fs.readFileSync(path.join(__dirname, '../js/player.js'), 'utf8');
  ctx.window = ctx;
  code = code.replace(/\}\)\(\);\s*$/, 'window.testAPI = {st:st,setRound:setRound,onAck:onAck,submit:submit};})();');
  vm.runInNewContext(code, ctx);
  ctx.testAPI.st.connected = true;
  ctx.testAPI.st.phase = 'team';
  ctx.testAPI.st.ws = { readyState: 1, send: function () {} };
  ctx.testAPI.html = function () { return nodes.app.innerHTML; };
  return ctx.testAPI;
}

['mcq', 'text'].forEach(function (layout) {
  test('P1: INVIA si riattiva al secondo round ' + layout + ' anche con ACK vecchio', function () {
    var p = playerVM();
    p.setRound({ roundInstanceId: 'round-one', layout: layout, letters: ['A','B','C','D'], status: 'open' });
    p.st.selection = 'C'; p.st.textBuf = 'ROMA'; p.submit();
    assert.strictEqual(p.st.sending, true);
    p.setRound({ roundInstanceId: 'round-two', layout: layout, letters: ['A','B','C','D'], status: 'open' });
    p.onAck({ roundInstanceId: 'round-one', accepted: true, answer: 'C' });
    assert.strictEqual(p.st.sending, false);
    assert.strictEqual(p.st.pendingSend, null);
    p.st.selection = 'A'; p.st.textBuf = 'CESARE'; p.submit();
    assert.strictEqual(p.st.pendingSend.roundInstanceId, 'round-two');
    p.onAck({ roundInstanceId: 'round-two', accepted: true, answer: layout === 'text' ? 'CESARE' : 'A' });
    assert.ok(p.html().indexOf('RISPOSTA REGISTRATA') >= 0);
  });
});

test('P1: retry del round corrente conservato; reset senza round pulisce invio', function () {
  var p = playerVM();
  var r = { roundInstanceId: 'round-one', layout: 'mcq', letters: ['A','B','C','D'], status: 'open' };
  p.setRound(r); p.st.selection = 'C'; p.submit();
  p.setRound(r);
  assert.strictEqual(p.st.pendingSend.answer, 'C');
  p.setRound(null);
  assert.strictEqual(p.st.sending, false);
  assert.strictEqual(p.st.pendingSend, null);
});

test('P1: Host estraneo e Origin cross-site rifiutati, locale consentito', async function () {
  var app = await H.startServer();
  try {
    var foreign = await H.get(app.base + '/host', { headers: { Host: 'foreign.example:' + app.port } });
    assert.strictEqual(foreign.status, 403);
    assert.ok(foreign.body.indexOf(app.hostKey) < 0);
    assert.strictEqual((await H.get(app.base + '/player', { headers: { Origin: 'https://foreign.example' } })).status, 403);
    assert.strictEqual((await H.get(app.base + '/host', { headers: { Origin: app.base } })).status, 200);
    assert.strictEqual((await H.get(app.base + '/host', { headers: { Host: 'localhost:' + app.port } })).status, 200);
    await new Promise(function (resolve, reject) {
      var req = require('http').request(app.base + '/ws', { headers: {
        Connection:'Upgrade', Upgrade:'websocket', 'Sec-WebSocket-Key':Buffer.alloc(16).toString('base64'),
        'Sec-WebSocket-Version':'13', Origin:'https://foreign.example'
      } });
      req.on('upgrade', function (res, socket) { socket.destroy(); reject(Error('upgrade cross-site accettato')); });
      req.on('error', function (e) { if (e.code === 'ECONNRESET') resolve(); else reject(e); });
      req.end();
    });
  } finally { await H.stopServer(app); }
});

test('P1: hello SHOW ripetuto non duplica schermi o cambia ruolo', async function () {
  var app = await H.startServer();
  try {
    var c = await H.classroom(app, 1);
    var show = await H.ws.open(app.wsUrl);
    for (var i = 0; i < 50; i++) show.sendJSON({ type: 'hello', role: 'show' });
    await c.host.waitFor(function (m) { return m.type === 'devices' && m.showClients === 1; }, 2000, true);
    show.sendJSON({ type: 'hello', role: 'host', hostKey: app.hostKey });
    await H.wait(50);
    var room = JSON.parse((await H.get(app.base + '/api/host/network', { headers: { 'X-Secchione-Host': app.hostKey } })).body);
    assert.strictEqual(room.showClients, 1);
    assert.strictEqual(show.messages.some(function (m) { return m.type === 'room.state'; }), false);
  } finally { await H.stopServer(app); }
});

test('P1: errore stream statico interrompe solo la richiesta', async function () {
  var app = await H.startServer();
  var real = fs.createReadStream;
  try {
    fs.createReadStream = function () {
      var r = new (require('stream').Readable)({ read: function () {} });
      process.nextTick(function () { r.destroy(new Error('file rimosso durante la lettura')); });
      return r;
    };
    await assert.rejects(H.get(app.base + '/player'));
    fs.createReadStream = real;
    assert.strictEqual((await H.get(app.base + '/api/ping')).status, 200);
  } finally { fs.createReadStream = real; await H.stopServer(app); }
});

test('P1: hello Player falliti non azzerano il limite di frequenza', async function () {
  var app = await H.startServer(), p;
  try {
    p = await H.ws.open(app.wsUrl);
    for (var i=0; i<40; i++) p.sendJSON({type:'hello',role:'player',deviceToken:'scaduto'});
    await p.waitFor(function (m) { return m.type === 'error' && m.code === 'rate_limited'; }, 2000, true);
    assert.strictEqual((await H.get(app.base + '/api/ping')).status, 200);
  } finally { if (p) p.destroy(); await H.stopServer(app); }
});

test('P1: migrazione conserva le sorgenti che non riesce a importare', async function () {
  var code = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  var fn = code.slice(code.indexOf('async function migrateLegacyImported()'), code.indexOf('\nfunction mixedGuard'));
  var saved, ctx = { legacyImported: [{id:'ok'}, {id:'ko'}, {id:'offline'}],
    PKC: { importBytes: function (name) { if (name === 'offline.json') return Promise.reject(Error('offline')); return Promise.resolve({ok: name === 'ok.json', id: 'ok'}); } },
    window: { SecchioneZip: Z }, savePrefs: function () { saved = ctx.legacyImported; },
    refreshLibrary: function () {}, setTimeout: function () {}, console: { warn: function () {} }
  };
  vm.runInNewContext(fn + '\nthis.run=migrateLegacyImported;', ctx);
  await ctx.run();
  assert.deepStrictEqual(Array.from(saved, function (s) { return s.id; }), ['ko','offline']);
});

test('Player: nessun correct/explanation/domanda MCQ prima o dopo reveal', function () {
  var room = new Room(); room.syncParticipants([{id:'t',name:'Uno'}]);
  var d = room.join({pin:room.pin}).device; room.assign(d.deviceId,'t');
  room.openRound({roundInstanceId:'privacy-0001', layout:'mcq', correct:'C', question:'TESTO RISERVATO', explanation:'SPIEGAZIONE RISERVATA', letters:['A','B','C','D']});
  [false,true].forEach(function (reveal) {
    if (reveal) room.revealRound('privacy-0001');
    var str = JSON.stringify(room.publicRoundFor(d.deviceId));
    ['"correct":','"explanation":','TESTO RISERVATO','SPIEGAZIONE RISERVATA'].forEach(function (s) { assert.strictEqual(str.indexOf(s),-1); });
  });
});
