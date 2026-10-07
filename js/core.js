(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.SecchioneCore=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const LETTERS=['A','B','C','D'];
  const IND_BONUS=[50,30,20,10,5];
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function shuffle(arr,rng=Math.random){
    const a=[...arr];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }
  function rankPoints(position,settings={}){
    const start=Number(settings.start??300),step=Number(settings.step??25),min=Number(settings.min??0);
    return Math.max(min,start-(Math.max(1,Number(position)||1)-1)*step);
  }
  function scoreOutcome(outcome,position,settings={},bonus=0){
    const wrong=-Math.abs(Number(settings.wrong??100));
    const abstain=-Math.abs(Number(settings.abstain??100));
    if(outcome==='correct') return rankPoints(position,settings)+Number(bonus||0);
    if(outcome==='wrong') return wrong;
    if(outcome==='abstain') return abstain;
    return 0;
  }
  function correctIndex(question){
    const i=LETTERS.indexOf(String(question?.correct||'').trim().toUpperCase());
    return i>=0?i:0;
  }
  function buildQuestionRound(question,rng=Math.random){
    const opts=(question?.options||[]).map((text,index)=>({text,index}));
    const order=shuffle(opts,rng);
    const ci=correctIndex(question);
    return {
      order:order.map(x=>x.index),
      displayed:order.map((x,i)=>({letter:LETTERS[i],text:x.text,sourceIndex:x.index})),
      correctDisplayLetter:LETTERS[order.findIndex(x=>x.index===ci)]
    };
  }
  function parseChain(text){
    const raw=String(text||'').trim();
    if(!raw) return [];
    const normalized=raw.replace(/→/g,'|').replace(/>/g,'|');
    const lines=normalized.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(lines.length===1){
      const tokens=lines[0].split('|').map(x=>x.trim()).filter(Boolean);
      if(tokens.length<2) return [];
      return tokens.slice(0,-1).map((from,i)=>({from,to:tokens[i+1]}));
    }
    const pairs=[];
    for(const line of lines){
      const tokens=line.split('|').map(x=>x.trim()).filter(Boolean);
      if(tokens.length===2){pairs.push({from:tokens[0],to:tokens[1]});continue;}
      if(tokens.length>2){for(let i=0;i<tokens.length-1;i++)pairs.push({from:tokens[i],to:tokens[i+1]});continue;}
      return [];
    }
    return pairs;
  }
  function indBonus(clueNumber){return IND_BONUS[clamp((Number(clueNumber)||1)-1,0,IND_BONUS.length-1)];}
  function buildIndovina(set,rng=Math.random){
    const subject=String(set?.subject||set?.label||'').trim();
    let candidates=(set?.candidates||[]).map(String).map(x=>x.trim()).filter(Boolean);
    if(subject&&!candidates.some(x=>x.toLowerCase()===subject.toLowerCase())) candidates.unshift(subject);
    candidates=shuffle([...new Map(candidates.map(x=>[x.toLowerCase(),x])).values()],rng);
    const answerIndex=Math.max(0,candidates.findIndex(x=>x.toLowerCase()===subject.toLowerCase()));
    return {subject,candidates,answerIndex,clues:(set?.clues||[]).map(String).filter(Boolean),visible:0,eliminated:[],revealed:false,started:false,seconds:Number(set?.seconds)||null};
  }
  function buildMatching(set,rng=Math.random){
    const cards=clone(set?.cards||[]);
    const originalNames=(set?.names||[]).map(String);
    const order=shuffle(originalNames.map((name,index)=>({name,index})),rng);
    if(order.length>1&&order.every((x,i)=>x.index===i))order.push(order.shift());
    const names=order.map(x=>x.name);
    const letterForOriginal={};
    order.forEach((x,i)=>letterForOriginal[x.index]=LETTERS[i]);
    const solution=cards.map((_,i)=>`${i+1}${letterForOriginal[i]||'?'}`).join(' ');
    return {cards,sourceNames:originalNames,names,solution,revealCount:0,started:false,seconds:Number(set?.seconds)||null};
  }
  function buildGhigliottina(set,rng=Math.random){
    let pairs=(set?.pairs||[]).slice(0,5).map(p=>({correct:String(p[0]),wrong:String(p[1]),a:'',b:'',correctSide:'A',selected:null,resolved:false}));
    pairs.forEach(p=>{
      const flip=rng()<.5;
      p.a=flip?p.wrong:p.correct;
      p.b=flip?p.correct:p.wrong;
      p.correctSide=flip?'B':'A';
    });
    if(pairs.length>1&&pairs.every(p=>p.correctSide===pairs[0].correctSide)){
      const p=pairs[pairs.length-1];[p.a,p.b]=[p.b,p.a];p.correctSide=p.correctSide==='A'?'B':'A';
    }
    return {answer:String(set?.answer||''),pairs,step:0,final:false,revealedFinal:false,jackpot:Number(set?.jackpot||3200),started:false,seconds:Number(set?.seconds)||null};
  }
  function makePuzzleEdges(cols,rows,rng=Math.random){
    const vertical=Array.from({length:rows},()=>Array.from({length:cols-1},()=>rng()<.5?1:-1));
    const horizontal=Array.from({length:rows-1},()=>Array.from({length:cols},()=>rng()<.5?1:-1));
    return {cols,rows,vertical,horizontal};
  }
  function hSegment(x,y,len,sign,depth){
    const x1=x+len;
    if(!sign)return `L ${x1} ${y}`;
    const o=sign*depth;
    const X=t=>x+len*t;
    return `L ${X(.28)} ${y} C ${X(.32)} ${y} ${X(.34)} ${y+o*.12} ${X(.35)} ${y+o*.30} C ${X(.37)} ${y+o*.72} ${X(.43)} ${y+o} ${X(.50)} ${y+o} C ${X(.57)} ${y+o} ${X(.63)} ${y+o*.72} ${X(.65)} ${y+o*.30} C ${X(.66)} ${y+o*.12} ${X(.68)} ${y} ${X(.72)} ${y} L ${x1} ${y}`;
  }
  function vSegment(x,y,len,sign,depth){
    const y1=y+len;
    if(!sign)return `L ${x} ${y1}`;
    const o=sign*depth;
    const Y=t=>y+len*t;
    return `L ${x} ${Y(.28)} C ${x} ${Y(.32)} ${x+o*.12} ${Y(.34)} ${x+o*.30} ${Y(.35)} C ${x+o*.72} ${Y(.37)} ${x+o} ${Y(.43)} ${x+o} ${Y(.50)} C ${x+o} ${Y(.57)} ${x+o*.72} ${Y(.63)} ${x+o*.30} ${Y(.65)} C ${x+o*.12} ${Y(.66)} ${x} ${Y(.68)} ${x} ${Y(.72)} L ${x} ${y1}`;
  }
  function puzzlePaths(model,W=1200,H=750){
    const {cols,rows,vertical,horizontal}=model,w=W/cols,h=H/rows,depth=Math.min(w,h)*.22,out=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const x=c*w,y=r*h;
      const top=r===0?0:horizontal[r-1][c];
      const right=c===cols-1?0:vertical[r][c];
      const bottom=r===rows-1?0:horizontal[r][c];
      const left=c===0?0:vertical[r][c-1];
      let d=`M ${x} ${y}`;
      d+=' '+hSegment(x,y,w,top,depth);
      d+=' '+vSegment(x+w,y,h,right,depth);
      d+=' '+hSegment(x+w,y+h,-w,bottom,depth);
      d+=' '+vSegment(x,y+h,-h,left,depth)+' Z';
      out.push(d);
    }
    return out;
  }
  function chainHelpPositions(word,rng=Math.random,max=4){
    const chars=[...String(word||'')];
    const eligible=[];
    chars.forEach((ch,i)=>{if(/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch))eligible.push(i)});
    if(!eligible.length)return [];
    const first=eligible.slice(0,Math.min(2,eligible.length));
    const rest=shuffle(eligible.slice(first.length),rng);
    return first.concat(rest).slice(0,Math.min(max,eligible.length));
  }
  /*
   * Maschera leggibile anche con più parole: lettere separate da NBSP, parole separate da uno spazio em.
   * I separatori non consumano mai un aiuto. Esempio: ARA PACIS → A _ _    P _ _ _ _.
   */
  function chainMask(word,positions){
    const set=new Set(positions||[]),chars=[...String(word||'')],parts=[];
    chars.forEach((ch,i)=>{
      if(/\s/.test(ch)){while(parts.length&&parts[parts.length-1]==='\u00a0')parts.pop();parts.push('\u2003','\u2003');return}
      const visible=!/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch)||set.has(i);
      parts.push(visible?ch:'_');
      const next=chars[i+1];
      if(next!=null&&!/\s/.test(next))parts.push('\u00a0');
    });
    return parts.join('');
  }
  function photopuzzleRevealCount(elapsed,interval=1.5,maxPieces=30){
    const e=Math.max(0,Number(elapsed)||0),step=Math.max(.05,Number(interval)||1.5),max=Math.max(0,Number(maxPieces)||0);
    return clamp(Math.floor((e+1e-6)/step),0,max);
  }
  function chainAutoHelpCount(elapsed,maxHelp=4){
    const e=Math.max(0,Number(elapsed)||0),max=Math.max(0,Number(maxHelp)||0);
    if(!max)return 0;return clamp(1+Math.floor((e+1e-6)/10),1,max);
  }
  return {LETTERS,IND_BONUS,clamp,clone,shuffle,rankPoints,scoreOutcome,correctIndex,buildQuestionRound,parseChain,indBonus,buildIndovina,buildMatching,buildGhigliottina,makePuzzleEdges,puzzlePaths,chainHelpPositions,chainMask,photopuzzleRevealCount,chainAutoHelpCount};
});
