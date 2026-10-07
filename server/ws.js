/*
 * WebSocket minimale (RFC 6455) senza dipendenze, compatibile Node >= 8.
 * Solo messaggi di testo, frammentazione, ping/pong (misura RTT), chiusura.
 * Usato dal server locale e dagli strumenti di test (lato client in tools/ws_client.js).
 */
'use strict';
var crypto = require('crypto');
var EventEmitter = require('events');
var util = require('util');

var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function WsConnection(socket, opts) {
  EventEmitter.call(this);
  var o = opts || {};
  this.socket = socket;
  this.maxPayload = o.maxPayload || 64 * 1024;
  this.buffer = Buffer.alloc(0);
  this.fragments = [];
  this.fragLen = 0;
  this.fragOpcode = 0;
  this.closed = false;
  this.isAlive = true;
  this.rttMs = null;
  this.meta = {};
  var self = this;
  socket.setNoDelay(true);
  socket.setTimeout(0);
  socket.on('data', function (d) { self._onData(d); });
  socket.on('end', function () { self._onClose(); });
  socket.on('close', function () { self._onClose(); });
  socket.on('error', function () { self._onClose(); });
}
util.inherits(WsConnection, EventEmitter);

WsConnection.prototype._onData = function (chunk) {
  if (this.closed) return;
  this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
  while (!this.closed && this._parseFrame()) { /* continua */ }
};

WsConnection.prototype._parseFrame = function () {
  var b = this.buffer;
  if (b.length < 2) return false;
  var fin = (b[0] & 0x80) !== 0;
  var opcode = b[0] & 0x0f;
  var masked = (b[1] & 0x80) !== 0;
  var len = b[1] & 0x7f;
  var off = 2;
  if (len === 126) {
    if (b.length < 4) return false;
    len = b.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (b.length < 10) return false;
    if (b.readUInt32BE(2) !== 0) { this.close(1009, 'troppo grande'); return false; }
    len = b.readUInt32BE(6);
    off = 10;
  }
  if (len > this.maxPayload) { this.close(1009, 'messaggio troppo grande'); return false; }
  if (!masked) { this.close(1002, 'frame non mascherato'); return false; }
  if (b.length < off + 4 + len) return false;
  var mask = b.slice(off, off + 4);
  off += 4;
  var payload = Buffer.allocUnsafe(len);
  for (var i = 0; i < len; i++) payload[i] = b[off + i] ^ mask[i & 3];
  this.buffer = b.slice(off + len);
  this._handleFrame(fin, opcode, payload);
  return true;
};

WsConnection.prototype._handleFrame = function (fin, opcode, payload) {
  if (opcode === 0x8) {
    this._sendFrame(0x8, payload.length >= 2 ? payload.slice(0, 2) : Buffer.alloc(0));
    this._end();
    return;
  }
  if (opcode === 0x9) { this._sendFrame(0xA, payload); return; }
  if (opcode === 0xA) {
    this.isAlive = true;
    var t = Number(payload.toString());
    if (t) this.rttMs = Math.max(0, Date.now() - t);
    this.emit('pong', this.rttMs);
    return;
  }
  if (opcode === 0x1 || opcode === 0x2) {
    if (fin) this._message(opcode, payload);
    else { this.fragments = [payload]; this.fragOpcode = opcode; this.fragLen = payload.length; }
    return;
  }
  if (opcode === 0x0) {
    if (!this.fragments.length) { this.close(1002, 'continuazione inattesa'); return; }
    this.fragments.push(payload);
    this.fragLen += payload.length;
    if (this.fragLen > this.maxPayload) { this.close(1009, 'messaggio troppo grande'); return; }
    if (fin) {
      var all = Buffer.concat(this.fragments);
      this.fragments = [];
      this.fragLen = 0;
      this._message(this.fragOpcode, all);
    }
    return;
  }
  this.close(1002, 'opcode non valido');
};

WsConnection.prototype._message = function (opcode, payload) {
  if (opcode === 0x1) this.emit('message', payload.toString('utf8'));
};

WsConnection.prototype._sendFrame = function (opcode, payload) {
  if (this.closed || this.socket.destroyed) return false;
  var len = payload.length;
  var header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  header[0] = 0x80 | opcode;
  try { this.socket.write(Buffer.concat([header, payload])); return true; } catch (e) { this._onClose(); return false; }
};

WsConnection.prototype.send = function (text) {
  return this._sendFrame(0x1, Buffer.from(String(text), 'utf8'));
};

WsConnection.prototype.sendJSON = function (obj) {
  return this.send(JSON.stringify(obj));
};

/** Ping di protocollo: il browser risponde da solo con un pong, così misuriamo l'RTT senza codice lato client. */
WsConnection.prototype.ping = function () {
  this.isAlive = false;
  this._sendFrame(0x9, Buffer.from(String(Date.now())));
};

WsConnection.prototype.close = function (code, reason) {
  if (this.closed) return;
  var r = Buffer.from(String(reason || '').slice(0, 100), 'utf8');
  var p = Buffer.alloc(2 + r.length);
  p.writeUInt16BE(code || 1000, 0);
  r.copy(p, 2);
  this._sendFrame(0x8, p);
  this._end();
};

WsConnection.prototype._end = function () {
  if (this.closed) return;
  this.closed = true;
  var s = this.socket;
  try { s.end(); } catch (e) { /* ignore */ }
  setTimeout(function () { try { s.destroy(); } catch (e) { /* ignore */ } }, 1000);
  this.emit('close');
};

WsConnection.prototype._onClose = function () {
  if (this.closed) return;
  this.closed = true;
  try { this.socket.destroy(); } catch (e) { /* ignore */ }
  this.emit('close');
};

WsConnection.prototype.terminate = function () { this._onClose(); };

/** Completa l'handshake HTTP Upgrade. Restituisce la connessione o null. */
function handleUpgrade(req, socket, head, opts) {
  var key = req.headers['sec-websocket-key'];
  var upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (!key || upgrade !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
    try { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch (e) { /* ignore */ }
    return null;
  }
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n');
  var conn = new WsConnection(socket, opts);
  if (head && head.length) conn._onData(head);
  return conn;
}

module.exports = { handleUpgrade: handleUpgrade, WsConnection: WsConnection, acceptKey: acceptKey };
