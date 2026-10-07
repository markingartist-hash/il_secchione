/* RC2-A.3 (Fase B1) — Pack Studio in un browser reale: creare da zero, solo con l'interfaccia, una domanda, un Photopuzzle,
 * un Indovina e un Abbinamento (immagini caricate dal PC, voci A–D, coppie), salvare nella libreria, controllare il pacchetto
 * scritto su disco con le regole del Gestore Pacchetti e riaprirlo nello Studio. Solo sviluppo, come run.cjs.
 *   NODE_PATH=<node_modules con playwright> node tests/e2e/studio_create.cjs [cartella-risultati]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'secchione-studio-'));
const copy = path.join(scratch, 'app');
const out = path.resolve(process.argv[2] || path.join(scratch, 'artifacts'));
fs.mkdirSync(out, { recursive: true });
fs.cpSync(ROOT, copy, { recursive: true, filter: p => !['runtime', 'data', 'QA', 'node_modules', '.git'].some(n => path.relative(ROOT, p).split(path.sep).includes(n)) });
const srv = require(path.join(copy, 'server/server.js'));
const PE = require(path.join(copy, 'js/engine/packs.js'));
const IMG = n => path.join(copy, 'packs/arte_romana/images', n);
const checks = [], errors = [];
function pass(name) { checks.push(name); console.log('PASS ' + name); }

(async () => {
  const app = srv.createServer({ quiet: true, dataDir: path.join(scratch, 'data') });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.port;
  const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(base + '/studio');
  const form = page.locator('#stNewForm');
  await form.waitFor();
  await form.locator('[name="title"]').fill('Prova B1 Roma');
  await form.locator('[name="subject"]').fill('Storia');
  await form.locator('button[type="submit"], [type="submit"]').first().click();
  await page.locator('.stQuickAdd').waitFor();
  assert.equal(await page.locator('.stQuickAdd [data-act="quick-add"]').count(), 6);
  pass('CREA DA ZERO: 6 pulsanti (domanda, Photopuzzle, Indovina, Abbinamento, Parola Segreta, Staffetta)');
  const bind = p => page.locator('[data-bind="' + p + '"]');
  // domanda
  await bind('q.question').fill('Quale strada collegava Roma a Brindisi?');
  for (const [k, v] of [[0, 'Via Appia'], [1, 'Via Aurelia'], [2, 'Via Flaminia'], [3, 'Via Salaria']]) await bind('q.options.' + k).fill(v);
  await page.locator('input[name="stCorrect"][value="A"]').check();
  await bind('q.explanation').fill('La Via Appia arrivava fino a Brindisi.');
  pass('domanda compilata dal modulo');
  // Photopuzzle
  await page.locator('[data-act="quick-add"][data-kind="photopuzzle"]').click();
  await bind('g.label').fill('Strade romane');
  await bind('g.instruction').fill('Guardate bene il selciato');
  await page.locator('input[data-upload="g.image"]').setInputFiles(IMG('via_appia.jpg'));
  await page.waitForFunction(() => !!document.querySelector('.stPicker[data-path="g.image"] .stThumb img'));
  await bind('g.answer').fill('Via Appia antica');
  pass('Photopuzzle da zero: immagine caricata dal PC, soluzione, istruzione per la tendina');
  // Indovina
  await page.locator('[data-act="quick-add"][data-kind="indovina"]').click();
  await bind('g.label').fill('Chi sono?');
  for (const [k, v] of [[0, 'Augusto'], [1, 'Nerone'], [2, 'Traiano'], [3, 'Adriano']]) await bind('g.candidates.' + k).fill(v);
  await page.locator('input[data-act="ind-sol"][data-k="2"]').check();
  for (const [k, v] of [[0, 'Ho portato l’impero alla massima estensione.'], [1, 'Ho conquistato la Dacia.'], [2, 'Una colonna racconta le mie imprese.']]) await bind('g.clues.' + k).fill(v);
  pass('Indovina da zero: 4 alternative, soluzione scelta, 3 indizi');
  // Abbinamento
  await page.locator('[data-act="quick-add"][data-kind="abbinamenti"]').click();
  await bind('g.label').fill('Monumenti');
  const imgs = ['colosseo.jpg', 'pantheon.jpg', 'ara_pacis.jpg', 'ercole.jpg'];
  for (let k = 0; k < 4; k++) {
    await page.locator('input[data-upload="g.cards.' + k + '.img"]').setInputFiles(IMG(imgs[k]));
    await page.waitForFunction(k => !!document.querySelector('.stPicker[data-path="g.cards.' + k + '.img"] .stThumb img'), k);
  }
  // voci scritte in ordine diverso dalle immagini, poi le coppie
  for (const [k, v] of [[0, 'Pantheon'], [1, 'Tempio di Ercole'], [2, 'Colosseo'], [3, 'Ara Pacis']]) await bind('g.terms.' + k).fill(v);
  await page.waitForTimeout(300);
  for (const [k, v] of [[0, '2'], [1, '0'], [2, '3'], [3, '1']]) await page.locator('[data-bind="g.match.' + k + ':int"]').selectOption(v);
  const chips = await page.locator('.stPairSummary').textContent();
  assert.ok(/1 → C Colosseo/.test(chips) && /2 → A Pantheon/.test(chips) && /3 → D Ara Pacis/.test(chips) && /4 → B Tempio di Ercole/.test(chips), chips);
  pass('Abbinamento da zero: 4 immagini dal PC, voci A–D, coppie impostate (' + chips.replace(/\s+/g, ' ').trim() + ')');
  // validazione chiara: voce usata due volte
  await page.locator('[data-bind="g.match.1:int"]').selectOption('2');
  await page.waitForTimeout(400);
  const issues = await page.locator('#stEdErrors, .stIssues').allTextContents();
  assert.ok(issues.join(' ').match(/voce C è abbinata a più immagini/), 'messaggio chiaro: ' + issues.join(' | '));
  pass('validazione: «la voce C è abbinata a più immagini» quando una voce è usata due volte');
  await page.locator('[data-bind="g.match.1:int"]').selectOption('0');
  await page.screenshot({ path: path.join(out, 'studio_abbinamento.png'), fullPage: false });
  // salvataggio
  await page.locator('[data-act="save"]').click();
  await page.waitForFunction(() => /salvat/i.test((document.getElementById('stMsg') || {}).textContent || ''), null, { timeout: 15000 });
  pass('SALVA NELLA LIBRERIA: ' + (await page.locator('#stMsg').textContent()).trim().slice(0, 90));
  const packDir = fs.readdirSync(path.join(copy, 'packs')).filter(n => /prova_b1/.test(n)).map(n => path.join(copy, 'packs', n))[0];
  assert.ok(packDir, 'pacchetto scritto su disco');
  const games = JSON.parse(fs.readFileSync(path.join(packDir, 'games.json'), 'utf8')).games;
  const norm = PE.normalizeGames({ games }, {});
  assert.deepEqual(norm.errors, [], 'il Gestore Pacchetti accetta i giochi salvati');
  const ab = games.abbinamenti[0];
  assert.deepEqual(ab.names, ['Colosseo', 'Pantheon', 'Ara Pacis', 'Tempio di Ercole'], 'names[i] = voce corretta dell’immagine i');
  assert.ok(!('terms' in ab) && !('match' in ab), 'i dati della bozza non finiscono nel pacchetto');
  assert.equal(games.indovina[0].subject, 'Traiano');
  assert.equal(games.photopuzzle[0].instruction, 'Guardate bene il selciato');
  assert.ok(fs.existsSync(path.join(packDir, 'images', games.photopuzzle[0].image)) && ab.cards.every(c => fs.existsSync(path.join(packDir, 'images', c.img))), 'immagini nel pacchetto');
  pass('pacchetto su disco valido: Abbinamento ' + JSON.stringify(ab.names) + ', Indovina = Traiano, Photopuzzle con istruzione e immagini');
  // riapertura
  await page.locator('[data-act="close"]').click();
  await page.locator('[data-act="open-lib"]').first().waitFor();
  const id = path.basename(packDir);
  await page.locator('[data-act="open-lib"][data-id="' + id + '"]').click();
  await page.locator('[data-act="tab"][data-tab="games"]').click();
  await page.locator('[data-act="g-sel"][data-type="abbinamenti"][data-i="0"]').click();
  const reopened = await page.evaluate(() => Array.from(document.querySelectorAll('[data-bind^="g.terms."]')).map(i => i.value));
  assert.deepEqual(reopened, ['Colosseo', 'Pantheon', 'Ara Pacis', 'Tempio di Ercole'], 'riaperto: voci nell’ordine delle immagini, coppie 1–A, 2–B…');
  const pairs = (await page.locator('.stPairSummary').textContent()).replace(/\s+/g, ' ').trim();
  assert.ok(/1 → A Colosseo/.test(pairs) && /4 → D Tempio di Ercole/.test(pairs), pairs);
  pass('riapertura dalla libreria: Abbinamento con le stesse coppie (' + pairs + ')');
  await page.screenshot({ path: path.join(out, 'studio_riaperto.png') });
  await browser.close(); app.close();
  fs.writeFileSync(path.join(out, 'studio_report.json'), JSON.stringify({ checks, errors }, null, 2));
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('\n' + checks.length + ' verifiche superate. Risultati in ' + out);
})().catch(e => { console.error(e); process.exit(2); });
