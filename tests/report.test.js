'use strict';
var assert = require('assert');
var test = require('./harness.js').test;
var SS = require('../js/engine/session.js');
var RP = require('../js/engine/report.js');

function sampleSession() {
  var s = SS.createSession({ scoringProfile: 'show_standard', meta: { classLabel: '2B', mode: 'lesson' } });
  s.participants = [{ id: 'a', name: 'Blu' }, { id: 'b', name: 'Rossi' }];
  var q = { text: 'Domanda; con "virgolette"?', options: ['Uno', 'Due', 'Tre', 'Quattro'], correctIndex: 1, category: 'Archi', topic: 'Arte romana', subject: 'Arte' };
  var displayed = [{ letter: 'A', sourceIndex: 2 }, { letter: 'B', sourceIndex: 1 }, { letter: 'C', sourceIndex: 0 }, { letter: 'D', sourceIndex: 3 }];
  s.rounds.push({ roundInstanceId: 'r1', kind: 'question', committed: true, number: 1, questionId: 'q1', correctAnswer: 'B', displayed: displayed, question: q, profileId: 'show_standard' });
  var recs = [
    SS.makeResponse({ sessionId: s.sessionId, roundInstanceId: 'r1', questionId: 'q1', participantId: 'a', selectedAnswer: 'B', selectedSourceIndex: 1, correctAnswer: 'B', outcome: 'correct', inputMode: 'tablet', responseTimeMs: 4200, order: 1 }),
    SS.makeResponse({ sessionId: s.sessionId, roundInstanceId: 'r1', questionId: 'q1', participantId: 'b', selectedAnswer: 'A', selectedSourceIndex: 2, correctAnswer: 'B', outcome: 'wrong', inputMode: 'manual', order: 1001 })
  ];
  s.responses = recs;
  s.scoreEvents = SS.scoreEventsFor(recs, 'show_standard', 'r1');
  s.rounds.push({ roundInstanceId: 'r2', kind: 'arcade', gameType: 'indovina', label: 'Personaggio 1', committed: true, solution: 'Augusto' });
  var arc = [SS.makeResponse({ roundInstanceId: 'r2', kind: 'arcade', gameType: 'indovina', participantId: 'a', outcome: 'omitted', order: 1000 }), SS.makeResponse({ roundInstanceId: 'r2', kind: 'arcade', gameType: 'indovina', participantId: 'b', outcome: 'correct', order: 1 })];
  s.responses = s.responses.concat(arc);
  s.scoreEvents = s.scoreEvents.concat(SS.scoreEventsFor(arc, 'show_standard', 'r2'));
  return s;
}

test('CSV: BOM, separatore ;, una riga per risposta, testo risposta dal mescolamento', function () {
  var csv = RP.toCSV({ session: sampleSession(), pack: { id: 'arte_romana', title: 'Arte romana' } });
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
  var lines = csv.slice(1).trim().split('\r\n');
  assert.strictEqual(lines.length, 5, 'intestazione + 4 risposte');
  assert.strictEqual(lines[0].split(';').length, RP.CSV_HEADER.length);
  assert.ok(lines[1].indexOf('"Domanda; con ""virgolette""?"') >= 0, 'campo con ; e virgolette protetto');
  /* RC2-A: dopo tempo_ms c'è tempo_disponibile_ms (vuoto nei dati di prova, che non lo hanno) */
  assert.ok(/;B;Due;B;Due;corretta;4200;;pulsantiera;/.test(lines[1]), lines[1]);
  assert.ok(/;A;Tre;B;Due;errata;;;manuale;/.test(lines[2]), 'tempo vuoto per l\'input manuale: ' + lines[2]);
  assert.ok(/;300;/.test(lines[1]) && /;-100;/.test(lines[2]));
});

test('statistiche: classifica, % corrette, categorie, domande difficili, tempi solo se misurati', function () {
  var st = RP.computeStats(sampleSession());
  assert.strictEqual(st.teams[0].name, 'Blu');
  assert.strictEqual(st.teams[0].points, 300);
  assert.strictEqual(st.teams[1].points, 200);
  assert.strictEqual(st.teams[0].pctCorrect, 50);
  assert.strictEqual(st.teams[0].timeMean, 4200);
  assert.strictEqual(st.teams[1].timeMean, null, 'nessun tempo inventato per l\'input manuale');
  assert.strictEqual(st.categories[0].category, 'Archi');
  assert.strictEqual(st.categories[0].pctCorrect, 50);
  assert.strictEqual(st.hardest[0].correctText, 'Due');
  assert.deepStrictEqual(st.hardest[0].choices, { Tre: 1 });
  assert.deepStrictEqual(st.modes, { manual: 3, tablet: 1 });
});

test('report HTML autonomo, con le sezioni richieste e la nota formativa', function () {
  var html = RP.toHTML({ session: sampleSession(), pack: { id: 'x', title: 'Arte romana' }, app: '3.5.0' });
  ['Classifica', 'Risultati per categoria', 'Domande con più errori', 'Tempi di risposta', 'Report formativo'].forEach(function (s) { assert.ok(html.indexOf(s) >= 0, 'manca ' + s); });
  assert.ok(html.indexOf('<script') < 0 && html.indexOf('http') < 0, 'nessuno script e nessuna risorsa esterna');
  assert.ok(html.indexOf('competenze individuali') >= 0);
});

test('risposte annullate (punti riaperti) escluse dalle statistiche ma presenti nel CSV', function () {
  var s = sampleSession();
  s.responses[1].voided = true;
  var st = RP.computeStats(s);
  assert.strictEqual(st.teams.filter(function (t) { return t.name === 'Rossi'; })[0].answered, 1);
  assert.ok(/;si\r?$/.test(RP.toCSV({ session: s }).trim().split('\r\n')[2]));
});

test('log tecnico: regia e server uniti in ordine di tempo', function () {
  var csv = RP.logToCSV([{ timestamp: '2026-10-03T10:00:02Z', event: 'response.manual' }], [{ timestamp: '2026-10-03T10:00:01Z', event: 'response', accepted: false, reason: 'round_closed' }]);
  var lines = csv.slice(1).trim().split('\r\n');
  assert.ok(/server;.*response;;no;round_closed/.test(lines[1]), lines[1]);
  assert.ok(/regia;.*response\.manual/.test(lines[2]));
});
