'use strict';
/* RC2-A.2 GAMEPLAY — dopo il test reale in classe: helper generici di velocità e rango, input manuale a rango (300/290…),
   regola dei round misti, Ghigliottina (+10 per scelta, finale 200–300, massimo 350), Catena/Staffetta (50–100 per parola),
   score event ricostruibili (ricalcolo, salvataggio/ripresa, server, report/CSV), RISULTATO DEL GIOCO,
   tastiera con cursore. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness.js').test;
var SC = require('../js/engine/scoring.js');
var SS = require('../js/engine/session.js');
var RP = require('../js/engine/report.js');
var RC = require('../js/engine/roundControl.js');
var Room = require('../server/room.js').Room;

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var APP = source('js/app.js');
var PLAYER = source('js/player.js');
function extractFrom(src, names, indent) {
  return names.map(function (name) {
    var start = src.indexOf((indent || '') + 'function ' + name + '(');
    assert.ok(start >= 0, 'funzione: ' + name);
    var rest = src.slice(start);
    var re = indent ? /^ {2}(async )?function \w+\(/m : /^(async )?function \w+\(/m;
    var next = re.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
function pts(list) { var o = {}; list.forEach(function (e) { o[e.participantId] = e.points; }); return o; }
function tab(id, ms, outcome, avail, order) { return { participantId: id, outcome: outcome || 'correct', inputMode: 'tablet', responseTimeMs: ms, availableMs: avail == null ? 15000 : avail, order: order == null ? 1 : order }; }
function man(id, outcome, order) { return { participantId: id, outcome: outcome, inputMode: 'manual', order: order == null ? 1000 : order }; }
function round(records, scale, opts) { return pts(SC.scoreRound(records, 'show_speed', Object.assign({ scale: scale, priorOmissions: {}, freeOmissions: 3 }, opts || {}))); }

/* ---------------- A. helper generici e domanda standard a velocità ---------------- */
test('RC2-A.2 helper: speedRangePoints e rankRangePoints (generici per domande, Ghigliottina e Catena)', function () {
  assert.strictEqual(SC.speedRangePoints(0, 15000, 200, 300), 300);
  assert.strictEqual(SC.speedRangePoints(15000, 15000, 200, 300), 200);
  assert.strictEqual(SC.speedRangePoints(99999, 15000, 200, 300), 200, 'oltre il limite: minimo');
  assert.strictEqual(SC.speedRangePoints(null, 15000, 50, 100), 50, 'senza tempo: minimo, nessun tempo inventato');
  assert.strictEqual(SC.speedRangePoints(1000, 0, 50, 100), 50);
  assert.strictEqual(SC.speedRangePoints(22500, 45000, 50, 100), 75);
  same([1, 2, 3, 10, 11, 12, 30].map(function (r) { return SC.rankRangePoints(r, 300, 10, 200); }), [300, 290, 280, 210, 200, 200, 200]);
  same([1, 2, 3, 10, 11, 12].map(function (r) { return SC.rankRangePoints(r, 100, 5, 50); }), [100, 95, 90, 55, 50, 50]);
  assert.strictEqual(SC.speedPoints(7500, 15000, 'show_speed'), SC.speedRangePoints(7500, 15000, 200, 300), 'speedPoints usa lo stesso helper');
});
test('RC2-A.2 A. domanda standard da tablet: 0 ms → 300, al limite → 200, valori intermedi coerenti', function () {
  same(round([tab('a', 0), tab('b', 15000), tab('c', 7500), tab('d', 3000), tab('e', 12000)], 'standard'), { a: 300, b: 200, c: 250, d: 280, e: 220 });
  var mid = [1000, 2000, 5000, 9000, 14000].map(function (ms) { return round([tab('x', ms)], 'standard').x; });
  assert.ok(mid.every(function (p, i) { return p >= 200 && p <= 300 && (i === 0 || p <= mid[i - 1]); }), 'più lento = mai più punti');
  same(round([tab('a', 4000, 'wrong'), tab('b', null, 'omitted')], 'standard'), { a: -100, b: 0 }, 'errata −100, omessa 0 (politica attuale)');
});

/* ---------------- B. senza tablet: rango delle sole corrette ---------------- */
test('RC2-A.2 B. senza tablet: corrette 300, 290, 280… nell’ordine di registrazione, minimo 200', function () {
  same(round([man('a', 'correct', 1), man('b', 'correct', 2), man('c', 'correct', 3)], 'standard'), { a: 300, b: 290, c: 280 });
  var many = [];
  for (var i = 1; i <= 13; i++) many.push(man('t' + i, 'correct', i));
  var p = round(many, 'standard');
  same([p.t1, p.t2, p.t10, p.t11, p.t12, p.t13], [300, 290, 210, 200, 200, 200], 'dalla 11ª in poi: 200');
});
test('RC2-A.2 B. senza tablet: un’errata o un’omissione tra due corrette non consuma il rango', function () {
  same(round([man('a', 'correct', 1), man('x', 'wrong', 1000), man('b', 'correct', 2)], 'standard'), { a: 300, x: -100, b: 290 });
  same(round([man('a', 'correct', 1), man('o', 'omitted', 1001), man('b', 'correct', 2), man('c', 'correct', 3)], 'standard'), { a: 300, o: 0, b: 290, c: 280 });
  var ctx = manualCtx(4); // regia: registrazione reale con setPending (ordine delle corrette = correctOrder)
  ctx.setPending('t1', 'B', { inputMode: 'manual' });
  ctx.setPending('t2', 'C', { inputMode: 'manual' }); // errata
  ctx.setPending('t3', 'abstain', { inputMode: 'manual' });
  ctx.setPending('t4', 'B', { inputMode: 'manual' });
  var pv = ctx.previewPoints();
  same([pv.t1, pv.t2, pv.t3, pv.t4], [300, -100, 0, 290]);
  var so = ctx.scoreOrderHTML();
  assert.ok(/SENZA TABLET: 300, 290, 280/.test(so) && !/200 \+ bonus/.test(so), so);
});
test('RC2-A.2 B. i round giocati fino alla RC2-A.1 (senza scala) non cambiano: corretta a mano = 200, nessun ricalcolo retroattivo', function () {
  same(pts(SC.scoreRound([man('a', 'correct', 1), man('b', 'correct', 2)], 'show_speed', {})), { a: 200, b: 200 });
  var s = SS.createSession({ scoringProfile: 'show_speed' });
  s.rounds.push({ roundInstanceId: 'old', committed: true, profileId: 'show_speed', openedAt: '2026-10-01T09:00:00Z' });
  s.responses.push(SS.makeResponse({ roundInstanceId: 'old', participantId: 'a', outcome: 'correct', inputMode: 'manual', order: 1 }));
  same(SS.recomputeTotals(s, 'show_speed'), { a: 200 });
});

/* ---------------- C. round misti ---------------- */
test('RC2-A.2 C. misto: una CORRETTA a mano → tutte le corrette del micro-round al minimo; errata/omessa a mano → il tablet tiene la velocità', function () {
  same(round([tab('a', 1000), man('m', 'correct', 2)], 'standard'), { a: 200, m: 200 });
  same(round([tab('a', 0), man('m', 'wrong')], 'standard'), { a: 300, m: -100 });
  same(round([tab('a', 0), man('m', 'omitted')], 'standard'), { a: 300, m: 0 });
  same(round([tab('a', 0, 'correct', 45000), man('m', 'correct', 2)], 'chain_link'), { a: 50, m: 50 }, 'Catena: minimo 50');
  same(round([tab('a', 0, 'correct', 45000), man('m', 'wrong'), man('o', 'omitted')], 'chain_link'), { a: 100, m: 0, o: 0 });
  var autoOm = { participantId: 'a', outcome: 'omitted', inputMode: 'tablet', auto: true, order: 1000 };
  same(round([autoOm, man('b', 'correct', 1)], 'standard'), { a: 0, b: 300 }, 'un tablet senza risposta (omessa automatica) non rende misto il round → rango');
});

/* ---------------- regia in miniatura: giochi, micro-round, risultati ---------------- */
var TEAMS3 = [{ id: 'a', name: 'Blu' }, { id: 'b', name: 'Rossi' }, { id: 'c', name: 'Verdi' }];
function hostCtx(seconds, bound) {
  var commits = [], logs = [];
  var ctx = {
    SS: SS, SC: SC, FREE_OMISSIONS: 3, commits: commits, logs: logs, console: console,
    state: { teams: TEAMS3.map(function (t) { return Object.assign({}, t); }), pending: {}, entryMeta: {}, correctOrder: [], pendingOrder: [], arcade: null,
      round: null, timer: { duration: seconds }, session: SS.createSession({ scoringProfile: 'show_speed' }) },
    profileId: function () { return 'show_speed'; }, arcadeProvenance: function () { return { packId: 'qa' }; },
    entryOrder: function (id) { var i = ctx.state.correctOrder.indexOf(id); return i >= 0 ? i + 1 : 1000; },
    planItemFor: function () { return null; }, logEvent: function (e) { logs.push(e.event); }, recomputeScores: function () {}, autosave: function () {},
    NET: { commitRound: function (x) { commits.push(JSON.parse(JSON.stringify(x))); }, boundTeamIds: function () { return bound || {}; }, uncommitRound: function () {} }
  };
  vm.runInNewContext(extractFrom(APP, ['roundAvailableMs', 'arcadeRecords', 'priorOmissions', 'scoreOptions', 'countModes', 'finalizeRound', 'committedPoints',
    'recomputeAllRounds', 'serverCommitted', 'ghPairRecords', 'ghCommitPair', 'gameRounds', 'gameResultRows', 'voidGameRounds']), ctx);
  return ctx;
}
var clock = Date.parse('2027-01-15T09:00:00.000Z');
function nextISO() { clock += 1000; return new Date(clock).toISOString(); }
/* Un round di gioco come arcadeStartRound + risposte + commitArcadeScores (record → finalizeRound). */
function playGameRound(ctx, a, entries, meta) {
  var st = ctx.state;
  st.arcade = a; st.pending = {}; st.entryMeta = {}; st.correctOrder = []; st.pendingOrder = [];
  st.round = { roundInstanceId: 'r-' + a.type + '-' + (meta && meta.tag || Math.random().toString(36).slice(2)), kind: 'arcade', openedAt: nextISO(), availableMs: (a.seconds || 45) * 1000, committed: false, gameInstanceId: a.gameId };
  entries.forEach(function (e) {
    st.pending[e.id] = e.outcome;
    st.entryMeta[e.id] = { inputMode: e.mode || 'manual', responseTimeMs: e.ms, selectedAnswer: e.answer || null };
    if (e.outcome === 'correct') st.correctOrder.push(e.id);
  });
  st.teams.forEach(function (t) { if (!(t.id in st.pending)) { st.pending[t.id] = 'abstain'; st.entryMeta[t.id] = { inputMode: 'manual', auto: true }; } });
  var records = ctx.arcadeRecords(a, 'SOLUZIONE');
  return ctx.finalizeRound(records, Object.assign({ gameType: a.type, gameInstanceId: a.gameId, label: a.label }, meta || {}));
}
function ghGame() {
  return { type: 'ghigliottina', gameId: 'game-gh-1', label: 'Parola segreta 1', presetIndex: 0, seconds: 45, step: 0, answer: 'ARCO',
    pairs: ['A', 'B', 'B', 'A', 'B'].map(function (side, i) { return { correct: 'W' + i, wrong: 'X' + i, a: '', b: '', correctSide: side, selected: null, resolved: false }; }) };
}
/* Coppia i: votes (tablet) e ghManual (a mano) come in ghVote/ghPick, poi la scelta scenica di chooseGh → ghCommitPair. */
function playPair(ctx, a, i, votes, manual) {
  a.step = i; a.pairOpenedAt = nextISO(); a.votes = votes || {}; a.voteMeta = {}; a.ghManual = manual || {};
  Object.keys(a.votes).forEach(function (id) { a.voteMeta[id] = { responseTimeMs: 1200, deviceId: 'dev-' + id, responseId: 'resp-' + i + '-' + id }; });
  ctx.ghCommitPair(a, a.pairs[i], 'pair-' + i);
}

/* ---------------- D. Ghigliottina ---------------- */
test('RC2-A.2 D. Ghigliottina: ogni scelta A/B corretta +10 alla singola squadra, errata 0, omessa 0; la maggioranza non decide', function () {
  var ctx = hostCtx(45, { a: true });
  var a = ghGame();
  // coppia 0 (giusta A): a vota A dal tablet, b sceglie B a mano (errata), c non sceglie; la "maggioranza" scenica sarebbe indifferente
  playPair(ctx, a, 0, { a: 'A' }, { b: 'B' });
  var ev = ctx.state.session.scoreEvents.filter(function (e) { return e.roundInstanceId === 'pair-0'; });
  same(pts(ev), { a: 10, b: 0, c: 0 });
  assert.ok(ev.every(function (e) { return e.scale === 'gh_pair'; }), 'score event con scala gh_pair');
  var rd = ctx.state.session.rounds.filter(function (r) { return r.roundInstanceId === 'pair-0'; })[0];
  same([rd.ghPart, rd.pairIndex, rd.scale, rd.gameInstanceId, rd.correctAnswer], ['pair', 0, 'gh_pair', 'game-gh-1', 'A']);
  var rs = ctx.state.session.responses.filter(function (r) { return r.roundInstanceId === 'pair-0'; });
  same(rs.map(function (r) { return [r.participantId, r.selectedAnswer, r.outcome, r.inputMode, r.auto]; }), [['a', 'A', 'correct', 'tablet', false], ['b', 'B', 'wrong', 'manual', false], ['c', null, 'omitted', 'manual', true]]);
  same(ctx.commits[0].scale, 'gh_pair', 'al server va la stessa scala');
  // il docente corregge a mano un tablet: vale la scelta a mano
  playPair(ctx, a, 1, { a: 'A' }, { a: 'B', b: 'B', c: 'B' });
  same(pts(ctx.state.session.scoreEvents.filter(function (e) { return e.roundInstanceId === 'pair-1'; })), { a: 10, b: 10, c: 10 });
});
test('RC2-A.2 D. Ghigliottina: finale come una domanda standard (200–300); 5 coppie corrette + finale perfetta = 350; errata −100', function () {
  var ctx = hostCtx(45, { a: true, b: true });
  var a = ghGame();
  for (var i = 0; i < 5; i++) playPair(ctx, a, i, { a: a.pairs[i].correctSide, b: i < 3 ? a.pairs[i].correctSide : (a.pairs[i].correctSide === 'A' ? 'B' : 'A') }, {});
  a.final = true;
  playGameRound(ctx, a, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 0, answer: 'ARCO' }, { id: 'b', outcome: 'wrong', mode: 'tablet', ms: 9000, answer: 'PONTE' }], { tag: 'final', ghPart: 'final' });
  var t = SS.totals(ctx.state.session);
  same(t, { a: 350, b: -70, c: 0 }, 'a: 5×10 + 300 = 350 (massimo); b: 3×10 − 100; c: nessuna scelta, finale omessa');
  var fin = ctx.state.session.rounds.filter(function (r) { return r.ghPart === 'final'; })[0];
  assert.strictEqual(fin.scale, 'standard');
  var late = hostCtx(45, { a: true });
  playGameRound(late, ghGame(), [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 45000 }], { tag: 'final', ghPart: 'final' });
  same(pts(late.state.session.scoreEvents), { a: 200, b: 0, c: 0 }, 'risposta al limite = 200');
  var manual = hostCtx(45);
  playGameRound(manual, ghGame(), [{ id: 'b', outcome: 'correct' }, { id: 'a', outcome: 'correct' }], { tag: 'final', ghPart: 'final' });
  same(pts(manual.state.session.scoreEvents), { a: 290, b: 300, c: 0 }, 'senza tablet: rango 300, 290 nell’ordine di registrazione');
});
test('RC2-A.2 D. Ghigliottina: le omissioni delle coppie non consumano le 3 omissioni gratuite; ricalcolo identico', function () {
  var ctx = hostCtx(45);
  var a = ghGame();
  for (var i = 0; i < 5; i++) playPair(ctx, a, i, {}, { a: a.pairs[i].correctSide });
  assert.strictEqual(SS.committedOmissionCounts(ctx.state.session).b || 0, 0, '5 coppie senza scelta: nessuna omissione contata');
  var before = ctx.state.session.scoreEvents.map(function (e) { return [e.roundInstanceId, e.participantId, e.points]; });
  ctx.recomputeAllRounds('show_speed');
  same(ctx.state.session.scoreEvents.map(function (e) { return [e.roundInstanceId, e.participantId, e.points]; }), before, 'recomputeAllRounds della regia');
  same(SS.recomputeTotals(ctx.state.session, 'show_speed'), SS.totals(ctx.state.session), 'recomputeTotals del motore');
  same(SS.totals(ctx.state.session), { a: 50, b: 0, c: 0 });
});
test('RC2-A.2 D. Ghigliottina: annullare la manche in corso scarta anche le scelte A/B già registrate', function () {
  var ctx = hostCtx(45);
  var a = ghGame();
  playPair(ctx, a, 0, {}, { a: 'A', b: 'A' });
  same(SS.totals(ctx.state.session), { a: 10, b: 10, c: 0 });
  assert.strictEqual(ctx.voidGameRounds('game-gh-1', 'test'), 1);
  same(SS.totals(ctx.state.session), {}, 'nessun punto per la manche annullata');
  assert.ok(ctx.state.session.responses.every(function (r) { return r.voided; }), 'le risposte restano, annullate');
  assert.ok(/if\(open&&a\.type==='ghigliottina'\)voidGameRounds\(a\.gameId/.test(APP), 'ANNULLA ROUND della Ghigliottina in corso usa voidGameRounds');
});

/* ---------------- E. Catena / Staffetta ---------------- */
test('RC2-A.2 E. Catena: parola immediata 100, al limite 50, intermedia coerente; errata 0, omessa 0 (anche dopo 3 omissioni)', function () {
  same(round([tab('a', 0, 'correct', 45000), tab('b', 45000, 'correct', 45000), tab('c', 15000, 'correct', 45000), tab('d', 4000, 'wrong', 45000), tab('e', null, 'omitted', 45000)], 'chain_link', { priorOmissions: { e: 7 } }), { a: 100, b: 50, c: 83, d: 0, e: 0 });
  same(round([man('a', 'correct', 1), man('x', 'wrong'), man('b', 'correct', 2), man('o', 'omitted'), man('c', 'correct', 3)], 'chain_link'), { a: 100, x: 0, b: 95, o: 0, c: 90 }, 'senza tablet 100, 95, 90…; errate e omesse non consumano il rango');
  var ten = [];
  for (var i = 1; i <= 12; i++) ten.push(man('t' + i, 'correct', i));
  var p = round(ten, 'chain_link');
  same([p.t10, p.t11, p.t12], [55, 50, 50], 'minimo 50');
});
test('RC2-A.2 E. Catena: ogni parola è un micro-round con i propri score event; il RISULTATO DEL GIOCO li somma', function () {
  var ctx = hostCtx(45, { a: true });
  var a = { type: 'chain', gameId: 'game-chain-1', label: 'La casa romana', seconds: 45, index: 0, links: [{ from: 'DOMUS', to: 'ATRIO' }, { from: 'ATRIO', to: 'IMPLUVIO' }, { from: 'IMPLUVIO', to: 'ACQUA' }] };
  playGameRound(ctx, a, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 0 }, { id: 'b', outcome: 'wrong' }], { tag: 'l0', chainIndex: 0 });
  playGameRound(ctx, a, [{ id: 'a', outcome: 'correct', mode: 'tablet', ms: 22500 }], { tag: 'l1', chainIndex: 1 });
  playGameRound(ctx, a, [{ id: 'b', outcome: 'correct' }, { id: 'c', outcome: 'correct' }], { tag: 'l2', chainIndex: 2 });
  var s = ctx.state.session;
  var rounds = s.rounds.filter(function (r) { return r.gameInstanceId === 'game-chain-1'; });
  same(rounds.map(function (r) { return [r.scale, r.chainIndex]; }), [['chain_link', 0], ['chain_link', 1], ['chain_link', 2]]);
  same(s.scoreEvents.map(function (e) { return e.roundInstanceId + ':' + e.participantId + '=' + e.points; }),
    ['r-chain-l0:a=100', 'r-chain-l0:b=0', 'r-chain-l0:c=0', 'r-chain-l1:a=75', 'r-chain-l1:b=0', 'r-chain-l1:c=0', 'r-chain-l2:a=0', 'r-chain-l2:b=100', 'r-chain-l2:c=95']);
  same(SS.totals(s), { a: 175, b: 100, c: 95 });
  assert.strictEqual(SS.committedOmissionCounts(s).a || 0, 0, 'le parole omesse non consumano le omissioni gratuite');
  var rows = ctx.gameResultRows(a);
  same(rows.map(function (r) { return [r.name, r.points, r.links.map(function (l) { return l.points; }).join('/')]; }), [['Blu', 175, '100/75/0'], ['Rossi', 100, '0/0/100'], ['Verdi', 95, '0/0/95']]);
});

/* ---------------- G. persistenza: ripresa, ricalcolo, server, report ---------------- */
function fullGame(manualOnly) {
  var ctx = hostCtx(45, manualOnly ? {} : { a: true });
  var gh = ghGame(), tm = manualOnly ? 'manual' : 'tablet';
  for (var i = 0; i < 5; i++) {
    var b = i % 2 ? gh.pairs[i].correctSide : 'abstain';
    if (manualOnly) playPair(ctx, gh, i, {}, { a: gh.pairs[i].correctSide, b: b }); else playPair(ctx, gh, i, { a: gh.pairs[i].correctSide }, { b: b });
  }
  playGameRound(ctx, gh, [{ id: 'a', outcome: 'correct', mode: tm, ms: 4500 }, { id: 'b', outcome: 'wrong' }], { tag: 'final', ghPart: 'final' });
  var ch = { type: 'chain', gameId: 'game-chain-9', label: 'Catena', seconds: 45, index: 0, links: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] };
  playGameRound(ctx, ch, [{ id: 'a', outcome: 'correct', mode: tm, ms: 9000 }, { id: 'c', outcome: 'wrong' }], { tag: 'c0', chainIndex: 0 });
  playGameRound(ctx, ch, [{ id: 'c', outcome: 'correct' }], { tag: 'c1', chainIndex: 1 });
  playGameRound(ctx, { type: 'photopuzzle', gameId: 'game-pp', seconds: 45 }, [{ id: 'b', outcome: 'correct' }, { id: 'c', outcome: 'correct' }], { tag: 'pp' });
  return ctx;
}
test('RC2-A.2 G. salvataggio/ripresa, ricalcolo della regia e del motore: stessi punteggi', function () {
  var ctx = fullGame();
  var s = ctx.state.session;
  var expected = SS.totals(s);
  /* a: 5 coppie dal tablet +50, finale 4,5 s su 45 s = 290, parola 1 in 9 s = 90 → 430
     b: coppie 2 e 4 a mano +20, finale errata −100, Photopuzzle 1ª corretta a mano 300 → 220
     c: parola 1 errata 0, parola 2 unica corretta a mano 100, Photopuzzle 2ª corretta a mano 290 → 390 */
  same(expected, { a: 430, b: 220, c: 390 });
  var resumed = JSON.parse(JSON.stringify(s)); // autosave → RIPRENDI
  same(SS.totals(resumed), expected, 'ripresa');
  same(SS.recomputeTotals(resumed, 'show_speed'), expected, 'ricalcolo del motore dopo la ripresa');
  ctx.state.session = resumed;
  ctx.recomputeAllRounds('show_speed');
  same(SS.totals(ctx.state.session), expected, 'ricalcolo della regia dopo la ripresa');
});
test('RC2-A.2 G. report e CSV: i punti di ogni micro-round sono quelli degli score event', function () {
  var ctx = fullGame();
  var s = ctx.state.session;
  s.participants = TEAMS3.map(function (t) { return { id: t.id, name: t.name, type: 'team' }; });
  var csv = RP.toCSV({ session: s }, { raw: true }).replace(/^﻿/, '').trim().split(/\r?\n/).map(function (l) { return l.split(';'); });
  var H = csv[0], iR = H.indexOf('round_id'), iP = H.indexOf('partecipante_id'), iPt = H.indexOf('punti');
  var fromCsv = {};
  csv.slice(1).forEach(function (r) { fromCsv[r[iP]] = (fromCsv[r[iP]] || 0) + Number(r[iPt] || 0); });
  same(fromCsv, SS.totals(s), 'somma dei punti del CSV = totali');
  assert.strictEqual(csv.length - 1, s.responses.length, 'una riga per risposta, coppie e parole comprese');
  var st = RP.computeStats(s);
  same(st.teams.map(function (t) { return [t.id, t.points]; }).sort(), Object.keys(SS.totals(s)).map(function (k) { return [k, SS.totals(s)[k]]; }).sort());
  assert.ok(csv.slice(1).some(function (r) { return r[iR] === 'pair-3' && r[iPt] === '10'; }));
});
test('RC2-A.2 G. server: commit di coppie, parole e finale con la scala → stessi punti della regia (score.verified)', function () {
  var t = { now: 9000000 };
  var room = new Room({ clock: function () { return t.now; }, pin: '4821', graceMs: 500 });
  room.setSession('s-rc2a2');
  room.syncParticipants(TEAMS3);
  /* senza tablet: il server non ha risposte proprie e ricalcola dai record della regia con la stessa scala */
  var ctx = fullGame(true);
  same(SS.totals(ctx.state.session), { a: 50 + 300 + 100, b: 20 - 100 + 300, c: 100 + 290 }, 'senza tablet: finale e parola 1 a rango (300, 100)');
  ctx.commits.forEach(function (c) {
    var srv = room.commit(c);
    assert.ok(srv.ok, c.roundInstanceId);
    same(pts(srv.scoreEvents), ctx.committedPoints(c.roundInstanceId), 'server = regia per ' + c.roundInstanceId + ' (' + c.scale + ')');
    ctx.serverCommitted({ roundInstanceId: c.roundInstanceId, scoreEvents: srv.scoreEvents });
  });
  assert.ok(ctx.logs.indexOf('score.server_override') < 0 && ctx.logs.filter(function (e) { return e === 'score.verified'; }).length === ctx.commits.length);
  // dopo un riavvio del server (stato da disco) un commit successivo conta le omissioni allo stesso modo
  var reloaded = Room.fromJSON(JSON.parse(JSON.stringify(room.toJSON())), { clock: function () { return t.now; } });
  assert.ok(Object.keys(reloaded.commits).length === ctx.commits.length && Object.keys(reloaded.commits).every(function (id) { return 'scale' in reloaded.commits[id]; }), 'la scala sopravvive al riavvio del server');
  var after = reloaded.commit({ roundInstanceId: 'q-after', profileId: 'show_speed', scale: 'standard', openedAt: '2030-01-01T00:00:00Z', records: [{ participantId: 'a', inputMode: 'manual', outcome: 'omitted', auto: true }] });
  same(after.scoreEvents[0].omissionNumber, 2, 'dopo il riavvio: per a conta solo l’omissione del Photopuzzle (non quelle delle parole), questa è la 2ª');
});

test('RC2-A.2 G. server: voto A/B reale di un tablet → coppia confermata con +10, nessuna correzione', function () {
  var t = { now: 9000000 };
  var room = new Room({ clock: function () { return t.now; }, pin: '4821', graceMs: 500 });
  room.setSession('s-rc2a2-pair');
  room.syncParticipants(TEAMS3);
  var j = room.join({ pin: '4821' }), d = room.assign(j.device.deviceId, 'a');
  assert.ok(room.openRound({ roundInstanceId: 'pair-round-0', kind: 'arcade', gameType: 'ghigliottina', layout: 'mcq', letters: ['A', 'B'], correct: null, durationMs: 300000 }).ok);
  t.now += 1500;
  var ans = room.answer(d.deviceId, { roundInstanceId: 'pair-round-0', answer: 'A', deviceToken: d.deviceToken });
  assert.ok(ans.accepted);
  var ctx = hostCtx(45, { a: true }), a = ghGame();
  a.step = 0; a.pairOpenedAt = nextISO(); a.votes = { a: 'A' }; a.voteMeta = { a: { responseTimeMs: ans.record.responseTimeMs, deviceId: d.deviceId, responseId: ans.record.responseId } }; a.ghManual = { b: 'B' };
  ctx.ghCommitPair(a, a.pairs[0], 'pair-round-0');
  var srv = room.commit(ctx.commits[0]);
  same(pts(srv.scoreEvents), { a: 10, b: 0, c: 0 });
  assert.strictEqual(srv.corrected, 0);
  ctx.serverCommitted({ roundInstanceId: 'pair-round-0', scoreEvents: srv.scoreEvents });
  assert.ok(ctx.logs.indexOf('score.verified') >= 0);
});

/* ---------------- intro e RISULTATO DEL GIOCO nel flusso della regia ---------------- */
/* RC2-A.3: l'intro breve è stata sostituita dalla TENDINA persistente; i suoi test sono in rc2a3_show_editor.test.js. */
test('RC2-A.2 RISULTATO DEL GIOCO: 1° AVANTI conferma e mostra il risultato (una volta), 2° AVANTI prosegue; senza punti si prosegue', function () {
  var calls = [];
  var ctx = { state: { screen: 'arcade', arcade: { type: 'indovina', gameId: 'g1', played: true }, session: { rounds: [] } },
    settleArcadeForNext: function () { calls.push('settle'); ctx.state.session.rounds.push({ roundInstanceId: 'r1', committed: true, gameInstanceId: 'g1' }); ctx.state.arcade.scoreCommitted = true; return true; },
    ghClosePairRound: function () {}, stopTimer: function () {}, renderAll: function () {}, cloneAudio: function () {}, logEvent: function (e) { calls.push(e.event); }, autosave: function () {} };
  vm.runInNewContext(extractFrom(APP, ['gameRounds', 'gameResultsStep', 'showGameResults']), ctx);
  assert.strictEqual(ctx.gameResultsStep(), 'shown');
  assert.ok(ctx.state.arcade.resultsVisible);
  assert.strictEqual(ctx.gameResultsStep(), 'proceed', 'il risultato non ricompare: il 2° AVANTI prosegue');
  same(calls, ['settle', 'game.results']);
  ctx.state.arcade = { type: 'chain', gameId: 'g2', played: true, curtain: false };
  ctx.settleArcadeForNext = function () { return true; }; // nessuna risposta: il docente conferma di proseguire senza punti
  assert.strictEqual(ctx.gameResultsStep(), 'proceed');
  ctx.state.arcade = { type: 'chain', gameId: 'g3', curtain: true };
  assert.strictEqual(ctx.gameResultsStep(), 'proceed', 'dalla tendina (RC2-A.3) si salta il gioco senza risultato');
  ctx.state.arcade = { type: 'chain', gameId: 'g4', played: true };
  ctx.settleArcadeForNext = function () { return false; };
  assert.strictEqual(ctx.gameResultsStep(), 'blocked', 'avviso «senza risposta»: si resta sul gioco');
  assert.ok(/if\(state\.screen==='arcade'&&!state\.arcade\?\.resultsVisible\)\{const g=gameResultsStep\(\);if\(g!=='proceed'\)return\}/.test(APP), 'archivio: AVANTI');
  assert.ok(/if\(a&&!a\.resultsVisible\)\{const g=gameResultsStep\(\);if\(g!=='proceed'\)return\}/.test(APP), 'scaletta: AVANTI');
  var m = RC.cockpit({ screen: 'arcade', arcade: { type: 'indovina', name: 'Indovina', played: true, solutionShown: true } });
  same([m.stage, m.main[0].label], ['g-revealed', 'RISULTATO DEL GIOCO →']);
  var r = RC.cockpit({ screen: 'arcade', arcade: { type: 'indovina', name: 'Indovina', played: true, solutionShown: true, resultsVisible: true } });
  same([r.stage, r.main[0].act], ['g-results', 'next']);
  var ch = RC.cockpit({ screen: 'arcade', arcade: { type: 'chain', name: 'Catena', played: true, solutionShown: true, chainHasNext: true } });
  assert.strictEqual(ch.main[0].act, 'chainNext', 'Catena: PAROLA SUCCESSIVA, il risultato arriva alla fine');
});
test('RC2-A.2 RISULTATO DEL GIOCO: risposta, esito, tempo, punti del gioco e parziali; nessuna classifica, totale o posizione', function () {
  var ctx = fullGame();
  ctx.state.teams[0].score = 9999;
  Object.assign(ctx, { esc: function (x) { return String(x); }, BRAND_LOGO: 'logo.svg', gameName: function (t) { return t === 'chain' ? 'Catena' : 'Parola segreta'; },
    fmtSec: function (ms) { return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',') + ' s'; } });
  vm.runInNewContext(extractFrom(APP, ['arcadeSolution', 'arcadeSolutionFull', 'gameResultsHTML']), ctx);
  var gh = ctx.gameResultsHTML(Object.assign(ghGame(), { final: true }));
  assert.ok(/RISULTATO DEL GIOCO/.test(gh) && /ARCO/.test(gh));
  assert.ok(/SCELTE 5\/5 \+50 PT · FINALE ✓ \+290/.test(gh) && /4,5 s/.test(gh) && /\+340/.test(gh), 'Blu: 5 scelte +50, finale 4,5 s +290, gioco +340');
  assert.ok(/SCELTE 2\/5 \+20 PT · FINALE ✗ −100/.test(gh), 'Rossi: parziali e finale errata');
  assert.ok(!/CLASSIFICA|9999|podium|\d°/.test(gh), 'nessuna classifica, nessun totale della partita, nessuna posizione');
  var ch = ctx.gameResultsHTML({ type: 'chain', gameId: 'game-chain-9', label: 'Catena', links: [{ to: 'B' }, { to: 'C' }] });
  assert.ok(/B → C/.test(ch) && /PAROLE/.test(ch) && /1 ✓ \+90 · 2 Ø 0/.test(ch) && /noTime/.test(ch));
});

/* ---------------- 3. testi del punteggio chiari ---------------- */
test('RC2-A.2 testi: niente «200 + bonus»; regole reali per domanda e per ogni gioco', function () {
  ['js/app.js', 'js/engine/scoring.js', 'GUIDA_DOCENTE.html', 'INIZIA_QUI.html', 'RISOLUZIONE_PROBLEMI.html'].forEach(function (f) {
    assert.ok(!/200 \+ bonus|200 per la correttezza più un bonus|a mano = 200/.test(source(f)), f);
  });
  assert.strictEqual(SC.gameRules('question', 'show_speed'), '✓ Corretta: 200–300 pt in base alla velocità · ✗ Errata −100 · Ø Nessuna risposta 0');
  assert.strictEqual(SC.gameRules('ghigliottina', 'show_speed'), 'Ogni scelta corretta +10 pt · Risposta finale corretta 200–300 pt in base alla velocità');
  assert.strictEqual(SC.gameRules('chain', 'show_speed'), 'Ogni parola corretta 50–100 pt in base alla velocità · Errata o nessuna risposta 0');
  assert.strictEqual(SC.gameRules('chain', 'show_standard'), SC.rulesSummary('show_standard'), 'profili storici: regola di sempre');
  assert.ok(/class="arcadeRule">\$\{esc\(SC\.gameRules\(a\.type,profileId\(\)\)\.toUpperCase\(\)\)\}/.test(APP), 'ogni gioco mostra sul palco il proprio punteggio');
});

/* ---------------- F. tastiera con cursore ---------------- */
function kb() { var ctx = {}; vm.runInNewContext(extractFrom(PLAYER, ['editText'], '  '), ctx); return ctx.editText; }
test('RC2-A.2 F. tastiera: inserimento all’inizio, in mezzo e alla fine nel punto del cursore', function () {
  var E = kb();
  same(E('ROMA', 4, 4, 'insert', 'N', 40), { value: 'ROMAN', caret: 5, changed: true });
  same(E('ROMA', 0, 0, 'insert', 'T', 40), { value: 'TROMA', caret: 1, changed: true });
  same(E('ROA', 2, 2, 'insert', 'M', 40), { value: 'ROMA', caret: 3, changed: true }, 'lettera mancante nel mezzo: il resto non si cancella');
  same(E('ROMA', 99, 99, 'insert', 'X', 40).value, 'ROMAX', 'cursore oltre la fine → fine');
});
test('RC2-A.2 F. tastiera: la selezione si sostituisce digitando; ⌫ cancella la selezione oppure il carattere prima', function () {
  var E = kb();
  same(E('LA ROMA', 3, 7, 'insert', 'C', 40), { value: 'LA C', caret: 4, changed: true });
  same(E('ROSSA', 2, 4, 'insert', 'M', 40), { value: 'ROMA', caret: 3, changed: true });
  same(E('LA ROMA', 0, 3, 'backspace', null, 40), { value: 'ROMA', caret: 0, changed: true });
  same(E('ROXMA', 3, 3, 'backspace', null, 40), { value: 'ROMA', caret: 2, changed: true });
  same(E('ROMA', 0, 0, 'backspace', null, 40), { value: 'ROMA', caret: 0, changed: false });
  same(E('ROMA', 3, 1, 'insert', 'Z', 40).value, 'RZA', 'selezione al contrario');
  same(E('ROMA', 1, 3, 'clear', null, 40), { value: '', caret: 0, changed: true });
});
test('RC2-A.2 F. tastiera: accenti, apostrofo, frase intera, spazi e testo lungo con limite', function () {
  var E = kb();
  var v = '', c = 0;
  ['C', 'I', 'T', 'T', 'À', ' ', 'D', 'E', 'L', 'L', '\'', 'A', 'R', 'C', 'O'].forEach(function (ch) { var r = E(v, c, c, ch === ' ' ? 'space' : 'insert', ch, 40); v = r.value; c = r.caret; });
  assert.strictEqual(v, 'CITTÀ DELL\'ARCO');
  same(E('ROMA', 0, 0, 'space', null, 40).changed, false, 'niente spazio all’inizio');
  same(E('LA ROMA', 3, 3, 'space', null, 40).changed, false, 'niente doppio spazio (dopo uno spazio)');
  same(E('LA ROMA', 2, 2, 'space', null, 40).changed, false, 'niente doppio spazio (prima di uno spazio)');
  same(E('LAROMA', 2, 2, 'space', null, 40).value, 'LA ROMA', 'spazio in mezzo');
  var long = 'IL FORO ROMANO E LA VIA SACRA FINO AL CO';
  assert.strictEqual(long.length, 40);
  same(E(long, 40, 40, 'insert', 'L', 40).changed, false, 'mai oltre il limite');
  same(E(long, 0, 3, 'insert', 'Q', 40).value, 'QFORO ROMANO E LA VIA SACRA FINO AL CO', 'sostituire una selezione è sempre possibile');
  same(E(long, 5, 5, 'backspace', null, 40).value, 'IL FRO ROMANO E LA VIA SACRA FINO AL CO');
});
test('RC2-A.2 F. tastiera: vero campo di testo (input con cursore, nessuna tastiera di sistema), tasti nel punto del cursore', function () {
  var ctx = { st: { textBuf: 'ROMA', kbDigits: false, sending: false, connected: true, round: null } };
  vm.runInNewContext(extractFrom(PLAYER, ['esc', 'currentAnswer', 'keysHTML'], '  '), ctx);
  var h = ctx.keysHTML({ layout: 'text', maxLength: 40, status: 'open' }, false);
  assert.ok(/<input id="textInput" class="textDisplay textField" type="text" inputmode="none"/.test(h) && /maxlength="40"/.test(h) && /value="ROMA"/.test(h));
  assert.ok(/applyEdit\('insert', el\.getAttribute\('data-char'\) \|\| ''\);/.test(PLAYER), 'i tasti inseriscono nel punto del cursore');
  assert.ok(/f\.setSelectionRange\(sel\.start, sel\.end\)/.test(PLAYER) && /selectionchange/.test(PLAYER), 'il cursore segue il campo');
  assert.ok(/e\.target\.closest\('\.kbKey'\)\) e\.preventDefault\(\)/.test(PLAYER), 'i tasti non rubano il fuoco');
  assert.ok(/st\.round\.status === 'open' && !st\.round\.myAnswer/.test(PLAYER), 'conferma e fine tempo ridisegnano anche con il campo a fuoco');
  assert.ok(/min-height:44px/.test(source('css/player.css')), 'tasti alti almeno 44 px (invariato)');
});

/* ---------------- regia: stessa raccolta manuale della RC1 (contesto di training_rc1) ---------------- */
function manualCtx(n) {
  var teams = [];
  for (var i = 1; i <= n; i++) teams.push({ id: 't' + i, name: 'Squadra ' + i, score: 0 });
  var ctx = {
    SC: SC, SS: SS, FREE_OMISSIONS: 3, esc: function (x) { return String(x); }, C: { clone: function (x) { return JSON.parse(JSON.stringify(x)); } },
    state: { screen: 'question', phase: 'scoring', questionScored: false, teams: teams, pending: {}, entryMeta: {}, pendingOrder: [], correctOrder: [], pendingHistory: [], entrySeq: 0,
      round: { roundInstanceId: 'r-q', kind: 'question', availableMs: 15000 }, qRound: { correctDisplayLetter: 'B' }, session: SS.createSession({ scoringProfile: 'show_speed' }), cursor: 0 },
    profileId: function () { return 'show_speed'; }, logEvent: function () {}, afterEntryChange: function () {}, ensureArcadeRound: function () {}, toast: function () {}, renderAll: function () {}
  };
  vm.runInNewContext(extractFrom(APP, ['canEnter', 'pushHistory', 'entryOutcome', 'questionOutcome', 'setPending', 'entryOrder', 'previewRecords', 'roundAvailableMs', 'previewRows', 'priorOmissions', 'scoreOptions', 'previewPoints', 'manualRound', 'speedProfile', 'speedOffRound', 'fmtSec', 'scoreOrderHTML']), ctx);
  return ctx;
}
