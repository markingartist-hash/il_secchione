/*
 * Il Secchione · palco remoto (/show). Riceve dalla regia, tramite il server, l'HTML del palco
 * e lo stato del timer; il countdown è animato localmente. Sola lettura: non invia comandi.
 * Il doppio schermo classico (pulsante APRI nella regia) resta il metodo consigliato sullo stesso PC.
 */
(function () {
  'use strict';
  var stage = document.getElementById('publicStage');
  var statusEl = document.getElementById('showStatus');
  // stesse pose della regia (js/app.js MOOD_SRC); le 4 immagini vengono precaricate per non sfarfallare al cambio
  var MOOD_SRC = { welcome: 'assets/mascot/mascot_present.webp', reveal: 'assets/mascot/mascot_present.webp', think: 'assets/mascot/mascot_think.webp', celebrate: 'assets/mascot/mascot_celebrate.webp', panic: 'assets/mascot/mascot_panic.webp' };
  var MASCOT_PRELOAD = [];
  Object.keys(MOOD_SRC).forEach(function (k) { var i = new Image(); i.src = MOOD_SRC[k]; MASCOT_PRELOAD.push(i); });
  // animazione d'ingresso/one-shot solo per un evento nuovo (posa o data-cue diversi), mai a ogni aggiornamento del palco;
  // se l'HTML arriva entro 200 ms dall'inizio dell'evento, l'animazione appena partita riparte sul nuovo elemento
  var shownMood = null;
  var shownCue = null;
  var shownAt = 0;
  var ws = null;
  var retry = 0;
  var lastHtml = '';
  var timer = null;
  var raf = null;

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  function connect() {
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { later(); return; }
    ws.onopen = function () { retry = 0; ws.send(JSON.stringify({ type: 'hello', role: 'show' })); setStatus('Collegato. In attesa della regia…'); };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'stage') applyStage(m);
      else if (m.type === 'timer') { timer = m.timer || null; if (timer) timer.at = performance.now(); paintTimer(); }
      else if (m.type === 'transition') transition(m.data || {});
    };
    ws.onclose = function () { setStatus('Connessione persa: riprovo…'); later(); };
    ws.onerror = function () { /* segue onclose */ };
  }
  function later() { setTimeout(connect, Math.min(4000, 500 * Math.pow(1.5, retry++))); }

  function applyStage(m) {
    var meta = m.meta || {};
    var root = document.documentElement.style;
    if (meta.accent) root.setProperty('--accent', meta.accent);
    if (meta.accent2) root.setProperty('--accent2', meta.accent2);
    if (meta.themeBg) root.setProperty('--theme-bg', 'url("' + meta.themeBg + '")');
    if (meta.title) { var sub = document.getElementById('transitionSub'); if (sub) sub.textContent = meta.title; }
    if (m.html !== lastHtml) {
      lastHtml = m.html;
      stage.innerHTML = m.html;
      if (window.SecchioneStageFit) { window.SecchioneStageFit.fit(document); window.SecchioneStageFit.watch(window); } // RC2-A: leggibilità e 4:3
      each('.mascotStage', function (el) {
        var mood = el.getAttribute('data-mood');
        var cue = el.getAttribute('data-cue');
        var isNew = mood !== shownMood || (shownCue !== null && cue !== shownCue);
        var now = Date.now();
        if (isNew) shownAt = now;
        el.classList.toggle('mascotPlay', isNew || now - shownAt < 200);
        shownMood = mood;
        shownCue = cue;
      });
    }
    paintTimer();
  }

  function remaining() {
    if (!timer) return 0;
    if (!timer.running) return Math.max(0, timer.remaining);
    return Math.max(0, timer.remaining - (performance.now() - timer.at) / 1000);
  }

  function paintTimer() {
    cancelAnimationFrame(raf);
    if (!timer) return;
    var rem = remaining();
    var pct = timer.duration ? Math.max(0, Math.min(100, rem / timer.duration * 100)) : 0;
    var sec = Math.ceil(rem);
    var mm = Math.floor(sec / 60);
    var txt = (mm < 10 ? '0' : '') + mm + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
    var status = timer.running ? (sec <= 5 ? 'ULTIMI SECONDI' : 'IN CORSO') : timer.status;
    each('.liveTimer', function (e) { e.textContent = txt; });
    each('.liveSeconds', function (e) { e.textContent = sec; });
    each('.liveProgress', function (e) { e.style.width = pct + '%'; });
    each('.timerWords strong', function (e) { e.textContent = status; });
    each('.publicTimerRing', function (e) { e.style.setProperty('--pct', pct); });
    each('.publicTimerHud', function (e) {
      e.classList.toggle('urgent', sec <= 10 && sec > 5 && timer.running);
      e.classList.toggle('critical', sec <= 5 && timer.running);
    });
    document.documentElement.classList.toggle('motionOff', timer.motion === false);
    each('.mascotStage', function (el) {
      if (timer.mood && el.getAttribute('data-mood') !== timer.mood) {
        // nuova posa: l'animazione (anche one-shot) riparte da capo
        el.className = 'mascotStage';
        void el.offsetWidth;
        el.className = 'mascotStage mascotPlay mood-' + timer.mood;
        el.setAttribute('data-mood', timer.mood);
        shownMood = timer.mood;
        shownCue = null;
        shownAt = Date.now();
        var im = el.querySelector('img');
        if (im && MOOD_SRC[timer.mood] && im.getAttribute('src') !== MOOD_SRC[timer.mood]) {
          im.src = MOOD_SRC[timer.mood];
          if (im.animate && timer.motion !== false) im.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
        }
      }
    });
    if (timer.running && rem > 0) raf = requestAnimationFrame(paintTimer);
  }

  function each(sel, fn) { Array.prototype.forEach.call(stage.querySelectorAll(sel), fn); }

  function transition(d) {
    var tr = document.getElementById('transition');
    if (!tr) return;
    var set = function (id, v) { var e = document.getElementById(id); if (e && v != null) e.textContent = v; };
    set('transitionTitle', d.title);
    set('transitionSub', d.sub);
    set('transitionNumber', d.number);
    set('transitionKicker', d.kicker);
    var tm = document.getElementById('transitionMascot');
    if (tm && d.mascot) tm.src = d.mascot;
    tr.classList.remove('active');
    void tr.offsetWidth;
    tr.classList.add('active');
    setTimeout(function () { tr.classList.remove('active'); }, 1380);
  }

  /* RC2-A: schermo intero solo con il pulsante esplicito (o il tasto F), mai con un clic qualsiasi. Riappare dopo ESC. */
  function fsActive() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function fsRequest() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    var fail = function () { var sm = fsGo && fsGo.querySelector('small'); if (sm) sm.textContent = 'Il browser non lo permette: premi F11'; };
    if (!req) fail();
    else if (!fsActive()) { try { var p = req.call(el); if (p && p.catch) p.catch(fail); } catch (e) { fail(); } }
    setTimeout(function () { if (!fsActive()) fail(); }, 1500); // il browser non ha risposto: si suggerisce F11
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) { /* ignore */ }
  }
  function fsUpdate() { document.body.classList.toggle('isFullscreen', fsActive()); if (fsActive()) document.body.classList.remove('fsHidden'); }
  var fsGo = document.getElementById('fsGo'), fsHide = document.getElementById('fsHide');
  if (fsGo) fsGo.addEventListener('click', fsRequest);
  if (fsHide) fsHide.addEventListener('click', function () { document.body.classList.add('fsHidden'); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) fsRequest(); });
  document.addEventListener('fullscreenchange', fsUpdate);
  document.addEventListener('webkitfullscreenchange', fsUpdate);
  fsUpdate();
  if (window.SecchioneStageFit) window.SecchioneStageFit.watch(window);

  connect();
})();
