/* RC2-A.2 — QA visiva dei giochi sul palco (/show) a più risoluzioni. Solo sviluppo, come run.cjs.
 *   NODE_PATH=<node_modules con playwright> node tests/e2e/visual_games.cjs [cartella-risultati]
 * Avvia il server su una copia temporanea dell'app, una regia (/host) con 6 squadre e quattro /show
 * (1366x768, 1600x900, 1920x1080, 1024x768). Per ogni gioco: schermata in corso, soluzione e RISULTATO DEL GIOCO.
 * Su ogni schermata controlla che nessun testo esca dal proprio riquadro o dal palco e misura la dimensione del testo
 * principale in % dell'altezza dello schermo. Scrive screenshot e report.json nella cartella dei risultati.
 * Comanda la regia tramite window.__secchioneDebug: è una prova del palco, non del flusso dei tablet.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'secchione-visual-'));
const copy = path.join(scratch, 'app');
const out = path.resolve(process.argv[2] || path.join(scratch, 'artifacts'));
fs.mkdirSync(out, { recursive: true });
fs.cpSync(ROOT, copy, { recursive: true, filter: p => !['runtime', 'data', 'QA', 'node_modules', '.git'].some(n => path.relative(ROOT, p).split(path.sep).includes(n)) });
const srv = require(path.join(copy, 'server/server.js'));
const SIZES = [[1366, 768], [1600, 900], [1920, 1080], [1024, 768]];
const report = [];
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Nel /show: elementi di testo che escono dal proprio contenitore o dal palco, e dimensione del testo principale. */
function inspect(main) {
  const stage = document.getElementById('publicStage');
  const sr = stage.getBoundingClientRect();
  const bad = [];
  const tol = 1.5;
  stage.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    if (el.closest('.puzzleSvg,.publicHostCol,.mascotFigure,.transition')) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const hasText = Array.prototype.some.call(el.childNodes, n => n.nodeType === 3 && n.textContent.trim());
    if (r.left < sr.left - tol || r.top < sr.top - tol || r.right > sr.right + tol || r.bottom > sr.bottom + tol) {
      if (hasText) bad.push({ el: el.className || el.tagName, why: 'fuori dal palco', text: el.textContent.trim().slice(0, 40) });
      return;
    }
    if (hasText && (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) {
      bad.push({ el: el.className || el.tagName, why: 'testo tagliato', text: el.textContent.trim().slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
    }
  });
  const sizes = {};
  (main || []).forEach(sel => {
    const el = stage.querySelector(sel);
    if (el) sizes[sel] = Math.round(parseFloat(getComputedStyle(el).fontSize) / sr.height * 1000) / 10;
  });
  const over = [];
  stage.querySelectorAll('.tooLong *').forEach(el => { if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) over.push((el.className || el.tagName) + ' ' + el.scrollWidth + 'x' + el.scrollHeight + '/' + el.clientWidth + 'x' + el.clientHeight); });
  return { stageW: Math.round(sr.width), stageH: Math.round(sr.height), bad, sizes, tooLong: !!stage.querySelector('.tooLong'), over: over.slice(0, 6) };
}

(async () => {
  const app = srv.createServer({ quiet: true, dataDir: path.join(scratch, 'data') });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.port;
  const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await ctx.newPage();
  host.on('pageerror', e => errors.push('host: ' + e.message));
  await host.goto(base + '/host');
  await host.waitForFunction(() => window.SecchioneNet && window.SecchioneNet.isConnected());
  await host.locator('#audioBtn').click();
  await host.locator('#motionBtn').click();
  const names = ['Leoni', 'Aquile', 'Volpi', 'Squadra dei Gladiatori Romani', 'Lupi', 'Falchi'];
  for (const n of names) { await host.locator('#teamName').fill(n); await host.locator('#addTeamBtn').click(); }
  const shows = [];
  for (const [w, h] of SIZES) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    p.on('pageerror', e => errors.push(w + 'x' + h + ': ' + e.message));
    await p.goto(base + '/show');
    await p.locator('.showHome').waitFor();
    await p.evaluate(() => { const b = document.getElementById('fsGoBox'); if (b) b.style.display = 'none'; });
    shows.push({ w, h, p });
  }
  const D = (fn, ...args) => host.evaluate(([f, a]) => { const d = window.__secchioneDebug; return d[f].apply(null, a); }, [fn, args]);
  async function shoot(name, main) {
    await sleep(/risultato/.test(name) ? 3400 : 900);
    for (const s of shows) {
      await s.p.evaluate(() => { const t = document.getElementById('transition'); if (t) t.classList.remove('active'); });
      await sleep(150);
      const file = `${name}_${s.w}x${s.h}.png`;
      await s.p.screenshot({ path: path.join(out, file) });
      const r = await s.p.evaluate(inspect, main || []);
      report.push(Object.assign({ shot: name, size: s.w + 'x' + s.h, file }, r));
      console.log((r.bad.length ? '✗ ' : '✓ ') + name + ' ' + s.w + 'x' + s.h + ' ' + JSON.stringify(r.sizes) + (r.bad.length ? ' ' + JSON.stringify(r.bad.slice(0, 3)) : '') + (r.tooLong ? ' TOOLONG ' + JSON.stringify(r.over) : ''));
    }
  }
  async function entries(list) { for (const [i, v] of list) await host.evaluate(([i, v]) => { const d = window.__secchioneDebug; d.setPending(d.state.teams[i].id, v, { inputMode: 'manual' }); }, [i, v]); }
  async function commitAndResults() {
    await host.evaluate(() => window.__secchioneDebug.fillMissingAbstain());
    await host.evaluate(() => window.__secchioneDebug.commitScores());
    await host.evaluate(() => { const d = window.__secchioneDebug; if (d.showGameResults) d.showGameResults(); });
  }
  const T = ['.arcadeTitle', '.hostBubble'];

  // Photopuzzle
  await D('startArcade', 'photopuzzle'); await sleep(400);
  await shoot('photopuzzle_intro', ['.gameIntroTitle', '.gameIntroHow', '.gameIntroPts']);
  await D('startPhoto');
  await sleep(2500);
  await shoot('photopuzzle_in_corso', ['.queueRow span', '.photoFooter small', '#puzzleTopLabel']);
  await host.evaluate(() => { const d = window.__secchioneDebug; d.state.arcade.started && d.timerEnded && 0; });
  await entries([[0, 'correct'], [1, 'wrong'], [2, 'correct']]);
  await host.locator('[data-act="gameReveal"]').click().catch(() => {});
  await shoot('photopuzzle_soluzione', ['.puzzleSolution']);
  await commitAndResults();
  await shoot('photopuzzle_risultato', ['.resultTeam', '.resultDelta strong', '.resultIdentity small']);

  // Indovina
  await D('startArcade', 'indovina'); await sleep(400);
  await shoot('indovina_intro', ['.gameIntroTitle', '.gameIntroHow', '.gameIntroPts']);
  await D('startIndovina');
  await host.evaluate(() => { document.querySelector('[data-act="clue"]')?.click(); document.querySelector('[data-act="clue"]')?.click(); });
  await shoot('indovina_in_corso', ['.candidate', '.clueCurrent', '.clueHistory div', '.clueNo']);
  await entries([[0, 'correct'], [3, 'wrong']]);
  await host.locator('[data-act="gameReveal"]').click().catch(() => {});
  await shoot('indovina_soluzione', ['.candidate.answer']);
  await commitAndResults();
  await shoot('indovina_risultato', ['.resultTeam', '.resultDelta strong']);

  // Abbinamenti
  await D('startArcade', 'abbinamenti'); await sleep(400);
  await shoot('abbinamenti_intro', ['.gameIntroTitle', '.gameIntroHow', '.gameIntroPts']);
  await D('startMatching');
  await shoot('abbinamenti_in_corso', ['.term', '.matchNum']);
  await entries([[1, 'correct']]);
  await host.locator('[data-act="gameReveal"]').click().catch(() => {});
  await shoot('abbinamenti_soluzione', ['.matchAnswer.show', '.term']);
  await commitAndResults();
  await shoot('abbinamenti_risultato', ['.resultTeam', '.resultDelta strong']);

  // Ghigliottina: 5 coppie con scelte a mano per squadra, poi finale
  await D('startArcade', 'ghigliottina'); await sleep(400);
  await shoot('ghigliottina_intro', ['.gameIntroTitle', '.gameIntroHow', '.gameIntroPts']);
  await D('startGh');
  await shoot('ghigliottina_coppia', ['.ghText', '.ghStatus', '.ghMeta']);
  for (let step = 0; step < 5; step++) {
    await host.evaluate((step) => {
      const d = window.__secchioneDebug, a = d.state.arcade, p = a.pairs[a.step];
      const wrong = p.correctSide === 'A' ? 'B' : 'A';
      if (d.ghPick) d.state.teams.forEach((t, i) => d.ghPick(t.id, i === 5 ? 'abstain' : (i + step) % 3 ? p.correctSide : wrong));
      d.chooseGh(p.correctSide);
    }, step);
    await host.waitForFunction((n) => { const a = window.__secchioneDebug.state.arcade; return a.final || a.step > n; }, step, { timeout: 8000 });
  }
  await shoot('ghigliottina_finale', ['.ghClues span', '.ghFinal', '.ghMeta']);
  await entries([[0, 'correct'], [1, 'wrong'], [2, 'correct']]);
  await host.locator('[data-act="gameReveal"]').click().catch(() => {});
  await shoot('ghigliottina_soluzione', ['.ghFinal']);
  await commitAndResults();
  await shoot('ghigliottina_risultato', ['.resultTeam', '.resultDelta strong', '.resultIdentity small']);

  // Catena / Staffetta: tutte le parole
  await D('startArcade', 'chain'); await sleep(400);
  await shoot('chain_intro', ['.gameIntroTitle', '.gameIntroHow', '.gameIntroPts']);
  await D('startChain');
  await shoot('catena_in_corso', ['.chainWord', '.chainMask']);
  const links = await host.evaluate(() => window.__secchioneDebug.state.arcade.links.length);
  for (let i = 0; i < links; i++) {
    if (i) { await host.evaluate(() => { const d = window.__secchioneDebug; d.chainNext(); d.startChain(); }); }
    await entries([[i % 6, 'correct'], [(i + 2) % 6, 'correct'], [(i + 4) % 6, 'wrong']]);
    await host.locator('[data-act="gameReveal"]').click().catch(() => {});
    if (i === 0) await shoot('catena_soluzione', ['.chainWord']);
    await host.evaluate(() => { const d = window.__secchioneDebug; d.fillMissingAbstain(); d.commitScores(); });
  }
  await host.evaluate(() => { const d = window.__secchioneDebug; if (d.showGameResults) d.showGameResults(); });
  await shoot('catena_risultato', ['.resultTeam', '.resultDelta strong', '.resultIdentity small']);

  const snap = await host.evaluate(() => window.__secchioneDebug.buildSnapshot('visual-qa'));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, errors, report, totals: snap.session.participants.map(p => p.name), scoreEvents: snap.session.scoreEvents.length }, null, 2));
  await browser.close();
  app.close();
  const bad = report.filter(r => r.bad.length);
  console.log('\nSchermate: ' + report.length + ' · con problemi: ' + bad.length + ' · errori JS: ' + errors.length);
  console.log('Risultati in ' + out);
  if (errors.length) console.log(errors.join('\n'));
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
