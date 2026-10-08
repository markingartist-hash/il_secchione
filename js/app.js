(()=>{
'use strict';
/*
 * Il Secchione v3.5 CLASSROOM · regia (HOST)
 * Derivato da app.js v3.0: palco, giochi e editor sono quelli della v3.
 * Novità: timer dai dati, scoring unico (engine/scoring.js), record grezzi,
 * autosave/ripresa, griglia rapida A/B/C/D/Ø con tastiera, pulsantiere tablet via server locale.
 */
const C=window.SecchioneCore,SC=window.SecchioneScoring,TM=window.SecchioneTimer,SS=window.SecchioneSession,PE=window.SecchionePackEngine,RP=window.SecchioneReport;
const STORE=window.SecchioneStore,NET=window.SecchioneNet,DEV=window.SecchioneDevicesUI;
const PL=window.SecchionePackLib,PKC=window.SecchionePacksClient,PKG=window.SecchionePacksUI;
const AM=window.SecchioneAnswerMatcher;
const RC=window.SecchioneRoundControl,PS=window.SecchionePackStudio;
const SP=window.SecchioneSessionPlan,PLAN_UI=window.SecchionePlannerUI;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const VERSION='1.0.0-rc2a.3.1';
const FREE_OMISSIONS=SC.DEFAULT_FREE_OMISSIONS||3;
const BRAND_LOGO='assets/logo_clean.svg';
const SOUND={
 click:'assets/sounds_hq/rank_lock_hq.wav',transition:'assets/sounds_hq/transition_soft.wav',question:'assets/sounds_hq/question_in.wav',
 timer:'assets/sounds_hq/timer_start_hq.wav',tick:'assets/sounds_hq/tick_soft_hq.wav',urgent:'assets/sounds_hq/tick_urgent_hq.wav',timeup:'assets/sounds_hq/time_up_hq.wav',
 correct:'assets/sounds_hq/correct_hq.wav',wrong:'assets/sounds_hq/wrong_hq.wav',reveal:'assets/sounds_hq/reveal_hq.wav',leader:'assets/sounds_hq/leaderboard_hq.wav',
 arcade:'assets/sounds_hq/arcade_start_hq.wav',letter:'assets/sounds_hq/letter_reveal_hq.wav',final:'assets/sounds_hq/final_answer_hq.wav',
 select:'assets/sounds_hq/gh_select_hq.wav',cut:'assets/sounds_hq/gh_cut_hq.wav',halve:'assets/sounds_hq/gh_halve_hq.wav',survive:'assets/sounds_hq/gh_survive_hq.wav',ghfinal:'assets/sounds_hq/gh_final_hq.wav',
 timerBed:'assets/sounds_hq/timer_bed_hq.wav',chainBed:'assets/sounds_hq/chain_bed_hq.wav',indovinaBed:'assets/sounds_hq/indovina_bed_hq.wav',ghBed:'assets/sounds_hq/gh_bed_hq.wav'
};
/* Mascotte: in v3 c'erano 12 file ma solo 2 immagini distinte (stessa figura specchiata). */
/* Mascotte animata (v3.5.4): 4 pose reali in WebP; il movimento è solo CSS (show.css: transform/opacity). Stessi nomi di prima, nessun sistema parallelo. */
const MASCOT_ASSETS={present:'assets/mascot/mascot_present.webp',think:'assets/mascot/mascot_think.webp',celebrate:'assets/mascot/mascot_celebrate.webp',panic:'assets/mascot/mascot_panic.webp'};
const MASCOT_A=MASCOT_ASSETS.present;
const MASCOT_POSES={present:MASCOT_ASSETS.present,thumb:MASCOT_ASSETS.present,point:MASCOT_ASSETS.present,explorer:MASCOT_ASSETS.think,think:MASCOT_ASSETS.think,artist:MASCOT_ASSETS.present,host:MASCOT_ASSETS.present,champion:MASCOT_ASSETS.celebrate};
const MOOD_SRC={welcome:MASCOT_ASSETS.present,reveal:MASCOT_ASSETS.present,think:MASCOT_ASSETS.think,celebrate:MASCOT_ASSETS.celebrate,panic:MASCOT_ASSETS.panic};
const MASCOT_PRELOAD=Object.values(MASCOT_ASSETS).map(s=>{const i=new Image();i.decoding='async';i.src=s;return i});/* niente sfarfallio al cambio posa */
const MASCOT_RM=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
const QUESTION_MASCOT_SEQUENCE=['present','explorer','thumb','artist','host','think','point','champion'];
const EDITABLE_GAMES=PE.EDITABLE_GAMES;
let arcadeEpoch=0;
let publicWindow=null,timerRAF=null,bedAudio=null,toastTO=null,saveTO=null;
const prefs=STORE.loadPrefs();
/* RC2-A: fino alla RC1 il profilo predefinito "show_standard" veniva salvato sempre. Una volta sola passa al nuovo default 200–300;
   una scelta fatta dopo nelle IMPOSTAZIONI resta. Le partite già salvate conservano il loro profilo (nessun ricalcolo retroattivo). */
if(prefs.scoringProfileRev!==2){if(!prefs.scoringProfile||prefs.scoringProfile==='show_standard')prefs.scoringProfile=SC.DEFAULT_PROFILE;prefs.scoringProfileRev=2}
let bankOverrides=prefs.banks||{};
let customGames=prefs.games||{};
/* Scalette della puntata salvate (v3.7.0): solo riferimenti ai contenuti dei pacchetti. */
let savedPlans=SP.mergeLists(prefs.plans,[]);
/* Libreria pacchetti: all'avvio i pack del programma (packs.bundle.js); init() carica poi la libreria completa
   (con il server: cartella packs/; senza server: anche i pack salvati nel browser). */
let legacyImported=Array.isArray(prefs.importedPacks)?prefs.importedPacks:[];
let librarySources=(window.SECCHIONE_PACK_SOURCES||[]).slice(),libraryImageMaps={};
let P=buildPacks();
const state={
 motion:prefs.motion!==false,packKey:P[prefs.packKey]?prefs.packKey:Object.keys(P)[0],activePacks:[],mixed:false,mixPack:null,mixShuffle:!!prefs.mixShuffle,bank:[],teams:[],screen:'home',qIndex:0,qRound:null,phase:'preview',answerVisible:false,roundResultsVisible:false,
 pending:{},pendingOrder:[],correctOrder:[],pendingHistory:[],entryMeta:{},entrySeq:0,cursor:0,
 questionScored:false,arcade:null,completedRounds:{},deferredEdits:{},repeatOf:null,planRun:null,finalReveal:null,timer:TM.create(TM.DEFAULTS.question),round:null,session:null,
 sound:prefs.sound!==false,volume:Number.isFinite(Number(prefs.volume))?Number(prefs.volume):.78
};

/* ---------------- PACK, PREFERENZE, UTILITÀ ---------------- */
function buildPacks(){
 const out={};
 librarySources.forEach(src=>{const r=PE.validatePack(src);if(!r.ok){console.warn('Pack non valido',src&&src.id,r.errors);return}const rt=PE.toRuntime(r.pack,{origin:'installed'});if(libraryImageMaps[rt.id])rt.imageMap=libraryImageMaps[rt.id];applyCustomGames(rt);out[rt.id]=rt});
 return out;
}
/* Manche Indovina / Parola Segreta / Staffetta modificate dal docente, salvate per pack. */
function applyCustomGames(rt){const data=customGames[rt.id];if(!data)return;try{const ready={};for(const type of PE.GAME_TYPES){if(!Array.isArray(data[type]))continue;if(!data[type].length||data[type].length>200)throw Error();ready[type]=data[type].map(x=>PE.validateGame(type,x))}Object.assign(rt.arcadeSets,C.clone(ready))}catch(e){console.warn('Giochi personalizzati non validi per',rt.id)}}
function activeRuntimes(){return state.activePacks.map(id=>P[id]).filter(Boolean)}
function buildMixPack(rts){const first=rts[0],subjects=[...new Set(rts.map(r=>(r.meta||{}).subject).filter(Boolean))];return Object.assign({},first,{key:'mix',id:'mix',title:'Sessione mista',subtitle:rts.map(r=>r.title).join(' · '),tags:[],questions:[],arcadeSets:PL.composeArcade(rts),texts:Object.assign({},first.texts,{homeEyebrow:'SESSIONE MISTA',homeClaim:rts.map(r=>r.title).join(' + '),mascotHome:'Tanti argomenti,\nuna sfida!',footer:rts.map(r=>r.title.toUpperCase()).join(' · ')}),meta:Object.assign({},first.meta,{version:'',subject:subjects.join(', ')}),members:rts.map(r=>r.id),mixed:true})}
/* Imposta i pack in gara e ricostruisce domande e giochi. Squadre, punti e sessione NON cambiano. */
function setActivePacks(ids,opts){const o=opts||{};ids=ids.filter((id,i)=>P[id]&&ids.indexOf(id)===i);if(!ids.length)ids=[Object.keys(P)[0]];state.activePacks=ids;state.packKey=ids[0];state.mixed=ids.length>1;if(typeof o.shuffle==='boolean')state.mixShuffle=o.shuffle;state.mixPack=state.mixed?buildMixPack(activeRuntimes()):null;loadBank();if(state.session)PL.recordActivation(state.session,activeRuntimes())}
function activatePacks(ids,opts){
 if(state.screen==='question'&&state.phase==='running'||state.screen==='arcade'&&state.arcade&&state.arcade.started)return {ok:false,error:'C’è una domanda o un gioco in corso: chiudilo prima di cambiare pacchetto.'};
 const valid=(ids||[]).filter(id=>P[id]);if(!valid.length)return {ok:false,error:'Pacchetto non disponibile.'};
 if(!leaveQuestionGuard())return {ok:false,error:'Prima conferma i punti della domanda in corso.'};
 stopTimer();arcadeEpoch++;state.arcade=null;state.round=null;clearPending();state.screen='home';state.qIndex=0;
 setActivePacks(valid,opts);logEvent({event:'pack.activate',reason:valid.join('+')+(state.mixed&&state.mixShuffle?' (domande mescolate)':'')});
 savePrefs();renderAll();autosave('pack.activate',0);
 toast(state.mixed?`Sessione mista: ${activeRuntimes().map(r=>r.title).join(' + ')}. Squadre e punti restano.`:`Pacchetto «${pack().title}» attivo. Squadre e punti restano.`);
 return {ok:true};
}
/* Ricarica la libreria (dopo importazioni, copie, eliminazioni) senza riavviare il programma. */
async function refreshLibrary(){
 try{const r=await PKC.load();librarySources=r.packs.filter(p=>p.ok).map(p=>p.pack);libraryImageMaps=r.imageMaps||{}}catch(e){console.warn('Libreria pacchetti non disponibile',e);return false}
 P=buildPacks();
 if(state.activePacks.length){const still=state.activePacks.filter(id=>P[id]);if(still.join('|')!==state.activePacks.join('|')){setActivePacks(still.length?still:[Object.keys(P)[0]]);toast('Un pacchetto in gara non è più disponibile: elenco aggiornato.')}else if(state.mixed)state.mixPack=buildMixPack(activeRuntimes())}
 return true;
}
/* Migrazione automatica: i pack importati come file .json nella prima v3.5 (salvati nelle preferenze) entrano nella libreria. */
async function migrateLegacyImported(){
 const done=[],failed=[];for(const src of legacyImported){try{const r=await PKC.importBytes((src.id||'pack')+'.json',window.SecchioneZip.utf8Encode(JSON.stringify(src)));if(r&&r.ok)done.push(r.id);else failed.push(src)}catch(e){failed.push(src);console.warn('migrazione',e)}}
 legacyImported=failed;savePrefs();if(done.length){await refreshLibrary();setTimeout(()=>toast(`Pacchetti importati in precedenza spostati nella libreria: ${done.join(', ')}`),1200)}
}
function mixedGuard(){if(state.mixed){toast('Sessione mista: per modificare le domande attiva un solo pacchetto (oppure DUPLICALO da PACCHETTI).');return true}return false}
function savePrefs(){const ok=STORE.savePrefs({version:35,migratedFromV3:!!prefs.migratedFromV3,packKey:state.packKey,activePacks:state.activePacks,mixShuffle:state.mixShuffle,sound:state.sound,volume:state.volume,motion:state.motion,banks:bankOverrides,games:customGames,importedPacks:legacyImported,plans:savedPlans,scoringProfile:SC.hasProfile(prefs.scoringProfile)?prefs.scoringProfile:SC.DEFAULT_PROFILE,scoringProfileRev:2});if(!ok)toast('Salvataggio locale non disponibile: esporta l’archivio per conservarlo.')}
function pack(){return state.mixed&&state.mixPack?state.mixPack:P[state.packKey]}
function profileId(){return state.session&&SC.hasProfile(state.session.scoringProfile)?state.session.scoringProfile:SC.DEFAULT_PROFILE}
function rules(){return SC.rulesSummary(profileId())+` · Prime ${FREE_OMISSIONS} astensioni gratis, dalla ${FREE_OMISSIONS+1}ª = errore`}
function gameName(type){return pack().gameNames[type]||type}
/* Domande dei pack in gara: id "packId/idOriginale" e provenienza (packlib.composeBank). */
function loadBank(){
 const parts=state.activePacks.filter(id=>P[id]).map(id=>{const rt=P[id];let qs=rt.questions;const custom=bankOverrides[id];if(custom){const r=PE.normalizeQuestions(custom.map(PL.storedQuestion),{lenient:true,imagePrefixes:rt.imagePrefixes,makeId:()=>SS.uuid()});if(r.errors.length||!r.questions.length){delete bankOverrides[id];toast(`Archivio personalizzato di «${rt.title}» non valido: caricate le domande originali.`)}else qs=r.questions}return {pack:rt,questions:qs}});
 state.bank=PL.composeBank(parts);
 if(state.mixed&&state.mixShuffle)state.bank=C.shuffle(state.bank);
 state.qIndex=Math.min(state.qIndex,Math.max(0,state.bank.length-1));
}
function q(){return state.bank[state.qIndex]||null}
function imagePath(name,packId){name=String(name||'');if(!name||/["<>\r\n]/.test(name))return '';if(/^(data:image\/(png|jpeg|webp|gif);base64,|blob:|https?:|file:)/i.test(name))return esc(name);if(/^[a-z]+:/i.test(name))return '';if(/^(immagini|packs|assets)\//.test(name))return esc(name);const pk=P[packId]||P[state.packKey]||pack();let n=name;(pk.imagePrefixes||[]).forEach(p=>{if(n.startsWith(p))n=n.slice(p.length)});if(pk.imageMap&&pk.imageMap[n])return esc(pk.imageMap[n]);return esc(pk.imageBase+n)}
function setTheme(doc=document){const pk=pack();doc.documentElement.style.setProperty('--accent',pk.accent);doc.documentElement.style.setProperty('--accent2',pk.accent2);doc.documentElement.style.setProperty('--theme-bg',`url("${imagePath(pk.homeImage)}")`);doc.documentElement.dataset.pack=state.packKey}
function toast(msg,kind){const el=$('#toast');el.textContent=msg;el.className='toast'+(kind?' '+kind:'');void el.offsetWidth;el.classList.add('show');clearTimeout(toastTO);toastTO=setTimeout(()=>el.classList.remove('show'),kind==='warn'||kind==='err'?4200:2600)}
function fmt(sec){const s=Math.max(0,Math.ceil(sec));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function tab(name){$$('.tabBtn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.tab').forEach(x=>x.classList.toggle('active',x.id===`tab-${name}`))}
function cloneAudio(name,vol=1){if(!state.sound||!SOUND[name])return;try{const a=new Audio(SOUND[name]);a.volume=Math.max(0,Math.min(1,state.volume*vol));a.play().catch(()=>{});return a}catch(e){}}
function stopBed(){if(bedAudio){try{bedAudio.pause();bedAudio.currentTime=0}catch(e){}bedAudio=null}}
function playBed(name){stopBed();if(!state.sound||!SOUND[name])return;try{bedAudio=new Audio(SOUND[name]);bedAudio.loop=true;bedAudio.volume=Math.max(0,Math.min(1,state.volume*.38));bedAudio.play().catch(()=>{})}catch(e){}}
function unlockAudio(){try{const a=new Audio(SOUND.click);a.volume=.001;a.play().then(()=>{a.pause();a.currentTime=0}).catch(()=>{})}catch(e){}}
function download(filename,content,type){const blob=content instanceof Blob?content:new Blob([content],{type:type||'application/octet-stream'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`}
function fileBase(){const cl=(state.session&&state.session.meta.classLabel||'').replace(/[^\w-]+/g,'');return `secchione_${state.packKey}${cl?'_'+cl:''}_${stamp()}`}
function logEvent(e){return SS.addLog(state.session,Object.assign({source:'host'},e))}

/* ---------------- SESSIONE E PERSISTENZA ---------------- */
function newSession(keep){const old=state.session;state.session=SS.createSession({packId:state.packKey,packVersion:(pack().meta||{}).version||'',scoringProfile:SC.hasProfile(prefs.scoringProfile)?prefs.scoringProfile:SC.DEFAULT_PROFILE,meta:keep&&old?old.meta:{}});PL.recordActivation(state.session,activeRuntimes());logEvent({event:'session.create'});NET.newSession(state.session.sessionId)}
function recomputeScores(){const t=SS.totals(state.session);state.teams.forEach(x=>x.score=t[x.id]||0)}
function teamHasScores(id){return state.session.scoreEvents.some(e=>e.participantId===id&&!e.voided)}
function sanitizeArcade(a){if(!a)return null;const x=C.clone(a);if(typeof x.image==='string'&&x.image.length>400000)x.image='';if(Array.isArray(x.cards))x.cards.forEach(c=>{if(typeof c.img==='string'&&c.img.length>400000)c.img=''});return x}
function buildSnapshot(reason){
 const s=state.session;s.updatedAt=SS.nowISO();s.participants=state.teams.map(t=>({id:t.id,type:t.type||'team',name:t.name,createdAt:t.createdAt||s.createdAt}));
 return {format:'secchione-snapshot',version:1,app:VERSION,savedAt:SS.nowISO(),reason:reason||'',packKey:state.packKey,activePacks:state.activePacks,mixShuffle:state.mixShuffle,session:s,
  ui:{screen:state.screen,qIndex:state.qIndex,questionId:q()?q().id:null,phase:state.phase,answerVisible:state.answerVisible,roundResultsVisible:!!state.roundResultsVisible,questionScored:state.questionScored,qRound:state.qRound,pending:state.pending,pendingOrder:state.pendingOrder,correctOrder:state.correctOrder,entryMeta:state.entryMeta,entrySeq:state.entrySeq,completedRounds:state.completedRounds,arcade:sanitizeArcade(state.arcade),timer:TM.snapshot(state.timer,performance.now()),round:state.round,deferredEdits:state.deferredEdits||{},lockedQuestion:RC.isLocked(state)?q():null,repeatOf:state.repeatOf||null,finalReveal:state.finalReveal?{shown:state.finalReveal.shown,lastAt:0,final:!!state.finalReveal.final}:null,contentDone:!!state.contentDone,planRun:state.planRun||null}};
}
function hasProgress(snap){const s=snap&&snap.session;return !!s&&s.status==='active'&&((s.participants||[]).length>0||(s.responses||[]).length>0)}
function autosave(reason,delay){clearTimeout(saveTO);saveTO=setTimeout(()=>saveNow(reason),delay==null?120:delay)}
function saveNow(reason){clearTimeout(saveTO);try{STORE.saveSnapshot(buildSnapshot(reason))}catch(e){console.warn('autosave',e)}}
function restoreSnapshot(snap){
 SS.validateSnapshot(snap);STORE.release();
 const ids=(Array.isArray(snap.activePacks)&&snap.activePacks.length?snap.activePacks:[snap.packKey]).filter(id=>P[id]);
 if(ids.length&&ids.join('|')!==state.activePacks.join('|'))setActivePacks(ids,{shuffle:!!snap.mixShuffle});
 migrateSnapshotIds(snap);
 const s=snap.session,ui=snap.ui||{};
 stopTimer();state.session=s;s.status='active';
 state.teams=(s.participants||[]).map(p=>({id:p.id,type:p.type||'team',name:p.name,createdAt:p.createdAt,score:0}));recomputeScores();
 state.completedRounds=ui.completedRounds||{};clearPending();state.round=null;state.arcade=null;
 const idx=ui.questionId?state.bank.findIndex(x=>x.id===ui.questionId):-1;
 state.deferredEdits={};state.repeatOf=ui.repeatOf||null;state.planRun=ui.planRun||null;
 if(ui.screen==='question'&&idx>=0&&ui.lockedQuestion&&ui.lockedQuestion.id===state.bank[idx].id&&(ui.phase!=='preview'||ui.questionScored)&&JSON.stringify(state.bank[idx])!==JSON.stringify(ui.lockedQuestion)){state.deferredEdits[state.bank[idx].id]=state.bank[idx];state.bank[idx]=ui.lockedQuestion}
 if(ui.screen==='question'&&idx>=0){
  Object.assign(state,{screen:'question',qIndex:idx,qRound:ui.qRound||C.buildQuestionRound(state.bank[idx]),phase:ui.phase||'preview',answerVisible:!!ui.answerVisible,roundResultsVisible:!!ui.roundResultsVisible,questionScored:!!ui.questionScored,pending:ui.pending||{},pendingOrder:ui.pendingOrder||[],correctOrder:ui.correctOrder||[],entryMeta:ui.entryMeta||{},entrySeq:ui.entrySeq||0,round:ui.round||null});
  state.timer=Object.assign(TM.create(ui.timer?ui.timer.duration:TM.secondsFor(q())),ui.timer||{},{running:false});
 }else if(ui.screen==='arcade'&&ui.arcade){
  state.screen='arcade';state.arcade=ui.arcade;state.arcade.started=false;state.pending=ui.pending||{};state.pendingOrder=ui.pendingOrder||[];state.correctOrder=ui.correctOrder||[];state.entryMeta=ui.entryMeta||{};state.round=ui.round||null;
  state.timer=Object.assign(TM.create(TM.secondsFor(state.arcade.seconds,state.arcade.type)),ui.timer||{},{running:false});
 }else if(ui.screen==='leaderboard'){state.screen='leaderboard';state.finalReveal=ui.finalReveal?{shown:Number(ui.finalReveal.shown)||0,lastAt:0,final:ui.finalReveal.final!==false}:null}
 else if(ui.screen==='finished'){state.screen='finished';if(idx>=0)state.qIndex=idx}
 else{state.screen='home';if(idx>=0)state.qIndex=idx}
 state.contentDone=!!ui.contentDone||state.screen==='finished';
 logEvent({event:'session.resume',reason:snap.reason||''});NET.newSession(s.sessionId);syncNetParticipants();
 renderAll();autosave('resume',0);
}
/* Salvataggi della prima v3.5: id domanda senza pack → "packId/id", provenienza aggiunta alle risposte. */
function migrateSnapshotIds(snap){const base=snap.packKey,ui=snap.ui||{},s=snap.session,rt=P[base];if(!base)return;const fix=id=>id&&String(id).indexOf('/')<0?base+'/'+id:id;
 if(ui.questionId)ui.questionId=fix(ui.questionId);
 if(ui.completedRounds){const c={};Object.keys(ui.completedRounds).forEach(k=>c[fix(k)]=ui.completedRounds[k]);ui.completedRounds=c}
 if(ui.round&&ui.round.questionId)ui.round.questionId=fix(ui.round.questionId);
 const pv=rt?{packId:base,packVersion:(rt.meta||{}).version||'',subject:(rt.meta||{}).subject||'',topic:rt.title}:null;
 if(pv){(s.responses||[]).forEach(r=>{if(!r.packId)Object.assign(r,pv,{sourceQuestionId:r.kind==='question'?r.questionId:null})});(s.rounds||[]).forEach(r=>{if(!r.packId)Object.assign(r,pv,{sourceQuestionId:r.questionId||null})});if(!Array.isArray(s.packs))PL.recordActivation(s,[rt])}
}
function snapshotSummary(snap){const s=snap.session,ui=snap.ui||{};const d=new Date(snap.savedAt);const when=isNaN(d)?'':d.toLocaleString('it-IT',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});const qid=ui.questionId&&String(ui.questionId).indexOf('/')<0&&snap.packKey?snap.packKey+'/'+ui.questionId:ui.questionId,qi=qid&&state.bank.findIndex(x=>x.id===qid);const pr=ui.planRun&&!ui.planRun.finished?ui.planRun:null,where=pr?`scaletta «${esc(pr.name)}», elemento ${pr.cursor+1} di ${(pr.items||[]).length}`:ui.screen==='question'&&qi>=0?`domanda ${qi+1} / ${state.bank.length}`:ui.screen==='arcade'?'gioco bonus':ui.screen==='leaderboard'?'classifica':'home';const answered=(s.responses||[]).filter(r=>!r.voided).length;return `Salvata ${when} · ${(s.participants||[]).length} squadre · ${where} · ${answered} risposte registrate${s.meta&&s.meta.classLabel?' · classe '+esc(s.meta.classLabel):''}`}
async function checkResume(){
 let snap=STORE.loadSnapshot();
 try{const remote=await STORE.loadServerSnapshot();if(remote&&(!snap||String(remote.savedAt)>String(snap.savedAt)))snap=remote}catch(e){}
 /* Il collegamento al server parte solo dopo la scelta del docente: così una regia appena ricaricata
    non manda al server una sessione vuota (che sgancerebbe i tablet dalle squadre). */
 if(hasProgress(snap)&&snap.session.afterEnd&&!(snap.session.responses||[]).length){try{restoreSnapshot(snap)}catch(e){console.warn('ripristino squadre',e)}NET.connect();return}
 if(!hasProgress(snap)){NET.connect();return}
 const dlg=$('#resumeDialog');$('#resumeSummary').innerHTML=snapshotSummary(snap);dlg.oncancel=e=>e.preventDefault();
 const close=()=>{dlg.close();setTimeout(()=>NET.connect(),0)};
 $('#resumeBtn').onclick=()=>{close();try{restoreSnapshot(snap);toast('Partita ripresa.')}catch(e){toast('Ripresa non riuscita: '+e.message)}};
 $('#resumeNewBtn').onclick=()=>{close();STORE.archiveSnapshot(snap);toast('Partita precedente archiviata. Nuova partita pronta.');autosave('new')};
 $('#resumeExportBtn').onclick=()=>{download(`partita_non_conclusa_${stamp()}.json`,JSON.stringify(snap,null,2),'application/json');STORE.archiveSnapshot(snap);close();toast('Partita esportata e archiviata.');autosave('new')};
 dlg.showModal();
}

/* ---------------- MASCOTTE E TRANSIZIONI ---------------- */
function mascotKey(kind='question'){if(kind==='home')return 'host';if(kind==='photo')return 'explorer';if(kind==='indovina')return 'think';if(kind==='chain')return 'artist';if(kind==='gh')return 'host';if(kind==='match')return 'point';if(kind==='leader')return 'champion';if(kind==='question')return QUESTION_MASCOT_SEQUENCE[(state.qIndex||0)%QUESTION_MASCOT_SEQUENCE.length]||'present';return state.phase==='running'?'point':'present'}
function transitionMascotSrc(){const t=state.arcade?.type;const kind=state.screen==='arcade'?(t==='photopuzzle'?'photo':t==='indovina'?'indovina':t==='chain'?'chain':t==='ghigliottina'?'gh':t==='abbinamenti'?'match':'question'):(state.screen==='leaderboard'?'leader':state.screen==='home'?'home':'question');return MASCOT_POSES[mascotKey(kind)]||MASCOT_A}
function showTransition(title,sub,number=''){if(!state.motion)return;const data={title,sub,number:number||String(qNumber().n).padStart(2,'0'),kicker:state.screen==='arcade'?'BONUS SHOW':'NUOVA SFIDA',mascot:transitionMascotSrc()};stageDocs().forEach(d=>{const tr=d.getElementById('transition');if(!tr)return;const ti=d.getElementById('transitionTitle'),su=d.getElementById('transitionSub'),nu=d.getElementById('transitionNumber'),ki=d.getElementById('transitionKicker');if(ti)ti.textContent=data.title;if(su)su.textContent=data.sub;if(nu)nu.textContent=data.number;if(ki)ki.textContent=data.kicker;const tm=d.getElementById('transitionMascot');if(tm)tm.src=data.mascot;tr.classList.remove('active');void tr.offsetWidth;tr.classList.add('active');setTimeout(()=>tr.classList.remove('active'),1380)});NET.showTransition(data);cloneAudio('transition',.82)}
function currentMood(){return state.screen==='leaderboard'||state.questionScored&&state.screen==='question'||state.arcade?.scoreCommitted?'celebrate':mascotTimeUp()?'panic':state.answerVisible&&state.screen==='question'||state.arcade?.revealedFinal||state.arcade?.type==='indovina'&&state.arcade.revealed?'reveal':state.timer.running?'think':'welcome'}
/* Tempo scaduto: lo stesso evento globale del suono "timeup" (il timer arriva a zero mentre corre; pausa e chiusura anticipata non contano).
   La mascotte va nel panico per un attimo, poi riprende la regola esistente (soluzione svelata → present). Nessun esito della singola squadra. */
let mascotWasRunning=false,mascotPanicUntil=0;
function mascotTimeUp(){return !state.timer.running&&state.timer.remaining<=0&&performance.now()<mascotPanicUntil}
function mascotWatchTimer(){const run=!!state.timer.running;if(mascotWasRunning&&!run&&state.timer.duration>0&&state.timer.remaining<=0){mascotPanicUntil=performance.now()+1400;setTimeout(()=>{mascotPanicUntil=0;updateTimerUI()},1450)}mascotWasRunning=run}
/* Chiave dell'evento che ha prodotto la posa: se cambia a parità di posa (es. due celebrate di seguito) l'animazione one-shot riparte. */
function mascotCue(mood){return [mood,state.screen,state.qIndex,state.arcade?state.arcade.type+':'+state.arcade.presetIndex:'',state.questionScored?1:0,state.arcade?.scoreCommitted?1:0].join('|')}
/* mascotPlay = l'animazione d'ingresso/one-shot va eseguita: per un evento nuovo, oppure se il palco viene ridisegnato entro 150 ms
   dall'inizio dell'evento (l'animazione era appena partita su un elemento poi sostituito). Ridisegni successivi: posa ferma. */
let mascotEvent={cue:'',at:0};
function mascotFresh(cue){const now=performance.now();if(mascotEvent.cue!==cue){mascotEvent={cue,at:now};return true}return now-mascotEvent.at<150}
function replayMascot(el,mood){el.className='mascotStage';void el.offsetWidth;el.className='mascotStage mascotPlay mood-'+mood}
function mascotMarkup(){const mood=currentMood(),cue=mascotCue(mood);return `<div class="mascotStage${mascotFresh(cue)?' mascotPlay':''} mood-${mood}" data-mood="${mood}" data-cue="${esc(cue)}"><div class="mascotAura"></div><img class="publicHostMascot" src="${MOOD_SRC[mood]}" alt="La mascotte del Secchione" draggable="false"><span class="mascotSpark sparkOne">✦</span><span class="mascotSpark sparkTwo">✧</span><div class="mascotShadow"></div></div>`}
function animateMascots(){mascotWatchTimer();const mood=currentMood(),cue=mascotCue(mood),still=!state.motion||!!(MASCOT_RM&&MASCOT_RM.matches);stageDocs().forEach(d=>{d.documentElement.classList.toggle('motionOff',!state.motion);d.querySelectorAll('.mascotStage').forEach(el=>{if(el.dataset.mood!==mood||el.dataset.cue!==cue){mascotFresh(cue);replayMascot(el,mood);el.dataset.mood=mood;const im=el.querySelector('img');if(im&&im.getAttribute('src')!==MOOD_SRC[mood]){im.src=MOOD_SRC[mood];if(!still&&im.animate)im.animate([{opacity:.25},{opacity:1}],{duration:140,easing:'ease-out'})}}el.dataset.cue=cue;el.classList.toggle('urgentMascot',state.timer.running&&state.timer.remaining<=10)})})}

/* ---------------- RENDER GENERALE ---------------- */
function publicTimerHTML(status='PRONTO'){const pct=state.timer.duration?Math.max(0,Math.min(100,state.timer.remaining/state.timer.duration*100)):0,sec=Math.max(0,Math.ceil(state.timer.remaining));return `<div class="publicTimerHud"><div class="timerWords"><small>TIMER</small><strong>${esc(status)}</strong><div class="timerMiniBar"><i class="liveProgress" style="width:${pct}%"></i></div></div><div class="publicTimerRing" style="--pct:${pct}"><b class="liveSeconds">${sec}</b><em>SEC</em></div></div>`}
function renderChrome(){
 const pk=pack();document.title=`Il Secchione · ${pk.title}`;
 const set=(sel,txt)=>{const e=$(sel);if(e)e.textContent=txt};
 set('#brandTitle',pk.title.toUpperCase());set('#posterTitle',pk.title.toUpperCase());set('#posterSub',(pk.subtitle||'').toUpperCase());set('#transitionSub',`${pk.title.toUpperCase()}${pk.subtitle?' · '+pk.subtitle.toUpperCase():''}`);
 set('#rulesBadge',rules().toUpperCase());set('#archiveInfo',`${state.bank.length} domande · ${PE.countGames(pk.arcadeSets)} manche`);set('#packInfo',state.mixed?`Sessione mista · ${state.activePacks.length} pacchetti`:`${pk.title} · v${(pk.meta||{}).version||'—'}`);set('#activePackInfo',state.mixed?`IN GARA: ${activeRuntimes().map(r=>r.title.toUpperCase()).join(' + ')}`:`IN GARA: ${pk.title.toUpperCase()}`);
 set('#settingsSummary',`${SC.getProfile(profileId()).label.toUpperCase()} · ${({lesson:'LEZIONE',qualification:'QUALIFICAZIONE',final:'FINALE'})[state.session.meta.mode]||'LEZIONE'}${state.session.meta.classLabel?' · '+state.session.meta.classLabel.toUpperCase():''}`);
 renderNetStatus();
}
function renderNetStatus(){
 const st=NET.status(),devs=NET.devices(),bound=devs.filter(d=>d.participantId),on=bound.filter(d=>d.connected);
 const label=!st.available?'SENZA TABLET':st.connected?(bound.length?`${on.length}/${bound.length} PULSANTIERE`:'PRONTO'):'PROGRAMMA NON RAGGIUNGIBILE';
 const small=!st.available?'le risposte le registri tu':st.connected?`PIN ${st.pin||'—'} · ${st.joinLocked?'ingressi chiusi':'ingressi aperti'}`:'riconnessione in corso…';const cs=$('#connStatus');if(cs)cs.title='Il Secchione '+VERSION;
 const set=(sel,txt)=>{const e=$(sel);if(e)e.textContent=txt};
 set('#connStatus',label);set('#connSmall',small);set('#connStrip',st.connected?'LAN LOCALE':'NESSUNA');set('#devicesTileSmall',st.available?(st.connected?`${on.length} connesse · PIN ${st.pin||'—'}`:'Server non raggiungibile'):'Avvia con AVVIA_IL_SECCHIONE.bat');
 document.body.classList.toggle('netOn',!!st.connected);document.body.classList.toggle('netOff',st.available&&!st.connected);
 renderDeviceLive();
 if(state.screen==='home'){renderCockpit();if(state.showJoin){renderStage();syncPublic()}}
}
function renderDirectorDeck(){
 const stateEl=$('#directorState'),hint=$('#directorHint'),run=state.planRun,live=planLive();
 let label='HOME',msg=live?'Scaletta in corso: premi RIPRENDI SCALETTA.':'Configura le squadre e avvia il quiz, oppure prepara una SCALETTA.';
 if(state.screen==='question'){
  const nq=qNumber();
  if(state.roundResultsVisible){label=`RISULTATI · DOMANDA ${nq.n}`;msg=`Classifica del round sul palco: ${live?'AVANTI':'PROSSIMA'} passa al contenuto successivo.`}
  else{label=`DOMANDA ${nq.n} / ${nq.total}`;msg=state.phase==='preview'?'Mostra la domanda. Premi AVVIA DOMANDA (Spazio) quando la classe è pronta.':state.phase==='running'?(state.timer.running?'Tempo in corso: le risposte possono arrivare dai tablet o essere registrate qui sotto.':'Tempo in PAUSA.'):state.questionScored?(state.answerVisible?`${live?'AVANTI':'PROSSIMA'} mostra la classifica della domanda a tutto schermo.`:(live?'Punti confermati: premi AVANTI.':'Punti confermati. Premi → per la prossima domanda.')):state.answerVisible?`Soluzione svelata: ${live?'AVANTI':'PROSSIMA'} registra i punti e mostra la classifica del round.`:'Registra le risposte mancanti (A B C D o 0) e conferma con Invio.'}
 }else if(state.screen==='arcade'&&state.arcade){label=gameName(state.arcade.type).toUpperCase();msg=state.arcade.started?'Manche in corso. Timer e automatismi sono sincronizzati.':state.arcade.played&&!state.arcade.scoreCommitted?`Manche conclusa: controlla RISPOSTE E PUNTI qui sotto, poi ${live?'AVANTI':'PROSSIMA'}.`:state.arcade.scoreCommitted?'Punti del gioco registrati.':'Regia pronta: avvia la manche quando la classe è pronta.'}
 else if(state.screen==='leaderboard'){const pi=podiumInfo();const fin=!!(state.finalReveal&&state.finalReveal.final);label=fin?'CLASSIFICA FINALE':'CLASSIFICA';msg=pi&&pi.shown<pi.total?`Proclamazione: AVANTI (→) rivela ${RC.placeLabel(pi.nextRank).toLowerCase()} · ${pi.shown} di ${pi.total} rivelati.`:fin?'Verdetto completo: REPORT e poi TERMINA PARTITA.':'Classifica mostrata: AVANTI torna al gioco.'}
 else if(state.screen==='finished'){label='FINE DEI CONTENUTI';msg='Nessuna classifica automatica: quando vuoi premi ★ CLASSIFICA FINALE.'}
 if(stateEl)stateEl.textContent=label;if(hint)hint.textContent=msg;
 const pr=$('#directorProgress');if(pr){if(live){const p=SP.position(live);pr.textContent=p.next?`Poi: ${p.next.kind==='game'?'🎮':'❓'} ${(p.next.preview&&p.next.preview.title)||''}${p.next.duplicateOf?' (di nuovo)':''}`:'Ultimo elemento della scaletta'}else{const p=RC.progress(state.bank,state.completedRounds,state.qIndex),cur=state.screen==='question'&&q()?(state.completedRounds[q().id]?' · questa: giocata':' · questa: da giocare'):'';pr.textContent=p.total?`Domanda ${p.current} / ${p.total} · giocate ${p.played} · da giocare ${p.toPlay}${cur}`:''}}
 renderCockpit();updateTimerUI();
}
function renderSessionQuick(){const games=$('#sessionGameButtons');if(games)games.innerHTML=Object.entries(pack().gameNames).filter(([k])=>(pack().arcadeSets[k]||[]).length).map(([k,n])=>`<button class="btn ghost" data-game="${k}">${esc(n)}</button>`).join('')}
function renderAll(){setTheme();renderChrome();renderStage();renderPrivate();renderDirectorDeck();renderTeams();renderAnswerPanel();renderScorePanel();renderSessionQuick();renderGamesTab();renderBank();renderResults();syncPublic();if(DEV)DEV.render()}
function renderStage(){const el=$('#stage');el.innerHTML=stageHTML(true);fitStage(document);setTimeout(animateMascots,0)}
/* RC2-A: testo della domanda il più grande possibile tra un massimo e un minimo leggibile (js/stage-fit.js). */
function fitStage(doc){try{if(window.SecchioneStageFit)window.SecchioneStageFit.fit(doc)}catch(e){}}
/* RC2-A.3: forRegia=true solo per l'anteprima della regia (sotto la tendina il docente vede il gioco preparato); proiettore, /show e tablet ricevono stageHTML() senza argomenti. */
function stageHTML(forRegia){if(!pack())return '<div class="showHome"><section class="homeCopy"><h1>NESSUN PACK</h1><p>Esegui tools/build_packs.js oppure importa un pack.</p></section></div>';if(state.screen==='rules')return rulesHTML();if(state.screen==='home')return state.showJoin&&NET.status().connected?joinHTML():homeHTML();if(state.screen==='question')return state.roundResultsVisible?roundResultsHTML():questionHTML();if(state.screen==='arcade')return arcadeHTML(!!forRegia);if(state.screen==='leaderboard')return leaderboardHTML();if(state.screen==='finished')return finishedHTML();return homeHTML()}

/* ---------------- FLUSSO DOMANDE ---------------- */
function startQuiz(){if(planLive())return planResume();if(state.teams.length<2){toast('Aggiungi almeno due squadre.');tab('session');return}logEvent({event:'quiz.start'});state.qIndex=0;goQuestion(0)}
function goQuestion(i){RC.applyDeferred(state);state.repeatOf=null;state.finalReveal=null;state.contentDone=false;state.showJoin=false;ghClosePairRound();arcadeEpoch++;state.arcade=null;stopTimer();state.screen='question';state.qIndex=Math.max(0,Math.min(state.bank.length-1,i));state.qRound=C.buildQuestionRound(q());state.phase='preview';state.answerVisible=false;state.roundResultsVisible=false;state.round=null;state.questionScored=false;clearPending();resetTimer(TM.secondsFor(q()));state.cursor=0;restoreCompletedRound();renderAll();showTransition(`DOMANDA ${String(qNumber().n).padStart(2,'0')}`,q()?.category||pack().title,String(qNumber().n).padStart(2,'0'));autosave('question.go')}
/* Uscendo da una domanda aperta non si perdono le risposte: completa = conferma automatica, parziale = decide il docente. */
function leaveQuestionGuard(){if(state.screen!=='question'||state.questionScored||!state.round||state.phase==='preview')return true;const any=state.teams.some(t=>t.id in state.pending);if(!any){if(state.phase==='running'){if(!confirm('La domanda è in corso: annullarla e cambiare schermata?\nNessun punto verrà assegnato.')){renderAll();return false}cancelRoundCore('navigazione')}return true}if(state.phase==='running')closeQuestionTime();const n=state.teams.filter(t=>t.id in state.pending).length;if(n<state.teams.length){if(!confirm(`Mancano le risposte di ${state.teams.length-n} squadre.
OK = segnale come omesse e conferma i punti.
Annulla = resta su questa domanda.`)){renderAll();return false}fillMissingAbstain()}commitQuestionScores(true);return true}
function settleQuestionForNext(){
 if(state.screen!=='question'||state.phase==='preview'||state.questionScored)return true;
 if(state.phase==='running')closeQuestionTime();
 if(!missingGuard())return false;
 if(state.teams.some(t=>!(t.id in state.pending)))fillMissingAbstain();
 if(!state.answerVisible&&state.round){
  state.answerVisible=true;
  if(!state.round.revealedAt){state.round.revealedAt=SS.nowISO();NET.revealRound(state.round.roundInstanceId);logEvent({event:'round.reveal',roundInstanceId:state.round.roundInstanceId,reason:'passaggio automatico alla domanda successiva'})}
 }
 commitQuestionScores(false);
 return !!state.questionScored;
}
function showQuestionResults(){
 if(state.screen!=='question')return false;
 if(!settleQuestionForNext())return false;
 if(!state.answerVisible||!state.questionScored)return false;
 if(state.roundResultsVisible)return false;
 state.roundResultsVisible=true;renderAll();cloneAudio('leader',.7);autosave('question.results',0);return true;
}
function nextQuestion(){
 /* RC2-A: la classifica si apre SOLO con ★ CLASSIFICA. Durante la proclamazione ogni AVANTI rivela una posizione (dall'ultima alla prima);
    a classifica finale completa AVANTI non fa nulla; a classifica di metà partita completa AVANTI torna al gioco. */
 if(state.screen==='leaderboard'&&state.finalReveal){const p=podiumInfo();if(p&&p.shown<p.total){revealNextPlace();return}if(state.finalReveal.final)return}
 if(state.screen==='finished')return;
 if(planLive())return planNext();
 if(!state.bank.length)return;
 if(state.screen==='question'){
  /* Primo AVANTI dopo la soluzione: classifica della domanda a tutto schermo. Secondo AVANTI: domanda seguente. */
  /* RC1: se l'avviso «senza risposta» e' appena comparso, questo AVANTI si ferma qui. */
  if(!state.roundResultsVisible){const w=state.missingWarned;if(showQuestionResults()||state.missingWarned!==w)return}
  state.roundResultsVisible=false;
  if(state.qIndex>=state.bank.length-1){showFinished();return}
  goQuestion(state.qIndex+1);return;
 }
 if(state.screen==='arcade'&&!state.arcade?.resultsVisible){const g=gameResultsStep();if(g!=='proceed')return}
 if(state.screen==='arcade'&&!settleArcadeForNext())return;
 if(!leaveQuestionGuard())return;
 const advance=!!state.completedRounds[q()?.id];
 goQuestion(advance?Math.min(state.qIndex+1,state.bank.length-1):state.qIndex);
}
function prevQuestion(){if(planLive())return planPrev();if(!leaveQuestionGuard())return;if(state.screen==='question'&&state.qIndex>0)goQuestion(state.qIndex-1)}
function startQuestion(){
 if(state.screen!=='question'||state.phase!=='preview'||state.questionScored)return;
 const x=q();state.phase='running';state.answerVisible=false;state.roundResultsVisible=false;clearPending();state.cursor=0;resetTimer(TM.secondsFor(x));
 const r=newRound('question',Object.assign({questionId:x.id,questionIndex:state.qIndex},state.repeatOf?{repeatOf:state.repeatOf}:{}));state.repeatOf=null;r.openedAt=SS.nowISO();r.availableMs=Math.round(state.timer.duration*1000);
 logEvent({event:'round.open',roundInstanceId:r.roundInstanceId,reason:`domanda ${state.qIndex+1} · ${state.timer.duration}s`});
 NET.openRound({roundInstanceId:r.roundInstanceId,questionId:x.id,number:qNumber().n,total:qNumber().total,layout:'mcq',letters:state.qRound.displayed.map(o=>o.letter),correct:state.qRound.correctDisplayLetter,durationMs:Math.round(state.timer.duration*1000)});
 startTimer('timerBed');renderAll();cloneAudio('question',.82);autosave('round.open',0);
}
function closeQuestionTime(){stopTimer();state.phase='scoring';if(state.round){state.round.closedAt=SS.nowISO();NET.closeRound(state.round.roundInstanceId);logEvent({event:'round.close',roundInstanceId:state.round.roundInstanceId})}markOmittedForTabletTeams()}
function finishQuestion(){if(state.screen!=='question'||state.phase!=='running')return;closeQuestionTime();renderAll();toast('Tempo chiuso: registra le risposte mancanti.');autosave('round.close',0)}
function revealQuestion(){if(state.screen!=='question'||state.phase==='preview'){toast('Avvia prima la domanda.');return}if(state.phase==='running')closeQuestionTime();state.roundResultsVisible=false;state.answerVisible=true;if(state.round&&!state.round.revealedAt){state.round.revealedAt=SS.nowISO();NET.revealRound(state.round.roundInstanceId);logEvent({event:'round.reveal',roundInstanceId:state.round.roundInstanceId})}renderAll();cloneAudio('reveal',.88);maybeAutoCommit();autosave('reveal',0)}
function showHome(){if(!leaveQuestionGuard())return;state.finalReveal=null;ghClosePairRound();arcadeEpoch++;stopTimer();state.roundResultsVisible=false;state.screen='home';state.arcade=null;state.round=null;clearPending();renderAll();autosave('home')}
/* RC2-A: unica porta della classifica generale (pulsante ★ CLASSIFICA). Parte sempre la proclamazione dall'ultimo posto.
   "Finale" se i contenuti sono finiti (fine archivio o scaletta conclusa), altrimenti classifica di metà partita. */
function contentFinished(){return !!state.contentDone||!!(state.planRun&&state.planRun.finished&&!state.planRun.stopped)}
function showLeaderboard(opts){if(!leaveQuestionGuard())return;const final=!!(opts&&opts.final===true)||contentFinished();arcadeEpoch++;stopTimer();state.roundResultsVisible=false;state.screen='leaderboard';state.arcade=null;state.round=null;state.finalReveal=state.teams.length?{shown:0,lastAt:0,final}:null;renderAll();cloneAudio('leader',.84);showTransition(final?'CLASSIFICA FINALE':'CLASSIFICA',final?'La sfida è finita. Ecco il verdetto.':'Ecco la situazione fin qui.','TOP');autosave('leaderboard')}
/* Fine dei contenuti: schermata neutra, senza punteggi. La classifica arriva solo quando il docente preme ★ CLASSIFICA. */
function showFinished(){if(!leaveQuestionGuard())return;arcadeEpoch++;stopTimer();state.roundResultsVisible=false;state.screen='finished';state.contentDone=true;state.arcade=null;state.round=null;state.finalReveal=null;renderAll();logEvent({event:'content.finished'});autosave('finished')}
function finishedHTML(){return `<div class="finishedScene"><img src="${BRAND_LOGO}" alt="Il Secchione"><span class="showEyebrow">${esc(pack().title.toUpperCase())}</span><h1>FINE DEI CONTENUTI</h1><p>Bravissimi! La classifica arriva tra poco.</p></div>`}
function newRound(kind,extra){state.round=Object.assign({roundInstanceId:SS.uuid(),kind,openedAt:null,closedAt:null,revealedAt:null,committed:false},extra||{});state.entrySeq=0;return state.round}

/* ---------------- SCALETTA DELLA PUNTATA (v3.7.0, engine/sessionPlan.js) ----------------
   La scaletta contiene solo riferimenti (pacchetto + domanda, pacchetto + tipo + manche). In classe AVANTI = nextQuestion():
   chiude e registra l'elemento corrente con le regole di sempre (settleQuestionForNext / settleArcadeForNext) e apre il successivo. */
function catalogParts(){return Object.keys(P).map(id=>{const rt=P[id],inBank=state.activePacks.includes(id)?state.bank.filter(x=>x.source&&x.source.packId===id):[];return {pack:{id:rt.id,title:rt.title,version:(rt.meta||{}).version||''},questions:inBank.length?inBank:PL.composeBank([{pack:rt,questions:rt.questions}]),games:rt.arcadeSets||{},gameNames:rt.gameNames||{}}}).sort((a,b)=>String(a.pack.title).localeCompare(String(b.pack.title),'it'))}
function openPlanner(id){if(PLAN_UI)PLAN_UI.open(id)}
function planLive(){const r=state.planRun;return r&&!r.finished?r:null}
function planCurrent(){const r=planLive();return r?r.items[r.cursor]||null:null}
/* L'elemento corrente della scaletta è proprio quello sullo schermo? (il docente può fare una deviazione dall'Archivio o da GIOCHI) */
function planOnItem(it){if(!it)return false;if(it.kind==='question')return state.screen==='question'&&!!q()&&q().id===it.questionId;const a=state.arcade;return state.screen==='arcade'&&!!a&&a.type===it.gameType&&a.label===it.label&&(a._packId||state.packKey)===it.packId}
function planItemFor(r){const run=planLive(),it=planCurrent();if(!it||!r||!planOnItem(it))return null;return {planId:run.planId,planName:run.name,uid:it.uid,position:run.cursor+1}}
/* Numero mostrato sul palco e sui tablet: in scaletta conta le domande della scaletta. */
function qNumber(){const run=planLive(),x=q(),it=planCurrent();if(run&&it&&x&&it.kind==='question'&&it.questionId===x.id){const qs=run.items.filter(y=>y.kind==='question'&&!y.missing);return {n:qs.indexOf(it)+1,total:qs.length}}return {n:state.qIndex+1,total:state.bank.length}}
function planRecord(){const run=state.planRun,s=state.session;if(!run||!s)return;s.plans=Array.isArray(s.plans)?s.plans:[];const rec=SP.sessionRecord(run),i=s.plans.findIndex(p=>p.planId===run.planId&&p.startedAt===run.startedAt);if(i>=0)s.plans[i]=rec;else s.plans.push(rec)}
function startPlan(plan){
 if(state.teams.length<2){toast('Aggiungi almeno due squadre prima di avviare la scaletta.','warn');return false}
 if(state.screen==='question'&&state.phase==='running'||state.screen==='arcade'&&state.arcade&&state.arcade.started){toast('C’è una domanda o un gioco in corso: chiudilo prima di avviare la scaletta.','warn');return false}
 const ids=SP.packIds(plan).filter(id=>P[id]);if(!ids.length){toast('Nessun pacchetto della scaletta è installato.','err');return false}
 const resolved=SP.resolve(plan,SP.catalog(catalogParts()),{gameNames:pack().gameNames}),sum=SP.summary(resolved);
 if(!sum.playable){toast('Nessun elemento della scaletta è disponibile.','err');return false}
 if(sum.missing&&!confirm(`${sum.missing===1?'1 elemento della scaletta non è più disponibile e verrà saltato':sum.missing+' elementi della scaletta non sono più disponibili e verranno saltati'}.\nAvviare comunque?`))return false;
 const live=planLive();if(live&&!confirm(`È in corso la scaletta «${live.name}». Interromperla e avviare «${plan.name}»?`))return false;
 if(ids.slice().sort().join('|')!==state.activePacks.slice().sort().join('|')){const r=activatePacks(ids);if(!r.ok){toast(r.error,'warn');return false}}else if(!leaveQuestionGuard())return false;
 if(live){live.finished=true;live.finishedAt=SS.nowISO();live.stopped=true;planRecord();logEvent({event:'plan.stop',reason:live.name})}
 state.planRun=SP.startRun(plan,resolved);resolved.forEach(it=>{if(it.missing)state.planRun.visited[it.uid]='missing'});
 logEvent({event:'plan.start',reason:`${plan.name} · ${sum.playable} elementi${sum.missing?` · ${sum.missing} mancanti`:''}`});planRecord();
 tab('session');planGo(SP.nextPlayable(state.planRun.items,-1));return true;
}
function planGo(i){
 const run=planLive();if(!run)return;const it=run.items[i];if(!it){planFinish();return}
 run.cursor=i;run.opened=run.opened||{};const first=!run.opened[it.uid];run.opened[it.uid]=true;
 if(it.kind==='question'){
  const idx=state.bank.findIndex(x=>x.id===it.questionId);if(idx<0)return planSkipMissing(i);
  const again=first&&!!state.completedRounds[it.questionId];
  goQuestion(idx);
  if(again&&state.questionScored){const r=RC.prepareRepeat(state);logEvent({event:'round.repeat',roundInstanceId:r.repeatOf||null,reason:'scaletta: contenuto già giocato, nuovo round (punti precedenti mantenuti)'});resetTimer(TM.secondsFor(q()));renderAll()}
 }else{
  const sets=pack().arcadeSets[it.gameType]||[],gi=SP.findGameIndex(sets,it,state.packKey);if(gi<0)return planSkipMissing(i);
  startArcade(it.gameType);if(state.screen!=='arcade'||!state.arcade)return;
  if(gi!==state.arcade.presetIndex)loadArcadePreset(gi,false);
 }
 planRecord();renderAll();autosave('plan.go',0);
}
/* Contenuto sparito durante la lezione: resta MANCANTE in scaletta (mai sostituito) e si passa al successivo. */
function planSkipMissing(i){const run=planLive(),it=run.items[i];it.missing=true;it.reason=it.reason||'Contenuto non più disponibile';run.visited[it.uid]='missing';toast(`⚠ Elemento ${i+1} della scaletta non disponibile («${(it.preview&&it.preview.title)||''}»): saltato.`,'warn');planRecord();const n=SP.nextPlayable(run.items,i);if(n<0)planFinish();else planGo(n)}
function planNext(){
 const run=planLive();if(!run)return;const it=planCurrent(),on=planOnItem(it);
 if(state.screen==='question'){
  const was=state.phase!=='preview'||state.questionScored;
  /* Anche in scaletta il primo AVANTI dopo la soluzione apre i risultati del round. */
  if(!state.roundResultsVisible){const w=state.missingWarned;if(showQuestionResults()||state.missingWarned!==w)return}
  if(!settleQuestionForNext())return;
  state.roundResultsVisible=false;
  if(on)run.visited[it.uid]=run.visited[it.uid]==='played'||was?'played':'skipped';
 }
 else if(state.screen==='arcade'){const a=state.arcade,was=!!(a&&(a.played||a.started||a.scoreCommitted));if(a&&!a.resultsVisible){const g=gameResultsStep();if(g!=='proceed')return}if(!settleArcadeForNext())return;if(on)run.visited[it.uid]=run.visited[it.uid]==='played'||was?'played':'skipped'}
 else if(!leaveQuestionGuard())return;
 if(it&&!on&&!run.visited[it.uid])return planGo(run.cursor);/* deviazione, Home o classifica: si torna all'elemento della scaletta */
 const n=SP.nextPlayable(run.items,run.cursor);if(n<0)return planFinish();planGo(n);
}
function planPrev(){const run=planLive();if(!run)return;const p=SP.prevPlayable(run.items,run.cursor);if(p<0)return toast('Sei al primo elemento della scaletta.');if(state.screen==='arcade'&&state.arcade&&state.arcade.started&&!state.arcade.scoreCommitted){if(!confirm('Il gioco è in corso: lasciarlo senza assegnare punti?'))return;closeArcadeTabletRound(false)}if(!leaveQuestionGuard())return;planGo(p)}
function planResume(){const run=planLive();if(!run)return;if(planOnItem(planCurrent()))return toast('La scaletta è già in corso: usa AVANTI.');if(state.teams.length<2){toast('Aggiungi almeno due squadre.','warn');return}planGo(run.cursor>=0?run.cursor:SP.nextPlayable(run.items,-1))}
function planFinish(){const run=planLive();if(!run)return;run.finished=true;run.finishedAt=SS.nowISO();planRecord();logEvent({event:'plan.finish',reason:run.name});showFinished();toast(`✓ Scaletta «${run.name}» completata.`,'ok')}
function planExit(){const run=planLive();if(!run)return;if(!confirm(`Uscire dalla scaletta «${run.name}»?\nSquadre e punti restano; potrai riavviarla dalla SCALETTA.`))return;run.finished=true;run.finishedAt=SS.nowISO();run.stopped=true;planRecord();logEvent({event:'plan.stop',reason:run.name});renderAll();autosave('plan.stop',0);toast('Scaletta interrotta: squadre e punti restano. Ora → e PROSSIMA seguono l’ordine dell’archivio.')}
/* Lasciare un gioco: con risposte registrate i punti si confermano (mancanti = Ø, come PROSSIMA DOMANDA); senza risposte chiede conferma. */
function settleArcadeForNext(){
 const a=state.arcade;if(state.screen!=='arcade'||!a||a.scoreCommitted||(!a.played&&!a.started))return true;
 if(!state.teams.some(t=>t.id in state.pending)){if(!confirm('Nessuna risposta registrata per questa manche.\nPassare avanti senza assegnare punti?'))return false;ghClosePairRound();stopTimer();a.started=false;const rid=state.round&&state.round.roundInstanceId;closeArcadeTabletRound(false);if(rid)logEvent({event:'round.cancel',roundInstanceId:rid,reason:'manche lasciata senza risposte'});return true}
 if(!missingGuard())return false;
 commitArcadeScores();return !!a.scoreCommitted;
}
function chainAdvance(){if(!settleArcadeForNext())return;chainNext()}
/* ✕ ANNULLA ROUND / ↺ RIPETI MANCHE di un gioco: stessa manche da capo, nessun punto per il round scartato. */
function restartGameRound(){
 const a=state.arcade;if(state.screen!=='arcade'||!a)return;const committed=!!a.scoreCommitted,open=!committed&&(a.played||a.started);
 if(open&&!confirm('Annullare la manche in corso?\nLe risposte di questa manche vengono scartate e non si assegnano punti.'))return;
 const rid=state.round&&state.round.roundInstanceId;ghClosePairRound();stopTimer();
 if(rid&&open){closeArcadeTabletRound(false);logEvent({event:'round.cancel',roundInstanceId:rid,reason:'manche annullata dal docente'})}
 if(open&&a.type==='ghigliottina')voidGameRounds(a.gameId,'manche annullata: scelte A/B scartate');
 if(a.type==='chain'){a.played=false;prepareChainRound();a.scoreCommitted=false;state.round=null;clearPending();renderAll()}else loadArcadePreset(a.presetIndex,false);
 autosave('round.cancel',0);toast(committed?'✓ Manche pronta per essere ripetuta: i punti già assegnati restano.':'✓ Round annullato: la manche è pronta.','ok');
}
function revealMatchOne(){const a=state.arcade;if(!a||a.type!=='abbinamenti')return;a.revealCount=Math.min(a.cards.length,a.revealCount+1);renderAll();cloneAudio('reveal',.4)}
function revealMatchAll(){const a=state.arcade;if(!a||a.type!=='abbinamenti')return;closeArcadeTabletRound(true);a.revealCount=a.cards.length;a.started=false;stopTimer();renderAll();cloneAudio('reveal',.5)}
function gameReveal(){const a=state.arcade;if(!a)return;({photopuzzle:revealPuzzleAll,abbinamenti:revealMatchAll,indovina:revealIndovina,ghigliottina:revealGhFinal,chain:chainSolve})[a.type]?.();if(state.arcade)state.arcade.started=false;renderAll();autosave('reveal',0)}
function gameSolutionShown(a){if(!a)return false;if(a.type==='photopuzzle')return a.revealed>=(a.revealOrder||[]).length;if(a.type==='abbinamenti')return a.revealCount>=(a.cards||[]).length;if(a.type==='indovina'||a.type==='chain')return !!a.revealed;if(a.type==='ghigliottina')return !!a.revealedFinal;return false}

/* ---------------- REGIA "ONE SCREEN" (v3.7.0): STATO · AZIONE PRINCIPALE · AZIONI SECONDARIE ---------------- */
function cockpitContext(){
 const run=state.planRun,live=planLive(),pos=live?SP.position(live):null,a=state.screen==='arcade'?state.arcade:null,nx=pos&&pos.next;
 const isLast=live?pos.isLast:state.screen==='question'&&state.qIndex>=state.bank.length-1;
 const votes=side=>a&&a.votes&&a.pairRoundId?Object.values(a.votes).filter(v=>v===side).length:null;
 return {podium:podiumInfo(),boardFinal:!!(state.finalReveal&&state.finalReveal.final),missing:missingTeams().map(t=>t.name),screen:state.screen==='rules'?'home':state.screen,phase:state.phase,timerRunning:!!state.timer.running,answerVisible:!!state.answerVisible,questionScored:!!state.questionScored,canUndo:state.pendingHistory.length>0&&canEnter(),teams:state.teams.length,isLast,
  plan:run?{finished:!!run.finished,nextTitle:nx?(nx.kind==='game'?'🎮 ':'')+((nx.preview&&nx.preview.title)||'')+(nx.duplicateOf?' (di nuovo)':''):'',position:pos?`${Math.max(1,pos.current)} / ${pos.total}`:''}:null,
  arcade:a?{type:a.type,name:gameName(a.type),curtain:!!a.curtain,resultsVisible:!!a.resultsVisible,played:!!a.played,started:!!a.started,final:!!a.final,pairSelected:a.type==='ghigliottina'&&!a.final&&!!(a.pairs&&a.pairs[a.step]||{}).selected,votesA:votes('A'),votesB:votes('B'),solutionShown:gameSolutionShown(a),scoreCommitted:!!a.scoreCommitted,chainHasNext:a.type==='chain'&&a.index<(a.links||[]).length-1,
   canAid:{piece:a.revealed<(a.revealOrder||[]).length,matchOne:a.revealCount<(a.cards||[]).length,clue:a.visible<(a.clues||[]).length,eliminate:(a.candidates||[]).some((_,i)=>i!==a.answerIndex&&!(a.eliminated||[]).includes(i)),letter:a.visibleHelp<(a.helpPositions||[]).length}}:null};
}
function renderCockpit(){
 const box=$('#cockpit');if(!box)return;const m=RC.cockpit(cockpitContext()),live=planLive();box.dataset.stage=m.stage;
 const btn=(x,cls)=>`<button type="button" class="btn ${x.tone} ${cls}" data-act="${x.act}"${x.id?` id="${x.id}"`:''}${x.disabled?' disabled':''}${x.title?` title="${esc(x.title)}"`:''}><span>${esc(x.label)}${x.kbd?` <kbd>${esc(x.kbd)}</kbd>`:''}</span>${x.sub?`<small>${esc(x.sub)}</small>`:''}</button>`;
 const main=$('#cockpitMain'),sec=$('#cockpitSecondary'),st=$('#cockpitStatus');
 main.className='cockpitMain'+(m.main.length>1?' split':'');const tip=($('#directorHint')||{}).textContent||'';main.innerHTML=m.main.map(x=>btn(x.title||!tip?x:Object.assign({},x,{title:tip}),'xl')).join('');
 sec.innerHTML=m.secondary.map(x=>btn(x,'')).join('');sec.hidden=!m.secondary.length;
 const chips=[];
 if(live){const p=SP.position(live);chips.push(`<span class="ckChip plan"><span class="ckName" title="${esc(live.name)}">📋 ${esc(live.name)}</span><b>${Math.max(1,p.current)} / ${p.total}</b><button type="button" class="ckExit" data-act="exitPlan" title="Esci dalla scaletta" aria-label="Esci dalla scaletta">✕</button></span>`)}
 if(m.showAnswers&&state.teams.length){const n=state.teams.filter(t=>t.id in state.pending).length;chips.push(`<span class="ckChip ${n===state.teams.length?'ok':''}">✍ Risposte <b>${n} / ${state.teams.length}</b></span>`)}
 if((state.screen==='question'||state.screen==='arcade')&&state.session){const low=RC.freeOmissionAlert(state.teams,SS.committedOmissionCounts(state.session),FREE_OMISSIONS);if(low.length)chips.push(`<span class="ckChip warn" title="Astensioni gratuite rimaste (su ${FREE_OMISSIONS}): dopo vale come errore">Ø gratis: ${low.map(x=>`${esc(x.name)} <b>${x.left}</b>`).join(' · ')}</span>`)}
 const miss=m.stage!=='home'?missingTeams():[];if(miss.length)chips.push(`<span class="ckChip warn">⚠ Senza risposta: ${miss.map(t=>esc(t.name)).join(', ')}</span>`);
 const ready=m.stage==='home'?readinessHTML():'';st.innerHTML=ready+chips.join('');st.hidden=!ready&&!chips.length;
 const sq=$('#startQuizBtn');if(sq){sq.textContent=live?'▶ RIPRENDI SCALETTA':'▶ AVVIA QUIZ';sq.disabled=!!live&&planOnItem(planCurrent())}
}
function cockpitAction(act){
 const t=state.arcade&&state.arcade.type;
 const map={startQuiz,planResume,openPlanner:()=>openPlanner(),exitPlan:planExit,launch:startQuestion,pause:togglePause,add10:()=>addSeconds(10),closeTime:finishQuestion,reveal:revealQuestion,next:nextQuestion,edit:editCurrentQuestion,cancel:cancelQuestion,repeat:repeatQuestion,reopen:reopenScores,undo:undoPending,home:showHome,report:exportReport,
  gameEnter,curtainOff,curtainOn,gameStart:()=>({photopuzzle:startPhoto,abbinamenti:startMatching,indovina:startIndovina,ghigliottina:startGh,chain:startChain})[t]?.(),gameReveal,piece:()=>removePuzzlePiece(),matchOne:revealMatchOne,clue:nextClue,eliminate:eliminateTwo,letter:chainRevealOne,chainNext:chainAdvance,ghA:()=>chooseGh('A'),ghB:()=>chooseGh('B'),gameRestart:restartGameRound,revealNext:revealNextPlace,revealAll:revealAllPlaces,endGame,leaderboard:()=>showLeaderboard({final:true}),addTeams:()=>{const i=$('#teamName');if(i)i.focus()},openShow:openPublic,connectTablets:()=>toggleJoinScreen(),chooseContent:()=>PKG&&PKG.open()};
 const f=map[act];if(f)f();renderCockpit();
}
function onCockpitClick(e){const b=e.target.closest('[data-act]');if(!b||b.disabled)return;b.blur();cockpitAction(b.dataset.act)}

/* ---------------- IMPORTA CONTENUTI (v3.7.3) ----------------
   Un solo ingresso per qualunque file (pulsante, ARCHIVIO, GIOCHI, trascinamento): il tipo si riconosce dal contenuto (PL.contentKind).
   Archivio domande / giochi .json = SOSTITUZIONE del blocco del pacchetto attivo (mai unione), con riepilogo e backup proposto prima.
   Pacchetto .zip/.json = installazione nella libreria (stesso flusso di PACCHETTI). Scaletta = aggiunta alle scalette. */
let importStep=null;
function importBusyReason(){if(state.screen==='question'&&(state.phase==='running'||RC.roundOpen(state))||state.screen==='arcade'&&state.arcade&&state.arcade.started)return 'C’è una domanda o un gioco in corso: chiudilo prima di sostituire i contenuti.';if(state.mixed)return 'Sessione mista: attiva un solo pacchetto (PACCHETTI → ATTIVA) per sostituirne domande o giochi.';return ''}
function openImportDialog(step){importStep=step||{kind:'choose'};const dlg=$('#importDialog');if(!dlg)return;renderImportDialog();if(!dlg.open)dlg.showModal()}
async function importContent(file){
 if(!file)return;const name=file.name||'file';
 if(/\.zip$/i.test(name))return openImportDialog({kind:'pack',file,name});
 if(!/\.json$/i.test(name))return openImportDialog({kind:'unknown',name,detail:'Il Secchione importa file .json (archivi domande, giochi, scalette) e .zip (pacchetti completi).'});
 let data;try{data=JSON.parse(String(await file.text()).replace(/^﻿/,''))}catch(e){return openImportDialog({kind:'unknown',name,detail:'Il file non è un .json leggibile.'})}
 const c=PL.contentKind(data);
 if(c.kind==='pack')return openImportDialog({kind:'pack',file,name});
 if(c.kind==='results')return openImportDialog({kind:'results',name});
 if(c.kind==='plan'){const r=SP.normalize(data);return openImportDialog(r.ok?{kind:'plan',name,plan:r.plan,dropped:r.dropped}:{kind:'unknown',name,detail:r.error})}
 if(c.kind==='questions'||c.kind==='games'){
  const busy=importBusyReason();if(busy)return openImportDialog({kind:'blocked',name,detail:busy});
  if(c.kind==='questions'){const res=PE.importV3Questions(c.list,pack(),()=>SS.uuid());if(res.errors.length||!res.questions.length)return openImportDialog({kind:'invalid',name,what:'archivio domande',errors:res.errors.length?res.errors:['nessuna domanda nel file']});return openImportDialog({kind:'questions',name,questions:res.questions,packId:state.packKey,packTitle:pack().title,before:state.bank.length})}
  const res=PE.importV3Games(data,pack());const plan=res.games?PL.replaceGames(pack().arcadeSets,res.games):null;if(res.errors.length||!plan||!plan.imported)return openImportDialog({kind:'invalid',name,what:'archivio giochi',errors:res.errors.length?res.errors:['nessuna manche nel file']});
  return openImportDialog({kind:'games',name,games:plan.games,rows:plan.rows,replacedTypes:plan.replacedTypes,imported:plan.imported,packId:state.packKey,packTitle:pack().title});
 }
 return openImportDialog({kind:'unknown',name,detail:'Non riconosco il contenuto di questo file.'});
}
function importKindsHTML(){return `<ul class="impKinds"><li><b>📄 Archivio domande</b> (.json, da ARCHIVIO → ESPORTA) → <i>sostituisce</i> le domande del pacchetto attivo</li><li><b>🎮 Archivio giochi</b> (.json, da GIOCHI → ESPORTA GIOCHI) → <i>sostituisce</i> le manche dei tipi presenti nel file</li><li><b>📦 Pacchetto completo</b> (.zip) → viene installato nella libreria pacchetti</li><li><b>📋 Scaletta</b> (.json, da SCALETTA → ESPORTA) → viene aggiunta alle tue scalette</li></ul>`}
function importBackupHTML(what){return `<div class="impWarn"><b>⚠ Sostituzione, non unione.</b> ${what} Prima puoi salvarne una copia sul PC.</div><div class="impActions"><button class="btn amber xl" data-imp="backup">⬇ ESPORTA BACKUP PRIMA DI CONTINUARE<small>salva il file di backup, poi importa</small></button><button class="btn red" data-imp="go">CONTINUA SENZA BACKUP</button><button class="btn ghost" data-imp="cancel">ANNULLA</button></div>`}
function renderImportDialog(){
 const s=importStep||{kind:'choose'},b=$('#importBody');if(!b)return;const file=s.name?`<code>${esc(s.name)}</code>`:'';let h='';
 if(s.kind==='choose')h=`<p class="impLead">Scegli un file: Il Secchione capisce da solo che cosa contiene e ti dice dove andrà, prima di cambiare qualcosa.</p>${importKindsHTML()}<div class="impActions"><label class="btn primary xl fileLabel">📂 SCEGLI IL FILE (.json o .zip)<input type="file" accept=".json,.zip,application/json,application/zip" data-imp="file"></label></div><p class="help">Puoi anche trascinare il file in un punto qualsiasi della regia.</p>`;
 else if(s.kind==='questions')h=`<p class="impWhat">📄 Hai selezionato un <b>archivio domande</b> (.json) ${file}: <b>${s.questions.length} domande</b>.</p><p class="impWhere">Verranno sostituite le <b>${s.before} domande</b> del pack attivo: <b>${esc(s.packTitle)}</b>.</p><ol class="impPreview">${s.questions.slice(0,3).map(q=>`<li>${esc(q.question)}</li>`).join('')}${s.questions.length>3?`<li class="more">… e altre ${s.questions.length-3}</li>`:''}</ol>${importBackupHTML('Le domande attuali verranno sostituite da quelle del file.')}`;
 else if(s.kind==='games')h=`<p class="impWhat">🎮 Hai selezionato un <b>archivio giochi</b> (.json) ${file}: <b>${s.imported} manche</b>.</p><p class="impWhere">Verranno sostituiti i giochi del pack attivo: <b>${esc(s.packTitle)}</b>. I tipi di gioco assenti dal file restano come sono.</p><table class="impTable"><thead><tr><th>Gioco</th><th>Ora</th><th>Nel file</th><th>Dopo</th></tr></thead><tbody>${s.rows.map(r=>`<tr class="${r.replaced?'rep':''}"><td>${esc(gameName(r.type))}</td><td>${r.before}</td><td>${r.inFile||'—'}</td><td><b>${r.after}</b> ${r.replaced?'<i>sostituito</i>':'<i class="keep">resta</i>'}</td></tr>`).join('')}</tbody></table>${importBackupHTML('Le manche attuali dei tipi evidenziati verranno sostituite da quelle del file.')}`;
 else if(s.kind==='pack')h=`<p class="impWhat">📦 Hai selezionato un <b>pacchetto completo</b> ${file}.</p><p class="impWhere">Verrà installato nella <b>libreria pacchetti</b>. Il pack attivo, le squadre e i punti non cambiano: dopo potrai attivarlo.</p><div class="impActions"><button class="btn green xl" data-imp="go">📦 INSTALLA IL PACCHETTO</button><button class="btn ghost" data-imp="cancel">ANNULLA</button></div>`;
 else if(s.kind==='plan')h=`<p class="impWhat">📋 Hai selezionato una <b>scaletta</b> ${file}: <b>«${esc(s.plan.name)}»</b>, ${s.plan.items.length} ${s.plan.items.length===1?'elemento':'elementi'}.</p><p class="impWhere">Verrà aggiunta alle tue scalette (pulsante 📋 SCALETTA). Domande e giochi dei pacchetti non cambiano.</p>${s.dropped?`<p class="help">${s.dropped===1?'1 elemento illeggibile verrà scartato':s.dropped+' elementi illeggibili verranno scartati'}.</p>`:''}<div class="impActions"><button class="btn green xl" data-imp="go">📋 AGGIUNGI LA SCALETTA</button><button class="btn ghost" data-imp="cancel">ANNULLA</button></div>`;
 else if(s.kind==='results')h=`<p class="impWhat">📊 ${file} è un file di <b>risultati / partita</b> (JSON completo), non un contenuto da importare.</p><p class="impWhere">Le partite si riprendono da sole all’avvio (PARTITA NON CONCLUSA TROVATA). Per le domande usa il file esportato da ARCHIVIO → ESPORTA.</p>${importKindsHTML()}<div class="impActions"><label class="btn primary fileLabel">SCEGLI UN ALTRO FILE<input type="file" accept=".json,.zip" data-imp="file"></label><button class="btn ghost" data-imp="cancel">CHIUDI</button></div>`;
 else if(s.kind==='blocked')h=`<p class="impWhat">⏸ ${file}</p><p class="impWhere">${esc(s.detail)}</p><div class="impActions"><button class="btn ghost" data-imp="cancel">CHIUDI</button></div>`;
 else if(s.kind==='invalid')h=`<p class="impWhat">✗ ${file} sembra un <b>${esc(s.what)}</b>, ma non si può importare:</p><ul class="impErrors">${s.errors.slice(0,6).map(e=>`<li>${esc(e)}</li>`).join('')}</ul><p class="help">Nessun contenuto è stato modificato.</p><div class="impActions"><label class="btn primary fileLabel">SCEGLI UN ALTRO FILE<input type="file" accept=".json,.zip" data-imp="file"></label><button class="btn ghost" data-imp="cancel">CHIUDI</button></div>`;
 else if(s.kind==='working')h=`<p class="impWhat">⏳ ${esc(s.detail||'Importazione in corso…')}</p>`;
 else if(s.kind==='done')h=`<p class="impWhat ${s.ok?'ok':'bad'}">${s.ok?'✓':'✗'} ${esc(s.message)}</p>${s.detail?`<p class="impWhere">${esc(s.detail)}</p>`:''}${s.backup?`<p class="help">Backup salvato: <code>${esc(s.backup)}</code> (cartella Download).</p>`:''}<div class="impActions">${s.activateId?`<button class="btn green xl" data-imp="activate" data-id="${esc(s.activateId)}">● ATTIVA ORA</button>`:''}${s.openPlan?`<button class="btn primary" data-imp="openPlan">📋 APRI LA SCALETTA</button>`:''}<button class="btn ghost" data-imp="cancel">CHIUDI</button></div>`;
 else h=`<p class="impWhat">✗ ${file} non è un contenuto del Secchione.</p><p class="impWhere">${esc(s.detail||'')}</p>${importKindsHTML()}<div class="impActions"><label class="btn primary fileLabel">SCEGLI UN ALTRO FILE<input type="file" accept=".json,.zip" data-imp="file"></label><button class="btn ghost" data-imp="cancel">CHIUDI</button></div>`;
 b.innerHTML=h;
}
function importBackup(s){
 if(s.kind==='questions'){const n=`backup_domande_${s.packId}_${stamp()}.json`;download(n,JSON.stringify(state.bank,null,2),'application/json');return n}
 if(s.kind==='games'){const n=`backup_giochi_${s.packId}_${stamp()}.json`;download(n,JSON.stringify({format:'secchione-games',version:3,pack:s.packId,games:Object.fromEntries(PE.GAME_TYPES.map(k=>[k,(pack().arcadeSets[k]||[]).map(PL.cleanGameSet)]))},null,2),'application/json');return n}
 return null;
}
async function runImport(withBackup){
 const s=importStep;if(!s)return;let backup=null;
 if(withBackup)backup=importBackup(s);
 importStep={kind:'working',detail:s.kind==='pack'?'Installazione del pacchetto…':'Salvataggio nel pacchetto…'};renderImportDialog();
 let out;
 try{
  if(s.kind==='questions'){
   if(state.packKey!==s.packId||state.mixed)throw new Error('il pacchetto attivo è cambiato: riprova');
   const qs=s.questions.map(q=>{const x=PL.storedQuestion(q);x.id=PL.storedQuestionId(x.id);return x});
   state.bank=s.questions;bankChanged();
   const r=await savePackQuestions(s.packId,{all:qs});
   if(r.where==='pack')await refreshLibrary();
   loadBank();renderAll();logEvent({event:'content.import',reason:`domande ${qs.length} → ${s.packId}`});
   out={ok:!!r.ok,message:`Hai importato ${qs.length} ${qs.length===1?'domanda':'domande'} nel pack attivo: ${s.packTitle}`,detail:r.where==='pack'?`Salvate nel pacchetto (versione ${r.version}): restano anche chiudendo il programma. La versione precedente è conservata nel cestino dei pacchetti.`:`Salvate in questo browser (${r.reason}).`};
  }else if(s.kind==='games'){
   if(state.packKey!==s.packId||state.mixed)throw new Error('il pacchetto attivo è cambiato: riprova');
   const r=await savePackGames(s.packId,s.games);
   if(state.screen==='arcade')showHome();renderAll();logEvent({event:'content.import',reason:`giochi ${s.imported} (${s.replacedTypes.join(', ')}) → ${s.packId}`});
   out={ok:!!r.ok,message:`Hai importato ${s.imported} ${s.imported===1?'gioco':'giochi'} nel pack attivo: ${s.packTitle}`,detail:(r.where==='pack'?`Salvati nel pacchetto (versione ${r.version}): restano anche chiudendo il programma. La versione precedente è conservata nel cestino dei pacchetti.`:`Salvati in questo browser (${r.reason}).`)+` Sostituiti: ${s.replacedTypes.map(gameName).join(', ')}.`};
  }else if(s.kind==='pack'){
   const r=await PKC.importFile(s.file);await refreshLibrary();renderAll();if(PKG&&PKG.render)PKG.render();
   if(r&&r.action==='installed')out={ok:true,message:'Pacchetto installato correttamente',detail:`«${r.summary.title}»: ${r.summary.questions} domande, ${r.summary.games} manche.${r.renamedFrom?` Esisteva già un pacchetto con id «${r.renamedFrom}»: è rimasto invariato, il nuovo ha id «${r.id}».`:''} Lo trovi anche in PACCHETTI.`,activateId:r.id};
   else if(r&&r.action==='already-installed')out={ok:true,message:'Questo pacchetto è già installato',detail:`Id «${r.id}»: nessuna modifica.`,activateId:r.id};
   else out={ok:false,message:'Pacchetto non installato',detail:((r&&r.errors)||['file non valido']).slice(0,3).join(' · ')};
  }else if(s.kind==='plan'){
   const p=C.clone(s.plan);if(savedPlans.some(x=>x.id===p.id)){const fresh=SP.createPlan(p.name+' (importata)');p.id=fresh.id;p.name=fresh.name}
   savedPlans=SP.upsert(savedPlans,p);savePrefs();renderAll();
   out={ok:true,message:`Scaletta «${p.name}» aggiunta`,detail:`${p.items.length} ${p.items.length===1?'elemento':'elementi'}. La trovi in 📋 SCALETTA.`,openPlan:p.id};
  }
 }catch(e){out={ok:false,message:'Importazione non riuscita',detail:e.message}}
 importStep=Object.assign({kind:'done',backup},out);renderImportDialog();toast((out.ok?'✓ ':'✗ ')+out.message,out.ok?'ok':'err');
}
function onImportClick(e){const t=e.target.closest('[data-imp]');if(!t||t.tagName==='INPUT'||t.disabled)return;const a=t.dataset.imp;
 if(a==='cancel'){$('#importDialog').close();importStep=null;return}
 if(a==='backup')return runImport(true);if(a==='go')return runImport(false);
 if(a==='activate'){const r=activatePacks([t.dataset.id]);$('#importDialog').close();if(r&&!r.ok)toast(r.error,'warn');return}
 if(a==='openPlan'){const id=importStep&&importStep.openPlan;$('#importDialog').close();openPlanner(id);return}}
/* Giochi nel pacchetto installato (stessa fonte unica delle domande); se il pacchetto è in sola lettura restano in questo browser. */
function savePackGames(packId,games){
 const job=async()=>{
  const fallback=reason=>{customGames[packId]=Object.fromEntries(PE.GAME_TYPES.map(t=>[t,C.clone(games[t]||[])]).filter(([,l])=>l.length));savePrefs();P=buildPacks();if(state.mixed)state.mixPack=buildMixPack(activeRuntimes());return {ok:true,where:'browser',reason}};
  if(!PS||!PKC)return fallback('editor dei pacchetti non disponibile');
  let r;try{r=await PKC.openBytes(packId)}catch(e){r={ok:false}}
  if(!r||!r.ok)return fallback('pacchetto del programma in sola lettura');
  try{
   const d=PS.draftFromImport(PL.readImport(r.filename,r.bytes),{libraryId:packId});
   PE.GAME_TYPES.forEach(t=>{d.games[t]=(games[t]||[]).map(PL.cleanGameSet)});
   d.manifest.version=PS.bumpVersion(d.manifest.version);
   const s=await PKC.save(packId,PS.toZip(d).bytes,'replace');
   if(!s||!s.ok)throw new Error((s&&s.errors&&s.errors[0])||'salvataggio non riuscito');
   if(customGames[packId]){delete customGames[packId];savePrefs()}
   await refreshLibrary();
   return {ok:true,where:'pack',version:d.manifest.version,backup:s.backup||null};
  }catch(e){return fallback(e.message)}
 };
 packSaveChain=packSaveChain.then(job,job);return packSaveChain;
}

/* ---------------- CLASSIFICA FINALE: reveal condotto dalla regia, dall'ultimo al primo (v3.7.3) ----------------
   Stessa grammatica della classifica del round (intestazione, cerchi di posizione, colori del podio); qui ogni AVANTI
   rivela UNA posizione e il 1° posto arriva per ultimo. Il ★ CLASSIFICA a metà partita mostra subito tutto. */
function teamOutcomeStats(){const s=state.session,out={};if(!s)return out;const done={};(s.rounds||[]).forEach(r=>{if(r.committed)done[r.roundInstanceId]=true});(s.responses||[]).forEach(r=>{if(r.voided||!done[r.roundInstanceId])return;let o;try{o=SC.normalizeOutcome(r.outcome)}catch(e){return}const x=out[r.participantId]=out[r.participantId]||{correct:0,wrong:0,omitted:0};x[o]++});return out}
function finalStandings(){const stats=teamOutcomeStats(),sorted=[...state.teams].sort((a,b)=>(b.score||0)-(a.score||0)||String(a.name).localeCompare(String(b.name),'it'));let rank=0,prev=null;const rows=sorted.map((t,i)=>{if(prev===null||t.score!==prev){rank=i+1;prev=t.score}return {id:t.id,name:t.name,score:t.score||0,rank,stats:stats[t.id]||{correct:0,wrong:0,omitted:0}}});rows.forEach(r=>{r.tie=rows.filter(x=>x.rank===r.rank).length>1});return rows}
function podiumInfo(){const f=state.finalReveal;if(state.screen!=='leaderboard'||!f)return null;const rows=finalStandings(),total=rows.length,shown=Math.min(f.shown,total),next=rows[total-shown-1];return {shown,total,nextRank:next?next.rank:1}}
function revealNextPlace(){const f=state.finalReveal,p=podiumInfo();if(!f||!p||p.shown>=p.total)return;f.shown=p.shown+1;f.lastAt=Date.now();const winner=f.shown>=p.total;renderAll();cloneAudio(winner?'final':'reveal',winner?.95:.62);if(winner)logEvent({event:'leaderboard.final',reason:'primo posto rivelato'});autosave('podium',0)}
function revealAllPlaces(){const f=state.finalReveal;if(!f)return;f.shown=state.teams.length;f.lastAt=0;renderAll();autosave('podium',0)}

/* ---------------- TRAINING EDITION 1.0 RC1 ---------------- */
/* Nel round c'è almeno una risposta raccolta a mano (non un'omissione riempita in automatico)? Allora le corrette sono
   ex aequo e non c'è bonus di velocità: la regola vive in engine/scoring.js (stessa per regia e server). */
function manualRound(){return state.teams.some(t=>{if(!(t.id in state.pending))return false;const m=state.entryMeta[t.id]||{};return m.inputMode==='manual'&&!m.auto})}
/* RC2-A: nel profilo a velocità solo una CORRETTA inserita a mano toglie il bonus a tutto il round. */
function speedProfile(){return SC.getProfile(profileId()).correct.mode==='speed'}
/* RC2-A.2: vale solo se nel micro-round ha risposto anche un tablet; senza tablet le corrette prendono il rango (300, 290…). Round senza scala (RC2-A.1): regola di allora. */
function speedOffRound(){if(!speedProfile())return false;const recs=previewRecords();if(!SC.hasManualCorrect(recs))return false;return !scoreOptions().scale||SC.hasTabletAnswer(recs)}
function fmtSec(ms){return (Math.round(ms/100)/10).toFixed(1).replace('.',',')+' s'}
/* Squadre ancora senza risposta nel round in raccolta. A tempo aperto le squadre con il tablet non contano:
   alla chiusura diventano Ø automatiche come sempre. */
function missingTeams(){
 const qOpen=state.screen==='question'&&!!state.round&&!state.questionScored&&state.phase!=='preview';
 const aOpen=state.screen==='arcade'&&!!state.arcade&&(state.arcade.played||state.arcade.started)&&!state.arcade.scoreCommitted&&state.teams.some(t=>t.id in state.pending);
 if(!qOpen&&!aOpen)return [];
 const bound=qOpen&&state.phase==='running'?NET.boundTeamIds():{};
 return state.teams.filter(t=>!(t.id in state.pending)&&!bound[t.id]);
}
/* Prima di trasformare in Ø le risposte mancanti: un avviso con i nomi; il secondo AVANTI conferma. */
function missingGuard(){const miss=missingTeams(),rid=state.round&&state.round.roundInstanceId;if(!miss.length||!rid||state.missingWarned===rid)return true;state.missingWarned=rid;renderAll();toast(`⚠ Senza risposta: ${miss.map(t=>t.name).join(', ')}. Inseriscile, oppure premi di nuovo AVANTI: diventano Ø (astensione).`,'warn');logEvent({event:'missing.warned',roundInstanceId:rid,reason:miss.map(t=>t.name).join(', ')});return false}
/* Photopuzzle: punto focale validato dal motore (PE.photoFocus); l'immagine riempie la cornice e resta inquadrato questo punto. */
function puzzleFocus(v){return PE.photoFocus(v)||'50% 50%'}
/* Checklist "PRONTO PER LA LEZIONE" nella Home della regia: solo dati che la regia ha già. */
/* RC2-A.1: "2 tablet collegati · 4 squadre manuali" invece di "2 / 2 collegate" quando non tutte le squadre hanno un tablet. */
function tabletSummary(bound,on){const manual=state.teams.filter(t=>!bound.some(d=>d.participantId===t.id)).length,n=on.length;
 const tabs=on.length===bound.length?`${n} ${n===1?'tablet collegato':'tablet collegati'}`:`${n} di ${bound.length} tablet collegati`;
 return manual?`${tabs} · ${manual} ${manual===1?'squadra manuale':'squadre manuali'}`:tabs}
function readinessItems(){
 const st=NET.status(),room=NET.room?NET.room():{},main=(room.urls||[])[0],bound=NET.devices().filter(d=>d.participantId),on=bound.filter(d=>d.connected);
 const showOpen=!!(publicWindow&&!publicWindow.closed)||(st.showClients||0)>0,live=planLive(),net=st.available&&st.connected;
 return [
  {state:!st.available?'opt':st.connected?'ok':'bad',label:'Programma',detail:!st.available?'aperto senza server: niente tablet, le risposte le registri tu':st.connected?(main?'pronto · tablet su '+main.player.replace(/^https?:\/\//,''):'pronto · nessuna rete per i tablet'):'non raggiungibile: chiudi e riapri AVVIA_IL_SECCHIONE'},
  {state:state.teams.length>=2?'ok':'todo',label:'Squadre',detail:state.teams.length>=2?state.teams.length+' squadre':'aggiungine almeno 2 (colonna a sinistra)',act:state.teams.length>=2?'':'addTeams',actLabel:'AGGIUNGI'},
  {state:showOpen?'ok':'todo',label:'Proiettore',detail:showOpen?'schermo del proiettore aperto':'apri lo schermo e portalo sul proiettore',act:showOpen?'':'openShow',actLabel:'APRI'},
  {state:!net?'opt':bound.length?(on.length===bound.length?'ok':'warn'):'opt',label:'Pulsantiere',detail:!net?'facoltative':bound.length?tabletSummary(bound,on):'facoltative',act:net?'connectTablets':'',actLabel:state.showJoin?'NASCONDI QR':'QR SUL PROIETTORE'},
  {state:'ok',label:'Contenuti',detail:live?`scaletta «${live.name}»`:(state.mixed?'più pacchetti':pack().title),act:'chooseContent',actLabel:'CAMBIA'}
 ];
}
function readinessHTML(){const mark={ok:'✓',bad:'✗',warn:'!',opt:'·',todo:'○'};return `<div class="readyList"><small class="readyTitle">PRONTO PER LA LEZIONE</small>${readinessItems().map(i=>`<div class="readyItem ${i.state}"><i aria-hidden="true">${mark[i.state]}</i><span><b>${esc(i.label)}</b> ${esc(i.detail)}</span>${i.act?`<button type="button" class="btn tiny ghost" data-act="${i.act}">${esc(i.actLabel)}</button>`:''}</div>`).join('')}</div>`}
/* QR e PIN a tutto schermo sul proiettore (solo in Home, con il server attivo). */
function toggleJoinScreen(force){state.showJoin=typeof force==='boolean'?force:!state.showJoin;renderAll();if(state.showJoin&&DEV)DEV.open()}
function joinHTML(){
 const room=NET.room?NET.room():{},main=(room.urls||[])[0],on=NET.devices().filter(d=>d.participantId&&d.connected).length,target=main?main.player+'?pin='+room.pin:'';
 let qr='';try{qr=target&&window.SecchioneQR?window.SecchioneQR.svgFor(target,'M'):''}catch(e){qr=''}
 return `<div class="joinScene"><header class="resultHeader joinHeader"><div><span class="showEyebrow">IL SECCHIONE · PULSANTIERE</span><h1>COLLEGATE I TABLET</h1></div><div class="revealDirection"><small>COLLEGATE</small><strong>${on} / ${state.teams.length}</strong></div><img src="${BRAND_LOGO}" alt="Il Secchione"></header><main class="joinMain"><div class="joinQr">${qr||'<p>Nessuna rete locale</p>'}</div><div class="joinInfo"><ol><li>Collegate il tablet alla <b>stessa rete Wi-Fi</b> del computer.</li><li>Inquadrate il QR, oppure aprite<br><b class="joinUrl">${esc(main?main.player.replace(/^https?:\/\//,''):'—')}</b></li><li>Scegliete la vostra squadra e aspettate il docente.</li></ol><div class="joinPin"><small>PIN</small><b>${esc(room.pin||'—')}</b></div></div></main></div>`;
}
/* TERMINA PARTITA: archivia (come NUOVA PARTITA), così al prossimo avvio non compare "partita non conclusa"; le squadre restano. */
function endGame(){
 const msg=(state.reportExported?'':'Il report di classe non è ancora stato esportato: puoi farlo prima con 📄 REPORT DI CLASSE.\n\n')+'Terminare la partita?\nViene archiviata: al prossimo avvio non comparirà come «partita non conclusa». Le squadre restano.';
 if(!confirm(msg))return;
 STORE.archiveSnapshot(buildSnapshot('end.game'));logEvent({event:'session.close',reason:'termina partita'});
 newSession(true);state.session.afterEnd=true;state.completedRounds={};state.planRun=null;state.round=null;state.finalReveal=null;state.contentDone=false;state.reportExported=false;state.showJoin=false;
 recomputeScores();showHome();autosave('end.game',0);toast('✓ Partita terminata e archiviata. Pronti per la prossima.','ok');
}

/* ---------------- TIMER (modello in engine/timer.js) ---------------- */
function resetTimer(duration){stopTimer();state.timer=TM.create(TM.secondsFor(duration));updateTimerUI()}
function startTimer(bed='timerBed'){if(state.timer.running)return;TM.start(state.timer,performance.now());if(!state.timer.running)return;renderTeams();animateMascots();cloneAudio('timer',.78);playBed(bed);timerTick();renderCockpit()}
function pauseTimerCore(){TM.pause(state.timer,performance.now());if(timerRAF)cancelAnimationFrame(timerRAF);timerRAF=null;stopBed();updateTimerUI()}
function togglePause(){
 if(state.screen==='question'&&state.phase==='running'){
  const id=state.round&&state.round.roundInstanceId;
  if(state.timer.running){pauseTimerCore();NET.pauseRound(id);logEvent({event:'round.pause',roundInstanceId:id});toast('Tempo in pausa.')}
  else{startTimer('timerBed');NET.resumeRound(id,Math.round(state.timer.remaining*1000));logEvent({event:'round.resume',roundInstanceId:id})}
  renderPrivate();renderDirectorDeck();autosave('pause',0);return;
 }
 if(!state.arcade?.played||state.timer.remaining<=0)return;const aid=state.round&&state.round.kind==='arcade'?state.round.roundInstanceId:null;if(!state.timer.running){startTimer(currentBed());if(aid)NET.resumeRound(aid,Math.round(state.timer.remaining*1000));return}pauseTimerCore();if(aid)NET.pauseRound(aid);
}
function addSeconds(sec){
 const okQ=state.screen==='question'&&state.phase==='running',okA=state.screen==='arcade'&&state.arcade?.played&&state.timer.remaining>0;
 if(!okQ&&!okA)return;TM.addTime(state.timer,sec,performance.now());
 /* RC2-A: il tempo disponibile del round (base del bonus velocità) comprende i secondi aggiunti, per tutte le squadre. */
 if(state.round)state.round.availableMs=Math.round(state.timer.duration*1000);
 if(okQ){NET.addTime(state.round&&state.round.roundInstanceId,sec*1000);logEvent({event:'round.addTime',roundInstanceId:state.round&&state.round.roundInstanceId,reason:`+${sec}s`})}
 if(okA&&state.round&&state.round.kind==='arcade')NET.addTime(state.round.roundInstanceId,sec*1000);
 updateTimerUI();toast(`+${sec} secondi`);
}
function stopTimer(){TM.pause(state.timer,performance.now());if(timerRAF)cancelAnimationFrame(timerRAF);timerRAF=null;stopBed();renderTeams();animateMascots();renderCockpit()}
function currentBed(){if(state.screen==='arcade'){if(state.arcade?.type==='chain')return'chainBed';if(state.arcade?.type==='indovina')return'indovinaBed';if(state.arcade?.type==='ghigliottina')return'ghBed'}return'timerBed'}
/* Un passo del timer. RAF per la fluidità; un intervallo di riserva continua a contare anche se il browser sospende RAF (finestra ridotta a icona). */
let lastTimerStep=0;
function timerStep(){if(!state.timer.running)return false;const now=performance.now();lastTimerStep=now;state.timer.remaining=TM.remaining(state.timer,now);const sec=Math.ceil(state.timer.remaining);if(sec>0&&sec<=10&&sec!==state.timer.lastSecond){state.timer.lastSecond=sec;cloneAudio(sec<=5?'urgent':'tick',sec<=5?.95:.68)}arcadeTimerTick(TM.elapsed(state.timer,now));updateTimerUI();if(state.timer.remaining<=0){stopTimer();cloneAudio('timeup',.92);timerEnded();return false}return true}
function timerTick(){if(timerStep())timerRAF=requestAnimationFrame(timerTick)}
setInterval(()=>{if(state.timer.running&&performance.now()-lastTimerStep>350)timerStep()},250);
function timerStatus(){const sec=Math.ceil(state.timer.remaining);if(state.timer.running)return sec<=5?'ULTIMI SECONDI':'IN CORSO';if(state.screen==='question'&&state.phase==='preview')return 'PRONTO';if(state.screen==='question'&&state.phase==='running')return 'IN PAUSA';if(state.screen==='arcade'&&state.arcade?.started)return 'PAUSA';if(state.screen==='question')return 'TEMPO CHIUSO';return 'PRONTO'}
function updateTimerUI(){animateMascots();const t=fmt(state.timer.remaining),pct=state.timer.duration?Math.max(0,Math.min(100,state.timer.remaining/state.timer.duration*100)):0,sec=Math.ceil(state.timer.remaining);const status=timerStatus();const ctl=$('#controlTimer'),bar=$('#controlTimerBar');if(ctl)ctl.textContent=t;if(bar)bar.style.width=`${pct}%`;stageDocs().forEach(d=>{d.querySelectorAll('.liveTimer').forEach(e=>e.textContent=t);d.querySelectorAll('.liveSeconds').forEach(e=>e.textContent=Math.max(0,Math.ceil(state.timer.remaining)));d.querySelectorAll('.liveProgress').forEach(e=>e.style.width=`${pct}%`);d.querySelectorAll('.timerWords strong').forEach(e=>e.textContent=status);d.querySelectorAll('.publicTimerRing').forEach(e=>e.style.setProperty('--pct',pct));d.querySelectorAll('.publicTimerHud').forEach(e=>{e.classList.toggle('urgent',sec<=10&&sec>5&&state.timer.running);e.classList.toggle('critical',sec<=5&&state.timer.running)});d.querySelectorAll('.publicPhase').forEach(e=>{if(state.timer.running)e.textContent=sec<=5?'ULTIMI SECONDI':'IN CORSO'})});const dt=$('#directorTimer'),db=$('#directorTimerBar'),deck=document.querySelector('.directorDeck');if(dt)dt.textContent=t;if(db)db.style.width=`${pct}%`;if(deck){deck.style.setProperty('--pct',pct);deck.classList.toggle('urgent',sec<=10&&sec>5&&state.timer.running);deck.classList.toggle('critical',sec<=5&&state.timer.running)}NET.showTimer({running:state.timer.running,remaining:state.timer.remaining,duration:state.timer.duration,status,mood:currentMood(),motion:state.motion})}
function timerEnded(){if(state.screen==='question'&&state.phase==='running'){closeQuestionTime();state.answerVisible=true;if(state.round&&!state.round.revealedAt){state.round.revealedAt=SS.nowISO();NET.revealRound(state.round.roundInstanceId)}renderAll();toast('Tempo terminato: soluzione svelata.');maybeAutoCommit();autosave('timer.end',0)}else if(state.screen==='arcade'&&state.arcade){const a=state.arcade;closeArcadeTabletRound(true);a.started=false;if(a.type==='photopuzzle')a.revealed=a.revealOrder.length;else if(a.type==='indovina')a.revealed=true;else if(a.type==='abbinamenti')a.revealCount=a.cards.length;else if(a.type==='chain')a.revealed=true;else if(a.type==='ghigliottina'&&a.final)a.revealedFinal=true;renderAll();toast('Tempo scaduto: soluzione svelata. La raccolta punti resta qui nella regia del gioco.');autosave('timer.end',0)}}

/* ---------------- SQUADRE (Participant type=team) ---------------- */
function addTeam(name){if(state.screen!=='home'&&state.screen!=='rules')return toast('Torna alla Home per modificare le squadre.');name=String(name||'').trim().slice(0,40);if(!name)return;if(state.teams.some(t=>t.name.toLowerCase()===name.toLowerCase()))return toast('Nome già usato.');const p=SS.makeParticipant(name,'team');state.teams.push(Object.assign(p,{score:0}));logEvent({event:'participant.add',participantId:p.id});syncNetParticipants();renderAll();autosave('teams')}
function removeTeam(id){if(state.screen!=='home'&&state.screen!=='rules')return toast('Torna alla Home per modificare le squadre.');if(teamHasScores(id))return toast('Questa squadra ha già punti registrati: per ripartire usa NUOVA PARTITA.');state.teams=state.teams.filter(t=>t.id!==id);delete state.pending[id];state.pendingOrder=state.pendingOrder.filter(x=>x!==id);logEvent({event:'participant.remove',participantId:id});syncNetParticipants();renderAll();autosave('teams')}
function syncNetParticipants(){NET.syncParticipants(state.teams.map(t=>({id:t.id,name:t.name,type:t.type||'team'})))}
function renderTeams(){const devs=NET.teamDevices();$('#teamCount').textContent=state.teams.length;$('#teamList').innerHTML=state.teams.map((t,i)=>{const d=devs[t.id];const dev=d?`<span class="devDot ${d.connected?'on':'off'}" title="${d.connected?'Pulsantiera connessa':'Pulsantiera disconnessa'}">${d.connected?'●':'○'}</span>`:'';return `<div class="teamRow"><span class="teamIcon">${i+1}</span><b title="${esc(t.name)}">${dev}${esc(t.name)}${d&&d.connected&&d.rttMs!=null?`<small class="rtt">${d.rttMs} ms</small>`:''}</b><strong class="teamScore">${t.score}</strong><button class="btn tiny red" data-remove-team="${t.id}" aria-label="Rimuovi ${esc(t.name)}">×</button></div>`}).join('')||'<p class="help">Aggiungi almeno due squadre.</p>'}

/* ---------------- REGISTRAZIONE RISPOSTE (manuale e tablet) ---------------- */
function canEnter(){if(state.screen==='question')return !!state.round&&(state.phase==='running'||state.phase==='scoring')&&!state.questionScored;if(state.screen==='arcade')return !!state.arcade&&!state.arcade.scoreCommitted;return false}
function pushHistory(){state.pendingHistory.push(C.clone({pending:state.pending,pendingOrder:state.pendingOrder,correctOrder:state.correctOrder,entryMeta:state.entryMeta}));if(state.pendingHistory.length>80)state.pendingHistory.shift()}
function entryOutcome(id){const v=state.pending[id];if(state.screen==='question')return SS.outcomeForAnswer(v==='abstain'?null:v,state.qRound&&state.qRound.correctDisplayLetter);return SC.normalizeOutcome(v)}
function questionOutcome(v){return state.screen==='question'?SS.outcomeForAnswer(v==='abstain'?null:v,state.qRound&&state.qRound.correctDisplayLetter):SC.normalizeOutcome(v)}
function ensureArcadeRound(){const a=state.arcade;if(!a)return null;if(!state.round||state.round.kind!=='arcade')newRound('arcade',{gameType:a.type,label:a.label,presetIndex:a.presetIndex,openedAt:SS.nowISO()});return state.round}
function setPending(id,value,meta){
 if(!state.teams.some(t=>t.id===id)||!canEnter())return false;
 if(state.screen==='arcade')ensureArcadeRound();
 const m=Object.assign({inputMode:'manual',responseTimeMs:null},meta||{});
 const prev=state.entryMeta[id];
 if(state.pending[id]===value&&prev&&prev.inputMode===m.inputMode&&!!prev.auto===!!m.auto)return false;
 pushHistory();
 if(questionOutcome(state.pending[id])==='correct'&&questionOutcome(value)!=='correct')state.correctOrder=state.correctOrder.filter(x=>x!==id);
 if(questionOutcome(value)==='correct'&&!state.correctOrder.includes(id))state.correctOrder.push(id);
 if(!(id in state.pending))state.pendingOrder.push(id);
 state.pending[id]=value;
 state.entryMeta[id]=Object.assign({seq:++state.entrySeq,receivedAt:SS.nowISO()},m,prev&&prev.inputMode==='tablet'&&m.inputMode==='manual'&&!prev.auto?{overrides:{answer:prev.answer,responseId:prev.responseId}}:{},{answer:value});
 logEvent({event:m.inputMode==='tablet'?(m.auto?'response.auto_omitted':'response.tablet'):'response.manual',roundInstanceId:state.round&&state.round.roundInstanceId,participantId:id,deviceId:m.deviceId||null,answer:value==='abstain'?null:value,accepted:true,latency:typeof m.responseTimeMs==='number'?m.responseTimeMs:null});
 afterEntryChange();return true;
}
function clearEntry(id){if(!canEnter()||!(id in state.pending))return;pushHistory();delete state.pending[id];delete state.entryMeta[id];state.pendingOrder=state.pendingOrder.filter(x=>x!==id);state.correctOrder=state.correctOrder.filter(x=>x!==id);afterEntryChange()}
function afterEntryChange(){renderAnswerPanel();renderScorePanel();renderStage();renderCockpit();syncPublic();autosave('entry',300)}
function undoPending(){if(!canEnter())return;const prev=state.pendingHistory.pop();if(!prev)return toast('Niente da annullare.');Object.assign(state,prev);afterEntryChange()}
function fillMissingAbstain(){if(!canEnter())return;if(state.screen==='question'&&state.phase==='running')return toast('Chiudi prima il tempo.');const missing=state.teams.filter(t=>!(t.id in state.pending));if(!missing.length)return;pushHistory();const hist=state.pendingHistory.length;missing.forEach(t=>{state.pending[t.id]='abstain';state.pendingOrder.push(t.id);state.entryMeta[t.id]={seq:++state.entrySeq,inputMode:'manual',auto:true,responseTimeMs:null,receivedAt:SS.nowISO(),answer:'abstain'};logEvent({event:'response.manual',roundInstanceId:state.round&&state.round.roundInstanceId,participantId:t.id,answer:null,accepted:true,reason:'mancanti = omesse'})});state.pendingHistory.length=hist;afterEntryChange()}
function markOmittedForTabletTeams(){const bound=NET.boundTeamIds();state.teams.forEach(t=>{if(bound[t.id]&&!(t.id in state.pending))setPending(t.id,'abstain',{inputMode:'tablet',auto:true,responseTimeMs:null})})}
/* Risposta arrivata da una pulsantiera (già validata e marcata dal server). */
function applyTabletResponse(rec){
 if(rec&&state.arcade&&state.arcade.type==='ghigliottina'&&state.arcade.pairRoundId&&rec.roundInstanceId===state.arcade.pairRoundId){ghVote(rec);return}
 if(!rec||!state.round||rec.roundInstanceId!==state.round.roundInstanceId||(state.screen!=='question'&&state.screen!=='arcade')){logEvent({event:'response.tablet.stale',roundInstanceId:rec&&rec.roundInstanceId,participantId:rec&&rec.participantId,accepted:false,reason:'round non attivo in regia'});return}
 const prev=state.entryMeta[rec.participantId];
 if(prev&&prev.inputMode==='manual'&&!prev.auto){logEvent({event:'response.tablet.ignored',roundInstanceId:rec.roundInstanceId,participantId:rec.participantId,answer:rec.selectedAnswer,accepted:false,reason:'già registrata a mano dal docente'});return}
 // Una replica dello stesso record non deve sovrascrivere un esito corretto dal docente.
 if(prev&&prev.responseId&&prev.responseId===rec.responseId&&!prev.auto)return;
 if(state.screen==='arcade'){
  const answerMatch=rec.selectedAnswer==null?null:AM.answerMatcher(rec.selectedAnswer,arcadeAnswerReference(state.arcade));
  const outcome=answerMatch?(answerMatch.isCorrect?'correct':'wrong'):'abstain';
  setPending(rec.participantId,outcome,{inputMode:'tablet',responseTimeMs:rec.responseTimeMs,receivedAt:rec.receivedAt,deviceId:rec.deviceId,responseId:rec.responseId,serverSeq:rec.seq,selectedAnswer:rec.selectedAnswer,correctAnswer:rec.correctAnswer,answerMatch});
  return;
 }
 setPending(rec.participantId,rec.selectedAnswer||'abstain',{inputMode:'tablet',responseTimeMs:rec.responseTimeMs,receivedAt:rec.receivedAt,deviceId:rec.deviceId,responseId:rec.responseId,serverSeq:rec.seq});
 if(state.phase==='scoring'&&state.answerVisible)maybeAutoCommit();
}
function voidTabletResponse(msg){if(!state.round||msg.roundInstanceId!==state.round.roundInstanceId)return;const m=state.entryMeta[msg.participantId];if(m&&m.inputMode==='tablet'){clearEntry(msg.participantId);toast('Squadra sbloccata: può rispondere di nuovo.')}}
function unlockTeam(id){if(!state.round||state.questionScored)return;NET.unlock(state.round.roundInstanceId,id);logEvent({event:'participant.unlock',roundInstanceId:state.round.roundInstanceId,participantId:id})}
function previewRecords(){const av=roundAvailableMs();return state.teams.filter(t=>t.id in state.pending).map(t=>{const m=state.entryMeta[t.id]||{};return {participantId:t.id,outcome:entryOutcome(t.id),order:entryOrder(t.id),inputMode:m.inputMode,auto:!!m.auto,responseTimeMs:m.inputMode==='tablet'&&typeof m.responseTimeMs==='number'?m.responseTimeMs:null,availableMs:av}})}
/* RC2-A: tempo disponibile finale del round in ms (durata + secondi aggiunti). Nei giochi, se il round non lo ha ancora, è la durata del timer. */
function roundAvailableMs(){const r=state.round;if(r&&r.availableMs>0)return r.availableMs;if(r&&r.kind==='arcade'&&state.timer&&state.timer.duration>0)return Math.round(state.timer.duration*1000);return null}
function previewRows(){const map={};SC.scoreRound(previewRecords(),profileId(),scoreOptions()).forEach(r=>map[r.participantId]=r);return map}
function entryOrder(id){const i=state.correctOrder.indexOf(id);return i>=0?i+1:1000+state.pendingOrder.indexOf(id)}
function priorOmissions(roundId){return SS.committedOmissionCounts(state.session,roundId||state.round&&state.round.roundInstanceId)}
/* RC2-A.2: la scala del micro-round (standard | gh_pair | chain_link) viaggia con le opzioni: anteprima, commit, server e ricalcolo usano la stessa. */
function scoreOptions(roundId){const r=state.round,a=state.arcade,scale=r&&('scale' in r)?r.scale:SC.scaleFor({kind:r&&r.kind,gameType:r&&r.kind==='arcade'&&a?a.type:null});return Object.assign({priorOmissions:priorOmissions(roundId),freeOmissions:FREE_OMISSIONS},scale?{scale}:{})}
function omissionNumberFor(id){const prior=priorOmissions()[id]||0;return prior+((id in state.pending&&entryOutcome(id)==='omitted')?1:0)}
function previewPoints(){const map={};SC.scoreRound(previewRecords(),profileId(),scoreOptions()).forEach(r=>map[r.participantId]=r.points);return map}
function committedPoints(roundId){const map={};state.session.scoreEvents.forEach(e=>{if(e.roundInstanceId===roundId&&!e.voided)map[e.participantId]=e.points});return map}
function maybeAutoCommit(){if(state.screen!=='question'||state.questionScored||!state.answerVisible||state.phase!=='scoring')return;if(!state.teams.length||state.teams.some(t=>!(t.id in state.pending)))return;if(state.teams.every(t=>(state.entryMeta[t.id]||{}).inputMode==='tablet'))commitQuestionScores(true)}
function countModes(records){const c={manual:0,tablet:0};records.forEach(r=>c[r.inputMode]=(c[r.inputMode]||0)+1);return c}
function questionRecord(t){
 const v=state.pending[t.id],m=state.entryMeta[t.id]||{},letter=v==='abstain'?null:v,round=state.qRound,disp=letter?round.displayed.find(o=>o.letter===letter):null;
 return Object.assign(SS.makeResponse({responseId:m.responseId,sessionId:state.session.sessionId,roundInstanceId:state.round.roundInstanceId,kind:'question',questionId:q().id,participantId:t.id,participantType:t.type||'team',selectedAnswer:letter,selectedSourceIndex:disp?disp.sourceIndex:null,correctAnswer:round.correctDisplayLetter,outcome:SS.outcomeForAnswer(letter,round.correctDisplayLetter),responseTimeMs:m.responseTimeMs,availableMs:roundAvailableMs(),inputMode:m.inputMode,order:entryOrder(t.id),deviceId:m.deviceId,auto:m.auto,receivedAt:m.receivedAt}),PL.provenance(q(),P[state.packKey]));
}
function finalizeRound(records,meta,round){
 const r=round||state.round,pid=profileId(),s=state.session;
 const av=r.availableMs||(records.find(x=>x.availableMs>0)||{}).availableMs||null;
 /* RC2-A.2: scala esplicita (coppia Ghigliottina), oppure quella del round riaperto (anche null = regole RC2-A.1), oppure dal tipo. */
 const scale=meta&&meta.scale!==undefined?meta.scale:('scale' in r)?r.scale:SC.scaleFor({kind:r.kind,gameType:meta&&meta.gameType});
 const opts=Object.assign(scoreOptions(r.roundInstanceId),av?{availableMs:av}:{});if(scale)opts.scale=scale;else delete opts.scale;
 const events=SS.scoreEventsFor(records,pid,r.roundInstanceId,opts);
 s.responses.push(...records);s.scoreEvents.push(...events);
 const rec=Object.assign({roundInstanceId:r.roundInstanceId,kind:r.kind,committed:true,committedAt:SS.nowISO(),profileId:pid,openedAt:r.openedAt,availableMs:av,closedAt:r.closedAt||SS.nowISO(),revealedAt:r.revealedAt,inputModes:countModes(records),orderOverridden:!!r.orderOverridden},meta,{scale:scale||null});
 const pi=planItemFor(r);if(pi)rec.planItem=pi;
 s.rounds=s.rounds.filter(x=>x.roundInstanceId!==r.roundInstanceId);s.rounds.push(rec);r.committed=true;
 events.forEach(e=>logEvent({event:'score',roundInstanceId:r.roundInstanceId,participantId:e.participantId,scoreDelta:e.points}));
 if(s.afterEnd)delete s.afterEnd;SS.renumberOmissions(s,FREE_OMISSIONS);recomputeScores();NET.commitRound({scale:scale||null,roundInstanceId:r.roundInstanceId,records,profileId:pid,kind:r.kind,openedAt:r.openedAt||null,availableMs:av});
 return events;
}
function commitQuestionScores(auto){
 if(state.screen!=='question'||state.questionScored)return;
 if(!state.round||state.phase==='preview')return toast('Avvia prima la domanda.');
 if(state.phase==='running')closeQuestionTime();
 const missing=state.teams.filter(t=>!(t.id in state.pending));
 if(missing.length){renderAll();return toast(`Manca la risposta di ${missing.map(t=>t.name).join(', ')}: premi 0 (omessa) oppure MANCANTI = Ø.`)}
 const x=q(),round=state.qRound;
 const records=state.teams.map(questionRecord);
 finalizeRound(records,Object.assign(PL.provenance(x,P[state.packKey]),state.round.repeatOf?{repeatOf:state.round.repeatOf}:{},{questionId:x.id,questionIndex:state.qIndex,number:qNumber().n,seconds:state.timer.duration,correctAnswer:round.correctDisplayLetter,displayed:round.displayed.map(o=>({letter:o.letter,sourceIndex:o.sourceIndex})),question:{text:x.question,options:x.options.slice(),correctIndex:C.correctIndex(x),category:x.category,topic:x.topic||'',subject:x.subject||'',grade:x.grade||null,difficulty:x.difficulty||null,explanation:x.explanation||''}}));
 state.questionScored=true;state.phase='scored';
 state.completedRounds[x.id]=C.clone({round:state.qRound,pending:state.pending,pendingOrder:state.pendingOrder,correctOrder:state.correctOrder,entryMeta:state.entryMeta,roundInstanceId:state.round.roundInstanceId,openedAt:state.round.openedAt,availableMs:state.round.availableMs||null});
 cloneAudio('correct',.5);renderAll();toast(auto?'Tutte le pulsantiere hanno risposto: punti registrati.':'Punteggi registrati.');autosave('commit',0);
}
function reopenScores(){
 if(state.screen!=='question'||!state.questionScored)return;const x=q(),saved=state.completedRounds[x.id];if(!saved||!saved.roundInstanceId)return;
 if(!confirm('Riaprire i punti di questa domanda? Potrai correggere le risposte e confermare di nuovo.'))return;
 const rid=saved.roundInstanceId,s=state.session;
 s.scoreEvents=s.scoreEvents.filter(e=>e.roundInstanceId!==rid);
 s.responses.forEach(r=>{if(r.roundInstanceId===rid&&!r.voided){r.voided=true;r.voidedAt=SS.nowISO()}});
 s.rounds=s.rounds.map(r=>r.roundInstanceId===rid?Object.assign({},r,{committed:false,reopenedAt:SS.nowISO()}):r);
 SS.renumberOmissions(s,FREE_OMISSIONS);/* RC1: le astensioni gratuite delle altre manche si ricontano */
 delete state.completedRounds[x.id];
 Object.assign(state,{questionScored:false,phase:'scoring',answerVisible:true,qRound:C.clone(saved.round),pending:C.clone(saved.pending),pendingOrder:[...saved.pendingOrder],correctOrder:[...saved.correctOrder],entryMeta:C.clone(saved.entryMeta||{}),pendingHistory:[]});
 state.round={roundInstanceId:rid,kind:'question',questionId:x.id,questionIndex:state.qIndex,scale:(s.rounds.find(r=>r.roundInstanceId===rid)||{}).scale||null,openedAt:saved.openedAt||null,availableMs:saved.availableMs||(s.rounds.find(r=>r.roundInstanceId===rid)||{}).availableMs||null,closedAt:SS.nowISO(),revealedAt:SS.nowISO(),committed:false,reopened:true};
 logEvent({event:'round.reopen',roundInstanceId:rid});NET.uncommitRound(rid);recomputeScores();renderAll();autosave('reopen',0);toast('Punti riaperti: correggi e conferma.');
}
function serverCommitted(msg){
 if(!msg||!Array.isArray(msg.scoreEvents))return;const s=state.session;
 /* Il server verifica il round così come è stato confermato. Se nel frattempo il docente ha riaperto il round
    o ricalcolato con un altro profilo, la sua scelta più recente prevale. */
 const rd=s.rounds.find(r=>r.roundInstanceId===msg.roundInstanceId),srvProfile=(msg.scoreEvents[0]||{}).profileId;
 if(!rd||!rd.committed||(srvProfile&&rd.profileId!==srvProfile)){logEvent({event:'score.server_ignored',roundInstanceId:msg.roundInstanceId,reason:'round riaperto o ricalcolato dal docente'});return}
 const local=committedPoints(msg.roundInstanceId);let diff=false;
 msg.scoreEvents.forEach(e=>{if(local[e.participantId]!==e.points)diff=true});
 if(!diff){logEvent({event:'score.verified',roundInstanceId:msg.roundInstanceId,accepted:true});return}
 s.scoreEvents=s.scoreEvents.filter(e=>e.roundInstanceId!==msg.roundInstanceId).concat(msg.scoreEvents);
 logEvent({event:'score.server_override',roundInstanceId:msg.roundInstanceId,accepted:true,reason:'il punteggio del server prevale'});recomputeScores();renderAll();autosave('server.commit',0);toast('Punteggio allineato al server.');
}

/* ---------------- PANNELLO RISPOSTE (griglia rapida) ---------------- */
function answerGridHTML(){
 if(state.screen!=='question')return '<p class="help">La griglia compare durante una domanda.</p>';
 if(!state.teams.length)return '<p class="help">Nessuna squadra.</p>';
 const open=canEnter(),scored=state.questionScored,correct=state.qRound&&state.qRound.correctDisplayLetter;
 const pts=scored?committedPoints((state.completedRounds[q().id]||{}).roundInstanceId):previewPoints(),devs=NET.teamDevices();
 if(state.cursor>=state.teams.length)state.cursor=0;
 return `<div class="answerGrid${open?'':' locked'}">${state.teams.map((t,i)=>{
  const v=state.pending[t.id],m=state.entryMeta[t.id]||{},has=t.id in state.pending,letter=v==='abstain'?'Ø':v;
  const out=has?SS.outcomeForAnswer(v==='abstain'?null:v,correct):null,mark=out==='correct'?'✓':out==='wrong'?'✗':'';
  const d=devs[t.id],src=has?(m.inputMode==='tablet'?(m.auto?'omessa automatica (tablet senza risposta)':'da pulsantiera'+(m.responseTimeMs!=null?` · ${(m.responseTimeMs/1000).toFixed(1)} s`:'')):'registrata a mano'+(m.overrides?' (corregge il tablet)':'')):'';
  const point=pts[t.id],omitNo=has&&out==='omitted'?omissionNumberFor(t.id):null,omitTag=omitNo?`<small class="agOmit">Ø ${omitNo}/${FREE_OMISSIONS}${omitNo>FREE_OMISSIONS?' → errore':''}</small>`:'';
  return `<div class="agRow${i===state.cursor&&open?' active':''}${has?' out-'+out:''}" data-ag-row="${t.id}">`+
   `<span class="agDev ${d?(d.connected?'on':'off'):''}" title="${d?(d.connected?'Pulsantiera connessa':'Pulsantiera disconnessa'):'Nessuna pulsantiera'}">${d?(d.connected?'●':'○'):''}</span>`+
   `<button class="agName" data-ag-pick="${i}" tabindex="-1" title="${esc(t.name)}">${esc(t.name)}</button>`+
   `<span class="agVal" title="${esc(src)}">${has?`<b>${esc(letter)}</b><i>${mark}</i>${m.inputMode==='tablet'&&!m.auto?'<em>▣</em>':''}`:(state.phase==='running'?'<span class="agWait">…</span>':'—')}</span>`+
   `<span class="agBtns">${C.LETTERS.map(L=>`<button class="agBtn${v===L?' sel':''}" data-ag="${t.id}|${L}" ${open?'':'disabled'} tabindex="-1">${L}</button>`).join('')}<button class="agBtn om${v==='abstain'?' sel':''}" data-ag="${t.id}|abstain" ${open?'':'disabled'} tabindex="-1" aria-label="Omessa">Ø</button></span>`+
   `<span class="agPts ${point>0?'good':point<0?'bad':''}">${has&&point!=null?SC.signed(point):''}${omitTag}</span>`+
   `${open&&m.inputMode==='tablet'&&!m.auto?`<button class="agUnlock" data-ag-unlock="${t.id}" tabindex="-1" title="Sblocca: la squadra può rispondere di nuovo dal tablet">↺</button>`:''}`+
  `</div>`}).join('')}</div>`;
}
function scoreOrderHTML(){if(!state.correctOrder.length)return '';
 if(speedProfile()){
  if(speedOffRound())return `<div class="agOrder exAequo"><small>CORRETTE A ${SC.SPEED_BASE} PUNTI</small><span class="scoreChip">Una risposta corretta è stata inserita a mano: in questo round niente bonus velocità</span></div>`;
  const rows=previewRows();
  const byRank=Object.values(rows).some(r=>r.manualRank);
  return `<div class="agOrder"><small>${byRank?'PUNTI DI QUESTO ROUND · SENZA TABLET: 300, 290, 280… IN ORDINE DI REGISTRAZIONE':'PUNTI DI QUESTO ROUND · CORRETTA 200–300 IN BASE ALLA VELOCITÀ'}</small>${state.correctOrder.map((id,i)=>{const r=rows[id]||{},m=state.entryMeta[id]||{};return `<span class="scoreChip">${esc(state.teams.find(t=>t.id===id)?.name||'—')} · ${r.timed?fmtSec(m.responseTimeMs):r.manualRank?(i+1)+'ª registrata':'a mano'} · ${SC.signed(r.points||0)}</span>`}).join('')}</div>`;
 }
 if(manualRound())return `<div class="agOrder exAequo"><small>CORRETTE EX AEQUO</small><span class="scoreChip">Risposte inserite a mano: nessun bonus di velocità · ${SC.signed(SC.rankPoints(profileId(),1))} a ogni corretta</span></div>`;return `<div class="agOrder"><small>ORDINE DELLE CORRETTE (profilo classico)</small>${state.correctOrder.map((id,i)=>`<span class="scoreChip">${i+1}ª · ${esc(state.teams.find(t=>t.id===id)?.name||'—')} · ${SC.signed(SC.rankPoints(profileId(),i+1))}</span>`).join('')}</div>`}
function renderAnswerPanel(){
 const box=$('#answerGridSession');if(!box)return;box.innerHTML=answerGridHTML();$('#agOrderSession').innerHTML=state.screen==='question'?scoreOrderHTML():'';
 const n=state.teams.filter(t=>t.id in state.pending).length;$('#answerBadge').textContent=state.screen==='question'?`${n}/${state.teams.length}`:'—';
 const open=canEnter();$('#commitAnswersBtn').disabled=!(open&&state.screen==='question'&&state.phase!=='preview');$('#fillAnswersBtn').disabled=!open||state.phase==='running';
 $('#answerHint').hidden=!open;
}

/* ---------------- PANNELLO PUNTI ---------------- */
function renderScorePanel(){if($('#scoreRules'))$('#scoreRules').textContent=`${state.screen==='arcade'&&state.arcade?SC.gameRules(state.arcade.type,profileId()):rules()}.${speedProfile()?' '+SC.manualRules(state.screen==='arcade'&&state.arcade?state.arcade.type:'question',profileId())+'.':''} Prima di confermare puoi correggere o annullare.`;const box=$('#scoreCards'),key=$('#scoreKey'),phase=$('#scorePhase');if(state.screen==='question'){phase.textContent=state.phase==='running'?'IN CORSO':state.phase==='scoring'?'RACCOLTA':state.questionScored?'SALVATO':'ATTESA';key.innerHTML=q()?`Chiave privata: <b>${esc(state.qRound?.correctDisplayLetter||'—')}</b> · ${esc(state.qRound?.displayed.find(o=>o.letter===state.qRound.correctDisplayLetter)?.text||'')}`:'';box.innerHTML=state.phase==='preview'?'<div class="help">Avvia la domanda per registrare le risposte.</div>':answerGridHTML();$('#scoreOrder').innerHTML=scoreOrderHTML();$('#commitScoreBtn').disabled=!canEnter()||state.phase==='preview';return}
 if(state.screen==='arcade'&&state.arcade){phase.textContent='GIOCO';key.innerHTML=arcadeScoreKey();const ghVoting=state.arcade.type==='ghigliottina'&&!state.arcade.final;box.innerHTML=ghVoting?ghPairCards(state.arcade):arcadeScoreCards();$('#commitScoreBtn').disabled=!!state.arcade.scoreCommitted||ghVoting;$('#scoreOrder').innerHTML=scoreOrderHTML();return}
 phase.textContent='ATTESA';key.innerHTML='';box.innerHTML='<div class="help">Nessuna raccolta punteggi attiva.</div>';$('#scoreOrder').innerHTML='';$('#commitScoreBtn').disabled=true}
function renderPrivate(){const x=q(),inQ=state.screen==='question';$('#sessionBadge').textContent=state.screen.toUpperCase();$('#questionStatus').textContent=inQ?({preview:'PRONTA',running:state.timer.running?'IN CORSO':'IN PAUSA',scoring:'RACCOLTA',scored:'CONFERMATA'})[state.phase]||state.phase.toUpperCase():'—';$('#privateAnswer').innerHTML=x&&inQ?`<b>${esc(state.qRound?.correctDisplayLetter||x.correct)}</b> · ${esc(state.qRound?.displayed.find(o=>o.letter===state.qRound.correctDisplayLetter)?.text||x.options[C.correctIndex(x)]||'')}<br>${esc(x.explanation||'')}${sourceHTML(x)}<small class="sourceRef">Tempo: ${TM.secondsFor(x)} s</small>`:'Nessuna domanda attiva.';updateTimerUI()}

/* ---------------- ARCADE ---------------- */
function renderGamesTab(){const buttons=$('#gameButtons');buttons.innerHTML=Object.entries(pack().gameNames).filter(([k])=>(pack().arcadeSets[k]||[]).length).map(([k,n])=>`<button class="btn ${state.arcade?.type===k?'primary':'ghost'}" data-game="${k}">${esc(n)}</button>`).join('');const gc=$('#gameControls');gc.innerHTML=(state.screen==='arcade'&&state.arcade?gameControlsHTML():`<div class="panel"><p class="help">Scegli un gioco. Ogni gioco ha più manche pronte e un proprio pulsante di avvio.</p></div>`)+`<div class="panel"><button class="btn primary" type="button" id="openStudioGamesBtn">✏ CREA NUOVI GIOCHI (PACK STUDIO)</button><p class="help">Domande, Photopuzzle, Indovina, Abbinamenti, Parola Segreta e Staffetta da zero, con un modulo per ogni tipo. Per modificare il pacchetto del programma, duplicalo prima da PACCHETTI.</p></div>`}
function startArcade(type){if(!leaveQuestionGuard())return;state.finalReveal=null;state.contentDone=false;state.showJoin=false;ghClosePairRound();arcadeEpoch++;stopTimer();const sets=pack().arcadeSets[type]||[];if(!sets.length)return toast('Nessun set disponibile.');state.screen='arcade';state.round=null;/* RC2-A.3.1: la tendina è attiva PRIMA del primo render (loadArcadePreset chiama renderAll) e non c'è una transizione temporanea che, sparendo, sveli il gioco. */state.arcade={type,presetIndex:0,scoreCommitted:false,curtain:true};clearPending();loadArcadePreset(0,false);tab('games');autosave('arcade')}
function loadArcadePreset(index,announce=true){if(state.arcade&&state.arcade.pairRoundId)ghClosePairRound();arcadeEpoch++;const a=state.arcade,type=a.type,sets=pack().arcadeSets[type]||[];if(!sets.length)return;index=((Number(index)||0)%sets.length+sets.length)%sets.length;a.presetIndex=index;a.label=sets[index].label||`Quiz ${index+1}`;a.gameId=SS.uuid();a.resultsVisible=false;a.played=false;a.scoreCommitted=false;state.round=null;clearPending();stopTimer();const set=C.clone(sets[index]),secs=TM.secondsFor(set,type);a._packId=sets[index]._packId||state.packKey;if(type==='photopuzzle'){Object.assign(a,{image:set.image,answer:set.answer,focus:set.focus||'',cols:6,rows:5,edges:C.makePuzzleEdges(6,5),revealOrder:C.shuffle([...Array(30).keys()]),revealed:0,started:false,pieceInterval:secs/30})}
 if(type==='indovina'){Object.assign(a,C.buildIndovina(set),{type,presetIndex:index,label:a.label})}
 if(type==='abbinamenti'){Object.assign(a,C.buildMatching(set),{type,presetIndex:index,label:a.label})}
 if(type==='ghigliottina'){Object.assign(a,C.buildGhigliottina(set),{type,presetIndex:index,label:a.label})}
 if(type==='chain'){Object.assign(a,{links:C.clone(set.links||[]),index:0,started:false,revealed:false,helpPositions:[],visibleHelp:0,type,presetIndex:index,label:a.label})}
 a.acceptedAnswers=C.clone(set.acceptedAnswers||[]);a.instruction=set.instruction||'';a.seconds=secs;a.theme=set.theme||set.label;resetTimer(a.seconds);renderAll();if(announce)toast(`Caricato: ${a.label}`)}
/* RC2-A.3 — TENDINA del gioco: stato persistente (arcade.curtain). Finché è attiva il palco pubblico riceve SOLO la tendina:
   nessuna parola, immagine o lista del gioco nel DOM del proiettore. La toglie il docente (TOGLI TENDINA / AVVIA). */
function arcadeHTML(forRegia){const a=state.arcade;if(!a)return homeHTML();if(a.curtain)return forRegia?`<div class="regiaCurtain">${arcadeBoardHTML(a)}<div class="regiaCurtainBadge">▣ SUL PROIETTORE C’È LA TENDINA · il pubblico non vede ancora il gioco</div></div>`:gameCurtainHTML(a);if(a.resultsVisible)return gameResultsHTML(a);return arcadeBoardHTML(a)}
function arcadeBoardHTML(a){if(a.type==='photopuzzle')return photoHTML(a);if(a.type==='indovina')return indovinaHTML(a);if(a.type==='abbinamenti')return matchingHTML(a);if(a.type==='ghigliottina')return ghHTML(a);if(a.type==='chain')return chainHTML(a);return homeHTML()}
/* ---------------- RC2-A.2 · INTRO DEL GIOCO e RISULTATO DEL GIOCO ---------------- */
/* Una sola presentazione per ogni avvio di un gioco (startArcade): nome, payoff, istruzioni essenziali e punteggio reale.
   Resta finché il docente non preme AVVIA (o MOSTRA IL GIOCO); i passaggi interni (coppie, parole) non la ripetono. */
const GAME_GLYPH={photopuzzle:'▦',indovina:'?',abbinamenti:'1·A',ghigliottina:'A|B',chain:'→'};
const GAME_INTRO={
 photopuzzle:{payoff:'Riconosci l’opera',how:['Le tessere spariscono una alla volta.','Scrivete il nome dell’opera appena la riconoscete.']},
 indovina:{payoff:'Chi si nasconde dietro gli indizi?',how:['Arriva un indizio alla volta.','Scegliete tra i nomi sullo schermo e scrivete quello giusto.']},
 abbinamenti:{payoff:'Ogni immagine ha il suo nome',how:['Abbinate le immagini 1 · 2 · 3 · 4 ai nomi A · B · C · D.','Scrivete le lettere nell’ordine delle immagini.']},
 ghigliottina:{payoff:'Una parola le collega tutte',how:['Per ogni coppia scegliete A o B: resta la parola giusta.','Alla fine scrivete la parola che collega tutte quelle rimaste.']},
 chain:{payoff:'Una parola tira l’altra',how:['Ogni parola è collegata alla precedente.','Scrivete la parola nascosta: le lettere di aiuto arrivano col tempo.']}
};
function gameScoreLines(type){const pid=profileId();if(!speedProfile())return [SC.rulesSummary(pid)];if(type==='ghigliottina')return ['Ogni scelta corretta: +10 pt','Risposta finale corretta: 200–300 pt in base alla velocità'];if(type==='chain')return ['Ogni parola corretta: 50–100 pt in base alla velocità'];return ['Risposta corretta: 200–300 pt in base alla velocità']}
function gameCurtainHTML(a){const info=GAME_INTRO[a.type]||{payoff:'',how:[]},tablets=Object.keys(NET.boundTeamIds()).length>0,manual=speedProfile()?SC.manualRules(a.type,profileId()):'';
 return `<div class="gameCurtain gc-${esc(a.type)}"><div class="gcGlyph" aria-hidden="true">${GAME_GLYPH[a.type]||'★'}</div><header class="gcHead"><span class="gcKicker">IL SECCHIONE · PROSSIMO GIOCO</span><span class="gcState">IN PREPARAZIONE</span></header><main class="gcMain"><h1 class="gcTitle">${esc(gameName(a.type).toUpperCase())}</h1>${info.payoff?`<p class="gcPayoff">${esc(info.payoff)}</p>`:''}${a.instruction?`<p class="gcNote">${esc(a.instruction)}</p>`:''}<ol class="gcHow">${info.how.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><div class="gcScore">${gameScoreLines(a.type).map(x=>`<div class="gcPts"><b>★</b><span>${esc(x)}</span></div>`).join('')}${!tablets&&manual?`<div class="gcPts manual"><b>✍</b><span>${esc(manual)}</span></div>`:''}</div></main><footer class="gcFoot"><span>${esc(a.theme||a.label||'')}</span><strong>SI PARTE QUANDO IL DOCENTE TOGLIE LA TENDINA</strong></footer></div>`}
/* compatibilità con il nome della RC2-A.2 */
function gameIntroHTML(a){return gameCurtainHTML(a)}
function gameRounds(gameId){const s=state.session;if(!s||!gameId)return [];return s.rounds.filter(rd=>rd&&rd.committed&&rd.gameInstanceId===gameId).map((rd,i)=>({rd,i})).sort((x,y)=>String(x.rd.openedAt||x.rd.committedAt||'').localeCompare(String(y.rd.openedAt||y.rd.committedAt||''))||x.i-y.i).map(x=>x.rd)}
/* Righe del RISULTATO DEL GIOCO: punti guadagnati in QUESTA manche (micro-round compresi), dagli eventi di punteggio salvati. Mai totali della partita. */
function gameResultRows(a){const s=state.session,rounds=gameRounds(a&&a.gameId),ids={},ev={},resp={};rounds.forEach(rd=>ids[rd.roundInstanceId]=rd);
 s.scoreEvents.forEach(e=>{if(e&&!e.voided&&ids[e.roundInstanceId])ev[e.roundInstanceId+'|'+e.participantId]=e});s.responses.forEach(r=>{if(r&&!r.voided&&ids[r.roundInstanceId])resp[r.roundInstanceId+'|'+r.participantId]=r});
 return state.teams.map(t=>{const parts=rounds.map(rd=>{const k=rd.roundInstanceId+'|'+t.id,e=ev[k]||{},r=resp[k]||{};let o='omitted';try{o=SC.normalizeOutcome(r.outcome||e.outcome)}catch(err){}return {part:rd.ghPart||(rd.gameType==='chain'?'link':'main'),outcome:o,answer:r.selectedAnswer==null?null:r.selectedAnswer,time:typeof r.responseTimeMs==='number'?r.responseTimeMs:null,inputMode:r.inputMode||'manual',auto:!!r.auto,points:Number(e.points)||0,manualRank:e.scale&&e.rank&&r.inputMode==='manual'?e.rank:null}});
  const main=parts.filter(p=>p.part==='main'||p.part==='final').pop()||null;
  return {id:t.id,name:t.name,parts,main,pairs:parts.filter(p=>p.part==='pair'),links:parts.filter(p=>p.part==='link'),points:parts.reduce((n,p)=>n+p.points,0)}})
 .sort((x,y)=>y.points-x.points||((x.main&&x.main.time!=null?x.main.time:9e15)-(y.main&&y.main.time!=null?y.main.time:9e15))||String(x.name).localeCompare(String(y.name),'it'));
}
function gameResultsHTML(a){
 const rows=gameResultRows(a),n=rows.length,step=n>1?Math.max(120,Math.min(520,Math.floor(2600/(n-1)))):0,many=n>8?' many':'',compact=n>6?' compact':'',chain=a.type==='chain',gh=a.type==='ghigliottina';
 const mark=o=>o==='correct'?'✓':o==='wrong'?'✗':'Ø',sol=chain?(a.links||[]).map(l=>l.to).join(' → '):arcadeSolutionFull(a);
 const list=rows.map((r,i)=>{
  const m=r.main,anyOk=r.parts.some(p=>p.outcome==='correct'),allOm=r.parts.every(p=>p.outcome==='omitted');
  const cls=chain?(anyOk?'good':allOm?'omit':'bad'):(m&&m.outcome==='correct'?'good':m&&m.outcome==='wrong'?'bad':'omit');
  let label='',resp='—',respHead='RISPOSTA',time='—';
  if(chain){const ok=r.links.filter(p=>p.outcome==='correct').length;respHead='PAROLE';resp=`${ok}/${r.links.length}`;label=r.links.map((p,j)=>`${j+1} ${mark(p.outcome)} ${SC.signed(p.points)}`).join(' · ')}
  else{if(m){resp=m.answer||(m.outcome==='correct'?'GIUSTA':m.outcome==='wrong'?'ERRATA':'—');time=m.outcome==='omitted'?'—':m.time!=null?fmtSec(m.time):m.inputMode==='manual'?'A MANO':'—';label=m.outcome==='correct'?'✓ CORRETTA':m.outcome==='wrong'?'✗ ERRATA':'Ø NESSUNA RISPOSTA';if(m.manualRank&&m.outcome==='correct')label+=` · ${m.manualRank}ª corretta registrata`}
   if(gh){const ok=r.pairs.filter(p=>p.outcome==='correct').length,pp=r.pairs.reduce((x,p)=>x+p.points,0);respHead='FINALE';label=`SCELTE ${ok}/${r.pairs.length} ${SC.signed(pp)} PT · FINALE ${m?(m.outcome==='correct'?'✓':m.outcome==='wrong'?'✗':'Ø')+' '+SC.signed(m.points):'—'}`}}
  return `<div class="resultRow ${cls}" style="--reveal-delay:${i*step}ms"><b class="resultPos resultIcon" aria-hidden="true">${chain?(anyOk?'✓':allOm?'Ø':'✗'):mark(m?m.outcome:'omitted')}</b><div class="resultIdentity"><span class="resultTeam">${esc(r.name)}</span><small>${esc(label)}</small></div><div class="resultResponse"><span>${respHead}</span><strong>${esc(resp)}</strong></div>${chain?'':`<div class="resultTime"><span>TEMPO</span><strong>${esc(time)}</strong></div>`}<div class="resultDelta"><span>PUNTI GIOCO</span><strong>${SC.signed(r.points)}<small> pt</small></strong></div></div>`;
 }).join('')||'<div class="resultEmpty">Nessuna squadra in gara.</div>';
 return `<div class="roundReveal roundSummary gameSummary${chain?' noTime':''}${many}${compact}" style="--result-rows:${Math.max(1,Math.ceil(n/2))}"><header class="resultHeader"><div><span class="showEyebrow">${esc(gameName(a.type).toUpperCase())} · ${esc(a.label||'')}</span><h1>RISULTATO DEL GIOCO</h1></div><div class="revealDirection"><small>PUNTI</small><strong>${gh?'+10 · 200–300':chain?'50–100':'200–300'}</strong></div><img src="${BRAND_LOGO}" alt="Il Secchione"></header><div class="resultAnswer"><span>SOLUZIONE</span><strong>${esc(sol||'—')}</strong></div><main class="roundRevealList">${list}</main><footer class="roundRevealFooter"><span>${esc(SC.gameRules(a.type,profileId()))}</span><strong>AVANTI → PROSSIMO CONTENUTO</strong></footer></div>`;
}
function arcadeSolutionFull(a){if(!a)return'';if(a.type==='ghigliottina')return String(a.answer||'');if(a.type==='abbinamenti')return (a.cards||[]).map((c,i)=>`${i+1} ${String(a.solution||'').split(' ')[i]||''}`).join(' · ');return arcadeSolution(a)}
/* Primo AVANTI dopo un gioco: conferma i punti (come prima) e mostra il RISULTATO DEL GIOCO. Restituisce 'shown', 'blocked' o 'proceed'. */
function gameResultsStep(){const a=state.arcade;if(state.screen!=='arcade'||!a||a.resultsVisible||a.curtain)return 'proceed';const w=state.missingWarned;if(!settleArcadeForNext())return 'blocked';if(state.missingWarned!==w&&!a.scoreCommitted)return 'blocked';if(!gameRounds(a.gameId).length)return 'proceed';ghClosePairRound();stopTimer();a.started=false;a.resultsVisible=true;renderAll();cloneAudio('leader',.7);logEvent({event:'game.results',reason:a.type+' · '+(a.label||'')});autosave('game.results',0);return 'shown'}
function showGameResults(){return gameResultsStep()==='shown'}
/* RC2-A.3 — comandi espliciti della tendina. La tendina si può rimettere finché la manche non è in corso (mai sopra un timer che scorre). */
function curtainOff(){const a=state.arcade;if(!a||!a.curtain)return;a.curtain=false;logEvent({event:'curtain.off',reason:a.type});renderAll();autosave('curtain.off',0)}
function curtainOn(){const a=state.arcade;if(state.screen!=='arcade'||!a||a.curtain)return;if(a.started)return toast('Prima chiudi o rivela la manche in corso.');a.curtain=true;a.resultsVisible=false;logEvent({event:'curtain.on',reason:a.type});renderAll();autosave('curtain.on',0)}
function curtainToggle(){const a=state.arcade;if(state.screen!=='arcade'||!a)return;if(a.curtain)curtainOff();else curtainOn()}
function gameEnter(){curtainOff()}
/* Annullare una Ghigliottina in corso scarta anche le scelte A/B già registrate di questa manche. */
function voidGameRounds(gameId,reason){const s=state.session;if(!s||!gameId)return 0;const ids=s.rounds.filter(rd=>rd.committed&&rd.gameInstanceId===gameId).map(rd=>rd.roundInstanceId);if(!ids.length)return 0;const set={};ids.forEach(id=>set[id]=true);s.scoreEvents=s.scoreEvents.filter(e=>!set[e.roundInstanceId]);s.responses.forEach(r=>{if(set[r.roundInstanceId]&&!r.voided){r.voided=true;r.voidedAt=SS.nowISO()}});s.rounds=s.rounds.map(rd=>set[rd.roundInstanceId]?Object.assign({},rd,{committed:false,voidedAt:SS.nowISO()}):rd);ids.forEach(id=>{NET.uncommitRound(id);logEvent({event:'round.void',roundInstanceId:id,reason})});SS.renumberOmissions(s,FREE_OMISSIONS);recomputeScores();return ids.length}
function arcadeHead(a,title){return `<div class="arcadeHeader"><div class="arcadeTitle">${esc(title)}</div><span class="arcadeLabel">${esc(a.theme||'')} · MANCHE ${a.presetIndex+1}</span></div>`}
/* RC2-A.3 — cornice comune dei giochi: intestazione su una riga con timer compatto, contenuto a tutto schermo, regola del punteggio in basso.
   Niente mascotte né logo: lo spazio va al contenuto. Ogni gioco ha poi il proprio layout dentro .gsMain. */
function gameFrame(a,title,content,opts){const o=opts||{},pct=state.timer.duration?Math.max(0,Math.min(100,state.timer.remaining/state.timer.duration*100)):0,sec=Math.max(0,Math.ceil(state.timer.remaining));
 return `<div class="gameScreen gs-${esc(a.type)}${o.cls?' '+o.cls:''}"><header class="gsHead"><h1 class="gsTitle">${esc(title)}</h1>${o.extra||''}<span class="gsLabel">${esc(a.theme||a.label||'')} · MANCHE ${a.presetIndex+1}</span><div class="gsTimer publicTimerHud"><div class="publicTimerRing" style="--pct:${pct}"><b class="liveSeconds">${sec}</b></div></div></header><main class="arcadeContent gsMain">${content}</main>${arcadeFooter(a)}<div class="publicProgress"><i class="liveProgress" style="width:${pct}%"></i></div></div>`}
function arcadeFooter(a){return `<div class="arcadeFooter"><span class="publicPhase ${a.started&&state.timer.remaining<=5?'hot':''}">${a.started?'IN CORSO':'REGIA PRONTA'}</span><span class="arcadeRule">${esc(SC.gameRules(a.type,profileId()).toUpperCase())}</span></div>`}
function arcadeSolution(a){if(!a)return'';if(a.type==='photopuzzle')return String(a.answer||'');if(a.type==='indovina')return String(a.subject||'');if(a.type==='abbinamenti')return String(a.solution||'');if(a.type==='ghigliottina')return a.final?String(a.answer||''):'';if(a.type==='chain')return String(a.links?.[a.index]?.to||'');return''}
/* Solo dati locali del matcher: il payload round.open e il protocollo rete restano invariati. */
function arcadeAnswerReference(a){return {answer:arcadeSolution(a),acceptedAnswers:a?.type==='chain'?(a.links?.[a.index]?.acceptedAnswers||[]):(a?.acceptedAnswers||[]),otherAnswers:a?.type==='indovina'?(a.candidates||[]):[]}}
/* L'editor esistente non espone le varianti: conservarle quando la soluzione resta la stessa. */
function preserveAnswerVariants(type,raw,previous){if(!previous)return raw;if(type==='chain'){for(const link of raw.links||[]){const old=previous.links?.find(x=>AM.normalize(x.to)===AM.normalize(link.to));if(old?.acceptedAnswers)link.acceptedAnswers=C.clone(old.acceptedAnswers)}}else{const key=type==='indovina'?'subject':'answer';if(previous.acceptedAnswers&&AM.normalize(raw[key])===AM.normalize(previous[key]))raw.acceptedAnswers=C.clone(previous.acceptedAnswers)}return raw}
function arcadeTabletConfig(a){const correct=arcadeSolution(a);if(!a||!correct)return null;return {layout:'text',correct,maxLength:Math.max(20,Math.min(120,correct.length+40))}}
function arcadeStartRound(){const a=state.arcade;a.curtain=false;a.resultsVisible=false;newRound('arcade',{gameType:a.type,label:a.label,presetIndex:a.presetIndex,gameInstanceId:a.gameId||null,chainIndex:a.type==='chain'?a.index:null,openedAt:SS.nowISO(),availableMs:Math.round(TM.secondsFor(a.seconds,a.type)*1000)});logEvent({event:'round.open',roundInstanceId:state.round.roundInstanceId,reason:`${a.type} · ${a.label}`});const cfg=arcadeTabletConfig(a);if(cfg)NET.openRound({roundInstanceId:state.round.roundInstanceId,kind:'arcade',gameType:a.type,questionId:null,layout:cfg.layout,correct:cfg.correct,maxLength:cfg.maxLength,durationMs:Math.round(TM.secondsFor(a.seconds,a.type)*1000)})}
function closeArcadeTabletRound(reveal=true){const r=state.round;if(!r||r.kind!=='arcade')return;if(reveal)markOmittedForTabletTeams();if(!r.closedAt){r.closedAt=SS.nowISO();NET.closeRound(r.roundInstanceId)}if(reveal&&!r.revealedAt){r.revealedAt=SS.nowISO();NET.revealRound(r.roundInstanceId)}}
function removePuzzlePiece(sound=true){const a=state.arcade;if(!a||a.type!=='photopuzzle'||a.revealed>=a.revealOrder.length)return;const i=a.revealOrder[a.revealed++],solved=a.revealed>=a.revealOrder.length;stageDocs().forEach(d=>{d.getElementById(`pp-piece-${i}`)?.classList.add('gone');const c=d.querySelector('.puzzleCounter');if(c)c.textContent=`${a.revealed}/${a.revealOrder.length}`;const top=d.getElementById('puzzleTopLabel');if(top){top.textContent=solved?`SOLUZIONE · ${a.answer}`:'IMMAGINE MISTERIOSA';top.classList.toggle('solved',solved)}const sol=d.getElementById('puzzleSolution');if(sol){sol.textContent=a.answer;sol.classList.toggle('show',solved)}});NET.showRefresh();if(sound)cloneAudio('letter',.28)}
function revealPuzzleAll(){stopTimer();const a=state.arcade;if(!a||a.type!=='photopuzzle')return;closeArcadeTabletRound(true);while(a.revealed<a.revealOrder.length){const i=a.revealOrder[a.revealed++];stageDocs().forEach(d=>d.getElementById(`pp-piece-${i}`)?.classList.add('gone'))}stageDocs().forEach(d=>{const c=d.querySelector('.puzzleCounter');if(c)c.textContent=`${a.revealed}/${a.revealOrder.length}`;const top=d.getElementById('puzzleTopLabel');if(top){top.textContent=`SOLUZIONE · ${a.answer}`;top.classList.add('solved')}const sol=d.getElementById('puzzleSolution');if(sol){sol.textContent=a.answer;sol.classList.add('show')}});NET.showRefresh()}
function startPhoto(){if(state.arcade?.played||state.arcade?.started||state.arcade?.scoreCommitted)return toast('Manche già avviata: usa pausa o carica una nuova manche.');state.arcade.played=true;const a=state.arcade;a.revealed=0;a.revealOrder=C.shuffle([...Array(30).keys()]);a.edges=C.makePuzzleEdges(6,5);a.pieceInterval=a.seconds/30;a.started=true;a.scoreCommitted=false;clearPending();arcadeStartRound();resetTimer(a.seconds);renderAll();cloneAudio('arcade',.84);startTimer('timerBed')}
function indovinaHTML(a){
 /* RC2-A.3: indizio in alto a tutta larghezza (testo dominante), alternative grandi sotto, su 2–4 colonne: niente spazio morto. */
 const n=a.candidates.length,cols=n<=4?2:n<=6?3:4,current=a.visible?a.clues[Math.min(a.visible-1,a.clues.length-1)]:'';
 const clue=`<section class="indClue"><div class="clueNo">${a.visible?`INDIZIO ${a.visible} DI ${a.clues.length}`:'IN ATTESA DEL PRIMO INDIZIO'}</div><div class="clueCurrent">${esc(current)}</div>${a.visible>1?`<div class="clueHistory">${a.clues.slice(0,a.visible-1).map((x,i)=>`<div><b>${i+1}</b> ${esc(x)}</div>`).join('')}</div>`:''}</section>`;
 const grid=`<section class="candidateGrid" style="--cols:${cols}">${a.candidates.map((x,i)=>`<div class="candidate ${a.eliminated.includes(i)?'out':''} ${a.revealed&&i===a.answerIndex?'answer':''}">${esc(x)}</div>`).join('')}</section>`;
 return gameFrame(a,gameName('indovina').toUpperCase(),`<div class="indLayout">${clue}${grid}</div>`);
}
function startIndovina(){if(state.arcade?.played||state.arcade?.started||state.arcade?.scoreCommitted)return toast('Manche già avviata: usa pausa o carica una nuova manche.');const a=state.arcade;if(!a.clues.length)return toast('Inserisci almeno un indizio.');a.played=true;a.visible=1;a.eliminated=[];a.revealed=false;a.started=true;a.scoreCommitted=false;clearPending();arcadeStartRound();resetTimer(a.seconds);renderAll();cloneAudio('arcade',.84);startTimer('indovinaBed')}
function nextClue(){const a=state.arcade;if(a.visible<a.clues.length){a.visible++;renderAll();cloneAudio('letter',.6)}}
function eliminateTwo(){const a=state.arcade;const pool=a.candidates.map((_,i)=>i).filter(i=>i!==a.answerIndex&&!a.eliminated.includes(i));C.shuffle(pool).slice(0,2).forEach(i=>a.eliminated.push(i));renderAll();cloneAudio('reveal',.4)}
function revealIndovina(){const a=state.arcade;closeArcadeTabletRound(true);a.revealed=true;a.eliminated=a.candidates.map((_,i)=>i).filter(i=>i!==a.answerIndex);stopTimer();a.started=false;renderAll();cloneAudio('final',.82)}
function matchingHTML(a){
 /* RC2-A.3: immagini grandi (contain, mai cover) con numeri ben visibili; nomi A–D grandi a tutta altezza; alla soluzione la lettera giusta enorme sull'immagine. */
 const sol=String(a.solution||'').split(' ');
 const cards=`<div class="matchCards">${a.cards.map((c,i)=>{const s=a.revealCount>i?sol[i]||'':'';return `<div class="matchCard"><img src="${imagePath(c.img,a._packId)}" alt="${esc(c.title||'Immagine')}"><div class="matchNum">${i+1}</div><div class="matchAnswer ${s?'show':''}">${s?`<b>${esc(s.replace(/^\d+/,''))}</b>`:''}</div></div>`}).join('')}</div>`;
 const terms=`<div class="termList">${a.names.map((nm,i)=>`<div class="term"><b>${C.LETTERS[i]}</b><span>${esc(nm)}</span></div>`).join('')}</div>`;
 return gameFrame(a,gameName('abbinamenti').toUpperCase(),`<div class="matchLayout">${cards}${terms}</div>`,{extra:`<span class="gsSub">ABBINA NUMERI E LETTERE</span>`});
}
function ghHTML(a){
 /* RC2-A.3: parole A/B enormi a tutta altezza; parola finale gigante; il montepremi scenico resta una riga discreta. */
 const name=gameName('ghigliottina').toUpperCase();
 if(a.final){const body=`<div class="ghWrap ghWrapFinal"><div class="ghClues">${a.pairs.map(p=>`<span>${esc(p.correct)}</span>`).join('')}</div><div class="ghFinal ${a.revealedFinal?'revealed':''}">${a.revealedFinal?esc(a.answer):`<span class="ghMask">${esc(C.chainMask(a.answer,[]))}</span>`}</div><div class="ghMeta">UNA SOLA PAROLA LE COLLEGA TUTTE · MONTEPREMI SCENICO ${a.jackpot}</div></div>`;return gameFrame(a,name,body,{extra:`<span class="gsSub">FINALE</span>`})}
 const p=a.pairs[a.step]||a.pairs[a.pairs.length-1];const phase=!p.selected?'SCEGLI LA PAROLA CHE RESTA':!p.resolved?`VERIFICA IN CORSO · SCELTA ${p.selected}`:`RIMANE ${p.correctSide}`;
 const card=(side,word)=>`<div class="ghWord ${p.selected===side?'selected':''} ${p.selected===side&&!p.resolved?'armed':''} ${p.resolved&&p.correctSide!==side?'lost':''} ${p.resolved&&p.correctSide===side?'survives':''}"><div class="ghPlaque">${side}</div><div class="ghBlade"></div><div class="ghLight"></div><div class="ghText">${esc(word)}</div><div class="ghStamp">${p.resolved?(p.correctSide===side?'RIMANE':'ELIMINATA'):(p.selected===side?'SCELTA':'')}</div></div>`;
 return gameFrame(a,name,`<div class="ghWrap"><div class="ghStatus">${phase}</div><div class="ghPair">${card('A',p.a)}${card('B',p.b)}</div></div>`,{extra:`<span class="gsSub">COPPIA ${a.step+1} DI ${a.pairs.length}</span>`});
}
function chooseGh(side){const epoch=arcadeEpoch,a=state.arcade,p=a.pairs[a.step];if(!a.started)return toast(`Avvia prima ${gameName('ghigliottina')}.`);if(!p||p.selected)return;const rid=a.pairRoundId||SS.uuid();ghClosePairRound();p.selected=side;ghCommitPair(a,p,rid);a.started=true;renderAll();cloneAudio('select',.62);setTimeout(()=>{if(epoch===arcadeEpoch&&state.screen==='arcade')cloneAudio('cut',.62)},260);setTimeout(()=>{if(epoch!==arcadeEpoch||state.screen!=='arcade')return;p.resolved=true;if(side!==p.correctSide){a.jackpot=Math.max(50,Math.floor(a.jackpot/2));cloneAudio('halve',.75)}else cloneAudio('survive',.68);renderAll();setTimeout(()=>{if(epoch!==arcadeEpoch||state.screen!=='arcade')return;if(a.step>=a.pairs.length-1){a.final=true;a.started=true;clearPending();arcadeStartRound();resetTimer(a.seconds);cloneAudio('ghfinal');renderAll();startTimer('ghBed')}else{a.step++;ghOpenPairRound();renderAll()}},1250)},900)}
function startMatching(){if(state.arcade?.played||state.arcade?.started||state.arcade?.scoreCommitted)return toast('Manche già avviata: usa pausa o carica una nuova manche.');const a=state.arcade;if(!a||a.type!=='abbinamenti')return;a.played=true;a.started=true;a.revealCount=0;a.scoreCommitted=false;clearPending();arcadeStartRound();resetTimer(a.seconds);renderAll();cloneAudio('arcade',.84);startTimer('timerBed')}
/* Ghigliottina sui tablet (v3.6.0): per ogni coppia un round a scelta A/B (stesso protocollo delle domande, layout mcq).
   I voti non assegnano punti (i punti restano solo sulla parola finale); la maggioranza delle pulsantiere collegate sceglie, il docente può sempre decidere. */
function ghOpenPairRound(){const a=state.arcade;if(!a||a.type!=='ghigliottina'||a.final||!a.started)return;const p=a.pairs[a.step];if(!p||p.selected)return;ghClosePairRound();a.pairRoundId=SS.uuid();a.pairOpenedAt=SS.nowISO();a.votes={};a.voteMeta={};a.ghManual={};NET.openRound({roundInstanceId:a.pairRoundId,kind:'arcade',gameType:'ghigliottina',questionId:null,layout:'mcq',letters:['A','B'],correct:null,durationMs:300000});logEvent({event:'round.open',roundInstanceId:a.pairRoundId,reason:`ghigliottina · coppia ${a.step+1} di ${a.pairs.length} (voto A/B)`})}
function ghClosePairRound(){const a=state.arcade;if(a&&a.pairRoundId){NET.closeRound(a.pairRoundId);logEvent({event:'round.close',roundInstanceId:a.pairRoundId,reason:'voto A/B chiuso'});a.pairRoundId=null}}
function ghVoteLabel(a,side){if(!a||!a.votes||!a.pairRoundId)return'';const n=Object.values(a.votes).filter(v=>v===side).length;return ` · ${n} ${n===1?'voto':'voti'}`}
function ghVote(rec){const a=state.arcade,p=a.pairs[a.step];if(!p||p.selected)return;const v=String(rec.selectedAnswer||'').trim().toUpperCase();if(v!=='A'&&v!=='B')return;a.votes=a.votes||{};a.votes[rec.participantId]=v;a.voteMeta=a.voteMeta||{};a.voteMeta[rec.participantId]={responseTimeMs:rec.responseTimeMs,deviceId:rec.deviceId,responseId:rec.responseId,receivedAt:rec.receivedAt};logEvent({event:'gh.vote',roundInstanceId:rec.roundInstanceId,participantId:rec.participantId,deviceId:rec.deviceId,answer:v,accepted:true});renderAll();const devs=NET.teamDevices(),voters=state.teams.filter(t=>devs[t.id]&&devs[t.id].connected);if(!voters.length||!voters.every(t=>a.votes[t.id]))return;const n={A:0,B:0};voters.forEach(t=>n[a.votes[t.id]]++);if(n.A===n.B){toast(`⚠ Parità ${n.A}–${n.B}: scegli tu A o B.`,'warn');return}const side=n.A>n.B?'A':'B';toast(`✓ Le squadre hanno scelto ${side} (${n.A}–${n.B})`,'ok');chooseGh(side)}
/* RC2-A.2 — ogni scelta A/B di una coppia è un micro-round (scala gh_pair): ogni squadra è valutata da sola, corretta +10, errata 0, omessa 0.
   La maggioranza dei tablet resta solo la scelta scenica sul palco. Risposta a mano del docente > voto del tablet > omessa. */
function ghPairRecords(a,p,rid){const bound=NET.boundTeamIds(),man=a.ghManual||{},votes=a.votes||{},meta=a.voteMeta||{};return state.teams.map((t,i)=>{const mv=man[t.id],tv=votes[t.id];let answer=null,inputMode='manual',auto=false,x={};if(mv){answer=mv==='abstain'?null:mv}else if(tv){answer=tv;inputMode='tablet';x=meta[t.id]||{}}else{inputMode=bound[t.id]?'tablet':'manual';auto=true}return Object.assign(SS.makeResponse({responseId:x.responseId,sessionId:state.session.sessionId,roundInstanceId:rid,kind:'arcade',gameType:'ghigliottina',participantId:t.id,participantType:t.type||'team',selectedAnswer:answer,correctAnswer:p.correctSide,outcome:answer?(answer===p.correctSide?'correct':'wrong'):'omitted',responseTimeMs:x.responseTimeMs,inputMode,auto,order:i+1,deviceId:x.deviceId,receivedAt:x.receivedAt}),arcadeProvenance())})}
function ghCommitPair(a,p,rid){if(!state.session||!state.teams.length||p.committed)return;const round={roundInstanceId:rid,kind:'arcade',openedAt:a.pairOpenedAt||SS.nowISO(),closedAt:SS.nowISO(),revealedAt:SS.nowISO(),committed:false,scale:'gh_pair'};finalizeRound(ghPairRecords(a,p,rid),Object.assign(arcadeProvenance(),{gameType:'ghigliottina',ghPart:'pair',pairIndex:a.step,label:a.label,presetIndex:a.presetIndex,gameInstanceId:a.gameId||null,seconds:null,solution:p.correct,correctAnswer:p.correctSide,scale:'gh_pair'}),round);p.committed=true;p.roundId=rid;autosave('gh.pair',0)}
/* Squadre senza tablet: il docente registra A / B / Ø per ciascuna prima di scegliere la parola sul palco. */
function ghPick(id,v){const a=state.arcade,p=a&&a.pairs&&a.pairs[a.step];if(!a||a.type!=='ghigliottina'||a.final||!a.started||!p||p.selected)return;a.ghManual=a.ghManual||{};if(a.ghManual[id]===v)delete a.ghManual[id];else a.ghManual[id]=v;logEvent({event:'gh.pick',roundInstanceId:a.pairRoundId,participantId:id,answer:v==='abstain'?null:v,accepted:true});renderScorePanel();renderCockpit();autosave('gh.pick',300)}
function ghPairCards(a){const p=a.pairs[a.step]||{},man=a.ghManual||{},votes=a.votes||{};if(!a.started)return '<div class="help">Avvia la manche: per ogni coppia ogni squadra sceglie A o B. Scelta giusta +10 PT, errata o nessuna scelta 0.</div>';return `<div class="help" style="margin:0 0 8px">COPPIA ${a.step+1}/${a.pairs.length} · ogni scelta giusta +10 PT alla squadra. Il voto dei tablet arriva da solo; per le altre squadre premi A, B o Ø, poi SCEGLI A/B per il palco.</div>`+state.teams.map(t=>{const mv=man[t.id],tv=votes[t.id],cur=mv||tv||'';const src=mv?'a mano':tv?'dal tablet':'';return `<div class="scoreTeam"><div class="scoreTeamTop"><b>${esc(t.name)}</b><span class="scorePreview">${cur?(cur==='abstain'?'Ø':cur)+' · '+src:'—'}</span></div><div class="scoreButtons outcomes"><button class="scoreBtn ${mv==='A'?'selected':''}" data-ghpick="${t.id}|A"${p.selected?' disabled':''}>A</button><button class="scoreBtn ${mv==='B'?'selected':''}" data-ghpick="${t.id}|B"${p.selected?' disabled':''}>B</button><button class="scoreBtn ${mv==='abstain'?'selected':''}" data-ghpick="${t.id}|abstain"${p.selected?' disabled':''}>Ø</button></div></div>`}).join('')}
function startGh(){const a=state.arcade;if(!a||a.type!=='ghigliottina'||a.played)return toast('Carica una nuova manche per ricominciare.');a.played=true;a.started=true;a.scoreCommitted=false;clearPending();arcadeStartRound();resetTimer(a.seconds);ghOpenPairRound();renderAll();cloneAudio('arcade',.84)}
function revealGhFinal(){const a=state.arcade;closeArcadeTabletRound(true);a.revealedFinal=true;stopTimer();a.started=false;renderAll();cloneAudio('final',.82)}
function chainHTML(a){
 /* RC2-A.3: parola di partenza e parola da trovare grandi; sopra il percorso della staffetta con i passaggi già risolti e quelli che mancano. */
 const link=a.links[a.index]||{from:'—',to:'—'},mask=a.revealed?link.to:C.chainMask(link.to,a.helpPositions.slice(0,a.visibleHelp));
 const words=[(a.links[0]||{}).from||''].concat(a.links.map(l=>l.to));
 const path=`<div class="chainPath">${words.map((w,j)=>{const known=j<=a.index||(j===a.index+1&&a.revealed);const cur=j===a.index+1;return `${j?'<i class="chainSep">→</i>':''}<span class="chainStep${known?' on':''}${cur?' cur':''}">${known?esc(w):cur?'?':j+1}</span>`}).join('')}</div>`;
 return gameFrame(a,gameName('chain').toUpperCase(),`<div class="chainWrap">${path}<div class="chainPair"><div class="chainWord">${esc(link.from)}</div><div class="chainArrow">→</div><div class="chainWord chainMask" id="chainMask">${esc(mask)}</div></div></div>`,{extra:`<span class="gsSub">PASSAGGIO ${a.index+1} DI ${a.links.length}</span>`});
}
function prepareChainRound(){const a=state.arcade,word=a.links[a.index]?.to||'';a.helpPositions=C.chainHelpPositions(word);a.visibleHelp=0;a.revealed=false;a.started=false;resetTimer(a.seconds)}
function startChain(){if(state.arcade?.played||state.arcade?.started||state.arcade?.scoreCommitted)return toast('Manche già avviata: usa pausa o carica una nuova manche.');state.arcade.played=true;const a=state.arcade;prepareChainRound();a.started=true;a.visibleHelp=Math.min(1,a.helpPositions.length);a.scoreCommitted=false;clearPending();arcadeStartRound();renderAll();cloneAudio('arcade',.84);startTimer('chainBed');cloneAudio('letter',.5)}
function updateChainMask(){const a=state.arcade,link=a.links[a.index];if(!link)return;const text=a.revealed?link.to:C.chainMask(link.to,a.helpPositions.slice(0,a.visibleHelp));stageDocs().forEach(d=>{const e=d.getElementById('chainMask');if(e)e.textContent=text});NET.showRefresh()}
/* Gli automatismi scalano con la durata: con 30 s restano identici alla v3 (un pezzo al secondo, aiuti a 0/10/20). */
function arcadeTimerTick(totalElapsed){if(state.screen!=='arcade')return;const a=state.arcade;if(!a||!a.started)return;if(a.type==='photopuzzle'){const due=C.photopuzzleRevealCount(totalElapsed,a.pieceInterval||1,a.revealOrder.length);while(a.revealed<due)removePuzzlePiece(false);return}if(a.type==='chain'){const scaled=totalElapsed*30/TM.secondsFor(a.seconds,a.type);const should=Math.min(a.helpPositions.length,C.chainAutoHelpCount(scaled,Math.min(4,a.helpPositions.length)));if(should>a.visibleHelp){a.visibleHelp=should;updateChainMask();cloneAudio('letter',.55)}}}
function chainRevealOne(){const a=state.arcade;if(a.visibleHelp<a.helpPositions.length){a.visibleHelp++;updateChainMask();cloneAudio('letter',.55)}}
function chainSolve(){const a=state.arcade;closeArcadeTabletRound(true);a.revealed=true;updateChainMask();stopTimer();a.started=false;cloneAudio('final',.65)}
function chainNext(){const a=state.arcade;a.played=false;a.resultsVisible=false;if(a.index<a.links.length-1)a.index++;else{a.index=0;a.gameId=SS.uuid()}prepareChainRound();a.scoreCommitted=false;state.round=null;clearPending();renderAll()}
function arcadeScoreKey(){const a=state.arcade;if(!a)return'';return `Soluzione privata: <b>${esc(arcadeSolution(a))}</b>`}
function arcadeScoreCards(){const pts=state.arcade.scoreCommitted?committedPoints(state.round&&state.round.roundInstanceId):previewPoints();return state.teams.map(t=>{const v=state.pending[t.id],p=pts[t.id],m=state.entryMeta[t.id]||{},typed=m.inputMode==='tablet'&&m.selectedAnswer!=null?`<div class="help" style="margin:6px 0 0">Pulsantiera: <b>${esc(m.selectedAnswer)}</b>${m.responseTimeMs!=null?` · ${(m.responseTimeMs/1000).toFixed(1)} s`:''}</div>`:'';return `<div class="scoreTeam"><div class="scoreTeamTop"><b>${esc(t.name)}</b><span class="scorePreview ${p>0?'good':p<0?'bad':''}">${v?SC.signed(p||0)+' pt':`${t.score} pt totali`}</span></div>${typed}<div class="scoreButtons outcomes"><button class="scoreBtn ${v==='correct'?'selected':''}" data-ascore="${t.id}|correct">✓ GIUSTA</button><button class="scoreBtn ${v==='wrong'?'selected':''}" data-ascore="${t.id}|wrong">✗ ERRATA</button><button class="scoreBtn ${v==='abstain'?'selected':''}" data-ascore="${t.id}|abstain">Ø OMESSA</button></div></div>`}).join('')}
/* RC2-A.1: un record per squadra con lo STESSO availableMs del round (quello inviato al server all'apertura, + secondi aggiunti),
   così il primo calcolo della regia coincide con quello del server, senza correzioni successive. */
function arcadeRecords(a,solution){const av=roundAvailableMs();return state.teams.map(t=>{const m=state.entryMeta[t.id]||{};return Object.assign(SS.makeResponse({responseId:m.responseId,sessionId:state.session.sessionId,roundInstanceId:state.round.roundInstanceId,kind:'arcade',gameType:a.type,participantId:t.id,participantType:t.type||'team',selectedAnswer:m.selectedAnswer==null?null:m.selectedAnswer,correctAnswer:solution||null,outcome:state.pending[t.id],responseTimeMs:m.responseTimeMs,availableMs:av,inputMode:m.inputMode||'manual',auto:!!m.auto,order:entryOrder(t.id),deviceId:m.deviceId,receivedAt:m.receivedAt}),arcadeProvenance())})}
function commitArcadeScores(){const a=state.arcade;if(!a||a.scoreCommitted)return;if(!state.teams.length)return toast('Aggiungi almeno due squadre.');if(a.started){stopTimer();a.started=false;closeArcadeTabletRound(true)}if(state.teams.some(t=>!(t.id in state.pending)))fillMissingAbstain();if(state.teams.some(t=>!(t.id in state.pending)))return toast('Impossibile completare automaticamente le risposte mancanti.','err');ensureArcadeRound();const solution=arcadeSolution(a);const records=arcadeRecords(a,solution);finalizeRound(records,Object.assign(arcadeProvenance(),{gameType:a.type,label:a.label,presetIndex:a.presetIndex,gameInstanceId:a.gameId||null,ghPart:a.type==='ghigliottina'?'final':undefined,chainIndex:a.type==='chain'?a.index:null,seconds:a.seconds,solution}));a.scoreCommitted=true;closeArcadeTabletRound(true);renderAll();cloneAudio('correct',.5);toast('✓ Punteggi del gioco registrati.','ok');autosave('commit',0)}
function arcadeProvenance(){const a=state.arcade||{},rt=P[a._packId]||P[state.packKey]||{};return {packId:rt.id||null,packVersion:(rt.meta||{}).version||'',subject:(rt.meta||{}).subject||'',topic:a.theme||rt.title||'',sourceQuestionId:null}}
function commitScores(){if(state.screen==='question')commitQuestionScores();else if(state.screen==='arcade')commitArcadeScores()}
function gameControlsHTML(){const a=state.arcade,sets=pack().arcadeSets[a.type]||[];let h=`<div class="panel gamePanel"><div class="panelHead"><h3>${esc(gameName(a.type))}</h3><span class="badge">${a.presetIndex+1}/${sets.length} · ${a.seconds} s</span></div><div class="presetNav"><button class="btn ghost" data-preset-delta="-1">←</button><select id="presetSelect" class="control">${sets.map((x,i)=>`<option value="${i}" ${i===a.presetIndex?'selected':''}>${esc((state.mixed&&x._packTitle?'['+x._packTitle+'] ':'')+x.label)}</option>`).join('')}</select><button class="btn ghost" data-preset-delta="1">→</button></div>`;
 if(EDITABLE_GAMES.includes(a.type)&&!state.mixed)h+=`<div class="editorActions"><button class="btn primary" data-edit-game="new">＋ NUOVO DA ZERO</button><button class="btn ghost" data-edit-game="edit">MODIFICA COMPLETA</button><button class="btn ghost" data-edit-game="copy">DUPLICA</button></div><p class="help">Tema, parole, alternative, indizi, durata e soluzione sono tutti modificabili. Le modifiche salvate restano nell’archivio giochi.</p>`;
 if(a.type==='photopuzzle')h+=`<button class="btn ghost wide top8" id="newPuzzleBtn">Nuovo disegno puzzle</button><label class="top8">Soluzione<input id="photoAnswer" class="control" value="${esc(a.answer)}"></label><label class="btn ghost wide top8 fileLabel">Carica immagine dal PC<input id="photoUploadInput" type="file" accept="image/*"></label>`;
 if(a.type==='abbinamenti')h+=`<button class="btn ghost wide top8" id="reshuffleMatchBtn">Rimescola termini</button><label class="top8">Termini corretti, uno per immagine<textarea id="matchNamesEditor" class="control">${esc((a.sourceNames||a.names).join('\n'))}</textarea></label><button class="btn primary wide" id="applyMatchBtn">Applica termini</button><div class="matchUploadGrid top8">${a.cards.map((c,i)=>`<label class="btn ghost fileLabel">IMG ${i+1}<input type="file" accept="image/*" data-match-upload="${i}"></label>`).join('')}</div><div class="answerKey">Soluzione: <b>${esc(a.solution)}</b></div>`;
 if(a.type==='indovina')h+=`<div class="answerKey">Soluzione: <b>${esc(a.subject)}</b></div>`;
 if(a.type==='ghigliottina')h+=a.final?`<p class="help">Finale: le squadre scrivono la parola (timer di ${a.seconds} secondi).</p><div class="answerKey">Parola finale: <b>${esc(a.answer)}</b></div>`:`<p class="help">Cinque coppie: scegli A o B dai comandi in alto. Con i tablet votano le squadre: quando hanno votato tutte quelle collegate sceglie la maggioranza (in parità scegli tu). Il timer di ${a.seconds} secondi parte nella finale; il montepremi è solo scenico.</p><button class="btn ghost wide top8" id="resetGhBtn">Ricomincia / mescola A-B</button><div class="answerKey">Parola finale: <b>${esc(a.answer)}</b></div>`;
 if(a.type==='chain')h+=`<div class="answerKey">Parola ${a.index+1} di ${a.links.length}: <b>${esc(a.links[a.index]?.to||'')}</b></div>`;
 h+=`<p class="help cockpitNote">▶ Avvio, aiuti, pausa, soluzione e AVANTI sono nei comandi in alto, sempre visibili.</p>`;
 const inline=`<div class="panel gameScoreInline"><div class="panelHead"><h3>RISPOSTE E PUNTI</h3><span class="badge">${state.teams.filter(t=>t.id in state.pending).length}/${state.teams.length}</span></div>${state.teams.length?arcadeScoreCards():'<p class="help">Aggiungi le squadre per giocare.</p>'}${scoreOrderHTML()}<div class="row gap top8"><button class="btn ghost wide" id="fillGameAbstainBtn" ${a.started?'disabled':''}>MANCANTI = Ø</button><button class="btn primary wide" id="commitGameInlineBtn" ${a.scoreCommitted?'disabled':''}>✓ CONFERMA PUNTI</button></div><p class="help">${esc(rules())}. Con AVANTI / PROSSIMA i punti si confermano da soli (mancanti = Ø).</p></div>`;
 return h+`</div>`+inline;
}
function applyMatchEditor(){const a=state.arcade;const names=$('#matchNamesEditor').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(names.length!==a.cards.length)return toast(`Servono ${a.cards.length} termini.`);const built=C.buildMatching({cards:a.cards,names,seconds:a.seconds});Object.assign(a,built,{type:'abbinamenti',presetIndex:a.presetIndex,label:a.label,seconds:a.seconds});clearPending();resetTimer(a.seconds);renderAll();toast('Abbinamenti aggiornati.')}

/* ---------------- ARCHIVIO DOMANDE ---------------- */
function sourceHTML(x){return Number.isInteger(x?.sourcePage)?`<small class="sourceRef">Fonte: ${esc(x.sourceDeck||'Dispensa')} · pagina ${x.sourcePage}</small>`:''}
function renderBank(){const list=$('#questionList');$('#bankCount').textContent=state.bank.length;const f=RC.bankFacets(state.bank),tSel=$('#bankTopic'),dSel=$('#bankDifficulty');if(tSel&&tSel.dataset.sig!==f.topics.join('|')){const v=tSel.value;tSel.innerHTML='<option value="">Tutti gli argomenti</option>'+f.topics.map(t=>`<option${t===v?' selected':''}>${esc(t)}</option>`).join('');tSel.dataset.sig=f.topics.join('|')}if(dSel&&dSel.dataset.sig!==f.difficulties.join('|')){const v=dSel.value;dSel.innerHTML='<option value="">Ogni difficoltà</option>'+f.difficulties.map(d=>`<option value="${d}"${String(d)===v?' selected':''}>Difficoltà ${d}</option>`).join('');dSel.dataset.sig=f.difficulties.join('|')}const query={text:($('#bankSearch')||{}).value||'',topic:tSel?tSel.value:'',difficulty:dSel?dSel.value:''},idx=RC.searchBank(state.bank,query),info=$('#bankResultInfo');if(info)info.textContent=query.text||query.topic||query.difficulty?`${idx.length} di ${state.bank.length}`:'';list.innerHTML=idx.map(i=>{const x=state.bank[i],played=!!state.completedRounds[x.id],cur=state.screen==='question'&&i===state.qIndex,pend=!!(state.deferredEdits||{})[x.id];return `<div class="bankQ${cur?' isCurrent':''}"><div class="bankQTop"><span>${i+1} · ${state.mixed&&x.source?esc(x.source.packTitle)+' · ':''}${esc(x.category)} · ${TM.secondsFor(x)} s${x.difficulty?' · diff. '+x.difficulty:''}${played?' · <b class="good">✓ giocata</b>':''}${cur?' · <b class="curTag">CORRENTE</b>':''}${pend?' · <b class="warn">modifica in attesa</b>':''}</span><div style="margin-left:auto"><button class="btn ghost tiny" data-go-q="${i}"${cur?' disabled':''}>Vai</button> <button class="btn ghost tiny" data-edit-q="${i}">Modifica</button> <button class="btn red tiny" data-del-q="${i}">Elimina</button></div></div><div class="bankQText">${esc(x.question)}${sourceHTML(x)}</div></div>`}).join('')||'<p class="help">Nessuna domanda trovata.</p>'}
function openQuestionDialog(i=null){if(i==null&&mixedGuard())return;const x=i==null?{category:pack().title,question:'',options:['','','',''],correct:'A',explanation:'',image:''}:((state.deferredEdits||{})[state.bank[i].id]||state.bank[i]);$('#editIndex').value=i==null?'':i;$('#dialogTitle').textContent=i==null?'Nuova domanda':i===state.qIndex&&state.screen==='question'?`Modifica domanda ${i+1} (corrente)`:`Modifica domanda ${i+1}`;questionDialogMode(i);$('#qCategory').value=x.category||'';$('#qText').value=x.question||'';['A','B','C','D'].forEach((L,k)=>$(`#q${L}`).value=x.options?.[k]||'');$('#qCorrect').value=x.correct||'A';$('#qSeconds').value=x.seconds==null||x.seconds===''?'':x.seconds;$('#qSeconds').placeholder=`standard: ${TM.DEFAULTS.question} s`;$('#qExplanation').value=x.explanation||'';$('#qImage').value=x.image||'';$('#questionDialog').showModal()}
function saveQuestionFromDialog(ev){ev.preventDefault();const how=ev.submitter?.value||'default';if(how==='cancel'){$('#questionDialog').close();return;}
const idx=$('#editIndex').value===''?null:Number($('#editIndex').value),old=idx==null?{}:((state.deferredEdits||{})[state.bank[idx].id]||state.bank[idx]);
const raw={...old,id:old.id||SS.uuid(),category:$('#qCategory').value.trim()||pack().title,type:'mcq',question:$('#qText').value.trim(),options:['A','B','C','D'].map(L=>$(`#q${L}`).value.trim()),correct:$('#qCorrect').value,explanation:$('#qExplanation').value.trim(),seconds:Number($('#qSeconds').value)||undefined,image:$('#qImage').value.trim(),subject:old.subject||pack().meta.subject||'',topic:old.topic||pack().title,status:'approved'};
let x;try{x=PE.normalizeQuestion(raw,idx==null?state.bank.length:idx,{lenient:true,imagePrefixes:pack().imagePrefixes,makeId:()=>SS.uuid()})}catch(e){return toast('✗ '+e.message.replace(/^domanda \d+: /,''),'err')}
if(idx==null){state.bank.push(x);persistBank();$('#questionDialog').close();renderAll();return}
if(how==='restart'&&!confirm('Annullare la domanda in corso e riavviarla con la nuova versione?\nLe risposte già ricevute vengono scartate e non si assegnano punti. Squadre e punteggi restano.'))return;
const rid=state.round&&state.round.roundInstanceId,open=RC.roundOpen(state)&&idx===state.qIndex;
if(how==='restart'&&open){stopTimer();NET.closeRound(rid);logEvent({event:'round.cancel',roundInstanceId:rid,reason:'modifica e riavvio'})}
const res=RC.applyEdit(state,idx,x,how==='restart'?'restart':'later');if(res.restarted)resetTimer(TM.secondsFor(q()));
logEvent({event:'question.edit',reason:`domanda ${idx+1}${res.deferred?' (round in corso: versione precedente mantenuta)':res.restarted?' (round annullato e riavviato)':''}`});
$('#questionDialog').close();renderAll();autosave('question.edit',0);
savePackQuestions(x.source&&x.source.packId||state.packKey,{question:editableFields(x)}).then(r=>{if(!r.ok)return toast('✗ Salvataggio fallito: '+(r.reason||''),'err');const where=r.where==='browser'?` (solo in questo browser: ${r.reason})`:'';if(res.deferred)toast('⚠ Modifica salvata. Il round corrente mantiene la versione precedente.'+where,'warn');else if(res.restarted)toast('✓ Modifica salvata: domanda pronta per essere rilanciata'+where,r.where==='browser'?'warn':'ok');else toast('✓ Modifica salvata'+where,r.where==='browser'?'warn':'ok')})}
function bankChanged(){showHome();state.qIndex=Math.min(state.qIndex,Math.max(0,state.bank.length-1));state.qRound=null}
/* Archivio: il pacchetto installato è la fonte persistente (stesso salvataggio di Pack Studio). Se è in sola lettura resta la copia di questo browser. */
function persistBank(){const id=state.packKey,qs=state.bank.filter(b=>(b.source&&b.source.packId||state.packKey)===id).map(PL.storedQuestion);bankChanged();savePackQuestions(id,{all:qs}).then(r=>{if(r.where==='pack')return refreshLibrary().then(()=>{loadBank();renderAll();toast('✓ Archivio salvato nel pacchetto (v'+r.version+')','ok')});loadBank();renderAll();toast(r.ok?'⚠ Archivio salvato solo in questo browser: '+r.reason:'✗ Salvataggio fallito','warn')})}
function editableFields(x){return {id:x.source&&x.source.questionId||x.id,type:'mcq',category:x.category,question:x.question,options:x.options.slice(),correct:x.correct,explanation:x.explanation,seconds:x.seconds,image:x.image}}
function packQuestionsFromBank(packId){return state.bank.filter(b=>(b.source&&b.source.packId||state.packKey)===packId).map(PL.storedQuestion)}
let packSaveChain=Promise.resolve();
/* Salva domande nel pacchetto installato (change.question = una domanda, change.all = elenco completo dell'Archivio). Un salvataggio alla volta. */
function savePackQuestions(packId,change){
 const job=async()=>{
  const fallback=reason=>{const list=change.all||packQuestionsFromBank(packId).map(b=>b.id===change.question.id?Object.assign({},b,change.question):b);bankOverrides[packId]=list;savePrefs();return {ok:true,where:'browser',reason}};
  if(!PS||!PKC)return fallback('editor dei pacchetti non disponibile');
  let r;try{r=await PKC.openBytes(packId)}catch(e){r={ok:false}}
  if(!r||!r.ok)return fallback('pacchetto del programma in sola lettura');
  try{
   const d=PS.draftFromImport(PL.readImport(r.filename,r.bytes),{libraryId:packId});
   const list=change.all||(bankOverrides[packId]?packQuestionsFromBank(packId).map(b=>b.id===change.question.id?Object.assign({},b,change.question):b):null);
   if(list){const ids={};list.forEach(b=>ids[b.id]=true);d.questions=list.concat(d.questions.filter(b=>(b.status||'approved')!=='approved'&&!ids[b.id]))}
   else{const i=d.questions.findIndex(b=>b.id===change.question.id);if(i<0)throw new Error('domanda non trovata nel pacchetto');d.questions[i]=Object.assign({},d.questions[i],change.question)}
   d.manifest.version=PS.bumpVersion(d.manifest.version);
   const s=await PKC.save(packId,PS.toZip(d).bytes,'replace');
   if(!s||!s.ok)throw new Error((s&&s.errors&&s.errors[0])||'salvataggio non riuscito');
   if(bankOverrides[packId]){delete bankOverrides[packId];savePrefs()}
   if(!change.all)refreshLibrary();
   return {ok:true,where:'pack',version:d.manifest.version,backup:s.backup||null};
  }catch(e){return fallback(e.message)}
 };
 packSaveChain=packSaveChain.then(job,job);return packSaveChain;
}
/* Finestra di modifica: in anteprima un solo SALVA; a round aperto il round resta immutabile (salva per dopo / salva e riavvia). */
function questionDialogMode(i){const cur=i!=null&&state.screen==='question'&&i===state.qIndex,locked=cur&&RC.isLocked(state),open=cur&&RC.roundOpen(state);const show=(id,v)=>{const e=$(id);if(e)e.hidden=!v};show('#saveQuestionBtn',!locked);show('#saveLaterBtn',locked);show('#saveRestartBtn',open);const n=$('#qLockNote');if(n){n.hidden=!locked;n.textContent=open?'Il round di questa domanda è già aperto: le risposte arrivate restano legate alla versione giocata. Scegli se salvare per le prossime volte o annullare il round e rilanciare la domanda aggiornata.':'Questa domanda è già stata giocata: la modifica vale per le prossime volte (per rigiocarla usa RIPETI DOMANDA).'}}
function editCurrentQuestion(){if(state.screen!=='question'||!q())return toast('Apri prima una domanda.','warn');openQuestionDialog(state.qIndex)}
function cancelRoundCore(reason){const rid=state.round&&state.round.roundInstanceId;stopTimer();if(rid){NET.closeRound(rid);logEvent({event:'round.cancel',roundInstanceId:rid,reason})}const r=RC.cancelRound(state);resetTimer(TM.secondsFor(q()));return r}
function cancelQuestion(){state.roundResultsVisible=false;if(!RC.roundOpen(state))return toast('Nessuna domanda in corso da annullare.','warn');if(!confirm('Annullare la domanda in corso?\nLe risposte di questo round vengono scartate e non si assegnano punti. Squadre e punteggi restano.'))return;cancelRoundCore('annullata dal docente');renderAll();autosave('round.cancel',0);toast('✓ Round annullato: la domanda è pronta per essere rilanciata','ok')}
function repeatQuestion(){state.roundResultsVisible=false;if(state.screen!=='question'||!(state.questionScored||state.phase==='scoring'&&state.round))return toast('Prima gioca la domanda.','warn');const scored=state.questionScored;if(!confirm(scored?'Ripetere la domanda come nuovo round?\nI punti già assegnati restano.':'Ripetere la domanda?\nLe risposte di questo round vengono scartate e non si assegnano punti.'))return;const rid=state.round&&state.round.roundInstanceId;stopTimer();if(rid&&!scored){NET.closeRound(rid);logEvent({event:'round.cancel',roundInstanceId:rid,reason:'ripetizione'})}const r=RC.prepareRepeat(state);logEvent({event:'round.repeat',roundInstanceId:r.repeatOf||rid||null,reason:scored?'punti del primo tentativo mantenuti':'round non confermato scartato'});resetTimer(TM.secondsFor(q()));renderAll();autosave('round.repeat',0);toast('✓ Domanda pronta per essere ripetuta','ok')}
let lastOffline=null,deviceTicker=null;
function fmtAgo(s){return s<60?s+' s':Math.round(s/60)+' min'}
/* Stato delle pulsantiere sempre visibile nella regia (dati già presenti: NET.teamDevices); avviso non bloccante quando una si disconnette. */
function renderDeviceLive(){const el=$('#deviceLive');if(!el)return;const st=NET.status(),sum=RC.deviceSummary(state.teams,NET.teamDevices());if(!st.available||!sum.total){el.hidden=true;lastOffline=null;return}el.hidden=false;const ok=!sum.disconnected.length;el.className='deviceLive '+(ok?'ok':'warn');el.innerHTML=`<b>📱 ${sum.connected} / ${sum.total} COLLEGATE</b>`+(ok?'':`<span>${sum.disconnected.length===1?'Disconnessa':'Disconnesse'}: ${sum.disconnected.map(d=>esc(d.name)+(d.agoSec!=null?` <small>(da ${fmtAgo(d.agoSec)}, in attesa di riconnessione)</small>`:'')).join(', ')}</span>`)+(sum.manual?`<small>${sum.manual} squadre senza pulsantiera</small>`:'');const ids=sum.disconnected.map(d=>d.id);if(lastOffline){const fresh=sum.disconnected.filter(d=>lastOffline.indexOf(d.id)<0);if(fresh.length)toast(`⚠ ${fresh.length===1?'1 pulsantiera disconnessa':fresh.length+' pulsantiere disconnesse'}: ${fresh.map(d=>d.name).join(', ')}`,'warn')}lastOffline=ids;if(!ok&&!deviceTicker)deviceTicker=setInterval(()=>{if(!(lastOffline&&lastOffline.length)){clearInterval(deviceTicker);deviceTicker=null;return}renderDeviceLive()},5000)}
function resetBank(){if(mixedGuard())return;if(!confirm('Ripristinare le domande originali di questo pack?'))return;delete bankOverrides[state.packKey];loadBank();bankChanged();savePrefs();renderAll()}
function exportBank(){download(`domande_${state.packKey}.json`,JSON.stringify(state.bank,null,2),'application/json')}
function shuffleQuestions(){if(state.mixed){state.bank=C.shuffle(state.bank);state.qIndex=0;showHome();toast('Domande della sessione mista mescolate (solo per questa partita).');return}state.bank=C.shuffle(state.bank);state.qIndex=0;persistBank();renderAll();toast('Domande mescolate.')}

/* ---------------- CLASSIFICA ED EXPORT ---------------- */
function renderResults(){const box=$('#resultsList'),r=[...state.teams].sort((a,b)=>b.score-a.score);const answered=state.session.responses.filter(x=>!x.voided).length;box.innerHTML=(r.map((t,i)=>`<div class="teamRow"><span class="teamIcon">${i+1}</span><b>${esc(t.name)}</b><span class="teamScore">${t.score} pt</span><span></span></div>`).join('')||'<div class="help">Nessun punteggio.</div>')+`<p class="help">${answered} risposte registrate · ${state.session.rounds.filter(x=>x.committed).length} round confermati · profilo ${esc(SC.getProfile(profileId()).label)}</p>`}
function reportContext(){return {session:state.session,pack:{id:pack().id,title:pack().title,version:(pack().meta||{}).version||''},app:VERSION,generatedAt:SS.nowISO()}}
function exportJSON(){saveNow('export');const n=`${fileBase()}_copia_assistenza.json`;download(n,JSON.stringify(Object.assign(buildSnapshot('export'),{bank:state.bank}),null,2),'application/json');toast(`Copia per l’assistenza salvata nella cartella Download: ${n}`)}
function exportCSV(){download(`${fileBase()}_risposte.csv`,RP.toCSV(reportContext()),'text/csv;charset=utf-8');toast('CSV esportato (separatore ;).')}
function exportReport(){const n=`${fileBase()}_report.html`;download(n,RP.toHTML(reportContext()),'text/html;charset=utf-8');state.reportExported=true;renderCockpit();toast(`Report di classe salvato nella cartella Download: ${n}`,'ok')}
async function exportLog(){let serverLog=[];try{serverLog=await NET.fetchLog()}catch(e){}download(`${fileBase()}_log_tecnico.csv`,RP.logToCSV(state.session.log,serverLog),'text/csv;charset=utf-8');toast('Log tecnico esportato.')}

/* ---------------- PALCO PUBBLICO ---------------- */
function stageDocs(){const arr=[document];try{if(publicWindow&&!publicWindow.closed)arr.push(publicWindow.document)}catch(e){}return arr}
function syncPublic(){try{if(publicWindow&&!publicWindow.closed){const s=publicWindow.document.getElementById('publicStage');if(s){s.innerHTML=stageHTML();setTheme(publicWindow.document);fitStage(publicWindow.document);setTimeout(animateMascots,0)}}}catch(e){}NET.showStage(stageHTML,{accent:pack().accent,accent2:pack().accent2,themeBg:imagePath(pack().homeImage),pack:state.packKey,title:`${pack().title.toUpperCase()}`})}
/* RC2-A: schermo intero con la Fullscreen API, solo su gesto del docente (nessun trucco). Il pulsante si nasconde a schermo intero
   e ricompare dopo ESC. Stessa logica per la finestra del proiettore (cablata da qui) e per la regia. */
function fsActive(d){return !!(d.fullscreenElement||d.webkitFullscreenElement)}
function fsRequest(d,fail){const el=d.documentElement,fn=el.requestFullscreen||el.webkitRequestFullscreen,no=()=>{if(fail)fail()};if(!fn){no();return false}try{const p=fn.call(el);if(p&&p.catch)p.catch(no)}catch(e){no();return false}/* se il browser non risponde, dopo 1,5 s si suggerisce F11 */setTimeout(()=>{if(!fsActive(d))no()},1500);return true}
function fsExit(d){const fn=d.exitFullscreen||d.webkitExitFullscreen;if(fn&&fsActive(d)){try{const p=fn.call(d);if(p&&p.catch)p.catch(()=>{})}catch(e){}}}
function wireStageFullscreen(w){try{const d=w.document,b=d.getElementById('fsGo'),h=d.getElementById('fsHide');if(!b)return;const upd=()=>{d.body.classList.toggle('isFullscreen',fsActive(d));if(fsActive(d))d.body.classList.remove('fsHidden')};const fail=()=>{const sm=b.querySelector('small');if(sm)sm.textContent='Il browser non lo permette: premi F11 su questa finestra'};b.onclick=()=>fsRequest(d,fail);if(h)h.onclick=()=>d.body.classList.add('fsHidden');d.addEventListener('keydown',e=>{if((e.key==='f'||e.key==='F')&&!e.ctrlKey&&!e.metaKey&&!e.altKey)fsRequest(d,fail)});d.addEventListener('fullscreenchange',upd);d.addEventListener('webkitfullscreenchange',upd);upd();if(window.SecchioneStageFit)window.SecchioneStageFit.watch(w)}catch(e){}}
function toggleRegiaFullscreen(){if(fsActive(document))fsExit(document);else fsRequest(document,()=>toast('Il browser non ha permesso lo schermo intero: premi F11.','warn'))}
function renderRegiaFullscreen(){const b=$('#fsRegiaBtn');if(b)b.textContent=fsActive(document)?'⤢ ESCI DA SCHERMO INTERO':'⛶ SCHERMO INTERO'}
async function openPublic(){try{publicWindow=window.open('','secchione_public','width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');if(!publicWindow)return toast('Il browser ha bloccato la finestra del proiettore: consenti i popup per questo indirizzo (icona nella barra degli indirizzi) e premi di nuovo APRI.','warn');const hrefs=['css/show.css'].map(p=>new URL(p,location.href).href);baseWrite(publicWindow,hrefs);wireStageFullscreen(publicWindow);setTimeout(()=>{syncPublic();tryMovePublic();renderCockpit();toast('Schermo del proiettore aperto: trascinalo sul proiettore e premi il grande pulsante SCHERMO INTERO (oppure F).','ok')},120)}catch(e){toast('Impossibile aprire il palco pubblico.')}}
function baseWrite(w,cssHrefs){let css='';try{css=[...document.styleSheets].map(sh=>[...sh.cssRules].map(r=>r.cssText).join('\n')).join('\n')}catch(e){}const links=(cssHrefs||[]).map(h=>`<link rel="stylesheet" href="${h}">`).join('');w.document.open();w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.href}">${css?`<style>${css}</style>`:links}</head><body class="publicBody visualMaster"><section id="publicStage" class="stage"></section><div class="fsGoBox" id="fsGoBox"><button type="button" class="fsGo" id="fsGo">⛶ SCHERMO INTERO<small>oppure premi F · per uscire ESC</small></button><button type="button" class="fsHide" id="fsHide">nascondi</button></div><div id="transition" class="transition" aria-hidden="true"><div class="transitionGlow"></div><div class="transitionSweep"></div><div class="transitionNumber" id="transitionNumber">01</div><div class="transitionContent"><img id="transitionMascot" src="${MASCOT_A}" class="transitionMascot" alt=""><img src="${BRAND_LOGO}" class="transitionLogo" alt="" width="340"><div class="transitionKicker" id="transitionKicker">NUOVA SFIDA</div><div class="transitionTitle" id="transitionTitle">DOMANDA 01</div><div class="transitionSub" id="transitionSub">${esc(pack().title)}</div></div></div></body></html>`);w.document.close();try{w.document.title=`Il Secchione · ${pack().title} · palco pubblico`}catch(e){}}
async function tryMovePublic(){try{if(window.getScreenDetails){const d=await window.getScreenDetails(),target=d.screens.find(s=>s!==d.currentScreen)||d.screens.find(s=>!s.isPrimary);if(target){publicWindow.moveTo(target.availLeft,target.availTop);publicWindow.resizeTo(target.availWidth,target.availHeight);toast('Palco spostato sul secondo schermo.');return}}toast('Palco aperto: spostalo sulla TV con Windows in modalità Estendi.')}catch(e){toast('Palco aperto: spostalo sulla TV.')}}
function homeHTML(){const pk=pack(),tx=pk.texts,games=PE.GAME_TYPES.filter(t=>(pk.arcadeSets[t]||[]).length).length;return `<div class="showHome"><section class="homeCopy"><div class="showEyebrow">${esc(tx.homeEyebrow)}</div><img class="homeLogo" src="${BRAND_LOGO}" alt="Il Secchione"><h1>${esc(pk.title.toUpperCase())}</h1><h2>${esc(pk.subtitle)}</h2><p>${esc(tx.homeClaim).replace(/\n/g,'<br>')}</p><div class="homeNumbers"><span><b>${state.bank.length}</b> domande</span><span><b>${games}</b> giochi</span><span><b>${state.teams.length}</b> squadre</span></div><div class="homeReady">● PRONTI A GIOCARE <small>Senza Internet · ${esc(rules())}</small></div></section><aside class="homeCharacter">${mascotMarkup()}<div class="speechBubble">${esc(tx.mascotHome).replace(/\n/g,'<br>')}</div></aside><div class="homeFoot">${esc(tx.footer)}</div></div>`}
function roundResultRows(round){
 const rid=state.round&&state.round.roundInstanceId||state.completedRounds[q()?.id]?.roundInstanceId||null,pts=rid?committedPoints(rid):previewPoints();
 const outcomeWeight={correct:0,wrong:1,omitted:2};
 const rows=state.teams.map(t=>{
  const has=t.id in state.pending,v=state.pending[t.id],m=state.entryMeta[t.id]||{};
  const outcome=has?SS.outcomeForAnswer(v==='abstain'?null:v,round.correctDisplayLetter):'omitted';
  return {id:t.id,name:t.name,outcome,time:typeof m.responseTimeMs==='number'?m.responseTimeMs:null,order:entryOrder(t.id),missing:!has,selected:has?(v==='abstain'?'Ø':String(v||'').toUpperCase()):'Ø',inputMode:m.inputMode||'manual',auto:!!m.auto,points:Number(pts[t.id]||0),total:Number(t.score||0)};
 });
 rows.sort((a,b)=>{
  const ow=(outcomeWeight[a.outcome]||0)-(outcomeWeight[b.outcome]||0);if(ow)return ow;
  const at=a.time==null?Number.MAX_SAFE_INTEGER:a.time,bt=b.time==null?Number.MAX_SAFE_INTEGER:b.time;if(at!==bt)return at-bt;
  return a.order-b.order||String(a.name).localeCompare(String(b.name),'it');
 });
 /* Profilo classico (partite già giocate): una risposta a mano = corrette ex aequo. Profilo 200–300: solo una CORRETTA a mano toglie il bonus. */
 const speed=speedProfile(),ex=!speed&&rows.some(r=>!r.missing&&r.inputMode==='manual'&&!r.auto),off=speed&&rows.some(r=>!r.missing&&r.outcome==='correct'&&r.inputMode==='manual'&&!r.auto)&&rows.some(r=>!r.missing&&r.inputMode==='tablet'&&!r.auto);
 return rows.map((r,i)=>Object.assign(r,{rank:ex&&r.outcome==='correct'?1:i+1,exAequo:ex&&r.outcome==='correct',speedOff:off&&r.outcome==='correct',bonus:speed&&!off&&r.outcome==='correct'&&r.inputMode==='tablet'&&r.time!=null?Math.max(0,r.points-SC.SPEED_BASE):null}));
}
function roundResultsHTML(){
 const x=q(),round=state.qRound||C.buildQuestionRound(x),rows=roundResultRows(round),n=rows.length;
 const step=n>1?Math.max(120,Math.min(520,Math.floor(2600/(n-1)))):0;
 const answer=round.displayed.find(o=>o.letter===round.correctDisplayLetter),many=n>8?' many':'',compact=n>6?' compact':'';
 const currentRid=state.round&&state.round.roundInstanceId||state.completedRounds[q()?.id]?.roundInstanceId||null;
 /* RC2-A.2: senza nessun tablet nel round le corrette valgono 300, 290, 280… nell'ordine di registrazione. */
 const byRank=speedProfile()&&!rows.some(r=>!r.missing&&r.inputMode==='tablet'&&!r.auto)&&rows.some(r=>r.outcome==='correct');
 const list=rows.map((r,i)=>{
  const cls=r.outcome==='correct'?'good':r.outcome==='wrong'?'bad':'omit',delay=i*step;r.manualPos=r.outcome==='correct'?rows.filter(x=>x.outcome==='correct'&&x.order<=r.order).length:null;
  const time=r.outcome==='omitted'?'—':r.time!=null?fmtSec(r.time):r.inputMode==='manual'?'A MANO':'—';
  let label=r.outcome==='correct'?'✓ CORRETTA':r.outcome==='wrong'?'✗ ERRATA':'Ø NESSUNA RISPOSTA';
  if(r.exAequo)label+=' · EX AEQUO (risposte a mano)';
  if(r.speedOff)label+=' · senza bonus: risposta corretta a mano nel round';
  else if(r.bonus!=null)label+=` · bonus velocità +${r.bonus}`;
  else if(r.outcome==='correct'&&speedProfile()&&r.inputMode==='manual')label+=byRank?` · inserita a mano · ${r.manualPos}ª corretta registrata`:' · inserita a mano';
  if(r.outcome==='omitted'){
   const no=(priorOmissions(currentRid)[r.id]||0)+(r.missing?1:(entryOutcome(r.id)==='omitted'?1:0));
   label+=` · ${no}/${FREE_OMISSIONS}${no>FREE_OMISSIONS?' PENALIZZATA':''}`;
  }
  const icon=r.outcome==='correct'?'✓':r.outcome==='wrong'?'✗':'Ø';
  return `<div class="resultRow ${cls}" style="--reveal-delay:${delay}ms"><b class="resultPos resultIcon" aria-hidden="true">${icon}</b><div class="resultIdentity"><span class="resultTeam">${esc(r.name)}</span><small>${esc(label)}</small></div><div class="resultResponse"><span>RISPOSTA</span><strong>${esc(r.selected||'—')}</strong></div><div class="resultTime"><span>TEMPO</span><strong>${esc(time)}</strong></div><div class="resultDelta"><span>PUNTI</span><strong>${SC.signed(r.points)}<small> pt</small></strong></div></div>`;
 }).join('')||'<div class="resultEmpty">Nessuna squadra in gara.</div>';
 const speed=speedProfile(),off=rows.some(r=>r.speedOff);
 return `<div class="roundReveal roundSummary${many}${compact}" style="--result-rows:${Math.max(1,Math.ceil(n/2))}"><header class="resultHeader"><div><span class="showEyebrow">DOMANDA ${qNumber().n} / ${qNumber().total} · RISULTATO</span><h1>RISULTATO DEL ROUND</h1></div><div class="revealDirection"><small>CORRETTA</small><strong>${speed?(off?SC.SPEED_BASE:byRank?'300 · 290…':SC.SPEED_BASE+'–'+SC.SPEED_MAX):SC.signed(SC.rankPoints(profileId(),1))}</strong></div><img src="${BRAND_LOGO}" alt="Il Secchione"></header><div class="resultAnswer"><span>RISPOSTA ESATTA</span><strong>${esc(round.correctDisplayLetter)} · ${esc(answer?.text||'')}</strong></div><main class="roundRevealList">${list}</main><footer class="roundRevealFooter"><span>${rows.some(r=>r.exAequo)?'✓ corrette ex aequo: risposte inserite a mano, nessun bonus di velocità':speed?(off?'✓ corretta inserita a mano: in questo round tutte le corrette valgono 200':byRank?'✓ senza tablet: 300, 290, 280… nell’ordine di registrazione':'✓ corretta: 200–300 pt in base alla velocità'):'✓ corrette per velocità'}</span><span>✗ errata ${SC.signed(SC.getProfile(profileId()).wrong)}</span><span>Ø nessuna risposta</span><strong>AVANTI → PROSSIMO CONTENUTO</strong></footer></div>`;
}
function questionHTML(){
 const x=q();if(!x)return homeHTML();const round=state.qRound||C.buildQuestionRound(x),started=state.phase!=='preview';
 const votes=state.teams.map(t=>state.pending[t.id]);const total=state.teams.length||1;
 const dense=String(x.question||'').length>145||round.displayed.some(o=>String(o.text||'').length>72);
 /* RC2-A: risposte brevi in griglia 2×2 (caselle più alte, testo più grande); lunghe una per riga. La dimensione la sceglie stage-fit.js. */
 const grid2=round.displayed.every(o=>String(o.text||'').length<=24);
 const options=started?`<div class="options${grid2?' grid2':''}">${round.displayed.map(o=>{const count=votes.filter(v=>v===o.letter).length;return `<div class="option ${state.answerVisible?(o.letter===round.correctDisplayLetter?'correct':'wrong'):''}"><b class="optionLetter">${o.letter}</b><span class="optionText">${esc(o.text)}</span>${state.answerVisible?`<span class="votePct">${Math.round(count/total*100)}%<small>${count} squadre</small></span>`:''}</div>`}).join('')}</div>`:`<div class="readyCue"><b>OSSERVATE E LEGGETE</b><p>Le risposte compariranno<br>all’avvio del tempo.</p></div>`;
 const status=state.phase==='preview'?'PRONTI':state.phase==='running'?(state.timer.running?'RISPONDETE':'IN PAUSA'):state.questionScored?'PUNTI ASSEGNATI':'TEMPO CHIUSO';
 const correct=votes.filter(v=>v===round.correctDisplayLetter).length,wrong=votes.filter(v=>v&&v!=='abstain'&&v!==round.correctDisplayLetter).length,abst=votes.filter(v=>v==='abstain').length,missing=state.teams.length-correct-wrong-abst;
 const tablets=Object.keys(NET.boundTeamIds()).length,received=state.teams.filter(t=>t.id in state.pending&&!(state.entryMeta[t.id]||{}).auto).length;
 const counter=tablets&&state.phase==='running'?`${received}/${state.teams.length}<small>RISPOSTE</small>`:`${state.teams.length}<small>SQUADRE</small>`;
 return `<div class="questionShow ${dense?'textDense':''} ${state.answerVisible?'withResults':''}"><header class="showHeader"><div><span class="showEyebrow">${esc(x.category)}</span><span class="roundCounter">DOMANDA ${qNumber().n} / ${qNumber().total}</span></div><img src="${BRAND_LOGO}" alt="Il Secchione"></header><div class="questionBody ${x.image?'hasArt':''}">${x.image?`<figure class="qVisual"><img src="${imagePath(x.image,x.source&&x.source.packId)}" alt="Opera da osservare"></figure>`:''}<main class="qQA"><h1 class="questionText">${esc(x.question)}</h1>${options}</main><aside class="questionSide">${publicTimerHTML(status)}${mascotMarkup()}<span class="receiptCount">${counter}</span></aside></div><footer class="questionFooter">${state.answerVisible?`<div class="answerExplanation wide"><strong>${esc(round.correctDisplayLetter)} · ${esc(round.displayed.find(o=>o.letter===round.correctDisplayLetter)?.text)}</strong><p>${esc(x.explanation)}</p>${x.sourceLabel||x.sourcePage?`<small>Fonte: ${esc(x.sourceLabel||'Dispensa')} · pagina ${x.sourcePage||'—'}</small>`:''}</div><div class="resultNextHint"><b>AVANTI →</b><span>RISULTATO DEL ROUND</span></div>`:`<span class="publicPhase">${status}</span><span class="roundRule">${esc(rules().toUpperCase())}</span>`}</footer><div class="publicProgress"><i class="liveProgress" style="width:${state.timer.duration?state.timer.remaining/state.timer.duration*100:0}%"></i></div></div>`;
}
function publicHostHTML(kind,title,bubble=''){return `<aside class="publicHostCol"><img class="publicHostLogo" src="${BRAND_LOGO}" alt="Il Secchione"><span class="hostTitle">${esc(title)}</span>${mascotMarkup()}<div class="hostBubble">${esc(bubble)}</div></aside>`}
/* RC2-A: sul palco nessun numero di posizione; i punti sono quelli del round (200–300 in base alla velocità, oppure il profilo scelto). */
function queueHTML(){const rows=previewRows();return `<div class="answerQueue"><h3>RISPOSTE CORRETTE</h3>${state.correctOrder.slice(0,9).map(id=>`<div class="queueRow"><b>✓</b><span>${esc(state.teams.find(t=>t.id===id)?.name)}</span><small>${SC.signed((rows[id]||{}).points||0)}</small></div>`).join('')||`<p>Osserva i dettagli.<br>${TM.secondsFor(state.arcade?.seconds,state.arcade?.type)} secondi per rispondere.</p>`}</div>`}
function photoHTML(a){
 /* RC2-A.3: immagine il più grande possibile (cover + punto focale invariati), griglia ben visibile, soluzione enorme; colonna stretta per le corrette. */
 const paths=C.puzzlePaths(a.edges,1200,750),total=a.revealOrder.length,solved=a.revealed>=total;
 const puzzle=`<div class="photoLayout"><div class="puzzleFrame" style="--focus:${puzzleFocus(a.focus)}"><img src="${imagePath(a.image,a._packId)}" alt="Opera misteriosa"><svg class="puzzleSvg" viewBox="0 0 1200 750" preserveAspectRatio="none">${paths.map((d,i)=>`<g id="pp-piece-${i}" class="puzzlePiece ${a.revealOrder.slice(0,a.revealed).includes(i)?'gone':''}" style="--piece:${['#72c843','#d1c43d','#e99531','#e34b49','#c52867'][Math.floor(i/6)]};--rot:${i%2?9:-9}deg"><path class="face" d="${d}"/><path class="inset" d="${d}"/></g>`).join('')}</svg><div class="puzzleSolution ${solved?'show':''}" id="puzzleSolution">${solved?esc(a.answer):''}</div></div><aside class="photoSide" id="liveQueue">${queueHTML()}</aside></div>`;
 return gameFrame(a,'PHOTOPUZZLE',puzzle,{extra:`<span class="puzzleCounter">${a.revealed}/${total}</span><span id="puzzleTopLabel" class="gsSub${solved?' solved':''}">${solved?'SOLUZIONE · '+esc(a.answer):'RICONOSCI L’OPERA'}</span>`});
}
function leaderboardHTML(){
 const rows=finalStandings(),n=rows.length,f=state.finalReveal,final=!!f,shown=f?Math.min(f.shown,n):n,complete=shown>=n;
 const fresh=final&&f.lastAt&&Date.now()-f.lastAt<1600?n-shown:-1,many=n>8,size=n<=4?' few':n>=6&&!many?' dense':'';
 const isEnd=!!(f&&f.final),title=isEnd?'CLASSIFICA FINALE':'CLASSIFICA';
 const header=`<header class="resultHeader finalHeader"><div><span class="showEyebrow">IL SECCHIONE · ${esc(pack().title.toUpperCase())}</span><h1>${title}</h1></div><div class="revealDirection"><small>${final?(complete?'VERDETTO':'REVEAL'):'SQUADRE'}</small><strong>${final&&!complete?`${shown} di ${n} rivelati`:`${n} ${n===1?'squadra':'squadre'}`}</strong></div><img src="${BRAND_LOGO}" alt="Il Secchione"></header>`;
 if(!n)return `<div class="finalScene">${header}<main class="finalIntro"><p>Aggiungi le squadre dalla regia.</p></main></div>`;
 if(final&&!shown)return `<div class="finalScene isIntro">${header}<main class="finalIntro"><span class="finalKicker">${isEnd?'LA SFIDA È FINITA':'A METÀ PARTITA'}</span><h2>${title}</h2><p>${isEnd?'Ecco il verdetto.':'Ecco la situazione fin qui.'}</p><small>${n} squadre in gara · si parte ${RC.placeFrom(rows[n-1].rank)} posto</small></main></div>`;
 const card=(r,i)=>{const pod=r.rank<=3?` podium p${r.rank}`:'';if(i<n-shown)return `<div class="finalCard locked${pod}"><b class="resultPos">${r.rank}°</b><span class="finalLock">?</span></div>`;const medal=r.rank===1?'ORO':r.rank===2?'ARGENTO':r.rank===3?'BRONZO':'',s=r.stats;return `<div class="finalCard${pod}${i===fresh?' enter':''}"><b class="resultPos">${r.rank}°</b><div class="finalIdentity"><span class="finalTeam">${esc(r.name)}</span><small>${medal?`<i class="medal">${medal}</i>`:''}${r.tie?'<i class="tie">EX AEQUO</i>':''}<span>✓ ${s.correct}</span><span>✗ ${s.wrong}</span><span>Ø ${s.omitted}</span></small></div><div class="finalScore"><strong>${r.score}</strong><span>PUNTI</span></div>${r.rank===1?'<i class="finalShine" aria-hidden="true"></i>':''}</div>`};
 let body;
 if(!many)body=`<main class="finalList" style="grid-template-rows:${rows.map(r=>`minmax(0,${r.rank===1?1.45:r.rank<=3?1.2:1}fr)`).join(' ')}">${rows.map(card).join('')}</main>`;
 else{const rest=rows.slice(3),cols=rest.length>14?3:2;body=`<main class="finalMany"><div class="finalPodium">${[1,0,2].map(i=>card(rows[i],i)).join('')}</div><div class="finalRest" style="--cols:${cols};--rows:${Math.ceil(rest.length/cols)}">${rest.map((r,j)=>card(r,j+3)).join('')}</div></main>`}
 return `<div class="finalScene${many?' many':''}${size}${final?' isFinal':''}${final&&complete?' complete':''}">${header}${body}</div>`;
}
function clearPending(){state.pending={};state.pendingOrder=[];state.correctOrder=[];state.pendingHistory=[];state.entryMeta={};state.entrySeq=0}
function showRules(){stopTimer();stageDocs().forEach(d=>d.getElementById('transition')?.classList.remove('active'));state.screen='rules';state.arcade=null;state.round=null;arcadeEpoch++;renderAll()}
function rulesHTML(){
 const p=SC.getProfile(profileId()),c=p.correct,flat=c.mode==='flat',speed=c.mode==='speed';
 const tablets=Object.keys(NET.boundTeamIds()).length>0;
 /* RC2-A.2: col profilo a velocità la regola si dice com'è (200–300 in base alla velocità; senza tablet 300, 290, 280…), niente elenco di 200 uguali. */
 const corr=flat?String(c.points):speed?`${c.base}–${c.max}`:[1,2,3].map(i=>SC.rankPoints(p,i)).join(' · ')+'…',corrSmall=flat?'Ogni risposta esatta vale lo stesso, indipendentemente dal tempo.':speed?(tablets?'In base alla velocità: subito 300, allo scadere del tempo 200.':'Senza tablet: 300, 290, 280… nell’ordine in cui il docente registra le corrette (minimo 200).'):`Con 6 corrette: ${[1,2,3,4,5,6].map(i=>SC.rankPoints(p,i)).join(', ')}.`;
 return `<div class="rulesScene"><header class="showHeader"><div><span class="showEyebrow">PRIMA DI COMINCIARE</span><h1>COME SI GIOCA</h1></div><img src="${BRAND_LOGO}" alt="Il Secchione"></header><div class="rulesContent"><div><h2>Il tempo scorre. Poi la soluzione.</h2><p>${tablets?'Ogni squadra sceglie la risposta sulla propria pulsantiera e preme INVIA: la scelta diventa definitiva.':'Il docente registra le risposte delle squadre. Conta l’ordine delle risposte corrette.'}</p><div class="ruleBand good"><b>RISPOSTA ESATTA</b><span>${corr}<small>${corrSmall}</small></span></div><div class="ruleBand bad"><b>RISPOSTA ERRATA</b><span>${SC.signed(p.wrong)}<small>${p.wrong?'Penalità fissa.':'Nessuna penalità.'}</small></span></div><div class="ruleBand neutral"><b>NESSUNA RISPOSTA</b><span>3 GRATIS<small>Dalla 4ª astensione viene applicato il punteggio della risposta errata (${SC.signed(p.wrong)}).</small></span></div><p class="ruleNote">${speed?`La soluzione appare alla fine del timer. ${esc(gameName('ghigliottina'))}: ogni scelta corretta +10 pt, risposta finale 200–300 pt. ${esc(gameName('chain'))}: ogni parola corretta 50–100 pt, errata o nessuna risposta 0.`:`La soluzione appare alla fine del timer. Stessa regola in tutti i giochi, senza bonus aggiuntivi.${flat?'':' Minimo per una risposta corretta: 0 punti.'}`}</p></div><aside>${mascotMarkup()}</aside></div></div>`;
}
function restoreCompletedRound(){const saved=state.completedRounds[q()?.id];if(saved){state.qRound=C.clone(saved.round);state.pending=C.clone(saved.pending);state.pendingOrder=[...saved.pendingOrder];state.correctOrder=[...(saved.correctOrder||[])];state.entryMeta=C.clone(saved.entryMeta||{});state.questionScored=true;state.phase='scored';state.answerVisible=true;state.round=null}}

/* ---------------- IMPOSTAZIONI PARTITA ---------------- */
function openSettings(){const s=state.session,dlg=$('#settingsDialog');$('#setProfile').innerHTML=SC.listProfiles().map(p=>`<label class="radioCard"><input type="radio" name="profile" value="${p.id}" ${p.id===profileId()?'checked':''}><span><b>${esc(p.label)}</b><small>${esc(p.description)}</small></span></label>`).join('');$('#setMode').value=s.meta.mode;$('#setClass').value=s.meta.classLabel||'';$('#setYear').value=s.meta.schoolYear||'';$('#setGrade').value=s.meta.gradeLevel||'';$('#setInstitution').value=s.meta.institution||'';$('#setPackNow').textContent=state.mixed?activeRuntimes().map(r=>r.title).join(' + '):pack().title;$('#setRecompute').checked=false;$('#setRecomputeRow').hidden=!state.session.scoreEvents.length;dlg.showModal()}
function saveSettings(ev){ev.preventDefault();const s=state.session,prof=(document.querySelector('input[name="profile"]:checked')||{}).value;const prevProfile=s.scoringProfile;s.meta.mode=SS.MODES.includes($('#setMode').value)?$('#setMode').value:'lesson';s.meta.classLabel=SS.cleanText($('#setClass').value,40);s.meta.schoolYear=SS.cleanText($('#setYear').value,9)||SS.schoolYearFor();s.meta.gradeLevel=$('#setGrade').value?Number($('#setGrade').value)||null:null;s.meta.institution=SS.cleanText($('#setInstitution').value,120);
 if(SC.hasProfile(prof)&&prof!==prevProfile){s.scoringProfile=prof;prefs.scoringProfile=prof;logEvent({event:'profile.change',reason:`${prevProfile} → ${prof}`});if($('#setRecompute').checked)recomputeAllRounds(prof)}
 $('#settingsDialog').close();savePrefs();recomputeScores();renderAll();autosave('settings',0);toast('Impostazioni salvate.')}
function recomputeAllRounds(prof){const s=state.session,byRound={},prior={};s.responses.forEach(r=>{if(!r.voided)(byRound[r.roundInstanceId]=byRound[r.roundInstanceId]||[]).push(r)});s.scoreEvents=[];s.rounds.forEach(rd=>{const rows=byRound[rd.roundInstanceId];if(!rd.committed||!rows)return;s.scoreEvents.push(...SS.scoreEventsFor(rows,prof,rd.roundInstanceId,Object.assign({priorOmissions:prior,freeOmissions:FREE_OMISSIONS},rd.availableMs>0?{availableMs:rd.availableMs}:{},rd.scale?{scale:rd.scale}:{})));rd.profileId=prof;if(rd.scale&&!SC.countsOmissions(rd.scale,prof))return;rows.forEach(r=>{if(SC.normalizeOutcome(r.outcome)==='omitted')prior[r.participantId]=(prior[r.participantId]||0)+1});rd.profileId=prof});SS.renumberOmissions(s,FREE_OMISSIONS);logEvent({event:'score.recompute',reason:prof})}
function startNewGame(){if(!confirm('Iniziare una nuova partita? Punti e risposte attuali vengono archiviati; le squadre restano.'))return;STORE.archiveSnapshot(buildSnapshot('new.game'));logEvent({event:'session.close'});newSession(true);state.completedRounds={};state.planRun=null;state.round=null;recomputeScores();showHome();toast('Nuova partita pronta.')}

/* ---------------- TASTIERA ---------------- */
function gridKey(e){
 if(state.screen!=='question'||!canEnter())return false;
 const k=e.key,lk=k.toLowerCase(),teams=state.teams;if(!teams.length)return false;
 const current=teams[Math.min(state.cursor,teams.length-1)];
 const nextEmpty=()=>{for(let s=1;s<=teams.length;s++){const i=(state.cursor+s)%teams.length;if(!(teams[i].id in state.pending)){state.cursor=i;return}}state.cursor=(state.cursor+1)%teams.length};
 if(['a','b','c','d'].includes(lk)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){setPending(current.id,k.toUpperCase(),{inputMode:'manual'});nextEmpty();renderAnswerPanel();renderScorePanel();return true}
 if((k==='0'||lk==='o'||k==='ø'||k==='Ø')&&!e.ctrlKey){setPending(current.id,'abstain',{inputMode:'manual'});nextEmpty();renderAnswerPanel();renderScorePanel();return true}
 if(k==='ArrowDown'){state.cursor=(state.cursor+1)%teams.length;renderAnswerPanel();renderScorePanel();return true}
 if(k==='ArrowUp'){state.cursor=(state.cursor-1+teams.length)%teams.length;renderAnswerPanel();renderScorePanel();return true}
 if(k==='Backspace'||k==='Delete'){clearEntry(current.id);return true}
 if((e.ctrlKey||e.metaKey)&&lk==='z'){undoPending();return true}
 if(k==='Enter'){if(state.phase==='running'){finishQuestion();return true}if(teams.every(t=>t.id in state.pending))commitQuestionScores();else{nextEmpty();renderAnswerPanel();renderScorePanel();toast('Mancano ancora delle squadre: A B C D oppure 0 = omessa.')}return true}
 return false;
}

/* ---------------- EVENTI ---------------- */
function bindStatic(){
 document.addEventListener('pointerdown',unlockAudio,{once:true,capture:true});
 $$('.tabBtn').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
 $('#audioBtn').onclick=()=>{state.sound=!state.sound;$('#audioBtn').textContent=state.sound?'🔊':'🔇';savePrefs();if(state.sound)cloneAudio('click');else stopBed()};$('#audioTestBtn').onclick=()=>{state.sound=true;$('#audioBtn').textContent='🔊';cloneAudio('question',.82);playBed('timerBed');setTimeout(()=>cloneAudio('tick',.7),900);setTimeout(()=>cloneAudio('urgent',.9),1800);setTimeout(()=>{stopBed();cloneAudio('correct',.84)},2600)};$('#volumeRange').oninput=e=>{state.volume=Number(e.target.value);savePrefs()};
 $('#publicBtn').onclick=openPublic;$('#stageOnlyBtn').onclick=()=>document.body.classList.toggle('stageOnly');
 $('#startQuizBtn').onclick=startQuiz;$('#homeBtn').onclick=showHome;$('#prevBtn').onclick=prevQuestion;$('#nextBtn').onclick=nextQuestion;$('#cockpit').addEventListener('click',onCockpitClick);$('#importContentBtn').onclick=()=>openImportDialog();$('#importBody').addEventListener('click',onImportClick);$('#importBody').addEventListener('change',e=>{if(e.target.dataset.imp==='file'&&e.target.files?.[0]){const f=e.target.files[0];e.target.value='';importContent(f)}});$('#importClose').onclick=()=>$('#importDialog').close();$('#planBtn').onclick=()=>openPlanner();['#bankSearch','#bankTopic','#bankDifficulty'].forEach(s=>{const e=$(s);if(e){e.oninput=renderBank;e.onchange=renderBank}});
 $('#addTeamBtn').onclick=()=>{addTeam($('#teamName').value);$('#teamName').value=''};$('#teamName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#addTeamBtn').click()}};$('#sampleTeamsBtn').onclick=()=>{if(state.screen!=='home'&&state.screen!=='rules')return toast('Torna alla Home per modificare le squadre.');if(state.teams.length&&!confirm('Sostituire le squadre e iniziare una nuova partita?'))return;if(state.session.responses.length)STORE.archiveSnapshot(buildSnapshot('sample.teams'));newSession(true);state.completedRounds={};state.planRun=null;clearPending();state.teams=['Blu','Rossi','Verdi','Gialli'].map(name=>Object.assign(SS.makeParticipant(name,'team'),{score:0}));syncNetParticipants();showHome()};
 $('#undoScoreBtn').onclick=undoPending;$('#fillAbstainBtn').onclick=fillMissingAbstain;$('#commitScoreBtn').onclick=commitScores;$('#fillAnswersBtn').onclick=fillMissingAbstain;$('#commitAnswersBtn').onclick=commitScores;
 $('#newQuestionBtn').onclick=()=>openQuestionDialog();$('#fsRegiaBtn').onclick=toggleRegiaFullscreen;document.addEventListener('fullscreenchange',renderRegiaFullscreen);if(window.SecchioneStageFit)window.SecchioneStageFit.watch(window);$('#questionForm').onsubmit=saveQuestionFromDialog;$('#shuffleQuestionsBtn').onclick=shuffleQuestions;$('#exportBankBtn').onclick=exportBank;$('#importBankInput').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f)importContent(f)};$('#openPacksBtn2').onclick=()=>PKG&&PKG.open();$('#packsBtn').onclick=()=>PKG&&PKG.open();$('#resetBankBtn').onclick=resetBank;$('#showLeaderboardBtn').onclick=showLeaderboard;
 $('#exportJsonBtn').onclick=exportJSON;$('#exportCsvBtn').onclick=exportCSV;$('#exportReportBtn').onclick=exportReport;$('#exportLogBtn').onclick=exportLog;
 $('#settingsBtn').onclick=openSettings;$('#settingsForm').onsubmit=saveSettings;$('#settingsCancel').onclick=()=>$('#settingsDialog').close();
 $('#devicesBtn').onclick=()=>DEV&&DEV.open();
 document.addEventListener('click',e=>{
   const rt=e.target.closest('[data-remove-team]');if(rt)return removeTeam(rt.dataset.removeTeam);
   const ag=e.target.closest('[data-ag]');if(ag){const [id,v]=ag.dataset.ag.split('|');const i=state.teams.findIndex(t=>t.id===id);if(i>=0)state.cursor=i;if(state.pending[id]===v&&(state.entryMeta[id]||{}).inputMode==='manual')clearEntry(id);else setPending(id,v,{inputMode:'manual'});ag.blur();return}
   const pick=e.target.closest('[data-ag-pick]');if(pick){state.cursor=Number(pick.dataset.agPick)||0;renderAnswerPanel();renderScorePanel();pick.blur();return}
   const un=e.target.closest('[data-ag-unlock]');if(un){unlockTeam(un.dataset.agUnlock);return}
   const gp=e.target.closest('[data-ghpick]');if(gp){const [id,v]=gp.dataset.ghpick.split('|');ghPick(id,v);gp.blur();return}
   const as=e.target.closest('[data-ascore]');if(as){const [id,v]=as.dataset.ascore.split('|'),prev=state.entryMeta[id]||{};const meta=prev.inputMode==='tablet'?{inputMode:'tablet',responseTimeMs:prev.responseTimeMs,receivedAt:prev.receivedAt,deviceId:prev.deviceId,responseId:prev.responseId,serverSeq:prev.serverSeq,selectedAnswer:prev.selectedAnswer,correctAnswer:prev.correctAnswer}:{inputMode:'manual'};setPending(id,v,meta);return}
   if(e.target.id==='openStudioGamesBtn'){if(PKG&&PKG.openStudio)PKG.openStudio('');return}
   if(e.target.id==='quickScoreBtn')return tab('score');const gb=e.target.closest('[data-game]');if(gb)return startArcade(gb.dataset.game);
   const ed=e.target.closest('[data-edit-q]');if(ed)return openQuestionDialog(Number(ed.dataset.editQ));
   const gq=e.target.closest('[data-go-q]');if(gq){if(!leaveQuestionGuard())return;goQuestion(Number(gq.dataset.goQ));return}
   const dq=e.target.closest('[data-del-q]');if(dq){if(mixedGuard())return;const i=Number(dq.dataset.delQ);if(confirm('Eliminare la domanda?')){if(state.bank.length<=1)return toast('Conserva almeno una domanda.');state.bank.splice(i,1);persistBank();renderAll()}return}
   const pd=e.target.closest('[data-preset-delta]');if(pd){loadArcadePreset(state.arcade.presetIndex+Number(pd.dataset.presetDelta));return}
 });
 document.addEventListener('change',e=>{if(e.target.id==='presetSelect')loadArcadePreset(Number(e.target.value));if(e.target.id==='photoAnswer'&&state.arcade)state.arcade.answer=e.target.value;if(e.target.id==='photoUploadInput'&&e.target.files?.[0]){const r=new FileReader();r.onload=()=>{state.arcade.image=r.result;state.arcade.focus='';state.arcade.revealed=0;state.arcade.revealOrder=C.shuffle([...Array(30).keys()]);state.arcade.edges=C.makePuzzleEdges(6,5);renderAll();toast('Immagine caricata.')};r.readAsDataURL(e.target.files[0])}const mu=e.target.closest?.('[data-match-upload]');if(mu&&mu.files?.[0]&&state.arcade?.type==='abbinamenti'){const i=Number(mu.dataset.matchUpload),r=new FileReader();r.onload=()=>{state.arcade.cards[i].img=r.result;renderAll();toast(`Immagine ${i+1} caricata.`)};r.readAsDataURL(mu.files[0])}});
 document.addEventListener('click',e=>{
   const id=e.target.id;if(id==='newPuzzleBtn'){loadArcadePreset(state.arcade.presetIndex)}else if(id==='applyMatchBtn')applyMatchEditor();else if(id==='reshuffleMatchBtn'){loadArcadePreset(state.arcade.presetIndex)}else if(id==='resetGhBtn'){loadArcadePreset(state.arcade.presetIndex)}else if(id==='fillGameAbstainBtn')fillMissingAbstain();else if(id==='commitGameInlineBtn')commitArcadeScores()
 });
 document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]'))return;
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(e.key==='F8'){e.preventDefault();document.body.classList.toggle('stageOnly');return}
  if(gridKey(e)){e.preventDefault();return}
  if(e.code==='Space'&&document.activeElement?.tagName!=='BUTTON'){e.preventDefault();if(state.screen==='question'&&state.phase==='preview')startQuestion();else if(state.screen==='question'&&state.phase==='running')finishQuestion();else if(state.screen==='arcade'&&state.arcade&&!state.arcade.played&&!state.arcade.started)cockpitAction('gameStart');return}
  if(e.key==='ArrowRight'){e.preventDefault();nextQuestion()}else if(e.key==='ArrowLeft'){e.preventDefault();prevQuestion()}else if(e.key==='p'||e.key==='P'){togglePause()}else if(e.key==='+'){addSeconds(10)}else if(e.key==='r'||e.key==='R'){if(state.screen==='question')revealQuestion()}else if(e.key==='t'||e.key==='T'){curtainToggle()}
 });
 $('#rulesBtn').onclick=showRules;
 $('#motionBtn').onclick=()=>{state.motion=!state.motion;$('#motionBtn').textContent=state.motion?'Mascotte: animata':'Mascotte: ferma';savePrefs();animateMascots()};
 $('#saveSessionBtn').onclick=()=>{tab('results');toast('Scegli il formato di esportazione nella scheda CLASSIFICA.')};
 $('#newSessionBtn').onclick=startNewGame;
 window.addEventListener('pagehide',()=>saveNow('unload'));
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveNow('hidden')});
 setInterval(()=>{if(state.timer.running)saveNow('tick')},5000);
}

/* ---------------- RETE (pulsantiere) ---------------- */
function bindNet(){
 NET.on('status',()=>{renderNetStatus();renderTeams();renderAnswerPanel();if(DEV)DEV.render()});
 NET.on('room',room=>{renderNetStatus();syncNetParticipants();reconcileRound(room);renderTeams();renderAnswerPanel();if(DEV)DEV.render()});
 NET.on('devices',()=>{renderNetStatus();renderTeams();renderAnswerPanel();if(DEV)DEV.render()});
 NET.on('response',applyTabletResponse);
 NET.on('response.voided',voidTabletResponse);
 NET.on('committed',serverCommitted);
 NET.on('error',m=>{if(m&&m.code==='replaced'){const e=$('#connStatus');if(e)e.textContent='REGIA APERTA ALTROVE';toast('La regia è stata aperta in un’altra finestra: questa non comanda più i tablet. Chiudila.')}});
 NET.on('rejected',m=>logEvent({event:'response.rejected',roundInstanceId:m.roundInstanceId,participantId:m.participantId,deviceId:m.deviceId,answer:m.answer,accepted:false,reason:m.reason,source:'server'}));
}
/* Dopo una riconnessione o un riavvio della regia, riallinea il round con il server. */
function reconcileRound(room){
 const sr=room&&room.round,lr=state.round;
 if(lr&&state.screen==='question'&&!state.questionScored&&sr&&sr.roundInstanceId===lr.roundInstanceId){
  (sr.responses||[]).forEach(rec=>{const m=state.entryMeta[rec.participantId];if(!m||m.auto)applyTabletResponse(rec)});
  if(state.phase!=='running'){if(sr.status!=='closed')NET.closeRound(lr.roundInstanceId)}
  else if(state.timer.running){if(sr.status!=='open')NET.resumeRound(lr.roundInstanceId,Math.round(state.timer.remaining*1000))}
  else if(sr.status==='open')NET.pauseRound(lr.roundInstanceId);
  return;
 }
 if(lr&&state.screen==='arcade'&&state.arcade&&sr&&sr.roundInstanceId===lr.roundInstanceId){
  (sr.responses||[]).forEach(rec=>{const m=state.entryMeta[rec.participantId];if(!m||m.auto)applyTabletResponse(rec)});
  if(!state.arcade.started){if(sr.status!=='closed')NET.closeRound(lr.roundInstanceId)}
  else if(state.timer.running){if(sr.status!=='open')NET.resumeRound(lr.roundInstanceId,Math.round(state.timer.remaining*1000))}
  else if(sr.status==='open')NET.pauseRound(lr.roundInstanceId);
  return;
 }
 if(lr&&state.screen==='question'&&state.phase==='running'&&(!sr||sr.roundInstanceId!==lr.roundInstanceId)){NET.openRound({roundInstanceId:lr.roundInstanceId,questionId:q().id,number:qNumber().n,total:qNumber().total,layout:'mcq',letters:state.qRound.displayed.map(o=>o.letter),correct:state.qRound.correctDisplayLetter,durationMs:Math.round(state.timer.remaining*1000),availableMs:lr.availableMs||Math.round(state.timer.duration*1000),paused:!state.timer.running});return}
 if(sr&&sr.status!=='closed'&&(!lr||sr.roundInstanceId!==lr.roundInstanceId))NET.closeRound(sr.roundInstanceId);
}

/* ---------------- EDITOR GIOCHI (v3) ---------------- */
let editingGame=null;
function gameLines(text){return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
function validateGame(type,raw){if(!EDITABLE_GAMES.includes(type))throw Error('Tipo di gioco non valido.');return PE.validateGame(type,raw)}
function persistGames(){customGames[state.packKey]=Object.fromEntries(EDITABLE_GAMES.map(k=>[k,C.clone(pack().arcadeSets[k])]));savePrefs()}
function openGameEditor(mode='new'){
 const a=state.arcade;if(!a||!EDITABLE_GAMES.includes(a.type))return;
 const wasRunning=state.timer.running;if(wasRunning)pauseTimerCore();
 const raw=mode==='new'?{}:C.clone(pack().arcadeSets[a.type][a.presetIndex]);
 editingGame={type:a.type,index:mode==='edit'?a.presetIndex:null,wasRunning,round:a,reference:raw};
 $('#gameEditorTitle').textContent=(mode==='edit'?'Modifica completa · ':'Nuovo da zero · ')+gameName(a.type);
 $('#geLabel').value=raw.label?raw.label+(mode==='copy'?' (copia)':''):'';$('#geTheme').value=raw.theme||raw.label||'';$('#geSeconds').value=raw.seconds==null||raw.seconds===''?'':raw.seconds;$('#geSeconds').placeholder=`standard: ${TM.defaultSeconds(a.type)} s`;
 $('#geSubject').value=raw.subject||'';$('#geCandidates').value=(raw.candidates||[]).join('\n');$('#geClues').value=(raw.clues||[]).join('\n');$('#geAnswer').value=raw.answer||'';$('#gePairs').value=(raw.pairs||[]).map(p=>p.join(' | ')).join('\n');$('#geLinks').value=(raw.links||[]).map(p=>p.from+' | '+p.to).join('\n');
 $('#geIndovina').hidden=a.type!=='indovina';$('#geGh').hidden=a.type!=='ghigliottina';$('#geChain').hidden=a.type!=='chain';$('#gameEditorError').textContent='';$('#gameEditorDialog').showModal();$('#geLabel').focus();
}
function saveGameEditor(e){e.preventDefault();if(!editingGame)return;try{
 const {type,index}=editingGame;const raw={label:$('#geLabel').value,theme:$('#geTheme').value,seconds:Number($('#geSeconds').value)||undefined};
 if(type==='chain')raw.links=C.parseChain($('#geLinks').value);
 if(type==='indovina')Object.assign(raw,{subject:$('#geSubject').value,candidates:gameLines($('#geCandidates').value),clues:gameLines($('#geClues').value)});
 if(type==='ghigliottina')Object.assign(raw,{answer:$('#geAnswer').value,pairs:gameLines($('#gePairs').value).map(line=>line.split('|').map(v=>v.trim()))});
 preserveAnswerVariants(type,raw,editingGame.reference);
 const x=validateGame(type,raw),sets=pack().arcadeSets[type];const at=index==null?sets.length:index;if(at>=200)throw Error('Archivio pieno: massimo 200 manche per gioco.');sets[at]=x;persistGames();$('#gameEditorDialog').close();editingGame=null;state.screen='arcade';state.arcade={type,presetIndex:at};loadArcadePreset(at,false);tab('games');toast('Manche salvata e pronta. Esporta i giochi per conservarne una copia.');
 }catch(error){$('#gameEditorError').textContent=error.message}}
function exportGames(){const data={format:'secchione-games',version:3,pack:state.packKey,games:Object.fromEntries(PE.GAME_TYPES.map(k=>[k,pack().arcadeSets[k]||[]]))};download(`giochi_${state.packKey}.json`,JSON.stringify(data,null,2),'application/json')}
function bindGameEditor(){$('#gameEditorDialog').addEventListener('close',()=>{if(editingGame?.wasRunning&&state.arcade===editingGame.round&&!state.timer.running&&state.timer.remaining>0)startTimer(currentBed());editingGame=null});document.addEventListener('click',e=>{const b=e.target.closest('[data-edit-game]');if(b)openGameEditor(b.dataset.editGame)});$('#gameEditorForm').onsubmit=saveGameEditor;$('#closeGameEditor').onclick=$('#cancelGameEditor').onclick=()=>$('#gameEditorDialog').close();$('#exportGamesBtn').onclick=exportGames;$('#importGamesInput').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f)importContent(f)}}
/* Migrazione silenziosa delle personalizzazioni v3 (stessa origine file://). */
function migrateV3Prefs(){if(prefs.version===35||prefs.migratedFromV3)return;let n=0;Object.values(P).forEach(pk=>{if(!pk.v3Key)return;const v3=STORE.loadV3Prefs(pk.v3Key);if(!v3)return;if(v3.banks&&Array.isArray(v3.banks[pk.v3Key])&&!bankOverrides[pk.id]){const r=PE.importV3Questions(v3.banks[pk.v3Key],pk,()=>SS.uuid());if(!r.errors.length&&r.questions.length){bankOverrides[pk.id]=r.questions;n++}}if(v3.games&&!customGames[pk.id]){const r=PE.importV3Games({games:v3.games},pk);if(!r.errors.length){const g=Object.fromEntries(EDITABLE_GAMES.map(k=>[k,r.games[k]||[]]).filter(([,v])=>v.length));if(Object.keys(g).length){customGames[pk.id]=g;n++}}}});prefs.migratedFromV3=true;savePrefs();if(n)setTimeout(()=>toast('Importate le domande e i giochi personalizzati della v3.'),800)}

window.__secchioneDebug={state,showGameResults,gameEnter,curtainOn,curtainOff,ghPick,gameResultRows,startQuiz,goQuestion,startQuestion,finishQuestion,revealQuestion,togglePause,addSeconds,showHome,showLeaderboard,startArcade,loadArcadePreset,startPhoto,startIndovina,startMatching,startGh,chooseGh,startChain,chainNext,setPending,clearEntry,commitScores,commitQuestionScores,reopenScores,undoPending,fillMissingAbstain,applyTabletResponse,buildSnapshot,restoreSnapshot,saveNow,timerEnded,profileId,activatePacks,setActivePacks,refreshLibrary,imagePath,validateGame,renderAll,gridKey,previewPoints,addTeam};
async function init(){
 await refreshLibrary();
 if(legacyImported.length)await migrateLegacyImported();
 if(!Object.keys(P).length){document.body.innerHTML='<p style="padding:40px;font:18px system-ui;color:#fff">Nessun pack di contenuti trovato. Esegui <b>node tools/build_packs.js</b> oppure ripristina la cartella <b>packs/</b>.</p>';return}
 migrateV3Prefs();
 const wanted=(Array.isArray(prefs.activePacks)&&prefs.activePacks.length?prefs.activePacks:[prefs.packKey]).filter(id=>P[id]);
 setActivePacks(wanted.length?wanted:[Object.keys(P)[0]],{shuffle:!!prefs.mixShuffle});newSession(false);
 $('#audioBtn').textContent=state.sound?'🔊':'🔇';$('#volumeRange').value=state.volume;$('#motionBtn').textContent=state.motion?'Mascotte: animata':'Mascotte: ferma';
 bindStatic();bindGameEditor();bindNet();if(DEV)DEV.init({getTeams:()=>state.teams,toast,esc,onChange:()=>{renderTeams();renderAnswerPanel();renderNetStatus()}});
 if(PKG)PKG.init({importContent:f=>importContent(f),client:PKC,esc,toast,download,getActive:()=>state.activePacks.slice(),getShuffle:()=>state.mixShuffle,setShuffle:v=>{state.mixShuffle=!!v;savePrefs()},activate:(ids,o)=>activatePacks(ids,o),onLibraryChanged:()=>refreshLibrary().then(()=>renderAll()),dropOverrides:id=>{/* Pack Studio ha salvato: il pacchetto installato torna l'unica fonte (via le copie dell'archivio/editor di questo browser) */let ch=false;if(bankOverrides[id]){delete bankOverrides[id];ch=true}if(customGames[id]){delete customGames[id];ch=true}if(ch)savePrefs();return ch}});
 $('#setPacksBtn').onclick=()=>{$('#settingsDialog').close();PKG&&PKG.open()};
 if(PLAN_UI)PLAN_UI.init({esc,toast,download,catalogParts,getActivePacks:()=>state.activePacks.slice(),getPlans:()=>savedPlans,savePlans:list=>{savedPlans=list;savePrefs();renderCockpit()},startPlan,runningPlanId:()=>planLive()?state.planRun.planId:null});
 /* scalette: la copia sul server (data/prefs.json) ripristina quelle che il browser non ha più (pulizia dati, porta diversa) */
 if(STORE.loadServerPrefs)STORE.loadServerPrefs().then(p=>{if(!p||!Array.isArray(p.plans)||!p.plans.length)return;const m=SP.mergeLists(savedPlans,p.plans);if(m.some(x=>{const o=savedPlans.find(y=>y.id===x.id);return !o||o.updatedAt!==x.updatedAt})){savedPlans=m;savePrefs();renderCockpit()}});
 renderAll();checkResume();
}
init();
})();
