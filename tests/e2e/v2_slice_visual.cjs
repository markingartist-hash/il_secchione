/* REDESIGN V2 · QA visiva della vertical slice (solo sviluppo).
   NODE_PATH=<node_modules con playwright> node tests/e2e/v2_slice_visual.cjs <cartella-app> <cartella-risultati> [scenario]
   La cartella-app deve contenere i pacchetti (packs/…, packs.bundle.js): node tools/build_packs.js.
   scenario: main (6 squadre, 5 risoluzioni, tutte le schermate e i casi di densità) | t3 | t12 | t30 (3/12/30 squadre) | popup
   (finestra del proiettore aperta dalla regia con APRI). Per ogni schermata misura testi tagliati o fuori dal palco;
   verifica inoltre che il CSS V2 sopravviva alla copia nella finestra del proiettore (serializzazione CSSOM). */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const APP = process.argv[2], OUT = process.argv[3], SCEN = process.argv[4] || 'main';
fs.mkdirSync(OUT, { recursive: true });
const srv = require(path.join(APP, 'server/server.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RES = SCEN === 'main' ? [[1920, 1080], [1600, 900], [1366, 768], [1280, 720], [1024, 768]] : [[1920, 1080], [1366, 768], [1024, 768]];
const NAMES = {
  main: ['Leoni', 'Aquile', 'Volpi', 'Squadra dei Gladiatori Romani del Colosseo', 'Lupi', 'Falchi'],
  t3: ['Leoni', 'I Magnifici Archeologi della 3ªB', 'Volpi'],
  t12: ['Leoni', 'Aquile', 'Volpi', 'Squadra dei Gladiatori Romani', 'Lupi', 'Falchi', 'Orsi', 'Delfini', 'Tigri', 'Pantere', 'Castori', 'I Centurioni della Via Appia'],
  t30: Array.from({ length: 30 }, (_, i) => i === 7 ? 'I Legionari Invincibili della Terza Legione' : 'Squadra ' + String(i + 1).padStart(2, '0')),
  popup: ['Leoni', 'Aquile', 'Volpi']
};
const report = [];
(async () => {
  const app = srv.createServer({ quiet: true, dataDir: path.join(OUT, '_data_' + SCEN) });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await ctx.newPage();
  host.on('dialog', d => d.accept());
  const errs = []; host.on('pageerror', e => errs.push('host: ' + e.message));
  await host.goto(base + '/host');
  await host.waitForFunction(() => window.SecchioneNet && window.SecchioneNet.isConnected());
  for (const n of NAMES[SCEN]) { await host.locator('#teamName').fill(n); await host.locator('#addTeamBtn').click(); }
  const D = code => host.evaluate(code);
  // la finestra del proiettore copia le regole CSS via cssText: nessuna dichiarazione V2 deve perdersi
  const cssLost = await host.evaluate(() => { const lost = []; for (const sh of document.styleSheets) { if (!/v2/.test(sh.href || '')) continue; const walk = rules => { for (const r of rules) { if (r.cssRules && !r.selectorText) walk(r.cssRules); if (!r.selectorText) continue; const t = new CSSStyleSheet(); t.replaceSync(r.cssText); const r2 = t.cssRules[0], a = [...r.style], c = new Set([...r2.style]); const miss = a.filter(x => !c.has(x)); if (miss.length) lost.push(r.selectorText + ' → ' + miss.join(',')); } }; walk(sh.cssRules); } return lost; });
  if (cssLost.length) errs.push('CSS perso nella copia per il proiettore: ' + cssLost.join(' | '));
  const shows = [];
  if (SCEN === 'popup') {
    const pp = ctx.waitForEvent('page'); await host.locator('#publicBtn').click(); const popup = await pp; await popup.waitForLoadState();
    await popup.setViewportSize({ width: 1280, height: 720 }); popup.on('pageerror', e => errs.push('popup: ' + e.message));
    shows.push(['popup_1280x720', popup]);
  } else {
    for (const [w, h] of RES) { const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage(); p.on('pageerror', e => errs.push('show: ' + e.message)); await p.goto(base + '/show'); await sleep(700); await p.evaluate(() => { const b = document.getElementById('fsGoBox'); if (b) b.style.display = 'none'; }); shows.push([w + 'x' + h, p]); }
  }
  /* misure: testi tagliati (fuori dal contenitore) o elementi fuori dal palco */
  async function measure(p) {
    return p.evaluate(() => {
      const st = document.getElementById('publicStage'), sr = st.getBoundingClientRect(), out = [];
      const vis = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length; };
      st.querySelectorAll('.finalCard,.v2RRow,.v2QFoot,.v2QText,.v2OptText,.v2Opts,.v2QMain,.v2RTeam,.v2RList,.finalTeam,.finalList,.finalRest,.v2RuleValue,.v2RuleSub,.v2RuleCard,.answerExplanation,.v2HomeCopy,.v2RAnswer strong').forEach(el => {
        if (!vis(el)) return; const r = el.getBoundingClientRect();
        if (r.right > sr.right + 1 || r.bottom > sr.bottom + 1 || r.left < sr.left - 1 || r.top < sr.top - 1) out.push('FUORI PALCO ' + el.className);
        const clamp = getComputedStyle(el).webkitLineClamp && getComputedStyle(el).webkitLineClamp !== 'none';
        if (el.scrollHeight > el.clientHeight + 2 && !clamp) out.push('TAGLIATO(v) ' + el.className + ' ' + el.scrollHeight + '>' + el.clientHeight);
        if (el.scrollWidth > el.clientWidth + 2 && !el.querySelector('.finalShine')) out.push('TAGLIATO(h) ' + el.className);
        if (clamp && el.scrollHeight > el.clientHeight + 2) out.push('troncato a righe ' + el.className);
      });
      const px = sel => { const e = st.querySelector(sel); return e && vis(e) ? +(parseFloat(getComputedStyle(e).fontSize) / sr.height * 100).toFixed(2) : null; };
      return { issues: out, sizes: { domanda: px('.v2QText'), risposta: px('.v2OptText'), timer: px('.v2Q .publicTimerRing b'), squadra: px('.v2RTeam') || px('.finalTeam') } };
    });
  }
  async function shot(name, wait) {
    await sleep(wait || 1400);
    for (const [s, p] of shows) {
      await p.evaluate(() => { const t = document.getElementById('transition'); if (t) t.classList.remove('active'); });
      await sleep(80);
      await p.screenshot({ path: path.join(OUT, `${SCEN}_${name}_${s}.png`) });
      const m = await measure(p); report.push({ shot: `${name}_${s}`, ...m });
    }
  }
  async function question(i, name, opts) {
    await D(`(() => { const d = window.__secchioneDebug; d.goQuestion(${i}); d.startQuestion(); })()`);
    await shot(name + '_domanda', 900);
    await D(`(() => { const d = window.__secchioneDebug, s = d.state, c = s.qRound.correctDisplayLetter, w = ['A','B','C','D'].find(x => x !== c); s.teams.forEach((t, k) => d.setPending(t.id, k % 3 === 1 ? w : k % 5 === 4 ? 'abstain' : c, { inputMode: 'manual' })); d.revealQuestion(); })()`);
    await shot(name + '_reveal', 900);
    if (opts && opts.round) { await host.locator('#nextQBtn').click().catch(() => {}); await shot(name + '_classifica_round', 3200); }
    await D(() => { const d = window.__secchioneDebug; d.commitQuestionScores && d.commitQuestionScores(); });
  }
  await D(() => { const b = window.__secchioneDebug.state.bank;
    b.push({ id: 'qa_dense', category: 'Storia', question: 'Quale tra questi interventi urbanistici fu promosso da Augusto per rinnovare il volto monumentale di Roma dopo le guerre civili?', options: ['La costruzione del Foro di Augusto con il tempio di Marte Ultore', 'Il rifacimento completo delle mura serviane', 'La bonifica delle paludi pontine', 'La fondazione di Ostia'], correct: 'A', explanation: 'Il Foro di Augusto, con il tempio di Marte Ultore, celebrava la vittoria sui cesaricidi.' });
    b.push({ id: 'qa_vdense', category: 'Storia e archeologia del mondo romano', question: 'Secondo le fonti antiche e la ricerca archeologica più recente, quale tra le seguenti affermazioni descrive in modo più accurato la funzione originaria del Pantheon di Agrippa e le trasformazioni subite durante il regno di Adriano?', options: ['Era un tempio dedicato a tutti gli dei, ricostruito da Adriano con la grande cupola in calcestruzzo e l’iscrizione originale di Agrippa sul pronao', 'Era una basilica civile destinata ai processi pubblici, trasformata in tempio solo nel Medioevo cristiano', 'Era un mausoleo imperiale per la famiglia Giulio-Claudia, poi convertito in biblioteca pubblica', 'Era un granaio monumentale del Campo Marzio, abbellito da Adriano con statue di divinità orientali'], correct: 'A', explanation: 'Adriano ricostruì il Pantheon mantenendo l’iscrizione di Agrippa sul pronao: M·AGRIPPA·L·F·COS·TERTIVM·FECIT. La cupola resta la più grande in calcestruzzo non armato mai costruita, con un diametro di oltre 43 metri.' });
    b.push({ id: 'qa_long', category: 'Arte', question: 'Che cosa rappresenta il rilievo?', options: ['Una processione solenne di magistrati, sacerdoti e membri della famiglia imperiale che accompagnano il sacrificio pubblico per la pace', 'Un trionfo militare con il bottino portato in corteo lungo la via Sacra dopo la conquista della città nemica', 'Una scena di vita quotidiana nel porto di Ostia, con scaricatori, mercanti e navi onerarie cariche di grano', 'Un banchetto funebre in onore del defunto, con i familiari distesi sui letti tricliniari e i servi'], correct: 'A', explanation: 'È il corteo dell’Ara Pacis.' });
    const img = b.find(q => q.image); if (img) b.push(Object.assign({}, img, { id: 'qa_img_vdense', question: 'Osserva con attenzione l’opera riprodotta nell’immagine: a quale fase della storia dell’arte romana appartiene e quale caratteristica stilistica la distingue più chiaramente dalle opere precedenti?', options: ['Al periodo tardo-antico, per la frontalità rigida e le proporzioni gerarchiche delle figure', 'Alla prima età repubblicana, per il realismo dei ritratti di famiglia', 'All’età augustea, per l’equilibrio classico ispirato all’arte greca', 'All’età dei Severi, per il forte chiaroscuro ottenuto col trapano'] })); });
  const idx = await D(() => { const b = window.__secchioneDebug.state.bank, f = id => b.findIndex(q => q.id === id); return { img: b.findIndex(q => q.image), dense: f('qa_dense'), vdense: f('qa_vdense'), long: f('qa_long'), imgv: f('qa_img_vdense') }; });
  if (SCEN === 'main') {
    await shot('01_home');
    await host.locator('#rulesBtn').click(); await shot('02_regole');
    await D(() => { const d = window.__secchioneDebug; d.state.session.scoringProfile = 'learning'; d.renderAll(); }); await shot('02b_regole_profilo_didattico', 700);
    await D(() => { const d = window.__secchioneDebug; d.state.session.scoringProfile = 'legacy_v3'; d.renderAll(); }); await shot('02c_regole_profilo_classico', 700);
    await D(() => { const d = window.__secchioneDebug; d.state.session.scoringProfile = 'show_standard'; d.renderAll(); d.showHome(); });
    await D(() => window.__secchioneDebug.startQuiz());
    await D(() => { const d = window.__secchioneDebug; d.goQuestion(0); }); await shot('03_normale_anteprima', 900);
    await question(0, '03_normale', { round: true });
    // timer negli ultimi secondi (ambra ≤10, rosso ≤5): stato reale del timer
    await D(() => { const d = window.__secchioneDebug; d.goQuestion(1); d.startQuestion(); d.addSeconds(-(Math.ceil(d.state.timer.remaining) - 8)); });
    await shot('03b_timer_ambra', 600);
    await D(() => { const d = window.__secchioneDebug; d.addSeconds(-4); }); await shot('03c_timer_rosso', 600);
    await D(() => { const d = window.__secchioneDebug; d.commitQuestionScores && d.commitQuestionScores(); });
    if (idx.img >= 0) await question(idx.img, '04_immagine');
    await question(idx.dense, '05_densa');
    await question(idx.vdense, '06_molto_densa', { round: true });
    await question(idx.long, '07_risposte_lunghe');
    if (idx.imgv >= 0) await question(idx.imgv, '08_immagine_molto_densa');
  } else {
    await D(() => window.__secchioneDebug.startQuiz());
    await question(0, 'q1', { round: true });
    await question(1, 'q2');
  }
  if (SCEN !== 'popup') { await D(() => window.__secchioneDebug.showLeaderboard()); await shot('09_classifica_generale', 2000); }
  await D(() => window.__secchioneDebug.showLeaderboard({ final: true })); await shot('10_finale_intro', 1500);
  const n = NAMES[SCEN].length;
  const reveal = async () => { await host.locator('#cockpitMain button').first().click(); };
  for (let k = 0; k < n; k++) {
    await reveal(); await sleep(250);
    if (k === Math.min(2, n - 2) && SCEN === 'main') await shot('11_finale_in_corso', 900);
    if (k === n - 2 && n > 3) await shot('12_finale_prima_del_primo', 900);
  }
  await shot('13_finale_vincitore', 700);   // durante l'animazione VICTORY
  await shot('13b_finale_vincitore_fermo', 1500);
  fs.writeFileSync(path.join(OUT, `report_${SCEN}.json`), JSON.stringify({ errors: errs, shots: report }, null, 1));
  const bad = report.filter(r => r.issues.some(i => !/^troncato/.test(i)));
  console.log(SCEN, 'schermate', report.length, 'problemi', bad.length, 'errori JS', errs.length);
  bad.slice(0, 30).forEach(r => console.log(' ', r.shot, r.issues.filter(i => !/^troncato/.test(i)).join(' | ')));
  await browser.close(); app.close();
  if (bad.length || errs.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
