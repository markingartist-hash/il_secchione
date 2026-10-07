'use strict';
var assert = require('assert');
var test = require('./harness.js').test;
var S = require('../js/engine/scoring.js');
var Session = require('../js/engine/session.js');

function rec(id, outcome, order) { return { participantId: id, outcome: outcome, order: order }; }
function pts(result) { var o = {}; result.forEach(function (r) { o[r.participantId] = r.points; }); return o; }

test('legacy_v3: corrette 300/275/250, errata −100, astensione −100', function () {
  var r = S.scoreRound([rec('a', 'correct', 1), rec('b', 'correct', 2), rec('c', 'wrong', 3), rec('d', 'correct', 4), rec('e', 'abstain', 5)], 'legacy_v3');
  assert.deepStrictEqual(pts(r), { a: 300, b: 275, c: -100, d: 250, e: -100 });
});

test('show_standard: omessa vale 0, errata −100', function () {
  var r = S.scoreRound([rec('a', 'omitted', 1), rec('b', 'wrong', 2), rec('c', 'correct', 3)], 'show_standard');
  assert.deepStrictEqual(pts(r), { a: 0, b: -100, c: 300 });
});

test('learning: corretta 1, errata 0, omessa 0, il tempo non conta', function () {
  var r = S.scoreRound([
    { participantId: 'a', outcome: 'correct', order: 2, responseTimeMs: 9000 },
    { participantId: 'b', outcome: 'correct', order: 1, responseTimeMs: 1000 },
    rec('c', 'wrong', 3), rec('d', 'omitted', 4)
  ], 'learning');
  assert.deepStrictEqual(pts(r), { a: 1, b: 1, c: 0, d: 0 });
});

test('ordine delle corrette: decide il campo order, non la posizione nell\'array', function () {
  var r = S.scoreRound([rec('a', 'correct', 30), rec('b', 'correct', 10), rec('c', 'correct', 20)], 'show_standard');
  assert.deepStrictEqual(pts(r), { a: 250, b: 300, c: 275 });
  var ranks = {}; r.forEach(function (x) { ranks[x.participantId] = x.rank; });
  assert.deepStrictEqual(ranks, { a: 3, b: 1, c: 2 });
});

test('errori e omesse non occupano posizioni tra le corrette', function () {
  var r = S.scoreRound([rec('a', 'wrong', 1), rec('b', 'omitted', 2), rec('c', 'correct', 3), rec('d', 'correct', 4)], 'legacy_v3');
  assert.deepStrictEqual(pts(r), { a: -100, b: -100, c: 300, d: 275 });
});

test('minimo per una corretta: 0 punti (13ª corretta e oltre)', function () {
  var list = [];
  for (var i = 1; i <= 15; i++) list.push(rec('t' + i, 'correct', i));
  var p = pts(S.scoreRound(list, 'show_standard'));
  assert.strictEqual(p.t12, 25);
  assert.strictEqual(p.t13, 0);
  assert.strictEqual(p.t15, 0);
});

test('record duplicati: vale il primo per ordine; i record annullati sono ignorati', function () {
  var r = S.scoreRound([rec('a', 'wrong', 2), rec('a', 'correct', 1), { participantId: 'b', outcome: 'correct', order: 0, voided: true }, rec('b', 'wrong', 3)], 'show_standard');
  assert.deepStrictEqual(pts(r), { a: 300, b: -100 });
});

test('esito non valido rifiutato', function () {
  assert.throws(function () { S.scoreRound([rec('a', 'forse', 1)], 'show_standard'); }, /Esito non valido/);
});

/* RC2-A: il profilo predefinito è show_speed (200–300); show_standard resta per le partite già giocate. */
test('profilo sconosciuto → profilo predefinito show_speed', function () {
  assert.strictEqual(S.getProfile('inesistente').id, 'show_speed');
  assert.strictEqual(S.DEFAULT_PROFILE, 'show_speed');
  assert.ok(S.hasProfile('show_standard'));
});

test('totals somma eventi e rettifiche, ignora gli annullati', function () {
  var t = S.totals([{ participantId: 'a', points: 300 }, { participantId: 'a', points: -100 }, { participantId: 'b', points: 50, voided: true }], [{ participantId: 'b', points: 25 }]);
  assert.deepStrictEqual(t, { a: 200, b: 25 });
});

test('rulesSummary leggibile per ogni profilo', function () {
  assert.strictEqual(S.rulesSummary('legacy_v3'), 'Corrette 300 / 275 / 250… · Errata −100 · Omessa −100');
  assert.strictEqual(S.rulesSummary('show_standard'), 'Corrette 300 / 275 / 250… · Errata −100 · Omessa 0');
  assert.strictEqual(S.rulesSummary('learning'), 'Corretta 1 punto · Errata 0 · Omessa 0');
});

test('punteggio derivato dai dati grezzi: lo storico si ricalcola con un altro profilo', function () {
  var s = Session.createSession({ scoringProfile: 'legacy_v3' });
  var rid = 'r1';
  var recs = [
    Session.makeResponse({ roundInstanceId: rid, participantId: 'a', selectedAnswer: 'B', correctAnswer: 'B', outcome: 'correct', order: 1 }),
    Session.makeResponse({ roundInstanceId: rid, participantId: 'b', selectedAnswer: null, correctAnswer: 'B', outcome: 'omitted', order: 2 })
  ];
  s.responses = s.responses.concat(recs);
  s.rounds.push({ roundInstanceId: rid, committed: true });
  s.scoreEvents = Session.scoreEventsFor(recs, 'legacy_v3', rid);
  assert.deepStrictEqual(Session.totals(s), { a: 300, b: -100 });
  assert.deepStrictEqual(Session.recomputeTotals(s, 'show_standard'), { a: 300, b: 0 });
  assert.deepStrictEqual(Session.recomputeTotals(s, 'learning'), { a: 1, b: 0 });
});

test('record manuale: responseTimeMs sempre null, inputMode manual', function () {
  var r = Session.makeResponse({ participantId: 'a', outcome: 'correct', inputMode: 'manual', responseTimeMs: 1234 });
  assert.strictEqual(r.responseTimeMs, null);
  assert.strictEqual(r.inputMode, 'manual');
  var t = Session.makeResponse({ participantId: 'a', outcome: 'correct', inputMode: 'tablet', responseTimeMs: 1234.4 });
  assert.strictEqual(t.responseTimeMs, 1234);
});

test('outcomeForAnswer: lettera, omessa, maiuscole', function () {
  assert.strictEqual(Session.outcomeForAnswer('c', 'C'), 'correct');
  assert.strictEqual(Session.outcomeForAnswer('B', 'C'), 'wrong');
  assert.strictEqual(Session.outcomeForAnswer(null, 'C'), 'omitted');
  assert.strictEqual(Session.outcomeForAnswer('abstain', 'C'), 'omitted');
});
