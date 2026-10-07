/* Mini test runner senza dipendenze (compatibile Node >= 8). */
'use strict';
var tests = [];
var currentFile = '';

function test(name, fn, opts) {
  tests.push({ file: currentFile, name: name, fn: fn, timeout: (opts && opts.timeout) || 15000 });
}

function setFile(f) { currentFile = f; }

function withTimeout(promise, ms, name) {
  var timer;
  return Promise.race([
    promise,
    new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('timeout dopo ' + ms + ' ms: ' + name)); }, ms); })
  ]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
}

async function run(filter) {
  var passed = 0;
  var failed = [];
  var lastFile = '';
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    if (filter && (t.file + ' ' + t.name).toLowerCase().indexOf(filter.toLowerCase()) < 0) continue;
    if (t.file !== lastFile) { console.log('\n' + t.file); lastFile = t.file; }
    var started = Date.now();
    try {
      await withTimeout(Promise.resolve().then(function () { return t.fn(); }), t.timeout, t.name);
      passed++;
      console.log('  ✓ ' + t.name + ' (' + (Date.now() - started) + ' ms)');
    } catch (e) {
      failed.push({ t: t, e: e });
      console.log('  ✗ ' + t.name);
      console.log('    ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n    '));
    }
  }
  console.log('\n' + passed + ' superati, ' + failed.length + ' falliti');
  return failed.length;
}

module.exports = { test: test, run: run, setFile: setFile, tests: tests };
