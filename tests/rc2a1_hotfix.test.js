'use strict';
/* RC2-A.1 HOTFIX — nei giochi il primo calcolo della regia deve già usare il tempo disponibile del round:
   regia, server, ricalcolo e ripresa producono gli stessi punti, senza correzioni del server. Più la riga "Pulsantiere" della checklist. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness.js').test;
var SC = require('../js/engine/scoring.js');
var SS = require('../js/engine/session.js');
var Room = require('../server/room.js').Room;

var APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
function extract(names) {
  return names.map(function (name) {
    var start = APP.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione della regia: ' + name);
    var rest = APP.slice(start);
    var next = /^(async )?function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
function pts(list) { var o = {}; list.forEach(function (e) { o[e.participantId] = e.points; }); return o; }

/* Regia in miniatura: stato di un gioco con il round arcade aperto come in arcadeStartRound (availableMs dal tempo del gioco). */
function gameCtx(type, seconds, entries) {
  var teams = [{ id: 'a', name: 'Blu' }, { id: 'b', name: 'Rossi' }, { id: 'c', name: 'Verdi' }];
  var commits = [], logs = [];
  var ctx = {
    SS: SS, SC: SC, FREE_OMISSIONS: 3, commits: commits, logs: logs,
    state: { teams: teams, pending: {}, entryMeta: {}, correctOrder: [], pendingOrder: [], arcade: { type: type },
      round: { roundInstanceId: 'game-' + type + '-0001', kind: 'arcade', openedAt: '2027-01-15T09:00:00.000Z', availableMs: seconds * 1000, committed: false },
      timer: { duration: seconds }, session: SS.createSession({ scoringProfile: 'show_speed' }), teamsScore: null },
    profileId: function () { return 'show_speed'; }, arcadeProvenance: function () { return { packId: 'qa' }; },
    entryOrder: function (id) { var i = ctx.state.correctOrder.indexOf(id); return i >= 0 ? i + 1 : 1000; },
    planItemFor: function () { return null; }, logEvent: function (e) { logs.push(e.event); }, recomputeScores: function () {},
    NET: { commitRound: function (x) { commits.push(JSON.parse(JSON.stringify(x))); } }
  };
  entries.forEach(function (e) {
    ctx.state.pending[e.id] = e.outcome;
    ctx.state.entryMeta[e.id] = { inputMode: e.mode, responseTimeMs: e.ms, selectedAnswer: e.answer || null };
    if (e.outcome === 'correct') ctx.state.correctOrder.push(e.id);
  });
  teams.forEach(function (t) { if (!(t.id in ctx.state.pending)) { ctx.state.pending[t.id] = 'omitted'; ctx.state.entryMeta[t.id] = { inputMode: 'manual', auto: true }; } }); // come fillMissingAbstain()
  vm.runInNewContext(extract(['roundAvailableMs', 'arcadeRecords', 'priorOmissions', 'scoreOptions', 'countModes', 'finalizeRound', 'committedPoints', 'recomputeAllRounds', 'serverCommitted']), ctx);
  return ctx;
}
function commitLocal(ctx) {
  var records = ctx.arcadeRecords(ctx.state.arcade, 'SOLUZIONE');
  ctx.finalizeRound(records, { gameType: ctx.state.arcade.type });
  return pts(ctx.state.session.scoreEvents);
}

test('RC2-A.1 Photopuzzle tablet: 2 s su 45 s → 296 già nel calcolo locale della regia (nessuna attesa del server)', function () {
  var ctx = gameCtx('photopuzzle', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 2000, answer: 'VIA APPIA' }, { id: 'b', outcome: 'wrong', mode: 'tablet', ms: 9000 }, { id: 'c', outcome: 'omitted', mode: 'manual' }]);
  var records = ctx.arcadeRecords(ctx.state.arcade, 'VIA APPIA ANTICA');
  assert.ok(records.every(function (r) { return r.availableMs === 45000; }), 'ogni record del gioco ha il tempo disponibile del round');
  same(commitLocal(ctx), { a: 296, b: -100, c: 0 });
  assert.strictEqual(ctx.commits[0].availableMs, 45000, 'al server va lo stesso tempo disponibile');
  assert.strictEqual(ctx.state.session.rounds[0].availableMs, 45000, 'salvato nel round');
});
test('RC2-A.1 Indovina tablet: tempo misurato → bonus corretto (9 s su 45 s = 280)', function () {
  same(commitLocal(gameCtx('indovina', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 9000 }, { id: 'b', outcome: 'correct', mode: 'tablet', ms: 30000 }])), { a: 280, b: 233, c: 0 });
});
/* RC2-A.2 (comportamento approvato dopo il test in classe): una parola della Staffetta vale 50–100 per velocità
   (prima 200–300). Resta verificato che il tempo disponibile del round, +10 s compresi, entri già nel calcolo locale. */
test('RC2-A.1 Staffetta: bonus corretto per il collegamento (RC2-A.2: 15 s su 45 s = 83; dopo +10 s il tempo disponibile è 55 s = 86)', function () {
  same(commitLocal(gameCtx('chain', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 15000 }])), { a: 83, b: 0, c: 0 });
  var ext = gameCtx('chain', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 15000 }]);
  ext.state.round.availableMs = 55000; // come addSeconds(10) sul round e sul server
  same(commitLocal(ext), { a: 86, b: 0, c: 0 });
});
/* RC2-A.2 (comportamento approvato): senza tablet nel round la 1ª corretta registrata vale 300 (poi 290, 280…), non più 200.
   La regola D1 dei round misti resta identica. */
test('RC2-A.1 corretta manuale in un gioco (RC2-A.2: senza tablet → 300); una corretta manuale nel round → tutte le corrette 200 (D1)', function () {
  same(commitLocal(gameCtx('photopuzzle', 45, [{ id: 'c', outcome: 'correct', mode: 'manual' }])), { a: 0, b: 0, c: 300 });
  same(commitLocal(gameCtx('photopuzzle', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 2000 }, { id: 'c', outcome: 'correct', mode: 'manual' }])), { a: 200, b: 0, c: 200 });
  same(commitLocal(gameCtx('photopuzzle', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 2000 }, { id: 'c', outcome: 'wrong', mode: 'manual' }])), { a: 296, b: 0, c: -100 }, 'un\'errata a mano non toglie il bonus');
});
test('RC2-A.1 server: commit del gioco → stessi punti della regia, nessuna correzione (score.verified)', function () {
  var t = { now: 9000000 };
  var room = new Room({ clock: function () { return t.now; }, pin: '4821', graceMs: 500 });
  room.setSession('s-hotfix');
  room.syncParticipants([{ id: 'a', name: 'Blu' }, { id: 'b', name: 'Rossi' }, { id: 'c', name: 'Verdi' }]);
  var j = room.join({ pin: '4821' }), d = room.assign(j.device.deviceId, 'a');
  assert.ok(room.openRound({ roundInstanceId: 'game-photopuzzle-0001', kind: 'arcade', gameType: 'photopuzzle', layout: 'text', correct: 'Via Appia antica', maxLength: 60, durationMs: 45000 }).ok);
  t.now += 1973;
  var ans = room.answer(d.deviceId, { roundInstanceId: 'game-photopuzzle-0001', answer: 'VIA APPIA ANTICA', deviceToken: d.deviceToken });
  assert.ok(ans.accepted);
  var ctx = gameCtx('photopuzzle', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: ans.record.responseTimeMs, answer: 'VIA APPIA ANTICA' }, { id: 'c', outcome: 'wrong', mode: 'manual' }]);
  ctx.state.entryMeta.a.responseId = ans.record.responseId;
  var local = commitLocal(ctx);
  same(local, { a: 296, b: 0, c: -100 }, '1 973 ms su 45 000');
  var sent = ctx.commits[0];
  var srv = room.commit({ roundInstanceId: sent.roundInstanceId, records: sent.records, profileId: sent.profileId, kind: sent.kind, openedAt: sent.openedAt, availableMs: sent.availableMs });
  assert.ok(srv.ok);
  same(pts(srv.scoreEvents), local, 'server = regia al primo calcolo');
  assert.strictEqual(srv.corrected, 0, 'nessun record riallineato');
  ctx.serverCommitted({ roundInstanceId: sent.roundInstanceId, scoreEvents: srv.scoreEvents });
  assert.ok(ctx.logs.indexOf('score.verified') >= 0 && ctx.logs.indexOf('score.server_override') < 0, 'la regia registra score.verified, non score.server_override');
});
test('RC2-A.1 recomputeAllRounds: i punti dei giochi restano identici (anche con record storici senza availableMs)', function () {
  var ctx = gameCtx('indovina', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 9000 }, { id: 'b', outcome: 'correct', mode: 'tablet', ms: 4500 }]);
  var before = commitLocal(ctx);
  ctx.recomputeAllRounds('show_speed');
  same(pts(ctx.state.session.scoreEvents), before);
  ctx.state.session.responses.forEach(function (r) { delete r.availableMs; }); // record salvati prima della correzione
  ctx.recomputeAllRounds('show_speed');
  same(pts(ctx.state.session.scoreEvents), before, 'riserva: rd.availableMs del round');
  same(SS.recomputeTotals(ctx.state.session, 'show_speed'), before, 'anche il ricalcolo del motore usa la riserva');
});
test('RC2-A.1 salvataggio e ripresa: dopo un giro JSON i punti dei giochi restano identici', function () {
  var ctx = gameCtx('photopuzzle', 45, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 2000 }, { id: 'b', outcome: 'correct', mode: 'tablet', ms: 20000 }]);
  var before = commitLocal(ctx);
  same(before, { a: 296, b: 256, c: 0 });
  ctx.state.session = JSON.parse(JSON.stringify(ctx.state.session)); // autosave → ripresa
  same(SS.totals(ctx.state.session), before);
  ctx.recomputeAllRounds('show_speed');
  same(pts(ctx.state.session.scoreEvents), before);
  assert.ok(/state\.round=ui\.round\|\|null;/.test(APP), 'un gioco in corso riprende con il suo round (e il suo availableMs)');
});
test('RC2-A.1 checklist: "2 tablet collegati · 4 squadre manuali" invece di "2 / 2 collegate"', function () {
  function items(teams, devices) {
    var ctx = { esc: String, publicWindow: null, state: { teams: teams, mixed: false, showJoin: false, planRun: null },
      NET: { status: function () { return { available: true, connected: true, showClients: 1 }; }, room: function () { return {}; }, devices: function () { return devices; } },
      pack: function () { return { title: 'Arte' }; }, planLive: function () { return null; } };
    vm.runInNewContext('var publicWindow=null;\n' + extract(['tabletSummary', 'readinessItems']), ctx);
    return ctx.readinessItems().filter(function (i) { return i.label === 'Pulsantiere'; })[0];
  }
  var six = ['a', 'b', 'c', 'd', 'e', 'f'].map(function (id) { return { id: id }; });
  assert.strictEqual(items(six, [{ participantId: 'a', connected: true }, { participantId: 'b', connected: true }]).detail, '2 tablet collegati · 4 squadre manuali');
  var warn = items(six, [{ participantId: 'a', connected: true }, { participantId: 'b', connected: false }]);
  assert.strictEqual(warn.detail, '1 di 2 tablet collegati · 4 squadre manuali'); assert.strictEqual(warn.state, 'warn');
  assert.strictEqual(items(six.slice(0, 2), [{ participantId: 'a', connected: true }, { participantId: 'b', connected: true }]).detail, '2 tablet collegati');
  assert.strictEqual(items(six.slice(0, 2), [{ participantId: 'a', connected: true }]).detail, '1 tablet collegato · 1 squadra manuale');
});
