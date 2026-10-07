/*
 * Il Secchione · roundControl.js — controllo della regia durante la lezione (v3.6.0; regia "one screen" v3.7.0).
 * Funzioni pure sullo stato della regia (stessi campi di js/app.js): modifica della domanda corrente senza perdere
 * il contesto, round aperto immutabile, annulla e ripeti domanda, stato delle pulsantiere, progresso, ricerca nell'Archivio.
 * Nessun DOM, nessuna rete, nessun punteggio: browser (window.SecchioneRoundControl) e Node (test).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneRoundControl = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LETTERS = ['A', 'B', 'C', 'D'];
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function correctIndex(q) { return LETTERS.indexOf(String((q && q.correct) || 'A').toUpperCase()); }

  /** Stessa disposizione delle alternative (stesso mescolamento) con i testi e la risposta corretta della domanda aggiornata. */
  function rebuildRound(qRound, question) {
    var order = qRound && Array.isArray(qRound.order) && qRound.order.length === 4 ? qRound.order.slice()
      : qRound && Array.isArray(qRound.displayed) && qRound.displayed.length === 4 ? qRound.displayed.map(function (o) { return o.sourceIndex; })
      : [0, 1, 2, 3];
    var opts = (question && question.options) || [];
    return {
      order: order,
      displayed: order.map(function (src, i) { return { letter: LETTERS[i], text: opts[src], sourceIndex: src }; }),
      correctDisplayLetter: LETTERS[order.indexOf(correctIndex(question))]
    };
  }

  /** Round aperto (timer partito, risposte possibili) o già concluso: la domanda giocata non si tocca. */
  function isLocked(state) {
    return state.screen === 'question' && (state.phase !== 'preview' || !!state.questionScored);
  }
  function roundOpen(state) {
    return state.screen === 'question' && !!state.round && !state.questionScored && (state.phase === 'running' || state.phase === 'scoring');
  }

  function clearEntries(state) {
    state.pending = {}; state.pendingOrder = []; state.correctOrder = []; state.pendingHistory = []; state.entryMeta = {}; state.entrySeq = 0; state.cursor = 0;
  }

  /** Applica le modifiche rimandate (salvate durante un round aperto) a tutte le domande o a una sola. */
  function applyDeferred(state, idx) {
    var d = state.deferredEdits || {};
    var applied = [];
    (state.bank || []).forEach(function (q, i) {
      if (idx != null && i !== idx) return;
      if (q && d[q.id]) { state.bank[i] = d[q.id]; delete d[q.id]; applied.push(i); }
    });
    state.deferredEdits = d;
    if (state.screen === 'question' && applied.indexOf(state.qIndex) >= 0 && state.phase === 'preview' && !state.questionScored) {
      state.qRound = rebuildRound(state.qRound, state.bank[state.qIndex]);
    }
    return applied;
  }

  /** Torna all'anteprima della stessa domanda: risposte del round eliminate, nessun punto, squadre e punteggi intatti. */
  function toPreview(state) {
    var cancelled = state.round ? state.round.roundInstanceId : null;
    clearEntries(state);
    state.round = null;
    state.phase = 'preview';
    state.answerVisible = false;
    state.questionScored = false;
    applyDeferred(state, state.qIndex);
    state.qRound = rebuildRound(state.qRound, state.bank[state.qIndex]);
    return cancelled;
  }

  /**
   * Salvataggio di una domanda modificata (già normalizzata).
   * mode: 'auto' (anteprima o altra domanda: applicata subito), 'later' (round aperto: resta la versione giocata),
   * 'restart' (round aperto: annullato e domanda ricostruita in anteprima).
   * Restituisce { applied, deferred, restarted, cancelledRoundId }.
   */
  function applyEdit(state, idx, question, mode) {
    var current = state.screen === 'question' && idx === state.qIndex;
    if (!current || !isLocked(state)) {
      state.bank[idx] = question;
      if (state.deferredEdits) delete state.deferredEdits[question.id];
      if (current) state.qRound = rebuildRound(state.qRound, question);
      return { applied: true, deferred: false, restarted: false, cancelledRoundId: null };
    }
    if (mode === 'restart' && roundOpen(state)) {
      state.bank[idx] = question;
      if (state.deferredEdits) delete state.deferredEdits[question.id];
      var rid = toPreview(state);
      return { applied: true, deferred: false, restarted: true, cancelledRoundId: rid };
    }
    state.deferredEdits = state.deferredEdits || {};
    state.deferredEdits[question.id] = question;
    return { applied: false, deferred: true, restarted: false, cancelledRoundId: null };
  }

  /** ANNULLA DOMANDA: solo per un round aperto e non ancora confermato. */
  function cancelRound(state) {
    if (!roundOpen(state)) return { ok: false, reason: 'nessun round da annullare' };
    return { ok: true, cancelledRoundId: toPreview(state) };
  }

  /**
   * RIPETI DOMANDA: dopo la fine del tempo/soluzione. Se i punti erano confermati restano (nuovo round marcato come ripetizione);
   * se non lo erano, il round viene scartato come con ANNULLA.
   */
  function prepareRepeat(state) {
    if (state.screen !== 'question' || !(state.questionScored || (state.phase === 'scoring' && state.round))) return { ok: false, reason: 'la domanda non è ancora stata giocata' };
    var q = state.bank[state.qIndex];
    var saved = state.completedRounds && q ? state.completedRounds[q.id] : null;
    var previous = state.questionScored ? (saved && saved.roundInstanceId) || null : null;
    var cancelled = toPreview(state);
    state.repeatOf = previous;
    return { ok: true, repeatOf: previous, cancelledRoundId: previous ? null : cancelled, scoresKept: !!previous };
  }

  /** Stato delle pulsantiere per le squadre che ne hanno una assegnata. teamDevices: {participantId: {connected, lastSeen}}. */
  function deviceSummary(teams, teamDevices, nowMs) {
    var devs = teamDevices || {};
    var now = nowMs == null ? Date.now() : nowMs;
    var bound = (teams || []).filter(function (t) { return devs[t.id]; });
    var off = bound.filter(function (t) { return !devs[t.id].connected; }).map(function (t) {
      var seen = Date.parse(devs[t.id].lastSeen || '');
      return { id: t.id, name: t.name, lastSeen: devs[t.id].lastSeen || null, agoSec: isNaN(seen) ? null : Math.max(0, Math.round((now - seen) / 1000)) };
    });
    return { total: bound.length, connected: bound.length - off.length, disconnected: off, manual: (teams || []).length - bound.length };
  }

  /** Dove si trova il docente: domanda corrente, totale, giocate (punti confermati) e da giocare. */
  function progress(bank, completedRounds, qIndex) {
    var done = completedRounds || {};
    var played = (bank || []).filter(function (q) { return q && done[q.id]; }).length;
    var total = (bank || []).length;
    return { current: total ? Math.min(total, (qIndex || 0) + 1) : 0, total: total, played: played, toPlay: total - played };
  }

  function fold(s) {
    var x = String(s == null ? '' : s).toLowerCase();
    if (x.normalize) x = x.normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '');
    return x.replace(/\s+/g, ' ').trim();
  }

  /** Ricerca client-side nell'Archivio: testo, alternative, spiegazione, argomento, categoria, tag; filtri semplici. Restituisce gli indici. */
  function searchBank(bank, query) {
    var o = query || {};
    var words = fold(o.text).split(' ').filter(Boolean);
    var topic = o.topic ? fold(o.topic) : '';
    var diff = o.difficulty != null && o.difficulty !== '' ? Number(o.difficulty) : null;
    var type = o.type || '';
    var out = [];
    (bank || []).forEach(function (q, i) {
      if (!q) return;
      if (topic && fold(q.topic || q.category) !== topic) return;
      if (diff != null && Number(q.difficulty || 1) !== diff) return;
      if (type && (q.type || 'mcq') !== type) return;
      if (words.length) {
        var hay = fold([q.question, (q.options || []).join(' '), q.explanation, q.topic, q.category, (Array.isArray(q.tags) ? q.tags : []).join(' ')].join(' '));
        if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return;
      }
      out.push(i);
    });
    return out;
  }

  /** Valori disponibili per i filtri (solo quelli presenti nei dati). */
  function bankFacets(bank) {
    var topics = {};
    var diffs = {};
    var types = {};
    (bank || []).forEach(function (q) {
      if (!q) return;
      var t = q.topic || q.category;
      if (t) topics[t] = true;
      diffs[Number(q.difficulty || 1)] = true;
      types[q.type || 'mcq'] = true;
    });
    return { topics: Object.keys(topics).sort(function (a, b) { return a.localeCompare(b, 'it'); }), difficulties: Object.keys(diffs).map(Number).sort(), types: Object.keys(types).sort() };
  }

  /**
   * Risposte alternative accettate: niente vuoti, niente duplicati dopo la normalizzazione dell'answerMatcher,
   * niente doppioni della risposta principale. normalize = SecchioneAnswerMatcher.normalize.
   */
  function cleanAccepted(main, list, normalize) {
    var norm = typeof normalize === 'function' ? normalize : function (s) { return fold(s); };
    var seen = {};
    var m = norm(main == null ? '' : main);
    if (m) seen[m] = true;
    return (Array.isArray(list) ? list : []).map(function (v) { return String(v == null ? '' : v).trim(); }).filter(function (v) {
      var k = norm(v);
      if (!v || !k || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  /*
   * Regia "one screen" (v3.7.0): quali comandi mostrare ORA. Un'unica azione principale (la più probabile)
   * e poche azioni secondarie, solo quelle sensate nella fase corrente. Nessuna logica nuova: ogni `act`
   * corrisponde a una funzione già esistente della regia; `id` conserva l'id storico del pulsante.
   * c = { screen, phase, timerRunning, answerVisible, questionScored, canUndo, teams, isLast,
   *       plan: null | { finished, nextTitle, position }, arcade: null | { type, name, played, started, final, pairSelected,
   *       votesA, votesB, solutionShown, scoreCommitted, chainHasNext, canAid } }
   */
  var GAME_IDS = {
    photopuzzle: { start: 'startPhotoBtn', reveal: 'revealPuzzleBtn', revealLabel: '● RIVELA TUTTO', aids: [['piece', '− 1 PEZZO', 'removePieceBtn']] },
    abbinamenti: { start: 'startMatchBtn', reveal: 'revealMatchAllBtn', revealLabel: '● RIVELA TUTTI', aids: [['matchOne', 'RIVELA 1', 'revealMatchOneBtn']] },
    indovina: { start: 'startIndovinaBtn', reveal: 'revealIndovinaBtn', revealLabel: '● RIVELA SOLUZIONE', aids: [['clue', '+ INDIZIO', 'nextClueBtn'], ['eliminate', 'ELIMINA 2', 'eliminateBtn']] },
    ghigliottina: { start: 'startGhBtn', reveal: 'revealGhFinalBtn', revealLabel: '● RIVELA PAROLA FINALE', aids: [] },
    chain: { start: 'startChainBtn', reveal: 'chainSolveBtn', revealLabel: '● SOLUZIONE', aids: [['letter', '+ LETTERA', 'chainRevealBtn']] }
  };
  /* Articolo davanti alla posizione: "IL 5° POSTO", "L'8° POSTO", "L'11° POSTO" (si legge otto, undici, ottanta…). */
  function elides(n) { return n === 8 || n === 11 || (n >= 80 && n < 90) || (n >= 800 && n < 900); }
  function placeLabel(n) { return (elides(n) ? "L'" : 'IL ') + n + '° POSTO'; }
  function placeFrom(n) { return (elides(n) ? "dall'" : 'dal ') + n + '°'; }
  function cockpit(c) {
    c = c || {};
    var main = [], sec = [], stage = c.screen || 'home';
    function A(act, label, id, tone, extra) { var x = { act: act, label: label, id: id || null, tone: tone || 'ghost' }; if (extra) for (var k in extra) x[k] = extra[k]; return x; }
    var plan = c.plan && !c.plan.finished ? c.plan : null;
    /* RC1: prima di trasformare in Ø le risposte mancanti, il pulsante lo dice con i nomi */
    function missingSub(base) { return c.missing && c.missing.length ? '⚠ senza risposta: ' + c.missing.join(', ') + ' → Ø' : base; }
    function nextAction() {
      /* RC2-A: alla fine dei contenuti nessuna classifica automatica: si passa a una schermata neutra. */
      if (plan) return A('next', c.isLast ? 'FINE SCALETTA →' : 'AVANTI →', 'nextQBtn', 'primary', { sub: missingSub(c.isLast ? 'poi: fine dei contenuti' : (plan.nextTitle ? 'poi: ' + plan.nextTitle : '')) });
      return A('next', c.isLast ? 'FINE DEI CONTENUTI →' : 'PROSSIMA DOMANDA →', 'nextQBtn', 'primary', c.missing && c.missing.length ? { sub: missingSub('') } : null);
    }
    function edit() { return A('edit', '✎ MODIFICA', 'editQuestionBtn'); }
    function pause() { return A('pause', c.timerRunning ? '⏸ PAUSA' : '▶ RIPRENDI', c.screen === 'arcade' ? 'pauseArcadeBtn' : 'pauseQuestionBtn'); }
    var add10 = A('add10', '+10 s', 'addTimeBtn');
    var undo = A('undo', '↶ ANNULLA ULTIMA', 'undoLastBtn', 'ghost', { title: 'Annulla l’ultima risposta registrata' });

    if (c.screen === 'question') {
      if (c.questionScored) {
        stage = 'q-scored'; main.push(nextAction());
        sec.push(A('reopen', '↺ RIAPRI PUNTI', 'reopenBtn'), A('repeat', '↺ RIPETI', 'repeatQuestionBtn'), edit());
      } else if (c.phase === 'preview') {
        stage = 'q-preview'; main.push(A('launch', '▶ AVVIA DOMANDA', 'launchQuestionBtn', 'amber', { kbd: 'Spazio' }));
        sec.push(edit(), A('next', plan ? 'SALTA →' : 'SALTA DOMANDA →', 'skipBtn'));
      } else if (c.phase === 'running') {
        stage = 'q-running'; main.push(A('reveal', '● RIVELA', 'revealBtn', 'red', { kbd: 'R' }));
        sec.push(pause(), add10, A('closeTime', '■ CHIUDI TEMPO', 'endQuestionBtn'), A('cancel', '✕ ANNULLA ROUND', 'cancelQuestionBtn'), edit());
      } else if (!c.answerVisible) {
        stage = 'q-closed'; main.push(A('reveal', '● RIVELA', 'revealBtn', 'red', { kbd: 'R' }));
        if (c.canUndo) sec.push(undo);
        sec.push(A('repeat', '↺ RIPETI', 'repeatQuestionBtn'), A('cancel', '✕ ANNULLA ROUND', 'cancelQuestionBtn'), edit());
      } else {
        stage = 'q-revealed'; main.push(nextAction());
        if (c.canUndo) sec.push(undo);
        sec.push(A('repeat', '↺ RIPETI', 'repeatQuestionBtn'), A('cancel', '✕ ANNULLA ROUND', 'cancelQuestionBtn'), edit());
      }
    } else if (c.screen === 'arcade' && c.arcade) {
      var a = c.arcade, ids = GAME_IDS[a.type] || {};
      var restart = A('gameRestart', a.scoreCommitted ? '↺ RIPETI MANCHE' : '✕ ANNULLA ROUND', 'gameRestartBtn');
      var skip = A('next', plan ? 'SALTA →' : 'TORNA ALLE DOMANDE →', 'skipBtn');
      if (!a.played && !a.started) {
        stage = 'g-ready'; main.push(A('gameStart', '▶ AVVIA ' + String(a.name || a.type).toUpperCase(), ids.start, 'amber'));
        sec.push(skip);
      } else if (a.started && a.type === 'ghigliottina' && !a.final) {
        stage = 'g-vote';
        main.push(A('ghA', 'SCEGLI A' + (a.votesA != null ? ' · ' + a.votesA + (a.votesA === 1 ? ' voto' : ' voti') : ''), 'ghPickA', 'primary', { disabled: !!a.pairSelected }),
          A('ghB', 'SCEGLI B' + (a.votesB != null ? ' · ' + a.votesB + (a.votesB === 1 ? ' voto' : ' voti') : ''), 'ghPickB', 'primary', { disabled: !!a.pairSelected }));
        sec.push(restart);
      } else if (a.started) {
        stage = 'g-running'; main.push(A('gameReveal', ids.revealLabel || '● RIVELA', ids.reveal, 'red'));
        (ids.aids || []).forEach(function (x) { sec.push(A(x[0], x[1], x[2], 'ghost', { disabled: !!(a.canAid && a.canAid[x[0]] === false) })); });
        if (a.type !== 'ghigliottina' || a.final) sec.push(pause(), add10);
        sec.push(restart);
      } else if (!a.solutionShown) {
        stage = 'g-closed'; main.push(A('gameReveal', ids.revealLabel || '● RIVELA', ids.reveal, 'red'));
        if (c.canUndo) sec.push(undo);
        sec.push(restart);
      } else {
        stage = 'g-revealed';
        if (a.type === 'chain' && a.chainHasNext) { main.push(A('chainNext', 'PAROLA SUCCESSIVA →', 'chainNextBtn', 'primary')); sec.push(A('next', plan ? 'AVANTI →' : 'TORNA ALLE DOMANDE →', 'skipBtn')); }
        else main.push(nextAction());
        if (c.canUndo) sec.push(undo);
        sec.push(restart);
      }
    } else if (c.screen === 'leaderboard') {
      stage = 'leaderboard';
      var pod = c.podium;
      if (pod && pod.shown < pod.total) {
        /* v3.7.3: classifica finale condotta dalla regia, una posizione per AVANTI, il 1° per ultimo */
        stage = 'podium';
        var last = pod.total - pod.shown === 1;
        main.push(A('revealNext', last ? '★ RIVELA IL 1° POSTO' : '▶ RIVELA ' + placeLabel(pod.nextRank), 'revealNextBtn', last ? 'amber' : 'primary', { sub: pod.shown + ' di ' + pod.total + ' rivelati', kbd: '→' }));
        sec.push(A('revealAll', 'MOSTRA TUTTA LA CLASSIFICA', 'revealAllBtn'));
      } else if (c.boardFinal) { main.push(A('endGame', '✓ TERMINA PARTITA', 'endGameBtn', 'green', { sub: 'archivia la partita e torna alla Home' })); sec.push(A('report', '📄 REPORT DI CLASSE', 'mainReportBtn'), A('home', '⌂ HOME', 'mainHomeBtn')); }
      else main.push(A('next', 'TORNA AL GIOCO →', 'nextQBtn', 'primary', { sub: 'la classifica sparisce dal proiettore' }));
    } else if (c.screen === 'finished') {
      /* RC2-A: fine dei contenuti. La classifica parte solo da questo comando del docente. */
      stage = 'finished';
      main.push(A('leaderboard', '★ CLASSIFICA FINALE', 'finalBoardBtn', 'amber', { sub: 'dall’ultimo posto al vincitore' }));
      sec.push(A('report', '📄 REPORT DI CLASSE', 'mainReportBtn'), A('home', '⌂ HOME', 'mainHomeBtn'));
    } else {
      stage = 'home';
      if (plan) main.push(A('planResume', '▶ RIPRENDI SCALETTA', 'mainStartBtn', 'green', { sub: plan.position || '' }));
      else main.push(A('startQuiz', '▶ AVVIA QUIZ', 'mainStartBtn', 'green', { disabled: (c.teams || 0) < 2, sub: (c.teams || 0) < 2 ? 'servono almeno 2 squadre' : '' }));
      sec.push(A('openPlanner', '📋 SCALETTA', 'openPlannerBtn'));
    }
    /* durante il voto A/B della Parola Segreta i tablet votano, non rispondono: niente contatore risposte */
    var showAnswers = stage !== 'g-vote' && ((c.screen === 'question' && c.phase !== 'preview') || (c.screen === 'arcade' && !!c.arcade && (!!c.arcade.played || !!c.arcade.started)));
    return { stage: stage, main: main, secondary: sec, showAnswers: showAnswers };
  }
  /** Mini indicatore Ø: compare solo se a qualche squadra resta al massimo 1 astensione gratuita. */
  function freeOmissionAlert(teams, used, free) {
    var f = free == null ? 3 : free;
    return (teams || []).map(function (t) { var u = (used || {})[t.id] || 0; return { id: t.id, name: t.name, used: u, left: Math.max(0, f - u) }; })
      .filter(function (x) { return x.left <= 1; });
  }

  return {
    LETTERS: LETTERS, rebuildRound: rebuildRound, isLocked: isLocked, roundOpen: roundOpen, applyDeferred: applyDeferred,
    applyEdit: applyEdit, cancelRound: cancelRound, prepareRepeat: prepareRepeat, deviceSummary: deviceSummary,
    progress: progress, searchBank: searchBank, bankFacets: bankFacets, cleanAccepted: cleanAccepted, clone: clone,
    cockpit: cockpit, freeOmissionAlert: freeOmissionAlert, placeLabel: placeLabel, placeFrom: placeFrom, GAME_IDS: GAME_IDS
  };
});
