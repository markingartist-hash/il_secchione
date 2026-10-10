'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var srv = require('../server/server.js');
var ws = require('../tools/ws_client.js');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) {
    fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); });
    fs.rmdirSync(p);
  } else fs.unlinkSync(p);
}

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'secchione-test-')); }

/** Avvia un server su porta libera con dati in una cartella temporanea. */
function startServer(opts) {
  var o = Object.assign({ quiet: true, dataDir: tempDir(), pingIntervalMs: 60000 }, opts || {});
  var app = srv.createServer(o);
  return new Promise(function (resolve) {
    app.listen(0, '0.0.0.0', function (port) {
      app.base = 'http://127.0.0.1:' + port;
      app.wsUrl = 'ws://127.0.0.1:' + port + '/ws';
      app.dataDir = o.dataDir;
      resolve(app);
    });
  });
}

function stopServer(app, keepData) {
  return new Promise(function (resolve) { app.close(function () { if (!keepData) rmrf(app.dataDir); resolve(); }); });
}

function get(url, opts) {
  return new Promise(function (resolve, reject) {
    var u = new (require('url').URL)(url);
    var req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: (opts && opts.method) || 'GET', headers: (opts && opts.headers) || {}, localAddress: opts && opts.localAddress }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body, headers: res.headers }); });
    });
    req.on('error', reject);
    if (opts && opts.body) req.write(opts.body);
    req.end();
  });
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/** Regia collegata + N pulsantiere assegnate a N squadre. */
async function classroom(app, n) {
  var host = await ws.open(app.wsUrl);
  var teams = [];
  for (var i = 0; i < n; i++) teams.push({ id: 'team-' + i, name: 'S' + (i + 1), type: 'team' });
  host.sendJSON({ type: 'hello', role: 'host', hostKey: app.hostKey, sessionId: 'sess-test', participants: teams });
  var state = await host.waitFor(function (m) { return m.type === 'room.state'; }, 3000, true);
  var players = [];
  for (var k = 0; k < n; k++) {
    var p = await ws.open(app.wsUrl);
    p.sendJSON({ type: 'hello', role: 'player', pin: state.room.pin });
    var w = await p.waitFor(function (m) { return m.type === 'welcome'; }, 3000, true);
    p.deviceId = w.deviceId;
    p.team = teams[k];
    players.push(p);
  }
  for (var j = 0; j < n; j++) {
    var pl = players[j];
    var before = pl.messages.length;
    host.sendJSON({ type: 'device.assign', deviceId: pl.deviceId, participantId: pl.team.id });
    var aw = await pl.waitFor(function (m) { return m.type === 'welcome' && m.status === 'assigned'; }, 3000);
    pl.deviceToken = aw.deviceToken;
    void before;
  }
  return { host: host, players: players, teams: teams, pin: state.room.pin };
}

module.exports = { startServer: startServer, stopServer: stopServer, get: get, wait: wait, classroom: classroom, rmrf: rmrf, tempDir: tempDir, ws: ws };
