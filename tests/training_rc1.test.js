'use strict';
/* TRAINING EDITION 1.0 RC1.1 — test di regressione degli interventi approvati:
   punteggio manuale corretto, omissioni ricontate, Photopuzzle cover+focus, checklist/QR chiari,
   conferma persistente prima di Ø, stato report a fine partita, avvio unico, documenti e testi. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib');
var test = require('./harness.js').test;
var H = require('./helpers.js');
var C = require('../js/core.js');
var SC = require('../js/engine/scoring.js');
var SS = require('../js/engine/session.js');
var RC = require('../js/engine/roundControl.js');
var RP = require('../js/engine/report.js');
var PE = require('../js/engine/packs.js');
var PL = require('../js/engine/packlib.js');
var PS = require('../js/engine/packstudio.js');
var Room = require('../server/room.js').Room;
var disk = require('../server/packstore-disk.js');

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var APP = source('js/app.js');
function inflate(b) { return new Uint8Array(zlib.inflateRawSync(Buffer.from(b))); }
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
function extract(names) {
  return names.map(function (name) {
    var start = APP.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione della regia: ' + name);
    var rest = APP.slice(start);
    var next = /^(async )?function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}
function pts(list) { var o = {}; list.forEach(function (r) { o[r.participantId] = r.points; }); return o; }
function rec(id, outcome, order, mode, auto) { return { participantId: id, outcome: outcome, order: order, inputMode: mode, auto: !!auto }; }

/* ---------------- 1. punteggio: il tempo conta solo se misurato ---------------- */
test('RC1 punteggio: 6 corrette inserite a mano = ex aequo, nessun bonus di velocità (era 300…175 per posizione in griglia)', function () {
  var r = SC.scoreRound(['a', 'b', 'c', 'd', 'e', 'f'].map(function (id, i) { return rec(id, 'correct', i + 1, 'manual'); }), 'show_standard', { priorOmissions: {}, freeOmissions: 3 });
  same(r.map(function (x) { return x.points; }), [300, 300, 300, 300, 300, 300]);
  assert.ok(r.every(function (x) { return x.exAequo && x.rank === 1; }));
});
test('RC1.1 punteggio: una CORRETTA manuale attiva l ex aequo; errata o omessa manuale lasciano valido l ordine dei tablet', function () {
  var tablet = SC.scoreRound([rec('a', 'correct', 1, 'tablet'), rec('b', 'correct', 2, 'tablet'), rec('c', 'correct', 3, 'tablet')], 'show_standard');
  same(pts(tablet), { a: 300, b: 275, c: 250 });
  same(pts(SC.scoreRound([rec('a', 'correct', 1, 'tablet'), rec('b', 'correct', 2, 'tablet'), rec('m', 'correct', 3, 'manual')], 'show_standard')), { a: 300, b: 300, m: 300 });
  same(pts(SC.scoreRound([rec('a', 'correct', 1, 'tablet'), rec('b', 'correct', 2, 'tablet'), rec('m', 'wrong', 1003, 'manual')], 'show_standard')), { a: 300, b: 275, m: -50 }, 'errata manuale: tempi corretti dei tablet conservati');
  same(pts(SC.scoreRound([rec('a', 'correct', 1, 'tablet'), rec('b', 'correct', 2, 'tablet'), rec('m', 'omitted', 1003, 'manual')], 'show_standard', { priorOmissions: {}, freeOmissions: 3 })), { a: 300, b: 275, m: 0 }, 'omessa manuale: tempi corretti dei tablet conservati');
});
test('RC1 punteggio: le Ø riempite in automatico (MANCANTI = Ø, AVANTI, tablet scaduto) non annullano il tempo misurato', function () {
  same(pts(SC.scoreRound([rec('a', 'correct', 1, 'tablet'), rec('b', 'correct', 2, 'tablet'), rec('m', 'omitted', 1003, 'manual', true), rec('t', 'omitted', 1004, 'tablet', true)], 'show_standard', { priorOmissions: {}, freeOmissions: 3 })), { a: 300, b: 275, m: 0, t: 0 });
});
test('RC1 punteggio: errate e omissioni seguono il profilo attivo; profilo Didattico invariato', function () {
  var legacy = SC.scoreRound([rec('a', 'correct', 1, 'manual'), rec('b', 'correct', 2, 'manual'), rec('c', 'wrong', 3, 'manual'), rec('d', 'omitted', 4, 'manual')], 'legacy_v3');
  same(pts(legacy), { a: 300, b: 300, c: -100, d: -100 });
  same(pts(SC.scoreRound([rec('a', 'correct', 1, 'manual'), rec('b', 'correct', 2, 'tablet')], 'learning')), { a: 1, b: 1 });
});
test('RC1 punteggio: il server calcola come la regia (stessi record → stessi punti, nessuna correzione del server)', function () {
  var room = new Room(); room.setSession('s-rc1');
  var records = ['a', 'b', 'c'].map(function (id, i) { return { participantId: id, participantType: 'team', inputMode: 'manual', selectedAnswer: 'B', correctAnswer: 'B', outcome: 'correct', order: i + 1 }; });
  var c = room.commit({ roundInstanceId: 'r-man', profileId: 'show_standard', records: records });
  same(pts(c.scoreEvents), { a: 300, b: 300, c: 300 });
  same(pts(SS.scoreEventsFor(records, 'show_standard', 'r-man', { priorOmissions: {}, freeOmissions: 3 })), pts(c.scoreEvents));
});
function manualCtx(n) {
  var teams = []; for (var i = 0; i < n; i++) teams.push({ id: 't' + (i + 1), name: 'S' + (i + 1) });
  var ctx = {
    C: C, SC: SC, SS: SS, FREE_OMISSIONS: 3, NET: { boundTeamIds: function () { return ctx.bound || {}; } },
    state: { screen: 'question', phase: 'scoring', questionScored: false, round: { roundInstanceId: 'r1' }, qRound: { correctDisplayLetter: 'B' },
      teams: teams, pending: {}, pendingOrder: [], correctOrder: [], entryMeta: {}, entrySeq: 0, pendingHistory: [], session: SS.createSession({ scoringProfile: 'show_standard' }) },
    logEvent: function () {}, afterEntryChange: function () {}, ensureArcadeRound: function () {}, profileId: function () { return 'show_standard'; },
    canEnterOverride: null, toasts: [], toast: function (m, k) { ctx.toasts.push([m, k]); }, renderAll: function () {}, esc: function (s) { return String(s); }
  };
  vm.runInNewContext(extract(['canEnter', 'pushHistory', 'entryOutcome', 'questionOutcome', 'setPending', 'entryOrder', 'previewRecords', 'priorOmissions', 'standingScoresBefore', 'scoreOptions', 'previewPoints', 'fillMissingAbstain', 'manualRound', 'missingTeams', 'missingGuard', 'scoreOrderHTML']), ctx);
  return ctx;
}
test('RC1 regia: raccolta manuale nell\'ordine della griglia → punti uguali; il riquadro dice "ex aequo" e non offre ▲', function () {
  var ctx = manualCtx(6);
  ctx.state.teams.forEach(function (t) { ctx.setPending(t.id, 'B', { inputMode: 'manual' }); });
  var p = ctx.previewPoints();
  same(ctx.state.teams.map(function (t) { return p[t.id]; }), [300, 300, 300, 300, 300, 300]);
  assert.ok(ctx.manualRound());
  var h = ctx.scoreOrderHTML();
  assert.ok(/EX AEQUO/.test(h) && !/data-order-up/.test(h));
});
test('RC1 regia: tablet + MANCANTI = Ø → l\'ordine dei tablet resta (le Ø automatiche sono marcate auto)', function () {
  var ctx = manualCtx(3);
  ctx.setPending('t1', 'B', { inputMode: 'tablet', responseTimeMs: 1200 });
  ctx.setPending('t2', 'B', { inputMode: 'tablet', responseTimeMs: 3400 });
  ctx.fillMissingAbstain();
  assert.strictEqual(ctx.state.entryMeta.t3.auto, true);
  assert.ok(!ctx.manualRound());
  var p = ctx.previewPoints();
  same([p.t1, p.t2, p.t3], [300, 275, 0]);
  assert.ok(/tempo misurato/.test(ctx.scoreOrderHTML()));
});
test('RC1.1 regia: errata manuale non attiva ex aequo; corretta manuale sì', function () {
  var ctx = manualCtx(3);
  ctx.setPending('t1', 'B', { inputMode: 'tablet', responseTimeMs: 1200 });
  ctx.setPending('t2', 'B', { inputMode: 'tablet', responseTimeMs: 3400 });
  ctx.setPending('t3', 'A', { inputMode: 'manual' });
  assert.ok(!ctx.manualRound());
  same([ctx.previewPoints().t1, ctx.previewPoints().t2, ctx.previewPoints().t3], [300, 275, -50]);
  ctx.setPending('t3', 'B', { inputMode: 'manual' });
  assert.ok(ctx.manualRound());
  same([ctx.previewPoints().t1, ctx.previewPoints().t2, ctx.previewPoints().t3], [300, 300, 300]);
  assert.ok(/CORRETTE EX AEQUO/.test(APP) && /tie\?1:i\+1/.test(APP), 'anche la coda SHOW dei giochi mostra punti ex aequo');
});

/* ---------------- 2. omissioni gratuite ricontate ---------------- */
function committedSession() {
  var s = SS.createSession({ scoringProfile: 'show_standard' });
  s.participants = [{ id: 'a', name: 'Alfa' }, { id: 'b', name: 'Beta' }];
  ['r1', 'r2', 'r3', 'r4'].forEach(function (rid, i) {
    var recs = [{ participantId: 'a', outcome: 'omitted' }, { participantId: 'b', outcome: 'correct' }].map(function (r) { return SS.makeResponse({ sessionId: s.sessionId, roundInstanceId: rid, kind: 'question', participantId: r.participantId, participantType: 'team', selectedAnswer: r.outcome === 'correct' ? 'A' : null, correctAnswer: 'A', outcome: r.outcome, inputMode: 'tablet', order: 1 }); });
    s.responses.push.apply(s.responses, recs);
    s.scoreEvents.push.apply(s.scoreEvents, SS.scoreEventsFor(recs, 'show_standard', rid, { priorOmissions: SS.committedOmissionCounts(s, rid), freeOmissions: 3 }));
    s.rounds.push({ roundInstanceId: rid, kind: 'question', committed: true, profileId: 'show_standard', openedAt: '2027-01-15T09:0' + i + ':00.000Z', number: i + 1, questionId: 'q' + (i + 1) });
  });
  return s;
}
test('RC1 omissioni: annullando la 2ª di 4 manche, la squadra con 3 astensioni rimaste torna a 0 (prima restava −100)', function () {
  var s = committedSession();
  assert.strictEqual(SS.totals(s).a, -50);
  var x = { id: 'q2' }, saved = { roundInstanceId: 'r2', round: { correctDisplayLetter: 'A', displayed: [] }, pending: {}, pendingOrder: [], correctOrder: [], entryMeta: {} };
  var ctx = { SS: SS, C: C, FREE_OMISSIONS: 3, state: { screen: 'question', questionScored: true, qIndex: 1, completedRounds: { q2: saved }, session: s, teams: [{ id: 'a' }, { id: 'b' }] },
    q: function () { return x; }, confirm: function () { return true; }, logEvent: function () {}, NET: { uncommitRound: function () {} }, renderAll: function () {}, autosave: function () {}, toast: function () {} };
  vm.runInNewContext(extract(['reopenScores', 'recomputeScores']), ctx);
  ctx.reopenScores();
  assert.strictEqual(SS.totals(s).a, 0);
  assert.strictEqual(SS.totals(s).b, 900, 'le corrette non cambiano');
  var csv = RP.toCSV({ session: s }, { raw: true });
  assert.ok(csv.length > 0);
});
test('RC1 omissioni: la rinumerazione segue l\'ordine di apertura, non l\'ordine di conferma, e tocca solo le omissioni', function () {
  var s = committedSession();
  var correctBefore = JSON.stringify(s.scoreEvents.filter(function (e) { return e.outcome === 'correct'; }));
  s.rounds.reverse(); // stesso contenuto, array in ordine inverso: conta l'orario di apertura
  s.scoreEvents.forEach(function (e) { if (e.outcome === 'omitted') { e.points = 999; e.omissionNumber = 9; } });
  SS.renumberOmissions(s, 3);
  var byRound = {}; s.scoreEvents.forEach(function (e) { if (e.participantId === 'a') byRound[e.roundInstanceId] = [e.omissionNumber, e.points]; });
  same(byRound, { r1: [1, 0], r2: [2, 0], r3: [3, 0], r4: [4, -50] });
  assert.strictEqual(JSON.stringify(s.scoreEvents.filter(function (e) { return e.outcome === 'correct'; })), correctBefore);
});
test('RC1 omissioni: riconfermando una domanda vecchia, server e regia contano le stesse omissioni precedenti (nessuna correzione del server)', function () {
  var room = new Room(); room.setSession('s-omit');
  function commit(rid, i) { return room.commit({ roundInstanceId: rid, profileId: 'show_standard', openedAt: '2027-01-15T09:0' + i + ':00.000Z', records: [{ participantId: 'a', participantType: 'team', inputMode: 'manual', selectedAnswer: null, correctAnswer: 'A', outcome: 'omitted', order: 1 }] }); }
  ['r1', 'r2', 'r3', 'r4'].forEach(function (rid, i) { commit(rid, i); });
  room.uncommit('r2');
  var again = commit('r2', 1);
  assert.strictEqual(again.scoreEvents[0].omissionNumber, 2, 'il server conta solo r1 come precedente');
  assert.strictEqual(again.scoreEvents[0].points, 0);
  var s = committedSession();
  SS.renumberOmissions(s, 3);
  var host = s.scoreEvents.filter(function (e) { return e.roundInstanceId === 'r2' && e.participantId === 'a'; })[0];
  same([host.omissionNumber, host.points], [again.scoreEvents[0].omissionNumber, again.scoreEvents[0].points]);
  assert.ok(/openedAt:r\.openedAt\|\|null/.test(APP), 'la regia invia l\'orario di apertura al server');
  assert.ok(/SS\.renumberOmissions\(s,FREE_OMISSIONS\);recomputeScores\(\);NET\.commitRound/.test(APP), 'rinumerazione a ogni conferma');
});

/* ---------------- 3. avviso prima di Ø ---------------- */
test('RC1 avviso: il primo AVANTI con squadre senza risposta avvisa con i nomi; il secondo procede; a tempo aperto le squadre con tablet non contano', function () {
  var ctx = manualCtx(3);
  ctx.setPending('t1', 'B', { inputMode: 'manual' });
  assert.strictEqual(ctx.missingGuard(), false);
  assert.ok(/S2, S3/.test(ctx.toasts[0][0]) && ctx.toasts[0][1] === 'warn');
  assert.strictEqual(ctx.missingGuard(), true, 'secondo AVANTI: si procede, le mancanti diventano Ø');
  var run = manualCtx(3); run.state.phase = 'running'; run.bound = { t2: true };
  same(run.missingTeams().map(function (t) { return t.id; }), ['t1', 't3']);
  var m = RC.cockpit({ screen: 'question', phase: 'scoring', answerVisible: true, teams: 3, missing: ['S2', 'S3'] });
  assert.ok(/S2, S3 → Ø/.test(m.main[0].sub), 'il pulsante principale lo dice prima');
  var src = APP.slice(APP.indexOf('function settleQuestionForNext'), APP.indexOf('function nextQuestion'));
  assert.ok(src.indexOf('missingGuard()') < src.indexOf('fillMissingAbstain()'), 'avviso prima del riempimento con Ø');
  assert.ok(/if\(!missingGuard\(\)\)return false;\n commitArcadeScores\(\)/.test(APP.replace(/\r\n/g, '\n')), 'anche nei giochi');
});
/* Trovato nell'E2E browser: il primo AVANTI avvisava ma passava comunque alla domanda seguente senza confermare i punti
   (archivio) oppure, in scaletta, riempiva subito le Ø nello stesso clic. Qui si percorre AVANTI vero: nextQuestion / planNext. */
function advanceCtx(plan) {
  var log = [];
  var teams = [{ id: 't1', name: 'Blu' }, { id: 't2', name: 'Rossi' }, { id: 't3', name: 'Verdi' }];
  var run = { cursor: 0, items: [{ uid: 'u0' }, { uid: 'u1' }], visited: {} };
  var ctx = {
    log: log, toasts: [],
    SS: { nowISO: function () { return 'T'; } }, NET: { revealRound: function () {} },
    SP: { nextPlayable: function (items, c) { return c + 1 < items.length ? c + 1 : -1; } },
    state: { screen: 'question', phase: 'scoring', questionScored: false, answerVisible: true, roundResultsVisible: false, round: { roundInstanceId: 'r1', revealedAt: 'T' },
      teams: teams, pending: { t1: 'C' }, bank: [{ id: 'q1' }, { id: 'q2' }], qIndex: 0, completedRounds: {} },
    planLive: function () { return plan ? run : null; }, planCurrent: function () { return run.items[run.cursor]; }, planOnItem: function () { return true; },
    planGo: function (n) { log.push('planGo ' + n); }, planFinish: function () { log.push('planFinish'); },
    goQuestion: function (i) { log.push('goQuestion ' + i); }, showLeaderboard: function () { log.push('leaderboard'); }, revealNextPlace: function () {}, leaveQuestionGuard: function () { return true; },
    missingTeams: function () { return ctx.state.teams.filter(function (t) { return !(t.id in ctx.state.pending); }); },
    fillMissingAbstain: function () { log.push('fillØ'); ctx.state.teams.forEach(function (t) { if (!(t.id in ctx.state.pending)) ctx.state.pending[t.id] = null; }); },
    commitQuestionScores: function () { log.push('commit'); ctx.state.questionScored = true; },
    closeQuestionTime: function () {}, renderAll: function () {}, cloneAudio: function () {}, autosave: function () {}, logEvent: function () {},
    toast: function (m, k) { ctx.toasts.push([m, k]); }, q: function () { return ctx.state.bank[ctx.state.qIndex]; }
  };
  vm.runInNewContext(extract(['missingGuard', 'settleQuestionForNext', 'showQuestionResults', 'nextQuestion', 'planNext']), ctx);
  return ctx;
}
[false, true].forEach(function (plan) {
  test('RC1 avviso (' + (plan ? 'scaletta' : 'archivio') + '): il 1° AVANTI si ferma sull\'avviso, il 2° registra Ø e mostra i risultati, il 3° va avanti', function () {
    var ctx = advanceCtx(plan);
    ctx.nextQuestion();
    same(ctx.log, [], '1° AVANTI: nessun cambio di domanda, nessuna Ø, nessuna conferma');
    assert.ok(/Rossi, Verdi/.test(ctx.toasts[0][0]));
    assert.strictEqual(ctx.state.questionScored, false);
    ctx.nextQuestion();
    same(ctx.log, ['fillØ', 'commit'], '2° AVANTI: Ø e conferma dei punti');
    assert.ok(ctx.state.roundResultsVisible, 'classifica della domanda');
    ctx.nextQuestion();
    same(ctx.log.slice(2), [plan ? 'planGo 1' : 'goQuestion 1']);
  });
});
test('RC1 classifica del round: con risposte a mano la legenda non parla di velocità', function () {
  var src = APP.slice(APP.indexOf('function roundResultsHTML'));
  src = src.slice(0, src.indexOf('\nfunction ', 1));
  assert.ok(/rows\.some\(r=>r\.exAequo\)\?'✓ corrette ex aequo/.test(src), 'legenda ex aequo nel round con risposte a mano (trovato nell\'E2E browser)');
  assert.ok(/label\+=' · EX AEQUO \(corretta inserita a mano\)'/.test(src));
});
test('RC1.1 avviso persistente: dopo il primo stop il comando principale diventa CONFERMA N ASTENSIONI → Ø', function () {
  var before = RC.cockpit({ screen: 'question', phase: 'scoring', answerVisible: true, teams: 4, missing: ['Rossi', 'Verdi'], missingConfirmed: false });
  assert.strictEqual(before.main[0].label, 'PROSSIMA DOMANDA →');
  var after = RC.cockpit({ screen: 'question', phase: 'scoring', answerVisible: true, teams: 4, missing: ['Rossi', 'Verdi'], missingConfirmed: true });
  assert.strictEqual(after.main[0].label, 'CONFERMA 2 ASTENSIONI → Ø');
  assert.strictEqual(after.main[0].tone, 'amber');
  assert.ok(/senza risposta/.test(after.main[0].sub));
});

test('RC1 avviso: con tutte le risposte il 1° AVANTI conferma e mostra subito i risultati (nessun avviso)', function () {
  var ctx = advanceCtx(false);
  ctx.state.pending = { t1: 'C', t2: 'A', t3: 'C' };
  ctx.nextQuestion();
  same(ctx.log, ['commit']);
  assert.ok(ctx.state.roundResultsVisible);
  assert.strictEqual(ctx.toasts.length, 0);
});

/* ---------------- 4. Photopuzzle cover + focus ---------------- */
test('RC1 Photopuzzle: cornice riempita (cover) con punto focale; solo il Photopuzzle', function () {
  var css = source('css/show.css');
  assert.ok(css.indexOf('.puzzleFrame>img{width:100%;height:100%;object-fit:cover;object-position:var(--focus,center)}') >= 0);
  assert.strictEqual(css.indexOf('.puzzleFrame>img{width:100%;height:100%;object-fit:contain}'), -1);
  assert.ok(/<div class="puzzleFrame" style="--focus:\$\{puzzleFocus\(a\.focus\)\}">/.test(APP));
  assert.ok(/focus:set\.focus\|\|''/.test(APP), 'portato nello stato da loadArcadePreset');
  assert.ok(/state\.arcade\.image=r\.result;state\.arcade\.focus='';/.test(APP), 'immagine caricata dal PC: punto focale azzerato');
  var base = fs.readFileSync(path.join(ROOT, 'css/show.css'), 'utf8').match(/object-fit:cover/g).length;
  assert.ok(base >= 1);
});
test('RC1 Photopuzzle: il focus è validato e normalizzato dal motore; un valore sbagliato è un errore leggibile', function () {
  same(['50% 30%', 'alto', 'centro basso', 'sinistra alto', '101% 3%', 'nord', ''].map(PE.photoFocus), ['50% 30%', '50% 0%', '50% 100%', '0% 0%', '', '', '']);
  var ctx = { PE: PE }; vm.runInNewContext(extract(['puzzleFocus']), ctx);
  same([ctx.puzzleFocus('alto'), ctx.puzzleFocus('<script>'), ctx.puzzleFocus(undefined)], ['50% 0%', '50% 50%', '50% 50%']);
  var base = { label: 'Prova', theme: 'Tema', image: 'images/foto.jpg', answer: 'Etna' };
  assert.strictEqual(PE.validateGame('photopuzzle', Object.assign({ focus: 'alto' }, base)).focus, '50% 0%');
  assert.ok(!('focus' in PE.validateGame('photopuzzle', Object.assign({ focus: '' }, base))));
  assert.throws(function () { PE.validateGame('photopuzzle', Object.assign({ focus: 'nord' }, base)); }, /Punto focale/);
});
test('RC1 Photopuzzle: il focus sopravvive a Pack Studio (validazione, salvataggio nella libreria) e a esporta → reimporta', async function () {
  var dir = H.tempDir(), packsDir = path.join(dir, 'packs');
  (function copy(src, dst) { fs.mkdirSync(dst, { recursive: true }); fs.readdirSync(src).forEach(function (f) { var p = path.join(src, f); if (fs.statSync(p).isDirectory()) copy(p, path.join(dst, f)); else fs.copyFileSync(p, path.join(dst, f)); }); })(path.join(ROOT, 'packs/arte_romana'), path.join(packsDir, 'arte_romana'));
  try {
    var lib = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') });
    await lib.list();
    var ex = await lib.exportZip('arte_romana');
    var d = PS.draftFromImport(PL.readImport(ex.filename, ex.bytes, { inflate: inflate }), { libraryId: 'arte_romana' });
    d.games.photopuzzle[0].focus = 'nord';
    var bad = PS.validate(d);
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.errors.some(function (e) { return /Punto focale/.test(e.message); }), 'Pack Studio segnala il punto focale non valido');
    d.games.photopuzzle[0].focus = 'alto';
    var saved = await lib.save('arte_romana.zip', PS.toZip(d).bytes, { mode: 'replace', expectedId: 'arte_romana', inflate: disk.inflate });
    assert.ok(saved.ok, JSON.stringify(saved));
    var lib2 = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') });
    var ex2 = await lib2.exportZip('arte_romana');
    var pack = PL.validateImport(PL.readImport(ex2.filename, ex2.bytes, { inflate: inflate })).pack;
    assert.strictEqual(pack.games.photopuzzle[0].focus, '50% 0%', 'esportato e reimportato');
    var rt = PE.toRuntime(pack, { origin: 'installed' });
    assert.strictEqual(rt.arcadeSets.photopuzzle[0].focus, '50% 0%', 'arriva alla regia');
    assert.ok(source('js/studio/studio.js').indexOf("input('g.focus'")>=0, 'campo Punto focale nell editor dello Studio');
  } finally { H.rmrf(dir); }
});

/* ---------------- 5. checklist, QR sullo SHOW, percorso proiettore ---------------- */
function readyCtx(o) {
  var ctx = {
    esc: function (s) { return String(s); }, publicWindow: o.publicWindow || null,
    NET: { status: function () { return o.status; }, room: function () { return o.room || {}; }, devices: function () { return o.devices || []; } },
    state: { teams: o.teams || [], mixed: false, showJoin: !!o.showJoin, planRun: null }, pack: function () { return { title: 'Arte romana' }; }, planLive: function () { return null; },
    BRAND_LOGO: 'logo.svg', window: { SecchioneQR: require('../js/lib/qr.js') }
  };
  vm.runInNewContext('var publicWindow=this.publicWindow;\n' + extract(['readinessItems', 'readinessHTML', 'joinHTML']), ctx);
  return ctx;
}
test('RC1 checklist "Pronto per la lezione": programma, squadre, proiettore, pulsantiere, contenuti con l\'azione giusta', function () {
  var empty = readyCtx({ status: { available: true, connected: true, showClients: 0 }, room: { urls: [{ player: 'http://192.168.1.20:8765/player' }], pin: '4821' } });
  var items = empty.readinessItems();
  same(items.map(function (i) { return i.label + ':' + i.state; }), ['Programma:ok', 'Squadre:todo', 'Proiettore:todo', 'Pulsantiere:opt', 'Contenuti:ok']);
  assert.ok(/192\.168\.1\.20:8765\/player/.test(items[0].detail));
  same(items.map(function (i) { return i.act || ''; }), ['', 'addTeams', 'openShow', 'connectTablets', 'chooseContent']);
  var ready = readyCtx({ status: { available: true, connected: true, showClients: 1 }, teams: [{ id: 'a' }, { id: 'b' }], devices: [{ participantId: 'a', connected: true }, { participantId: 'b', connected: false }] });
  same(ready.readinessItems().map(function (i) { return i.state; }), ['ok', 'ok', 'ok', 'warn', 'ok']);
  assert.strictEqual(ready.readinessItems()[3].detail, '1 tablet collegato · 1 tablet offline');
  var mixed = readyCtx({ status: { available: true, connected: true, showClients: 1 }, teams: [{id:'a'},{id:'b'},{id:'c'},{id:'d'},{id:'e'},{id:'f'}], devices: [{ participantId: 'a', connected: true }, { participantId: 'b', connected: true }] });
  assert.strictEqual(mixed.readinessItems()[3].detail, '2 tablet collegati · 4 squadre manuali');
  var off = readyCtx({ status: { available: true, connected: false } });
  assert.strictEqual(off.readinessItems()[0].state, 'bad');
  assert.ok(/PRONTO PER LA LEZIONE/.test(ready.readinessHTML()));
  var map = APP.slice(APP.indexOf('function cockpitAction('), APP.indexOf('function onCockpitClick('));
  ['addTeams', 'openShow', 'connectTablets', 'chooseContent', 'endGame'].forEach(function (a) { assert.ok(map.indexOf(a) >= 0, 'azione ' + a); });
});
test('RC1 QR e PIN sullo SHOW: schermata dedicata in Home, sparisce quando si gioca', function () {
  var ctx = readyCtx({ status: { available: true, connected: true }, room: { urls: [{ player: 'http://192.168.1.20:8765/player' }], pin: '4821' }, teams: [{ id: 'a' }, { id: 'b' }], devices: [{ participantId: 'a', connected: true }] });
  var h = ctx.joinHTML();
  assert.ok(/<svg/.test(h) && />4821</.test(h) && /192\.168\.1\.20:8765\/player/.test(h) && /1 \/ 1/.test(h) && /1 manuale/.test(h));
  assert.ok(/if\(state\.screen==='home'\)return state\.showJoin&&NET\.status\(\)\.connected\?joinHTML\(\):homeHTML\(\);/.test(APP));
  assert.ok(/function goQuestion\(i\)\{[^\n]*state\.showJoin=false;/.test(APP) && /function startArcade\(type\)\{[^\n]*state\.showJoin=false;/.test(APP));
  assert.ok(/\.joinQr\{/.test(source('css/show.css')));
});
test('RC1 percorso proiettore: un solo comando chiaro, istruzioni se il browser blocca la finestra', function () {
  var html = source('index.html');
  assert.ok(/<strong>SCHERMO PROIETTORE<\/strong>/.test(html) && html.indexOf('DOPPIO SCHERMO') < 0);
  assert.ok(/consenti i popup per questo indirizzo/.test(APP) && /trascinalo sul proiettore e premi F11/.test(APP));
});

/* ---------------- 6. termina partita ---------------- */
test('RC1 TERMINA PARTITA: azione principale a verdetto completo; archivia; al riavvio niente "partita non conclusa" (squadre ripristinate)', function () {
  var m = RC.cockpit({ screen: 'leaderboard', teams: 4, podium: { shown: 4, total: 4, nextRank: 1 }, reportExported: false });
  assert.strictEqual(m.main[0].act, 'endGame');
  assert.ok(/REPORT NON ANCORA SALVATO/.test(m.main[0].sub));
  assert.ok(/SALVA REPORT/.test(m.secondary[0].label) && m.secondary[0].tone === 'amber');
  var saved = RC.cockpit({ screen: 'leaderboard', teams: 4, podium: { shown: 4, total: 4, nextRank: 1 }, reportExported: true });
  assert.ok(/REPORT SALVATO/.test(saved.main[0].sub));
  assert.ok(/REPORT SALVATO/.test(saved.secondary[0].label));
  var calls = [];
  var ctx = { state: { teams: [{ id: 'a' }], session: { sessionId: 'old' }, reportExported: false }, confirmText: '',
    confirm: function (t) { ctx.confirmText = t; return true; }, STORE: { archiveSnapshot: function (s) { calls.push('archive:' + s); } }, buildSnapshot: function (r) { return r; },
    logEvent: function () {}, newSession: function () { ctx.state.session = { sessionId: 'new' }; calls.push('new'); }, recomputeScores: function () {}, showHome: function () { calls.push('home'); }, autosave: function () {}, toast: function () {} };
  vm.runInNewContext(extract(['endGame']), ctx);
  ctx.endGame();
  same(calls, ['archive:end.game', 'new', 'home']);
  assert.ok(/report di classe non è ancora stato esportato/.test(ctx.confirmText), 'ricorda il report se non esportato');
  assert.strictEqual(ctx.state.session.afterEnd, true);
  assert.ok(/if\(hasProgress\(snap\)&&snap\.session\.afterEnd&&!\(snap\.session\.responses\|\|\[\]\)\.length\)\{try\{restoreSnapshot\(snap\)\}/.test(APP), 'ripresa silenziosa delle sole squadre');
  assert.ok(/if\(s\.afterEnd\)delete s\.afterEnd;/.test(APP), 'alla prima conferma la nuova partita torna normale');
});

/* ---------------- 7. avvio unico, testi, documenti ---------------- */
test('RC1 senza tablet = stesso programma (stessi dati): AVVIA_SENZA_TABLET richiama l\'avvio normale', function () {
  var bat = source('AVVIA_SENZA_TABLET.bat');
  assert.ok(/call "%~dp0AVVIA_IL_SECCHIONE\.bat"/i.test(bat));
  assert.ok(!/index\.html/i.test(bat), 'non apre più index.html da file://');
});
test('RC1.1 testi punteggio: manuale errata/omessa non viene descritta come causa di ex aequo', function () {
  assert.ok(/DA -50 A -200/.test(APP) && /POSIZIONE IN CLASSIFICA/.test(APP));
  assert.ok(/tempo mostrato se misurato/.test(APP));
  var guide = source('GUIDA_DOCENTE.html');
  assert.ok(/Se almeno una risposta corretta viene inserita a mano/.test(guide));
  assert.ok(/errata o omessa non annulla/.test(guide));
});

test('RC1 testi: niente promesse di "backup e ripresa", niente gergo tecnico nella vista del docente', function () {
  var html = source('index.html');
  ['backup e ripresa', 'JSON COMPLETO', 'LOG TECNICO', 'MODALITÀ MANUALE', 'SFX+', '16:9 · 1080p', 'v3.5 CLASSROOM'].forEach(function (s) { assert.strictEqual(html.indexOf(s), -1, 'index.html: ' + s); });
  ['backup e ripresa', "'MODALITÀ MANUALE'", 'JSON completo esportato', '· v${VERSION}'].forEach(function (s) { assert.strictEqual(APP.indexOf(s), -1, 'app.js: ' + s); });
  assert.ok(/COPIA PER L’ASSISTENZA/.test(html));
  assert.strictEqual(source('js/host/packs-ui.js').indexOf('id <code>'), -1);
  assert.strictEqual(source('server/server.js').indexOf('node server\\\\server.js --open --port'), -1);
});
test('RC1 documenti: tre documenti per il docente in radice, il resto in documentazione_tecnica; procedura di backup manuale', function () {
  ['INIZIA_QUI.html', 'GUIDA_DOCENTE.html', 'RISOLUZIONE_PROBLEMI.html'].forEach(function (f) { assert.ok(fs.existsSync(path.join(ROOT, f)), f); });
  var md = fs.readdirSync(ROOT).filter(function (f) { return /\.(md|txt)$/i.test(f) && f !== 'SHA256SUMS.txt'; });
  same(md, [], 'nessun documento tecnico in radice');
  ['README.md', 'ARCHITECTURE.md', 'CHANGELOG_TRAINING_1.0_RC1.md'].forEach(function (f) { assert.ok(fs.existsSync(path.join(ROOT, 'documentazione_tecnica', f)), f); });
  var rp = source('RISOLUZIONE_PROBLEMI.html');
  assert.ok(/packs/.test(rp) && /data/.test(rp) && /copia/i.test(rp), 'backup manuale documentato');
  assert.ok(fs.existsSync(path.join(ROOT, 'documentazione_tecnica', 'QA', 'CHECKLIST_DOCENTE_SCONOSCIUTO.md')));
});
