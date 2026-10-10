/*
 * Il Secchione · scoring.js
 * UNICA fonte di verità per il calcolo dei punteggi (browser HOST, server Node, test).
 * Il punteggio è sempre DERIVATO dai record grezzi (outcome + ordine), mai salvato come unico dato.
 * Sintassi ES2017 senza ?. e ?? per restare compatibile con Node >= 8.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneScoring = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OUTCOMES = ['correct', 'wrong', 'omitted'];

  var PROFILES = {
    legacy_v3: {
      id: 'legacy_v3',
      label: 'Classico v3',
      description: 'Corrette temporizzate 300 / 275 / 250…; se una corretta è inserita a mano, le corrette sono ex aequo. Errata −100, omessa −100.',
      correct: { mode: 'rank', start: 300, step: 25, min: 0 },
      wrong: -100,
      omitted: -100,
      timeAffectsScore: false
    },
    show_standard: {
      id: 'show_standard',
      label: 'Show',
      description: 'Corrette da 200 a 300 punti in base all’ordine/tempo; se una corretta è inserita a mano, le corrette sono ex aequo. Errata da −50 a −200 in base alla classifica; omessa 0.',
      correct: { mode: 'rank', start: 300, step: 25, min: 200 },
      wrong: { mode: 'standing', first: -200, last: -50, roundTo: 5 },
      omitted: 0,
      timeAffectsScore: false
    },
    learning: {
      id: 'learning',
      label: 'Didattico',
      description: 'Corretta 1 punto, errata 0, omessa 0. Il tempo viene registrato ma non cambia il punteggio.',
      correct: { mode: 'flat', points: 1 },
      wrong: 0,
      omitted: 0,
      timeAffectsScore: false
    }
  };

  var DEFAULT_PROFILE = 'show_standard';
  var PROFILE_ORDER = ['show_standard', 'learning', 'legacy_v3'];
  var DEFAULT_FREE_OMISSIONS = 3;

  function hasProfile(id) { return Object.prototype.hasOwnProperty.call(PROFILES, id); }

  function getProfile(idOrProfile) {
    if (idOrProfile && typeof idOrProfile === 'object' && idOrProfile.correct) return idOrProfile;
    if (hasProfile(idOrProfile)) return PROFILES[idOrProfile];
    return PROFILES[DEFAULT_PROFILE];
  }

  /** Normalizza i nomi storici: v3 usava 'abstain'. */
  function normalizeOutcome(outcome) {
    if (outcome === 'correct' || outcome === 'wrong') return outcome;
    if (outcome === 'omitted' || outcome === 'abstain' || outcome === 'omesso' || outcome === 'omessa' || outcome == null || outcome === '') return 'omitted';
    throw new Error('Esito non valido: ' + outcome);
  }

  /** Punti per la n-esima risposta corretta (position parte da 1). */
  function rankPoints(profileOrId, position) {
    var p = getProfile(profileOrId);
    var c = p.correct;
    if (c.mode === 'flat') return Number(c.points) || 0;
    var pos = Math.max(1, Math.floor(Number(position)) || 1);
    return Math.max(Number(c.min) || 0, (Number(c.start) || 0) - (pos - 1) * (Number(c.step) || 0));
  }


  /** Penalità per risposta errata in base alla posizione corrente in classifica.
   * first = penalità del gruppo in testa, last = penalità dell'ultimo gruppo.
   * Se la classifica non distingue ancora le squadre (tutte a pari punti), vale la penalità minima.
   */
  function wrongPoints(profileOrId, standingRank, standingGroups) {
    var p = getProfile(profileOrId);
    var w = p.wrong;
    if (typeof w === 'number') return Number(w) || 0;
    if (!w || w.mode !== 'standing') return Number(w && w.points) || 0;
    var first = Number(w.first); if (!isFinite(first)) first = -200;
    var last = Number(w.last); if (!isFinite(last)) last = -50;
    var groups = Math.max(1, Math.floor(Number(standingGroups)) || 1);
    if (groups <= 1) return last;
    var rank = Math.max(1, Math.min(groups, Math.floor(Number(standingRank)) || 1));
    var raw = first + (last - first) * ((rank - 1) / (groups - 1));
    var step = Math.max(1, Math.floor(Number(w.roundTo)) || 1);
    return Math.round(raw / step) * step;
  }

  /** Crea gruppi di classifica dai punteggi PRIMA del round. Le parità condividono la stessa penalità. */
  function standingContext(records, standingScores, profileOrId) {
    var scores = standingScores || {};
    var ids = [], seen = {};
    (records || []).forEach(function (r) {
      if (!r || r.voided || !r.participantId || seen[r.participantId]) return;
      seen[r.participantId] = true; ids.push(r.participantId);
    });
    var vals = [];
    ids.forEach(function (id) { var v = Number(scores[id]); vals.push(isFinite(v) ? v : 0); });
    var uniq = vals.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a,b) { return b-a; });
    var groups = Math.max(1, uniq.length), out = {};
    ids.forEach(function (id) {
      var v = Number(scores[id]); if (!isFinite(v)) v = 0;
      var rank = Math.max(1, uniq.indexOf(v) + 1);
      out[id] = { rank: rank, groups: groups, points: wrongPoints(profileOrId, rank, groups), score: v };
    });
    return out;
  }

  function pointsFor(profileOrId, outcome, position) {
    var p = getProfile(profileOrId);
    var o = normalizeOutcome(outcome);
    if (o === 'correct') return rankPoints(p, position);
    if (o === 'wrong') return wrongPoints(p, 1, 1);
    return Number(p.omitted) || 0;
  }

  /**
   * Calcola i punti di un round a partire dai record grezzi.
   * records: [{participantId, outcome, order?, voided?}]
   *  - i record con voided=true sono ignorati;
   *  - se un partecipante ha più record validi vale il primo per ordine;
   *  - le corrette sono classificate per `order` crescente (a parità, ordine di array).
   * Restituisce [{participantId, outcome, rank, points, exAequo}] nello stesso ordine dei partecipanti trovati.
   *
   * RC1.1 — il bonus d'ordine vale solo per corrette realmente temporizzate. Se nel round esiste almeno una
   * risposta CORRETTA raccolta a mano (inputMode 'manual', non auto), non sappiamo dove collocarla nel tempo:
   * tutte le corrette diventano quindi ex aequo e prendono i punti del 1° posto. Una risposta manuale errata
   * o omessa non annulla invece i tempi validi delle corrette ricevute dai tablet.
   */
  function hasManualCorrect(records) {
    return (records || []).some(function (r) {
      return r && !r.voided && r.inputMode === 'manual' && !r.auto && normalizeOutcome(r.outcome) === 'correct';
    });
  }
  function scoreRound(records, profileOrId, options) {
    var p = getProfile(profileOrId);
    var o = options || {};
    var useOmissionPolicy = o.freeOmissions != null || o.priorOmissions != null;
    var freeOmissions = o.freeOmissions == null ? DEFAULT_FREE_OMISSIONS : Math.max(0, Math.floor(Number(o.freeOmissions) || 0));
    var prior = o.priorOmissions || {};
    var exAequo = o.exAequo === true || hasManualCorrect(records);
    var list = (records || []).map(function (r, i) {
      return { r: r, i: i, order: isFinite(Number(r.order)) && r.order !== null ? Number(r.order) : Number.MAX_SAFE_INTEGER };
    }).filter(function (x) { return x.r && !x.r.voided && x.r.participantId; });
    list.sort(function (a, b) { return a.order - b.order || a.i - b.i; });
    var seen = {};
    var unique = [];
    list.forEach(function (x) {
      if (seen[x.r.participantId]) return;
      seen[x.r.participantId] = true;
      unique.push(x);
    });
    var rank = 0;
    var standings = standingContext(unique.map(function (x) { return x.r; }), o.standingScores, p);
    var byId = {};
    unique.forEach(function (x) {
      var outcome = normalizeOutcome(x.r.outcome);
      var scoringOutcome = outcome;
      var omissionNumber = null;
      var position = null;
      if (outcome === 'correct') {
        rank += 1;
        position = exAequo ? 1 : rank;
      } else if (useOmissionPolicy && outcome === 'omitted') {
        omissionNumber = Math.max(0, Math.floor(Number(prior[x.r.participantId]) || 0)) + 1;
        scoringOutcome = omissionNumber > freeOmissions ? 'wrong' : 'omitted';
      }
      var standing = standings[x.r.participantId] || { rank: 1, groups: 1, points: wrongPoints(p, 1, 1) };
      var points = scoringOutcome === 'wrong' ? standing.points : pointsFor(p, scoringOutcome, position || 1);
      // Le prime N omissioni sono davvero gratuite anche con profili storici che penalizzavano ogni omissione.
      if (useOmissionPolicy && outcome === 'omitted' && omissionNumber <= freeOmissions) points = 0;
      byId[x.r.participantId] = {
        participantId: x.r.participantId,
        outcome: outcome,
        scoringOutcome: scoringOutcome,
        omissionNumber: omissionNumber,
        rank: position,
        points: points,
        standingRank: standing.rank,
        standingGroups: standing.groups,
        wrongPoints: standing.points,
        exAequo: exAequo && outcome === 'correct'
      };
    });
    // Ordine di uscita: ordine di prima apparizione nell'array originale (stabile per la UI).
    var out = [];
    var emitted = {};
    (records || []).forEach(function (r) {
      if (r && byId[r.participantId] && !emitted[r.participantId]) { emitted[r.participantId] = true; out.push(byId[r.participantId]); }
    });
    return out;
  }

  /** Somma eventi di punteggio e rettifiche manuali. */
  function totals(scoreEvents, adjustments) {
    var t = {};
    (scoreEvents || []).forEach(function (e) {
      if (!e || e.voided) return;
      t[e.participantId] = (t[e.participantId] || 0) + (Number(e.points) || 0);
    });
    (adjustments || []).forEach(function (a) {
      if (!a || a.voided) return;
      t[a.participantId] = (t[a.participantId] || 0) + (Number(a.points) || 0);
    });
    return t;
  }

  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }

  /** Testo breve per regia e palco, es. "Corrette 300 / 275 / 250… · Errata −100 · Omessa 0". */
  function rulesSummary(profileOrId) {
    var p = getProfile(profileOrId);
    var c = p.correct;
    var corr = c.mode === 'flat'
      ? 'Corretta ' + c.points + (c.points === 1 ? ' punto' : ' punti')
      : 'Corrette temporizzate ' + [1, 2, 3].map(function (i) { return rankPoints(p, i); }).join(' / ') + '…';
    var err = (p.wrong && typeof p.wrong === 'object' && p.wrong.mode === 'standing')
      ? 'Errata ' + signed(Number(p.wrong.last) || 0) + '…' + signed(Number(p.wrong.first) || 0) + ' (classifica)'
      : 'Errata ' + signed(Number(p.wrong) || 0);
    if (c.mode === 'rank' && Number(c.min) > 0) corr += ' (min ' + Number(c.min) + ')';
    return corr + ' · ' + err + ' · Omessa ' + signed(Number(p.omitted) || 0);
  }

  function listProfiles() {
    return PROFILE_ORDER.map(function (id) { return PROFILES[id]; });
  }

  return {
    OUTCOMES: OUTCOMES,
    PROFILES: PROFILES,
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    DEFAULT_FREE_OMISSIONS: DEFAULT_FREE_OMISSIONS,
    hasProfile: hasProfile,
    getProfile: getProfile,
    listProfiles: listProfiles,
    normalizeOutcome: normalizeOutcome,
    rankPoints: rankPoints,
    wrongPoints: wrongPoints,
    standingContext: standingContext,
    pointsFor: pointsFor,
    scoreRound: scoreRound,
    hasManualCorrect: hasManualCorrect,
    hasManualAnswer: hasManualCorrect, // alias compatibile: ora significa "almeno una corretta manuale"
    totals: totals,
    rulesSummary: rulesSummary,
    signed: signed
  };
});
