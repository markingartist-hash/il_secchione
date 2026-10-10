'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness').test;
var AM = require('../js/engine/answerMatcher');
var match = AM.answerMatcher;

[
  ['Il Colosseo', 'Colosseo', 'normalized'],
  ["L'Ara Pacis", 'Ara Pacis', 'normalized'],
  ['Vocazione di San Matteo', 'La Vocazione di san Matteo', 'normalized'],
  ['Caravaggio', 'Caravagio', 'fuzzy'],
  ['Ratto di Proserpina', 'Ratto delle Sabine', 'wrong']
].forEach(function (row) {
  test('answerMatcher: ' + row[0] + ' / ' + row[1] + ' → ' + row[2], function () {
    [match(row[1], row[0]), match(row[0], row[1])].forEach(function (r) {
      assert.strictEqual(r.status, row[2]);
      assert.strictEqual(r.isCorrect, row[2] !== 'wrong');
    });
  });
});

test('answerMatcher: exact, normalized, accepted_variant, fuzzy e wrong distinguibili', function () {
  assert.strictEqual(match('Caravaggio', 'Caravaggio').status, 'exact');
  assert.strictEqual(match('CARAVAGGIO', 'Caravaggio').status, 'normalized');
  var ref = { answer: 'Caravaggio', acceptedAnswers: ['Michelangelo Merisi'] };
  assert.strictEqual(match('Michelangelo Merisi', ref).status, 'accepted_variant');
  assert.strictEqual(match('  MICHELANGELO   MERÍSI! ', ref).status, 'accepted_variant');
  var fuzzy = match('Michelagnelo Merisi', ref);
  assert.strictEqual(fuzzy.status, 'fuzzy');
  assert.strictEqual(fuzzy.source, 'acceptedAnswers');
  assert.strictEqual(fuzzy.distance, 1);
  assert.strictEqual(match('Bernini', ref).status, 'wrong');
  assert.strictEqual(match('Caravaggio', ref).source, 'answer');
  assert.strictEqual(match('Merisi', 'Caravaggio', ['Merisi']).status, 'accepted_variant');
});

test('answerMatcher: Unicode composto/decomposto, diacritici estesi, spazi e punteggiatura', function () {
  ['CITTÀ', 'citta\u0300', '  città!  ', 'citt\u1ab0a', 'ｃｉｔｔａ'].forEach(function (s) {
    assert.strictEqual(match(s, 'citta').isCorrect, true, s);
  });
  assert.strictEqual(match('La\tVocazione\n di  san Matteo…', 'Vocazione di San Matteo').status, 'normalized');
  assert.strictEqual(match('«Il Colosseo»', 'Colosseo').status, 'normalized');
  assert.strictEqual(match('Αθήνα', 'αθηνα').status, 'normalized', 'le lettere non latine non vengono cancellate');
  assert.strictEqual(match('Афины', 'Рим').status, 'wrong');
});

test('answerMatcher: apostrofi normalizzati e un solo articolo italiano iniziale facoltativo', function () {
  ["L'Ara Pacis", 'L’Ara Pacis', 'L‘Ara Pacis', 'LʼAra Pacis', 'L`Ara Pacis', 'l’ Ara Pacis'].forEach(function (s) {
    assert.strictEqual(match(s, 'Ara Pacis').status, 'normalized', s);
  });
  ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una'].forEach(function (article) {
    assert.strictEqual(match(article + ' Colosseo', 'Colosseo').status, 'normalized');
  });
  assert.strictEqual(match('dell’arte', "dell'arte").status, 'normalized');
  assert.strictEqual(match('il il Colosseo', 'Colosseo').status, 'wrong');
  assert.strictEqual(AM.normalize('Liliana'), 'liliana', 'non rimuovere lettere dentro una parola');
  assert.strictEqual(AM.normalize('iliana'), 'iliana');
  assert.strictEqual(match('Vocazione Matteo', 'Vocazione di San Matteo').status, 'wrong');
});

test('answerMatcher: soglie 5/6/11/12 e lunghezza più corta conservativa', function () {
  assert.strictEqual(match('abcdx', 'abcde').status, 'wrong');
  assert.strictEqual(match('abcdxf', 'abcdef').status, 'fuzzy');
  assert.strictEqual(match('abxdxf', 'abcdef').status, 'wrong');
  assert.strictEqual(match('abcdxfghijk', 'abcdefghijk').status, 'fuzzy');
  assert.strictEqual(match('abxdxfghijk', 'abcdefghijk').status, 'wrong');
  assert.strictEqual(match('abxdxfghijkl', 'abcdefghijkl').status, 'fuzzy');
  assert.strictEqual(match('abxdxfghijxl', 'abcdefghijkl').status, 'wrong');
  assert.strictEqual(match('abcdefghij', 'abcdefghijkl').status, 'wrong', 'due cancellazioni portano sotto la soglia 12');
  assert.strictEqual(match('abcde', 'abcdef').status, 'wrong', 'una parola di cinque caratteri non è fuzzy');
});

test('answerMatcher: inserimenti, cancellazioni e trasposizioni Damerau-Levenshtein', function () {
  ['Caravagio', 'Caravaggioo', 'Caravaggioa', 'Caravaggjo', 'Caravgagio'].forEach(function (s) {
    assert.strictEqual(match(s, 'Caravaggio').status, 'fuzzy', s);
  });
  assert.strictEqual(AM.damerauLevenshtein('CA', 'ABC'), 2, 'Damerau completo, non solo OSA');
  assert.strictEqual(AM.damerauLevenshtein('Matteo', 'Mateot'), 2);
  assert.strictEqual(AM.damerauLevenshtein('', 'arte'), 4);
});

test('answerMatcher: parole sostituite, mancanti, aggiunte e riordinate sono errate', function () {
  [
    ['Ratto di Proserpina', 'Ratto delle Sabine'],
    ['Vocazione di San Matteo', 'Vocazione di San Marco'],
    ['Vocazione di San Matteo', 'Vocazione di Matteo'],
    ['Ratto di Proserpina', 'Ratto di Proserpina Bernini'],
    ['San Carlo', 'Carlo San'],
    ['abcdefgh ijklmnop', 'abcdxfgh ijklmnoq'],
    ['abcdefgh di ijklmnop', 'abcdefgh da ijklmnop']
  ].forEach(function (row) { assert.strictEqual(match(row[1], row[0]).status, 'wrong', row.join(' / ')); });
  assert.strictEqual(match('Ratto di Proserpnia', 'Ratto di Proserpina').status, 'fuzzy', 'typo in una sola parola lunga');
});

test('answerMatcher: un distrattore noto non viene accettato per somiglianza', function () {
  var ref = { answer: 'Caravaggio', otherAnswers: ['Caravaggi'] };
  assert.strictEqual(match('Caravagi', ref).status, 'wrong');
  assert.strictEqual(match('Caravaggi', ref).status, 'wrong');
  ref.acceptedAnswers = ['Caravaggi'];
  assert.strictEqual(match('Caravaggi', ref).status, 'accepted_variant', 'le varianti dichiarate hanno precedenza');
});

test('answerMatcher: numeri, segni, decimali e codici non hanno tolleranza typo', function () {
  ['123456', '-123456', '2,5', '2.5', '1A 2B 3C 4D'].forEach(function (answer) {
    assert.strictEqual(match(answer, answer).status, 'exact');
  });
  [['123457', '123456'], ['123456', '-123456'], ['25', '2,5'], ['2 5', '2.5'], ['1A 2B 3D 4D', '1A 2B 3C 4D']].forEach(function (row) {
    assert.strictEqual(match(row[0], row[1]).status, 'wrong');
  });
});

test('answerMatcher: vuoti, null, sola punteggiatura o diacritici e riferimenti invalidi non passano', function () {
  ['', ' ', null, undefined, {}, [], '!!!', '\u0300', 'il', "l'"].forEach(function (s) {
    assert.strictEqual(match(s, s).status, 'wrong');
    assert.strictEqual(match(s, 'Caravaggio').status, 'wrong');
  });
  assert.strictEqual(match('Caravaggio', null).status, 'wrong');
  assert.strictEqual(match('Bernini', { answer: 'Caravaggio', acceptedAnswers: 'Bernini' }).status, 'wrong');
});

test('answerMatcher: stesso modulo browser/Node, nessuna mutazione e fallback Unicode legacy', function () {
  var source = fs.readFileSync(path.join(__dirname, '../js/engine/answerMatcher.js'), 'utf8');
  var browser = {};
  vm.runInNewContext(source, browser);
  var ref = { answer: 'Caravaggio', acceptedAnswers: ['Michelangelo Merisi'], otherAnswers: ['Bernini'] };
  var before = JSON.stringify(ref);
  ['Caravaggio', 'Caravagio', 'Michelangelo Merisi', 'Bernini'].forEach(function (s) {
    assert.strictEqual(JSON.stringify(browser.SecchioneAnswerMatcher.answerMatcher(s, ref)), JSON.stringify(match(s, ref)));
  });
  assert.strictEqual(JSON.stringify(ref), before);
  var legacy = { RegExp: function (s, flags) { if (s.indexOf('\\p') >= 0) throw new Error('unsupported'); return new RegExp(s, flags); } };
  vm.runInNewContext(source, legacy);
  assert.strictEqual(legacy.SecchioneAnswerMatcher.answerMatcher('«L’Ara  Pacis!»', 'Ara Pacis').status, 'normalized');
  assert.strictEqual(legacy.SecchioneAnswerMatcher.answerMatcher('CITTÀ', 'citta').status, 'normalized');
});
