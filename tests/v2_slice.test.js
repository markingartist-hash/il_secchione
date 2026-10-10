'use strict';
/* REDESIGN V2 (base RC1.5) · vertical slice HOME → REGOLE → DOMANDA → REVEAL → CLASSIFICA ROUND → CLASSIFICA FINALE.
   Verifica che la nuova grafica non tocchi il motore: regole lette dai profili, colori delle lettere distinti dagli esiti,
   caratteri offline con licenza, CSS caricato ovunque si disegna il palco, vittoria solo al 1° posto. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness.js').test;
var RC = require('../js/engine/roundControl.js');
var SS = require('../js/engine/session.js');
var SC = require('../js/engine/scoring.js');

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function extract(names) {
  var src = source('js/app.js');
  return names.map(function (name) {
    var start = src.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione della regia: ' + name);
    var rest = src.slice(start);
    var next = /^(async )?function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}
function rulesCtx(profile) {
  var ctx = { SC: SC, FREE_OMISSIONS: SC.DEFAULT_FREE_OMISSIONS, V2_LOGO: 'logo.svg', V2_SLASH: '', V2_BOLT: '', profileId: function () { return profile; }, mascotMarkup: function () { return '<i class="mascot"></i>'; }, esc: function (x) { return String(x).replace(/</g, '&lt;'); } };
  vm.runInNewContext(extract(['rulesModel', 'rulesHTML']), ctx);
  return ctx;
}
function text(html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }

test('V2 regole: nessun valore del punteggio scritto nel modello; tutto viene dai profili del motore', function () {
  var src = extract(['rulesModel', 'rulesHTML']);
  ['200', '300', '-50', '−50', '-200', '−200', '275', 'PRIME 3', '3 ASTENSIONI', '4ª'].forEach(function (lit) {
    assert.strictEqual(src.indexOf(lit), -1, 'valore fisso nel template delle regole: ' + lit);
  });
  var show = text(rulesCtx('show_standard').rulesHTML());
  var p = SC.getProfile('show_standard');
  assert.ok(show.indexOf('DA ' + SC.signed(p.correct.min) + ' A ' + SC.signed(p.correct.start)) >= 0, show);
  assert.ok(show.indexOf('DA ' + SC.signed(p.wrong.last) + ' A ' + SC.signed(p.wrong.first)) >= 0, show);
  assert.ok(show.indexOf('PRIME ' + SC.DEFAULT_FREE_OMISSIONS) >= 0 && show.indexOf('DALLA ' + (SC.DEFAULT_FREE_OMISSIONS + 1) + 'ª') >= 0, show);
});

test('V2 regole: cambiando profilo (o i suoi numeri) la schermata cambia da sola', function () {
  var learn = text(rulesCtx('learning').rulesHTML());
  assert.ok(/\+1 PUNTO\b/.test(learn) && /NESSUNA PENALITÀ/.test(learn) && /PROFILO DIDATTICO/.test(learn), learn);
  var legacy = text(rulesCtx('legacy_v3').rulesHTML());
  assert.ok(legacy.indexOf('+300 · +275 · +250…') >= 0 && legacy.indexOf(SC.signed(-100)) >= 0, legacy);
  // profilo ipotetico: altri numeri, stessa schermata
  var custom = { id: 'x', label: 'Prova', correct: { mode: 'rank', start: 500, step: 50, min: 350 }, wrong: { mode: 'standing', first: -120, last: -30, roundTo: 5 }, omitted: 0 };
  var ctx = rulesCtx(custom); ctx.FREE_OMISSIONS = 2;
  var t = text(ctx.rulesHTML());
  assert.ok(t.indexOf('DA +350 A +500') >= 0 && t.indexOf('DA ' + SC.signed(-30) + ' A ' + SC.signed(-120)) >= 0 && t.indexOf('PRIME 2') >= 0 && t.indexOf('DALLA 3ª') >= 0, t);
});

test('V2 palette: lettere A ciano, B blu-viola, C arancio, D magenta; lime solo per il corretto e rosso solo per l’errato', function () {
  var tok = source('css/v2-tokens.css'), css = source('css/show-v2.css');
  function v(name) { var m = new RegExp('--v2-' + name + ':(#[0-9A-Fa-f]{6})').exec(tok); assert.ok(m, name); return m[1].toUpperCase(); }
  var letters = ['a', 'b', 'c', 'd'].map(v);
  assert.deepStrictEqual(letters.slice(0, 1).concat(letters.slice(3)), [v('cyan'), v('magenta')]);
  letters.forEach(function (c) { assert.ok(c !== v('lime') && c !== v('red') && c !== v('ok') && c !== v('bad'), 'una lettera usa un colore di esito: ' + c); });
  assert.ok(/\.v2 \.L-A\{--lc:var\(--v2-a\)\}\.v2 \.L-B\{--lc:var\(--v2-b\)\}\.v2 \.L-C\{--lc:var\(--v2-c\)\}\.v2 \.L-D\{--lc:var\(--v2-d\)\}/.test(css));
  // al reveal lo stato sostituisce l'identità della lettera, con simbolo testuale (mai solo colore)
  assert.ok(/\.v2Q \.option\.correct \.v2Letter\{background:var\(--v2-lime\)/.test(css));
  assert.ok(/\.v2Q \.option\.wrong \.v2Letter\{background:transparent/.test(css));
  var q = extract(['questionHTML']);
  assert.ok(q.indexOf("ok?'✓<em> ESATTA</em>':'✗'") >= 0 && q.indexOf('L-${o.letter}') >= 0);
});

test('V2 caratteri: Barlow Condensed e Inter offline con licenza OFL; fallback Segoe UI, Arial', function () {
  var tok = source('css/v2-tokens.css');
  var urls = tok.match(/url\(([^)]+)\)/g).map(function (u) { return u.slice(4, -1); });
  assert.ok(urls.length >= 6);
  urls.forEach(function (u) { assert.ok(!/^https?:/.test(u), 'carattere online: ' + u); assert.ok(fs.existsSync(path.join(ROOT, 'css', u)), 'manca ' + u); });
  ['OFL_BarlowCondensed.txt', 'OFL_Inter.txt'].forEach(function (f) { assert.ok(/SIL OPEN FONT LICENSE Version 1\.1/.test(source('assets/fonts/' + f)), f); });
  assert.ok(/--v2-display:"Barlow Condensed","Segoe UI",Arial,sans-serif/.test(tok) && /--v2-text:"Inter","Segoe UI",Arial,sans-serif/.test(tok));
});

test('V2 CSS: caricato dopo show.css nella regia, in /show e nella finestra del proiettore', function () {
  ['index.html', 'show.html'].forEach(function (f) {
    var h = source(f), a = h.indexOf('css/show.css'), b = h.indexOf('css/v2-tokens.css'), c = h.indexOf('css/show-v2.css');
    assert.ok(a >= 0 && b > a && c > b, f);
  });
  assert.ok(/const hrefs=\['css\/show\.css','css\/v2-tokens\.css','css\/show-v2\.css'\]/.test(source('js/app.js')), 'finestra del proiettore');
  // show.css non viene riscritto: le nuove regole stanno solo sotto .v2
  var css = source('css/show-v2.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\{[^}]*\}/g, '');
  var bare = css.replace(/@keyframes [\w-]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '').match(/(^|\})\s*([^{}@]+)\{/g) || [];
  bare.map(function (s) { return s.replace(/^\}?\s*/, '').replace(/\{$/, ''); }).forEach(function (sel) {
    sel.split(',').forEach(function (one) { assert.ok(/\.v2|\.motionOff/.test(one), 'regola fuori dalla slice: ' + one); });
  });
});

test('V2 logo: vettoriale, senza raster né caratteri esterni; nessun file della mascotte ridisegnato', function () {
  ['logo_v2.svg', 'logo_v2_compact.svg', 'logo_v2_mono.svg', 'logo_v2_micro.svg', 'logo_v2_symbol.svg'].forEach(function (f) {
    var s = source('assets/brand/' + f);
    assert.ok(/^<svg /.test(s) && !/<image|<text|font-family|data:image|href="http/.test(s), f);
  });
  assert.ok(/const V2_LOGO='assets\/brand\/logo_v2\.svg'/.test(source('js/app.js')));
});

test('V2 mascotte: nessuna mascotte nelle domande; HERO e coriandoli solo al 1° posto della finale', function () {
  assert.strictEqual(extract(['questionHTML']).indexOf('mascotMarkup'), -1, 'mascotte nella zona contenuti della domanda');
  var teams = [{ id: 'a', name: 'Alfa', score: 500 }, { id: 'b', name: 'Beta', score: 475 }, { id: 'c', name: 'Gamma', score: 450 }, { id: 'd', name: 'Delta', score: 50 }];
  var s = SS.createSession({}); s.rounds = []; s.responses = [];
  var ctx = { RC: RC, SC: SC, BRAND_LOGO: 'logo.svg', Date: Date, state: { screen: 'leaderboard', teams: teams, session: s, finalReveal: { shown: 0, lastAt: 0 } }, esc: function (x) { return String(x); }, pack: function () { return { title: 'Prova' }; } };
  vm.runInNewContext(extract(['teamOutcomeStats', 'finalStandings', 'leaderboardHTML']), ctx);
  for (var k = 1; k < teams.length; k++) {
    ctx.state.finalReveal.shown = k;
    var h = ctx.leaderboardHTML();
    assert.ok(!/v2Confetti|mascot_celebrate|CAMPIONI/.test(h), 'vittoria prima del 1° posto (' + k + ')');
    assert.ok(/mascot_present/.test(h), 'mascotte SUPPORT durante il reveal');
  }
  ctx.state.finalReveal.shown = teams.length;
  var done = ctx.leaderboardHTML();
  assert.ok(/v2Confetti/.test(done) && /mascot_celebrate/.test(done) && /CAMPIONI/.test(done) && /finalCard podium p1/.test(done));
  ctx.state.finalReveal = null;
  assert.ok(/CAMPIONI!/.test(done) && !/EX AEQUO<\/span>/.test(done) && /soloWin/.test(done), 'vincitore unico');
  ctx.state.finalReveal = null;
  assert.ok(!/v2Confetti|mascot_celebrate/.test(ctx.leaderboardHTML()), 'classifica generale: niente vittoria');
  // più squadre davvero prime: nessun vincitore unico finto
  teams[1].score = 500; ctx.state.finalReveal = { shown: teams.length, lastAt: 0 };
  var tie = ctx.leaderboardHTML();
  assert.ok(/CAMPIONI<br>EX AEQUO/.test(tie) && !/CAMPIONI!/.test(tie) && /tieWin/.test(tie), 'ex aequo esplicito');
  assert.strictEqual((tie.match(/finalCard podium p1/g) || []).length, 2, 'due prime con la stessa grafica');
});
