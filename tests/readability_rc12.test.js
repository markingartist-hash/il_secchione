'use strict';
var assert=require('assert'),fs=require('fs'),path=require('path');
var test=require('./harness.js').test;
var ROOT=path.join(__dirname,'..');
var R=require('../js/engine/readability.js');
function source(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8');}

test('RC1.2 leggibilità: non basta più il vecchio cutoff singolo 72 caratteri',function(){
  var q={question:'Domanda breve',options:['Una risposta di poco oltre settantadue caratteri, ma non da sola ingestibile.','Breve','Breve','Breve'],image:''};
  var a=R.analyzeQuestion(q);
  assert.ok(a.level==='textDense' || a.level==='normal');
  assert.notStrictEqual(a.level,'veryDense');
  assert.ok(a.maxOptionLength>72);
});

test('RC1.2 leggibilità: caso Preistoria con immagine e alternativa da 103 caratteri è veryDense',function(){
  var q={image:'ceramica.jpg',question:'Che cosa distingue la decorazione per impressione da quella per incisione?',options:[
    'Nell’impressione un oggetto viene premuto sull’argilla; nell’incisione il segno viene tracciato direttamente sulla superficie',
    'Nell’impressione si usa sempre il colore rosso',
    'L’incisione richiede una parete di roccia',
    'Le due tecniche sono identiche'
  ]};
  var a=R.analyzeQuestion(q);
  assert.strictEqual(a.level,'veryDense');
  assert.strictEqual(a.hasArt,true);
});

test('RC1.2 leggibilità: domanda equilibrata resta normale',function(){
  var q={question:'Come si chiama l’apertura in cima alla cupola del Pantheon?',options:['Oculo','Pronao','Cavea','Velario'],image:''};
  assert.strictEqual(R.className(q),'');
});

test('RC1.2 leggibilità: regia e Pack Studio usano lo stesso motore',function(){
  var app=source('js/app.js'),studio=source('js/studio/studio.js'),index=source('index.html'),studioHtml=source('studio.html');
  assert.ok(app.indexOf('SecchioneReadability.className(x,round.displayed)')>=0);
  assert.ok(studio.indexOf('READ.className(q)')>=0);
  assert.ok(studio.indexOf('stReadabilityWarn')>=0);
  assert.ok(index.indexOf('js/engine/readability.js')>=0);
  assert.ok(studioHtml.indexOf('js/engine/readability.js')>=0);
});

test('RC1.2 leggibilità: dense e veryDense recuperano spazio prima di ridurre il testo',function(){
  var css=source('css/show.css');
  assert.ok(css.indexOf('.questionShow.textDense .questionBody.hasArt{grid-template-columns:15.5cqw')>=0);
  assert.ok(css.indexOf('.questionShow.veryDense .questionBody.hasArt{grid-template-columns:11.5cqw')>=0);
  assert.ok(css.indexOf('.questionShow.veryDense .questionSide .mascotStage{display:none}')>=0);
  assert.ok(css.indexOf('.questionShow.textDense .optionText{font-size:3.15cqh')>=0);
  assert.ok(css.indexOf('.questionShow.veryDense .optionText{font-size:3.08cqh')>=0);
});
