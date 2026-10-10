'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var test = require('./harness.js').test;
var S = require('../js/engine/scoring.js');
var SS = require('../js/engine/session.js');
var C = require('../js/core.js');
var PE = require('../js/engine/packs.js');
var BP = require('../tools/build_packs.js');

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function pointMap(rows) { var out={}; rows.forEach(function(r){out[r.participantId]=r.points;}); return out; }

test('Classroom Flow: prime 3 omissioni gratuite, dalla 4ª vale come errore ma resta omitted nei dati grezzi', function () {
  var p = 'show_standard';
  var r1 = S.scoreRound([{participantId:'a',outcome:'omitted',order:1}], p, {priorOmissions:{a:0},freeOmissions:3})[0];
  var r3 = S.scoreRound([{participantId:'a',outcome:'omitted',order:1}], p, {priorOmissions:{a:2},freeOmissions:3})[0];
  var r4 = S.scoreRound([{participantId:'a',outcome:'omitted',order:1}], p, {priorOmissions:{a:3},freeOmissions:3})[0];
  assert.strictEqual(r1.points,0); assert.strictEqual(r1.outcome,'omitted'); assert.strictEqual(r1.omissionNumber,1);
  assert.strictEqual(r3.points,0); assert.strictEqual(r3.outcome,'omitted'); assert.strictEqual(r3.omissionNumber,3);
  assert.strictEqual(r4.points,-50); assert.strictEqual(r4.outcome,'omitted'); assert.strictEqual(r4.scoringOutcome,'wrong'); assert.strictEqual(r4.omissionNumber,4);
});

test('Classroom Flow: la quota omissioni è per squadra e conta solo round confermati/non annullati', function () {
  var s=SS.createSession({scoringProfile:'show_standard'});
  s.rounds=[{roundInstanceId:'r1',committed:true},{roundInstanceId:'r2',committed:false},{roundInstanceId:'r3',committed:true}];
  s.responses=[
    {roundInstanceId:'r1',participantId:'a',outcome:'omitted'},
    {roundInstanceId:'r1',participantId:'b',outcome:'omitted'},
    {roundInstanceId:'r2',participantId:'a',outcome:'omitted'},
    {roundInstanceId:'r3',participantId:'a',outcome:'omitted',voided:true},
    {roundInstanceId:'r3',participantId:'b',outcome:'wrong'}
  ];
  assert.deepStrictEqual(SS.committedOmissionCounts(s),{a:1,b:1});
});



test('Classroom Flow: anche il server autoritativo applica 0/0/0/errore alle quattro astensioni', function () {
  var Room = require('../server/room.js').Room;
  var room = new Room(); room.setSession('session-omissioni');
  var pts=[];
  for (var i=1;i<=4;i++) {
    var rid='omit-'+i;
    var c=room.commit({roundInstanceId:rid,profileId:'show_standard',records:[{participantId:'a',participantType:'team',inputMode:'manual',selectedAnswer:null,correctAnswer:'A',outcome:'omitted',order:1}]});
    assert.strictEqual(c.ok,true);
    pts.push(c.scoreEvents[0].points);
    assert.strictEqual(c.records[0].outcome,'omitted');
  }
  assert.deepStrictEqual(pts,[0,0,0,-50]);
  assert.strictEqual(room.commits['omit-4'].scoreEvents[0].scoringOutcome,'wrong');
});
test('Classroom Flow: ARA PACIS e ogni parola composta hanno separazione visibile nella Staffetta', function () {
  var mask=C.chainMask('ARA PACIS',[]);
  assert.ok(mask.indexOf('\u2003\u2003')>=0,'manca il separatore tra parole');
  assert.ok(mask.indexOf('_\u00a0_')>=0,'le lettere mascherate devono essere distanziate');
  var help=C.chainHelpPositions('ARA PACIS',function(){return 0.5;},4);
  assert.strictEqual(help.indexOf(3),-1,'lo spazio non deve consumare un aiuto');
  var pack=PE.validatePack(BP.loadPackFolder(path.join(ROOT,'packs','arte_romana')));
  assert.strictEqual(pack.ok,true,pack.errors.join('; '));
  pack.pack.games.chain.forEach(function(game){
    game.links.forEach(function(link){
      [link.from,link.to].forEach(function(word){
        if (/\s/.test(word)) assert.ok(C.chainMask(word,[]).indexOf('\u2003\u2003')>=0,'parole fuse: '+word);
      });
    });
  });
});

test('Classroom Flow: tutte le manche testuali del pack Arte romana sono a 60 secondi', function () {
  var pack=PE.validatePack(BP.loadPackFolder(path.join(ROOT,'packs','arte_romana')));
  assert.strictEqual(pack.ok,true,pack.errors.join('; '));
  Object.keys(pack.pack.games).forEach(function(type){
    pack.pack.games[type].forEach(function(g){ assert.strictEqual(g.seconds,60,type+' · '+g.label); });
  });
});

test('Classroom Flow: la regia impone almeno 60 s ai giochi testuali e PROSSIMA DOMANDA chiude/segna automaticamente', function () {
  var app=source('js/app.js');
  assert.ok(/secs=Math\.max\(60,TM\.secondsFor\(set\)\)/.test(app));
  assert.ok(/function settleQuestionForNext\(\)/.test(app));
  assert.ok(/fillMissingAbstain\(\)/.test(app.slice(app.indexOf('function settleQuestionForNext'),app.indexOf('function prevQuestion'))));
  assert.ok(/commitQuestionScores\(false\)/.test(app.slice(app.indexOf('function settleQuestionForNext'),app.indexOf('function prevQuestion'))));
});

test('Classroom Flow: i giochi non forzano più il salto alla scheda PUNTI e la raccolta è inline', function () {
  var app=source('js/app.js');
  var timer=app.slice(app.indexOf('function timerEnded'),app.indexOf('function startTimer'));
  assert.strictEqual(timer.indexOf("tab('score')"),-1);
  assert.ok(app.indexOf('gameScoreInline')>=0);
  assert.ok(app.indexOf('commitGameInlineBtn')>=0);
});

test('Classroom Flow: palco domanda privilegia leggibilità; la classifica è su una schermata successiva dedicata', function () {
  var app=source('js/app.js'), css=source('css/show.css');
  assert.ok(app.indexOf('function roundResultsHTML')>=0);
  assert.ok(app.indexOf('resultNextHint')>=0);
  assert.ok(app.indexOf('miniResponseHTML')<0);
  assert.ok(css.indexOf('.miniResults')<0);
  assert.ok(css.indexOf('.questionShow.textDense')>=0);
});
