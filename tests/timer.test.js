'use strict';
var assert = require('assert');
var test = require('./harness.js').test;
var T = require('../js/engine/timer.js');

function near(a, b) { assert.ok(Math.abs(a - b) < 1e-6, a + ' ≠ ' + b); }

test('secondsFor usa il campo seconds della domanda (15, 60) e 30 come predefinito', function () {
  assert.strictEqual(T.secondsFor({ seconds: 15 }), 15);
  assert.strictEqual(T.secondsFor({ seconds: 60 }), 60);
  assert.strictEqual(T.secondsFor({}), 30);
  assert.strictEqual(T.secondsFor({ seconds: 'x' }), 30);
  assert.strictEqual(T.secondsFor({ seconds: 2 }), 5);
  assert.strictEqual(T.secondsFor({ seconds: 9999 }), 600);
});

test('countdown: start e scorrere del tempo', function () {
  var t = T.create(60);
  T.start(t, 1000);
  near(T.remaining(t, 1000), 60);
  near(T.remaining(t, 11000), 50);
  near(T.elapsed(t, 11000), 10);
  assert.strictEqual(T.finished(t, 61000), true);
  near(T.remaining(t, 99999), 0);
});

test('pausa e ripresa: il tempo in pausa non viene consumato', function () {
  var t = T.create(30);
  T.start(t, 0);
  T.pause(t, 10000);
  near(t.remaining, 20);
  assert.strictEqual(t.running, false);
  near(T.remaining(t, 50000), 20);
  T.resume(t, 50000);
  near(T.remaining(t, 55000), 15);
});

test('+10 secondi in corsa e da fermo; la durata cresce con il tempo aggiunto', function () {
  var t = T.create(15);
  T.start(t, 0);
  T.addTime(t, 10, 5000);
  near(T.remaining(t, 5000), 20);
  near(t.duration, 25);
  near(T.elapsed(t, 5000), 5);
  T.pause(t, 6000);
  T.addTime(t, 10, 6000);
  near(t.remaining, 29);
});

test('fine: start su timer esaurito non riparte', function () {
  var t = T.create(5);
  T.start(t, 0);
  T.pause(t, 6000);
  near(t.remaining, 0);
  T.start(t, 7000);
  assert.strictEqual(t.running, false);
});

test('snapshot per autosave: sempre fermo, conserva il residuo', function () {
  var t = T.create(60);
  T.start(t, 0);
  var s = T.snapshot(t, 12000);
  assert.strictEqual(s.running, false);
  assert.strictEqual(s.wasRunning, true);
  near(s.remaining, 48);
});

test('percentuale residua', function () {
  var t = T.create(40);
  T.start(t, 0);
  near(T.percent(t, 10000), 75);
});
