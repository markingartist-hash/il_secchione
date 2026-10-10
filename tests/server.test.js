'use strict';
var assert = require('assert');
var test = require('./harness.js').test;
var H = require('./helpers.js');
var netinfo = require('../server/netinfo.js');

test('HTTP: pagine pubbliche, regia solo dal PC, cartelle riservate vietate', async function () {
  var app = await H.startServer();
  try {
    assert.strictEqual((await H.get(app.base + '/player')).status, 200);
    assert.strictEqual((await H.get(app.base + '/network-test')).status, 200);
    assert.strictEqual((await H.get(app.base + '/show')).status, 200);
    var host = await H.get(app.base + '/host');
    assert.strictEqual(host.status, 200);
    assert.ok(host.body.indexOf('content="' + app.hostKey + '"') > 0, 'chiave regia iniettata');
    assert.strictEqual((await H.get(app.base + '/data/room.json')).status, 403);
    assert.strictEqual((await H.get(app.base + '/server/server.js')).status, 403);
    assert.strictEqual((await H.get(app.base + '/tests/run.js')).status, 403);
    assert.strictEqual((await H.get(app.base + '/../../Windows/win.ini')).status !== 200, true);
    assert.strictEqual((await H.get(app.base + '/%2e%2e/%2e%2e/secret')).status !== 200, true);
    assert.strictEqual((await H.get(app.base + '/api/host/network')).status, 403, 'API regia senza chiave');
    assert.strictEqual((await H.get(app.base + '/api/host/network', { headers: { 'X-Secchione-Host': app.hostKey } })).status, 200);
    assert.strictEqual(JSON.parse((await H.get(app.base + '/api/ping')).body).app, 'il-secchione');
  } finally { await H.stopServer(app); }
});

test('HTTP da un altro dispositivo: niente regia, niente domande né soluzioni', async function () {
  var lan = netinfo.lanAddresses()[0];
  if (!lan) { console.log('    (saltato: nessun indirizzo LAN su questo PC)'); return; }
  var app = await H.startServer();
  try {
    var base = 'http://' + lan.address + ':' + app.port;
    var o = { localAddress: lan.address };
    assert.strictEqual((await H.get(base + '/player', o)).status, 200);
    assert.strictEqual((await H.get(base + '/js/player.js', o)).status, 200);
    assert.strictEqual((await H.get(base + '/packs/arte_romana/images/colosseo.jpg', o)).status, 200);
    assert.strictEqual((await H.get(base + '/host', o)).status, 403);
    assert.strictEqual((await H.get(base + '/packs/packs.bundle.js', o)).status, 403, 'la banca domande non è raggiungibile');
    assert.strictEqual((await H.get(base + '/packs/arte_romana/questions.json', o)).status, 403);
    assert.strictEqual((await H.get(base + '/SOLUZIONI_DOCENTE.html', o)).status, 403);
    assert.strictEqual((await H.get(base + '/js/app.js', o)).status, 403);
    var c = await H.ws.open('ws://' + lan.address + ':' + app.port + '/ws', o);
    c.sendJSON({ type: 'hello', role: 'host', hostKey: app.hostKey });
    var err = await c.waitFor(function (m) { return m.type === 'error'; }, 2000, true);
    assert.strictEqual(err.code, 'bad_host_key', 'la regia non si collega da un altro dispositivo, neanche con la chiave');
  } finally { await H.stopServer(app); }
});

test('flusso completo: join, assegnazione, round, risposte, reveal, commit', async function () {
  var app = await H.startServer();
  try {
    var c = await H.classroom(app, 3);
    var host = c.host;
    var p = c.players;
    host.sendJSON({ type: 'round.open', roundInstanceId: 'rnd-00000001', questionId: 'rom001', number: 1, total: 72, layout: 'mcq', letters: ['A', 'B', 'C', 'D'], correct: 'B', durationMs: 20000 });
    var rounds = await Promise.all(p.map(function (pl) { return pl.waitFor(function (m) { return m.type === 'round' && m.round && m.round.status === 'open'; }, 3000, true); }));
    rounds.forEach(function (m) {
      var json = JSON.stringify(m);
      assert.ok(json.indexOf('"correct"') < 0, 'la soluzione non viene inviata: ' + json);
      assert.ok(json.indexOf('rom001') < 0, 'nessun riferimento alla domanda');
    });
    p[0].sendJSON({ type: 'answer', roundInstanceId: 'rnd-00000001', answer: 'B', deviceToken: p[0].deviceToken });
    p[1].sendJSON({ type: 'answer', roundInstanceId: 'rnd-00000001', answer: 'C', deviceToken: p[1].deviceToken });
    var ack0 = await p[0].waitFor(function (m) { return m.type === 'ack'; }, 3000, true);
    assert.strictEqual(ack0.accepted, true);
    var r0 = await host.waitFor(function (m) { return m.type === 'response' && m.record.participantId === 'team-0'; }, 3000, true);
    assert.strictEqual(r0.record.outcome, 'correct');
    assert.strictEqual(typeof r0.record.responseTimeMs, 'number');
    // doppio INVIA con risposta diversa
    p[1].sendJSON({ type: 'answer', roundInstanceId: 'rnd-00000001', answer: 'A', deviceToken: p[1].deviceToken });
    var acks1 = [];
    // fromStart: la prima conferma può essere già arrivata prima che il test si metta in ascolto
    await p[1].waitFor(function (m) { if (m.type === 'ack') acks1.push(m); return acks1.length >= 2; }, 3000, true);
    assert.strictEqual(acks1[1].accepted, false);
    assert.strictEqual(acks1[1].reason, 'already_answered');
    // token falso
    p[2].sendJSON({ type: 'answer', roundInstanceId: 'rnd-00000001', answer: 'B', deviceToken: 'nope' });
    var bad = await p[2].waitFor(function (m) { return m.type === 'ack'; }, 3000, true);
    assert.strictEqual(bad.reason, 'invalid_token');
    // chiusura e reveal
    host.sendJSON({ type: 'round.reveal', roundInstanceId: 'rnd-00000001' });
    var rv = await p[0].waitFor(function (m) { return m.type === 'round' && m.round && m.round.revealed; }, 3000);
    assert.strictEqual(rv.round.myOutcome, 'correct');
    var rv2 = await p[2].waitFor(function (m) { return m.type === 'round' && m.round && m.round.revealed; }, 3000, true);
    assert.strictEqual(rv2.round.myOutcome, 'omitted');
    // risposta dopo la chiusura
    p[2].sendJSON({ type: 'answer', roundInstanceId: 'rnd-00000001', answer: 'B', deviceToken: p[2].deviceToken });
    var late = await p[2].waitFor(function (m) { return m.type === 'ack' && m.reason !== 'invalid_token'; }, 3000);
    assert.strictEqual(late.reason, 'round_closed');
    // commit
    host.sendJSON({ type: 'round.commit', roundInstanceId: 'rnd-00000001', profileId: 'show_standard', records: [
      Object.assign({}, r0.record),
      { participantId: 'team-1', inputMode: 'tablet', selectedAnswer: 'C', correctAnswer: 'B', outcome: 'wrong', order: 1001 },
      { participantId: 'team-2', inputMode: 'tablet', auto: true, selectedAnswer: null, correctAnswer: 'B', outcome: 'omitted', order: 1002 }
    ] });
    var cm = await host.waitFor(function (m) { return m.type === 'round.committed'; }, 3000, true);
    var pts = {};
    cm.scoreEvents.forEach(function (e) { pts[e.participantId] = e.points; });
    assert.deepStrictEqual(pts, { 'team-0': 300, 'team-1': -50, 'team-2': 0 });
    // round vecchio dopo un nuovo round
    host.sendJSON({ type: 'round.open', roundInstanceId: 'rnd-00000002', layout: 'mcq', correct: 'A', durationMs: 20000 });
    await p[0].waitFor(function (m) { return m.type === 'round' && m.round && m.round.roundInstanceId === 'rnd-00000002'; }, 3000);
    p[0].sendJSON({ type: 'answer', roundInstanceId: 'rnd-00000001', answer: 'A', deviceToken: p[0].deviceToken });
    var stale = await p[0].waitFor(function (m) { return m.type === 'ack' && m.roundInstanceId === 'rnd-00000001' && !m.accepted; }, 3000);
    assert.strictEqual(stale.reason, 'stale_round');
    c.players.forEach(function (x) { x.close(); });
    host.close();
  } finally { await H.stopServer(app); }
});

test('riconnessione: refresh del tablet → "riconnesso come", nessuna squadra duplicata; ingressi chiusi', async function () {
  var app = await H.startServer();
  try {
    var c = await H.classroom(app, 2);
    c.host.sendJSON({ type: 'join.lock', locked: true });
    await c.host.waitFor(function (m) { return m.type === 'room.update'; }, 2000);
    var token = c.players[0].deviceToken;
    c.players[0].destroy();
    await H.wait(100);
    var again = await H.ws.open(app.wsUrl);
    again.sendJSON({ type: 'hello', role: 'player', deviceToken: token });
    var w = await again.waitFor(function (m) { return m.type === 'welcome'; }, 3000, true);
    assert.strictEqual(w.reconnected, true);
    assert.strictEqual(w.participant.name, 'S1');
    assert.strictEqual(Object.keys(app.room.devices).length, 2, 'nessun dispositivo duplicato');
    var stranger = await H.ws.open(app.wsUrl);
    stranger.sendJSON({ type: 'hello', role: 'player', pin: c.pin });
    var e = await stranger.waitFor(function (m) { return m.type === 'join.error'; }, 3000, true);
    assert.strictEqual(e.reason, 'locked');
    var wrong = await H.ws.open(app.wsUrl);
    wrong.sendJSON({ type: 'hello', role: 'player', pin: '0000' === c.pin ? '1111' : '0000' });
    assert.strictEqual((await wrong.waitFor(function (m) { return m.type === 'join.error'; }, 3000, true)).reason, 'bad_pin');
    [again, stranger, wrong, c.players[1], c.host].forEach(function (x) { x.close(); });
  } finally { await H.stopServer(app); }
});

test('persistenza server: salva, chiudi, riapri, riprendi (stesso PIN, stessi token)', async function () {
  var app = await H.startServer();
  var dataDir = app.dataDir;
  var c = await H.classroom(app, 2);
  c.host.sendJSON({ type: 'round.open', roundInstanceId: 'rnd-persist-01', layout: 'mcq', correct: 'A', durationMs: 60000 });
  await c.players[0].waitFor(function (m) { return m.type === 'round' && m.round && m.round.status === 'open'; }, 3000, true);
  c.players[0].sendJSON({ type: 'answer', roundInstanceId: 'rnd-persist-01', answer: 'A', deviceToken: c.players[0].deviceToken });
  await c.players[0].waitFor(function (m) { return m.type === 'ack'; }, 3000, true);
  var token1 = c.players[1].deviceToken;
  var pin = c.pin;
  await H.wait(250);
  await H.stopServer(app, true);
  var app2 = await H.startServer({ dataDir: dataDir });
  try {
    assert.strictEqual(app2.room.pin, pin);
    assert.strictEqual(app2.room.round.status, 'paused');
    assert.strictEqual(app2.room.responses.length, 1, 'la risposta già data non si perde');
    var p = await H.ws.open(app2.wsUrl);
    p.sendJSON({ type: 'hello', role: 'player', deviceToken: token1 });
    var w = await p.waitFor(function (m) { return m.type === 'welcome'; }, 3000, true);
    assert.strictEqual(w.status, 'assigned');
    assert.strictEqual(w.round.status, 'paused');
    var host = await H.ws.open(app2.wsUrl);
    host.sendJSON({ type: 'hello', role: 'host', hostKey: app2.hostKey, sessionId: 'sess-test' });
    var rs = await host.waitFor(function (m) { return m.type === 'room.state'; }, 3000, true);
    assert.strictEqual(rs.room.round.responses.length, 1);
    host.sendJSON({ type: 'round.resume', roundInstanceId: 'rnd-persist-01' });
    await p.waitFor(function (m) { return m.type === 'round' && m.round && m.round.status === 'open'; }, 3000);
    p.sendJSON({ type: 'answer', roundInstanceId: 'rnd-persist-01', answer: 'B', deviceToken: token1 });
    assert.strictEqual((await p.waitFor(function (m) { return m.type === 'ack'; }, 3000, true)).accepted, true);
    p.close(); host.close();
  } finally { await H.stopServer(app2); }
});

test('snapshot della regia su disco: POST, GET, archivio', async function () {
  var app = await H.startServer();
  try {
    var hdr = { 'X-Secchione-Host': app.hostKey, 'Content-Type': 'application/json' };
    var snap = { format: 'secchione-snapshot', version: 1, savedAt: new Date().toISOString(), session: { format: 'secchione-session', sessionId: 'abc-123', status: 'active', participants: [{ id: 'x', name: 'A' }], responses: [], scoreEvents: [] } };
    assert.strictEqual((await H.get(app.base + '/api/host/snapshot', { method: 'POST', headers: hdr, body: JSON.stringify(snap) })).status, 200);
    var back = await H.get(app.base + '/api/host/snapshot', { headers: hdr });
    assert.strictEqual(JSON.parse(back.body).session.sessionId, 'abc-123');
    assert.strictEqual((await H.get(app.base + '/api/host/snapshot', { method: 'POST', headers: hdr, body: '{"format":"altro"}' })).status, 400);
    assert.strictEqual((await H.get(app.base + '/api/host/archive', { method: 'POST', headers: hdr, body: JSON.stringify(snap) })).status, 200);
    assert.strictEqual((await H.get(app.base + '/api/host/snapshot', { headers: hdr })).status, 204, 'dopo l\'archiviazione non c\'è più una partita in corso');
  } finally { await H.stopServer(app); }
});

test('limite di frequenza: un client che inonda il server viene frenato', async function () {
  var app = await H.startServer();
  try {
    var p = await H.ws.open(app.wsUrl);
    p.sendJSON({ type: 'hello', role: 'player', pin: app.room.pin });
    await p.waitFor(function (m) { return m.type === 'welcome'; }, 3000, true);
    for (var i = 0; i < 60; i++) p.sendJSON({ type: 'ping', t: i });
    var limited = await p.waitFor(function (m) { return m.type === 'error' && m.code === 'rate_limited'; }, 3000, true);
    assert.ok(limited);
    p.close();
  } finally { await H.stopServer(app); }
});
