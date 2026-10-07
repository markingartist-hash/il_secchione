/* Solo sviluppo: npm --prefix tests/e2e install; runtime dell'app senza dipendenze. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'secchione-e2e-'));
const copy = path.join(scratch, 'app');
const artifacts = path.resolve(process.env.E2E_ARTIFACTS || path.join(scratch, 'artifacts'));
fs.mkdirSync(artifacts, { recursive:true });
fs.cpSync(ROOT, copy, { recursive:true, filter:p => !['runtime','data','QA','node_modules'].some(n=>path.relative(ROOT,p).split(path.sep).includes(n)) });
const srv = require(path.join(copy,'server/server.js'));
let app, browser, host, show;
const errors = [], external = [], checks = [], frames = [];
function pass(name) { checks.push(name); console.log('PASS ' + name); }
async function context(viewport) {
  const ctx = await browser.newContext({viewport:viewport||{width:1440,height:1000},serviceWorkers:'block'});
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.protocol==='file:' || u.hostname==='127.0.0.1' || u.hostname==='localhost') return route.continue();
    external.push(u.href); return route.abort();
  });
  ctx.on('page',p => { p.on('pageerror',e=>errors.push(e.message)); p.setDefaultTimeout(12000); });
  return ctx;
}
async function until(fn, arg, timeout=12000) { await host.waitForFunction(fn,arg,{timeout}); }
async function snapshot() { return host.evaluate(()=>window.__secchioneDebug.buildSnapshot('e2e-read')); }
async function mcq(players, roundNumber, naturalTimer) {
  await host.locator('[data-tab="session"]').click();
  await host.locator('#launchQuestionBtn').click();
  const correct = (await host.locator('#privateAnswer b').textContent()).trim();
  const selected = [];
  for (let i=0;i<players.length;i++) {
    const p=players[i], answer=roundNumber===1 && i===0?'C':correct;
    await p.locator('[data-pick="'+answer+'"]').click();
    assert.equal(await p.locator('[data-pick="'+answer+'"]').getAttribute('aria-pressed'),'true');
    await p.locator('#sendBtn').click();
    await p.getByRole('heading',{name:'RISPOSTA REGISTRATA'}).waitFor();
    selected.push(answer);
    await until(n=>Object.keys(window.__secchioneDebug.state.pending).length===n,i+1);
  }
  if (naturalTimer) {
    await show.locator('.option.correct').waitFor({timeout:35000});
  } else await host.locator('#revealBtn').click();
  await until(()=>window.__secchioneDebug.state.questionScored);
  await show.locator('.answerExplanation').waitFor();
  const snap=await snapshot(), rd=snap.session.rounds.filter(r=>r.kind==='question').at(-1);
  const events=snap.session.scoreEvents.filter(e=>e.roundInstanceId===rd.roundInstanceId);
  let rank=0;
  const expected=selected.map(a=>a===correct?300-25*rank++:-100);
  assert.deepEqual(events.map(e=>e.points),expected);
  assert.equal(snap.session.responses.filter(r=>r.roundInstanceId===rd.roundInstanceId).length,6);
  pass('MCQ '+roundNumber+': 6 browser, selezione/INVIA/ricezione/reveal/punti; '+(naturalTimer?'timer reale 30 s':'seconda domanda'));
}
async function typeVirtual(p, word) {
  await p.locator('[data-char="A"]').waitFor();
  for (const ch of word.toUpperCase()) {
    if(ch===' ') await p.locator('[data-text-action="space"]').click();
    else await p.locator('[data-char]').filter({hasText:new RegExp('^'+ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).click();
  }
}

(async()=>{
  app=srv.createServer({quiet:true,dataDir:path.join(scratch,'data')});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.port;
  browser=await chromium.launch({channel:process.env.E2E_CHANNEL||'chrome',headless:true});
  host=await (await context()).newPage();
  await host.goto(base+'/host');
  await until(()=>window.SecchioneNet && window.SecchioneNet.isConnected());
  // Impostazione ordinaria della regia, nessun comando di gioco via API.
  await host.locator('#audioBtn').click();
  await host.locator('#motionBtn').click();
  for(let i=1;i<=6;i++) { await host.locator('#teamName').fill('Squadra '+i); await host.locator('#addTeamBtn').click(); }
  assert.equal(await host.locator('#teamCount').textContent(),'6');
  await host.locator('#devicesBtn').click();
  const pin=(await host.locator('.devPin b').textContent()).trim();
  const players=[];
  for(let i=1;i<=6;i++) {
    const p=await (await context(i===1?{width:390,height:844}:{width:768,height:1024})).newPage();
    p.on('websocket',ws=>ws.on('framereceived',f=>{try{frames.push(JSON.parse(f.payload.toString()));}catch{}}));
    await p.goto(base+'/player');
    await p.locator('#pinInput').fill(pin); await p.locator('#joinBtn').click();
    await p.getByRole('button',{name:'Squadra '+i,exact:true}).click();
    await host.locator('[data-dev-approve]').first().click();
    await p.locator('.team').filter({hasText:'Squadra '+i}).waitFor();
    players.push(p);
  }
  await host.locator('#devicesClose').click();
  show=await (await context({width:1280,height:720})).newPage(); await show.goto(base+'/show');
  await show.locator('.showHome').waitFor();
  pass('HOST: sei squadre; sei PLAYER con PIN, richiesta e approvazione reale; SHOW collegato');
  await host.locator('#startQuizBtn').click();
  await mcq(players,1,true);
  await show.screenshot({path:path.join(artifacts,'show-mcq.png')});
  await host.locator('#nextQBtn').click();
  await mcq(players,2,false);
  // Refresh reale della pulsantiera: conserva identità e ricevuta.
  await players[0].reload();
  await players[0].getByRole('heading',{name:'CORRETTA',exact:true}).waitFor();
  pass('Refresh PLAYER: stessa squadra e ricevuta conservate');
  // Due manche Indovina consecutive, con tastiera virtuale.
  await host.locator('[data-tab="games"]').click();
  await host.locator('#gameButtons [data-game="indovina"]').click();
  for(let n=1;n<=2;n++) {
    await host.locator('#startIndovinaBtn').click();
    const solution=await host.evaluate(()=>window.__secchioneDebug.state.arcade.subject);
    await typeVirtual(players[0],solution);
    await players[0].screenshot({path:path.join(artifacts,'player-indovina-'+n+'.png')});
    await players[0].locator('#sendBtn').click();
    await players[0].getByRole('heading',{name:'RISPOSTA REGISTRATA'}).waitFor();
    await until(()=>Object.keys(window.__secchioneDebug.state.pending).length===1);
    await host.locator('#revealIndovinaBtn').click();
    await show.locator('.candidate.answer').waitFor();
    await host.locator('#openGameScoreBtn').click();
    await host.locator('#commitScoreBtn').click();
    await until(()=>window.__secchioneDebug.state.arcade.scoreCommitted);
    assert.equal((await snapshot()).session.rounds.filter(r=>r.gameType==='indovina').length,n);
    pass('Indovina '+n+': tastiera virtuale, INVIA, soluzione SHOW e commit');
    await host.locator('[data-tab="games"]').click();
    if(n===1) await host.locator('[data-preset-delta="1"]').click();
  }
  // Gestore Pacchetti tra manche: import/attivazione non altera i punteggi.
  const before=(await snapshot()).session.scoreEvents;
  await host.locator('#homeBtn').click();
  await host.locator('#packsBtn').click();
  await host.locator('[data-pk-act="activate"][data-id="arte_romana"]').waitFor();
  await host.locator('#pkFile').setInputFiles(path.join(ROOT,'PACK_ESEMPI/inglese_base.zip'));
  await host.locator('[data-pk-act="activate"][data-id="inglese_base"]').first().waitFor();
  await host.locator('[data-pk-act="activate"][data-id="inglese_base"]').first().click();
  await host.locator('#packsClose').click();
  assert.deepEqual((await snapshot()).session.scoreEvents,before);
  await host.locator('#startQuizBtn').click();
  await mcq(players,3,false);
  pass('Pack Manager: importazione inglese_base, attivazione, punteggi conservati e nuova domanda con INVIA');
  // Ripresa regia: operazione UI, controllo dati in sola lettura.
  const saved=await snapshot();
  await host.reload(); await host.locator('#resumeBtn').click();
  await until(()=>window.SecchioneNet.isConnected());
  const resumed=await snapshot();
  assert.equal(resumed.session.sessionId,saved.session.sessionId);
  assert.deepEqual(resumed.session.scoreEvents,saved.session.scoreEvents);
  pass('Refresh HOST e RIPRENDI: sessione e punteggi conservati');
  // Il browser fallback funziona senza rete e senza server.
  const offlineCtx=await context(); await offlineCtx.setOffline(true);
  const offline=await offlineCtx.newPage();
  await offline.goto(pathToFileURL(path.join(copy,'index.html')).href);
  await offline.locator('#sampleTeamsBtn').click();
  await offline.locator('#startQuizBtn').click();
  await offline.locator('#launchQuestionBtn').click();
  await offline.locator('#stage .option').first().waitFor();
  assert.equal(await offline.locator('#stage .option').count(),4);
  pass('Fallback file:// con browser offline: quattro squadre e avvio MCQ');
  for(const m of frames) {
    const text=JSON.stringify(m);
    assert.ok(!/"(correct|correctAnswer|explanation|question|options)"\s*:/.test(text),'contenuto riservato al PLAYER: '+text);
  }
  assert.ok(frames.some(m=>m.type==='round'&&m.round&&m.round.revealed));
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  pass('Nessun errore JavaScript, nessuna risorsa Internet, nessuna domanda/soluzione nei frame PLAYER anche dopo reveal');
  fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({ok:true,browser:browser.version(),channel:process.env.E2E_CHANNEL||'chrome',checks,errors,external,playerFrames:frames.length},null,2));
})().catch(async e=>{
  console.error(e.stack); process.exitCode=1;
  if(host) await host.screenshot({path:path.join(artifacts,'failure-host.png')}).catch(()=>{});
  fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({ok:false,checks,errors,external,error:e.stack},null,2));
}).finally(async()=>{
  if(browser) await browser.close();
  if(app) await new Promise(resolve=>app.close(resolve));
  // Rimuove esclusivamente la copia temporanea creata da questo test.
  if(copy.startsWith(scratch+path.sep)) fs.rmSync(copy,{recursive:true,force:true});
  console.log('Artefatti: '+artifacts);
});
