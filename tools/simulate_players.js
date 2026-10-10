#!/usr/bin/env node
/*
 * Simulazione multiplayer: regia + N pulsantiere simulate sul server reale (HTTP + WebSocket).
 *
 *   node tools/simulate_players.js                 scenari 2, 6, 15, 30 su un server temporaneo
 *   node tools/simulate_players.js --sizes 30 --rounds 10
 *   node tools/simulate_players.js --external      usa il server già avviato (data/runtime.json)
 *
 * Per ogni scenario: join → assegnazione → chiusura ingressi → domanda aperta → risposte quasi
 * contemporanee (con doppi tocchi) → reveal → commit → domanda successiva → disconnessione e
 * riconnessione di una parte dei tablet. Verifica: nessuna risposta persa, nessun duplicato,
 * una sola registrazione per squadra, punteggi coerenti.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var H = require('../tests/helpers.js');
var ws = require('./ws_client.js');
var Scoring = require('../js/engine/scoring.js');

function arg(name, fb) { var i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fb; }
var SIZES = String(arg('--sizes', '2,6,15,30')).split(',').map(Number).filter(Boolean);
var ROUNDS = Number(arg('--rounds', 5)) || 5;
var EXTERNAL = process.argv.indexOf('--external') > 0;

function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pct(arr, p) { if (!arr.length) return null; var s = arr.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

async function scenario(app, n) {
  var problems = [];
  var t0 = Date.now();
  var c = await H.classroom(app, n);
  var host = c.host;
  var players = c.players;
  host.sendJSON({ type: 'join.lock', locked: true });
  await host.waitFor(function (m) { return m.type === 'room.update'; }, 3000);
  var ackTimes = [];
  var letters = ['A', 'B', 'C', 'D'];
  var totals = {};
  for (var r = 1; r <= ROUNDS; r++) {
    var rid = 'sim-' + n + '-' + Date.now().toString(36) + '-' + r;
    var correct = letters[rnd(0, 3)];
    var responses = {};
    var dupResponses = 0;
    var onResp = function (m) {
      if (!m || m.type !== 'response' || m.record.roundInstanceId !== rid) return;
      if (responses[m.record.participantId]) dupResponses++;
      responses[m.record.participantId] = m.record;
    };
    host.on('message', onResp);
    host.sendJSON({ type: 'round.open', roundInstanceId: rid, number: r, total: ROUNDS, layout: 'mcq', letters: letters, correct: correct, durationMs: 30000 });
    await Promise.all(players.map(function (p) { return p.waitFor(function (m) { return m.type === 'round' && m.round && m.round.roundInstanceId === rid && m.round.status === 'open'; }, 5000, false); }));
    // risposte quasi contemporanee; ~20% fa un doppio tocco su INVIA
    var acks = await Promise.all(players.map(function (p, i) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var answer = Math.random() < 0.55 ? correct : letters[rnd(0, 3)];
          var sentAt = Date.now();
          var mine = [];
          var onAck = function (m) {
            if (!m || m.type !== 'ack' || m.roundInstanceId !== rid) return;
            mine.push(m);
            if (mine.length === 1) ackTimes.push(Date.now() - sentAt);
            if (mine.length >= p.expected) { p.removeListener('message', onAck); resolve({ i: i, answer: answer, acks: mine }); }
          };
          p.expected = Math.random() < 0.2 ? 2 : 1;
          p.on('message', onAck);
          for (var k = 0; k < p.expected; k++) p.sendJSON({ type: 'answer', roundInstanceId: rid, answer: answer, deviceToken: p.deviceToken });
          setTimeout(function () { if (mine.length < p.expected) { p.removeListener('message', onAck); resolve({ i: i, answer: answer, acks: mine, timeout: true }); } }, 5000);
        }, rnd(0, 60));
      });
    }));
    acks.forEach(function (a) {
      if (a.timeout) problems.push('round ' + r + ': ack mancante per S' + (a.i + 1));
      if (!a.acks.length || !a.acks[0].accepted) problems.push('round ' + r + ': risposta di S' + (a.i + 1) + ' non accettata (' + (a.acks[0] && a.acks[0].reason) + ')');
      if (a.acks[1] && !(a.acks[1].accepted && a.acks[1].duplicate)) problems.push('round ' + r + ': doppio tocco non idempotente per S' + (a.i + 1));
    });
    var waitUntil = Date.now() + 3000;
    while (Object.keys(responses).length < n && Date.now() < waitUntil) await H.wait(20);
    host.removeListener('message', onResp);
    if (Object.keys(responses).length !== n) problems.push('round ' + r + ': la regia ha ricevuto ' + Object.keys(responses).length + '/' + n + ' risposte');
    if (dupResponses) problems.push('round ' + r + ': ' + dupResponses + ' risposte duplicate verso la regia');
    var stored = app.room ? app.room.responses.filter(function (x) { return x.roundInstanceId === rid && !x.voided; }).length : n;
    if (stored !== n) problems.push('round ' + r + ': il server ha registrato ' + stored + ' risposte invece di ' + n);
    acks.forEach(function (a) {
      var rec = responses[c.teams[a.i].id];
      if (rec && rec.selectedAnswer !== a.answer) problems.push('round ' + r + ': risposta di S' + (a.i + 1) + ' alterata');
    });
    host.sendJSON({ type: 'round.reveal', roundInstanceId: rid });
    await Promise.all(players.map(function (p) { return p.waitFor(function (m) { return m.type === 'round' && m.round && m.round.roundInstanceId === rid && m.round.revealed; }, 5000, false); }));
    var ordered = Object.keys(responses).map(function (k) { return responses[k]; }).sort(function (a, b) { return a.seq - b.seq; });
    host.sendJSON({ type: 'round.commit', roundInstanceId: rid, profileId: 'show_standard', records: ordered });
    var cm = await host.waitFor(function (m) { return m.type === 'round.committed' && m.roundInstanceId === rid; }, 5000);
    if (cm.scoreEvents.length !== n) problems.push('round ' + r + ': ' + cm.scoreEvents.length + ' eventi di punteggio invece di ' + n);
    var expectedRows = Scoring.scoreRound(ordered, 'show_standard', { standingScores: totals });
    var expectedById = {}; expectedRows.forEach(function (e) { expectedById[e.participantId] = e.points; });
    ordered.forEach(function (rec) {
      var expected = expectedById[rec.participantId];
      var ev = cm.scoreEvents.filter(function (e) { return e.participantId === rec.participantId; })[0];
      if (!ev || ev.points !== expected) problems.push('round ' + r + ': punti errati per ' + rec.participantId + ' (atteso ' + expected + ', ricevuto ' + (ev && ev.points) + ')');
      totals[rec.participantId] = (totals[rec.participantId] || 0) + (ev ? ev.points : 0);
    });
    // disconnessione e riconnessione di una parte dei tablet (circa 1 su 4) a metà partita
    if (r === Math.ceil(ROUNDS / 2)) {
      var drop = players.filter(function (_, i) { return i % 4 === 0; });
      for (var d = 0; d < drop.length; d++) {
        var old = drop[d];
        old.destroy();
        await H.wait(rnd(20, 120));
        var again = await ws.open(app.wsUrl);
        again.sendJSON({ type: 'hello', role: 'player', deviceToken: old.deviceToken });
        var w = await again.waitFor(function (m) { return m.type === 'welcome'; }, 5000, true);
        if (!w.reconnected || !w.participant || w.participant.id !== old.team.id) problems.push('riconnessione errata per ' + old.team.name);
        again.deviceId = old.deviceId; again.deviceToken = old.deviceToken; again.team = old.team;
        players[players.indexOf(old)] = again;
      }
      // un intruso senza token a ingressi chiusi
      var intruder = await ws.open(app.wsUrl);
      intruder.sendJSON({ type: 'hello', role: 'player', pin: c.pin });
      var e = await intruder.waitFor(function (m) { return m.type === 'join.error' || m.type === 'welcome'; }, 3000, true);
      if (e.type !== 'join.error' || e.reason !== 'locked') problems.push('un nuovo dispositivo è entrato a ingressi chiusi');
      intruder.close();
    }
  }
  var devicesNow = app.room ? Object.keys(app.room.devices).length : n;
  if (devicesNow !== n) problems.push('dispositivi registrati: ' + devicesNow + ' invece di ' + n + ' (duplicati?)');
  players.forEach(function (p) { p.close(); });
  host.close();
  return { n: n, rounds: ROUNDS, ms: Date.now() - t0, problems: problems, ackMedian: pct(ackTimes, 0.5), ackP95: pct(ackTimes, 0.95), ackMax: ackTimes.length ? Math.max.apply(null, ackTimes) : null, answers: ackTimes.length };
}

async function main() {
  var results = [];
  for (var i = 0; i < SIZES.length; i++) {
    var app;
    if (EXTERNAL) {
      var rt = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime.json'), 'utf8'));
      app = { hostKey: rt.hostKey, wsUrl: 'ws://127.0.0.1:' + rt.port + '/ws', room: null };
    } else {
      app = await H.startServer({ freshRoom: true });
    }
    try {
      var res = await scenario(app, SIZES[i]);
      results.push(res);
      console.log((res.problems.length ? '✗ ' : '✓ ') + String(res.n).padStart(2) + ' pulsantiere · ' + res.rounds + ' domande · ' + res.answers + ' risposte · ack mediana ' + res.ackMedian + ' ms, 95° perc. ' + res.ackP95 + ' ms, max ' + res.ackMax + ' ms · ' + res.ms + ' ms totali');
      res.problems.slice(0, 10).forEach(function (p) { console.log('    - ' + p); });
    } catch (e) {
      results.push({ n: SIZES[i], problems: [e.message] });
      console.log('✗ ' + SIZES[i] + ' pulsantiere: ' + e.message);
    } finally {
      if (!EXTERNAL) await H.stopServer(app);
    }
  }
  var failed = results.filter(function (r) { return r.problems.length; }).length;
  console.log(failed ? '\nSIMULAZIONE: ' + failed + ' scenari con problemi' : '\nSIMULAZIONE OK: nessuna risposta persa, nessun duplicato.');
  process.exit(failed ? 1 : 0);
}

main();
