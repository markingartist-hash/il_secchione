/*
 * Il Secchione · stage-fit.js (RC2-A, feedback dai pilot in classe; RC2-A.2: anche i giochi)
 * Leggibilità dal fondo dell'aula: domanda e risposte usano il testo PIÙ GRANDE che entra nello spazio disponibile,
 * tra un massimo e un minimo leggibile espressi in percentuale dell'altezza dello schermo (valgono per ogni proiettore).
 * Sotto il minimo non si scende: un testo troppo lungo resta al minimo e il palco lo segnala con la classe "tooLong".
 * Usato da regia (anteprima), finestra del proiettore (aperta dalla regia) e /show. Nessuna dipendenza.
 */
(function (root) {
  'use strict';

  /* Percentuali dell'altezza del palco (H). Domanda e opzioni hanno limiti propri: una domanda lunga non schiaccia le risposte. */
  var RANGE = { qMax: 0.062, qMin: 0.042, oMax: 0.048, oMin: 0.034 };
  /* RC2-A.2: giochi (Indovina, Abbinamenti, Ghigliottina, Staffetta). --g-fs è la base: ogni elemento ne usa un multiplo (css/show.css). */
  var GAME = { gMax: 0.066, gMin: 0.034 };
  /* RC2-A.3: riquadri dei layout dedicati (.gameScreen) e di quelli RC2-A.2 (.publicBoard). Nessuno deve traboccare. */
  var GAME_BOXES = '.arcadeContent, .candidateGrid, .candidate, .cluePanel, .indClue, .termList, .term, .matchAnswer, .ghWrap, .ghWord, .ghText, .ghClues, .ghFinal, .chainWrap, .chainPath, .chainWord';
  /* Tendina: scala --cs (0,62–1) dei testi, ridotta solo se qualcosa non entra (4:3, istruzioni lunghe). */
  var CURTAIN = { min: 0.62, max: 1 };
  var STEPS = 8;

  /** Dimensioni in px per un palco alto H, alla scala s (1 = massimo, 0 = minimo leggibile). */
  function sizes(H, s) {
    var k = Math.max(0, Math.min(1, Number(s)));
    return {
      q: Math.round((RANGE.qMin + (RANGE.qMax - RANGE.qMin) * k) * H * 10) / 10,
      o: Math.round((RANGE.oMin + (RANGE.oMax - RANGE.oMin) * k) * H * 10) / 10
    };
  }

  function overflows(el) {
    return !!el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  }

  /** Adatta un blocco .questionShow già nel DOM. Restituisce la scala scelta (0–1) oppure null se non c'è nulla da adattare. */
  function fitQuestion(show) {
    var stage = show.closest ? (show.closest('.stage') || show) : show;
    var H = stage.clientHeight;
    var qa = show.querySelector('.qQA');
    if (!H || !qa) return null;
    var boxes = Array.prototype.slice.call(show.querySelectorAll('.option, .readyCue'));
    function apply(s) {
      var z = sizes(H, s);
      show.style.setProperty('--q-fs', z.q + 'px');
      show.style.setProperty('--o-fs', z.o + 'px');
    }
    function fits() {
      if (overflows(qa)) return false;
      for (var i = 0; i < boxes.length; i++) if (overflows(boxes[i])) return false;
      return true;
    }
    // ricerca binaria della scala più grande che entra
    var lo = 0, hi = 1, best = -1;
    apply(1);
    if (fits()) best = 1;
    else {
      for (var i = 0; i < STEPS; i++) {
        var mid = (lo + hi) / 2;
        apply(mid);
        if (fits()) { best = mid; lo = mid; } else hi = mid;
      }
      if (best < 0) { apply(0); if (fits()) best = 0; }
      else apply(best);
    }
    show.classList.toggle('tooLong', best < 0);
    if (best < 0) apply(0);
    return best < 0 ? 0 : best;
  }

  /** Ricerca binaria della scala più grande (0–1) per cui nessun riquadro trabocca; apply(s) imposta le dimensioni. */
  function search(apply, fits) {
    var lo = 0, hi = 1, best = -1;
    apply(1);
    if (fits()) return 1;
    for (var i = 0; i < STEPS; i++) {
      var mid = (lo + hi) / 2;
      apply(mid);
      if (fits()) { best = mid; lo = mid; } else hi = mid;
    }
    if (best < 0) { apply(0); return fits() ? 0 : -1; }
    apply(best);
    return best;
  }

  /** RC2-A.2/A.3 — adatta un gioco (.gameScreen, prima .publicBoard): il testo più grande tra GAME.gMin e GAME.gMax che entra senza tagli. */
  function fitGame(board) {
    var stage = board.closest ? (board.closest('.stage') || board) : board;
    var H = stage.clientHeight;
    var content = board.querySelector('.arcadeContent');
    if (!H || !content) return null;
    var boxes = Array.prototype.slice.call(board.querySelectorAll(GAME_BOXES));
    function apply(s) {
      var k = Math.max(0, Math.min(1, s));
      board.style.setProperty('--g-fs', Math.round((GAME.gMin + (GAME.gMax - GAME.gMin) * k) * H * 10) / 10 + 'px');
    }
    function fits() {
      for (var i = 0; i < boxes.length; i++) if (overflows(boxes[i])) return false;
      return true;
    }
    var best = search(apply, fits);
    board.classList.toggle('tooLong', best < 0);
    if (best < 0) apply(0);
    return best < 0 ? 0 : best;
  }

  /** RC2-A.3 — tendina del gioco: testi al massimo, ridotti solo quanto basta perché nulla trabocchi. */
  function fitCurtain(el) {
    var main = el.querySelector('.gcMain');
    if (!main) return null;
    /* in altezza conta il blocco centrale; titolo e punteggi solo in larghezza (le lettere grandi sporgono di qualche px dalla riga) */
    var wide = Array.prototype.slice.call(el.querySelectorAll('.gcTitle, .gcPts'));
    function apply(s) { el.style.setProperty('--cs', String(Math.round((CURTAIN.min + (CURTAIN.max - CURTAIN.min) * Math.max(0, Math.min(1, s))) * 1000) / 1000)); }
    function fits() {
      if (overflows(main)) return false;
      for (var i = 0; i < wide.length; i++) if (wide[i].scrollWidth > wide[i].clientWidth + 1) return false;
      return true;
    }
    var best = search(apply, fits);
    if (best < 0) apply(0);
    return best < 0 ? 0 : best;
  }

  /** Adatta tutte le domande presenti in un documento e, nella finestra del proiettore, riempie anche il 4:3. */
  function fit(doc) {
    var d = doc || root.document;
    if (!d || !d.querySelectorAll) return;
    var body = d.body;
    if (body && body.classList && body.classList.contains('publicBody')) {
      var st = d.getElementById('publicStage');
      /* Domanda, risultato del round e fine contenuti occupano tutta la finestra (anche 4:3), le altre schermate restano 16:9. */
      /* RC2-A.2: anche giochi e intro dei giochi riempiono la finestra (4:3 compreso). */
      body.classList.toggle('fillStage', !!(st && st.querySelector('.questionShow, .roundSummary, .finishedScene, .gameIntro, .publicBoard, .photoShow, .gameScreen, .gameCurtain')));
    }
    Array.prototype.forEach.call(d.querySelectorAll('.questionShow'), function (show) { fitQuestion(show); });
    Array.prototype.forEach.call(d.querySelectorAll('.publicBoard, .gameScreen'), function (board) { fitGame(board); });
    Array.prototype.forEach.call(d.querySelectorAll('.gameCurtain'), function (el) { fitCurtain(el); });
  }

  /** Riadatta al ridimensionamento della finestra (resize, schermo intero, F11), una volta per fotogramma. */
  function watch(win) {
    var w = win || root;
    if (!w || w.__secchioneFitWatch) return;
    w.__secchioneFitWatch = true;
    var pending = false;
    function again() { if (pending) return; pending = true; var run = function () { pending = false; fit(w.document); }; if (w.requestAnimationFrame) w.requestAnimationFrame(run); else setTimeout(run, 16); }
    w.addEventListener('resize', again);
    /* Il cambio di dimensione del palco (F11, proiettore diverso, 4:3) si osserva anche senza evento resize. */
    try { if (w.ResizeObserver) new w.ResizeObserver(again).observe(w.document.body); } catch (e) { /* non supportato */ }
    try { w.document.addEventListener('fullscreenchange', again); } catch (e) { /* non supportato */ }
  }

  var api = { RANGE: RANGE, GAME: GAME, sizes: sizes, fit: fit, fitQuestion: fitQuestion, fitGame: fitGame, fitCurtain: fitCurtain, watch: watch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneStageFit = api;
})(typeof self !== 'undefined' ? self : this);
