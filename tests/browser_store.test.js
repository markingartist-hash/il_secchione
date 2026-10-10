'use strict';
/* SessionStore del browser (js/host/store.js) eseguito in Node con localStorage simulato. */
var assert = require('assert');
var path = require('path');
var test = require('./harness.js').test;

function fakeBrowser(initial) {
  var data = Object.assign({}, initial || {});
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
  global.location = { protocol: 'file:' };
  global.document = { querySelector: function () { return null; } };
  var file = path.join(__dirname, '..', 'js', 'host', 'store.js');
  delete require.cache[file];
  var mod = require(file);
  return { store: mod.SecchioneStore, data: data };
}
function cleanup() { delete global.localStorage; delete global.location; delete global.document; }

function snap(id, teams, responses) {
  return { format: 'secchione-snapshot', version: 1, savedAt: new Date().toISOString(), session: { format: 'secchione-session', sessionId: id, status: 'active', participants: teams || [], responses: responses || [], scoreEvents: [] } };
}

test('salva, chiudi, riapri: lo snapshot è ritrovato', function () {
  var b = fakeBrowser();
  try {
    assert.strictEqual(b.store.saveSnapshot(snap('s1', [{ id: 't' }])), true);
    var reopened = fakeBrowser(b.data);
    assert.strictEqual(reopened.store.loadSnapshot().session.sessionId, 's1');
    assert.strictEqual(reopened.store.hasProgress(reopened.store.loadSnapshot()), true);
  } finally { cleanup(); }
});

test('una partita non conclusa NON viene sovrascritta da una nuova finché il docente non sceglie', function () {
  var b = fakeBrowser();
  try {
    b.store.saveSnapshot(snap('vecchia', [{ id: 't' }], [{ responseId: 'r' }]));
    var r = fakeBrowser(b.data);
    assert.strictEqual(r.store.saveSnapshot(snap('nuova', [{ id: 'x' }])), false);
    assert.strictEqual(r.store.loadSnapshot().session.sessionId, 'vecchia');
    r.store.archiveSnapshot(r.store.loadSnapshot());
    assert.strictEqual(r.store.loadSnapshot(), null);
    assert.strictEqual(r.store.listArchive()[0].snapshot.session.sessionId, 'vecchia');
    assert.strictEqual(r.store.listArchive()[0].snapshot.session.status, 'archived');
    assert.strictEqual(r.store.saveSnapshot(snap('nuova', [{ id: 'x' }])), true);
  } finally { cleanup(); }
});

test('riprendi: salvare la stessa sessione è sempre consentito', function () {
  var b = fakeBrowser();
  try {
    b.store.saveSnapshot(snap('s1', [{ id: 't' }]));
    var r = fakeBrowser(b.data);
    assert.strictEqual(r.store.saveSnapshot(snap('s1', [{ id: 't' }], [{ responseId: 'a' }])), true);
    assert.strictEqual(r.store.loadSnapshot().session.responses.length, 1);
  } finally { cleanup(); }
});

test('l\'archivio conserva al massimo 3 partite', function () {
  var b = fakeBrowser();
  try {
    ['a', 'b', 'c', 'd'].forEach(function (id) { b.store.archiveSnapshot(snap(id, [{ id: 't' }])); });
    assert.deepStrictEqual(b.store.listArchive().map(function (x) { return x.snapshot.session.sessionId; }), ['d', 'c', 'b']);
  } finally { cleanup(); }
});
