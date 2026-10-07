/*
 * Il Secchione · timer.js
 * Modello puro del countdown. Il tempo "now" è sempre passato dall'esterno (ms),
 * così lo stesso codice gira nel browser (performance.now) e nei test (orologio finto).
 * La durata deriva SEMPRE dal dato della domanda/manche (campo `seconds`).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneTimer = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_SECONDS = 5;
  var MAX_SECONDS = 600;
  /*
   * RC2-A — UNICO punto dei tempi standard (feedback dai pilot in classe). Valgono quando il contenuto NON indica "seconds";
   * un valore scritto nel singolo contenuto ha sempre la precedenza.
   *  - domande A/B/C/D (anche con immagine) e vero/falso: 15 s
   *  - riconoscimento di immagini (Photopuzzle, Abbinamenti) e risposte scritte (Indovina, Staffetta, Parola Segreta): 45 s
   */
  var DEFAULTS = { question: 15, truefalse: 15, photopuzzle: 45, abbinamenti: 45, indovina: 45, chain: 45, ghigliottina: 45 };
  var DEFAULT_SECONDS = DEFAULTS.question;

  /** Tempo standard di un tipo di contenuto ('question' o il tipo di gioco). */
  function defaultSeconds(kind) {
    return Object.prototype.hasOwnProperty.call(DEFAULTS, kind) ? DEFAULTS[kind] : DEFAULT_SECONDS;
  }

  /**
   * Durata in secondi presa dal dato (domanda, manche). Se manca vale il tempo standard:
   * secondsFor(item, 'photopuzzle') usa lo standard del tipo; secondsFor(item, 20) usa 20; senza secondo argomento: domanda (15).
   */
  function secondsFor(item, kindOrFallback) {
    var fb = typeof kindOrFallback === 'string' ? defaultSeconds(kindOrFallback) : (Number(kindOrFallback) || DEFAULT_SECONDS);
    var raw = item && typeof item === 'object' ? Number(item.seconds) : Number(item);
    var s = isFinite(raw) && raw > 0 ? raw : fb;
    return Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Math.round(s)));
  }

  /** Crea (o reimposta) un timer fermo. Stessa forma usata da app.js: {running,duration,remaining,startedAt,startRemaining,lastSecond}. */
  function create(durationSec) {
    var d = Math.max(0, Number(durationSec) || DEFAULT_SECONDS);
    return { running: false, duration: d, remaining: d, startedAt: 0, startRemaining: d, lastSecond: null };
  }

  /** Secondi rimanenti all'istante `now` (ms). */
  function remaining(t, now) {
    if (!t) return 0;
    if (!t.running) return Math.max(0, Number(t.remaining) || 0);
    var elapsed = (Number(now) - Number(t.startedAt)) / 1000;
    return Math.max(0, (Number(t.startRemaining) || 0) - elapsed);
  }

  /** Secondi trascorsi dall'inizio della manche (esclude le pause, include i secondi aggiunti nella durata). */
  function elapsed(t, now) {
    return Math.max(0, (Number(t.duration) || 0) - remaining(t, now));
  }

  function start(t, now) {
    if (t.running || remaining(t, now) <= 0) return t;
    t.running = true;
    t.startedAt = Number(now);
    t.startRemaining = Number(t.remaining) || 0;
    t.lastSecond = null;
    return t;
  }

  /** Aggiorna `remaining` al valore corrente senza fermare. */
  function sync(t, now) {
    t.remaining = remaining(t, now);
    return t;
  }

  function pause(t, now) {
    if (!t.running) return t;
    t.remaining = remaining(t, now);
    t.running = false;
    return t;
  }

  function resume(t, now) { return start(t, now); }

  function toggle(t, now) { return t.running ? pause(t, now) : start(t, now); }

  /** Aggiunge (o toglie, se negativo) secondi. La durata cresce insieme, così la barra resta coerente. */
  function addTime(t, seconds, now) {
    var s = Number(seconds) || 0;
    if (!s) return t;
    if (t.running) {
      var r = remaining(t, now);
      var next = Math.max(0, r + s);
      t.startedAt = Number(now);
      t.startRemaining = next;
      t.remaining = next;
    } else {
      t.remaining = Math.max(0, (Number(t.remaining) || 0) + s);
    }
    t.duration = Math.max(Number(t.duration) + s, t.remaining);
    return t;
  }

  function finished(t, now) { return remaining(t, now) <= 0; }

  /** Percentuale residua 0..100 per barre e anelli. */
  function percent(t, now) {
    var d = Number(t.duration) || 0;
    if (!d) return 0;
    return Math.max(0, Math.min(100, remaining(t, now) / d * 100));
  }

  /** Copia serializzabile (per autosave): il timer viene sempre salvato come FERMO. */
  function snapshot(t, now) {
    return { running: false, wasRunning: !!t.running, duration: Number(t.duration) || 0, remaining: remaining(t, now), startedAt: 0, startRemaining: remaining(t, now), lastSecond: null };
  }

  return {
    MIN_SECONDS: MIN_SECONDS,
    DEFAULTS: DEFAULTS,
    defaultSeconds: defaultSeconds,
    MAX_SECONDS: MAX_SECONDS,
    DEFAULT_SECONDS: DEFAULT_SECONDS,
    secondsFor: secondsFor,
    create: create,
    remaining: remaining,
    elapsed: elapsed,
    start: start,
    sync: sync,
    pause: pause,
    resume: resume,
    toggle: toggle,
    addTime: addTime,
    finished: finished,
    percent: percent,
    snapshot: snapshot
  };
});
