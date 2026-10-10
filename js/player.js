/*
 * Il Secchione · pulsantiera (tablet / Chromebook / smartphone).
 * Mostra SOLO l'interfaccia di risposta: la domanda resta sul grande schermo.
 * Il dispositivo non riceve mai la soluzione prima del reveal (il server non la invia).
 * Scritto in ES5 per funzionare anche su tablet vecchi.
 */
(function () {
  'use strict';
  var KEY = 'secchione-player-v35';
  var app = document.getElementById('app');
  var netBar = document.getElementById('netBar');
  var fsBtn = document.getElementById('fsBtn');

  var REASONS = {
    round_closed: 'Tempo scaduto: risposta non registrata.',
    round_paused: 'Tempo in pausa: riprova tra un attimo.',
    already_answered: 'La tua squadra ha già risposto.',
    stale_round: 'Questa domanda non è più attiva.',
    unknown_round: 'Questa domanda non è più attiva.',
    invalid_token: 'Questo tablet non è più associato: attendi il docente.',
    not_assigned: 'Questo tablet non è associato a una squadra.',
    invalid_answer: 'Risposta non valida.',
    unknown_device: 'Tablet non riconosciuto: rientra con il PIN.',
    rate_limited: 'Troppi tocchi: attendi un attimo.'
  };
  var JOIN_ERRORS = {
    bad_pin: 'PIN non corretto. Controlla il numero sul PC del docente.',
    locked: 'Gli ingressi sono chiusi. Chiedi al docente di riaprirli.',
    token_expired: 'Sessione scaduta: inserisci di nuovo il PIN.',
    too_many_attempts: 'Troppi tentativi. Attendi qualche minuto.',
    full: 'Troppi dispositivi collegati.',
    not_joined: 'Inserisci il PIN.'
  };

  var st = {
    ws: null, connected: false, retry: 0, retryTO: null, lastMsgAt: 0,
    phase: 'join', pin: '', deviceId: null, label: '', deviceToken: null, joinToken: null,
    participant: null, teams: [], requested: null, round: null,
    selection: null, numBuf: '', textBuf: '', sending: false, pendingSend: null,
    error: '', notice: '', noticeTO: null, joining: false
  };

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || '{}');
      st.pin = s.pin || '';
      st.deviceToken = s.deviceToken || null;
      st.joinToken = s.joinToken || null;
    } catch (e) { /* ignore */ }
    var m = /[?&]pin=(\d{4})/.exec(location.search);
    if (m && m[1] !== st.pin) { st.pin = m[1]; st.deviceToken = null; st.joinToken = null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ pin: st.pin, deviceToken: st.deviceToken, joinToken: st.joinToken })); } catch (e) { /* ignore */ }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } }

  /* ---------------- rete ---------------- */
  function send(obj) {
    if (!st.ws || st.ws.readyState !== 1) return false;
    try { st.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }
  function hello() {
    send({ type: 'hello', role: 'player', pin: st.pin, deviceToken: st.deviceToken, joinToken: st.joinToken, userAgent: navigator.userAgent.slice(0, 80) });
  }
  function connect() {
    if (st.ws && (st.ws.readyState === 0 || st.ws.readyState === 1)) return;
    var ws;
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { reconnectLater(); return; }
    st.ws = ws;
    ws.onopen = function () {
      st.connected = true; st.retry = 0; st.lastMsgAt = Date.now(); netBar.hidden = true;
      if (st.deviceToken || st.joinToken || (st.joining && /^\d{4}$/.test(st.pin))) hello();
      render();
    };
    ws.onmessage = function (ev) {
      st.lastMsgAt = Date.now();
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      onMessage(msg);
    };
    ws.onclose = function () {
      if (st.ws === ws) st.ws = null;
      st.connected = false;
      st.sending = false;
      if (st.phase !== 'join' && st.phase !== 'kicked') netBar.hidden = false;
      render();
      if (st.phase !== 'kicked') reconnectLater();
    };
    ws.onerror = function () { /* segue onclose */ };
  }
  function reconnectLater() {
    clearTimeout(st.retryTO);
    var delay = Math.min(4000, 400 * Math.pow(1.5, st.retry++));
    st.retryTO = setTimeout(connect, delay);
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'welcome': onWelcome(msg); break;
      case 'join.error':
        st.joining = false;
        if (msg.reason === 'token_expired' || msg.reason === 'not_joined') { st.deviceToken = null; st.joinToken = null; save(); }
        st.phase = 'join';
        st.error = JOIN_ERRORS[msg.reason] || 'Ingresso non riuscito.';
        render();
        break;
      case 'round': setRound(msg.round); break;
      case 'ack': onAck(msg); break;
      case 'kicked':
        st.deviceToken = null; st.joinToken = null; save();
        st.phase = 'kicked'; render();
        break;
      case 'error':
        if (msg.code === 'rate_limited') showNotice(REASONS.rate_limited);
        break;
      default: break;
    }
  }

  function onWelcome(m) {
    st.joining = false;
    st.error = '';
    st.deviceId = m.deviceId;
    st.label = m.label;
    st.teams = m.teams || [];
    st.requested = m.requestedParticipantId || null;
    var wasAssigned = !!st.participant;
    if (m.status === 'assigned') {
      st.deviceToken = m.deviceToken;
      st.joinToken = null;
      st.participant = m.participant;
      st.phase = 'team';
      if (m.reconnected && m.participant) showNotice('RICONNESSO COME ' + m.participant.name);
      else if (!wasAssigned && m.participant) { showNotice('SEI LA SQUADRA ' + m.participant.name); vibrate(60); }
    } else {
      st.joinToken = m.joinToken;
      st.deviceToken = null;
      st.participant = null;
      st.phase = 'pending';
    }
    save();
    setRound(m.round, true);
    // risposta inviata durante una disconnessione: la ritentiamo (il server decide se è ancora valida)
    if (st.pendingSend && st.round && st.round.roundInstanceId === st.pendingSend.roundInstanceId && !st.round.myAnswer && st.round.status === 'open') sendAnswer();
    render();
  }

  function setRound(r, silent) {
    if (!r) {
      st.round = null;
      st.selection = null;
      st.sending = false; st.pendingSend = null;
    } else {
      if (!st.round || st.round.roundInstanceId !== r.roundInstanceId) {
        st.selection = null; st.numBuf = ''; st.textBuf = ''; st.error = ''; st.sending = false;
        if (!st.pendingSend || st.pendingSend.roundInstanceId !== r.roundInstanceId) st.pendingSend = null;
        if (r.status === 'open' && !r.myAnswer) vibrate(40);
      }
      st.round = r;
      if (r.myAnswer) { st.selection = r.myAnswer; st.sending = false; }
    }
    if (!silent) render();
  }

  function onAck(m) {
    if (!st.round || m.roundInstanceId !== st.round.roundInstanceId) return;
    st.sending = false;
    st.pendingSend = null;
    if (m.accepted) {
      st.round.myAnswer = m.answer;
      st.selection = m.answer;
      st.error = '';
      vibrate([40, 40, 40]);
    } else {
      st.error = REASONS[m.reason] || 'Risposta non registrata.';
      if (m.reason === 'already_answered' && m.answer) { st.round.myAnswer = m.answer; st.selection = m.answer; }
      if (m.reason === 'invalid_token' || m.reason === 'unknown_device') { st.deviceToken = null; save(); hello(); }
    }
    render();
  }

  function sendAnswer() {
    if (!st.pendingSend) return;
    st.sending = true;
    if (!send({ type: 'answer', roundInstanceId: st.pendingSend.roundInstanceId, answer: st.pendingSend.answer, deviceToken: st.deviceToken })) {
      st.sending = false; // resta in coda: la reinviamo alla riconnessione
    }
  }

  function submit() {
    var r = st.round;
    if (!r || r.myAnswer || r.status !== 'open' || st.sending) return;
    var ans = currentAnswer();
    if (!ans) return;
    st.pendingSend = { roundInstanceId: r.roundInstanceId, answer: ans };
    st.error = '';
    sendAnswer();
    render();
  }

  function currentAnswer() {
    var r = st.round;
    if (!r) return null;
    if (r.layout === 'numeric') return /^-?\d+([.,]\d+)?$/.test(st.numBuf) ? st.numBuf : null;
    if (r.layout === 'text') return st.textBuf.trim() ? st.textBuf.trim() : null;
    return st.selection;
  }

  function showNotice(text) {
    st.notice = text;
    clearTimeout(st.noticeTO);
    st.noticeTO = setTimeout(function () { st.notice = ''; render(); }, 4000);
    render();
  }

  function doJoin() {
    var input = document.getElementById('pinInput');
    var v = input ? input.value.replace(/\D/g, '') : st.pin;
    if (v.length !== 4) { st.error = 'Il PIN ha 4 cifre.'; render(); return; }
    st.pin = v; st.deviceToken = null; st.joinToken = null; st.error = ''; st.joining = true;
    save();
    if (st.connected) hello(); else connect();
    render();
  }

  /* ---------------- interfaccia ---------------- */
  function statusLine() {
    return '<div class="status' + (st.connected ? '' : ' off') + '">' + (st.connected ? '● CONNESSO' : '○ NON CONNESSO') + '</div>';
  }

  function keysHTML(r, locked) {
    var dis = locked ? ' disabled' : '';
    if (r.layout === 'mcq') {
      return '<div class="keys">' + r.letters.map(function (L) { return '<button class="key' + (st.selection === L ? ' sel' : '') + '" data-pick="' + L + '"' + dis + ' aria-pressed="' + (st.selection === L) + '">' + L + '</button>'; }).join('') + '</div>';
    }
    if (r.layout === 'truefalse') {
      return '<div class="keys">' + [['V', 'VERO'], ['F', 'FALSO']].map(function (x) { return '<button class="key word' + (st.selection === x[0] ? ' sel' : '') + '" data-pick="' + x[0] + '"' + dis + '>' + x[1] + '</button>'; }).join('') + '</div>';
    }
    if (r.layout === 'numeric') {
      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', '⌫'];
      return '<div class="numDisplay">' + (esc(st.numBuf) || '&nbsp;') + '</div><div class="keys pad3">' + keys.map(function (k) { return '<button class="key" data-num="' + k + '"' + dis + '>' + k + '</button>'; }).join('') + '<button class="key" data-num=","' + dis + '>,</button></div>';
    }
    if (r.layout === 'text') {
      var rows = [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['Z','X','C','V','B','N','M'],
        ['À','È','É','Ì','Ò','Ù','-','\'']
      ];
      var maxLen = (r && r.maxLength) || 40;
      var html = '<div class="textEntryBar"><div class="textDisplay" id="textDisplay">' + (esc(st.textBuf) || '<span>SCRIVI LA RISPOSTA</span>') + '</div><span class="textCount" id="textCount">' + st.textBuf.length + '/' + maxLen + '</span></div><div class="textKeyboard">';
      rows.forEach(function (row, idx) {
        html += '<div class="kbRow kbRow' + idx + '">' + row.map(function (ch) {
          return '<button class="kbKey" type="button" data-char="' + esc(ch) + '"' + dis + '>' + esc(ch) + '</button>';
        }).join('') + '</div>';
      });
      html += '<div class="kbRow kbActions">' +
        '<button class="kbKey action" type="button" data-text-action="space"' + dis + '>SPAZIO</button>' +
        '<button class="kbKey action" type="button" data-text-action="backspace"' + dis + '>⌫</button>' +
        '<button class="kbKey action danger" type="button" data-text-action="clear"' + dis + '>CANCELLA</button>' +
        '</div></div>';
      return html;
    }
    if (r.layout === 'buzzer') {
      return '<div class="keys one"><button class="key word" data-buzz="1"' + dis + '>PRENOTA</button></div>';
    }
    return '';
  }

  function doneHTML(kind, tick, title, sub) {
    return '<div class="done ' + kind + '"><div class="tick">' + tick + '</div><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>';
  }

  function prettyAnswer(r, a) {
    if (r.layout === 'truefalse') return a === 'V' ? 'VERO' : 'FALSO';
    if (r.layout === 'buzzer') return 'PRENOTATA';
    return esc(a);
  }

  function roundHTML() {
    var r = st.round;
    var head = '<div class="head' + (r.layout === 'text' ? ' textHead' : '') + '"><div class="team">' + esc(st.participant ? st.participant.name : '') + '</div><small>' + (r.number ? 'DOMANDA ' + r.number + (r.total ? ' / ' + r.total : '') : 'IN GIOCO') + '</small></div>';
    if (r.revealed) {
      var o = r.myOutcome;
      if (r.layout === 'buzzer' || !o) return head + doneHTML('neutral', '★', 'SOLUZIONE SUL GRANDE SCHERMO', r.myAnswer ? 'Risposta: ' + prettyAnswer(r, r.myAnswer) : '');
      if (o === 'correct') return head + doneHTML('good', '✓', 'CORRETTA', 'Risposta: ' + prettyAnswer(r, r.myAnswer));
      if (o === 'wrong') return head + doneHTML('bad', '✗', 'NON CORRETTA', 'Risposta: ' + prettyAnswer(r, r.myAnswer));
      return head + doneHTML('neutral', 'Ø', 'NESSUNA RISPOSTA', 'Guarda la soluzione sul grande schermo');
    }
    if (r.myAnswer) return head + doneHTML('', '✓', 'RISPOSTA REGISTRATA', 'Risposta: <b>' + prettyAnswer(r, r.myAnswer) + '</b>' + (r.status === 'closed' ? '<br>Tempo scaduto' : ''));
    if (r.status === 'closed') return head + doneHTML('wait', '⏱', 'TEMPO SCADUTO', 'Nessuna risposta inviata');
    var paused = r.status === 'paused';
    var ans = currentAnswer();
    var choice = r.layout === 'buzzer' ? '' : (r.layout === 'text' ? 'SPAZIO separa le parole · INVIA quando hai finito' : (ans ? 'RISPOSTA: <b>' + prettyAnswer(r, ans) + '</b>' : r.layout === 'numeric' ? 'Componi il numero' : 'Tocca una risposta'));
    var canSend = !!ans && !paused && !st.sending && st.connected;
    return head +
      (paused ? '<div class="banner">TEMPO IN PAUSA</div>' : '') +
      (st.error ? '<p class="error">' + esc(st.error) + '</p>' : '') +
      '<div class="answerArea' + (r.layout === 'text' ? ' textMode' : '') + '">' + keysHTML(r, st.sending) +
      '<div class="choice" id="choiceLine">' + choice + '</div>' +
      (r.layout === 'buzzer' ? '' : '<button class="send" id="sendBtn"' + (canSend ? '' : ' disabled') + '>' + (st.sending ? 'INVIO…' : (st.pendingSend && !st.connected ? 'IN ATTESA DI RETE…' : 'INVIA')) + '</button>') +
      '</div>';
  }

  function render() {
    fsBtn.hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled) || !!(document.fullscreenElement || document.webkitFullscreenElement);
    var h = '';
    if (st.phase === 'connecting') {
      h = '<div class="center"><div class="brand">IL <b>SECCHIONE</b> · PULSANTIERA</div><p class="muted">Collegamento al PC del docente…</p></div>';
    } else if (st.phase === 'join') {
      h = '<div class="center"><div class="brand">IL <b>SECCHIONE</b> · PULSANTIERA</div>' +
        '<p class="muted">Inserisci il PIN mostrato dal docente</p>' +
        '<input id="pinInput" class="pinInput" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="' + esc(st.pin) + '" aria-label="PIN">' +
        '<p class="error">' + esc(st.error) + '</p>' +
        '<button class="big green" id="joinBtn"' + (st.joining ? ' disabled' : '') + '>' + (st.joining ? 'COLLEGAMENTO…' : 'ENTRA') + '</button>' +
        '<p class="muted">Nessun account, nessun nome: il tablet diventa la pulsantiera della squadra.</p></div>';
    } else if (st.phase === 'kicked') {
      h = '<div class="center"><div class="brand">IL <b>SECCHIONE</b></div><div class="team">DISCONNESSO</div><p class="muted">Il docente ha scollegato questo dispositivo.</p><button class="big ghost" id="rejoinBtn">ENTRA DI NUOVO</button></div>';
    } else if (st.phase === 'pending') {
      h = '<div class="center"><div class="devLabel">' + esc(st.label) + '</div>' + statusLine() +
        (st.teams.length ? '<p class="muted">Tocca il nome della tua squadra. Il docente confermerà.</p><div class="teamList">' +
          st.teams.map(function (t) { return '<button class="teamBtn' + (st.requested === t.id ? ' sel' : '') + '" data-team="' + esc(t.id) + '">' + esc(t.name) + '</button>'; }).join('') + '</div>' +
          (st.requested ? '<p class="muted">Richiesta inviata. Attendi il docente…</p>' : '')
          : '<p class="muted">Attendi: il docente non ha ancora creato le squadre.</p>') +
        '</div>';
    } else if (st.phase === 'team') {
      h = (st.notice ? '<div class="banner">' + esc(st.notice) + '</div>' : '') +
        (st.round ? roundHTML() : '<div class="center"><div class="team">' + esc(st.participant ? st.participant.name : '') + '</div>' + statusLine() + '<p class="muted">Guarda il grande schermo:<br>la domanda arriva lì.</p></div>');
    }
    var active = document.activeElement;
    var pinEl = document.getElementById('pinInput');
    if (pinEl && st.phase === 'join' && !st.joining) {
      // non perdere le cifre già digitate se lo schermo si aggiorna mentre si scrive il PIN
      var typed = pinEl.value.replace(/\D/g, '').slice(0, 4);
      var hadFocus = active === pinEl;
      app.innerHTML = h;
      var fresh = document.getElementById('pinInput');
      if (fresh) { fresh.value = typed; if (hadFocus) { fresh.focus(); try { fresh.setSelectionRange(typed.length, typed.length); } catch (e) { /* ignore */ } } }
      return;
    }
    var keepText = active && active.id === 'textInput' && st.phase === 'team' && st.round && st.round.layout === 'text' && document.getElementById('textInput');
    if (keepText) { updateTextUI(); return; }
    app.innerHTML = h;
  }

  function updateTextUI() {
    var ans = currentAnswer();
    var td = document.getElementById('textDisplay');
    var tc = document.getElementById('textCount');
    var cl = document.getElementById('choiceLine');
    var sb = document.getElementById('sendBtn');
    if (td) { td.innerHTML = ans ? esc(st.textBuf) : '<span>SCRIVI LA RISPOSTA</span>'; td.scrollLeft = td.scrollWidth; }
    if (tc) tc.textContent = st.textBuf.length + '/' + ((st.round && st.round.maxLength) || 40);
    if (cl) cl.textContent = 'SPAZIO separa le parole · INVIA quando hai finito';
    if (sb) sb.disabled = !ans || st.round.status !== 'open' || st.sending || !st.connected;
  }

  app.addEventListener('click', function (e) {
    var t = e.target;
    var el;
    if (t.id === 'joinBtn') return doJoin();
    if (t.id === 'rejoinBtn') { st.phase = 'join'; st.error = ''; render(); connect(); return; }
    if (t.id === 'sendBtn') return submit();
    if ((el = t.closest('[data-team]'))) {
      st.requested = el.getAttribute('data-team');
      send({ type: 'request', participantId: st.requested });
      render();
      return;
    }
    if (!st.round || st.round.myAnswer || st.sending) return;
    if ((el = t.closest('[data-pick]'))) { st.selection = el.getAttribute('data-pick'); st.error = ''; render(); return; }
    if ((el = t.closest('[data-num]'))) {
      var k = el.getAttribute('data-num');
      if (k === '⌫') st.numBuf = st.numBuf.slice(0, -1);
      else if (k === '−') st.numBuf = st.numBuf.charAt(0) === '-' ? st.numBuf.slice(1) : '-' + st.numBuf;
      else if (k === ',') { if (st.numBuf.indexOf(',') < 0 && /\d$/.test(st.numBuf)) st.numBuf += ','; }
      else if (st.numBuf.replace(/\D/g, '').length < 9) st.numBuf += k;
      render();
      return;
    }
    if ((el = t.closest('[data-char]'))) {
      var max = (st.round && st.round.maxLength) || 40;
      var ch = el.getAttribute('data-char') || '';
      if (st.textBuf.length < max) st.textBuf += ch;
      st.error = '';
      updateTextUI();
      return;
    }
    if ((el = t.closest('[data-text-action]'))) {
      var action = el.getAttribute('data-text-action');
      var maxLen = (st.round && st.round.maxLength) || 40;
      if (action === 'backspace') st.textBuf = st.textBuf.slice(0, -1);
      else if (action === 'clear') st.textBuf = '';
      else if (action === 'space' && st.textBuf.length < maxLen && st.textBuf && st.textBuf.charAt(st.textBuf.length - 1) !== ' ') st.textBuf += ' ';
      st.error = '';
      updateTextUI();
      return;
    }
    if (t.closest('[data-buzz]')) { st.selection = 'BUZZ'; submit(); }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id === 'pinInput') { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); return; }
    if (e.target.id === 'textInput') { st.textBuf = e.target.value; updateTextUI(); }
  });
  app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'pinInput') { e.preventDefault(); doJoin(); }
    if (e.target.id === 'textInput') { e.preventDefault(); submit(); }
  });

  /* ---------------- schermo intero e schermo sempre acceso ---------------- */
  var wakeLock = null;
  function requestWake() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () { /* non supportato o negato */ });
      }
    } catch (e) { /* ignore */ }
  }
  fsBtn.addEventListener('click', function () {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { var p = req.call(el); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ } }
    requestWake();
    setTimeout(render, 300);
  });
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('webkitfullscreenchange', render);
  document.addEventListener('pointerdown', function once() { requestWake(); document.removeEventListener('pointerdown', once); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (!wakeLock || wakeLock.released) requestWake();
      if (!st.connected && st.phase !== 'join' && st.phase !== 'kicked') connect();
    }
  });

  /* battito: se il server tace per 12 s la connessione è considerata persa */
  setInterval(function () {
    if (!st.connected) return;
    send({ type: 'ping', t: Date.now() });
    if (Date.now() - st.lastMsgAt > 12000 && st.ws) { try { st.ws.close(); } catch (e) { /* ignore */ } }
  }, 4000);

  load();
  if (st.deviceToken || st.joinToken) { st.phase = 'connecting'; connect(); }
  else if (/[?&]pin=\d{4}/.test(location.search)) { st.joining = true; connect(); }
  render();
})();
