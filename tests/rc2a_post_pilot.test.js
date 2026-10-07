'use strict';
/* RC2-A POST-PILOT — test di regressione degli interventi approvati dopo tre sessioni reali in classe:
   punteggio 200–300 (base correttezza + bonus velocità), tempi standard in un solo punto, risultato del round senza classifica,
   classifica solo su comando, leggibilità del palco (adattamento del testo, 4:3), schermo intero esplicito, tastiera delle pulsantiere. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness.js').test;
var C = require('../js/core.js');
var SC = require('../js/engine/scoring.js');
var SS = require('../js/engine/session.js');
var TM = require('../js/engine/timer.js');
var RC = require('../js/engine/roundControl.js');
var RP = require('../js/engine/report.js');
var PE = require('../js/engine/packs.js');
var FIT = require('../js/stage-fit.js');
var Room = require('../server/room.js').Room;

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var APP = source('js/app.js');
var PLAYER = source('js/player.js');
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
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
function extract(names) { return extractFrom(APP, names); }
function pts(list) { var o = {}; list.forEach(function (r) { o[r.participantId] = r.points; }); return o; }
function tab(id, ms, outcome, avail) { return { participantId: id, outcome: outcome || 'correct', inputMode: 'tablet', responseTimeMs: ms, availableMs: avail == null ? 15000 : avail, order: 1 }; }
function man(id, outcome, auto) { return { participantId: id, outcome: outcome, inputMode: 'manual', auto: !!auto, order: 1000 }; }

/* ---------------- 1. formula unica ---------------- */
test('RC2-A punteggio: tabelle 15 s e 45 s della richiesta (0 s = 300, scadenza = 200, lineare)', function () {
  same([0, 3, 6, 9, 12, 15].map(function (s) { return SC.speedPoints(s * 1000, 15000); }), [300, 280, 260, 240, 220, 200]);
  same([0, 10, 20, 30, 40, 45].map(function (s) { return SC.speedPoints(s * 1000, 45000); }), [300, 278, 256, 233, 211, 200]);
});
test('RC2-A punteggio: millisecondi, limiti, tempo oltre la scadenza, tempi mancanti (mai inventati)', function () {
  assert.strictEqual(SC.speedPoints(4200, 15000), 272, 'Rossi · 4,2 s su 15 s');
  assert.strictEqual(SC.speedPoints(7499, 15000), 250);
  assert.strictEqual(SC.speedPoints(7501, 15000), 250);
  assert.strictEqual(SC.speedPoints(15000, 15000), 200, 'allo scadere');
  assert.strictEqual(SC.speedPoints(15400, 15000), 200, 'arrivata nella tolleranza dopo la scadenza: 200, mai meno');
  assert.strictEqual(SC.speedPoints(-50, 15000), 300, 'mai più di 300');
  assert.strictEqual(SC.speedPoints(null, 15000), 200);
  assert.strictEqual(SC.speedPoints(3000, null), 200);
  assert.strictEqual(SC.speedPoints(3000, 0), 200);
  assert.strictEqual(SC.speedPoints('x', 15000), 200);
  for (var ms = 0; ms <= 16000; ms += 37) { var p = SC.speedPoints(ms, 15000); assert.ok(p >= 200 && p <= 300, 'clamp ' + ms); }
});
test('RC2-A punteggio: profilo predefinito show_speed; errata −100 e omissioni invariate; testo delle regole', function () {
  assert.strictEqual(SC.DEFAULT_PROFILE, 'show_speed');
  var p = SC.getProfile('show_speed');
  assert.strictEqual(p.wrong, -100); assert.strictEqual(p.omitted, 0);
  assert.ok(/Corretta 200–300/.test(SC.rulesSummary('show_speed')));
  var r = SC.scoreRound([tab('a', 3000), tab('b', 9000, 'wrong'), man('c', 'omitted'), man('d', 'omitted')], 'show_speed', { priorOmissions: { c: 0, d: 3 }, freeOmissions: 3 });
  same(pts(r), { a: 280, b: -100, c: 0, d: -100 }, 'la 4ª omissione vale come un errore, come prima');
});

/* ---------------- 2. regola dei round misti (decisione D1) ---------------- */
test('RC2-A D1: basta una CORRETTA inserita a mano e tutte le corrette del round valgono 200 (bonus disattivato)', function () {
  var r = SC.scoreRound([tab('a', 1000), tab('b', 6000), man('m', 'correct')], 'show_speed');
  same(pts(r), { a: 200, b: 200, m: 200 });
  assert.ok(r.every(function (x) { return x.speedOff && !x.timed; }));
  assert.ok(SC.hasManualCorrect([man('m', 'correct')]) && !SC.hasManualCorrect([man('m', 'wrong'), man('n', 'omitted')]));
});
test('RC2-A D1: se le risposte a mano sono solo errate o omesse, le corrette con tempo reale tengono il bonus 200–300', function () {
  same(pts(SC.scoreRound([tab('a', 3000), tab('b', 6000), man('m', 'wrong')], 'show_speed')), { a: 280, b: 260, m: -100 });
  same(pts(SC.scoreRound([tab('a', 3000), man('m', 'omitted')], 'show_speed', { priorOmissions: {}, freeOmissions: 3 })), { a: 280, m: 0 }, '0 digitato dal docente');
  same(pts(SC.scoreRound([tab('a', 3000), man('m', 'omitted', true), { participantId: 't', outcome: 'omitted', inputMode: 'tablet', auto: true }], 'show_speed', { priorOmissions: {}, freeOmissions: 3 })), { a: 280, m: 0, t: 0 }, 'Ø automatiche');
});
test('RC2-A punteggio: senza tempo misurato (a mano, tablet senza tempo, Ø automatica) una corretta vale 200', function () {
  same(pts(SC.scoreRound([man('m', 'correct')], 'show_speed')), { m: 200 });
  same(pts(SC.scoreRound([{ participantId: 't', outcome: 'correct', inputMode: 'tablet', responseTimeMs: null, availableMs: 15000 }], 'show_speed')), { t: 200 });
  same(pts(SC.scoreRound([{ participantId: 't', outcome: 'correct', inputMode: 'tablet', responseTimeMs: 3000 }], 'show_speed')), { t: 200 }, 'manca il tempo disponibile');
  same(pts(SC.scoreRound([{ participantId: 't', outcome: 'correct', inputMode: 'tablet', responseTimeMs: 3000 }], 'show_speed', { availableMs: 15000 })), { t: 280 }, 'tempo disponibile del round');
});
test('RC2-A D6: i profili classici restano per le partite già giocate (300/275, ex aequo RC1; Didattico 1 punto)', function () {
  same(pts(SC.scoreRound([tab('a', 1000), tab('b', 2000)].map(function (x, i) { x.order = i + 1; return x; }), 'show_standard')), { a: 300, b: 275 });
  same(pts(SC.scoreRound([tab('a', 1000), man('m', 'wrong')], 'show_standard')), { a: 300, m: -100 });
  same(pts(SC.scoreRound([tab('a', 1000), tab('b', 2000)], 'learning')), { a: 1, b: 1 });
  var s = SS.createSession({ scoringProfile: 'show_standard' });
  var recs = [tab('a', 1000), tab('b', 2000)].map(function (x, i) { x.order = i + 1; x.roundInstanceId = 'r1'; return SS.makeResponse(x); });
  s.responses = recs; s.rounds = [{ roundInstanceId: 'r1', committed: true, profileId: 'show_standard' }];
  s.scoreEvents = SS.scoreEventsFor(recs, 'show_standard', 'r1', {});
  same(SS.totals(s), { a: 300, b: 275 }, 'una partita salvata con il vecchio profilo non cambia');
  assert.ok(/if\(prefs\.scoringProfileRev!==2\)\{if\(!prefs\.scoringProfile\|\|prefs\.scoringProfile==='show_standard'\)prefs\.scoringProfile=SC\.DEFAULT_PROFILE;/.test(APP), 'le partite NUOVE passano al 200–300 una volta sola');
  assert.ok(/function newSession\(keep\)\{[^\n]*scoringProfile:SC\.hasProfile\(prefs\.scoringProfile\)\?prefs\.scoringProfile:SC\.DEFAULT_PROFILE/.test(APP));
});
test('RC2-A record: availableMs conservato da makeResponse ed eventi con il bonus velocità', function () {
  var r = SS.makeResponse({ participantId: 'a', outcome: 'correct', inputMode: 'tablet', responseTimeMs: 4200.4, availableMs: 15000.2 });
  assert.strictEqual(r.availableMs, 15000); assert.strictEqual(r.responseTimeMs, 4200);
  assert.strictEqual(SS.makeResponse({ participantId: 'a', outcome: 'correct' }).availableMs, null);
  var ev = SS.scoreEventsFor([r], 'show_speed', 'r1', {});
  assert.strictEqual(ev[0].points, 272); assert.strictEqual(ev[0].speedBonus, 72);
});

/* ---------------- 3. server: tempo disponibile autorevole, parità con la regia ---------------- */
function room() {
  var t = { now: 5000000 };
  var rm = new Room({ clock: function () { return t.now; }, pin: '4821', graceMs: 500 });
  rm.setSession('s-rc2');
  rm.syncParticipants([{ id: 'a', name: 'Blu' }, { id: 'b', name: 'Rossi' }, { id: 'm', name: 'Verdi' }]);
  function dev(team) { var j = rm.join({ pin: '4821' }); var d = rm.assign(j.device.deviceId, team); return { id: d.deviceId, token: d.deviceToken }; }
  return { t: t, room: rm, dev: dev };
}
test('RC2-A server: tempo disponibile = durata + secondi aggiunti (pause escluse); il server corregge la regia e calcola gli stessi punti', function () {
  var s = room(), A = s.dev('a'), B = s.dev('b');
  assert.ok(s.room.openRound({ roundInstanceId: 'round-rc2-0001', layout: 'mcq', letters: ['A', 'B', 'C', 'D'], correct: 'B', durationMs: 15000 }).ok);
  s.t.now += 3000; assert.ok(s.room.answer(A.id, { roundInstanceId: 'round-rc2-0001', answer: 'B', deviceToken: A.token }).accepted);
  s.room.pauseRound('round-rc2-0001'); s.t.now += 60000; s.room.resumeRound('round-rc2-0001');
  s.room.addTime('round-rc2-0001', 10000);
  s.t.now += 9000; assert.ok(s.room.answer(B.id, { roundInstanceId: 'round-rc2-0001', answer: 'B', deviceToken: B.token }).accepted);
  assert.strictEqual(s.room.availableMs['round-rc2-0001'], 25000);
  var own = s.room.responses.map(function (r) { return r.responseTimeMs; });
  same(own, [3000, 12000], 'la pausa non conta nel tempo di risposta');
  var hostRecords = [
    { participantId: 'a', inputMode: 'tablet', selectedAnswer: 'B', correctAnswer: 'B', outcome: 'correct', responseTimeMs: 1, availableMs: 999999, order: 1 },
    { participantId: 'b', inputMode: 'tablet', selectedAnswer: 'B', correctAnswer: 'B', outcome: 'correct', responseTimeMs: 12000, availableMs: 25000, order: 2 },
    { participantId: 'm', inputMode: 'manual', selectedAnswer: 'C', correctAnswer: 'B', outcome: 'wrong', order: 1000 }
  ];
  var c = s.room.commit({ roundInstanceId: 'round-rc2-0001', profileId: 'show_speed', records: hostRecords, availableMs: 25000 });
  same(pts(c.scoreEvents), { a: 288, b: 252, m: -100 }, '3 s e 12 s su 25 s');
  assert.ok(c.records.every(function (r) { return r.availableMs === 25000; }), 'stesso tempo disponibile per tutto il round');
  var hostEvents = SS.scoreEventsFor(c.records, 'show_speed', 'round-rc2-0001', { priorOmissions: {}, freeOmissions: 3 });
  same(pts(hostEvents), pts(c.scoreEvents), 'regia e server calcolano allo stesso modo');
  var saved = Room.fromJSON(JSON.parse(JSON.stringify(s.room.toJSON())));
  assert.strictEqual(saved.availableMs['round-rc2-0001'], 25000, 'sopravvive al riavvio del server');
});
test('RC2-A server: una corretta a mano azzera il bonus anche sul server (stessa regola D1)', function () {
  var s = room(), A = s.dev('a');
  s.room.openRound({ roundInstanceId: 'round-rc2-0002', layout: 'mcq', letters: ['A', 'B', 'C', 'D'], correct: 'A', durationMs: 15000 });
  s.t.now += 2000; s.room.answer(A.id, { roundInstanceId: 'round-rc2-0002', answer: 'A', deviceToken: A.token });
  var c = s.room.commit({ roundInstanceId: 'round-rc2-0002', profileId: 'show_speed', records: [
    { participantId: 'a', inputMode: 'tablet', selectedAnswer: 'A', correctAnswer: 'A', outcome: 'correct', responseTimeMs: 2000, order: 1 },
    { participantId: 'm', inputMode: 'manual', selectedAnswer: 'A', correctAnswer: 'A', outcome: 'correct', order: 1000 }] });
  same(pts(c.scoreEvents), { a: 200, m: 200 });
});
test('RC2-A regia: tempo disponibile nel round (avvio, +10 s, riapertura, conferma, riapertura del server)', function () {
  assert.ok(/r\.openedAt=SS\.nowISO\(\);r\.availableMs=Math\.round\(state\.timer\.duration\*1000\);/.test(APP), 'avvio domanda');
  assert.ok(/if\(state\.round\)state\.round\.availableMs=Math\.round\(state\.timer\.duration\*1000\);/.test(APP), '+10 s');
  assert.ok(/availableMs:roundAvailableMs\(\),inputMode:m\.inputMode/.test(APP), 'record della domanda');
  assert.ok(/NET\.commitRound\(\{[^}]*availableMs:av\}\)/.test(APP), 'conferma al server (RC2-A.1: stesso valore del calcolo locale)');
  assert.ok(/availableMs:saved\.availableMs\|\|/.test(APP), 'riapertura dei punti');
  assert.ok(/availableMs:Math\.round\(TM\.secondsFor\(a\.seconds,a\.type\)\*1000\)\}\);/.test(APP), 'giochi');
  assert.ok(/availableMs:lr\.availableMs\|\|Math\.round\(state\.timer\.duration\*1000\)/.test(APP), 'riapertura del round dopo riavvio del server');
  assert.ok(!/data-order-up|moveCorrectUp/.test(APP), 'niente pulsanti ▲: l\'ordine non dà più punti');
});
test('RC2-A report e CSV: colonne tempo disponibile e bonus velocità', function () {
  var i = RP.CSV_HEADER.indexOf('tempo_disponibile_ms'), j = RP.CSV_HEADER.indexOf('bonus_velocita');
  assert.ok(i > RP.CSV_HEADER.indexOf('tempo_ms') && j > RP.CSV_HEADER.indexOf('punti'));
  var s = SS.createSession({ scoringProfile: 'show_speed' });
  s.participants = [{ id: 'a', name: 'Blu' }];
  var rec = SS.makeResponse({ sessionId: s.sessionId, roundInstanceId: 'r1', participantId: 'a', outcome: 'correct', inputMode: 'tablet', responseTimeMs: 4200, availableMs: 15000, selectedAnswer: 'A', correctAnswer: 'A' });
  s.responses = [rec]; s.rounds = [{ roundInstanceId: 'r1', kind: 'question', committed: true, profileId: 'show_speed', question: {} }];
  s.scoreEvents = SS.scoreEventsFor([rec], 'show_speed', 'r1', {});
  var row = RP.toCSV({ session: s }).slice(1).trim().split('\r\n')[1].split(';');
  assert.strictEqual(row[i], '15000'); assert.strictEqual(row[RP.CSV_HEADER.indexOf('punti')], '272'); assert.strictEqual(row[j], '72');
});

/* ---------------- 4. tempi standard in un solo punto ---------------- */
test('RC2-A tempi: un solo punto (engine/timer.js): domande 15 s, immagini e risposte scritte 45 s; il valore del contenuto prevale', function () {
  same(TM.DEFAULTS, { question: 15, truefalse: 15, photopuzzle: 45, abbinamenti: 45, indovina: 45, chain: 45, ghigliottina: 45 });
  assert.strictEqual(TM.secondsFor({ image: 'x.jpg' }), 15, 'D4: A/B/C/D con immagine = 15 s');
  assert.strictEqual(TM.secondsFor({}, 'photopuzzle'), 45);
  assert.strictEqual(TM.secondsFor({ seconds: 20 }, 'photopuzzle'), 20, 'il contenuto prevale');
  assert.strictEqual(TM.secondsFor(undefined, 'chain'), 45);
  var q = PE.normalizeQuestion({ id: 'q', question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 'A' }, 0, {});
  assert.ok(!('seconds' in q), 'il normalizzatore non scrive più il default');
  assert.strictEqual(PE.normalizeQuestion({ id: 'q2', question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 'A', seconds: 30 }, 0, {}).seconds, 30, 'pack vecchi: valore esplicito rispettato');
  assert.ok(!('seconds' in PE.validateGame('chain', { label: 'S', links: [{ from: 'a', to: 'b' }] })));
  assert.strictEqual(PE.validateGame('chain', { label: 'S', seconds: 60, links: [{ from: 'a', to: 'b' }] }).seconds, 60);
});
test('RC2-A tempi: nessun numero di durata sparso nel codice; nessun minimo artificiale di 60 s (D3); tablet = palco nei giochi', function () {
  var files = ['js/app.js', 'js/core.js', 'js/engine/packs.js', 'js/engine/packstudio.js', 'js/studio/studio.js', 'server/room.js'];
  files.forEach(function (f) {
    var s = source(f);
    [/seconds\s*\|\|\s*30/, /seconds\s*\|\|\s*60/, /seconds:\s*30\b/, /seconds:\s*60\b/, /== null \? 30/, /Math\.max\(60,/, /TM\.create\(30\)/, /\|\| 30000\)/].forEach(function (re) { assert.ok(!re.test(s), f + ' contiene ' + re); });
  });
  assert.ok(/durationMs:Math\.round\(TM\.secondsFor\(a\.seconds,a\.type\)\*1000\)/.test(APP), 'la manche dei tablet dura quanto il timer del palco');
  assert.ok(/<script src="js\/engine\/timer\.js"><\/script>/.test(source('studio.html')), 'Pack Studio usa gli stessi tempi standard');
});
test('RC2-A tempi (D2): Arte romana aggiornato in modo dichiarato (3.6.0, nessuna durata scritta); i pack esterni non si toccano', function () {
  var pack = JSON.parse(source('packs/arte_romana/pack.json'));
  assert.strictEqual(pack.version, '3.6.0');
  assert.ok(/nessuna durata scritta nei contenuti/.test(pack.description));
  var q = JSON.parse(source('packs/arte_romana/questions.json'));
  assert.ok(q.length === 72 && q.every(function (x) { return !('seconds' in x) && TM.secondsFor(x) === 15; }));
  ['inglese_base', 'vulcani'].forEach(function (id) {
    var dir = path.join(ROOT, 'PACK_ESEMPI', id);
    if (fs.existsSync(path.join(dir, 'questions.json'))) {
      var raw = fs.readFileSync(path.join(dir, 'questions.json'), 'utf8');
      assert.ok(raw.length > 0, id);
    }
  });
});

/* ---------------- 5. risultato del round: riepilogo, non classifica ---------------- */
function roundCtx(profile, entries) {
  var teams = [{ id: 'a', name: 'Rossi', score: 900 }, { id: 'b', name: 'Verdi', score: 100 }, { id: 'c', name: 'Blu', score: 50 }, { id: 'd', name: 'Gialli', score: 0 }];
  var ctx = {
    C: C, SC: SC, SS: SS, FREE_OMISSIONS: 3, BRAND_LOGO: 'logo.svg', esc: function (x) { return String(x); },
    state: { teams: teams, pending: {}, entryMeta: {}, round: { roundInstanceId: 'r1' }, completedRounds: {}, qRound: { correctDisplayLetter: 'A', displayed: [{ letter: 'A', text: 'Uno' }, { letter: 'B', text: 'Due' }] } },
    q: function () { return { id: 'q1', question: 'Q?' }; }, qNumber: function () { return { n: 3, total: 10 }; },
    profileId: function () { return profile; }, entryOrder: function (id) { return ['a', 'b', 'c', 'd'].indexOf(id) + 1; },
    entryOutcome: function (id) { return ctx.state.pending[id] === 'abstain' ? 'omitted' : 'x'; }, priorOmissions: function () { return {}; },
    committedPoints: function () { return ctx.points; }, previewPoints: function () { return ctx.points; }
  };
  entries.forEach(function (e) { ctx.state.pending[e[0]] = e[1]; ctx.state.entryMeta[e[0]] = e[2]; });
  vm.runInNewContext(extract(['speedProfile', 'fmtSec', 'roundResultRows', 'roundResultsHTML']), ctx);
  return ctx;
}
test('RC2-A risultato del round: esito, tempo, punti del round; niente posizioni, podio, totali né "classifica"', function () {
  var ctx = roundCtx('show_speed', [['a', 'A', { inputMode: 'tablet', responseTimeMs: 4200 }], ['b', 'A', { inputMode: 'tablet', responseTimeMs: 7800 }], ['c', 'B', { inputMode: 'tablet', responseTimeMs: 11100 }]]);
  ctx.points = { a: 272, b: 248, c: -100, d: 0 };
  var h = ctx.roundResultsHTML();
  assert.ok(/RISULTATO DEL ROUND/.test(h) && !/CLASSIFICA/.test(h));
  assert.ok(!/resultPos">\d/.test(h) && !/\d°/.test(h), 'nessun numero di posizione');
  assert.ok(!/podium|\bp1\b|TOTALE|>900</.test(h), 'nessun podio e nessun totale (Rossi ha 900 in regia)');
  var i = h.indexOf('Rossi'), j = h.indexOf('Verdi'), k = h.indexOf('Blu'), z = h.indexOf('Gialli');
  assert.ok(i < j && j < k && k < z, 'corrette per tempo, poi errate, poi Ø');
  assert.ok(/4,2 s/.test(h) && /\+272/.test(h) && /bonus velocità \+72/.test(h) && /11,1 s/.test(h) && /−100/.test(h));
  assert.ok(/--reveal-delay:0ms/.test(h), 'cascata dall\'alto: la prima riga compare subito');
});
test('RC2-A risultato del round: corretta a mano nel round → "senza bonus" e 200; corretta a mano da sola → "inserita a mano"', function () {
  var ctx = roundCtx('show_speed', [['a', 'A', { inputMode: 'tablet', responseTimeMs: 4200 }], ['b', 'A', { inputMode: 'manual' }]]);
  ctx.points = { a: 200, b: 200 };
  var h = ctx.roundResultsHTML();
  assert.ok(/senza bonus: risposta corretta a mano nel round/.test(h) && /A MANO/.test(h) && /tutte le corrette valgono 200/.test(h));
  var only = roundCtx('show_speed', [['b', 'A', { inputMode: 'manual' }]]); only.points = { b: 200 };
  assert.ok(/inserita a mano/.test(only.roundResultsHTML()));
});

/* ---------------- 6. classifica solo su comando ---------------- */
function boardCtx(plan) {
  var calls = [];
  var ctx = {
    RC: RC, calls: calls, BRAND_LOGO: 'logo.svg', Date: Date,
    state: { screen: 'question', teams: [{ id: 'a', name: 'A', score: 10 }, { id: 'b', name: 'B', score: 5 }], session: SS.createSession({}), finalReveal: null, bank: [{ id: 'q1' }, { id: 'q2' }], qIndex: 1, roundResultsVisible: true, completedRounds: { q2: {} }, planRun: plan || null },
    esc: String, pack: function () { return { title: 'Arte' }; }, arcadeEpoch: 0,
    leaveQuestionGuard: function () { return true; }, stopTimer: function () {}, renderAll: function () { calls.push('render'); }, cloneAudio: function () {},
    showTransition: function (t) { calls.push('transition:' + t); }, autosave: function () {}, logEvent: function (e) { calls.push('log:' + e.event); },
    planLive: function () { return null; }, planNext: function () { calls.push('planNext'); }, goQuestion: function (i) { calls.push('go:' + i); }, showQuestionResults: function () { return false; },
    q: function () { return ctx.state.bank[ctx.state.qIndex]; }
  };
  vm.runInNewContext('var arcadeEpoch=0;\n' + extract(['teamOutcomeStats', 'finalStandings', 'podiumInfo', 'revealNextPlace', 'revealAllPlaces', 'contentFinished', 'showLeaderboard', 'showFinished', 'leaderboardHTML', 'nextQuestion']), ctx);
  return ctx;
}
test('RC2-A classifica: alla fine dei contenuti AVANTI mostra FINE DEI CONTENUTI, mai la classifica; AVANTI lì non fa nulla', function () {
  var ctx = boardCtx();
  ctx.nextQuestion();
  assert.strictEqual(ctx.state.screen, 'finished'); assert.strictEqual(ctx.state.finalReveal, null);
  assert.ok(ctx.state.contentDone);
  ctx.nextQuestion(); ctx.nextQuestion();
  assert.strictEqual(ctx.state.screen, 'finished', 'AVANTI non apre la classifica');
  var m = RC.cockpit({ screen: 'finished', teams: 2 });
  same(m.main.map(function (x) { return x.act; }), ['leaderboard']); assert.strictEqual(m.main[0].label, '★ CLASSIFICA FINALE');
  ctx.showLeaderboard({ type: 'click' });
  assert.ok(ctx.state.finalReveal.final, 'dopo la fine dei contenuti è la classifica finale');
  assert.ok(/CLASSIFICA FINALE/.test(ctx.leaderboardHTML()));
});
test('RC2-A classifica: ★ CLASSIFICA a metà partita = proclamazione dall\'ultimo; poi TORNA AL GIOCO allo stesso punto', function () {
  var ctx = boardCtx(); ctx.state.qIndex = 0; ctx.state.completedRounds = { q1: {} };
  ctx.showLeaderboard({ type: 'click' });
  assert.ok(ctx.state.finalReveal && ctx.state.finalReveal.final === false && ctx.state.finalReveal.shown === 0);
  ctx.nextQuestion(); assert.strictEqual(ctx.podiumInfo().shown, 1, 'AVANTI rivela l\'ultimo posto');
  ctx.nextQuestion(); assert.strictEqual(ctx.podiumInfo().shown, 2);
  var m = RC.cockpit({ screen: 'leaderboard', teams: 2, boardFinal: false, podium: ctx.podiumInfo() });
  same(m.main.map(function (x) { return x.act; }), ['next']); assert.strictEqual(m.main[0].label, 'TORNA AL GIOCO →');
  ctx.nextQuestion();
  assert.deepStrictEqual(ctx.calls.filter(function (c) { return /^go:/.test(c); }), ['go:1'], 'torna alla domanda successiva a quella giocata');
  var app = APP.slice(APP.indexOf('function planFinish'), APP.indexOf('function planFinish') + 400);
  assert.ok(/showFinished\(\)/.test(app) && !/showLeaderboard/.test(app), 'fine scaletta: nessuna classifica automatica');
});

/* ---------------- 7. leggibilità del palco ---------------- */
test('RC2-A leggibilità: limiti in % dell\'altezza (max e minimo leggibile); 768 e 1080 righe nei valori richiesti', function () {
  same(FIT.sizes(768, 1), { q: 47.6, o: 36.9 });
  same(FIT.sizes(768, 0), { q: 32.3, o: 26.1 });
  same(FIT.sizes(1080, 1), { q: 67, o: 51.8 });
  same(FIT.sizes(1080, 0), { q: 45.4, o: 36.7 });
  var css = source('css/show.css');
  assert.ok(/\.publicBody\.fillStage \.stage\{width:100vw;height:100vh\}/.test(css), '4:3 e altre forme: il palco della domanda riempie la finestra');
  assert.ok(/\.questionShow:not\(\.withResults\) \.questionFooter\{display:none\}/.test(css) && /\.questionShow \.questionSide \.mascotStage,\.questionShow \.publicTimerHud \.timerWords\{display:none\}/.test(css), 'meno decorazioni durante la domanda');
  assert.ok(/font-size:var\(--q-fs,5\.4cqh\)!important/.test(css) && /font-size:var\(--o-fs,4cqh\)!important/.test(css));
  assert.ok(/fitStage\(document\)/.test(APP) && /fitStage\(publicWindow\.document\)/.test(APP), 'regia (anteprima) e finestra del proiettore');
  assert.ok(/SecchioneStageFit\.fit\(document\)/.test(source('js/show-client.js')), '/show');
  assert.ok(/<script src="js\/stage-fit\.js"><\/script>/.test(source('index.html')) && /<script src="js\/stage-fit\.js"><\/script>/.test(source('show.html')));
  assert.ok(/ResizeObserver/.test(source('js/stage-fit.js')), 'ricalcolo al cambio di dimensione anche senza evento resize');
});
test('RC2-A leggibilità: adattamento — sceglie la scala più grande che entra, non scende sotto il minimo e segnala "tooLong"', function () {
  function fakeShow(H, need) { // need(qPx, oPx) → true se il contenuto entra
    var vars = {}, cls = {};
    var qa = { get scrollHeight() { return need(parseFloat(vars['--q-fs']), parseFloat(vars['--o-fs'])) ? 100 : 200; }, clientHeight: 100, scrollWidth: 10, clientWidth: 10 };
    return { vars: vars, cls: cls, closest: function () { return { clientHeight: H }; }, querySelector: function () { return qa; }, querySelectorAll: function () { return []; },
      style: { setProperty: function (k, v) { vars[k] = v; } }, classList: { toggle: function (c, on) { cls[c] = on; } } };
  }
  var easy = fakeShow(768, function () { return true; });
  assert.strictEqual(FIT.fitQuestion(easy), 1); assert.strictEqual(easy.vars['--q-fs'], '47.6px'); assert.strictEqual(easy.cls.tooLong, false);
  var mid = fakeShow(768, function (q) { return q <= 40; });
  var s = FIT.fitQuestion(mid); assert.ok(s > 0.45 && s < 0.51, 'scala intermedia ' + s); // 32,3 + 15,4 × s ≤ 40 → s ≈ 0,50 assert.ok(parseFloat(mid.vars['--q-fs']) <= 40);
  var never = fakeShow(768, function () { return false; });
  assert.strictEqual(FIT.fitQuestion(never), 0); assert.strictEqual(never.vars['--q-fs'], '32.3px'); assert.strictEqual(never.cls.tooLong, true);
});

/* ---------------- 8. schermo intero ---------------- */
test('RC2-A schermo intero: comando esplicito su palco (finestra e /show) e regia; nessun "clic ovunque"; ESC e F; aiuto F11', function () {
  var show = source('show.html'), client = source('js/show-client.js');
  assert.ok(/id="fsGo"/.test(show) && /id="fsGo"/.test(APP), 'pulsante nel palco /show e nella finestra aperta dalla regia');
  assert.ok(!/document\.addEventListener\('click'/.test(client), 'niente schermo intero al primo clic qualsiasi');
  assert.ok(/fullscreenchange/.test(client) && /fullscreenchange/.test(APP), 'il pulsante ricompare dopo ESC');
  assert.ok(/e\.key === 'f' \|\| e\.key === 'F'/.test(client) && /e\.key==='f'\|\|e\.key==='F'/.test(APP));
  assert.ok(/premi F11/.test(client) && /premi F11/.test(APP), 'se il browser non lo permette lo dice');
  assert.ok(/wireStageFullscreen\(publicWindow\)/.test(APP) && /id="fsRegiaBtn"/.test(source('index.html')) && /toggleRegiaFullscreen/.test(APP));
  assert.ok(/\.publicBody\.isFullscreen \.fsGoBox,\.publicBody\.fsHidden \.fsGoBox\{display:none\}/.test(source('css/show.css')));
  assert.ok(/premi il grande pulsante SCHERMO INTERO/.test(APP));
});

/* ---------------- 9. tastiera delle pulsantiere ---------------- */
function kbCtx(state) {
  var ctx = { st: Object.assign({ textBuf: '', kbDigits: false, sending: false, connected: true, round: null }, state || {}) };
  vm.runInNewContext(extractFrom(PLAYER, ['esc', 'currentAnswer', 'keysHTML'], '  '), ctx);
  return ctx;
}
test('RC2-A tastiera: A–Z, accenti, apostrofo, trattino, SPAZIO, ⌫, CANCELLA, INVIA dentro la tastiera, numeri dietro 123', function () {
  var r = { layout: 'text', maxLength: 40, status: 'open' };
  var ctx = kbCtx({ round: r });
  var h = ctx.keysHTML(r, false);
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (L) { assert.ok(h.indexOf('data-char="' + L + '"') >= 0, L); });
  ['À', 'È', 'É', 'Ì', 'Ò', 'Ù', '\'', '-'].forEach(function (L) { assert.ok(h.indexOf('data-char="' + L + '"') >= 0, L); });
  assert.ok(/data-text-action="space"/.test(h) && /data-text-action="backspace"/.test(h) && /data-text-action="clear"/.test(h) && /data-text-action="mode"[^>]*>123</.test(h));
  assert.ok(/class="kbKey send kbSend" type="button" id="sendBtn" disabled>INVIA/.test(h), 'INVIA nella tastiera, spento finché non si scrive');
  assert.ok(/kbRow kbDigits/.test(h) && !/textKeyboard kb2 digits/.test(h), 'cifre presenti ma nascoste');
  ctx.st.textBuf = 'VIA APPIA';
  assert.ok(/id="sendBtn">INVIA/.test(ctx.keysHTML(r, false)), 'con del testo INVIA si accende');
  ctx.st.sending = true;
  assert.ok(/id="sendBtn" disabled>INVIO…/.test(ctx.keysHTML(r, true)), 'durante l\'invio non si può reinviare');
  var mcq = ctx.keysHTML({ layout: 'mcq', letters: ['A', 'B', 'C', 'D'] }, false);
  assert.ok(!/kbKey|textKeyboard/.test(mcq) && (mcq.match(/data-pick=/g) || []).length === 4, 'A/B/C/D: solo quattro tasti, nessuna tastiera');
});
test('RC2-A tastiera: un solo invio (pulsante spento subito, invio ignorato se già in corso o se il pulsante è spento); conferma chiara', function () {
  assert.ok(/var btn = document\.getElementById\('sendBtn'\); if \(btn\) btn\.disabled = true;\n    sendAnswer\(\);/.test(PLAYER));
  assert.ok(/if \(t\.closest && t\.closest\('#sendBtn'\)\) \{ var sb = document\.getElementById\('sendBtn'\); if \(sb && sb\.disabled\) return; return submit\(\); \}/.test(PLAYER));
  assert.ok(/if \(!r \|\| r\.myAnswer \|\| r\.status !== 'open' \|\| st\.sending\) return;/.test(PLAYER));
  assert.ok(/doneHTML\('sent', '✓', 'RISPOSTA REGISTRATA'/.test(PLAYER) && /\.done\.sent\{/.test(source('css/player.css')));
  var css = source('css/player.css');
  assert.ok(/grid-template-rows:repeat\(5,minmax\(44px,96px\)\)/.test(css) && /min-height:44px/.test(css), 'tasti alti almeno 44 px');
  assert.ok(/@media \(orientation:landscape\) and \(max-height:450px\)/.test(css), 'telefono in orizzontale');
});
