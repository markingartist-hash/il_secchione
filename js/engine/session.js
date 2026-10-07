/*
 * Il Secchione · session.js
 * Modello dati della sessione, condiviso da HOST (browser), server e test.
 * - Participant generico (team | individual)
 * - Record grezzi di risposta (PERFORMANCE) separati dagli eventi di punteggio (GAME SCORE)
 * - Metadati pronti per l'istituto (anno, classe, modalità) ma tutti facoltativi
 */
(function (root, factory) {
  var scoring = (typeof module !== 'undefined' && module.exports) ? require('./scoring.js') : root.SecchioneScoring;
  var api = factory(scoring);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneSession = api;
})(typeof self !== 'undefined' ? self : this, function (Scoring) {
  'use strict';

  var FORMAT = 'secchione-session';
  var FORMAT_VERSION = 1;
  var MODES = ['lesson', 'qualification', 'final'];
  var PARTICIPANT_TYPES = ['team', 'individual'];
  var INPUT_MODES = ['manual', 'tablet'];
  var LOG_LIMIT = 5000;

  function randomHex(bytes) {
    var out = '';
    var arr = null;
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        arr = new Uint8Array(bytes);
        crypto.getRandomValues(arr);
      } else if (typeof require === 'function') {
        arr = require('crypto').randomBytes(bytes);
      }
    } catch (e) { arr = null; }
    for (var i = 0; i < bytes; i++) {
      var b = arr ? arr[i] : Math.floor(Math.random() * 256);
      out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
  }

  /** UUID v4 (formato standard), funziona anche da file:// e in Node 8. */
  function uuid() {
    var h = randomHex(16).split('');
    h[12] = '4';
    h[16] = '89ab'[parseInt(h[16], 16) & 3];
    h = h.join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function nowISO() { return new Date().toISOString(); }

  /** Anno scolastico italiano: da settembre si passa all'anno successivo. */
  function schoolYearFor(date) {
    var d = date ? new Date(date) : new Date();
    var y = d.getFullYear();
    var start = d.getMonth() >= 8 ? y : y - 1;
    return start + '/' + String((start + 1) % 100).padStart(2, '0');
  }

  function cleanText(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 120);
  }

  function makeParticipant(name, type, id) {
    var t = PARTICIPANT_TYPES.indexOf(type) >= 0 ? type : 'team';
    return { id: id || uuid(), type: t, name: cleanText(name, 60), createdAt: nowISO() };
  }

  function createSession(opts) {
    var o = opts || {};
    var meta = o.meta || {};
    var now = nowISO();
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      sessionId: o.sessionId || uuid(),
      createdAt: now,
      updatedAt: now,
      status: 'active',
      meta: {
        institution: cleanText(meta.institution, 120),
        schoolYear: cleanText(meta.schoolYear || schoolYearFor(), 9),
        gradeLevel: meta.gradeLevel == null || meta.gradeLevel === '' ? null : Number(meta.gradeLevel) || null,
        classLabel: cleanText(meta.classLabel, 40),
        competitionId: meta.competitionId || null,
        mode: MODES.indexOf(meta.mode) >= 0 ? meta.mode : 'lesson'
      },
      packId: o.packId || '',
      packVersion: o.packVersion || '',
      scoringProfile: Scoring.hasProfile(o.scoringProfile) ? o.scoringProfile : Scoring.DEFAULT_PROFILE,
      participants: [],
      rounds: [],
      responses: [],
      scoreEvents: [],
      adjustments: [],
      log: []
    };
  }

  /** Esito dedotto dalla lettera scelta e da quella corretta. */
  function outcomeForAnswer(answer, correct) {
    if (answer == null || answer === '' || answer === 'abstain' || answer === 'Ø' || answer === '0') return 'omitted';
    return String(answer).toUpperCase() === String(correct).toUpperCase() ? 'correct' : 'wrong';
  }

  /**
   * Record grezzo di risposta (PERFORMANCE). Nessun punteggio dentro.
   * responseTimeMs è null quando il tempo non è stato realmente misurato (input manuale).
   */
  function makeResponse(f) {
    var x = f || {};
    var inputMode = INPUT_MODES.indexOf(x.inputMode) >= 0 ? x.inputMode : 'manual';
    var rt = x.responseTimeMs;
    var av = Number(x.availableMs);
    return {
      responseId: x.responseId || uuid(),
      sessionId: x.sessionId || '',
      roundInstanceId: x.roundInstanceId || '',
      kind: x.kind === 'arcade' ? 'arcade' : 'question',
      questionId: x.questionId == null ? null : String(x.questionId),
      gameType: x.gameType || null,
      participantId: x.participantId,
      participantType: x.participantType || 'team',
      selectedAnswer: x.selectedAnswer == null ? null : String(x.selectedAnswer),
      selectedSourceIndex: typeof x.selectedSourceIndex === 'number' ? x.selectedSourceIndex : null,
      correctAnswer: x.correctAnswer == null ? null : String(x.correctAnswer),
      outcome: Scoring.normalizeOutcome(x.outcome),
      responseTimeMs: inputMode === 'tablet' && typeof rt === 'number' && isFinite(rt) ? Math.max(0, Math.round(rt)) : null,
      /* RC2-A: tempo disponibile finale del round (durata + secondi aggiunti, pause escluse), uguale per tutti i record del round. */
      availableMs: x.availableMs != null && isFinite(av) && av > 0 ? Math.round(av) : null,
      inputMode: inputMode,
      order: typeof x.order === 'number' ? x.order : null,
      deviceId: x.deviceId || null,
      auto: !!x.auto,
      receivedAt: x.receivedAt || nowISO()
    };
  }

  /** Eventi di punteggio (GAME SCORE) derivati dai record di un round. */
  function scoreEventsFor(records, profileId, roundInstanceId, options) {
    var profile = Scoring.getProfile(profileId);
    var createdAt = nowISO();
    return Scoring.scoreRound(records, profile, options).map(function (s) {
      return {
        eventId: uuid(),
        roundInstanceId: roundInstanceId,
        participantId: s.participantId,
        outcome: s.outcome,
        scoringOutcome: s.scoringOutcome || s.outcome,
        omissionNumber: s.omissionNumber == null ? null : s.omissionNumber,
        rank: s.rank,
        points: s.points,
        speedBonus: s.speedBonus || 0,
        profileId: profile.id,
        createdAt: createdAt
      };
    });
  }

  function totals(session) {
    return Scoring.totals(session && session.scoreEvents, session && session.adjustments);
  }

  /** Conta le omissioni grezze già registrate, per partecipante. I record voided non contano. */
  function countOmissions(records) {
    var out = {};
    (records || []).forEach(function (r) {
      if (!r || r.voided || !r.participantId) return;
      if (Scoring.normalizeOutcome(r.outcome) !== 'omitted') return;
      out[r.participantId] = (out[r.participantId] || 0) + 1;
    });
    return out;
  }

  /**
   * Omissioni già confermate nella sessione. Se excludeRoundId è valorizzato, quel round non conta:
   * serve quando si riapre/ricalcola un round esistente.
   */
  function committedOmissionCounts(session, excludeRoundId) {
    var s = session || {};
    var committed = {};
    (s.rounds || []).forEach(function (rd) {
      if (rd && rd.committed && rd.roundInstanceId !== excludeRoundId) committed[rd.roundInstanceId] = true;
    });
    return countOmissions((s.responses || []).filter(function (r) { return r && committed[r.roundInstanceId]; }));
  }

  /**
   * RC1 — rinumera le omissioni in ordine cronologico (apertura del round) su tutti i round confermati e aggiorna
   * SOLO gli eventi "omessa": numero, esito di punteggio e punti (le prime N gratuite, poi come un errore).
   * Corrette ed errate non vengono toccate. Serve dopo una riapertura, un annullamento o una conferma fuori ordine,
   * quando le omissioni "precedenti" di una squadra cambiano. Restituisce quanti eventi sono cambiati.
   */
  function renumberOmissions(session, freeOmissions) {
    if (!session) return 0;
    var free = freeOmissions == null ? Scoring.DEFAULT_FREE_OMISSIONS : Math.max(0, Math.floor(Number(freeOmissions) || 0));
    var key = function (r) { return String(r.openedAt || r.committedAt || ''); };
    var rounds = (session.rounds || []).map(function (r, i) { return { r: r, i: i }; })
      .filter(function (x) { return x.r && x.r.committed; })
      .sort(function (a, b) { var ka = key(a.r), kb = key(b.r); return ka < kb ? -1 : ka > kb ? 1 : a.i - b.i; });
    var byRound = {};
    (session.scoreEvents || []).forEach(function (e) { if (e && !e.voided) (byRound[e.roundInstanceId] = byRound[e.roundInstanceId] || []).push(e); });
    var count = {}, changed = 0;
    rounds.forEach(function (x) {
      (byRound[x.r.roundInstanceId] || []).forEach(function (e) {
        var o;
        try { o = Scoring.normalizeOutcome(e.outcome); } catch (err) { return; }
        if (o !== 'omitted') return;
        var n = (count[e.participantId] || 0) + 1;
        count[e.participantId] = n;
        var scoringOutcome = n > free ? 'wrong' : 'omitted';
        var points = n > free ? Scoring.pointsFor(Scoring.getProfile(e.profileId || x.r.profileId), 'wrong', 1) : 0;
        if (e.omissionNumber !== n || e.scoringOutcome !== scoringOutcome || e.points !== points) {
          e.omissionNumber = n; e.scoringOutcome = scoringOutcome; e.points = points; changed++;
        }
      });
    });
    return changed;
  }

  /** Ricalcola tutto lo storico con un altro profilo (dimostra che i dati grezzi bastano). */
  function recomputeTotals(session, profileId) {
    var byRound = {};
    (session.responses || []).forEach(function (r) {
      if (r.voided) return;
      (byRound[r.roundInstanceId] = byRound[r.roundInstanceId] || []).push(r);
    });
    var events = [];
    var prior = {};
    (session.rounds || []).forEach(function (rd) {
      if (!rd || !rd.committed || !byRound[rd.roundInstanceId]) return;
      var rows = Scoring.scoreRound(byRound[rd.roundInstanceId], profileId, { priorOmissions: prior, freeOmissions: Scoring.DEFAULT_FREE_OMISSIONS, availableMs: rd.availableMs > 0 ? rd.availableMs : undefined }); // RC2-A.1
      events = events.concat(rows);
      byRound[rd.roundInstanceId].forEach(function (r) {
        if (Scoring.normalizeOutcome(r.outcome) === 'omitted') prior[r.participantId] = (prior[r.participantId] || 0) + 1;
      });
    });
    return Scoring.totals(events, session.adjustments);
  }

  function addLog(session, entry) {
    if (!session) return null;
    var e = {
      timestamp: nowISO(),
      sessionId: session.sessionId,
      roundInstanceId: entry.roundInstanceId || null,
      participantId: entry.participantId || null,
      deviceId: entry.deviceId || null,
      event: entry.event || 'event',
      answer: entry.answer == null ? null : entry.answer,
      accepted: typeof entry.accepted === 'boolean' ? entry.accepted : null,
      reason: entry.reason || null,
      latency: typeof entry.latency === 'number' ? entry.latency : null,
      scoreDelta: typeof entry.scoreDelta === 'number' ? entry.scoreDelta : null,
      source: entry.source || 'host'
    };
    session.log = session.log || [];
    session.log.push(e);
    if (session.log.length > LOG_LIMIT) session.log.splice(0, session.log.length - LOG_LIMIT);
    return e;
  }

  /** Controllo minimo di uno snapshot salvato prima di proporre il ripristino. */
  function validateSnapshot(snap) {
    if (!snap || typeof snap !== 'object') throw new Error('Salvataggio vuoto');
    if (snap.format !== 'secchione-snapshot') throw new Error('Formato salvataggio sconosciuto');
    var s = snap.session;
    if (!s || s.format !== FORMAT || !s.sessionId) throw new Error('Sessione mancante');
    if (!Array.isArray(s.participants) || !Array.isArray(s.responses) || !Array.isArray(s.scoreEvents)) throw new Error('Sessione incompleta');
    return snap;
  }

  return {
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    MODES: MODES,
    PARTICIPANT_TYPES: PARTICIPANT_TYPES,
    INPUT_MODES: INPUT_MODES,
    uuid: uuid,
    randomHex: randomHex,
    nowISO: nowISO,
    schoolYearFor: schoolYearFor,
    cleanText: cleanText,
    makeParticipant: makeParticipant,
    createSession: createSession,
    outcomeForAnswer: outcomeForAnswer,
    makeResponse: makeResponse,
    scoreEventsFor: scoreEventsFor,
    countOmissions: countOmissions,
    committedOmissionCounts: committedOmissionCounts,
    renumberOmissions: renumberOmissions,
    totals: totals,
    recomputeTotals: recomputeTotals,
    addLog: addLog,
    validateSnapshot: validateSnapshot
  };
});
