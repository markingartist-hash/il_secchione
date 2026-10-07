'use strict';
var assert = require('assert');
var test = require('./harness.js').test;
var Room = require('../server/room.js').Room;

function setup(opts) {
  var t = { now: 1000000 };
  var room = new Room(Object.assign({ clock: function () { return t.now; }, pin: '4821', graceMs: 500 }, opts || {}));
  room.setSession('sess-1');
  room.syncParticipants([{ id: 'tA', name: '2A' }, { id: 'tB', name: '2B' }, { id: 'tC', name: '2C' }]);
  function device(team) {
    var j = room.join({ pin: '4821' });
    assert.ok(j.ok, 'join');
    var d = room.assign(j.device.deviceId, team);
    return { id: d.deviceId, token: d.deviceToken };
  }
  function open(id, extra) {
    var r = room.openRound(Object.assign({ roundInstanceId: id || 'round-0001', questionId: 'q1', layout: 'mcq', letters: ['A', 'B', 'C', 'D'], correct: 'C', durationMs: 30000 }, extra || {}));
    assert.ok(r.ok, r.reason);
  }
  return { t: t, room: room, device: device, open: open };
}

test('round chiuso: risposta rifiutata', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  s.room.closeRound('round-0001');
  var r = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token });
  assert.strictEqual(r.accepted, false);
  assert.strictEqual(r.reason, 'round_closed');
});

test('round aperto: risposta accettata con timestamp e tempo del SERVER', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  s.t.now += 7213;
  var r = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'c', deviceToken: a.token, timestamp: 1, participantId: 'tB' });
  assert.strictEqual(r.accepted, true);
  assert.strictEqual(r.record.participantId, 'tA', 'la squadra la decide il server, non il browser');
  assert.strictEqual(r.record.selectedAnswer, 'C');
  assert.strictEqual(r.record.outcome, 'correct');
  assert.strictEqual(r.record.responseTimeMs, 7213);
  assert.strictEqual(r.record.inputMode, 'tablet');
  assert.strictEqual(r.record.receivedAt, new Date(s.t.now).toISOString());
});

test('prima risposta definitiva: seconda diversa rifiutata, seconda uguale idempotente', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'B', deviceToken: a.token }).accepted, true);
  var again = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'B', deviceToken: a.token });
  assert.strictEqual(again.accepted, true);
  assert.strictEqual(again.duplicate, true);
  var other = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token });
  assert.strictEqual(other.accepted, false);
  assert.strictEqual(other.reason, 'already_answered');
  assert.strictEqual(s.room.responses.length, 1, 'registrata una sola volta');
});

test('due tablet della stessa squadra: vale il primo', function () {
  var s = setup();
  var a1 = s.device('tA');
  var a2 = s.device('tA');
  s.open();
  assert.strictEqual(s.room.answer(a1.id, { roundInstanceId: 'round-0001', answer: 'A', deviceToken: a1.token }).accepted, true);
  assert.strictEqual(s.room.answer(a2.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a2.token }).reason, 'already_answered');
});

test('roundInstanceId vecchio o sconosciuto rifiutato', function () {
  var s = setup();
  var a = s.device('tA');
  s.open('round-0001');
  s.open('round-0002');
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token }).reason, 'stale_round');
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-9999', answer: 'C', deviceToken: a.token }).reason, 'unknown_round');
  assert.strictEqual(s.room.openRound({ roundInstanceId: 'round-0001', correct: 'A' }).reason, 'round_id_reused');
});

test('token non valido, dispositivo espulso o non assegnato: rifiutati', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: 'falso' }).reason, 'invalid_token');
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C' }).reason, 'invalid_token');
  var p = s.room.join({ pin: '4821' });
  assert.strictEqual(s.room.answer(p.device.deviceId, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: p.device.joinToken }).reason, 'invalid_token');
  s.room.kick(a.id);
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token }).reason, 'unknown_device');
});

test('risposta non valida per il layout rifiutata', function () {
  var s = setup();
  var a = s.device('tA');
  s.open('round-0001', { letters: ['A', 'B', 'C'] });
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'D', deviceToken: a.token }).reason, 'invalid_answer');
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: { x: 1 }, deviceToken: a.token }).reason, 'invalid_answer');
});

test('pausa: risposte rifiutate; ripresa: il tempo in pausa non conta', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  s.t.now += 5000;
  s.room.pauseRound('round-0001');
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token }).reason, 'round_paused');
  s.t.now += 60000;
  s.room.resumeRound('round-0001');
  s.t.now += 2000;
  var r = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token });
  assert.strictEqual(r.accepted, true);
  assert.strictEqual(r.record.responseTimeMs, 7000);
});

test('scadenza: tolleranza di rete, poi chiusura automatica', function () {
  var s = setup();
  var a = s.device('tA');
  var b = s.device('tB');
  s.open();
  s.t.now += 30400;
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token }).accepted, true, 'dentro la tolleranza');
  s.t.now += 200;
  assert.strictEqual(s.room.tick(), true);
  assert.strictEqual(s.room.round.status, 'closed');
  assert.strictEqual(s.room.answer(b.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: b.token }).reason, 'round_closed');
});

test('+10 s sposta la scadenza', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  s.room.addTime('round-0001', 10000);
  s.t.now += 35000;
  assert.strictEqual(s.room.tick(), false);
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'A', deviceToken: a.token }).accepted, true);
});

test('sblocco del docente: la squadra può rispondere di nuovo', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'A', deviceToken: a.token });
  assert.strictEqual(s.room.unlock('round-0001', 'tA'), true);
  var r = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token });
  assert.strictEqual(r.accepted, true);
  assert.strictEqual(s.room.responses.filter(function (x) { return !x.voided; }).length, 1);
  assert.strictEqual(s.room.responses.filter(function (x) { return x.voided; }).length, 1, 'la risposta sbloccata resta nel log');
});

test('la vista del dispositivo non contiene MAI la soluzione prima del reveal', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  var v = JSON.stringify(s.room.publicRoundFor(a.id));
  assert.ok(v.indexOf('"correct"') < 0 && v.indexOf('outcome') < 0 && v.indexOf('questionId') < 0, v);
  assert.strictEqual(s.room.publicRoundFor(a.id).correct, undefined);
  assert.strictEqual(s.room.publicRoundFor(a.id).myOutcome, undefined);
  s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'B', deviceToken: a.token });
  assert.strictEqual(s.room.publicRoundFor(a.id).myOutcome, undefined, 'nemmeno l\'esito prima del reveal');
  s.room.revealRound('round-0001');
  assert.strictEqual(s.room.publicRoundFor(a.id).myOutcome, 'wrong');
});

test('ingressi: PIN errato e ingressi chiusi rifiutati; rientro con token anche a ingressi chiusi', function () {
  var s = setup();
  var a = s.device('tA');
  assert.strictEqual(s.room.join({ pin: '0000' }).reason, 'bad_pin');
  s.room.setJoinLocked(true);
  assert.strictEqual(s.room.join({ pin: '4821' }).reason, 'locked');
  var back = s.room.join({ deviceToken: a.token });
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.reconnected, true);
  assert.strictEqual(back.device.participantId, 'tA', 'nessuna squadra duplicata');
  assert.strictEqual(Object.keys(s.room.devices).length, 1);
});

test('riassegnazione: nuovo token, il vecchio non vale più', function () {
  var s = setup();
  var a = s.device('tA');
  var d = s.room.assign(a.id, 'tB');
  assert.notStrictEqual(d.deviceToken, a.token);
  s.open();
  assert.strictEqual(s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token }).reason, 'invalid_token');
  var r = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: d.deviceToken });
  assert.strictEqual(r.record.participantId, 'tB');
});

test('commit: i dati dei tablet vengono dal server, il punteggio è ricalcolato', function () {
  var s = setup();
  var a = s.device('tA');
  var b = s.device('tB');
  s.open();
  s.t.now += 3000;
  var ra = s.room.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token }).record;
  s.t.now += 1000;
  s.room.answer(b.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: b.token });
  s.room.closeRound('round-0001');
  var forged = Object.assign({}, ra, { selectedAnswer: 'A', responseTimeMs: 1 });
  var c = s.room.commit({ roundInstanceId: 'round-0001', profileId: 'legacy_v3', records: [
    forged,
    { participantId: 'tB', inputMode: 'tablet', selectedAnswer: 'C', correctAnswer: 'C', outcome: 'correct', order: 2, responseTimeMs: 4000 },
    { participantId: 'tC', inputMode: 'manual', selectedAnswer: null, correctAnswer: 'C', outcome: 'omitted', order: 1003 }
  ] });
  assert.strictEqual(c.ok, true);
  var byId = {};
  c.records.forEach(function (r) { byId[r.participantId] = r; });
  assert.strictEqual(byId.tA.selectedAnswer, 'C');
  assert.strictEqual(byId.tA.responseTimeMs, 3000);
  assert.strictEqual(byId.tC.responseTimeMs, null);
  var pts = {};
  c.scoreEvents.forEach(function (e) { pts[e.participantId] = e.points; });
  // RC1: tC è un'astensione inserita a mano (non automatica) → il round contiene una risposta manuale,
  // quindi le corrette sono ex aequo (nessun bonus di velocità). Prima della RC1 era { tA: 300, tB: 275 }.
  assert.deepStrictEqual(pts, { tA: 300, tB: 300, tC: 0 }); // prima omissione gratuita (quota 3)
  assert.ok(c.corrected >= 1);
});

test('persistenza: dopo un riavvio il round aperto torna in pausa e i token restano validi', function () {
  var s = setup();
  var a = s.device('tA');
  s.open();
  s.t.now += 10000;
  var saved = JSON.parse(JSON.stringify(s.room.toJSON()));
  var r2 = Room.fromJSON(saved, { clock: function () { return s.t.now; } });
  assert.strictEqual(r2.round.status, 'paused');
  assert.strictEqual(r2.round.remainingMs, 20000);
  assert.strictEqual(r2.pin, '4821');
  var back = r2.join({ deviceToken: a.token });
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.device.participantId, 'tA');
  r2.resumeRound('round-0001');
  assert.strictEqual(r2.answer(a.id, { roundInstanceId: 'round-0001', answer: 'C', deviceToken: a.token }).accepted, true);
});

test('squadra rimossa: il dispositivo torna in attesa', function () {
  var s = setup();
  var a = s.device('tC');
  s.room.syncParticipants([{ id: 'tA', name: '2A' }, { id: 'tB', name: '2B' }]);
  assert.strictEqual(s.room.devices[a.id].status, 'pending');
  assert.strictEqual(s.room.devices[a.id].deviceToken, null);
});

test('arcade testuale: la pulsantiera accetta la parola, il server valuta e conserva kind/gameType', function () {
  var s = setup();
  var a = s.device('tA');
  s.open('arcade-0001', { kind: 'arcade', gameType: 'photopuzzle', questionId: null, layout: 'text', correct: 'San Carlo alle Quattro Fontane', maxLength: 80, durationMs: 45000 });
  s.t.now += 4321;
  var r = s.room.answer(a.id, { roundInstanceId: 'arcade-0001', answer: 'san carlo alle quattro fontane', deviceToken: a.token });
  assert.strictEqual(r.accepted, true);
  assert.strictEqual(r.record.kind, 'arcade');
  assert.strictEqual(r.record.gameType, 'photopuzzle');
  assert.strictEqual(r.record.selectedAnswer, 'san carlo alle quattro fontane');
  assert.strictEqual(r.record.correctAnswer, 'San Carlo alle Quattro Fontane');
  assert.strictEqual(r.record.outcome, 'correct');
  assert.strictEqual(r.record.responseTimeMs, 4321);
  var pub = s.room.publicRoundFor(a.id);
  assert.strictEqual(pub.layout, 'text');
  assert.strictEqual(pub.kind, 'arcade');
  assert.strictEqual(pub.gameType, 'photopuzzle');
  assert.strictEqual(pub.correct, undefined, 'la soluzione non deve arrivare alla pulsantiera');
});

test('arcade testuale: accenti e maiuscole non cambiano l’esito', function () {
  var s = setup();
  var a = s.device('tA');
  s.open('arcade-0002', { kind: 'arcade', gameType: 'chain', layout: 'text', correct: 'Città', maxLength: 40 });
  var r = s.room.answer(a.id, { roundInstanceId: 'arcade-0002', answer: 'CITTA', deviceToken: a.token });
  assert.strictEqual(r.accepted, true);
  assert.strictEqual(r.record.outcome, 'correct');
});
