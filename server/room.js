/*
 * Room: stato AUTORITATIVO di una classe collegata al server locale.
 * - dispositivi (pulsantiere), PIN, ingressi aperti/chiusi, token
 * - round corrente: aperto/in pausa/chiuso, scadenza, risposte accettate (una per squadra)
 * - verifica e calcolo del punteggio al commit (stesso scoring.js della regia)
 * Nessun I/O: rete e disco sono nel server. Così la logica è testabile con un orologio finto.
 */
'use strict';
var crypto = require('crypto');
var Session = require('../js/engine/session.js');
var Scoring = require('../js/engine/scoring.js');
var AnswerMatcher = require('../js/engine/answerMatcher.js');
var Timer = require('../js/engine/timer.js');

var LAYOUTS = ['mcq', 'truefalse', 'numeric', 'text', 'buzzer'];
var MCQ_LETTERS = ['A', 'B', 'C', 'D'];
var LOG_LIMIT = 20000;

function rand(bytes) { return crypto.randomBytes(bytes || 16).toString('hex'); }
function genPin() { return String(crypto.randomBytes(2).readUInt16BE(0) % 9000 + 1000); }
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return false;
  var ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function cleanStr(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 60); }

/** Normalizza e valida una risposta per il layout del round. Restituisce la stringa normalizzata o null. */
function normalizeAnswer(round, answer) {
  if (typeof answer !== 'string' && typeof answer !== 'number') return null;
  var a = String(answer).trim();
  switch (round.layout) {
    case 'mcq':
      a = a.toUpperCase();
      return round.letters.indexOf(a) >= 0 ? a : null;
    case 'truefalse':
      a = a.toUpperCase();
      return a === 'V' || a === 'F' ? a : null;
    case 'numeric':
      a = a.replace(',', '.');
      return /^-?\d{1,9}(\.\d{1,6})?$/.test(a) ? String(Number(a)) : null;
    case 'text':
      a = cleanStr(a, round.maxLength || 40);
      return a ? a : null;
    case 'buzzer':
      return a.toUpperCase() === 'BUZZ' ? 'BUZZ' : null;
    default:
      return null;
  }
}

/** Esito calcolato dal server. Per il buzzer l'esito lo decide il docente: qui resta 'omitted'. */
function outcomeFor(round, normalized) {
  if (normalized == null) return 'omitted';
  if (round.correct == null || round.layout === 'buzzer') return 'omitted';
  if (round.layout === 'numeric') return Number(normalized) === Number(round.correct) ? 'correct' : 'wrong';
  if (round.layout === 'text') return AnswerMatcher.answerMatcher(normalized, { answer: round.correct, acceptedAnswers: round.acceptedAnswers }).isCorrect ? 'correct' : 'wrong';
  return normalized === String(round.correct).toUpperCase() ? 'correct' : 'wrong';
}

function Room(opts) {
  var o = opts || {};
  this.clock = o.clock || Date.now;
  this.graceMs = typeof o.graceMs === 'number' ? o.graceMs : 500;
  this.onLog = o.onLog || function () {};
  this.pin = o.pin || genPin();
  this.createdAt = new Date(this.clock()).toISOString();
  this.joinLocked = false;
  this.sessionId = null;
  this.participants = {};
  this.participantOrder = [];
  this.devices = {};
  this.deviceSeq = 0;
  this.round = null;
  this.usedRoundIds = {};
  this.availableMs = {}; // RC2-A: tempo disponibile finale di ogni round (durata + secondi aggiunti), base del bonus velocità
  this.responses = [];
  this.commits = {};
  this.log = [];
}

Room.prototype.now = function () { return this.clock(); };
Room.prototype.iso = function () { return new Date(this.clock()).toISOString(); };

Room.prototype.addLog = function (e) {
  var entry = {
    timestamp: this.iso(),
    sessionId: this.sessionId,
    roundInstanceId: e.roundInstanceId || null,
    participantId: e.participantId || null,
    deviceId: e.deviceId || null,
    event: e.event,
    answer: e.answer == null ? null : e.answer,
    accepted: typeof e.accepted === 'boolean' ? e.accepted : null,
    reason: e.reason || null,
    latency: typeof e.latency === 'number' ? e.latency : null,
    scoreDelta: typeof e.scoreDelta === 'number' ? e.scoreDelta : null,
    source: 'server'
  };
  this.log.push(entry);
  if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
  this.onLog(entry);
  return entry;
};

/* ---------------- sessione e partecipanti (comandi dell'HOST) ---------------- */

Room.prototype.setSession = function (sessionId) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 80) return false;
  if (this.sessionId !== sessionId) {
    this.sessionId = sessionId;
    this.responses = [];
    this.commits = {};
    this.addLog({ event: 'session.set' });
  }
  return true;
};

Room.prototype.syncParticipants = function (list) {
  if (!Array.isArray(list) || list.length > 100) return false;
  var next = {};
  var order = [];
  list.forEach(function (p) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 80) return;
    next[p.id] = { id: p.id, name: cleanStr(p.name, 40) || 'Squadra', type: p.type === 'individual' ? 'individual' : 'team' };
    order.push(p.id);
  });
  this.participants = next;
  this.participantOrder = order;
  var self = this;
  Object.keys(this.devices).forEach(function (id) {
    var d = self.devices[id];
    if (d.participantId && !next[d.participantId]) self._unbind(d, 'squadra rimossa');
    if (d.requestedParticipantId && !next[d.requestedParticipantId]) d.requestedParticipantId = null;
  });
  return true;
};

Room.prototype.setJoinLocked = function (locked) {
  this.joinLocked = !!locked;
  this.addLog({ event: locked ? 'join.lock' : 'join.unlock' });
};

/* ---------------- dispositivi ---------------- */

/**
 * Ingresso o rientro di un dispositivo.
 * - con deviceToken valido: rientra come squadra assegnata (anche a ingressi chiusi)
 * - con joinToken valido: rientra come dispositivo in attesa
 * - altrimenti serve il PIN e gli ingressi devono essere aperti
 */
Room.prototype.join = function (req) {
  var r = req || {};
  var self = this;
  var found = null;
  if (typeof r.deviceToken === 'string' && r.deviceToken) {
    Object.keys(this.devices).forEach(function (id) { var d = self.devices[id]; if (!found && d.status === 'assigned' && safeEqual(d.deviceToken, r.deviceToken)) found = d; });
    if (found) {
      found.lastSeen = this.iso();
      this.addLog({ event: 'device.reconnect', deviceId: found.deviceId, participantId: found.participantId, accepted: true });
      return { ok: true, device: found, reconnected: true };
    }
  }
  if (typeof r.joinToken === 'string' && r.joinToken) {
    Object.keys(this.devices).forEach(function (id) { var d = self.devices[id]; if (!found && d.status === 'pending' && safeEqual(d.joinToken, r.joinToken)) found = d; });
    if (found) {
      found.lastSeen = this.iso();
      return { ok: true, device: found, reconnected: true };
    }
  }
  if (String(r.pin || '') !== this.pin) {
    this.addLog({ event: 'device.join', accepted: false, reason: r.deviceToken || r.joinToken ? 'token_scaduto' : 'pin_errato' });
    return { ok: false, reason: r.deviceToken || r.joinToken ? 'token_expired' : 'bad_pin' };
  }
  if (this.joinLocked) {
    this.addLog({ event: 'device.join', accepted: false, reason: 'ingressi_chiusi' });
    return { ok: false, reason: 'locked' };
  }
  if (Object.keys(this.devices).length >= 120) return { ok: false, reason: 'full' };
  var d = {
    deviceId: 'dev-' + rand(6),
    label: 'TABLET ' + (++this.deviceSeq),
    number: this.deviceSeq,
    joinToken: rand(16),
    deviceToken: null,
    participantId: null,
    requestedParticipantId: null,
    status: 'pending',
    connected: false,
    rttMs: null,
    createdAt: this.iso(),
    lastSeen: this.iso(),
    userAgent: cleanStr(r.userAgent, 80)
  };
  this.devices[d.deviceId] = d;
  this.addLog({ event: 'device.join', deviceId: d.deviceId, accepted: true });
  return { ok: true, device: d, reconnected: false };
};

Room.prototype.requestParticipant = function (deviceId, participantId) {
  var d = this.devices[deviceId];
  if (!d || d.status !== 'pending') return false;
  if (participantId != null && !this.participants[participantId]) return false;
  d.requestedParticipantId = participantId || null;
  this.addLog({ event: 'device.request', deviceId: deviceId, participantId: participantId || null });
  return true;
};

/** Assegna (o toglie, con null) una squadra. Ogni assegnazione genera un NUOVO token casuale. */
Room.prototype.assign = function (deviceId, participantId) {
  var d = this.devices[deviceId];
  if (!d || d.status === 'kicked') return null;
  if (participantId == null) { this._unbind(d, 'docente'); return d; }
  if (!this.participants[participantId]) return null;
  d.participantId = participantId;
  d.requestedParticipantId = null;
  d.deviceToken = rand(16);
  d.joinToken = null;
  d.status = 'assigned';
  this.addLog({ event: 'device.assign', deviceId: deviceId, participantId: participantId, accepted: true });
  return d;
};

Room.prototype._unbind = function (d, reason) {
  d.participantId = null;
  d.deviceToken = null;
  d.joinToken = rand(16);
  d.status = 'pending';
  this.addLog({ event: 'device.unassign', deviceId: d.deviceId, reason: reason });
};

Room.prototype.kick = function (deviceId) {
  var d = this.devices[deviceId];
  if (!d) return null;
  d.status = 'kicked';
  d.deviceToken = null;
  d.joinToken = null;
  d.participantId = null;
  d.connected = false;
  this.addLog({ event: 'device.kick', deviceId: deviceId });
  return d;
};

Room.prototype.forget = function (deviceId) {
  if (!this.devices[deviceId]) return false;
  delete this.devices[deviceId];
  return true;
};

Room.prototype.setConnected = function (deviceId, connected, rttMs) {
  var d = this.devices[deviceId];
  if (!d) return;
  d.connected = !!connected;
  if (typeof rttMs === 'number') d.rttMs = rttMs;
  d.lastSeen = this.iso();
};

/* ---------------- round ---------------- */

Room.prototype.openRound = function (o) {
  var x = o || {};
  var id = x.roundInstanceId;
  if (typeof id !== 'string' || id.length < 8 || id.length > 80) return { ok: false, reason: 'bad_round_id' };
  if (this.usedRoundIds[id]) return { ok: false, reason: 'round_id_reused' };
  var layout = LAYOUTS.indexOf(x.layout) >= 0 ? x.layout : 'mcq';
  var letters = layout === 'mcq' ? (Array.isArray(x.letters) ? x.letters.filter(function (l) { return MCQ_LETTERS.indexOf(l) >= 0; }) : MCQ_LETTERS.slice()) : layout === 'truefalse' ? ['V', 'F'] : [];
  if (layout === 'mcq' && letters.length < 2) return { ok: false, reason: 'bad_letters' };
  var correct = x.correct == null ? null : String(x.correct);
  if ((layout === 'mcq' || layout === 'truefalse') && correct != null && letters.indexOf(correct.toUpperCase()) < 0) return { ok: false, reason: 'bad_correct' };
  var dur = Math.max(1000, Math.min(600000, Number(x.durationMs) || Timer.DEFAULTS.question * 1000));
  if (this.round && this.round.status !== 'closed') this.closeRound(this.round.roundInstanceId, 'nuovo round');
  var now = this.now();
  this.round = {
    roundInstanceId: id,
    questionId: x.questionId == null ? null : String(x.questionId).slice(0, 80),
    kind: x.kind === 'arcade' ? 'arcade' : 'question',
    gameType: x.gameType == null ? null : cleanStr(x.gameType, 40),
    number: Number(x.number) || null,
    total: Number(x.total) || null,
    layout: layout,
    letters: letters,
    maxLength: Math.max(1, Math.min(200, Number(x.maxLength) || 40)),
    correct: correct,
    status: x.paused ? 'paused' : 'open',
    openedAt: now,
    deadline: now + dur,
    remainingMs: dur,
    availableMs: Math.max(dur, Math.min(600000, Number(x.availableMs) || 0)),
    pausedAt: x.paused ? now : null,
    pausedTotalMs: 0,
    closedAt: null,
    revealed: false,
    seq: 0,
    responses: {}
  };
  this.usedRoundIds[id] = true;
  this.availableMs[id] = this.round.availableMs;
  this.addLog({ event: 'round.open', roundInstanceId: id, reason: layout + ' ' + dur + 'ms' });
  return { ok: true, round: this.round };
};

Room.prototype._current = function (id) {
  return this.round && this.round.roundInstanceId === id ? this.round : null;
};

Room.prototype.pauseRound = function (id) {
  var r = this._current(id);
  if (!r || r.status !== 'open') return false;
  var now = this.now();
  r.remainingMs = Math.max(0, r.deadline - now);
  r.pausedAt = now;
  r.status = 'paused';
  this.addLog({ event: 'round.pause', roundInstanceId: id });
  return true;
};

Room.prototype.resumeRound = function (id, remainingMs) {
  var r = this._current(id);
  if (!r || r.status === 'closed') return false;
  var now = this.now();
  if (r.status === 'paused') r.pausedTotalMs += now - (r.pausedAt || now);
  var rem = typeof remainingMs === 'number' && isFinite(remainingMs) ? Math.max(0, Math.min(600000, remainingMs)) : r.remainingMs;
  r.deadline = now + rem;
  r.pausedAt = null;
  r.status = 'open';
  this.addLog({ event: 'round.resume', roundInstanceId: id });
  return true;
};

Room.prototype.addTime = function (id, ms) {
  var r = this._current(id);
  var add = Math.max(-600000, Math.min(600000, Number(ms) || 0));
  if (!r || r.status === 'closed' || !add) return false;
  if (r.status === 'open') r.deadline += add;
  else r.remainingMs = Math.max(0, r.remainingMs + add);
  r.availableMs = Math.max(1000, (Number(r.availableMs) || 0) + add);
  this.availableMs[id] = r.availableMs;
  this.addLog({ event: 'round.addTime', roundInstanceId: id, reason: String(add) });
  return true;
};

Room.prototype.closeRound = function (id, reason) {
  var r = this._current(id);
  if (!r || r.status === 'closed') return false;
  r.status = 'closed';
  r.closedAt = this.now();
  this.addLog({ event: 'round.close', roundInstanceId: id, reason: reason || 'docente' });
  return true;
};

Room.prototype.revealRound = function (id) {
  var r = this._current(id);
  if (!r) return false;
  if (r.status !== 'closed') this.closeRound(id, 'reveal');
  r.revealed = true;
  this.addLog({ event: 'round.reveal', roundInstanceId: id });
  return true;
};

/** Chiusura automatica alla scadenza (+ tolleranza). Restituisce true se ha chiuso. */
Room.prototype.tick = function () {
  var r = this.round;
  if (r && r.status === 'open' && this.now() > r.deadline + this.graceMs) return this.closeRound(r.roundInstanceId, 'scadenza');
  return false;
};

/** Il docente sblocca una squadra: la risposta già data viene annullata (resta nel log) e può rispondere di nuovo. */
Room.prototype.unlock = function (id, participantId) {
  var r = this._current(id);
  if (!r || !r.responses[participantId]) return false;
  var rec = r.responses[participantId];
  rec.voided = true;
  rec.voidedAt = this.iso();
  delete r.responses[participantId];
  this.addLog({ event: 'response.unlock', roundInstanceId: id, participantId: participantId });
  return true;
};

/* ---------------- risposte dai dispositivi ---------------- */

/**
 * Valida e registra una risposta. Il server non si fida di: timestamp, squadra, punteggio, timer del browser.
 * msg: {roundInstanceId, answer, deviceToken}
 * Restituisce {accepted:true, record, duplicate?} oppure {accepted:false, reason}.
 */
Room.prototype.answer = function (deviceId, msg) {
  var m = msg || {};
  var d = this.devices[deviceId];
  var self = this;
  function reject(reason, extra) {
    self.addLog({ event: 'response', roundInstanceId: m.roundInstanceId, participantId: d && d.participantId, deviceId: deviceId, answer: typeof m.answer === 'string' ? m.answer.slice(0, 20) : null, accepted: false, reason: reason });
    return Object.assign({ accepted: false, reason: reason }, extra || {});
  }
  if (!d || d.status === 'kicked') return reject('unknown_device');
  if (d.status !== 'assigned' || !safeEqual(d.deviceToken, m.deviceToken)) return reject('invalid_token');
  var pid = d.participantId;
  if (!pid || !this.participants[pid]) return reject('not_assigned');
  var r = this.round;
  if (!r || typeof m.roundInstanceId !== 'string' || r.roundInstanceId !== m.roundInstanceId) {
    return reject(this.usedRoundIds[m.roundInstanceId] ? 'stale_round' : 'unknown_round');
  }
  if (r.status === 'paused') return reject('round_paused');
  if (r.status !== 'open' || this.now() > r.deadline + this.graceMs) return reject('round_closed');
  var normalized = normalizeAnswer(r, m.answer);
  if (normalized == null) return reject('invalid_answer');
  var existing = r.responses[pid];
  if (existing) {
    if (existing.selectedAnswer === normalized) return { accepted: true, duplicate: true, record: existing };
    return reject('already_answered', { answer: existing.selectedAnswer });
  }
  var now = this.now();
  r.seq += 1;
  var record = Session.makeResponse({
    sessionId: this.sessionId || '',
    roundInstanceId: r.roundInstanceId,
    kind: r.kind === 'arcade' ? 'arcade' : 'question',
    questionId: r.questionId,
    gameType: r.gameType || null,
    participantId: pid,
    participantType: this.participants[pid].type,
    selectedAnswer: normalized,
    correctAnswer: r.correct,
    outcome: outcomeFor(r, normalized),
    responseTimeMs: now - r.openedAt - r.pausedTotalMs,
    inputMode: 'tablet',
    order: r.seq,
    deviceId: deviceId,
    receivedAt: new Date(now).toISOString()
  });
  record.seq = r.seq;
  r.responses[pid] = record;
  this.responses.push(record);
  this.addLog({ event: 'response', roundInstanceId: r.roundInstanceId, participantId: pid, deviceId: deviceId, answer: normalized, accepted: true, latency: record.responseTimeMs });
  return { accepted: true, record: record };
};

/* ---------------- conferma punteggio ---------------- */

/**
 * La regia invia i record finali (tablet + manuali). Il server:
 * - sostituisce i dati dei record da tablet con quelli registrati da lui (risposta, timestamp, tempo);
 * - ricalcola gli eventi di punteggio con scoring.js.
 */
Room.prototype.commit = function (o) {
  var x = o || {};
  var id = x.roundInstanceId;
  if (typeof id !== 'string' || !Array.isArray(x.records)) return { ok: false, reason: 'bad_commit' };
  var own = {};
  this.responses.forEach(function (r) { if (r.roundInstanceId === id && !r.voided) own[r.participantId] = r; });
  var seen = {};
  var self = this;
  var corrected = 0;
  var records = [];
  /* RC2-A: il tempo disponibile lo decide il server quando lo conosce (come il tempo di risposta), uguale per tutto il round. */
  var hostAvail = Number(x.availableMs);
  var avail = this.availableMs[id] || (isFinite(hostAvail) && hostAvail > 0 ? hostAvail : null);
  for (var i = 0; i < x.records.length && i < 200; i++) {
    var r = x.records[i];
    if (!r || typeof r.participantId !== 'string' || seen[r.participantId]) continue;
    seen[r.participantId] = true;
    var base = Object.assign({}, r, { roundInstanceId: id, sessionId: this.sessionId || r.sessionId || '' });
    if (avail) base.availableMs = avail;
    if (r.inputMode === 'tablet' && !r.auto) {
      var mine = own[r.participantId];
      if (mine) {
        if (mine.selectedAnswer !== r.selectedAnswer || mine.responseTimeMs !== r.responseTimeMs) corrected++;
        base.selectedAnswer = mine.selectedAnswer;
        base.receivedAt = mine.receivedAt;
        base.responseTimeMs = mine.responseTimeMs;
        base.deviceId = mine.deviceId;
        base.responseId = mine.responseId;
        if (mine.correctAnswer != null && base.correctAnswer == null) base.correctAnswer = mine.correctAnswer;
        if (r.kind !== 'arcade' && mine.correctAnswer != null) base.outcome = mine.outcome;
      } else {
        base.inputMode = 'manual';
        base.responseTimeMs = null;
        corrected++;
      }
    }
    try { records.push(Session.makeResponse(base)); } catch (e) { return { ok: false, reason: 'bad_record' }; }
  }
  var profileId = Scoring.hasProfile(x.profileId) ? x.profileId : Scoring.DEFAULT_PROFILE;
  /* RC2-A.2: scala del micro-round (coppia Ghigliottina, parola Catena, standard); assente = regole fino alla RC2-A.1 */
  var scale = Scoring.hasScale(x.scale) ? x.scale : null;
  var previousRecords = [];
  /* RC1: con l'orario di apertura del round contano solo le omissioni dei round aperti PRIMA di questo
     (ordine cronologico anche quando il docente riconferma una domanda vecchia), come fa la regia. */
  var openedAt = typeof x.openedAt === 'string' && x.openedAt ? x.openedAt : null;
  Object.keys(this.commits).forEach(function (rid) {
    if (rid === id) return;
    var c = self.commits[rid];
    if (!c || !Array.isArray(c.records)) return;
    if (openedAt && c.openedAt && !(c.openedAt < openedAt)) return;
    if (c.scale && !Scoring.countsOmissions(c.scale, c.profileId)) return;
    previousRecords = previousRecords.concat(c.records);
  });
  var priorOmissions = Session.countOmissions(previousRecords);
  var events = Session.scoreEventsFor(records, profileId, id, { priorOmissions: priorOmissions, freeOmissions: Scoring.DEFAULT_FREE_OMISSIONS, scale: scale || undefined });
  this.commits[id] = { records: records, scoreEvents: events, profileId: profileId, committedAt: this.iso(), openedAt: openedAt, scale: scale };
  events.forEach(function (e) { self.addLog({ event: 'score', roundInstanceId: id, participantId: e.participantId, scoreDelta: e.points }); });
  if (corrected) this.addLog({ event: 'commit.corrected', roundInstanceId: id, reason: corrected + ' record riallineati ai dati del server' });
  return { ok: true, records: records, scoreEvents: events, corrected: corrected };
};

Room.prototype.uncommit = function (id) {
  if (!this.commits[id]) return false;
  delete this.commits[id];
  this.addLog({ event: 'round.reopen', roundInstanceId: id });
  return true;
};

/* ---------------- viste ---------------- */

/** Vista per un dispositivo: MAI la soluzione, mai le risposte degli altri. */
Room.prototype.publicRoundFor = function (deviceId) {
  var r = this.round;
  if (!r) return null;
  var d = this.devices[deviceId];
  var mine = d && d.participantId ? r.responses[d.participantId] : null;
  var out = {
    roundInstanceId: r.roundInstanceId,
    kind: r.kind || 'question',
    gameType: r.gameType || null,
    layout: r.layout,
    letters: r.letters.slice(),
    maxLength: r.maxLength,
    number: r.number,
    total: r.total,
    status: r.status,
    remainingMs: r.status === 'open' ? Math.max(0, r.deadline - this.now()) : r.status === 'paused' ? r.remainingMs : 0,
    myAnswer: mine ? mine.selectedAnswer : null,
    revealed: !!r.revealed
  };
  if (r.revealed && mine) out.myOutcome = mine.outcome;
  if (r.revealed && !mine && d && d.participantId) out.myOutcome = 'omitted';
  return out;
};

Room.prototype.deviceView = function (d) {
  return {
    deviceId: d.deviceId,
    label: d.label,
    number: d.number,
    status: d.status,
    participantId: d.participantId,
    requestedParticipantId: d.requestedParticipantId,
    connected: d.connected,
    rttMs: d.rttMs,
    lastSeen: d.lastSeen,
    userAgent: d.userAgent
  };
};

Room.prototype.devicesView = function () {
  var self = this;
  return Object.keys(this.devices).map(function (id) { return self.deviceView(self.devices[id]); })
    .filter(function (d) { return d.status !== 'kicked'; })
    .sort(function (a, b) { return a.number - b.number; });
};

/** Vista per la regia (fidata): include le risposte del round corrente. */
Room.prototype.hostRoundView = function () {
  var r = this.round;
  if (!r) return null;
  var self = this;
  return {
    roundInstanceId: r.roundInstanceId,
    questionId: r.questionId,
    kind: r.kind || 'question',
    gameType: r.gameType || null,
    layout: r.layout,
    status: r.status,
    revealed: r.revealed,
    remainingMs: r.status === 'open' ? Math.max(0, r.deadline - this.now()) : r.remainingMs,
    responses: Object.keys(r.responses).map(function (k) { return r.responses[k]; }).sort(function (a, b) { return a.seq - b.seq; }),
    openedAt: new Date(r.openedAt).toISOString(),
    graceMs: self.graceMs
  };
};

Room.prototype.teamsForPlayers = function () {
  var self = this;
  return this.participantOrder.map(function (id) { return { id: id, name: self.participants[id].name }; });
};

/* ---------------- persistenza ---------------- */

Room.prototype.toJSON = function () {
  return {
    format: 'secchione-room', version: 1,
    pin: this.pin, createdAt: this.createdAt, joinLocked: this.joinLocked, sessionId: this.sessionId,
    participants: this.participants, participantOrder: this.participantOrder,
    devices: this.devices, deviceSeq: this.deviceSeq,
    round: this.round, usedRoundIds: this.usedRoundIds, availableMs: this.availableMs,
    responses: this.responses, commits: this.commits
  };
};

Room.fromJSON = function (data, opts) {
  var room = new Room(opts);
  if (!data || data.format !== 'secchione-room') return room;
  room.pin = /^\d{4}$/.test(data.pin) ? data.pin : room.pin;
  room.createdAt = data.createdAt || room.createdAt;
  room.joinLocked = !!data.joinLocked;
  room.sessionId = data.sessionId || null;
  room.participants = data.participants || {};
  room.participantOrder = Array.isArray(data.participantOrder) ? data.participantOrder : Object.keys(room.participants);
  room.devices = data.devices || {};
  room.deviceSeq = Number(data.deviceSeq) || 0;
  room.round = data.round || null;
  room.usedRoundIds = data.usedRoundIds || {};
  room.availableMs = data.availableMs || {};
  room.responses = Array.isArray(data.responses) ? data.responses : [];
  room.commits = data.commits || {};
  Object.keys(room.devices).forEach(function (id) { room.devices[id].connected = false; });
  // Dopo un riavvio del server un round aperto viene messo in pausa: decide la regia se riprenderlo.
  if (room.round && room.round.status === 'open') {
    room.round.remainingMs = Math.max(0, room.round.deadline - room.now());
    room.round.pausedAt = room.now();
    room.round.status = room.round.remainingMs > 0 ? 'paused' : 'closed';
  }
  return room;
};

module.exports = { Room: Room, normalizeAnswer: normalizeAnswer, outcomeFor: outcomeFor, LAYOUTS: LAYOUTS, genPin: genPin, rand: rand };
