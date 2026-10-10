/*
 * Il Secchione · SCALETTA DELLA PUNTATA (v3.7.0) — schermata della regia.
 * Scegli domande e giochi da uno o più pacchetti installati, ordinali (trascinando o con ↑ ↓), duplica o togli un elemento,
 * mescola solo le domande, salva con un nome e riapri. La scaletta contiene solo RIFERIMENTI (engine/sessionPlan.js):
 * nessuna domanda o gioco viene copiato; un contenuto che non esiste più resta in elenco come MANCANTE.
 * Non conosce il motore di gara: usa le funzioni passate da app.js (stesso schema di packs-ui.js).
 */
(function (root) {
  'use strict';
  var SP = root.SecchioneSessionPlan;
  var ctx = null, dlg = null, body = null;
  var plan = null;            // scaletta aperta (copia di lavoro, salvata automaticamente a ogni modifica)
  var parts = [], cat = null; // contenuti installati
  var view = { packs: {}, kind: 'question', search: '', topic: '', difficulty: '' };
  var checked = {};           // chiavi dei contenuti selezionati nell'elenco di sinistra
  var savedAt = null, dragFrom = -1;
  var GAME_ORDER = ['photopuzzle', 'indovina', 'abbinamenti', 'ghigliottina', 'chain'];

  function esc(s) { return ctx.esc(s); }
  function fold(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function gameNames() { var n = {}; parts.forEach(function (p) { Object.keys(p.gameNames || {}).forEach(function (k) { if (!n[k]) n[k] = p.gameNames[k]; }); }); return n; }

  /* ---------------- contenuti disponibili ---------------- */
  function candidates() {
    var out = [], names = gameNames();
    parts.forEach(function (p) {
      if (!view.packs[p.pack.id]) return;
      p.questions.forEach(function (q) {
        out.push({ kind: 'question', key: 'q:' + q.id, pack: p.pack, make: function () { return SP.questionItem(q); }, preview: SP.questionItem(q).preview, hay: fold([q.question, q.category, q.topic, (q.options || []).join(' '), q.explanation].join(' ')) });
      });
      GAME_ORDER.forEach(function (type) {
        var sets = (p.games || {})[type] || [];
        sets.forEach(function (set, i) {
          var probe = SP.gameItem(p.pack, type, sets, i, { gameName: names[type] });
          out.push({ kind: 'game', key: SP.contentKey(probe), pack: p.pack, make: function () { return SP.gameItem(p.pack, type, sets, i, { gameName: names[type] }); }, preview: probe.preview, hay: fold([set.label, set.theme, names[type] || type].join(' ')) });
        });
      });
    });
    return out;
  }
  function filtered(all) {
    var words = fold(view.search).split(/\s+/).filter(Boolean);
    return all.filter(function (c) {
      if (c.kind !== view.kind) return false;
      if (view.topic && c.preview.topic !== view.topic) return false;
      if (view.difficulty && String(c.preview.difficulty) !== view.difficulty) return false;
      return words.every(function (w) { return c.hay.indexOf(w) >= 0; });
    });
  }
  function inPlan() { var h = {}; (plan ? plan.items : []).forEach(function (it) { h[SP.contentKey(it)] = true; }); return h; }

  /* ---------------- salvataggio ---------------- */
  function persist() {
    if (!plan) return;
    plan.name = String(plan.name || '').trim() || 'Scaletta senza nome';
    ctx.savePlans(SP.upsert(ctx.getPlans(), plan));
    savedAt = new Date();
  }
  function changed() { persist(); render(); }
  function openPlan(id) {
    var p = ctx.getPlans().filter(function (x) { return x.id === id; })[0];
    plan = p ? JSON.parse(JSON.stringify(p)) : null;
    checked = {}; savedAt = null;
  }
  function newPlan() {
    var d = new Date();
    plan = SP.createPlan('Scaletta del ' + d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }));
    checked = {}; savedAt = null;
  }

  /* ---------------- disegno ---------------- */
  function previewMeta(pv, packTitle) {
    return [pv.type, packTitle, pv.difficulty != null && pv.difficulty !== '' ? 'difficoltà ' + pv.difficulty : '', pv.topic].filter(Boolean).map(esc).join(' · ');
  }
  function planRows(resolved) {
    if (!resolved.length) return '<li class="plEmpty">La scaletta è vuota. Scegli a sinistra domande e giochi e premi <b>＋</b>.</li>';
    return resolved.map(function (it, i) {
      var icon = it.kind === 'question' ? '❓' : '🎮';
      return '<li class="plItem' + (it.missing ? ' isMissing' : '') + '" draggable="true" data-pl-idx="' + i + '">' +
        '<span class="plGrip" aria-hidden="true">⋮⋮</span><span class="plNum">' + (i + 1) + '</span><span class="plIcon" aria-hidden="true">' + icon + '</span>' +
        '<div class="plText"><b>' + esc(it.preview && it.preview.title) + '</b>' +
        '<small>' + previewMeta(it.preview || {}, it.packTitle || it.packId) + (it.duplicateOf ? ' · <i>ripetizione</i>' : '') + '</small>' +
        (it.missing ? '<small class="plMissing">⚠ MANCANTE · ' + esc(it.reason) + '. Non viene sostituito: toglilo o reinstalla il pacchetto.</small>' : '') + '</div>' +
        '<span class="plActs"><button class="btn tiny ghost" data-pl-act="up" data-i="' + i + '" aria-label="Sposta su"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button class="btn tiny ghost" data-pl-act="down" data-i="' + i + '" aria-label="Sposta giù"' + (i < resolved.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<button class="btn tiny ghost" data-pl-act="dup" data-i="' + i + '" title="Duplica: lo stesso contenuto viene giocato di nuovo (nuovo round)"' + (it.missing ? ' disabled' : '') + '>⧉</button>' +
        '<button class="btn tiny red" data-pl-act="del" data-i="' + i + '" aria-label="Togli dalla scaletta">✕</button></span></li>';
    }).join('');
  }
  /* ridisegno senza perdere la posizione negli elenchi lunghi */
  function render() {
    if (!body) return;
    var keep = {};
    ['.plList', '.plItems'].forEach(function (sel) { var el = body.querySelector(sel); if (el) keep[sel] = el.scrollTop; });
    var dlgTop = dlg ? dlg.scrollTop : 0;
    draw();
    Object.keys(keep).forEach(function (sel) { var el = body.querySelector(sel); if (el) el.scrollTop = keep[sel]; });
    if (dlg) dlg.scrollTop = dlgTop;
  }
  function draw() {
    var plans = ctx.getPlans();
    var all = candidates(), list = filtered(all), have = inPlan();
    var resolved = plan ? SP.resolve(plan, cat, { gameNames: gameNames() }) : [];
    var sum = SP.summary(resolved);
    var topics = {}, diffs = {};
    all.forEach(function (c) { if (c.kind !== view.kind) return; if (c.preview.topic) topics[c.preview.topic] = true; if (c.preview.difficulty != null && c.preview.difficulty !== '') diffs[c.preview.difficulty] = true; });
    var nQ = all.filter(function (c) { return c.kind === 'question'; }).length, nG = all.length - nQ;
    var selCount = list.filter(function (c) { return checked[c.key] && !have[c.key]; }).length;
    var addable = list.filter(function (c) { return !have[c.key]; }).length;
    var running = plan && ctx.runningPlanId && ctx.runningPlanId() === plan.id;
    var h = [];
    h.push('<div class="plTop"><label class="plPick">Scaletta<select class="control" data-pl="pick"><option value="">— scegli una scaletta salvata —</option>' +
      plans.map(function (p) { return '<option value="' + esc(p.id) + '"' + (plan && plan.id === p.id ? ' selected' : '') + '>' + esc(p.name) + ' · ' + p.items.length + ' elementi</option>'; }).join('') + '</select></label>' +
      '<button class="btn primary" data-pl-act="new">＋ NUOVA</button>' +
      '<button class="btn ghost" data-pl-act="copy"' + (plan ? '' : ' disabled') + '>DUPLICA</button>' +
      '<button class="btn ghost" data-pl-act="export"' + (plan && plan.items.length ? '' : ' disabled') + '>ESPORTA</button>' +
      '<label class="btn ghost fileLabel">IMPORTA<input type="file" accept=".json,application/json" data-pl="import"></label>' +
      '<button class="btn red" data-pl-act="remove"' + (plan && plans.some(function (p) { return p.id === plan.id; }) ? '' : ' disabled') + '>ELIMINA</button></div>');
    if (!plan) {
      h.push('<div class="plIntro"><p>La <b>scaletta della puntata</b> è l’elenco ordinato di domande e giochi che userai in classe. In lezione premi solo <b>AVANTI</b>.</p><p class="help">Crea una scaletta nuova oppure scegline una salvata. Le scalette restano su questo PC e si possono esportare come file.</p></div>');
      body.innerHTML = h.join('');
      return;
    }
    h.push('<div class="plName"><label>Nome<input class="control" data-pl="name" maxlength="80" value="' + esc(plan.name) + '"></label><span class="plSaved">' +
      (running ? '<b class="plLive">IN CORSO</b> · ' : '') + (savedAt ? '✓ salvata alle ' + savedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : (plans.some(function (p) { return p.id === plan.id; }) ? '✓ salvata' : 'si salva da sola alla prima modifica')) + '</span>' +
      '<button class="btn green xl plStart" data-pl-act="start"' + (sum.playable ? '' : ' disabled') + '>▶ ' + (running ? 'RICOMINCIA' : 'AVVIA') + ' SCALETTA</button></div>');
    h.push('<div class="plCols"><section class="plSource"><h3>CONTENUTI DEI PACCHETTI</h3>');
    h.push('<div class="plPacks">' + parts.map(function (p) {
      return '<label class="plPackChk"><input type="checkbox" data-pl-pack="' + esc(p.pack.id) + '"' + (view.packs[p.pack.id] ? ' checked' : '') + '> <b>' + esc(p.pack.title) + '</b> <small>v' + esc(p.pack.version || '—') + ' · ' + p.questions.length + ' domande · ' + GAME_ORDER.reduce(function (n, t) { return n + (((p.games || {})[t]) || []).length; }, 0) + ' giochi</small></label>';
    }).join('') + '</div>');
    h.push('<div class="plKinds"><button class="btn ' + (view.kind === 'question' ? 'primary' : 'ghost') + '" data-pl-kind="question">DOMANDE (' + nQ + ')</button><button class="btn ' + (view.kind === 'game' ? 'primary' : 'ghost') + '" data-pl-kind="game">GIOCHI (' + nG + ')</button></div>');
    h.push('<div class="plFilters"><input class="control" data-pl="search" placeholder="Cerca…" value="' + esc(view.search) + '" aria-label="Cerca nei contenuti">' +
      '<select class="control" data-pl="topic" aria-label="Argomento"><option value="">Tutti gli argomenti</option>' + Object.keys(topics).sort(function (a, b) { return a.localeCompare(b, 'it'); }).map(function (t) { return '<option' + (view.topic === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<select class="control" data-pl="difficulty" aria-label="Difficoltà"><option value="">Ogni difficoltà</option>' + Object.keys(diffs).sort().map(function (d) { return '<option value="' + esc(d) + '"' + (view.difficulty === d ? ' selected' : '') + '>Difficoltà ' + esc(d) + '</option>'; }).join('') + '</select></div>');
    h.push('<div class="plBulk"><button class="btn primary" data-pl-act="addSel"' + (selCount ? '' : ' disabled') + '>＋ AGGIUNGI SELEZIONATI (' + selCount + ')</button><button class="btn ghost" data-pl-act="addAll"' + (addable ? '' : ' disabled') + '>＋ TUTTI QUELLI IN ELENCO (' + addable + ')</button></div>');
    h.push('<ul class="plList">' + (list.length ? list.slice(0, 500).map(function (c) {
      var inside = have[c.key];
      return '<li class="plCand' + (inside ? ' isIn' : '') + '"><label><input type="checkbox" data-pl-check="' + esc(c.key) + '"' + (checked[c.key] && !inside ? ' checked' : '') + (inside ? ' disabled' : '') + '><span><b>' + esc(c.preview.title) + '</b><small>' + previewMeta(c.preview, c.pack.title) + '</small></span></label>' +
        (inside ? '<span class="plIn">✓ in scaletta</span>' : '<button class="btn tiny primary" data-pl-add="' + esc(c.key) + '" aria-label="Aggiungi">＋</button>') + '</li>';
    }).join('') + (list.length > 500 ? '<li class="plEmpty">Mostrati i primi 500: usa la ricerca per restringere.</li>' : '') : '<li class="plEmpty">' + (Object.keys(view.packs).some(function (k) { return view.packs[k]; }) ? 'Nessun contenuto con questi filtri.' : 'Spunta almeno un pacchetto.') + '</li>') + '</ul></section>');
    h.push('<section class="plPlan"><h3>SCALETTA <span class="plSum">' + sum.total + ' elementi · ' + sum.questions + ' domande · ' + sum.games + ' giochi' + (sum.missing ? ' · <b class="bad">' + sum.missing + ' mancanti</b>' : '') + '</span></h3>');
    h.push('<ol class="plItems">' + planRows(resolved) + '</ol>');
    h.push('<p class="help">Trascina per riordinare, oppure usa ↑ ↓. ⧉ duplica un elemento: in classe diventa un nuovo round (i punti già assegnati restano).</p>');
    h.push('<div class="plFoot"><button class="btn ghost" data-pl-act="shuffle"' + (sum.questions > 1 ? '' : ' disabled') + ' title="I giochi restano al loro posto">🔀 MESCOLA SOLO LE DOMANDE</button></div></section></div>');
    body.innerHTML = h.join('');
  }

  /* ---------------- azioni ---------------- */
  function addKeys(keys) {
    if (!plan) newPlan();
    var all = candidates(), by = {};
    all.forEach(function (c) { by[c.key] = c; });
    var items = keys.map(function (k) { return by[k]; }).filter(Boolean).map(function (c) { return c.make(); });
    var r = SP.addItems(plan, items);
    keys.forEach(function (k) { delete checked[k]; });
    if (r.skipped) ctx.toast(r.skipped + (r.skipped === 1 ? ' contenuto era già' : ' contenuti erano già') + ' in scaletta: non duplicati (usa ⧉ per ripeterli di proposito).', 'warn');
    changed();
  }
  function onClick(e) {
    var t = e.target.closest('[data-pl-act],[data-pl-kind],[data-pl-add]');
    if (!t || t.disabled) return;
    if (t.dataset.plKind) { view.kind = t.dataset.plKind; view.topic = ''; view.difficulty = ''; render(); return; }
    if (t.dataset.plAdd) { addKeys([t.dataset.plAdd]); return; }
    var act = t.dataset.plAct, i = Number(t.dataset.i);
    if (act === 'new') { newPlan(); render(); var n = body.querySelector('[data-pl="name"]'); if (n) { n.focus(); n.select(); } return; }
    if (act === 'copy' && plan) { var c = JSON.parse(JSON.stringify(plan)), fresh = SP.createPlan(plan.name + ' (copia)'); c.id = fresh.id; c.name = fresh.name; c.createdAt = c.updatedAt = fresh.createdAt; plan = c; persist(); render(); ctx.toast('Scaletta duplicata.', 'ok'); return; }
    if (act === 'export' && plan) { ctx.download('scaletta_' + (plan.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'secchione') + '.json', SP.exportJSON(plan), 'application/json'); return; }
    if (act === 'remove' && plan) {
      if (!confirm('Eliminare la scaletta «' + plan.name + '»?\nDomande, giochi e pacchetti NON vengono toccati.')) return;
      ctx.savePlans(ctx.getPlans().filter(function (p) { return p.id !== plan.id; }));
      plan = null; render(); ctx.toast('Scaletta eliminata.', 'ok'); return;
    }
    if (!plan) return;
    if (act === 'addSel') { var have = inPlan(); addKeys(filtered(candidates()).filter(function (c) { return checked[c.key] && !have[c.key]; }).map(function (c) { return c.key; })); return; }
    if (act === 'addAll') { var have2 = inPlan(); addKeys(filtered(candidates()).filter(function (c) { return !have2[c.key]; }).slice(0, SP.LIMITS.items).map(function (c) { return c.key; })); return; }
    if (act === 'up') { SP.move(plan, i, i - 1); changed(); return; }
    if (act === 'down') { SP.move(plan, i, i + 1); changed(); return; }
    if (act === 'dup') { if (SP.duplicate(plan, i)) changed(); return; }
    if (act === 'del') { SP.remove(plan, i); changed(); return; }
    if (act === 'shuffle') { SP.shuffleQuestions(plan); changed(); ctx.toast('Domande mescolate: i giochi sono rimasti al loro posto.', 'ok'); return; }
    if (act === 'start') { persist(); if (ctx.startPlan(JSON.parse(JSON.stringify(plan)))) dlg.close(); return; }
  }
  function onChange(e) {
    var t = e.target;
    if (t.dataset.plPack) { view.packs[t.dataset.plPack] = t.checked; render(); return; }
    if (t.dataset.plCheck) { if (t.checked) checked[t.dataset.plCheck] = true; else delete checked[t.dataset.plCheck]; render(); return; }
    var k = t.dataset.pl;
    if (k === 'pick') { if (t.value) openPlan(t.value); else plan = null; render(); return; }
    if (k === 'name' && plan) { plan.name = t.value; if (plan.items.length || ctx.getPlans().some(function (p) { return p.id === plan.id; })) persist(); render(); return; }
    if (k === 'topic' || k === 'difficulty') { view[k] = t.value; render(); return; }
    if (k === 'import' && t.files && t.files[0]) {
      var f = t.files[0]; t.value = '';
      f.text().then(function (txt) {
        var r; try { r = SP.normalize(JSON.parse(txt)); } catch (err) { r = { ok: false, error: 'File non leggibile.' }; }
        if (!r.ok) { ctx.toast('Importazione non riuscita: ' + r.error, 'err'); return; }
        var p = r.plan, exists = ctx.getPlans().filter(function (x) { return x.id === p.id; })[0];
        if (exists && !confirm('Esiste già la scaletta «' + exists.name + '».\nOK = sostituiscila con quella del file · Annulla = importa come copia')) { var fresh = SP.createPlan(p.name + ' (importata)'); p.id = fresh.id; p.name = fresh.name; }
        plan = p; persist(); render();
        ctx.toast('Scaletta «' + p.name + '» importata' + (r.dropped ? ' (' + (r.dropped === 1 ? '1 elemento illeggibile scartato' : r.dropped + ' elementi illeggibili scartati') + ')' : '') + '.', r.dropped ? 'warn' : 'ok');
      });
    }
  }
  function onInput(e) {
    if (e.target.dataset.pl === 'search') {
      view.search = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var s = body.querySelector('[data-pl="search"]'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (err) { /* ignora */ } }
    }
  }
  /* trascina e rilascia (mouse); su tablet/tastiera restano ↑ ↓ */
  function onDragStart(e) { var li = e.target.closest && e.target.closest('.plItem'); if (!li) return; dragFrom = Number(li.dataset.plIdx); li.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (err) { /* ignora */ } }
  function onDragOver(e) { var li = e.target.closest && e.target.closest('.plItem'); if (!li || dragFrom < 0) return; e.preventDefault(); body.querySelectorAll('.plItem.dropTarget').forEach(function (x) { if (x !== li) x.classList.remove('dropTarget'); }); li.classList.add('dropTarget'); }
  function onDrop(e) { var li = e.target.closest && e.target.closest('.plItem'); if (!li || dragFrom < 0 || !plan) return; e.preventDefault(); var to = Number(li.dataset.plIdx), from = dragFrom; dragFrom = -1; if (SP.move(plan, from, to)) changed(); else render(); }
  function onDragEnd() { dragFrom = -1; if (body) body.querySelectorAll('.dragging,.dropTarget').forEach(function (x) { x.classList.remove('dragging', 'dropTarget'); }); }

  var Planner = {
    init: function (deps) {
      ctx = deps;
      dlg = document.getElementById('planDialog');
      body = document.getElementById('planBody');
      if (!dlg || !body) return;
      body.addEventListener('click', onClick);
      body.addEventListener('change', onChange);
      body.addEventListener('input', onInput);
      body.addEventListener('dragstart', onDragStart);
      body.addEventListener('dragover', onDragOver);
      body.addEventListener('drop', onDrop);
      body.addEventListener('dragend', onDragEnd);
      var close = document.getElementById('planClose');
      if (close) close.onclick = function () { dlg.close(); };
    },
    open: function (planId) {
      if (!dlg) return;
      parts = ctx.catalogParts();
      cat = SP.catalog(parts);
      view.packs = {};
      var active = ctx.getActivePacks();
      parts.forEach(function (p) { view.packs[p.pack.id] = active.indexOf(p.pack.id) >= 0; });
      var id = planId || (plan && plan.id) || (ctx.runningPlanId && ctx.runningPlanId()) || '';
      if (id) openPlan(id);
      if (!plan) { var list = ctx.getPlans(); if (list.length) openPlan(list[0].id); }
      if (plan) SP.packIds(plan).forEach(function (pid) { if (cat.packs[pid]) view.packs[pid] = true; });
      render();
      if (!dlg.open) dlg.showModal();
    },
    render: render
  };
  root.SecchionePlannerUI = Planner;
})(typeof self !== 'undefined' ? self : this);
