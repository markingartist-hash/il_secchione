/*
 * Il Secchione · schermata PACCHETTI della regia.
 * Elenco dei pack installati, IMPORTA (.zip/.json, anche trascinando il file), ATTIVA, DUPLICA, ESPORTA, ELIMINA,
 * selezione di più pack per una sessione mista. Non conosce il motore di gara: usa le funzioni passate da app.js.
 */
(function (root) {
  'use strict';
  var ctx = null;
  var dlg = null;
  var body = null;
  var list = [];
  var selected = {};
  var busy = false;
  var msg = null; // {kind: 'ok'|'err'|'info', html}

  var ORIGIN = { installato: 'del programma', preinstallato: 'del programma', 'migrato-v3': 'migrato dalla v3', importato: 'importato', 'convertito-v3': 'convertito da v3', copia: 'copia' };

  function esc(s) { return ctx.esc(s); }
  function setMsg(kind, html) { msg = { kind: kind, html: html }; render(); }
  function errorsHTML(r) {
    return '<ul>' + (r.errors || []).slice(0, 12).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
      ((r.warnings || []).length ? '<p class="help">' + r.warnings.slice(0, 5).map(esc).join('<br>') + '</p>' : '');
  }

  function refresh() {
    return ctx.client.load().then(function (r) {
      list = r.packs.slice().sort(function (a, b) { return String(a.summary.title).localeCompare(String(b.summary.title), 'it'); });
      return r;
    });
  }

  function gradeText(s) {
    if (s.gradeLabel) return s.gradeLabel;
    return s.grade ? s.grade + 'ª' : '—';
  }

  function row(p) {
    var s = p.summary;
    var active = ctx.getActive().indexOf(p.id) >= 0;
    var acts = [];
    if (p.ok) acts.push('<button class="btn tiny ' + (active && ctx.getActive().length === 1 ? 'green' : 'primary') + '" data-pk-act="activate" data-id="' + esc(p.id) + '">' + (active && ctx.getActive().length === 1 ? '● ATTIVO' : 'ATTIVA') + '</button>');
    if (p.ok) acts.push('<button class="btn tiny ghost" data-pk-act="duplicate" data-id="' + esc(p.id) + '">DUPLICA</button>');
    if (p.ok) acts.push('<button class="btn tiny ghost" data-pk-act="studio" data-id="' + esc(p.id) + '"' + (p.exportable ? '' : ' disabled title="Pacchetto del programma: per modificarlo avvia con AVVIA_IL_SECCHIONE.bat"') + '>MODIFICA</button>');
    acts.push('<button class="btn tiny ghost" data-pk-act="export" data-id="' + esc(p.id) + '"' + (p.exportable ? '' : ' title="Pacchetto del programma: per esportarlo avvia con AVVIA_IL_SECCHIONE.bat"') + '>ESPORTA</button>');
    acts.push('<button class="btn tiny red" data-pk-act="remove" data-id="' + esc(p.id) + '"' + (p.removable ? '' : ' title="Pacchetto del programma: si elimina con il server attivo"') + '>ELIMINA</button>');
    var where = p.storage === 'browser' || p.storage === 'memoria' ? ' · salvato nel browser' : '';
    return '<tr class="' + (active ? 'isActive' : '') + (p.ok ? '' : ' isBroken') + '">' +
      '<td class="pkSel">' + (p.ok ? '<input type="checkbox" aria-label="Usa ' + esc(s.title) + ' nella sessione" data-pk-sel="' + esc(p.id) + '"' + (selected[p.id] ? ' checked' : '') + '>' : '') + '</td>' +
      '<td class="pkTitle"><b>' + esc(s.title) + '</b>' + (active ? ' <span class="pkPill">IN GARA</span>' : '') +
        '<small>' + esc([s.subtitle, ORIGIN[s.origin] || s.origin, s.author].filter(Boolean).join(' · ')) + where + '</small>' +
        (p.ok ? '' : '<small class="bad">Non valido: ' + esc((p.errors || [])[0] || '') + '</small>') + '</td>' +
      '<td>' + esc(s.subject || '—') + '</td>' +
      '<td>' + esc(gradeText(s)) + '</td>' +
      '<td class="n">' + esc(s.version || '—') + '</td>' +
      '<td class="n">' + (s.questions != null ? s.questions : '—') + '</td>' +
      '<td class="n">' + (s.games != null ? s.games : '—') + '</td>' +
      '<td class="pkActs">' + acts.join('') + '</td></tr>';
  }

  function render() {
    if (!body || !dlg.open) return;
    var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
    body.innerHTML =
      '<div class="pkTop"><label class="btn green fileLabel pkImport">⬆ IMPORTA PACCHETTO (.zip)<input type="file" id="pkFile" accept=".zip,.json,application/zip,application/json" multiple></label>' +
      '<span class="pkDrop">oppure <b>trascina qui</b> il file .zip del pacchetto</span>' +
      '<button class="btn primary pkImport" data-pk-act="studio" data-id="">✏ PACK STUDIO <small>crea o modifica un pacchetto</small></button></div>' +
      '<p class="help pkWhere">' + esc(ctx.client.description()) + '</p>' +
      (busy ? '<div class="pkMsg info">Operazione in corso…</div>' : msg ? '<div class="pkMsg ' + msg.kind + '">' + msg.html + '</div>' : '') +
      '<div class="pkTableWrap"><table class="pkTable"><thead><tr><th title="Usa nella sessione mista">In gara</th><th>Pacchetto</th><th>Materia</th><th>Classe</th><th>Versione</th><th>Domande</th><th>Giochi</th><th>Azioni</th></tr></thead><tbody>' +
      (list.map(row).join('') || '<tr><td colspan="8" class="help">Nessun pacchetto.</td></tr>') + '</tbody></table></div>' +
      '<div class="pkMix"><span>Selezionati: <b>' + ids.length + '</b></span>' +
      '<label class="checkRow"><input type="checkbox" id="pkShuffle"' + (ctx.getShuffle() ? ' checked' : '') + '> mescola le domande</label>' +
      '<button class="btn primary" id="pkUseSelected"' + (ids.length ? '' : ' disabled') + '>▶ USA I SELEZIONATI' + (ids.length > 1 ? ' (sessione mista)' : '') + '</button></div>' +
      '<p class="help">Cambiare pacchetto <b>non</b> cambia le squadre e non azzera la partita: punti e risposte restano, e ogni risposta conserva il pacchetto da cui proviene. Per ripartire da zero usa NUOVA PARTITA. ' +
      'Nella sessione mista le domande dei pacchetti scelti si susseguono (o si mescolano) e i giochi di tutti i pacchetti sono disponibili.</p>';
  }

  function withBusy(promise) {
    busy = true;
    msg = null;
    render();
    return promise.then(function (r) { busy = false; return r; }, function (e) { busy = false; setMsg('err', esc(e.message || String(e))); throw e; });
  }

  function afterChange() {
    return ctx.onLibraryChanged().then(refresh).then(render);
  }

  function importFiles(files) {
    var arr = Array.prototype.slice.call(files || []).filter(function (f) { return /\.(zip|json)$/i.test(f.name); });
    if (!arr.length) { setMsg('err', 'Scegli un file <b>.zip</b> (o .json) di un pacchetto del Secchione.'); return Promise.resolve(); }
    var results = [];
    var chain = Promise.resolve();
    arr.forEach(function (f) {
      chain = chain.then(function () { return ctx.client.importFile(f).then(function (r) { results.push({ file: f.name, r: r }); }); });
    });
    return withBusy(chain).then(afterChange).then(function () {
      var html = results.map(function (x) {
        var r = x.r || {};
        if (r.action === 'installed') {
          return '<p class="good">✓ <b>' + esc(x.file) + '</b>: installato «' + esc(r.summary.title) + '» (' + r.summary.questions + ' domande, ' + r.summary.games + ' manche' + (r.summary.subject ? ', ' + esc(r.summary.subject) : '') + ').' +
            (r.renamedFrom ? '<br>Esisteva già un pacchetto con id «' + esc(r.renamedFrom) + '»: è rimasto invariato, il nuovo ha id «' + esc(r.id) + '».' : '') +
            ' <button class="btn tiny primary" data-pk-act="activate" data-id="' + esc(r.id) + '">ATTIVA ORA</button></p>' + errorsHTML({ warnings: r.warnings });
        }
        if (r.action === 'already-installed') return '<p>= <b>' + esc(x.file) + '</b>: questo pacchetto è già installato (id «' + esc(r.id) + '»). Nessuna modifica.</p>';
        return '<p class="bad">✗ <b>' + esc(x.file) + '</b>: non importato.</p>' + errorsHTML(r);
      }).join('');
      setMsg(results.some(function (x) { return !x.r || !x.r.ok; }) ? 'err' : 'ok', html);
    });
  }

  function onClick(e) {
    var b = e.target.closest('[data-pk-act]');
    if (b && !busy) {
      var id = b.getAttribute('data-id');
      var act = b.getAttribute('data-pk-act');
      var p = list.filter(function (x) { return x.id === id; })[0];
      var title = p ? p.summary.title : id;
      if (act === 'activate') {
        var res = ctx.activate([id], { shuffle: false });
        if (res && res.ok) { selected = {}; selected[id] = true; setMsg('ok', '● «' + esc(title) + '» è il pacchetto attivo. Squadre e punteggi sono rimasti.'); }
        else setMsg('err', esc((res && res.error) || 'Impossibile cambiare pacchetto adesso.'));
        return;
      }
      if (act === 'studio') {
        openStudio(id);
        return;
      }
      if (act === 'duplicate') {
        withBusy(ctx.client.duplicate(id)).then(function (r) {
          if (!r.ok) return setMsg('err', 'Duplicazione non riuscita.' + errorsHTML(r));
          return afterChange().then(function () { setMsg('ok', '✓ Creata la copia «' + esc(r.summary.title) + '» (id «' + esc(r.id) + '»): è indipendente dall\'originale e si può modificare.' + (r.sharedImages ? '<br>La copia usa le immagini dell\'originale.' : '')); });
        });
        return;
      }
      if (act === 'export') {
        withBusy(ctx.client.exportZip(id)).then(function (r) {
          if (!r.ok) return setMsg('err', 'Esportazione non riuscita.' + errorsHTML(r));
          ctx.download(r.filename, r.blob);
          setMsg('ok', '✓ Esportato <b>' + esc(r.filename) + '</b>: è un pacchetto completo (domande, giochi e immagini) da condividere o reimportare.' + errorsHTML({ warnings: r.warnings }));
        });
        return;
      }
      if (act === 'remove') {
        if (ctx.getActive().indexOf(id) >= 0) return setMsg('err', '«' + esc(title) + '» è in gara adesso: attiva prima altri pacchetti, poi eliminalo.');
        if (!confirm('Eliminare il pacchetto «' + title + '»?\n' + (p && p.storage === 'disco' ? 'Verrà spostato nel cestino (cartella data/cestino_pacchetti) e potrà essere recuperato.' : 'Verrà eliminato da questo browser: esportalo prima se vuoi conservarne una copia.'))) return;
        withBusy(ctx.client.remove(id)).then(function (r) {
          if (!r.ok) return setMsg('err', 'Eliminazione non riuscita.' + errorsHTML(r));
          delete selected[id];
          return afterChange().then(function () { setMsg('ok', '✓ «' + esc(title) + '» eliminato.'); });
        });
      }
      return;
    }
    if (e.target.id === 'pkUseSelected') {
      var ids = list.map(function (x) { return x.id; }).filter(function (k) { return selected[k]; });
      var r2 = ctx.activate(ids, { shuffle: !!(document.getElementById('pkShuffle') || {}).checked });
      if (r2 && r2.ok) setMsg('ok', ids.length > 1 ? '● Sessione mista con ' + ids.length + ' pacchetti: ' + ids.map(function (k) { var q = list.filter(function (x) { return x.id === k; })[0]; return '«' + esc(q ? q.summary.title : k) + '»'; }).join(', ') + '.' : '● Pacchetto attivato.');
      else setMsg('err', esc((r2 && r2.error) || 'Impossibile cambiare pacchetto adesso.'));
    }
  }

  function onChange(e) {
    if (e.target.id === 'pkFile') { importFiles(e.target.files); e.target.value = ''; return; }
    var s = e.target.getAttribute && e.target.getAttribute('data-pk-sel');
    if (s) { selected[s] = e.target.checked; render(); }
    if (e.target.id === 'pkShuffle') ctx.setShuffle(e.target.checked);
  }

  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }

  /* ---------------- Pack Studio (editor dei pacchetti, pagina studio.html) ---------------- */
  function openStudio(id) {
    var url = 'studio.html' + (id ? '?pack=' + encodeURIComponent(id) : '');
    var w = null;
    try { w = root.open(url, 'secchione-pack-studio'); } catch (e) { w = null; }
    if (w) { try { w.focus(); } catch (e) { /* ignora */ } }
    else setMsg('err', 'Il browser ha bloccato la nuova finestra: consenti le finestre pop-up per il Secchione, oppure apri <code>studio.html</code> dalla cartella del programma.');
  }
  var lastStudioSave = 0;
  /** Lo Studio ha salvato un pacchetto: aggiorna la libreria senza toccare la partita in corso. */
  function onStudioSaved(m) {
    if (!m || m.type !== 'pack-saved' || !m.at || m.at === lastStudioSave) return;
    lastStudioSave = m.at;
    // il pacchetto salvato è la copia di lavoro: niente archivio/giochi personalizzati di questa regia che lo coprano
    if (ctx.dropOverrides) ctx.dropOverrides(m.id);
    ctx.onLibraryChanged().then(function () {
      if (dlg && dlg.open) return refresh().then(render);
      return null;
    }).then(function () {
      var p = list.filter(function (x) { return x.id === m.id; })[0];
      var title = p ? p.summary.title : m.id;
      if (ctx.getActive().indexOf(m.id) >= 0) ctx.toast('«' + title + '» aggiornato da Pack Studio: per usare la nuova versione apri 📦 PACCHETTI e premi ATTIVA (squadre e punti restano).');
      else ctx.toast('«' + title + '» salvato da Pack Studio: lo trovi in 📦 PACCHETTI.');
    }, function () { /* la libreria verrà riletta alla prossima apertura */ });
  }
  function listenStudio() {
    try {
      var bc = new root.BroadcastChannel('secchione-packs');
      bc.onmessage = function (e) { onStudioSaved(e.data); };
    } catch (e) { /* BroadcastChannel non disponibile: resta l'evento storage */ }
    root.addEventListener('storage', function (e) {
      if (e.key !== 'secchione-pack-saved' || !e.newValue) return;
      try { onStudioSaved(JSON.parse(e.newValue)); } catch (x) { /* ignora */ }
    });
  }

  var UI = {
    init: function (c) {
      ctx = c;
      dlg = document.getElementById('packsDialog');
      body = document.getElementById('packsBody');
      if (!dlg || !body) return;
      body.addEventListener('click', onClick);
      body.addEventListener('change', onChange);
      var closeBtn = document.getElementById('packsClose');
      if (closeBtn) closeBtn.onclick = function () { dlg.close(); };
      listenStudio();
      // trascinare un .zip in qualunque punto della regia apre i Pacchetti e lo importa
      document.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); document.body.classList.add('pkDragging'); } });
      document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) document.body.classList.remove('pkDragging'); });
      document.addEventListener('drop', function (e) {
        document.body.classList.remove('pkDragging');
        if (!hasFiles(e)) return;
        e.preventDefault();
        var files = e.dataTransfer.files;
        // v3.7.3: un solo file va a IMPORTA CONTENUTI, che riconosce domande, giochi, scalette e pacchetti
        if (ctx.importContent && files.length === 1) { ctx.importContent(files[0]); return; }
        UI.open().then(function () { return importFiles(files); });
      });
    },
    open: function () {
      if (!dlg) return Promise.resolve();
      selected = {};
      ctx.getActive().forEach(function (id) { selected[id] = true; });
      if (!dlg.open) dlg.showModal();
      msg = msg && msg.kind === 'info' ? null : msg;
      busy = true;
      render();
      return refresh().then(function () { busy = false; render(); }, function (e) { busy = false; setMsg('err', esc(e.message)); });
    },
    render: render,
    list: function () { return list; }
  };
  root.SecchionePacksUI = UI;
})(typeof self !== 'undefined' ? self : this);
