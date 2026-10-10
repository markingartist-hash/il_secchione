(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.SecchioneReadability=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function len(v){ return String(v==null?'':v).trim().length; }
  function texts(q, displayed){
    if(Array.isArray(displayed)&&displayed.length) return displayed.map(function(o){ return len(o&&o.text); });
    return (Array.isArray(q&&q.options)?q.options:[]).map(len);
  }
  function analyzeQuestion(q, displayed){
    q=q||{};
    var qLen=len(q.question), a=texts(q,displayed), max=a.length?Math.max.apply(Math,a):0;
    var total=a.reduce(function(s,n){return s+n;},0), hasArt=!!String(q.image||'').trim();
    // Thresholds intentionally consider the full text load, not one arbitrary 72-char cutoff.
    // Images lower the threshold because they reduce the horizontal room available to answers.
    var veryDense = qLen>170 || max>95 || total>300 || (hasArt && (qLen>140 || max>85 || total>250));
    var dense = veryDense || qLen>105 || max>64 || total>205 || (hasArt && (qLen>85 || max>58 || total>185));
    var level=veryDense?'veryDense':(dense?'textDense':'normal');
    var reasons=[];
    if(qLen>(hasArt?85:105)) reasons.push('domanda lunga');
    if(max>(hasArt?58:64)) reasons.push('alternativa lunga');
    if(total>(hasArt?185:205)) reasons.push('molto testo nelle alternative');
    if(hasArt&&dense) reasons.push('immagine + testo');
    return {level:level,dense:dense,veryDense:veryDense,hasArt:hasArt,questionLength:qLen,maxOptionLength:max,totalOptionsLength:total,reasons:reasons};
  }
  function className(q, displayed){ var a=analyzeQuestion(q,displayed); return a.level==='normal'?'':a.level; }
  function warning(q){
    var a=analyzeQuestion(q);
    if(a.level==='normal') return '';
    return (a.veryDense?'Possibile criticità di leggibilità':'Testo denso') + ': ' + (a.reasons.join(', ')||'molto testo') + '. Sul proiettore Il Secchione riduce prima immagine e mascotte, mantenendo il testo grande.';
  }
  return {analyzeQuestion:analyzeQuestion,className:className,warning:warning};
});
