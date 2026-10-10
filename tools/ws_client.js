/*
 * Client WebSocket minimale per Node (test e simulazione). Nessuna dipendenza, Node >= 8.
 *   var c = new WsClient('http://127.0.0.1:8765/ws'); c.on('open'|'message'|'close', ...); c.sendJSON({...})
 */
'use strict';
var http = require('http');
var crypto = require('crypto');
var EventEmitter = require('events');
var util = require('util');
var URL_ = require('url').URL;

function WsClient(url, opts) {
  EventEmitter.call(this);
  var self = this;
  var u = new URL_(url);
  var key = crypto.randomBytes(16).toString('base64');
  this.closed = false;
  this.buffer = Buffer.alloc(0);
  this.messages = [];
  var req = http.request({
    host: u.hostname, port: u.port, path: u.pathname + u.search,
    localAddress: opts && opts.localAddress,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' }
  });
  req.on('upgrade', function (res, socket, head) {
    self.socket = socket;
    socket.setNoDelay(true);
    socket.on('data', function (d) { self._onData(d); });
    socket.on('close', function () { self._closed(); });
    socket.on('error', function () { self._closed(); });
    if (head && head.length) self._onData(head);
    self.emit('open');
  });
  req.on('response', function (res) { self.emit('error', new Error('upgrade rifiutato: ' + res.statusCode)); self._closed(); });
  req.on('error', function (e) { self.emit('error', e); self._closed(); });
  req.end();
}
util.inherits(WsClient, EventEmitter);

WsClient.prototype._onData = function (chunk) {
  this.buffer = Buffer.concat([this.buffer, chunk]);
  for (;;) {
    var b = this.buffer;
    if (b.length < 2) return;
    var opcode = b[0] & 0x0f;
    var len = b[1] & 0x7f;
    var off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = b.readUInt32BE(6); off = 10; }
    if (b.length < off + len) return;
    var payload = b.slice(off, off + len);
    this.buffer = b.slice(off + len);
    if (opcode === 0x1) {
      var text = payload.toString('utf8');
      var msg = null;
      try { msg = JSON.parse(text); } catch (e) { /* testo libero */ }
      this.messages.push(msg);
      this.emit('message', msg, text);
    } else if (opcode === 0x9) {
      this._frame(0xA, payload);
    } else if (opcode === 0x8) {
      this._closed();
      return;
    }
  }
};

WsClient.prototype._frame = function (opcode, payload) {
  if (this.closed || !this.socket) return;
  var len = payload.length;
  var header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  header[0] = 0x80 | opcode;
  var mask = crypto.randomBytes(4);
  var masked = Buffer.alloc(len);
  for (var i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  this.socket.write(Buffer.concat([header, mask, masked]));
};

WsClient.prototype.sendJSON = function (obj) { this._frame(0x1, Buffer.from(JSON.stringify(obj), 'utf8')); };
WsClient.prototype.sendRaw = function (text) { this._frame(0x1, Buffer.from(String(text), 'utf8')); };
WsClient.prototype.close = function () { if (this.closed) return; try { this._frame(0x8, Buffer.from([0x03, 0xE8])); this.socket.end(); } catch (e) { /* ignore */ } this._closed(); };
WsClient.prototype.destroy = function () { try { this.socket.destroy(); } catch (e) { /* ignore */ } this._closed(); };
WsClient.prototype._closed = function () { if (this.closed) return; this.closed = true; this.emit('close'); };

/** Attende il primo messaggio che soddisfa il predicato (anche se già arrivato, se fromStart). */
WsClient.prototype.waitFor = function (pred, timeoutMs, fromStart) {
  var self = this;
  return new Promise(function (resolve, reject) {
    if (fromStart) {
      for (var i = 0; i < self.messages.length; i++) if (self.messages[i] && pred(self.messages[i])) return resolve(self.messages[i]);
    }
    var to = setTimeout(function () { self.removeListener('message', onMsg); reject(new Error('timeout in attesa di un messaggio')); }, timeoutMs || 3000);
    function onMsg(m) { if (m && pred(m)) { clearTimeout(to); self.removeListener('message', onMsg); resolve(m); } }
    self.on('message', onMsg);
  });
};

function open(url, opts) {
  return new Promise(function (resolve, reject) {
    var c = new WsClient(url, opts);
    c.once('open', function () { resolve(c); });
    c.once('error', reject);
  });
}

module.exports = { WsClient: WsClient, open: open };
