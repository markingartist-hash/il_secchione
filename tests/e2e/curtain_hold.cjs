/* RC2-A.3.1 — regressione della TENDINA in un browser reale (bug visto su PC: la tendina spariva da sola dopo ~1 s).
 *   NODE_PATH=<node_modules con playwright> node tests/e2e/curtain_hold.cjs [cartella-risultati]
 * Regia /host + finestra del proiettore aperta dalla regia (pulsante APRI) + /show. Per ogni gioco, scelto con un clic nella scheda GIOCHI:
 * - fin dal primo render e per oltre 2 s (oltre i 1380 ms della vecchia transizione) il proiettore mostra .gameCurtain
 *   e NESSUN contenuto del gioco (campionato ogni 50 ms, più tutti i messaggi show.stage ricevuti da /show);
 * - cambiando manche sotto la tendina (menu e frecce) e attendendo ancora, la tendina resta;
 * - solo un comando del docente rivela il gioco: tasto T, TOGLI TENDINA, TOGLI TENDINA E AVVIA.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(process.env.APP_ROOT || path.join(__dirname, '../..'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'secchione-curtain-'));
const copy = path.join(scratch, 'app');
const out = path.resolve(process.argv[2] || path.join(scratch, 'artifacts'));
fs.mkdirSync(out, { recursive: true });
fs.cpSync(ROOT, copy, { recursive: true, filter: p => !['runtime', 'data', 'QA', 'node_modules', '.git'].some(n => path.relative(ROOT, p).split(path.sep).includes(n)) });
const srv = require(path.join(copy, 'server/server.js'));
const GAMES = ['photopuzzle', 'indovina', 'abbinamenti', 'ghigliottina', 'chain'];
/* qualunque traccia del gioco sul palco pubblico */
const LEAK = '.gameScreen, .candidate, .clueCurrent, .term, .matchCard, .ghWord, .ghClues, .chainWord, .chainPath, .puzzleFrame, .publicBoard, .photoShow';
const checks = [], errors = [];
function pass(name) { checks.push(name); console.log('PASS ' + name); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const app = srv.createServer({ quiet: true, dataDir: path.join(scratch, 'data') });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.port;
  const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await ctx.newPage();
  host.on('pageerror', e => errors.push('host: ' + e.message));
  host.on('dialog', d => d.accept());
  await host.goto(base + '/host');
  await host.waitForFunction(() => window.SecchioneNet && window.SecchioneNet.isConnected());
  for (const n of ['Leoni', 'Aquile', 'Volpi']) { await host.locator('#teamName').fill(n); await host.locator('#addTeamBtn').click(); }
  // finestra del proiettore aperta dalla regia (il percorso consigliato in classe)
  const popupP = ctx.waitForEvent('page');
  await host.locator('#publicBtn').click();
  const popup = await popupP;
  await popup.waitForLoadState();
  // /show su un altro "dispositivo": registra ogni HTML del palco che riceve
  const show = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const frames = [];
  show.on('websocket', ws => ws.on('framereceived', f => { try { const m = JSON.parse(String(f.payload)); if ((m.type === 'stage' || m.type === 'show.stage') && typeof m.html === 'string') frames.push({ t: Date.now(), html: m.html }); } catch (e) { /* binario */ } }));
  await show.goto(base + '/show');
  await show.locator('.showHome').waitFor();
  const screens = [['finestra del proiettore', popup], ['/show', show]];
  async function state(p) {
    return p.evaluate(sel => { const st = document.getElementById('publicStage'); return { curtain: !!(st && st.querySelector('.gameCurtain')), leak: st ? st.querySelectorAll(sel).length : -1 }; }, LEAK);
  }
  /* campiona entrambi gli schermi ogni 50 ms per ms millisecondi: la tendina deve esserci SEMPRE e il gioco MAI */
  async function holdCurtain(ms, label) {
    const end = Date.now() + ms;
    let samples = 0;
    while (Date.now() < end) {
      for (const [name, p] of screens) {
        const s = await state(p);
        if (!s.curtain || s.leak) throw new Error(label + ': ' + name + ' dopo ' + (ms - (end - Date.now())) + ' ms → ' + JSON.stringify(s));
      }
      samples++;
      await sleep(50);
    }
    return samples;
  }
  async function revealed(label) {
    await sleep(400);
    for (const [name, p] of screens) {
      const s = await state(p);
      assert.ok(!s.curtain && s.leak > 0, label + ': ' + name + ' mostra il gioco ' + JSON.stringify(s));
    }
  }
  await host.locator('[data-tab="games"]').click();
  for (const type of GAMES) {
    const since = Date.now();
    const mine = 'gs-' + type;                                                    // classe del palco di QUESTO gioco
    /* dal clic in poi il gioco scelto non deve MAI comparire: campioni ogni 10 ms finché la tendina arriva su entrambi gli schermi */
    const watch = (async () => { const until = Date.now() + 1000; while (Date.now() < until) { for (const [name, p] of screens) { const own = await p.evaluate(c => !!document.querySelector('#publicStage .' + c), mine); if (own) throw new Error(type + ': ' + name + ' ha mostrato il gioco prima della tendina'); } await sleep(10); } })();
    await host.locator('#gameButtons [data-game="' + type + '"]').click();       // scelta del gioco con un clic
    await Promise.all(screens.map(([, p]) => p.waitForFunction(() => !!document.querySelector('#publicStage .gameCurtain'), null, { timeout: 3000 })));
    await watch;
    const n = await holdCurtain(2300, type + ' dopo la scelta');                  // > 1380 ms della vecchia transizione
    await host.locator('#presetSelect').selectOption('1');                       // cambio manche dal menu sotto la tendina
    await host.locator('[data-preset-delta="1"]').click();                       // e con la freccia
    const n2 = await holdCurtain(2100, type + ' dopo il cambio di manche');
    const leaked = frames.filter(f => f.t >= since && f.html.indexOf(mine) >= 0);
    assert.equal(leaked.length, 0, type + ': /show ha ricevuto HTML del gioco con la tendina attiva');
    assert.ok(frames.some(f => f.t >= since && /class="gameCurtain/.test(f.html)), type + ': /show ha ricevuto la tendina');
    const main = await host.locator('#cockpitMain button').first().textContent();
    assert.ok(/TOGLI TENDINA E AVVIA/.test(main), 'regia: ' + main);
    pass(type + ': tendina sempre visibile per 2,3 s dalla scelta (' + n + ' campioni per schermo) e per altri 2,1 s dopo due cambi di manche (' + n2 + ' campioni); nessun HTML del gioco ricevuto da /show');
    if (type === 'indovina') {
      await popup.screenshot({ path: path.join(out, 'proiettore_tendina_dopo_4s.png') });
      await host.keyboard.press('t');                                            // tasto T
      await revealed('tasto T');
      await host.locator('[data-act="curtainOn"]').first().click();              // MOSTRA TENDINA
      await Promise.all(screens.map(([, p]) => p.waitForFunction(() => !!document.querySelector('#publicStage .gameCurtain'), null, { timeout: 3000 })));
      await holdCurtain(2100, 'MOSTRA TENDINA');
      await host.locator('[data-act="curtainOff"]').first().click();             // TOGLI TENDINA (senza avviare)
      await revealed('TOGLI TENDINA');
      assert.equal(await host.evaluate(() => !!window.__secchioneDebug.state.arcade.started), false, 'TOGLI TENDINA non avvia il tempo');
      pass('indovina: rivelato solo dai comandi del docente — tasto T, MOSTRA TENDINA la rimette, TOGLI TENDINA mostra senza avviare');
    } else {
      await host.locator('#cockpitMain button').first().click();                 // ▶ TOGLI TENDINA E AVVIA
      await revealed('TOGLI TENDINA E AVVIA');
      assert.equal(await host.evaluate(() => !!window.__secchioneDebug.state.arcade.started), true, 'il gioco è partito');
      pass(type + ': TOGLI TENDINA E AVVIA rivela il gioco e lo avvia');
    }
    if (type === 'chain') await popup.screenshot({ path: path.join(out, 'proiettore_gioco_dopo_comando.png') });
    await host.locator('[data-act="gameRestart"]').first().click().catch(() => {});
  }
  await browser.close(); app.close();
  fs.writeFileSync(path.join(out, 'curtain_report.json'), JSON.stringify({ checks, errors, stageMessages: frames.length }, null, 2));
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('\n' + checks.length + ' verifiche superate. Risultati in ' + out);
})().catch(e => { console.error('FAIL ' + (e && e.message)); process.exit(2); });
