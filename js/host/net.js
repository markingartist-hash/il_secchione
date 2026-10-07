/*
 * Il Secchione · client di rete della REGIA (WebSocket verso il server locale).
 * Da file:// o senza chiave regia è "non disponibile": tutte le funzioni diventano innocue
 * e la regia lavora in modalità manuale.
 */
(function (root) {
  'use strict';
  var listeners = {};
  var ws = null;
  var connected = false;
  var stopped = false;
  var retry = 0;
  var retryTO = null;
  var sessionId = null;
  var participants = null; // null = elenco squadre non ancora noto: il server conserva il suo
  var room = { pin: null, joinLocked: false, urls: [], devices: [], round: null, showClients: 0, testClients: 0, port: null };
  var outbox = [];
  var show = { provider: null, meta: null, lastHtml: '', to: null, timerLast: 0, timerKey: '' };

  function hostKey() {
    var m = document.querySelector('meta[name="secchione-host-key"]');
    return m ? m.getAttribute('content') || '' : '';
  }
  var available = /^https?:$/.test(location.protocol) && !!hostKey();

  function emit(ev, data) { (listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }

  function rawSend(msg) {
    if (!connected || !ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(msg)); return true; } catch (e) { return false; }
  }
  /** I comandi critici (commit) vengono ritentati alla riconnessione. */
  function send(type, payload, critical) {
    var msg = Object.assign({ type: type }, payload || {});
    var ok = rawSend(msg);
    if (!ok && critical) outbox.push(msg);
    return ok;
  }

  function scheduleReconnect() {
    if (stopped || !available) return;
    clearTimeout(retryTO);
    var delay = Math.min(5000, 400 * Math.pow(1.6, retry++));
    retryTO = setTimeout(connect, delay);
  }

  function connect() {
    if (!available || stopped) return;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { scheduleReconnect(); return; }
    ws.onopen = function () {
      var hello = { type: 'hello', role: 'host', hostKey: hostKey(), sessionId: sessionId };
      if (participants) hello.participants = participants;
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handle(msg);
    };
    ws.onclose = function () {
      var was = connected;
      connected = false;
      ws = null;
      if (was) emit('status');
      scheduleReconnect();
    };
    ws.onerror = function () { /* onclose segue */ };
  }

  function handle(msg) {
    switch (msg.type) {
      case 'room.state':
        room = msg.room || room;
        connected = true;
        retry = 0;
        var queued = outbox;
        outbox = [];
        queued.forEach(rawSend);
        emit('status');
        emit('room', room);
        pushShowNow();
        break;
      case 'room.update':
        if (msg.pin) room.pin = msg.pin;
        room.joinLocked = !!msg.joinLocked;
        emit('devices', room.devices);
        break;
      case 'devices':
        room.devices = msg.devices || [];
        var hadShows = room.showClients || 0;
        if (typeof msg.showClients === 'number') room.showClients = msg.showClients;
        if (!hadShows && room.showClients) { show.lastHtml = ''; show.timerKey = ''; pushShowNow(); }
        if (typeof msg.testClients === 'number') room.testClients = msg.testClients;
        emit('devices', room.devices);
        break;
      case 'round.state': room.round = msg.round; emit('round', msg.round); break;
      case 'response': emit('response', msg.record); break;
      case 'response.voided': emit('response.voided', msg); break;
      case 'response.rejected': emit('rejected', msg); break;
      case 'round.committed': emit('committed', msg); break;
      case 'show.request':
        // un nuovo schermo /show si è collegato: gli serve subito il palco completo
        room.showClients = Math.max(room.showClients || 0, 1);
        show.lastHtml = '';
        show.timerKey = '';
        pushShowNow();
        break;
      case 'error':
        if (msg.code === 'bad_host_key' || msg.code === 'replaced') {
          stopped = true;
          available = msg.code !== 'bad_host_key';
          emit('status');
          emit('error', msg);
        } else {
          console.warn('Server:', msg.code, msg.context || '');
          emit('error', msg);
        }
        break;
      default: break;
    }
  }

  /* ---------------- palco remoto (/show) ---------------- */
  function pushShowNow() {
    if (!connected || !show.provider || !room.showClients) return;
    var html;
    try { html = show.provider(); } catch (e) { return; }
    if (html === show.lastHtml) return;
    show.lastHtml = html;
    rawSend({ type: 'show.stage', html: html, meta: show.meta || {} });
    if (show.lastTimer) rawSend({ type: 'show.timer', timer: show.lastTimer });
  }
  function scheduleShow(delay) {
    clearTimeout(show.to);
    show.to = setTimeout(pushShowNow, delay);
  }

  var Net = {
    on: on,
    connect: function () { if (available) connect(); },
    status: function () { return { available: available, connected: connected, pin: room.pin, joinLocked: room.joinLocked, port: room.port, showClients: room.showClients || 0, testClients: room.testClients || 0 }; },
    room: function () { return room; },
    devices: function () { return room.devices || []; },
    isConnected: function () { return connected; },
    /** teamId → {connected, rttMs, count} (più dispositivi per squadra: basta che uno sia connesso). */
    teamDevices: function () {
      var map = {};
      (room.devices || []).forEach(function (d) {
        if (!d.participantId || d.status !== 'assigned') return;
        var m = map[d.participantId] || (map[d.participantId] = { connected: false, rttMs: null, count: 0 });
        m.count++;
        if (d.connected) { m.connected = true; if (d.rttMs != null && (m.rttMs == null || d.rttMs < m.rttMs)) m.rttMs = d.rttMs; }
        if (d.lastSeen && (!m.lastSeen || d.lastSeen > m.lastSeen)) m.lastSeen = d.lastSeen;
      });
      return map;
    },
    boundTeamIds: function () {
      var map = {};
      if (!connected) return map;
      (room.devices || []).forEach(function (d) { if (d.participantId && d.status === 'assigned') map[d.participantId] = true; });
      return map;
    },
    newSession: function (id) { sessionId = id; send('session.set', { sessionId: id }); },
    syncParticipants: function (list) { participants = list || []; send('participants', { list: participants }); },
    openRound: function (o) { send('round.open', o); },
    pauseRound: function (id) { if (id) send('round.pause', { roundInstanceId: id }); },
    resumeRound: function (id, remainingMs) { if (id) send('round.resume', { roundInstanceId: id, remainingMs: remainingMs }); },
    addTime: function (id, ms) { if (id) send('round.addTime', { roundInstanceId: id, ms: ms }); },
    closeRound: function (id) { if (id) send('round.close', { roundInstanceId: id }); },
    revealRound: function (id) { if (id) send('round.reveal', { roundInstanceId: id }); },
    unlock: function (id, participantId) { send('round.unlock', { roundInstanceId: id, participantId: participantId }); },
    commitRound: function (o) { if (available) send('round.commit', o, true); },
    uncommitRound: function (id) { if (available) send('round.uncommit', { roundInstanceId: id }, true); },
    assign: function (deviceId, participantId) { send('device.assign', { deviceId: deviceId, participantId: participantId }); },
    kick: function (deviceId) { send('device.kick', { deviceId: deviceId }); },
    forget: function (deviceId) { send('device.forget', { deviceId: deviceId }); },
    setJoinLocked: function (locked) { room.joinLocked = !!locked; send('join.lock', { locked: !!locked }); },
    /* palco remoto: la regia passa una FUNZIONE, calcolata solo se c'è almeno uno schermo /show collegato */
    showStage: function (provider, meta) { show.provider = provider; show.meta = meta; if (connected && room.showClients) scheduleShow(40); },
    showRefresh: function () { if (connected && room.showClients) scheduleShow(150); },
    showTimer: function (t) {
      show.lastTimer = t;
      if (!connected || !room.showClients) return;
      var key = (t.running ? 1 : 0) + '|' + t.status + '|' + t.mood + '|' + Math.round(t.duration);
      var now = Date.now();
      if (key === show.timerKey && now - show.timerLast < 1000) return;
      show.timerKey = key;
      show.timerLast = now;
      rawSend({ type: 'show.timer', timer: t });
    },
    showTransition: function (data) { if (connected && room.showClients) rawSend({ type: 'show.transition', data: data }); },
    fetchLog: function () {
      if (!available) return Promise.resolve([]);
      return fetch('/api/host/log', { headers: { 'X-Secchione-Host': hostKey() }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : []; });
    }
  };

  root.SecchioneNet = Net;
})(typeof self !== 'undefined' ? self : this);
