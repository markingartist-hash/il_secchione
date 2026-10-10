'use strict';
/* v3.7.0 SESSION PLANNER: scaletta della puntata (engine/sessionPlan.js), regia "one screen" (roundControl.cockpit),
   integrazione nella regia (js/app.js in sandbox), report, persistenza. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness.js').test;
var H = require('./helpers.js');
var SP = require('../js/engine/sessionPlan.js');
var RC = require('../js/engine/roundControl.js');
var RP = require('../js/engine/report.js');
var PE = require('../js/engine/packs.js');
var PL = require('../js/engine/packlib.js');
var SS = require('../js/engine/session.js');

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function seq(values) { var i = 0; return function () { var v = values[i % values.length]; i++; return v; }; }
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }

/* due pacchetti veri del programma, in forma runtime */
function runtimeOf(id) {
  var full = require('../tools/build_packs.js').loadPackFolder(path.join(ROOT, 'packs', id));
  return PE.toRuntime(PE.validatePack(full).pack, { origin: 'installed' });
}
var RT = runtimeOf('arte_romana');
function partOf(rt, questions) {
  return { pack: { id: rt.id, title: rt.title, version: (rt.meta || {}).version || '' }, questions: PL.composeBank([{ pack: rt, questions: questions || rt.questions }]), games: rt.arcadeSets, gameNames: rt.gameNames };
}
var PART = partOf(RT);
function firstGameType(rt) { return ['ghigliottina', 'chain', 'indovina', 'photopuzzle', 'abbinamenti'].filter(function (t) { return (rt.arcadeSets[t] || []).length > 1; })[0]; }

/* ---------------- 1. modello della scaletta ---------------- */
test('Scaletta: gli elementi sono RIFERIMENTI (packId/questionId, tipo+manche), nessun contenuto copiato', function () {
  var q = PART.questions[3];
  var it = SP.questionItem(q);
  assert.strictEqual(it.kind, 'question');
  assert.strictEqual(it.packId, RT.id);
  assert.strictEqual(it.questionId, q.id);
  assert.strictEqual(it.sourceQuestionId, q.source.questionId);
  assert.strictEqual(it.packVersion, RT.meta.version);
  ['options', 'correct', 'explanation', 'question', 'acceptedAnswers'].forEach(function (k) { assert.ok(!(k in it), 'campo copiato: ' + k); });
  assert.ok(it.preview.title.length > 0 && it.preview.type);
  var type = firstGameType(RT), sets = RT.arcadeSets[type];
  var g = SP.gameItem(PART.pack, type, sets, 1);
  assert.strictEqual(g.kind, 'game'); assert.strictEqual(g.gameType, type); assert.strictEqual(g.label, sets[1].label);
  ['links', 'pairs', 'answer', 'clues', 'cards', 'subject', 'image'].forEach(function (k) { assert.ok(!(k in g), 'campo gioco copiato: ' + k); });
});

test('Scaletta: nessuna duplicazione silenziosa; la duplicazione esplicita crea un nuovo elemento collegato', function () {
  var plan = SP.createPlan('Prova');
  var a = SP.questionItem(PART.questions[0]), b = SP.questionItem(PART.questions[1]);
  same(SP.addItems(plan, [a, b]).added, 2);
  var again = SP.addItems(plan, [SP.questionItem(PART.questions[0]), SP.questionItem(PART.questions[2])]);
  assert.strictEqual(again.added, 1); assert.strictEqual(again.skipped, 1);
  assert.strictEqual(plan.items.length, 3);
  var type = firstGameType(RT), sets = RT.arcadeSets[type];
  assert.strictEqual(SP.addItems(plan, [SP.gameItem(PART.pack, type, sets, 0), SP.gameItem(PART.pack, type, sets, 0)]).added, 1, 'stessa manche una volta sola');
  var dup = SP.duplicate(plan, 0);
  assert.ok(dup && dup.uid !== a.uid);
  assert.strictEqual(dup.duplicateOf, a.uid);
  assert.strictEqual(plan.items[1], dup, 'la copia segue l’originale');
  assert.strictEqual(plan.items.length, 5);
});

test('Scaletta: ordine con SU/GIÙ (move), rimozione, mescola SOLO le domande (i giochi restano al loro posto)', function () {
  var plan = SP.createPlan('Ordine');
  var type = firstGameType(RT), sets = RT.arcadeSets[type];
  var qs = PART.questions.slice(0, 5).map(function (q) { return SP.questionItem(q); });
  var g1 = SP.gameItem(PART.pack, type, sets, 0), g2 = SP.gameItem(PART.pack, type, sets, 1);
  SP.addItems(plan, [qs[0], qs[1], g1, qs[2], qs[3], g2, qs[4]]);
  assert.ok(SP.move(plan, 2, 0));
  assert.strictEqual(plan.items[0], g1);
  assert.ok(!SP.move(plan, 0, 0), 'nessuno spostamento');
  assert.ok(SP.move(plan, 0, 99), 'oltre la fine = ultimo posto');
  assert.strictEqual(plan.items[plan.items.length - 1], g1);
  SP.move(plan, plan.items.length - 1, 2);
  var before = plan.items.map(function (x) { return x.uid; });
  var qBefore = plan.items.filter(function (x) { return x.kind === 'question'; }).map(function (x) { return x.uid; }).sort();
  SP.shuffleQuestions(plan, seq([0.9, 0.1, 0.5, 0.3, 0.7]));
  plan.items.forEach(function (it, i) { if (it.kind === 'game') assert.strictEqual(it.uid, before[i], 'gioco spostato'); });
  same(plan.items.filter(function (x) { return x.kind === 'question'; }).map(function (x) { return x.uid; }).sort(), qBefore, 'stesse domande');
  assert.notStrictEqual(plan.items.map(function (x) { return x.uid; }).join(), before.join(), 'ordine delle domande cambiato');
  var removed = SP.remove(plan, 0);
  assert.ok(removed); assert.strictEqual(plan.items.length, 6);
  assert.strictEqual(SP.remove(plan, 99), null);
});

test('Scaletta: contenuto non più presente = MANCANTE (mai sostituito); pacchetto mancante; anteprima aggiornata', function () {
  var plan = SP.createPlan('Mancanti');
  var type = firstGameType(RT), sets = RT.arcadeSets[type];
  var qa = SP.questionItem(PART.questions[0]), qb = SP.questionItem(PART.questions[1]), g = SP.gameItem(PART.pack, type, sets, 1);
  SP.addItems(plan, [qa, qb, g]);
  plan.items.push({ uid: 'aaaaaa111111', kind: 'question', packId: 'pacchetto_rimosso', packTitle: 'Vecchio', questionId: 'pacchetto_rimosso/q1', sourceQuestionId: 'q1', preview: { title: 'Domanda di un pacchetto eliminato' } });
  // il docente elimina la domanda B e rinomina la manche
  var qs = RT.questions.filter(function (q) { return q.id !== PART.questions[1].source.questionId; });
  var games = JSON.parse(JSON.stringify(RT.arcadeSets)); games[type][1].label = 'Titolo cambiato';
  var part = partOf(RT, qs); part.games = games;
  var r = SP.resolve(plan, SP.catalog([part]));
  assert.strictEqual(r.length, 4, 'nessun elemento sparisce dall’elenco');
  same(r.map(function (x) { return x.missing; }), [false, true, true, true]);
  assert.ok(/non più presente/.test(r[1].reason) && /non più presente/.test(r[2].reason) && /non installato/.test(r[3].reason));
  assert.strictEqual(r[1].questionId, qb.questionId, 'il riferimento resta quello originale');
  assert.strictEqual(r[2].label, sets[1].label);
  same(SP.summary(r), { total: 4, questions: 3, games: 1, missing: 3, playable: 1 });
  // anteprima aggiornata quando il contenuto esiste ancora (domanda modificata in classe)
  var edited = RT.questions.map(function (q) { return q.id === PART.questions[0].source.questionId ? Object.assign({}, q, { question: 'Testo corretto in classe?' }) : q; });
  assert.strictEqual(SP.resolve(plan, SP.catalog([partOf(RT, edited)]))[0].preview.title, 'Testo corretto in classe?');
});

test('Scaletta: manche con lo stesso titolo (occorrenza) e sessione mista con _packId, senza ripieghi', function () {
  var type = firstGameType(RT);
  var sets = [{ label: 'Doppia', x: 1 }, { label: 'Altra' }, { label: 'Doppia', x: 2 }];
  var item = SP.gameItem({ id: 'p1', title: 'P1' }, type, sets, 2);
  assert.strictEqual(item.occurrence, 1);
  assert.strictEqual(SP.findGameIndex(sets, item, 'p1'), 2);
  var mixed = [{ label: 'Doppia', _packId: 'p0' }, { label: 'Doppia', _packId: 'p1' }, { label: 'Altra', _packId: 'p1' }, { label: 'Doppia', _packId: 'p1' }];
  assert.strictEqual(SP.findGameIndex(mixed, item, 'p0'), 3, 'seconda «Doppia» di p1, non quella di p0');
  assert.strictEqual(SP.findGameIndex(mixed.slice(0, 3), item, 'p0'), -1, 'occorrenza sparita: mancante, non la prima disponibile');
});

test('Scaletta: salvataggio e riapertura (normalize, upsert, merge browser/server, esporta → importa)', function () {
  var plan = SP.createPlan('  Lezione   del lunedì  ');
  assert.strictEqual(plan.name, 'Lezione del lunedì');
  SP.addItems(plan, PART.questions.slice(0, 3).map(function (q) { return SP.questionItem(q); }));
  var back = SP.normalize(JSON.parse(SP.exportJSON(plan)));
  assert.ok(back.ok); assert.strictEqual(back.dropped, 0);
  same(back.plan.items, plan.items);
  assert.strictEqual(back.plan.id, plan.id);
  assert.strictEqual(SP.normalize({ format: 'secchione-snapshot', items: [] }).ok, false);
  assert.strictEqual(SP.normalize('ciao').ok, false);
  var raw = JSON.parse(SP.exportJSON(plan));
  raw.items.push({ kind: 'question', packId: 'x', questionId: '' }, { kind: 'game', packId: 'x', gameType: 'sconosciuto', label: 'a' }, { kind: 'boh' }, { kind: 'question', packId: RT.id, questionId: 'q999' });
  var n = SP.normalize(raw);
  assert.strictEqual(n.dropped, 3);
  assert.strictEqual(n.plan.items[3].questionId, RT.id + '/q999', 'id qualificato col pacchetto');
  var list = SP.upsert([], plan);
  var older = JSON.parse(JSON.stringify(plan)); older.name = 'Vecchia'; older.updatedAt = '2000-01-01T00:00:00.000Z';
  var newer = JSON.parse(JSON.stringify(plan)); newer.name = 'Nuova'; newer.updatedAt = '2099-01-01T00:00:00.000Z';
  assert.strictEqual(SP.mergeLists([older], [newer])[0].name, 'Nuova');
  assert.strictEqual(SP.mergeLists([newer], [older])[0].name, 'Nuova');
  var other = SP.createPlan('Altra');
  assert.strictEqual(SP.mergeLists(list, [other]).length, 2);
  assert.strictEqual(SP.upsert(list, Object.assign({}, plan, { name: 'Rinominata' })).length, 1, 'stesso id = sostituisce');
});

test('Scaletta in classe: AVANTI salta i mancanti, posizione n/n, record di sessione con pacchetto, versione ed esito', function () {
  var plan = SP.createPlan('Run');
  var type = firstGameType(RT), sets = RT.arcadeSets[type];
  SP.addItems(plan, [SP.questionItem(PART.questions[0]), SP.gameItem(PART.pack, type, sets, 0), SP.questionItem(PART.questions[1]), SP.questionItem(PART.questions[2])]);
  var qs = RT.questions.filter(function (q) { return q.id !== PART.questions[1].source.questionId; });
  var resolved = SP.resolve(plan, SP.catalog([partOf(RT, qs)]));
  var run = SP.startRun(plan, resolved, '2026-10-05T08:00:00.000Z');
  assert.strictEqual(SP.nextPlayable(run.items, -1), 0);
  run.cursor = 1;
  assert.strictEqual(SP.nextPlayable(run.items, 1), 3, 'il mancante viene saltato');
  assert.strictEqual(SP.prevPlayable(run.items, 3), 1);
  var pos = SP.position(run);
  same([pos.current, pos.total, pos.missing, pos.isLast], [2, 3, 1, false]);
  assert.strictEqual(pos.next, run.items[3]);
  run.visited[run.items[0].uid] = 'played'; run.visited[run.items[1].uid] = 'skipped';
  var rec = SP.sessionRecord(run);
  same(rec.items.map(function (x) { return x.status; }), ['played', 'skipped', 'missing', 'not_played']);
  same(rec.items.map(function (x) { return x.missing; }), [false, false, true, false]);
  assert.strictEqual(rec.items[0].packVersion, RT.meta.version);
  assert.strictEqual(rec.items[0].sourceQuestionId, PART.questions[0].source.questionId);
  assert.strictEqual(rec.items[1].gameType, type);
  run.cursor = 3; assert.ok(SP.position(run).isLast);
});

test('Report HTML: sezione Scaletta con contenuto, pacchetto, versione ed esito (nessuna sezione senza scaletta)', function () {
  var s = SS.createSession({ packId: RT.id, packVersion: RT.meta.version });
  var noPlan = RP.toHTML({ session: s, pack: { id: RT.id, title: RT.title }, app: '3.7.0' });
  assert.strictEqual(noPlan.indexOf('<h2>Scaletta'), -1);
  var plan = SP.createPlan('Verifica <3B>');
  SP.addItems(plan, [SP.questionItem(PART.questions[0])]);
  var run = SP.startRun(plan, SP.resolve(plan, SP.catalog([PART])));
  run.visited[run.items[0].uid] = 'played';
  s.plans = [SP.sessionRecord(run)];
  var html = RP.toHTML({ session: s, pack: { id: RT.id, title: RT.title }, app: '3.7.0' });
  assert.ok(html.indexOf('<h2>Scaletta · Verifica &lt;3B&gt;</h2>') >= 0, 'titolo escapato');
  assert.ok(html.indexOf(PART.questions[0].source.questionId) >= 0);
  assert.ok(html.indexOf('>' + RT.meta.version + '<') >= 0);
  assert.ok(html.indexOf('giocato') >= 0);
});

/* ---------------- 2. regia "one screen" ---------------- */
function ck(c) { return RC.cockpit(c); }
function acts(list) { return list.map(function (x) { return x.act; }); }
test('Regia one screen: una sola azione principale contestuale per fase (AVVIA → RIVELA → PROSSIMA/AVANTI)', function () {
  var base = { screen: 'question', teams: 4, timerRunning: false, answerVisible: false, questionScored: false, canUndo: false };
  var m = ck(Object.assign({}, base, { phase: 'preview' }));
  same(acts(m.main), ['launch']); same(acts(m.secondary), ['edit', 'next']); assert.strictEqual(m.showAnswers, false);
  m = ck(Object.assign({}, base, { phase: 'running', timerRunning: true }));
  same(acts(m.main), ['reveal']); same(acts(m.secondary), ['pause', 'add10', 'closeTime', 'cancel', 'edit']);
  assert.strictEqual(m.secondary[0].label, '⏸ PAUSA');
  assert.strictEqual(ck(Object.assign({}, base, { phase: 'running', timerRunning: false })).secondary[0].label, '▶ RIPRENDI');
  m = ck(Object.assign({}, base, { phase: 'scoring', canUndo: true }));
  same(acts(m.main), ['reveal']); same(acts(m.secondary), ['undo', 'repeat', 'cancel', 'edit']); assert.strictEqual(m.showAnswers, true);
  m = ck(Object.assign({}, base, { phase: 'scoring', answerVisible: true }));
  same(acts(m.main), ['next']); assert.strictEqual(m.main[0].label, 'PROSSIMA DOMANDA →');
  m = ck(Object.assign({}, base, { phase: 'scored', answerVisible: true, questionScored: true, isLast: true }));
  same(acts(m.main), ['next']); assert.strictEqual(m.main[0].label, '★ CLASSIFICA FINALE'); same(acts(m.secondary), ['reopen', 'repeat', 'edit']);
  m = ck(Object.assign({}, base, { phase: 'scored', answerVisible: true, questionScored: true, plan: { finished: false, nextTitle: '🎮 Staffetta' } }));
  assert.strictEqual(m.main[0].label, 'AVANTI →'); assert.strictEqual(m.main[0].sub, 'poi: 🎮 Staffetta');
});

test('Regia one screen: home, scaletta in pausa, classifica di fine scaletta', function () {
  var m = ck({ screen: 'home', teams: 1 });
  same(acts(m.main), ['startQuiz']); assert.ok(m.main[0].disabled); same(acts(m.secondary), ['openPlanner']);
  assert.ok(!ck({ screen: 'home', teams: 2 }).main[0].disabled);
  same(acts(ck({ screen: 'home', teams: 4, plan: { finished: false, position: '3 / 9' } }).main), ['planResume']);
  same(acts(ck({ screen: 'leaderboard', teams: 4, plan: { finished: false } }).main), ['next']);
  m = ck({ screen: 'leaderboard', teams: 4, plan: { finished: true } });
  same(acts(m.main), ['home']); same(acts(m.secondary), ['report']);
  same(acts(ck({ screen: 'rules', teams: 4 }).main), ['startQuiz'], 'schermo regole = home');
});

test('Regia one screen: giochi (avvio, aiuti, voto A/B Parola Segreta, soluzione, parola successiva, ripeti)', function () {
  var g = function (a, extra) { return ck(Object.assign({ screen: 'arcade', teams: 4, arcade: Object.assign({ name: 'Gioco' }, a) }, extra || {})); };
  Object.keys(RC.GAME_IDS).forEach(function (type) {
    var m = g({ type: type });
    same(acts(m.main), ['gameStart']); assert.strictEqual(m.main[0].id, RC.GAME_IDS[type].start);
    if (type !== 'ghigliottina') {
      m = g({ type: type, played: true, started: true });
      same(acts(m.main), ['gameReveal']); assert.strictEqual(m.main[0].id, RC.GAME_IDS[type].reveal);
      assert.ok(acts(m.secondary).indexOf('pause') >= 0 && acts(m.secondary).indexOf('add10') >= 0);
    }
  });
  same(acts(g({ type: 'indovina', played: true, started: true }).secondary), ['clue', 'eliminate', 'pause', 'add10', 'gameRestart']);
  assert.ok(g({ type: 'indovina', played: true, started: true, canAid: { clue: false } }).secondary[0].disabled, 'aiuti finiti = disattivato');
  var vote = g({ type: 'ghigliottina', played: true, started: true, votesA: 1, votesB: 3 });
  same(acts(vote.main), ['ghA', 'ghB']); assert.strictEqual(vote.main[1].label, 'SCEGLI B · 3 voti'); same(acts(vote.secondary), ['gameRestart']);
  assert.strictEqual(vote.showAnswers, false, 'il voto A/B non è una risposta');
  assert.ok(g({ type: 'ghigliottina', played: true, started: true, pairSelected: true }).main[0].disabled);
  same(acts(g({ type: 'ghigliottina', played: true, started: true, final: true }).main), ['gameReveal']);
  same(acts(g({ type: 'chain', played: true, solutionShown: true, chainHasNext: true }).main), ['chainNext']);
  same(acts(g({ type: 'chain', played: true, solutionShown: true }).main), ['next']);
  var closed = g({ type: 'photopuzzle', played: true, solutionShown: false }, { canUndo: true });
  same(acts(closed.main), ['gameReveal']); same(acts(closed.secondary), ['undo', 'gameRestart']);
  assert.strictEqual(g({ type: 'indovina', played: true, solutionShown: true, scoreCommitted: true }).secondary[0].label, '↺ RIPETI MANCHE');
  assert.strictEqual(g({ type: 'indovina', played: true, solutionShown: true }).secondary[0].label, '✕ ANNULLA ROUND');
});

test('Regia one screen: nessun doppione (stessa azione mai due volte), id unici, ogni azione esiste nella regia', function () {
  var app = source('js/app.js');
  var mapSrc = app.slice(app.indexOf('function cockpitAction('), app.indexOf('function onCockpitClick('));
  var phases = [];
  ['preview', 'running', 'scoring', 'scored'].forEach(function (ph) { [false, true].forEach(function (av) { [false, true].forEach(function (u) { phases.push({ screen: 'question', phase: ph, answerVisible: av, questionScored: ph === 'scored', canUndo: u, timerRunning: true, teams: 3 }); }); }); });
  Object.keys(RC.GAME_IDS).forEach(function (t) {
    [{}, { played: true, started: true }, { played: true, started: true, final: true }, { played: true }, { played: true, solutionShown: true }, { played: true, solutionShown: true, chainHasNext: true }].forEach(function (a) {
      phases.push({ screen: 'arcade', canUndo: true, teams: 3, arcade: Object.assign({ type: t, name: t }, a), plan: { finished: false } });
    });
  });
  phases.push({ screen: 'home', teams: 3 }, { screen: 'leaderboard', teams: 3, plan: { finished: true } });
  phases.forEach(function (c) {
    var m = RC.cockpit(c), all = m.main.concat(m.secondary);
    assert.ok(m.main.length >= 1 && m.main.length <= 2, 'una azione principale (due solo per A/B)');
    var a = acts(all); assert.strictEqual(new Set(a).size, a.length, 'azione ripetuta in ' + JSON.stringify(c) + ': ' + a);
    var ids = all.map(function (x) { return x.id; }).filter(Boolean); assert.strictEqual(new Set(ids).size, ids.length);
    a.forEach(function (act) { assert.ok(new RegExp('\\b' + act + '\\b').test(mapSrc), 'azione senza funzione: ' + act); });
  });
  // gli id storici dei comandi non esistono più come pulsanti fissi nella pagina (niente doppioni con la regia)
  var html = source('index.html');
  ['launchQuestionBtn', 'pauseQuestionBtn', 'addTimeBtn', 'endQuestionBtn', 'revealBtn', 'editQuestionBtn', 'cancelQuestionBtn', 'repeatQuestionBtn', 'reopenBtn', 'nextQBtn', 'undoAnswersBtn'].forEach(function (id) {
    assert.strictEqual(html.indexOf('id="' + id + '"'), -1, 'pulsante duplicato in index.html: ' + id);
  });
  var gc = app.slice(app.indexOf('function gameControlsHTML('), app.indexOf('function applyMatchEditor('));
  Object.keys(RC.GAME_IDS).forEach(function (t) { var g = RC.GAME_IDS[t]; [g.start, g.reveal].forEach(function (id) { assert.strictEqual(gc.indexOf('id="' + id + '"'), -1, 'comando gioco duplicato nella scheda GIOCHI: ' + id); }); });
  assert.strictEqual(gc.indexOf('data-gh='), -1);
  assert.ok(/id="cockpitMain"/.test(html) && /id="cockpitSecondary"/.test(html) && /id="cockpitStatus"/.test(html));
});

test('Regia one screen: mini indicatore Ø solo quando a una squadra resta al massimo 1 astensione gratuita', function () {
  var teams = [{ id: 'a', name: '3A' }, { id: 'b', name: '3B' }, { id: 'c', name: '3C' }];
  same(RC.freeOmissionAlert(teams, { a: 0, b: 1 }, 3), []);
  same(RC.freeOmissionAlert(teams, { a: 2, b: 5, c: 1 }, 3).map(function (x) { return x.name + ':' + x.left; }), ['3A:1', '3B:0']);
});

/* ---------------- 3. regia (js/app.js) in sandbox: AVANTI segue la scaletta ---------------- */
function extract(names) {
  var src = source('js/app.js');
  return names.map(function (name) {
    var start = src.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione della regia: ' + name);
    var rest = src.slice(start);
    var next = /^function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}
function planSandbox(questions, games) {
  var bank = PL.composeBank([{ pack: RT, questions: questions }]);
  var sets = games || RT.arcadeSets;
  var calls = [];
  var ctx = {
    SP: SP, RC: RC, SS: SS, TM: { secondsFor: function () { return 30; } }, calls: calls, confirmAnswer: true,
    P: {}, state: { bank: bank, packKey: RT.id, activePacks: [RT.id], teams: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }], screen: 'home', qIndex: 0, completedRounds: {}, planRun: null, arcade: null, pending: {}, phase: 'preview', questionScored: false, session: SS.createSession({}) },
    pack: function () { return { arcadeSets: sets, gameNames: RT.gameNames }; },
    q: function () { return ctx.state.screen === 'question' ? ctx.state.bank[ctx.state.qIndex] : null; },
    goQuestion: function (i) { var s = ctx.state; s.screen = 'question'; s.qIndex = i; s.arcade = null; var done = s.completedRounds[s.bank[i].id]; s.questionScored = !!done; s.phase = done ? 'scored' : 'preview'; s.repeatOf = null; calls.push('q:' + s.bank[i].id); },
    startArcade: function (type) { var s = ctx.state; s.screen = 'arcade'; s.arcade = { type: type, presetIndex: 0, label: sets[type][0].label, _packId: sets[type][0]._packId || s.packKey }; calls.push('g:' + type + ':0'); },
    loadArcadePreset: function (i) { var a = ctx.state.arcade; a.presetIndex = i; a.label = sets[a.type][i].label; calls.push('preset:' + i); },
    settleQuestionForNext: function () { var s = ctx.state; if (s.phase !== 'preview' && !s.questionScored) { s.completedRounds[ctx.q().id] = { roundInstanceId: 'r-' + ctx.q().id }; s.questionScored = true; calls.push('commit:' + ctx.q().id); } return true; },
    showQuestionResults: function () { return false; },
    commitArcadeScores: function () { ctx.state.arcade.scoreCommitted = true; calls.push('commitGame'); },
    showLeaderboard: function () { ctx.state.screen = 'leaderboard'; calls.push('leaderboard'); },
    leaveQuestionGuard: function () { return true; }, activatePacks: function () { return { ok: true }; },
    catalogParts: function () { return [partOf(RT, questions)]; },
    toast: function (m) { calls.push('toast:' + m); }, logEvent: function () {}, autosave: function () {}, renderAll: function () {}, resetTimer: function () {}, tab: function () {},
    ghClosePairRound: function () {}, stopTimer: function () {}, closeArcadeTabletRound: function () {},
    missingGuard: function () { return true; }, // RC1: avviso risposte mancanti, testato a parte
    confirm: function () { return ctx.confirmAnswer; }
  };
  ctx.P[RT.id] = RT;
  vm.runInNewContext(extract(['planLive', 'planCurrent', 'planOnItem', 'planItemFor', 'qNumber', 'planRecord', 'startPlan', 'planGo', 'planSkipMissing', 'planNext', 'planPrev', 'planResume', 'planFinish', 'settleArcadeForNext']), ctx);
  return ctx;
}

test('Regia: AVVIA SCALETTA + AVANTI (domanda → gioco → domanda duplicata → mancante saltato → fine = classifica)', function () {
  var type = firstGameType(RT), sets = RT.arcadeSets[type];
  var plan = SP.createPlan('Lezione');
  var q0 = SP.questionItem(PART.questions[0]), q1 = SP.questionItem(PART.questions[1]), q2 = SP.questionItem(PART.questions[2]);
  SP.addItems(plan, [q0, SP.gameItem(PART.pack, type, sets, 1), q1, q2]);
  SP.duplicate(plan, 0); SP.move(plan, 1, 3); // q0, game, q1, q0(bis), q2
  var keep = RT.questions.filter(function (q) { return q.id !== PART.questions[2].source.questionId; }); // q2 eliminata prima della lezione
  var ctx = planSandbox(keep);
  assert.strictEqual(ctx.startPlan(plan), true);
  var s = ctx.state, run = s.planRun;
  assert.strictEqual(run.items[4].missing, true);
  assert.strictEqual(run.visited[run.items[4].uid], 'missing');
  same(ctx.calls.slice(-1), ['q:' + q0.questionId]);
  same(ctx.qNumber(), { n: 1, total: 3 }, 'numerazione della scaletta (domande giocabili)');
  s.phase = 'running'; // il docente avvia e gioca la domanda
  ctx.planNext();
  same(ctx.calls.slice(-3), ['commit:' + q0.questionId, 'g:' + type + ':0', 'preset:1']);
  assert.strictEqual(run.visited[run.items[0].uid], 'played');
  assert.strictEqual(s.arcade.label, sets[1].label);
  assert.ok(ctx.planItemFor({ kind: 'arcade' }), 'il round del gioco è legato all’elemento della scaletta');
  s.arcade.played = true; s.pending = { t1: 'correct' };
  ctx.planNext();
  assert.ok(ctx.calls.indexOf('commitGame') >= 0, 'AVANTI conferma i punti del gioco');
  same(ctx.calls.slice(-1), ['q:' + q1.questionId]);
  ctx.planNext(); // q1 saltata senza avviarla
  assert.strictEqual(run.visited[run.items[2].uid], 'skipped');
  // duplicato di q0, già giocata: nuovo round pulito (ripetizione con punti mantenuti)
  assert.strictEqual(s.questionScored, false, 'il duplicato non mostra il round già confermato');
  assert.strictEqual(s.repeatOf, 'r-' + q0.questionId);
  same(ctx.qNumber(), { n: 3, total: 3 });
  ctx.planNext(); // ultimo giocabile → il mancante viene saltato → fine
  same(ctx.calls.slice(-2), ['leaderboard', 'toast:✓ Scaletta «Lezione» completata.']);
  assert.ok(run.finished && run.finishedAt);
  var rec = s.session.plans[0];
  same(rec.items.map(function (x) { return x.status; }), ['played', 'played', 'skipped', 'skipped', 'missing']);
});

test('Regia: deviazione dalla scaletta, INDIETRO senza nuovo round, contenuto sparito durante la lezione, gioco senza risposte', function () {
  var type = firstGameType(RT), sets = RT.arcadeSets[type];
  var plan = SP.createPlan('Deviazioni');
  var q0 = SP.questionItem(PART.questions[0]), q1 = SP.questionItem(PART.questions[1]), q5 = SP.questionItem(PART.questions[5]);
  SP.addItems(plan, [q0, q1, SP.gameItem(PART.pack, type, sets, 0), q5]);
  var ctx = planSandbox(RT.questions);
  ctx.startPlan(plan);
  var s = ctx.state, run = s.planRun;
  s.phase = 'running'; ctx.planNext(); // q0 giocata → q1
  // deviazione: il docente apre un'altra domanda dall'Archivio
  ctx.goQuestion(10);
  assert.strictEqual(ctx.planItemFor({ kind: 'question', questionId: s.bank[10].id }), null, 'la deviazione non viene attribuita alla scaletta');
  ctx.planNext();
  same(ctx.calls.slice(-1), ['q:' + q1.questionId], 'AVANTI riporta all’elemento della scaletta');
  ctx.planPrev();
  same(ctx.calls.slice(-1), ['q:' + q0.questionId]);
  assert.strictEqual(s.questionScored, true, 'tornando indietro si vede il round confermato, nessun nuovo round');
  assert.ok(!s.repeatOf);
  ctx.planNext(); ctx.planNext(); // → q1 → gioco
  assert.strictEqual(s.screen, 'arcade');
  s.arcade.played = true; s.pending = {};
  ctx.confirmAnswer = false; ctx.planNext();
  assert.strictEqual(s.screen, 'arcade', 'senza conferma si resta sul gioco');
  ctx.confirmAnswer = true;
  // q5 viene eliminata durante la lezione
  s.bank = s.bank.filter(function (q) { return q.id !== q5.questionId; });
  ctx.planNext();
  assert.strictEqual(ctx.calls.indexOf('commitGame'), -1, 'nessun punto senza risposte');
  assert.strictEqual(run.items[3].missing, true);
  assert.ok(ctx.calls.some(function (c) { return /non disponibile/.test(c); }), 'avviso al docente');
  same(ctx.calls.slice(-2), ['leaderboard', 'toast:✓ Scaletta «Deviazioni» completata.']);
  // HOME durante la scaletta: RIPRENDI torna all'elemento corrente
  var ctx2 = planSandbox(RT.questions);
  ctx2.startPlan(plan); ctx2.state.screen = 'home';
  ctx2.planResume();
  same(ctx2.calls.slice(-1), ['q:' + q0.questionId]);
});

test('Regia: AVVIA SCALETTA rifiuta meno di 2 squadre e scalette senza contenuti disponibili', function () {
  var plan = SP.createPlan('Vuota');
  var ctx = planSandbox(RT.questions);
  ctx.state.teams = [{ id: 't1', name: 'Sola' }];
  SP.addItems(plan, [SP.questionItem(PART.questions[0])]);
  assert.strictEqual(ctx.startPlan(plan), false);
  ctx.state.teams.push({ id: 't2', name: 'Due' });
  var gone = SP.createPlan('Sparita');
  gone.items.push({ uid: 'bbbbbb222222', kind: 'question', packId: 'altro_pacchetto', questionId: 'altro_pacchetto/q1', preview: { title: 'x' } });
  assert.strictEqual(ctx.startPlan(gone), false);
  assert.strictEqual(ctx.state.planRun, null);
});

/* ---------------- 4. cablaggio e persistenza ---------------- */
test('Cablaggio: script, finestra SCALETTA, preferenze (plans), istantanea (planRun), round con planItem, nuova partita', function () {
  var html = source('index.html'), app = source('js/app.js');
  assert.ok(html.indexOf('<script src="js/engine/sessionPlan.js"></script>') > html.indexOf('<script src="js/engine/roundControl.js"></script>'));
  assert.ok(html.indexOf('<script src="js/host/planner-ui.js"></script>') > html.indexOf('<script src="js/host/packs-ui.js"></script>'));
  assert.ok(html.indexOf('<script src="js/host/planner-ui.js"></script>') < html.indexOf('<script src="js/app.js"></script>'));
  assert.ok(/<dialog id="planDialog"/.test(html) && /id="planBtn"/.test(html));
  assert.ok(/importedPacks:legacyImported,plans:savedPlans,/.test(app), 'scalette nelle preferenze');
  assert.ok(/planRun:state\.planRun\|\|null\}\};/.test(app), 'scaletta in corso nell’istantanea');
  assert.ok(/state\.planRun=ui\.planRun\|\|null;/.test(app), 'ripresa della scaletta');
  assert.ok(/const pi=planItemFor\(r\);if\(pi\)rec\.planItem=pi;/.test(app));
  assert.ok(/function nextQuestion\(\)\{\n if\(planLive\(\)\)return planNext\(\);/.test(app), 'AVANTI = nextQuestion');
  assert.ok(/function goQuestion\(i\)\{RC\.applyDeferred\(state\);state\.repeatOf=null;/.test(app), 'repeatOf non sopravvive a un cambio di domanda');
  assert.strictEqual((app.match(/newSession\(true\);state\.completedRounds=\{\};state\.planRun=null;/g) || []).length, 2);
  assert.ok(/const VERSION='1\.0\.0-rc1\.2';/.test(app));
});

test('Persistenza: le scalette salvate nelle preferenze tornano dal server (GET /api/host/prefs, solo regia)', async function () {
  var app = await H.startServer();
  try {
    var hdr = { 'X-Secchione-Host': app.hostKey, 'Content-Type': 'application/json' };
    var plan = SP.createPlan('Sul server');
    SP.addItems(plan, [SP.questionItem(PART.questions[0])]);
    var prefs = { version: 35, plans: [plan] };
    assert.strictEqual((await H.get(app.base + '/api/host/prefs', { method: 'PUT', headers: hdr, body: JSON.stringify(prefs) })).status, 200);
    var back = await H.get(app.base + '/api/host/prefs', { headers: hdr });
    assert.strictEqual(back.status, 200);
    var merged = SP.mergeLists([], JSON.parse(back.body).plans);
    assert.strictEqual(merged[0].name, 'Sul server');
    same(merged[0].items, plan.items);
    assert.strictEqual((await H.get(app.base + '/api/host/prefs')).status, 403, 'senza chiave della regia');
    assert.ok(/loadServerPrefs: function/.test(source('js/host/store.js')));
  } finally { await H.stopServer(app); }
});
