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

  /* RC2-A — punteggio post-pilot: una corretta vale da 200 a 300 punti in base alla velocità,
     in proporzione lineare al tempo REALE misurato dai tablet rispetto al tempo disponibile del round. */
  var SPEED_BASE = 200;
  var SPEED_MAX = 300;

  var PROFILES = {
    show_speed: {
      id: 'show_speed',
      label: 'Show 200–300',
      description: 'Corretta da 200 a 300 punti in base alla velocità misurata dai tablet. Senza tablet le corrette valgono 300, 290, 280… nell’ordine in cui le registri (minimo 200). Errata −100, omessa 0.',
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
   * RC2-A.2 — helper generico della velocità: points = round(max − (max − min) × elapsed / available), sempre tra min e max.
   * Senza un tempo misurato o senza un tempo disponibile valido: min (mai tempi inventati).
   */
  function speedRangePoints(elapsedMs, availableMs, minPoints, maxPoints) {
    var lo = Number(minPoints), hi = Number(maxPoints);
    var e = Number(elapsedMs), a = Number(availableMs);
    if (elapsedMs == null || availableMs == null || !isFinite(e) || !isFinite(a) || a <= 0) return lo;
    var ratio = Math.min(1, Math.max(0, e / a));
    return Math.min(hi, Math.max(lo, Math.round(hi - (hi - lo) * ratio)));
  }

  /** RC2-A.2 — helper generico del rango (input manuale): 1ª corretta = max, poi −step a ogni corretta, mai sotto min. */
  function rankRangePoints(rank, maxPoints, step, minPoints) {
    var r = Math.max(1, Math.floor(Number(rank)) || 1);
    return Math.max(Number(minPoints) || 0, (Number(maxPoints) || 0) - (r - 1) * (Number(step) || 0));
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
    return speedRangePoints(elapsedMs, availableMs, base, max);
  }

  /*
   * RC2-A.2 — SCALE di punteggio di un micro-round (salvata nel round: `scale`). Valgono per il profilo a velocità.
   *  - standard   domanda, Photopuzzle, Indovina, Abbinamenti, finale della Ghigliottina:
   *               tablet 200–300 per velocità · solo a mano 300, 290, 280… (min 200) · errata/omessa come il profilo
   *  - gh_pair    scelta A/B di una coppia della Ghigliottina: corretta +10, errata 0, omessa 0 (nessun tempo, nessun rango)
   *  - chain_link una parola della Catena/Staffetta: tablet 50–100 per velocità · solo a mano 100, 95, 90… (min 50) ·
   *               errata 0, omessa 0
   * In un micro-round con tablet, una sola CORRETTA inserita a mano porta tutte le corrette al minimo della scala;
   * errate e omesse a mano non tolgono il bonus. Le omissioni di gh_pair e chain_link non contano per le 3 gratuite.
   * Round senza `scale` (giocati fino alla RC2-A.1): regole di allora, nessun ricalcolo retroattivo.
   * Profili senza velocità (show_standard, legacy_v3, learning): regole di sempre; le coppie della Ghigliottina valgono 0.
   */
  var SCALES = {
    standard: { id: 'standard', speedMin: SPEED_BASE, speedMax: SPEED_MAX, rankMax: 300, rankStep: 10, rankMin: 200, profileWrong: true, omissionPolicy: true },
    gh_pair: { id: 'gh_pair', flat: 10, wrong: 0, omitted: 0, omissionPolicy: false },
    chain_link: { id: 'chain_link', speedMin: 50, speedMax: 100, rankMax: 100, rankStep: 5, rankMin: 50, wrong: 0, omitted: 0, omissionPolicy: false }
  };
  function hasScale(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SCALES, id); }
  /** Scala di un round nuovo: esplicita se indicata, altrimenti dal tipo (Catena = chain_link, il resto standard). */
  function scaleFor(meta) {
    var m = meta || {};
    if (hasScale(m.scale)) return m.scale;
    if (m.kind === 'arcade' && m.gameType === 'chain') return 'chain_link';
    return 'standard';
  }
  /** Le omissioni di questo round contano per le 3 gratuite? (no per coppie Ghigliottina e parole Catena col profilo a velocità) */
  function countsOmissions(scale, profileOrId) {
    if (scale === 'gh_pair') return false;
    if (scale === 'chain_link') return getProfile(profileOrId).correct.mode !== 'speed';
    return true;
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
  /** RC2-A.2: nel micro-round ha risposto davvero almeno un tablet (le omissioni automatiche non contano). */
  function hasTabletAnswer(records) {
    return (records || []).some(function (r) { return r && !r.voided && r.inputMode === 'tablet' && !r.auto; });
  }
  function scoreRound(records, profileOrId, options) {
    var p = getProfile(profileOrId);
    var o = options || {};
    var speed = p.correct.mode === 'speed';
    var scale = hasScale(o.scale) ? SCALES[o.scale] : null;
    /* RC2-A.2: coppie Ghigliottina e parole Catena non applicano la politica delle omissioni (omessa = 0, non conta). */
    var noOmissionPolicy = !!scale && !countsOmissions(scale.id, p);
    var useOmissionPolicy = !noOmissionPolicy && (o.freeOmissions != null || o.priorOmissions != null);
    var freeOmissions = o.freeOmissions == null ? DEFAULT_FREE_OMISSIONS : Math.max(0, Math.floor(Number(o.freeOmissions) || 0));
    var prior = o.priorOmissions || {};
    /* Profili a posizione (fino alla RC1): una risposta a mano qualsiasi = corrette ex aequo.
       Profilo a velocità (RC2-A): solo una CORRETTA a mano annulla il bonus del round; tutte le corrette valgono il minimo.
       RC2-A.2: senza nessun tablet le corrette prendono il rango (300, 290… / 100, 95…). */
    var exAequo = !speed && (o.exAequo === true || hasManualAnswer(records));
    var speedOff = speed && hasManualCorrect(records);
    var rangeScale = speed && scale && scale.speedMax != null ? scale : null;
    var manualRank = !!rangeScale && !hasTabletAnswer(records);
    if (manualRank) speedOff = false;
    var minPoints = rangeScale ? rangeScale.speedMin : (Number(p.correct.base) || 0);
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
      if (scale && scale.id === 'gh_pair') {
        points = outcome === 'correct' && speed ? scale.flat : 0;
      } else if (rangeScale) {
        if (outcome === 'correct') {
          points = manualRank ? rankRangePoints(position, rangeScale.rankMax, rangeScale.rankStep, rangeScale.rankMin) : rangeScale.speedMin;
        } else if (!rangeScale.profileWrong) {
          points = outcome === 'wrong' ? rangeScale.wrong : rangeScale.omitted;
        }
      }
      if (speed && outcome === 'correct' && !speedOff && !manualRank && (!scale || rangeScale)) {
        var rr = x.r.availableMs == null && roundAvailable != null ? Object.assign({}, x.r, { availableMs: roundAvailable }) : x.r;
        if (measured(rr)) {
          points = speedRangePoints(rr.responseTimeMs, rr.availableMs, minPoints, rangeScale ? rangeScale.speedMax : (Number(p.correct.max) || SPEED_MAX));
          timed = true;
        }
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
        speedBonus: timed ? points - minPoints : 0,
        speedOff: speedOff && outcome === 'correct' && (!scale || !!rangeScale),
        manualRank: manualRank && outcome === 'correct',
        scale: scale ? scale.id : null
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
        ? 'Corretta ' + c.base + '–' + c.max + ' pt in base alla velocità'
        : 'Corrette ' + [1, 2, 3].map(function (i) { return rankPoints(p, i); }).join(' / ') + '…';
    return corr + ' · Errata ' + signed(Number(p.wrong) || 0) + ' · Omessa ' + signed(Number(p.omitted) || 0);
  }

  /**
   * RC2-A.2 — regola di punteggio REALE di un contenuto, in chiaro per gli studenti (palco, regia, guida).
   * type: 'question' | 'photopuzzle' | 'indovina' | 'abbinamenti' | 'ghigliottina' | 'chain'. Nessuna formula ambigua.
   */
  function gameRules(type, profileOrId) {
    var p = getProfile(profileOrId);
    if (p.correct.mode !== 'speed') return rulesSummary(p);
    if (type === 'ghigliottina') return 'Ogni scelta corretta +10 pt · Risposta finale corretta 200–300 pt in base alla velocità';
    if (type === 'chain') return 'Ogni parola corretta 50–100 pt in base alla velocità · Errata o nessuna risposta 0';
    return '✓ Corretta: ' + p.correct.base + '–' + p.correct.max + ' pt in base alla velocità · ✗ Errata ' + signed(Number(p.wrong) || 0) + ' · Ø Nessuna risposta ' + signed(Number(p.omitted) || 0);
  }
  /** RC2-A.2 — regola senza tablet (risposte registrate dal docente): il rango delle sole corrette. */
  function manualRules(type, profileOrId) {
    var p = getProfile(profileOrId);
    if (p.correct.mode !== 'speed') return '';
    if (type === 'chain') return 'Senza tablet: 100, 95, 90… nell’ordine in cui il docente registra le parole corrette (minimo 50)';
    return 'Senza tablet: 300, 290, 280… nell’ordine in cui il docente registra le corrette (minimo 200)';
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
    speedRangePoints: speedRangePoints,
    rankRangePoints: rankRangePoints,
    hasTabletAnswer: hasTabletAnswer,
    SCALES: SCALES,
    hasScale: hasScale,
    scaleFor: scaleFor,
    countsOmissions: countsOmissions,
    measured: measured,
    SPEED_BASE: SPEED_BASE,
    SPEED_MAX: SPEED_MAX,
    totals: totals,
    rulesSummary: rulesSummary,
    gameRules: gameRules,
    manualRules: manualRules,
    signed: signed
  };
});
