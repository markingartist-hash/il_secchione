'use strict';
var assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
var test=require('./harness.js').test;
var ROOT=path.join(__dirname,'..');
function source(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8');}
function extract(src,name){
  var start=src.indexOf('function '+name+'(');assert.ok(start>=0,'funzione '+name);
  var i=src.indexOf('{',start),depth=0,inS=false,inD=false,inT=false,esc=false;
  for(;i<src.length;i++){
    var c=src[i];
    if(esc){esc=false;continue} if(c==='\\'){esc=true;continue}
    if(!inD&&!inT&&c==="'")inS=!inS; else if(!inS&&!inT&&c==='"')inD=!inD; else if(!inS&&!inD&&c==='`')inT=!inT;
    if(inS||inD||inT)continue;
    if(c==='{')depth++; else if(c==='}'&&--depth===0)return src.slice(start,i+1);
  }
  throw Error('funzione non chiusa '+name);
}

test('v3.7.2: tastiera testuale non ricostruisce tutto il DOM ad ogni carattere',function(){
  var js=source('js/player.js'),css=source('css/player.css');
  var chars=js.slice(js.indexOf("if ((el = t.closest('[data-char]'))"),js.indexOf("if ((el = t.closest('[data-text-action]'))"));
  var acts=js.slice(js.indexOf("if ((el = t.closest('[data-text-action]'))"),js.indexOf("if (t.closest('[data-buzz]'))"));
  assert.ok(chars.indexOf('updateTextUI();')>=0 && chars.indexOf('render();')<0);
  assert.ok(acts.indexOf('updateTextUI();')>=0 && acts.indexOf('render();')<0);
  assert.ok(css.indexOf('.answerArea.textMode')>=0);
  assert.ok(css.indexOf('overflow-x:auto')>=0);
  assert.ok(css.indexOf('.textCount')>=0);
  assert.ok(css.indexOf('grid-template-rows:repeat(6,minmax(0,1fr))')>=0);
});

test('v3.7.2: primo AVANTI mostra i risultati del round, il secondo avanza',function(){
  var src=source('js/app.js'),calls=[];
  var ctx={state:{screen:'question',bank:[{id:'q1'},{id:'q2'}],qIndex:0,answerVisible:true,questionScored:true,roundResultsVisible:false},
    planLive:function(){return null},settleQuestionForNext:function(){return true},renderAll:function(){calls.push('render')},cloneAudio:function(){calls.push('sound')},autosave:function(){calls.push('save')},
    showLeaderboard:function(){calls.push('leader')},goQuestion:function(i){ctx.state.qIndex=i;ctx.state.roundResultsVisible=false;calls.push('q:'+i)},settleArcadeForNext:function(){return true},leaveQuestionGuard:function(){return true},q:function(){return ctx.state.bank[ctx.state.qIndex]},planNext:function(){calls.push('plan')}
  };
  vm.runInNewContext(extract(src,'showQuestionResults')+'\n'+extract(src,'nextQuestion'),ctx);
  ctx.nextQuestion();assert.strictEqual(ctx.state.qIndex,0);assert.strictEqual(ctx.state.roundResultsVisible,true);assert.deepStrictEqual(calls,['render','sound','save']);
  ctx.nextQuestion();assert.strictEqual(ctx.state.qIndex,1);assert.strictEqual(ctx.state.roundResultsVisible,false);assert.strictEqual(calls[calls.length-1],'q:1');
});

/* RC2-A: il risultato del round resta a tutto schermo ma è un riepilogo della manche: cascata dall'alto, niente posizioni né totali. */
test('v3.7.2 → RC2-A: risultato del round a tutto schermo, a cascata dall\'alto',function(){
  var js=source('js/app.js'),css=source('css/show.css');
  assert.ok(js.indexOf('function roundResultsHTML')>=0);
  assert.ok(js.indexOf('delay=i*step')>=0,'cascata dall\'alto, non un reveal dall\'ultimo al primo');
  assert.ok(js.indexOf('RISULTATO DEL ROUND')>=0 && js.indexOf('CLASSIFICA DEL ROUND')<0);
  assert.ok(js.indexOf("return state.roundResultsVisible?roundResultsHTML():questionHTML()")>=0);
  assert.ok(js.indexOf('resultTime')>=0 && js.indexOf('responseTimeMs')>=0, 'tempi di risposta presenti nella pagina risultati');
  assert.ok(js.indexOf("r.outcome==='omitted'?'—':r.time!=null")>=0, 'tempo mostrato per corrette ed errate, non per astensioni');
  assert.ok(js.indexOf('miniResponseHTML')<0, 'nessuna mini-classifica sotto la soluzione');
  assert.ok(css.indexOf('.roundReveal{height:100%')>=0);
  assert.ok(css.indexOf('.resultTeam{font-size:3.35cqh')>=0, 'nomi squadra grandi e leggibili');
  assert.ok(css.indexOf('@keyframes roundRowReveal')>=0);
  assert.ok(css.indexOf('.resultRow.p1')>=0);
});

test('v3.7.2: lo stato della classifica del round sopravvive al recovery',function(){
  var js=source('js/app.js');
  assert.ok(/roundResultsVisible:!!state\.roundResultsVisible/.test(js));
  assert.ok(/roundResultsVisible:!!ui\.roundResultsVisible/.test(js));
});


test('v3.7.2: avviando una build nuova non riapre silenziosamente un vecchio server Il Secchione',function(){
  var server=source('server/server.js');
  assert.ok(server.indexOf("existing.version === VERSION")>=0);
  assert.ok(server.indexOf("Non apro la vecchia versione")>=0);
  assert.ok(server.indexOf("listenHere(occupied + 1)")>=0);
});
