/* RC2-A.2 — tastiera delle pulsantiere con cursore, in un browser reale. Solo sviluppo, come run.cjs.
 *   NODE_PATH=<node_modules con playwright> node tests/e2e/keyboard_caret.cjs [cartella-risultati]
 * Regia + una pulsantiera collegata con il PIN; Indovina apre un round testuale. Sulla pulsantiera, solo con tocchi
 * sui tasti e sul campo: inserimento all'inizio, in mezzo e alla fine, selezione sostituita, ⌫ su selezione e carattere,
 * accenti e apostrofo, frase intera, testo lungo con scorrimento, rotazione del telefono. Poi INVIA e verifica in regia.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'secchione-kb-'));
const copy = path.join(scratch, 'app');
const out = path.resolve(process.argv[2] || path.join(scratch, 'artifacts'));
fs.mkdirSync(out, { recursive: true });
fs.cpSync(ROOT, copy, { recursive: true, filter: p => !['runtime', 'data', 'QA', 'node_modules', '.git'].some(n => path.relative(ROOT, p).split(path.sep).includes(n)) });
const srv = require(path.join(copy, 'server/server.js'));
const checks = [], errors = [];
function pass(name) { checks.push(name); console.log('PASS ' + name); }

(async () => {
  const app = srv.createServer({ quiet: true, dataDir: path.join(scratch, 'data') });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.port;
  const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  host.on('pageerror', e => errors.push('host: ' + e.message));
  await host.goto(base + '/host');
  await host.waitForFunction(() => window.SecchioneNet && window.SecchioneNet.isConnected());
  await host.locator('#audioBtn').click(); await host.locator('#motionBtn').click();
  for (const n of ['Leoni', 'Aquile']) { await host.locator('#teamName').fill(n); await host.locator('#addTeamBtn').click(); }
  await host.locator('#devicesBtn').click();
  const pin = (await host.locator('.devPin b').textContent()).trim();
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await pctx.newPage();
  p.on('pageerror', e => errors.push('player: ' + e.message));
  await p.goto(base + '/player');
  await p.locator('#pinInput').fill(pin); await p.locator('#joinBtn').click();
  await p.getByRole('button', { name: 'Leoni', exact: true }).click();
  await host.locator('[data-dev-approve]').first().click();
  await p.locator('.team').filter({ hasText: 'Leoni' }).waitFor();
  await host.locator('#devicesClose').click();
  await host.evaluate(() => { const d = window.__secchioneDebug; d.startArcade('indovina'); d.startIndovina(); d.addSeconds(240); });
  const field = p.locator('#textInput');
  await field.waitFor();
  const val = () => field.inputValue();
  const sel = () => field.evaluate(f => [f.selectionStart, f.selectionEnd]);
  const key = async ch => { if (ch === ' ') return p.locator('[data-text-action="space"]').tap(); return p.locator('.kbLetters [data-char], .kbAccents [data-char]').filter({ hasText: new RegExp('^' + ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().tap(); };
  const type = async s => { for (const ch of s) await key(ch); };
  const back = () => p.locator('.kbLetters [data-text-action="backspace"]').tap();
  /* tocco nel campo alla posizione del carattere i (coordinate misurate nel browser, come farebbe un dito) */
  const tapAt = async i => {
    const pt = await field.evaluate((f, i) => {
      const cs = getComputedStyle(f), c = document.createElement('canvas').getContext('2d');
      c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const r = f.getBoundingClientRect();
      const x = r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + c.measureText(f.value.slice(0, i)).width - f.scrollLeft;
      return { x: Math.max(r.left + 4, Math.min(r.right - 4, x)), y: r.top + r.height / 2 };
    }, i);
    await p.touchscreen.tap(pt.x, pt.y);
    await p.waitForTimeout(80);
  };
  const minKey = async () => p.evaluate(() => Math.min.apply(null, Array.from(document.querySelectorAll('.kbLetters .kbKey')).map(b => b.getBoundingClientRect().height)));

  await type('ROMA');
  assert.equal(await val(), 'ROMA');
  pass('inserimento alla fine: ROMA');
  await tapAt(0); await type('LA');
  assert.equal(await val(), 'LAROMA');
  pass('tocco all’inizio del campo → inserimento all’inizio: LAROMA');
  await tapAt(2); await key(' ');
  assert.equal(await val(), 'LA ROMA');
  pass('tocco in mezzo → SPAZIO nel punto del cursore: LA ROMA');
  // errore nel mezzo: ROMA → ROSA correggendo una sola lettera senza cancellare il resto
  await tapAt(6); await back(); await key('S');
  assert.equal(await val(), 'LA ROSA');
  pass('⌫ nel mezzo cancella il carattere prima del cursore, poi inserisce: LA ROSA (il resto non si cancella)');
  await field.evaluate(f => f.setSelectionRange(3, 7)); await field.dispatchEvent('select'); await p.waitForTimeout(80);
  await type('CITTÀ');
  assert.equal(await val(), 'LA CITTÀ');
  pass('selezione sostituita da ciò che si digita (accento compreso): LA CITTÀ');
  await field.evaluate(f => f.setSelectionRange(0, 3)); await field.dispatchEvent('select'); await p.waitForTimeout(80);
  await back();
  assert.equal(await val(), 'CITTÀ');
  pass('⌫ con selezione cancella solo la selezione: CITTÀ');
  await tapAt(5); await type(' DELL\'ARCO');
  assert.equal(await val(), 'CITTÀ DELL\'ARCO');
  pass('apostrofo e frase intera: CITTÀ DELL\'ARCO');
  await p.screenshot({ path: path.join(out, 'kb_portrait_phrase.png') });
  assert.ok(await minKey() >= 44, 'tasti alti almeno 44 px in verticale');
  pass('telefono verticale: tasti lettere ≥ 44 px (' + Math.round(await minKey()) + ' px)');
  // rotazione: il testo e il cursore restano
  await field.evaluate(f => f.setSelectionRange(5, 5)); await field.dispatchEvent('select'); await p.waitForTimeout(50);
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(300);
  assert.equal(await val(), 'CITTÀ DELL\'ARCO');
  await key('X');
  assert.equal(await val(), 'CITTÀX DELL\'ARCO');
  await back();
  pass('rotazione in orizzontale: testo conservato, il cursore resta dov’era (inserimento in mezzo dopo la rotazione)');
  await p.screenshot({ path: path.join(out, 'kb_landscape.png') });
  const landMin = await minKey();
  console.log('   tasti in orizzontale: ' + Math.round(landMin) + ' px');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  // testo lungo: scorrimento orizzontale fino al cursore
  // cursore in fondo (come trascinandolo fino all'ultima lettera), poi una frase lunga
  await field.evaluate(f => f.setSelectionRange(f.value.length, f.value.length)); await field.dispatchEvent('select'); await p.waitForTimeout(80);
  await type(' E DEL FORO ROMANO ANTICO');
  const long = await val();
  const sc = await field.evaluate(f => ({ sw: f.scrollWidth, cw: f.clientWidth, sl: f.scrollLeft }));
  assert.ok(sc.sw > sc.cw, 'il testo lungo supera la larghezza');
  assert.ok(sc.sl > 0, "il campo scorre fino al cursore");
  pass('testo lungo (' + long.length + ' caratteri): scorrimento orizzontale fino al cursore (scrollLeft ' + Math.round(sc.sl) + ')');
  await field.evaluate(f => { f.scrollLeft = 0; }); // trascinamento del campo fino all'inizio
  await tapAt(0); await key('Q');
  assert.equal((await val()).charAt(0), 'Q');
  const sc2 = await field.evaluate(f => f.scrollLeft);
  await back();
  assert.equal(await val(), long);
  pass('testo lungo: tocco all’inizio, inserimento e ⌫ all’inizio senza toccare il resto (scrollLeft ' + Math.round(sc2) + ')');
  await p.screenshot({ path: path.join(out, 'kb_long.png') });
  // limite di lunghezza
  const maxLen = Number(await field.getAttribute('maxlength'));
  for (let i = long.length; i < maxLen + 3; i++) await key('Z');
  assert.equal((await val()).length, maxLen);
  pass('mai oltre il limite di ' + maxLen + ' caratteri');
  await p.locator('[data-text-action="clear"]').tap();
  assert.equal(await val(), '');
  await type('AUGUSTO');
  await p.screenshot({ path: path.join(out, 'kb_before_send.png') });
  await p.locator('#sendBtn').tap();
  await p.getByRole('heading', { name: 'RISPOSTA REGISTRATA' }).waitFor();
  await p.screenshot({ path: path.join(out, 'kb_sent.png') });
  await host.waitForFunction(() => { const s = window.__secchioneDebug.state; return Object.keys(s.pending).length >= 1; });
  const got = await host.evaluate(() => { const s = window.__secchioneDebug.state; const id = s.teams[0].id; return [s.pending[id], (s.entryMeta[id] || {}).selectedAnswer]; });
  assert.deepEqual(got, ['correct', 'AUGUSTO']);
  pass('INVIA: la regia riceve AUGUSTO, corretta');
  await browser.close(); app.close();
  fs.writeFileSync(path.join(out, 'keyboard_report.json'), JSON.stringify({ checks, errors, landscapeMinKeyPx: landMin }, null, 2));
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('\n' + checks.length + ' verifiche superate. Risultati in ' + out);
})().catch(e => { console.error(e); process.exit(2); });
