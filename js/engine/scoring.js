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

  /* RC2-A — punteggio post-pilot: una corretta vale da 200 (correttezza) a 300 punti (200 + bonus velocità fino a 100),
     in proporzione lineare al tempo REALE misurato dai tablet rispetto al tempo disponibile del round. */
  var SPEED_BASE = 200;
  var SPEED_MAX = 300;

  var PROFILES = {
    show_speed: {
      id: 'show_speed',
      label: 'Show 200–300',
      description: 'Corretta da 200 a 300 punti: 200 per la correttezza più un bonus fino a 100 per la velocità misurata dai tablet. Inserita a mano = 200. Errata −100, omessa 0.',
      correct: { mode: 'speed', base: SPEED_BASE, max: SPEED_MAX },
      wrong: -100,
      omitted: 0,
      timeAffectsScore: true
    },
    legacy_v3: {
      id: 'legacy_v3',
      label: 'Classico v3',
      description: 'Come la versione 3.0: corrette in ordine 300 / 275 / 250…, errata −100, omessa −100.',
      correct: { mode: 'rank', start: 300, step: 25, min: 0 },
      wrong: -100,
      omitted: -100,
      timeAffectsScore: false
    },
    show_standard: {
      id: 'show_standard',
      label: 'Show classico (300 / 275 / 250…)',
      description: 'Profilo delle versioni fino alla 1.0 RC1, conservato per le partite già giocate: corrette in ordine 300 / 275 / 250…, errata −100, omessa 0.',
      correct: { mode: 'rank', start: 300, step: 25, min: 0 },
      wrong: -100,
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

  var DEFAULT_PROFILE = 'show_speed';
  var PROFILE_ORDER = ['show_speed', 'learning', 'show_standard', 'legacy_v3'];
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

  /**
   * RC2-A — UNICO contratto del bonus velocità (regia, server, ricalcolo, report).
   * points = round(300 − 100 × elapsed / available), sempre tra 200 e 300.
   * Senza un tempo misurato o senza un tempo disponibile valido: 200 (mai tempi inventati).
   */
  function speedPoints(elapsedMs, availableMs, profileOrId) {
    var c = getProfile(profileOrId || 'show_speed').correct;
    var base = c && c.mode === 'speed' ? Number(c.base) : SPEED_BASE;
    var max = c && c.mode === 'speed' ? Number(c.max) : SPEED_MAX;
    var e = Number(elapsedMs), a = Number(availableMs);
    if (elapsedMs == null || availableMs == null || !isFinite(e) || !isFinite(a) || a <= 0) return base;
    var ratio = Math.min(1, Math.max(0, e / a));
    return Math.min(max, Math.max(base, Math.round(max - (max - base) * ratio)));
  }

  /** Tempo realmente misurato: risposta da tablet (non riempita in automatico) con tempo e tempo disponibile validi. */
  function measured(r) {
    return !!r && r.inputMode === 'tablet' && !r.auto && r.responseTimeMs != null && isFinite(Number(r.responseTimeMs)) &&
      r.availableMs != null && isFinite(Number(r.availableMs)) && Number(r.availableMs) > 0;
  }

  /** RC2-A: una risposta CORRETTA inserita a mano rende il confronto dei tempi non valido per tutto il round. */
  function hasManualCorrect(records) {
    return (records || []).some(function (r) {
      if (!r || r.voided || r.inputMode !== 'manual' || r.auto) return false;
      try { return normalizeOutcome(r.outcome) === 'correct'; } catch (e) { return false; }
    });
  }

  /** Punti per la n-esima risposta corretta (position parte da 1). Nel profilo a velocità: la base (200). */
  function rankPoints(profileOrId, position) {
    var p = getProfile(profileOrId);
    var c = p.correct;
    if (c.mode === 'flat') return Number(c.points) || 0;
    if (c.mode === 'speed') return Number(c.base) || 0;
    var pos = Math.max(1, Math.floor(Number(position)) || 1);
    return Math.max(Number(c.min) || 0, (Number(c.start) || 0) - (pos - 1) * (Number(c.step) || 0));
  }

  function pointsFor(profileOrId, outcome, position) {
    var p = getProfile(profileOrId);
    var o = normalizeOutcome(outcome);
    if (o === 'correct') return rankPoints(p, position);
    if (o === 'wrong') return Number(p.wrong) || 0;
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
   * RC1 — il tempo conta solo se è stato davvero misurato: se nel round c'è almeno una risposta raccolta a mano
   * (inputMode 'manual' e non un'omissione riempita automaticamente, auto=true) tutte le corrette sono ex aequo
   * e prendono i punti del 1° posto, senza bonus di velocità. L'ordine di digitazione non è mai un ordine di risposta.
   * Errate e omissioni seguono il profilo attivo come sempre.
   */
  function hasManualAnswer(records) {
    return (records || []).some(function (r) { return r && !r.voided && r.inputMode === 'manual' && !r.auto; });
  }
  function scoreRound(records, profileOrId, options) {
    var p = getProfile(profileOrId);
    var o = options || {};
    var useOmissionPolicy = o.freeOmissions != null || o.priorOmissions != null;
    var freeOmissions = o.freeOmissions == null ? DEFAULT_FREE_OMISSIONS : Math.max(0, Math.floor(Number(o.freeOmissions) || 0));
    var prior = o.priorOmissions || {};
    var speed = p.correct.mode === 'speed';
    /* Profili a posizione (fino alla RC1): una risposta a mano qualsiasi = corrette ex aequo.
       Profilo a velocità (RC2-A): solo una CORRETTA a mano annulla il bonus del round; tutte le corrette valgono 200. */
    var exAequo = !speed && (o.exAequo === true || hasManualAnswer(records));
    var speedOff = speed && hasManualCorrect(records);
    var roundAvailable = o.availableMs;
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
      var points = pointsFor(p, scoringOutcome, position || 1);
      var timed = false;
      if (speed && outcome === 'correct' && !speedOff) {
        var rr = x.r.availableMs == null && roundAvailable != null ? Object.assign({}, x.r, { availableMs: roundAvailable }) : x.r;
        if (measured(rr)) { points = speedPoints(rr.responseTimeMs, rr.availableMs, p); timed = true; }
      }
      // Le prime N omissioni sono davvero gratuite anche con profili storici che penalizzavano ogni omissione.
      if (useOmissionPolicy && outcome === 'omitted' && omissionNumber <= freeOmissions) points = 0;
      byId[x.r.participantId] = {
        participantId: x.r.participantId,
        outcome: outcome,
        scoringOutcome: scoringOutcome,
        omissionNumber: omissionNumber,
        rank: position,
        points: points,
        exAequo: exAequo && outcome === 'correct',
        timed: timed,
        speedBonus: timed ? points - (Number(p.correct.base) || 0) : 0,
        speedOff: speedOff && outcome === 'correct'
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
      : c.mode === 'speed'
        ? 'Corretta ' + c.base + '–' + c.max + ' (più veloce = più punti)'
        : 'Corrette ' + [1, 2, 3].map(function (i) { return rankPoints(p, i); }).join(' / ') + '…';
    return corr + ' · Errata ' + signed(Number(p.wrong) || 0) + ' · Omessa ' + signed(Number(p.omitted) || 0);
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
    pointsFor: pointsFor,
    scoreRound: scoreRound,
    hasManualAnswer: hasManualAnswer,
    hasManualCorrect: hasManualCorrect,
    speedPoints: speedPoints,
    measured: measured,
    SPEED_BASE: SPEED_BASE,
    SPEED_MAX: SPEED_MAX,
    totals: totals,
    rulesSummary: rulesSummary,
    signed: signed
  };
});
