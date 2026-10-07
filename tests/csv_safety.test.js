'use strict';
/* Contratto CSV v2: celle neutralizzate per i fogli di calcolo (formula injection), numeri conservati, dati grezzi su richiesta. */
var assert = require('assert');
var test = require('./harness.js').test;
var SS = require('../js/engine/session.js');
var RP = require('../js/engine/report.js');

var FULLWIDTH_EQ = String.fromCharCode(0xFF1D);

/** Divide una riga CSV (separatore ;) rispettando le virgolette doppie. */
function cells(line) {
  var out = [];
  var cur = '';
  var q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line.charAt(i);
    if (q) {
      if (c === '"' && line.charAt(i + 1) === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ';') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
function rowsOf(csv) { return csv.slice(1).replace(/\r\n$/, '').split('\r\n').map(cells); }
function col(name) { return RP.CSV_HEADER.indexOf(name); }

/** Sessione con testi ostili: nome squadra, domanda e categoria del pack, risposta digitata in un gioco. */
function hostileSession() {
  var s = SS.createSession({ scoringProfile: 'show_standard', meta: { classLabel: '=2B', mode: 'lesson', institution: '@Istituto' } });
  s.participants = [{ id: 'a', name: '=HYPERLINK("http://esempio.invalid";"clic")' }, { id: 'b', name: 'Rossi' }];
  var q = { text: '+1+1 fa?', options: ['-2+3', 'Due', 'Tre', '@SUM(A1:A9)'], correctIndex: 1, category: '-Archi', topic: 'Arte', subject: 'Arte' };
  var displayed = [{ letter: 'A', sourceIndex: 0 }, { letter: 'B', sourceIndex: 1 }, { letter: 'C', sourceIndex: 2 }, { letter: 'D', sourceIndex: 3 }];
  s.rounds.push({ roundInstanceId: 'r1', kind: 'question', committed: true, number: 1, questionId: 'q1', correctAnswer: 'B', displayed: displayed, question: q, profileId: 'show_standard' });
  var recs = [
    SS.makeResponse({ sessionId: s.sessionId, roundInstanceId: 'r1', questionId: 'q1', participantId: 'a', selectedAnswer: 'A', correctAnswer: 'B', outcome: 'wrong', inputMode: 'tablet', responseTimeMs: 4200, order: 1001, deviceId: '\tdev' }),
    SS.makeResponse({ sessionId: s.sessionId, roundInstanceId: 'r1', questionId: 'q1', participantId: 'b', selectedAnswer: 'B', correctAnswer: 'B', outcome: 'correct', inputMode: 'manual', order: 1 })
  ];
  s.responses = recs;
  s.scoreEvents = SS.scoreEventsFor(recs, 'show_standard', 'r1');
  s.rounds.push({ roundInstanceId: 'r2', kind: 'arcade', gameType: 'chain', label: '=Staffetta', committed: true, solution: '+LAVA' });
  var arc = [SS.makeResponse({ roundInstanceId: 'r2', kind: 'arcade', gameType: 'chain', participantId: 'b', selectedAnswer: '=2+3', outcome: 'wrong', order: 1001 })];
  s.responses = s.responses.concat(arc);
  s.scoreEvents = s.scoreEvents.concat(SS.scoreEventsFor(arc, 'show_standard', 'r2'));
  return s;
}

test('CSV v2: regola di neutralizzazione cella per cella', function () {
  var S = RP.spreadsheetSafe;
  assert.strictEqual(S('=1+1'), '\'=1+1');
  assert.strictEqual(S('+39 333 1234567'), '\'+39 333 1234567');
  assert.strictEqual(S('-x'), '\'-x');
  assert.strictEqual(S('@SUM(A1)'), '\'@SUM(A1)');
  assert.strictEqual(S('\tciao'), '\'\tciao');
  assert.strictEqual(S('\rciao'), '\'\rciao');
  assert.strictEqual(S(FULLWIDTH_EQ + '1+1'), '\'' + FULLWIDTH_EQ + '1+1', 'segni a larghezza piena');
  // qualunque carattere di controllo iniziale (0-31, 127)
  [0, 1, 9, 10, 13, 27, 31, 127].forEach(function (code) {
    var v = String.fromCharCode(code) + '=1+1';
    assert.strictEqual(S(v), '\'' + v, 'carattere di controllo ' + code);
  });
  // numeri veri e testi normali restano invariati
  assert.strictEqual(S(-100), -100);
  assert.strictEqual(S('-100'), '-100');
  assert.strictEqual(S('+5'), '+5');
  assert.strictEqual(S('-1,5'), '-1,5');
  assert.strictEqual(S('Roma'), 'Roma');
  assert.strictEqual(S('2026-10-04T10:00:00Z'), '2026-10-04T10:00:00Z');
  assert.strictEqual(S('a=b'), 'a=b', 'solo l\'inizio della cella conta');
  assert.strictEqual(S(''), '');
  assert.strictEqual(S(null), null);
  assert.strictEqual(RP.CSV_CONTRACT.version, 2);
  assert.strictEqual(RP.CSV_CONTRACT.defaultMode, 'spreadsheet');
});

test('CSV risposte: testi ostili di squadre, pack e studenti neutralizzati; punti negativi restano numeri', function () {
  var csv = RP.toCSV({ session: hostileSession() });
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
  var rows = rowsOf(csv);
  assert.deepStrictEqual(rows[0], RP.CSV_HEADER, 'intestazione invariata');
  rows.forEach(function (r) { assert.strictEqual(r.length, RP.CSV_HEADER.length); });
  var a = rows[1];
  assert.strictEqual(a[col('partecipante')], '\'=HYPERLINK("http://esempio.invalid";"clic")');
  assert.strictEqual(a[col('domanda')], '\'+1+1 fa?');
  assert.strictEqual(a[col('categoria')], '\'-Archi');
  assert.strictEqual(a[col('risposta_testo')], '\'-2+3');
  assert.strictEqual(a[col('classe')], '\'=2B');
  assert.strictEqual(a[col('istituto')], '\'@Istituto');
  assert.strictEqual(a[col('dispositivo')], '\'\tdev');
  assert.strictEqual(a[col('punti')], '-100', 'penalità: numero negativo, non testo');
  assert.strictEqual(a[col('tempo_ms')], '4200');
  var arc = rows[3];
  assert.strictEqual(arc[col('risposta_lettera')], '\'=2+3', 'risposta digitata da uno studente nel gioco');
  assert.strictEqual(arc[col('corretta_testo')], '\'+LAVA');
  assert.strictEqual(arc[col('categoria')], '\'=Staffetta');
  // nessuna cella del file inizia con un carattere che un foglio di calcolo eseguirebbe
  rows.slice(1).forEach(function (r) {
    r.forEach(function (c) { assert.ok(!/^[=+@\t\r]/.test(c) && !/^-(?!\d+([.,]\d+)?$)/.test(c), 'cella pericolosa: ' + c); });
  });
});

test('CSV dati grezzi ({raw:true}): celle esattamente come registrate, stesso formato', function () {
  var raw = rowsOf(RP.toCSV({ session: hostileSession() }, { raw: true }));
  assert.strictEqual(raw[1][col('partecipante')], '=HYPERLINK("http://esempio.invalid";"clic")');
  assert.strictEqual(raw[3][col('risposta_lettera')], '=2+3');
  assert.strictEqual(raw[1][col('punti')], '-100');
  assert.deepStrictEqual(raw[0], RP.CSV_HEADER);
});

test('log tecnico CSV: risposte e motivi neutralizzati, latenze e delta punti numerici; grezzo su richiesta', function () {
  var host = [{ timestamp: '2026-10-04T10:00:02Z', event: 'response.manual', participantId: '=cmd', answer: '@risposta', scoreDelta: -100 }];
  var server = [{ timestamp: '2026-10-04T10:00:01Z', event: 'response', accepted: false, reason: '+motivo', latency: 35, deviceId: '-dev' }];
  var rows = rowsOf(RP.logToCSV(host, server));
  assert.strictEqual(rows[1][9], '\'+motivo');
  assert.strictEqual(rows[1][10], '35');
  assert.strictEqual(rows[1][5], '\'-dev');
  assert.strictEqual(rows[2][4], '\'=cmd');
  assert.strictEqual(rows[2][7], '\'@risposta');
  assert.strictEqual(rows[2][11], '-100');
  var raw = rowsOf(RP.logToCSV(host, server, { raw: true }));
  assert.strictEqual(raw[2][7], '@risposta');
  assert.strictEqual(raw[1][9], '+motivo');
});

test('report HTML: i testi ostili restano testo (nessun markup eseguibile)', function () {
  var s = hostileSession();
  s.participants[1].name = '<img src=x onerror=alert(1)>';
  var html = RP.toHTML({ session: s, pack: { id: 'p', title: '<script>x</script>' } });
  assert.ok(html.indexOf('<img src=x') < 0);
  assert.ok(html.indexOf('<script>x</script>') < 0);
  assert.ok(html.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0);
});
