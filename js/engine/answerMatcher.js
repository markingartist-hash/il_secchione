/*
 * Unico matcher per risposte testuali: browser e server Node, senza I/O o punteggi.
 * Le soglie usano la lunghezza normalizzata più corta (conservativa).
 * Nelle frasi può contenere typo una sola parola, lunga almeno sei caratteri;
 * parole corte, numeri, numero e ordine delle parole devono restare invariati.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneAnswerMatcher = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATUSES = ['exact', 'normalized', 'accepted_variant', 'fuzzy', 'wrong'];
  var marks, punctuation;
  try {
    marks = new RegExp('\\p{M}+', 'gu');
    punctuation = new RegExp("[^\\p{L}\\p{N}\\s']", 'gu');
  } catch (e) {
    // Fallback per runtime antecedenti alle Unicode property escapes (Node 8).
    marks = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]+/g;
    punctuation = /[!"#$%&()*+,\-./:;<=>?@[\\\]^_`{|}~\u00a1\u00ab\u00b7\u00bb\u00bf\u2000-\u206f\u3000-\u303f]/g;
  }

  function asText(value) {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }

  function normalize(value) {
    var s = asText(value).toLowerCase();
    if (s.normalize) s = s.normalize('NFKD');
    s = s.replace(marks, '').replace(/[\u2018\u2019\u201b\u02bc\uff07`\u00b4]/g, "'");
    s = s.replace(punctuation, function (ch, offset, text) {
      // Segni/decimali numerici sono significativi anche in un campo testuale.
      var before = text.charAt(offset - 1), after = text.charAt(offset + ch.length);
      if (/[.,:/+-]/.test(ch) && /\d/.test(after) && (/\d/.test(before) || (/[+-]/.test(ch) && !/[a-z0-9]/i.test(before)))) return ch;
      return ' ';
    }).trim().replace(/\s+/g, ' ');
    s = s.replace(/^(?:l\s*'\s*|(?:il|lo|la|i|gli|le|un|uno|una)(?:\s+|$))/, '');
    return s.replace(/'/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function typoLimit(length) { return length < 6 ? 0 : length < 12 ? 1 : 2; }
  function chars(s) { return Array.from(s); }

  /** Damerau-Levenshtein completo: inserimento, cancellazione, sostituzione, trasposizione. */
  function damerauLevenshtein(left, right) {
    var a = chars(asText(left)), b = chars(asText(right));
    var n = a.length, m = b.length, inf = n + m;
    var d = [], last = Object.create(null), i, j;
    for (i = 0; i <= n + 1; i++) d[i] = [];
    d[0][0] = inf;
    for (i = 0; i <= n; i++) { d[i + 1][0] = inf; d[i + 1][1] = i; }
    for (j = 0; j <= m; j++) { d[0][j + 1] = inf; d[1][j + 1] = j; }
    for (i = 1; i <= n; i++) {
      var matchColumn = 0;
      for (j = 1; j <= m; j++) {
        var matchRow = last[b[j - 1]] || 0, previousColumn = matchColumn;
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        if (!cost) matchColumn = j;
        d[i + 1][j + 1] = Math.min(
          d[i][j] + cost, d[i + 1][j] + 1, d[i][j + 1] + 1,
          d[matchRow][previousColumn] + (i - matchRow - 1) + 1 + (j - previousColumn - 1)
        );
      }
      last[a[i - 1]] = i;
    }
    return d[n + 1][m + 1];
  }

  function fuzzyDistance(actual, expected) {
    var limit = typoLimit(Math.min(chars(actual).length, chars(expected).length));
    if (!limit || Math.abs(chars(actual).length - chars(expected).length) > limit) return null;
    var a = actual.split(' '), b = expected.split(' '), changed = 0;
    if (a.length !== b.length) return null;
    for (var i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      // Niente sostituzioni di parole corte, codici/numeri o più parole di una frase.
      if (++changed > 1 || /\d/.test(a[i] + b[i])) return null;
      var wordLimit = typoLimit(Math.min(chars(a[i]).length, chars(b[i]).length));
      if (!wordLimit || Math.abs(chars(a[i]).length - chars(b[i]).length) > wordLimit || damerauLevenshtein(a[i], b[i]) > wordLimit) return null;
    }
    var distance = damerauLevenshtein(actual, expected);
    return distance > 0 && distance <= limit ? distance : null;
  }

  /**
   * answerMatcher(studentAnswer, {answer, acceptedAnswers?, otherAnswers?})
   * oppure answerMatcher(studentAnswer, answer, acceptedAnswers).
   * otherAnswers: distrattori noti; impedisce di accettarli per somiglianza.
   * Nessuna decisione manuale del docente viene letta o modificata da questa funzione.
   */
  function answerMatcher(studentAnswer, reference, acceptedAnswers) {
    var ref = reference && typeof reference === 'object' && !Array.isArray(reference) ? reference : { answer: reference, acceptedAnswers: acceptedAnswers };
    var actualRaw = asText(studentAnswer), expectedRaw = asText(ref.answer);
    var actual = normalize(actualRaw);
    var candidates = [{ raw: expectedRaw, normalized: normalize(expectedRaw), source: 'answer' }];
    (Array.isArray(ref.acceptedAnswers) ? ref.acceptedAnswers : []).forEach(function (value) {
      if (typeof value === 'string' || typeof value === 'number') candidates.push({ raw: asText(value), normalized: normalize(value), source: 'acceptedAnswers' });
    });
    candidates = candidates.filter(function (c) { return !!c.normalized; });
    function result(status, candidate, distance) {
      return {
        status: status, isCorrect: status !== 'wrong', normalizedAnswer: actual,
        matchedAnswer: candidate ? candidate.raw : null,
        normalizedExpected: candidate ? candidate.normalized : null,
        source: candidate ? candidate.source : null, distance: distance == null ? null : distance
      };
    }
    if (!actual || !candidates.length) return result('wrong');
    var i, c;
    for (i = 0; i < candidates.length; i++) {
      c = candidates[i];
      if (actual === c.normalized) return result(c.source === 'acceptedAnswers' ? 'accepted_variant' : actualRaw === c.raw ? 'exact' : 'normalized', c, 0);
    }
    if ((Array.isArray(ref.otherAnswers) ? ref.otherAnswers : []).some(function (value) { return actual === normalize(value); })) return result('wrong');
    var best = null;
    for (i = 0; i < candidates.length; i++) {
      c = candidates[i];
      var distance = fuzzyDistance(actual, c.normalized);
      if (distance != null && (!best || distance < best.distance)) best = { candidate: c, distance: distance };
    }
    return best ? result('fuzzy', best.candidate, best.distance) : result('wrong');
  }

  return { answerMatcher: answerMatcher, normalize: normalize, damerauLevenshtein: damerauLevenshtein, STATUSES: STATUSES };
});
