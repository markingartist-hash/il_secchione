'use strict';
/* Mascotte animata (v3.5.4): asset invariati, mappatura umore → posa coerente tra regia e SHOW, animazioni solo transform/opacity,
   movimento ridotto, Player senza mascotte, immagini servite anche ai dispositivi in rete. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
var test = require('./harness.js').test;
var H = require('./helpers.js');

var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex'); }

/* WebP consegnati in SECCHIONE_MASCOT_ANIMATED_ASSETS_FOR_CLAUDE.zip (assets_optimized/): devono restare identici */
var WEBP = {
  'mascot_present.webp': 'dee2612aadf448803f81a2141af05749b2cf47c3254b36ec1f2a6c77b037e927',
  'mascot_think.webp': '1538c4b138d532a03b4b19ebc72945eecfef3b566ece26ed6fdb0ecb849b34cd',
  'mascot_celebrate.webp': '1c3d681c4fa170a6570b5894e66820c7c2abfeb9bb5ae3d44d9e31062f585924',
  'mascot_panic.webp': '416d7f8017ae389dfef3614fb98642c560f872e7f361a8f2972b51239d75c4e4'
};
var POSES = { present: 'assets/mascot/mascot_present.webp', think: 'assets/mascot/mascot_think.webp', celebrate: 'assets/mascot/mascot_celebrate.webp', panic: 'assets/mascot/mascot_panic.webp' };
var EXPECTED_MOOD = { welcome: POSES.present, reveal: POSES.present, think: POSES.think, celebrate: POSES.celebrate, panic: POSES.panic };

/** Valuta in una sandbox le dichiarazioni `const NOME=...;` (una riga) di js/app.js. */
function appConsts(names) {
  var src = read('js/app.js');
  var code = names.map(function (n) {
    var m = new RegExp('^const ' + n + '=.*;$', 'm').exec(src);
    assert.ok(m, 'dichiarazione ' + n + ' non trovata in js/app.js');
    return m[0];
  }).join('\n') + '\n;JSON.stringify({' + names.join(',') + '})';
  return JSON.parse(vm.runInNewContext(code, {}));
}

test('mascotte: i 4 WebP sono quelli forniti (non ridisegnati), validi e leggeri; i PNG master stanno fuori dal runtime', function () {
  var manifest = JSON.parse(read('assets/sorgenti_grafiche/mascotte_animata/mascot_manifest.json'));
  Object.keys(WEBP).forEach(function (f) {
    var b = fs.readFileSync(path.join(ROOT, 'assets/mascot', f));
    assert.strictEqual(b.toString('ascii', 0, 4), 'RIFF', f);
    assert.strictEqual(b.toString('ascii', 8, 12), 'WEBP', f);
    assert.ok(b.length < 300 * 1024, f + ' oltre 300 KB');
    var state = f.replace(/^mascot_|\.webp$/g, '');
    assert.strictEqual(manifest.states[state].asset, f, 'manifest: ' + state);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/sorgenti_grafiche/mascotte_animata', f.replace('.webp', '.png'))), 'PNG master di ' + f);
    assert.ok(!fs.existsSync(path.join(ROOT, 'assets/mascot', f.replace('.webp', '.png'))), 'PNG master nel percorso runtime: ' + f);
    assert.strictEqual(sha('assets/mascot/' + f), WEBP[f], f + ' diverso da quello fornito');
  });
});

test('mascotte: mappatura umore → posa identica in regia (app.js) e SHOW (show-client.js), come da specifica', function () {
  var c = appConsts(['MASCOT_ASSETS', 'MASCOT_A', 'MASCOT_POSES', 'MOOD_SRC']);
  assert.deepStrictEqual(c.MASCOT_ASSETS, POSES);
  assert.deepStrictEqual(c.MOOD_SRC, EXPECTED_MOOD);
  assert.strictEqual(c.MASCOT_A, POSES.present);
  // le vecchie "pose" sono alias delle 4 reali: nessun file riciclato fuori da queste
  Object.keys(c.MASCOT_POSES).forEach(function (k) { assert.ok(Object.keys(POSES).some(function (p) { return POSES[p] === c.MASCOT_POSES[k]; }), 'posa ' + k); });
  assert.strictEqual(c.MASCOT_POSES.champion, POSES.celebrate);
  assert.strictEqual(c.MASCOT_POSES.point, POSES.present);
  assert.strictEqual(c.MASCOT_POSES.present, POSES.present);
  assert.strictEqual(c.MASCOT_POSES.think, POSES.think);
  var show = read('js/show-client.js');
  var m = /var MOOD_SRC = (\{[^}]*\});/.exec(show);
  assert.ok(m, 'MOOD_SRC dello SHOW');
  assert.deepStrictEqual(JSON.parse(vm.runInNewContext('JSON.stringify(' + m[1] + ')', {})), EXPECTED_MOOD, 'SHOW allineato alla regia');
  // ogni umore che currentMood() può restituire ha la sua immagine
  var fn = /function currentMood\(\)\{[^\n]*\}/.exec(read('js/app.js'))[0];
  var moods = (fn.match(/'(\w+)'/g) || []).map(function (s) { return s.slice(1, -1); }).filter(function (s) { return EXPECTED_MOOD[s] || ['leaderboard', 'question', 'arcade', 'indovina'].indexOf(s) < 0; });
  ['welcome', 'think', 'reveal', 'celebrate', 'panic'].forEach(function (k) { assert.ok(moods.indexOf(k) >= 0, 'currentMood non produce ' + k); });
  moods.forEach(function (k) { assert.ok(EXPECTED_MOOD[k], 'umore senza immagine: ' + k); });
  Object.keys(POSES).forEach(function (k) { assert.ok(fs.existsSync(path.join(ROOT, POSES[k])), 'manca ' + POSES[k]); });
  // nessun riferimento rimasto ai vecchi PNG nel palco (regia, SHOW, transizioni)
  ['js/app.js', 'js/show-client.js', 'index.html', 'show.html'].forEach(function (f) { assert.ok(!/secchione_[ab]\.png/.test(read(f)), f); });
});

test('mascotte: panic solo a tempo scaduto (evento globale), mai per l\'esito di una squadra', function () {
  var src = read('js/app.js');
  var fn = /function mascotTimeUp\(\)\{[^\n]*\}/.exec(src);
  var watch = /function mascotWatchTimer\(\)\{[^\n]*\}/.exec(src);
  assert.ok(fn && watch, 'mascotTimeUp / mascotWatchTimer');
  assert.ok(/state\.timer\.remaining<=0/.test(fn[0]) && /!state\.timer\.running/.test(fn[0]), 'legata allo scadere del timer');
  // evento: il timer correva ed è arrivato a zero (pausa o chiusura anticipata del docente: remaining > 0, nessun panico)
  assert.ok(/mascotWasRunning&&!run&&state\.timer\.duration>0&&state\.timer\.remaining<=0/.test(watch[0]), 'transizione corsa → zero');
  assert.ok(/mascotPanicUntil=performance\.now\(\)\+1400/.test(watch[0]), 'panico breve, poi la regola esistente (soluzione)');
  [fn[0], watch[0]].forEach(function (t) { assert.ok(!/pending|outcome|correct|wrong|teams|answer/.test(t), 'nessun esito per squadra'); });
  var mood = /function currentMood\(\)\{[^\n]*\}/.exec(src)[0];
  assert.ok(mood.indexOf("'celebrate'") < mood.indexOf("mascotTimeUp()?'panic'"), 'i punti assegnati (celebrate) restano prioritari');
  assert.ok(mood.indexOf("mascotTimeUp()?'panic'") < mood.indexOf("'reveal'"), 'il panico precede per un attimo la soluzione');
  assert.ok(/^function animateMascots\(\)\{mascotWatchTimer\(\);/m.test(src), 'l\'evento si osserva dal ciclo esistente della mascotte');
});

test('mascotte: animazioni solo transform/opacity, durate della specifica, one-shot ripetibili, movimento ridotto', function () {
  var css = read('css/show.css');
  var block = css.slice(css.indexOf('/* ===== Mascotte animata v3.5.4'));
  assert.ok(block.length > 200, 'blocco CSS della mascotte');
  ['mascotIntro', 'mascotFloat', 'mascotThinkSoft', 'mascotJump', 'mascotPanic', 'mascotShadowFloat'].forEach(function (k) {
    var m = new RegExp('@keyframes ' + k + '\\{((?:[^{}]*\\{[^{}]*\\})+)\\}').exec(block);
    assert.ok(m, 'keyframes ' + k);
    var props = (m[1].match(/[a-z-]+(?=:)/g) || []).filter(function (p, i, a) { return a.indexOf(p) === i; });
    props.forEach(function (p) { assert.ok(p === 'transform' || p === 'opacity', k + ' anima ' + p); });
  });
  function rule(sel) { var i = block.indexOf(sel + '{'); assert.ok(i >= 0, 'regola ' + sel); return block.slice(i, block.indexOf('}', i)); }
  assert.ok(/mascotIntro \.42s .*both,mascotFloat 2\.8s/.test(rule('.mascotPlay.mood-welcome .publicHostMascot,.mascotPlay.mood-reveal .publicHostMascot')), 'present: ingresso 420 ms + float 2,8 s');
  assert.ok(/mascotThinkSoft 2\.6s/.test(rule('.mood-think .publicHostMascot,.urgentMascot .publicHostMascot')), 'think 2,6 s, anche negli ultimi 10 s');
  assert.ok(/mascotJump \.7s/.test(rule('.mascotPlay.mood-celebrate .publicHostMascot')) && !/infinite/.test(rule('.mascotPlay.mood-celebrate .publicHostMascot')), 'celebrate one-shot 700 ms');
  assert.ok(/mascotPanic \.5s/.test(rule('.mascotPlay.mood-panic .publicHostMascot')) && !/infinite/.test(rule('.mascotPlay.mood-panic .publicHostMascot')), 'panic one-shot 500 ms');
  assert.ok(/animation:none/.test(rule('.mood-celebrate .publicHostMascot')) && /animation:none/.test(rule('.mood-panic .publicHostMascot')), 'senza evento nuovo la posa resta ferma (nessuna scossa ripetuta)');
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{\.mascotStage,\.mascotStage \*\{animation:none!important/.test(block), 'prefers-reduced-motion');
  assert.ok(/will-change:transform/.test(rule('.publicHostMascot')) && !/\*\{[^}]*will-change/.test(block), 'will-change solo sulla mascotte');
  assert.ok(/pointer-events:none/.test(rule('.mascotStage')) && /user-select:none/.test(rule('.mascotStage')));
  // retrigger: la regia toglie e rimette la classe con un reflow; lo SHOW fa lo stesso
  assert.ok(/function replayMascot\(el,mood\)\{el\.className='mascotStage';void el\.offsetWidth;el\.className='mascotStage mascotPlay mood-'\+mood\}/.test(read('js/app.js')));
  assert.ok(/void el\.offsetWidth;\s*el\.className = 'mascotStage mascotPlay mood-' \+ timer\.mood;/.test(read('js/show-client.js')));
  // nessuna risorsa esterna o libreria di animazione
  [block, read('js/show-client.js')].forEach(function (t) { assert.ok(!/https?:\/\//.test(t.replace(/\/\*[\s\S]*?\*\//g, '')), 'riferimento esterno'); });
});

test('mascotte: il Player (pulsantiera) non ha mascotte né animazioni nuove', function () {
  ['player.html', 'js/player.js', 'css/player.css'].forEach(function (f) {
    var t = read(f);
    assert.ok(!/mascot/i.test(t), f + ' cita la mascotte');
    assert.ok(!/mascotPlay|mascotIntro|mascotJump|mascotPanic/.test(t), f);
  });
});

test('mascotte: le 4 pose sono servite dal server anche ai dispositivi in rete (SHOW), senza 404', async function () {
  var dir = H.tempDir();
  fs.mkdirSync(path.join(dir, 'packs'));
  var app = await H.startServer({ packsDir: path.join(dir, 'packs') });
  try {
    var hosts = ['127.0.0.1'];
    var lan = require('../server/netinfo.js').lanAddresses()[0];
    if (lan) hosts.push(lan.address);
    for (var h = 0; h < hosts.length; h++) {
      for (var k in POSES) {
        var r = await H.get('http://' + hosts[h] + ':' + app.port + '/' + POSES[k], hosts[h] === '127.0.0.1' ? {} : { localAddress: hosts[h] });
        assert.strictEqual(r.status, 200, hosts[h] + ' ' + POSES[k]);
      }
    }
    var show = await H.get(app.base + '/show');
    assert.strictEqual(show.status, 200);
    assert.ok(show.body.indexOf('assets/mascot/mascot_present.webp') > 0, 'transizione dello SHOW con la nuova posa');
    var master = await H.get(app.base + '/assets/sorgenti_grafiche/mascotte_animata/mascot_present.png');
    assert.strictEqual(master.status, 200, 'master consultabili dal PC del docente');
    if (lan) assert.strictEqual((await H.get('http://' + lan.address + ':' + app.port + '/assets/sorgenti_grafiche/mascotte_animata/mascot_present.png', { localAddress: lan.address })).status, 403, 'i master non sono pubblicati in rete');
  } finally { await H.stopServer(app); H.rmrf(dir); }
});
