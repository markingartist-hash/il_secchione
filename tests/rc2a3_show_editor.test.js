'use strict';
/* RC2-A.3 SHOW UX + FASE B1 — tendina persistente controllata dal docente (nessuna esposizione anticipata sul proiettore),
   layout dedicati dei giochi senza mascotte, editor dei giochi da zero in Pack Studio (Abbinamento con voci e coppie,
   Indovina, Photopuzzle), salvataggio e riapertura, compatibilità dei pacchetti. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness.js').test;
var SC = require('../js/engine/scoring.js');
var RC = require('../js/engine/roundControl.js');
var PS = require('../js/engine/packstudio.js');
var PL = require('../js/engine/packlib.js');
var PE = require('../js/engine/packs.js');

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var APP = source('js/app.js');
var CSS = source('css/show.css');
var JPG = new Uint8Array(fs.readFileSync(path.join(ROOT, 'packs/arte_romana/images/arco.jpg')));
var JPG2 = new Uint8Array(fs.readFileSync(path.join(ROOT, 'packs/arte_romana/images/colosseo.jpg')));
var TYPES = ['photopuzzle', 'indovina', 'abbinamenti', 'ghigliottina', 'chain'];
function extract(names) {
  return names.map(function (name) {
    var start = APP.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione: ' + name);
    var rest = APP.slice(start);
    var next = /^(async )?function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}
function constBlock(name) { var s = APP.indexOf('const ' + name + '='); assert.ok(s >= 0, name); return APP.slice(s, APP.indexOf('\n', s)); }
function constUntilFunction(name) { var s = APP.indexOf('const ' + name + '='); return APP.slice(s, APP.indexOf('\nfunction ', s)); }

/* ---------------- 1. tendina persistente ---------------- */
function curtainCtx(bound) {
  var calls = [];
  var ctx = {
    SC: SC, BRAND_LOGO: 'logo.svg', calls: calls, esc: function (x) { return String(x == null ? '' : x); },
    state: { screen: 'arcade', arcade: null }, NET: { boundTeamIds: function () { return bound || {}; } },
    profileId: function () { return 'show_speed'; }, homeHTML: function () { return 'HOME'; },
    gameName: function (t) { return { photopuzzle: 'Photopuzzle', indovina: 'Indovina', abbinamenti: 'Abbinamenti', ghigliottina: 'Parola Segreta', chain: 'Staffetta di parole' }[t]; },
    gameResultsHTML: function () { return 'RISULTATO'; },
    arcadeBoardHTML: function (a) { return '<div class="gameScreen">CONTENUTO-SEGRETO ' + a.type + '</div>'; },
    renderAll: function () { calls.push('render'); }, autosave: function () {}, logEvent: function (e) { calls.push(e.event); }, toast: function (m) { calls.push('toast:' + m); }
  };
  vm.runInNewContext(constBlock('GAME_GLYPH') + '\n' + constUntilFunction('GAME_INTRO') + '\n' + extract(['speedProfile', 'gameScoreLines', 'gameCurtainHTML', 'arcadeHTML', 'curtainOff', 'curtainOn', 'curtainToggle']), ctx);
  return ctx;
}
test('RC2-A.3 tendina: vero stato del gioco, attivata alla scelta del gioco, tolta solo dal docente (AVVIA o TOGLI TENDINA)', function () {
  /* RC2-A.3.1: la vecchia verifica certificava l'ordine sbagliato (tendina accesa DOPO il primo render di loadArcadePreset).
     Ora la tendina è nell'oggetto iniziale, prima di qualunque render, e il gioco non ha una transizione temporanea. Il flusso vero è provato in browser da tests/e2e/curtain_hold.cjs. */
  var sa = extract(['startArcade']);
  assert.ok(/state\.arcade=\{type,presetIndex:0,scoreCommitted:false,curtain:true\};clearPending\(\);loadArcadePreset\(0,false\);/.test(sa), 'tendina attiva prima del primo render');
  assert.ok(sa.indexOf('curtain:true') < sa.indexOf('loadArcadePreset('), 'ordine: tendina, poi caricamento della manche');
  assert.ok(!/showTransition/.test(sa), 'nessuna transizione temporanea all’avvio del gioco');
  assert.ok(/function arcadeStartRound\(\)\{const a=state\.arcade;a\.curtain=false;/.test(APP), 'AVVIA la toglie');
  assert.ok(!/setTimeout\([^)]*curtain/.test(APP), 'nessun timer la fa sparire da sola');
  assert.ok(!/function loadArcadePreset[^\n]*curtain=/.test(APP), 'cambiare manche (immagini, parole) non tocca la tendina');
  assert.ok(/else if\(e\.key==='t'\|\|e\.key==='T'\)\{curtainToggle\(\)\}/.test(APP), 'tasto T');
  var ctx = curtainCtx();
  ctx.state.arcade = { type: 'indovina', curtain: true, started: false };
  ctx.curtainOff();
  assert.strictEqual(ctx.state.arcade.curtain, false);
  ctx.curtainOn();
  assert.strictEqual(ctx.state.arcade.curtain, true, 'MOSTRA TENDINA la rimette');
  ctx.curtainToggle(); ctx.curtainToggle();
  assert.strictEqual(ctx.state.arcade.curtain, true);
  ctx.state.arcade = { type: 'indovina', curtain: false, started: true };
  ctx.curtainOn();
  assert.strictEqual(ctx.state.arcade.curtain, false, 'mai sopra una manche col tempo che scorre');
  assert.ok(ctx.calls.some(function (c) { return /^toast:Prima chiudi/.test(c); }));
  assert.ok(ctx.calls.indexOf('curtain.on') >= 0 && ctx.calls.indexOf('curtain.off') >= 0, 'registrata nel log tecnico');
});
test('RC2-A.3 tendina in regia: TOGLI TENDINA E AVVIA, TOGLI TENDINA, MOSTRA TENDINA nelle fasi giuste', function () {
  TYPES.forEach(function (type) {
    var m = RC.cockpit({ screen: 'arcade', arcade: { type: type, name: 'Gioco', curtain: true } });
    assert.strictEqual(m.stage, 'g-curtain', type);
    assert.strictEqual(m.main[0].act, 'gameStart');
    assert.strictEqual(m.main[0].label, '▶ TOGLI TENDINA E AVVIA');
    assert.strictEqual(m.main[0].id, RC.GAME_IDS[type].start, 'entra nel gioco giusto: ' + type);
    assert.ok(m.secondary.some(function (x) { return x.act === 'curtainOff'; }), 'togliere la tendina senza avviare');
    assert.ok(!m.showAnswers);
    var ready = RC.cockpit({ screen: 'arcade', arcade: { type: type, name: 'Gioco', curtain: false } });
    assert.strictEqual(ready.stage, 'g-ready');
    assert.ok(ready.secondary.some(function (x) { return x.act === 'curtainOn' && x.label === '▣ MOSTRA TENDINA'; }), 'rimettere la tendina mentre si prepara');
    var running = RC.cockpit({ screen: 'arcade', arcade: { type: type, name: 'Gioco', played: true, started: true } });
    assert.ok(!running.secondary.some(function (x) { return x.act === 'curtainOn'; }), 'non durante il tempo');
    var revealed = RC.cockpit({ screen: 'arcade', arcade: { type: type, name: 'Gioco', played: true, solutionShown: true } });
    assert.ok(revealed.secondary.some(function (x) { return x.act === 'curtainOn'; }), 'dopo la soluzione si può ricoprire');
    var mid = RC.cockpit({ screen: 'arcade', arcade: { type: type, name: 'Gioco', played: true, curtain: true } });
    assert.strictEqual(mid.main[0].act, 'curtainOff', 'a manche già giocata: TOGLI TENDINA');
  });
  assert.ok(/gameEnter,curtainOff,curtainOn,gameStart:/.test(APP), 'azioni collegate in regia');
});
test('RC2-A.3 tendina: sul proiettore nessuna parola, immagine o lista del gioco; la regia vede il gioco preparato', function () {
  var ctx = curtainCtx();
  TYPES.forEach(function (type) {
    ctx.state.arcade = { type: type, curtain: true, label: 'Manche 1', theme: 'Roma', instruction: '' };
    var pub = ctx.arcadeHTML(false), regia = ctx.arcadeHTML(true);
    assert.ok(/class="gameCurtain/.test(pub) && !/CONTENUTO-SEGRETO|gameScreen/.test(pub), 'proiettore: solo la tendina (' + type + ')');
    assert.ok(/CONTENUTO-SEGRETO/.test(regia) && /SUL PROIETTORE C’È LA TENDINA/.test(regia), 'regia: gioco + avviso (' + type + ')');
    ctx.state.arcade.curtain = false;
    assert.ok(/CONTENUTO-SEGRETO/.test(ctx.arcadeHTML(false)), 'tolta la tendina il pubblico vede il gioco');
  });
  assert.ok(/function renderStage\(\)\{const el=\$\('#stage'\);el\.innerHTML=stageHTML\(true\);/.test(APP), 'solo l’anteprima della regia usa stageHTML(true)');
  assert.ok(/s\.innerHTML=stageHTML\(\);/.test(APP) && /NET\.showStage\(stageHTML,/.test(APP), 'finestra del proiettore e /show: stageHTML() senza argomenti');
  assert.ok(/return arcadeHTML\(!!forRegia\)/.test(APP));
});
test('RC2-A.3 tendina: titolo grande, payoff, istruzioni, punteggio e istruzione facoltativa del pacchetto', function () {
  var ctx = curtainCtx();
  var h = {};
  TYPES.forEach(function (t) { h[t] = ctx.gameCurtainHTML({ type: t, label: 'Manche 1', theme: 'Roma' }); });
  assert.ok(/<h1 class="gcTitle">PHOTOPUZZLE<\/h1>/.test(h.photopuzzle) && /<h1 class="gcTitle">PAROLA SEGRETA<\/h1>/.test(h.ghigliottina));
  ['photopuzzle', 'indovina', 'abbinamenti'].forEach(function (t) { assert.ok(/Risposta corretta: 200–300 pt in base alla velocità/.test(h[t]), t); });
  assert.ok(/Ogni scelta corretta: \+10 pt/.test(h.ghigliottina) && /Risposta finale corretta: 200–300 pt in base alla velocità/.test(h.ghigliottina));
  assert.ok(/Ogni parola corretta: 50–100 pt in base alla velocità/.test(h.chain));
  TYPES.forEach(function (t) { assert.ok(/class="gcPayoff"/.test(h[t]) && /<ol class="gcHow"><li>/.test(h[t]) && /SI PARTE QUANDO IL DOCENTE TOGLIE LA TENDINA/.test(h[t]) && !/mascot/i.test(h[t]), t); });
  assert.ok(/class="gcNote">Le immagini sono dettagli/.test(ctx.gameCurtainHTML({ type: 'abbinamenti', instruction: 'Le immagini sono dettagli' })), 'istruzione del docente');
  assert.ok(!/gcNote/.test(h.chain), 'senza istruzione nessun riquadro vuoto');
});

/* ---------------- 2–8. layout dedicati senza mascotte ---------------- */
test('RC2-A.3 layout: cornice comune senza mascotte né logo, layout distinto per ogni gioco', function () {
  var frame = extract(['gameFrame']);
  assert.ok(!/mascotMarkup|BRAND_LOGO|publicHostHTML/.test(frame), 'la cornice dei giochi non ha mascotte né logo');
  [['photoHTML', 'photoLayout'], ['indovinaHTML', 'indLayout'], ['matchingHTML', 'matchLayout'], ['ghHTML', 'ghWrap'], ['chainHTML', 'chainPath']].forEach(function (x) {
    var f = extract([x[0]]);
    assert.ok(/gameFrame\(/.test(f) && f.indexOf(x[1]) >= 0 && !/publicHostHTML|mascotMarkup/.test(f), x[0]);
  });
  ['.indLayout{', '.matchLayout{', '.photoLayout{', '.chainPath{', '.gameScreen .ghText{', '.gameScreen .candidateGrid{'].forEach(function (sel) { assert.ok(CSS.indexOf(sel) >= 0, sel); });
  assert.ok(/\.gameScreen \.matchCard img\{width:100%;height:100%;object-fit:contain\}/.test(CSS), 'Abbinamenti: mai cover');
  assert.ok(/\.puzzleFrame>img\{[^}]*object-fit:cover;object-position:var\(--focus,center\)\}/.test(CSS), 'Photopuzzle: cover e punto focale invariati');
  var fit = source('js/stage-fit.js');
  assert.ok(/querySelectorAll\('\.publicBoard, \.gameScreen'\)/.test(fit) && /fitCurtain/.test(fit) && /\.gameScreen, \.gameCurtain/.test(fit), 'testo adattato e 4:3 riempito anche per i nuovi layout e la tendina');
});

/* ---------------- 9–12. Fase B1: editor da zero ---------------- */
function draftWithQuestion() {
  var d = PS.newDraft({ title: 'Prova editor', subject: 'Storia', grade: 2, author: 'Test' });
  var q = d.questions[PS.addQuestion(d)];
  q.question = 'Dove si trova il Colosseo?'; q.options = ['Roma', 'Milano', 'Napoli', 'Torino']; q.correct = 'A'; q.explanation = 'A Roma.'; q.category = 'Storia';
  return d;
}
function roundTrip(d) {
  var z = PS.toZip(d);
  var raw = PL.readImport(z.filename, z.bytes);
  var v = PL.validateImport(raw);
  assert.deepStrictEqual(v.errors || [], [], 'il pacchetto salvato si reimporta senza errori');
  return { pack: v.pack, draft: PS.draftFromImport(raw) };
}
test('RC2-A.3 editor: Abbinamento da zero (4 immagini, voci A–D, coppie) → salvato nel formato di sempre, riaperto con le stesse coppie', function () {
  var d = draftWithQuestion();
  var i = PS.addGame(d, 'abbinamenti');
  var g = d.games.abbinamenti[i];
  g.label = 'Monumenti'; g.instruction = 'Guardate i dettagli';
  ['colosseo.jpg', 'pantheon.jpg', 'ara.jpg', 'ercole.jpg'].forEach(function (n, k) { var r = PS.addImage(d, n, k % 2 ? JPG : JPG2); assert.ok(r.ok, r.error); g.cards[k].img = r.name; });
  PS.applyMatching(g, ['Pantheon', 'Tempio di Ercole', 'Colosseo', 'Ara Pacis'], [2, 0, 3, 1]);
  assert.deepStrictEqual(g.names, ['Colosseo', 'Pantheon', 'Ara Pacis', 'Tempio di Ercole']);
  assert.deepStrictEqual(PS.matchingIssues(g), []);
  assert.ok(PS.validate(d).ok, JSON.stringify(PS.validate(d).errors));
  var back = roundTrip(d);
  var saved = back.pack.games.abbinamenti[0];
  assert.deepStrictEqual(saved.names, ['Colosseo', 'Pantheon', 'Ara Pacis', 'Tempio di Ercole']);
  assert.ok(!('terms' in saved) && !('match' in saved), 'i dati della bozza non entrano nel pacchetto');
  assert.strictEqual(saved.instruction, 'Guardate i dettagli');
  var m = PS.matchingModel(back.draft.games.abbinamenti[0]);
  assert.deepStrictEqual(m.terms, saved.names);
  assert.deepStrictEqual(m.match, [0, 1, 2, 3], 'riaperto: voci nell’ordine delle immagini');
});
test('RC2-A.3 editor: validazione chiara degli Abbinamenti (voce usata due volte, voce non abbinata, immagine mancante)', function () {
  var d = draftWithQuestion();
  var g = d.games.abbinamenti[PS.addGame(d, 'abbinamenti')];
  g.label = 'Doppione';
  PS.applyMatching(g, ['Uno', 'Due', 'Tre', 'Quattro'], [0, 0, 2, 3]);
  var msgs = PS.validate(d).errors.map(function (e) { return e.message; }).join(' | ');
  assert.ok(/la voce A è abbinata a più immagini \(1 e 2\)/.test(msgs), msgs);
  assert.ok(/la voce B non è abbinata a nessuna immagine/.test(msgs), msgs);
  assert.ok(/Immagine 1|immagine/i.test(msgs), 'immagini mancanti segnalate');
});
test('RC2-A.3 editor: Indovina e Photopuzzle da zero, salvati e riaperti; duplica, sposta ed elimina', function () {
  var d = draftWithQuestion();
  var ind = d.games.indovina[PS.addGame(d, 'indovina')];
  ind.label = 'Chi sono?'; ind.candidates = ['Augusto', 'Nerone', 'Traiano', 'Adriano']; ind.subject = 'Traiano'; ind.clues = ['Ho conquistato la Dacia.', 'Una colonna racconta le mie imprese.'];
  var pp = d.games.photopuzzle[PS.addGame(d, 'photopuzzle')];
  pp.label = 'Archi'; pp.image = PS.addImage(d, 'arco.jpg', JPG).name; pp.answer = 'Arco di Tito'; pp.instruction = 'Un monumento del Foro';
  assert.ok(PS.validate(d).ok, JSON.stringify(PS.validate(d).errors));
  var back = roundTrip(d);
  assert.strictEqual(back.pack.games.indovina[0].subject, 'Traiano');
  assert.deepStrictEqual(back.pack.games.indovina[0].clues.length, 2);
  assert.strictEqual(back.pack.games.photopuzzle[0].answer, 'Arco di Tito');
  assert.strictEqual(back.pack.games.photopuzzle[0].instruction, 'Un monumento del Foro');
  var d2 = back.draft;
  var j = PS.duplicateGame(d2, 'indovina', 0);
  assert.strictEqual(d2.games.indovina.length, 2);
  assert.ok(/\(copia\)$/.test(d2.games.indovina[j].label));
  assert.strictEqual(PS.moveGame(d2, 'indovina', 1, -1), 0, 'riordino');
  PS.deleteGame(d2, 'indovina', 0);
  assert.strictEqual(d2.games.indovina.length, 1);
  assert.strictEqual(d2.games.indovina[0].label, 'Chi sono?');
});
test('RC2-A.3 editor: istruzione facoltativa compatibile (massimo 160 caratteri; i pacchetti esistenti restano validi)', function () {
  assert.strictEqual(PE.validateGame('chain', { label: 'x', links: [{ from: 'A', to: 'B' }], instruction: '  Una parola tira l’altra  ' }).instruction, 'Una parola tira l’altra');
  assert.ok(!('instruction' in PE.validateGame('chain', { label: 'x', links: [{ from: 'A', to: 'B' }], instruction: '   ' })), 'vuota = assente');
  assert.throws(function () { PE.validateGame('chain', { label: 'x', links: [{ from: 'A', to: 'B' }], instruction: new Array(170).join('a') }); }, /Istruzione troppo lunga/);
  var games = JSON.parse(source('packs/arte_romana/games.json'));
  var norm = PE.normalizeGames(games, {});
  assert.deepStrictEqual(norm.errors, [], 'Arte romana invariata e valida');
  ['inglese_base', 'vulcani'].forEach(function (id) {
    var f = path.join(ROOT, 'PACK_ESEMPI', id, 'games.json');
    if (fs.existsSync(f)) assert.deepStrictEqual(PE.normalizeGames(JSON.parse(fs.readFileSync(f, 'utf8')), {}).errors, [], id);
  });
});
test('RC2-A.3 editor: CREA DA ZERO in Pack Studio (6 pulsanti) e accesso diretto dalla scheda GIOCHI della regia', function () {
  var st = source('js/studio/studio.js');
  ['question', 'photopuzzle', 'indovina', 'abbinamenti', 'ghigliottina', 'chain'].forEach(function (k) { assert.ok(st.indexOf("['" + k + "', '＋ ") >= 0, k); });
  assert.ok(/if \(act === 'quick-add'\)/.test(st) && /quickAddHTML\(\)/.test(st));
  assert.ok(/data-bind="g\.match\.' \+ k \+ ':int"/.test(st) && /'g\.terms\.' \+ jj/.test(st), 'Abbinamento: voci e coppie');
  assert.ok(/input\('g\.instruction'/.test(st), 'istruzione sulla tendina');
  assert.ok(/id="openStudioGamesBtn"/.test(APP) && /PKG\.openStudio\(''\)/.test(APP) && /openStudio: function \(id\)/.test(source('js/host/packs-ui.js')));
});
