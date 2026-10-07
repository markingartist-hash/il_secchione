/*
 * SessionStore lato server: snapshot JSON su disco con scrittura ATOMICA
 * (file temporaneo + rename). Nessun database. Compatibile Node >= 8.
 *
 * data/
 *   room.json                 stato della stanza (dispositivi, token, round)  — mai servito via HTTP
 *   prefs.json                preferenze/archivi personalizzati della regia
 *   sessions/current.json     ultimo snapshot della partita in corso
 *   sessions/<sessionId>.json copia per sessione
 *   sessions/archive/         partite archiviate
 *   logs/<sessionId>.jsonl    log tecnico (una riga JSON per evento)
 */
'use strict';
var fs = require('fs');
var path = require('path');

function mkdirp(dir) {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  try { fs.mkdirSync(dir); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}

var tmpCounter = 0;
/** Scrive in modo atomico: se il PC si spegne a metà resta il file precedente, mai uno troncato. */
function writeJSONAtomic(file, data) {
  mkdirp(path.dirname(file));
  var tmp = file + '.' + process.pid + '.' + (++tmpCounter) + '.tmp';
  var json = typeof data === 'string' ? data : JSON.stringify(data);
  var fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, json);
    try { fs.fsyncSync(fd); } catch (e) { /* alcuni FS non supportano fsync */ }
  } finally {
    fs.closeSync(fd);
  }
  renameWithRetry(tmp, file);
}

/* Su Windows un antivirus può tenere il file aperto un istante: ritenta il rename. */
function renameWithRetry(from, to) {
  var last;
  for (var i = 0; i < 6; i++) {
    try { fs.renameSync(from, to); return; } catch (e) {
      last = e;
      if (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES') break;
      var until = Date.now() + 25 * (i + 1);
      while (Date.now() < until) { /* attesa breve e sincrona */ }
    }
  }
  try { fs.unlinkSync(from); } catch (e) { /* ignore */ }
  throw last;
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    return fallback;
  }
}

function safeName(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'senza-id';
}

function FileStore(dataDir) {
  this.dir = dataDir;
  mkdirp(path.join(dataDir, 'sessions', 'archive'));
  mkdirp(path.join(dataDir, 'logs'));
}

FileStore.prototype.roomFile = function () { return path.join(this.dir, 'room.json'); };
FileStore.prototype.loadRoom = function () { return readJSON(this.roomFile(), null); };
FileStore.prototype.saveRoom = function (room) { writeJSONAtomic(this.roomFile(), room); };

FileStore.prototype.loadPrefs = function () { return readJSON(path.join(this.dir, 'prefs.json'), null); };
FileStore.prototype.savePrefs = function (prefs) { writeJSONAtomic(path.join(this.dir, 'prefs.json'), prefs); };

/** Salva lo snapshot della regia (stringa JSON già validata dal chiamante). */
FileStore.prototype.saveSnapshot = function (snap) {
  var json = typeof snap === 'string' ? snap : JSON.stringify(snap);
  var obj = typeof snap === 'string' ? JSON.parse(snap) : snap;
  var id = safeName(obj && obj.session && obj.session.sessionId);
  writeJSONAtomic(path.join(this.dir, 'sessions', id + '.json'), json);
  writeJSONAtomic(path.join(this.dir, 'sessions', 'current.json'), json);
  return id;
};

FileStore.prototype.loadSnapshot = function () {
  var s = readJSON(path.join(this.dir, 'sessions', 'current.json'), null);
  return s && s.session && s.session.status === 'active' ? s : null;
};

FileStore.prototype.archiveSnapshot = function (snap) {
  var obj = typeof snap === 'string' ? JSON.parse(snap) : snap;
  if (!obj || !obj.session) return null;
  obj.session.status = 'archived';
  var id = safeName(obj.session.sessionId);
  var stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeJSONAtomic(path.join(this.dir, 'sessions', 'archive', stamp + '_' + id + '.json'), obj);
  var cur = readJSON(path.join(this.dir, 'sessions', 'current.json'), null);
  if (cur && cur.session && cur.session.sessionId === obj.session.sessionId) {
    try { fs.unlinkSync(path.join(this.dir, 'sessions', 'current.json')); } catch (e) { /* ignore */ }
  }
  return id;
};

FileStore.prototype.appendLog = function (sessionId, entry) {
  try {
    fs.appendFileSync(path.join(this.dir, 'logs', safeName(sessionId || 'senza-sessione') + '.jsonl'), JSON.stringify(entry) + '\n');
  } catch (e) { /* il log non deve mai bloccare il gioco */ }
};

FileStore.prototype.readLog = function (sessionId, limit) {
  var file = path.join(this.dir, 'logs', safeName(sessionId || 'senza-sessione') + '.jsonl');
  if (!fs.existsSync(file)) return [];
  var lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  if (limit && lines.length > limit) lines = lines.slice(-limit);
  return lines.map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
};

module.exports = { FileStore: FileStore, writeJSONAtomic: writeJSONAtomic, readJSON: readJSON, mkdirp: mkdirp, safeName: safeName };
