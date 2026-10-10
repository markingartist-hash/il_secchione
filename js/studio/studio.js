/*
 * Il Secchione · PACK STUDIO — editor grafico dei pacchetti per docenti (nessun JSON da scrivere a mano).
 * Modello e regole: js/engine/packstudio.js (funzioni pure, coperte da tests/packstudio.test.js).
 * Libreria: js/host/packs-client.js (cartella packs/ con il server locale, altrimenti archivio del browser).
 * Bozze: js/studio/drafts.js (salvataggio automatico nel browser mentre si lavora).
 * Dopo un salvataggio avvisa la regia aperta (BroadcastChannel + evento storage) che aggiorna l'elenco pacchetti.
 * ES5 + Promise.
 */
(function (root) {
  'use strict';
  var PS = root.SecchionePackStudio;
  var READ = root.SecchioneReadability;
  var PL = root.SecchionePackLib;
  var client = root.SecchionePacksClient;
  var Drafts = root.SecchioneStudioDrafts;
  var doc = root.document;

  var LOGO = 'assets/logo_clean.svg';
  var MASCOT = 'assets/mascot/secchione_a.png';
  var MAX_SIDE = 1920;
  var DIFF = ['', '1 · molto facile', '2 · facile', '3 · media', '4 · difficile', '5 · molto difficile'];
  var STATUS = [['approved', 'Approvata: va in gara'], ['draft', 'Bozza: non va in gara'], ['review', 'Da rivedere: non va in gara']];
  var TABS = [['info', 'Informazioni'], ['questions', 'Domande'], ['games', 'Manche speciali'], ['images', 'Immagini'], ['check', 'Controllo e salvataggio']];
  var GAME_HELP = {
    photopuzzle: 'Un\'immagine coperta da tessere che si scoprono poco a poco: le squadre devono riconoscerla.',
    indovina: 'Gli indizi compaiono uno alla volta: le squadre scelgono la soluzione tra le alternative.',
    abbinamenti: 'Quattro immagini e quattro termini da abbinare: in gara i termini vengono mescolati.',
    ghigliottina: 'Cinque coppie di parole: in ogni coppia una sola parola è collegata alla parola finale da indovinare.',
    chain: 'Una catena di parole: ogni parola è collegata alla successiva.'
  };
  var PREFS_KEY = 'secchione-studio-prefs';
  var REGIA_PREFS_KEY = 'il-secchione-v35-prefs'; // preferenze della regia (js/host/store.js)
  var REGIA_GAMES = (root.SecchionePackEngine && root.SecchionePackEngine.EDITABLE_GAMES) || ['chain', 'indovina', 'ghigliottina'];

  var app = doc.getElementById('studioApp');
  var S = {
    view: 'start', tab: 'info', draft: null, draftId: null, q: 0, g: null,
    seq: 0, libSeq: -1, zipSeq: -1, contentChanged: false, idAuto: false,
    autoBump: true, shrink: true, check: null, msg: null, startMsg: null, busy: false,
    preview: 'question', filter: '', library: null, libraryError: null, drafts: [], persistent: true,
    autoAt: null, autoErr: null, autoTimer: null, autoP: null, checkTimer: null
  };
  var urls = {}; // nome immagine → {url, bytes}

  /* ---------------- utilità ---------------- */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function $(sel) { return app.querySelector(sel); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function fmtBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function fmtWhen(v) {
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('it-IT') + ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function readFileBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(r.error || new Error('lettura del file non riuscita')); };
      r.readAsArrayBuffer(file);
    });
  }
  function mimeOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name);
    return (m && PL.IMAGE_TYPES[m[1].toLowerCase()]) || 'application/octet-stream';
  }
  function download(name, bytes) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    var a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }
  function loadPrefs() {
    try {
      var p = JSON.parse(root.localStorage.getItem(PREFS_KEY) || '{}');
      if (typeof p.autoBump === 'boolean') S.autoBump = p.autoBump;
      if (typeof p.shrink === 'boolean') S.shrink = p.shrink;
    } catch (e) { /* preferenze non disponibili */ }
  }
  function savePrefs() { try { root.localStorage.setItem(PREFS_KEY, JSON.stringify({ autoBump: S.autoBump, shrink: S.shrink })); } catch (e) { /* ignora */ } }
  function unsaved() { return !!S.draft && S.seq !== S.libSeq && S.seq !== S.zipSeq; }

  /*
   * Unica fonte: il pacchetto installato. La regia di questo browser può avere copie personalizzate di un pacchetto
   * (Archivio domande, editor dei giochi) che il gioco usa al posto del pacchetto. All'apertura lo Studio parte da
   * quelle copie (cioè da ciò che il gioco usa davvero); dopo il salvataggio le elimina, così il gioco usa il pacchetto salvato.
   */
  function regiaPrefs() {
    try { var p = JSON.parse(root.localStorage.getItem(REGIA_PREFS_KEY) || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch (e) { return {}; }
  }
  function includeRegiaOverrides(d, id) {
    var p = regiaPrefs();
    var done = [];
    var qs = p.banks && Array.isArray(p.banks[id]) && p.banks[id].length ? p.banks[id] : null;
    if (qs) {
      d.questions = JSON.parse(JSON.stringify(qs)).map(function (q) { delete q.source; return q; });
      done.push('domande dell\'Archivio');
    }
    var gs = p.games && p.games[id] && typeof p.games[id] === 'object' ? p.games[id] : null;
    if (gs) {
      REGIA_GAMES.forEach(function (t) { if (Array.isArray(gs[t]) && gs[t].length) d.games[t] = JSON.parse(JSON.stringify(gs[t])); });
      done.push('giochi modificati nella regia');
    }
    // eventuali immagini incorporate dall'editor della regia diventano file in images/
    if (done.length) PL.extractInlineImages({ questions: d.questions, games: d.games, theme: {} }, d.images);
    return done;
  }
  function clearRegiaOverrides(id) {
    var p = regiaPrefs();
    var changedPrefs = false;
    if (p.banks && p.banks[id]) { delete p.banks[id]; changedPrefs = true; }
    if (p.games && p.games[id]) { delete p.games[id]; changedPrefs = true; }
    if (!changedPrefs) return false;
    var json = JSON.stringify(p);
    try { root.localStorage.setItem(REGIA_PREFS_KEY, json); } catch (e) { return false; }
    if (client.mode === 'server') {
      // stessa copia di sicurezza che la regia tiene sul server (data/prefs.json)
      var meta = doc.querySelector('meta[name="secchione-host-key"]');
      try { root.fetch('/api/host/prefs', { method: 'PUT', body: json, headers: { 'X-Secchione-Host': meta ? meta.getAttribute('content') : '' } }).catch(function () { return null; }); } catch (e) { /* ignora */ }
    }
    return true;
  }

  /* ---------------- immagini ---------------- */
  function imgURL(name) {
    var d = S.draft;
    if (!name || !d || !d.images[name]) return '';
    var c = urls[name];
    if (c && c.bytes === d.images[name]) return c.url;
    if (c) URL.revokeObjectURL(c.url);
    var url = URL.createObjectURL(new Blob([d.images[name]], { type: mimeOf(name) }));
    urls[name] = { url: url, bytes: d.images[name] };
    return url;
  }
  function dropURL(name) { if (urls[name]) { URL.revokeObjectURL(urls[name].url); delete urls[name]; } }
  function dropURLs() { Object.keys(urls).forEach(dropURL); }

  /** Riduce le foto molto grandi (lato massimo MAX_SIDE) se l'opzione è attiva e il risultato è più leggero. */
  function shrinkImage(bytes) {
    var ext = PS.detectImageExt(bytes);
    var canvas = doc.createElement('canvas');
    if (!S.shrink || !ext || ext === 'gif' || typeof canvas.toBlob !== 'function') return Promise.resolve({ bytes: bytes });
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(new Blob([bytes], { type: mimeOf('x.' + ext) }));
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        var k = MAX_SIDE / Math.max(w, h);
        URL.revokeObjectURL(url);
        if (!(k < 1)) { resolve({ bytes: bytes }); return; }
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        var g = canvas.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        var type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        canvas.toBlob(function (blob) {
          if (!blob) { resolve({ bytes: bytes }); return; }
          readFileBytes(blob).then(function (out) {
            if (out.length >= bytes.length || !PS.detectImageExt(out)) resolve({ bytes: bytes });
            else resolve({ bytes: out, resized: true });
          }, function () { resolve({ bytes: bytes }); });
        }, type, 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve({ bytes: bytes }); };
      img.src = url;
    });
  }

  function addFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    var out = { added: [], problems: [], resized: 0 };
    var chain = Promise.resolve();
    list.forEach(function (f) {
      chain = chain.then(function () { return readFileBytes(f); }).then(function (bytes) {
        if (!PS.detectImageExt(bytes)) { out.problems.push('«' + f.name + '» non è un\'immagine JPG, PNG, WEBP o GIF'); return null; }
        return shrinkImage(bytes).then(function (r) {
          var res = PS.addImage(S.draft, f.name, r.bytes);
          if (res.ok) { out.added.push(res.name); if (r.resized) out.resized++; } else out.problems.push(res.error);
        });
      }).catch(function (e) { out.problems.push('«' + f.name + '»: ' + e.message); });
    });
    return chain.then(function () { return out; });
  }

  /* ---------------- campi collegati al modello (data-bind="percorso[:tipo]") ---------------- */
  function curGame() { return S.g && S.draft.games[S.g.type] ? S.draft.games[S.g.type][S.g.index] : null; }
  function baseFor(prefix) {
    if (prefix === 'm') return S.draft.manifest;
    if (prefix === 'q') return S.draft.questions[S.q];
    if (prefix === 'g') return curGame();
    return null;
  }
  function getPath(path) {
    var parts = path.split('.');
    var o = baseFor(parts.shift());
    while (o != null && parts.length) o = o[parts.shift()];
    return o;
  }
  function setPath(path, value) {
    var parts = path.split('.');
    var o = baseFor(parts.shift());
    if (!o) return;
    while (parts.length > 1) {
      var k = parts.shift();
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(parts[0]) ? [] : {};
      o = o[k];
    }
    o[parts[0]] = value;
  }
  function coerce(kind, raw) {
    if (kind === 'int') { var n = parseInt(raw, 10); return isFinite(n) ? n : ''; }
    if (kind === 'grade') { var g = parseInt(raw, 10); return isFinite(g) ? g : null; }
    if (kind === 'tags') return PS.parseTags(raw);
    return String(raw);
  }
  function apply(el) {
    var spec = el.getAttribute('data-bind');
    var c = spec.indexOf(':');
    var path = c > 0 ? spec.slice(0, c) : spec;
    var value = coerce(c > 0 ? spec.slice(c + 1) : 'str', el.value);
    var g = curGame();
    var m = /^g\.candidates\.(\d+)$/.exec(path);
    var followSubject = false;
    if (m && S.g.type === 'indovina' && g && g.subject) {
      followSubject = String((g.candidates || [])[Number(m[1])] || '').trim().toLowerCase() === String(g.subject).trim().toLowerCase();
    }
    setPath(path, value);
    if (followSubject) g.subject = String(value).trim();
    if (path === 'm.id') S.idAuto = false;
    if (path === 'm.title' && S.idAuto) {
      var taken = (S.library || []).map(function (p) { return p.id; });
      S.draft.manifest.id = PL.uniqueId(PL.slug(value), taken);
      var idField = doc.getElementById('f-id');
      if (idField) idField.value = S.draft.manifest.id;
    }
    changed(path, el);
  }

  /* ---------------- aggiornamenti dopo una modifica ---------------- */
  function changed(path, el) {
    S.seq++;
    if (path !== 'm.version') S.contentChanged = true;
    if (el && el.maxLength > 0) {
      var counter = el.parentNode.querySelector('.stCount');
      if (counter) counter.textContent = el.value.length + '/' + el.maxLength;
    }
    if (/^q\./.test(path)) {
      var row = $('[data-qrow="' + S.q + '"]');
      if (row) row.outerHTML = qRowHTML(S.draft.questions[S.q], S.q);
    }
    if (/^g\./.test(path) && S.g) {
      var grow = $('[data-grow="' + S.g.type + ':' + S.g.index + '"]');
      if (grow) grow.outerHTML = gRowHTML(S.g.type, curGame(), S.g.index);
    }
    paintBar();
    renderPreview();
    scheduleAutosave();
    scheduleCheck();
  }
  /** Modifica strutturale (aggiunte, eliminazioni, spostamenti): ridisegna la scheda. */
  function structural(versionOnly) {
    S.seq++;
    if (!versionOnly) S.contentChanged = true;
    S.check = PS.validate(S.draft);
    renderPanel();
    paintBar();
    paintBadges();
    scheduleAutosave();
  }
  function scheduleCheck() {
    clearTimeout(S.checkTimer);
    S.checkTimer = setTimeout(function () { S.check = PS.validate(S.draft); paintBadges(); }, 350);
  }
  function scheduleAutosave() {
    clearTimeout(S.autoTimer);
    S.autoTimer = setTimeout(autosave, 900);
  }
  function autosave() {
    clearTimeout(S.autoTimer);
    S.autoTimer = null;
    if (!S.draft) return Promise.resolve();
    var d = S.draft;
    d.origin.studio = { unsaved: unsaved(), contentChanged: S.contentChanged, idAuto: S.idAuto };
    S.autoP = Drafts.save(S.draftId, d).then(function () {
      if (S.draft !== d) return;
      S.autoAt = new Date();
      S.autoErr = null;
      paintBar();
    }, function (e) {
      if (S.draft !== d) return;
      S.autoErr = e.message || String(e);
      paintBar();
    });
    return S.autoP;
  }
  /** Elimina la bozza dopo un eventuale salvataggio automatico ancora in corso (così non ricompare). */
  function dropDraft(id) {
    clearTimeout(S.autoTimer);
    S.autoTimer = null;
    return Promise.resolve(S.autoP).then(function () { return Drafts.remove(id); }).catch(function () { return null; });
  }

  /* ---------------- problemi segnalati dalla validazione ---------------- */
  function issues(kind, index, type) {
    var c = S.check;
    var out = { errors: [], warnings: [] };
    if (!c) return out;
    function match(x) { return x.where.kind === kind && (index == null || x.where.index === index) && (!type || x.where.type === type); }
    out.errors = c.errors.filter(match);
    out.warnings = c.warnings.filter(match);
    return out;
  }
  function hasIssue(kind, index, type) { return issues(kind, index, type).errors.length > 0; }
  function editorIssuesHTML() {
    var x = S.tab === 'info' ? issues('manifest') : S.tab === 'questions' ? issues('question', S.q) : S.tab === 'games' && S.g ? issues('game', S.g.index, S.g.type) : null;
    if (!x || (!x.errors.length && !x.warnings.length)) return '';
    return x.errors.map(function (e) { return '<p class="bad">✗ ' + esc(cap(e.message)) + '</p>'; }).join('') +
      x.warnings.map(function (w) { return '<p class="warn">⚠ ' + esc(cap(w.message)) + '</p>'; }).join('');
  }
  function whereLabel(w) {
    if (w.kind === 'question') return 'Domanda ' + (w.index + 1) + ':';
    if (w.kind === 'game') return PS.GAME_LABELS[w.type] + ' ' + (w.index + 1) + ':';
    if (w.kind === 'manifest') return 'Informazioni:';
    if (w.kind === 'image') return 'Immagini:';
    if (w.kind === 'questions') return 'Domande:';
    return 'Pacchetto:';
  }

  /* ---------------- pezzi di interfaccia ---------------- */
  function field(label, control, help) {
    return '<label class="stField"><span>' + label + '</span>' + control + (help ? '<small class="stHelp">' + help + '</small>' : '') + '</label>';
  }
  function input(path, value, max, ph, list, id) {
    var v = value == null ? '' : String(value);
    return '<span class="stInputWrap"><input class="control" data-bind="' + path + '" value="' + esc(v) + '"' + (max ? ' maxlength="' + max + '"' : '') +
      (ph ? ' placeholder="' + esc(ph) + '"' : '') + (list ? ' list="' + list + '"' : '') + (id ? ' id="' + id + '"' : '') + '></span>';
  }
  function textarea(path, value, max, rows, ph, cls) {
    var v = value == null ? '' : String(value);
    return '<span class="stInputWrap"><textarea class="control' + (cls ? ' ' + cls : '') + '" rows="' + rows + '" maxlength="' + max + '" data-bind="' + path + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>' + esc(v) + '</textarea>' +
      '<small class="stCount">' + v.length + '/' + max + '</small></span>';
  }
  function gradeName(g) { return g <= 5 ? g + 'ª primaria' : g <= 8 ? (g - 5) + 'ª secondaria di I grado' : (g - 8) + 'ª secondaria di II grado'; }
  function gradeOptions(sel) {
    var o = '<option value="">—</option>';
    for (var g = 1; g <= 13; g++) o += '<option value="' + g + '"' + (Number(sel) === g ? ' selected' : '') + '>' + gradeName(g) + '</option>';
    return o;
  }
  function colorOr(c, d) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : d; }
  function msgHTML(m) { return m ? '<div class="pkMsg ' + m.kind + '" role="status">' + m.html + '</div>' : ''; }
  function setMsg(kind, html) { S.msg = html ? { kind: kind, html: html } : null; paintMsg(); }
  function paintMsg() { var box = doc.getElementById('stMsg'); if (box) box.innerHTML = msgHTML(S.msg); }
  function setBusy(on, text) {
    S.busy = !!on;
    var b = doc.getElementById('stBusy');
    if (!b) return;
    b.hidden = !on;
    b.querySelector('span').textContent = text || 'Attendere…';
  }

  function imagePicker(path, value) {
    var names = Object.keys(S.draft.images).sort();
    var url = imgURL(value);
    var missing = value && !S.draft.images[value];
    return '<div class="stPicker" data-path="' + path + '">' +
      '<div class="stThumb">' + (url ? '<img src="' + url + '" alt="">' : missing ? '<span class="bad">immagine mancante<br>' + esc(value) + '</span>' : '<span>nessuna immagine</span>') + '</div>' +
      '<div class="stPickerCtl"><select class="control" data-bind="' + path + '" aria-label="Scegli un\'immagine del pacchetto"><option value="">— nessuna immagine —</option>' +
      names.map(function (n) { return '<option value="' + esc(n) + '"' + (n === value ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') +
      (missing ? '<option value="' + esc(value) + '" selected>' + esc(value) + ' (mancante)</option>' : '') + '</select>' +
      '<span class="stPickerBtns"><label class="btn primary fileLabel">⬆ CARICA DAL PC<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="' + path + '"></label>' +
      (value ? '<button class="btn ghost" data-act="clear-img" data-path="' + path + '">TOGLI</button>' : '') + '</span>' +
      '<small class="stHelp">Puoi anche trascinare qui un\'immagine.</small></div></div>';
  }

  function headerHTML(middle, right) {
    return '<header class="stHeader"><div class="stBrand"><img src="' + LOGO + '" alt="Il Secchione" width="110"><div><small>IL SECCHIONE</small><strong>PACK STUDIO</strong></div></div>' +
      (middle || '<div></div>') + '<div class="stBarBtns">' + (right || '') + '</div></header>';
  }

  /* ---------------- schermata iniziale ---------------- */
  function libRow(p) {
    var s = p.summary || {};
    var can = p.ok && p.exportable;
    var why = !p.ok ? 'Pacchetto non valido: ' + ((p.errors || [])[0] || '') : !p.exportable ? 'Pacchetto del programma: per modificarlo avvia il Secchione con AVVIA_IL_SECCHIONE.bat.' : '';
    var total = s.questionsTotal != null ? s.questionsTotal : (s.questions || 0);
    return '<div class="stLibRow"><div><b>' + esc(s.title || p.id) + '</b><small>' + esc([s.subject, s.version ? 'v' + s.version : '', plural(total, 'domanda', 'domande'), plural(s.games || 0, 'manche', 'manche')].filter(Boolean).join(' · ')) + '</small>' +
      (why ? '<small class="stWhy">' + esc(why) + '</small>' : '') + '</div>' +
      '<button class="btn ' + (can ? 'primary' : 'ghost') + '" data-act="open-lib" data-id="' + esc(p.id) + '"' + (can ? '' : ' disabled') + '>MODIFICA</button></div>';
  }
  function draftRow(d) {
    return '<div class="stLibRow"><div><b>' + esc(d.title) + '</b><small>' + esc(['v' + d.version, plural(d.questions, 'domanda', 'domande'), plural(d.games, 'manche', 'manche'), 'ultima modifica il ' + fmtWhen(d.updatedAt)].join(' · ')) + '</small>' +
      (d.libraryId ? '<small>Modifiche al pacchetto «' + esc(d.libraryId) + '» non ancora salvate nella libreria</small>' : '<small>Non ancora salvato nella libreria</small>') + '</div>' +
      '<span class="stRowBtns"><button class="btn green" data-act="resume" data-id="' + esc(d.id) + '">RIPRENDI</button>' +
      '<button class="btn red tiny" data-act="draft-del" data-id="' + esc(d.id) + '" title="Elimina la bozza" aria-label="Elimina la bozza">✕</button></span></div>';
  }
  function startHTML() {
    var lib = S.library;
    var libRows = S.libraryError ? '<p class="bad">' + esc(S.libraryError) + '</p>' : lib == null ? '<p class="help">Caricamento della libreria…</p>' :
      lib.length ? '<div class="stLibList">' + lib.map(libRow).join('') + '</div>' : '<p class="help">La libreria è vuota.</p>';
    var drafts = S.drafts.length ? '<div class="stLibList">' + S.drafts.map(draftRow).join('') + '</div>' :
      '<p class="help">Nessuna bozza in corso. Mentre lavori, le modifiche vengono salvate automaticamente in questo browser.</p>';
    return headerHTML('<div class="stDoc"><b>Crea e modifica i pacchetti di domande</b><span>Senza scrivere file: tutto con moduli e pulsanti.</span></div>', '<button class="btn ghost" data-act="back">↩ TORNA ALLA REGIA</button>') +
      '<main class="stStart">' + (S.startMsg ? msgHTML(S.startMsg) : '') +
      '<div class="stStartGrid">' +
      '<section class="stCard stCardNew"><h2>➕ Nuovo pacchetto</h2><form id="stNewForm" class="stForm" autocomplete="off">' +
        field('Titolo del pacchetto *', '<input class="control" name="title" maxlength="60" required placeholder="es. Le capitali d’Europa">') +
        '<div class="stRow2">' + field('Materia', '<input class="control" name="subject" maxlength="60" placeholder="es. Geografia">') +
        field('Classe', '<select class="control" name="grade">' + gradeOptions(null) + '</select>') + '</div>' +
        field('Autore', '<input class="control" name="author" maxlength="80" placeholder="Nome del docente">') +
        '<button class="btn green xl" type="submit">CREA IL PACCHETTO</button></form></section>' +
      '<section class="stCard"><h2>🕘 Bozze in corso</h2>' + (S.persistent ? '' : '<p class="bad">Questo browser non permette di conservare le bozze: chiudendo la pagina le modifiche non salvate andranno perse.</p>') + drafts +
      '<h2 class="top16">📂 Apri un file .zip</h2><p class="help">Un pacchetto ricevuto da un collega o esportato in precedenza (anche le vecchie edizioni v3). Il file non viene modificato: dopo le modifiche lo salvi nella libreria o lo esporti di nuovo.</p>' +
        '<label class="btn primary fileLabel xl">SCEGLI IL FILE .ZIP<input type="file" id="stOpenFile" accept=".zip,.json,application/zip,application/json"></label><p class="stDropHint">oppure trascina il file in questa pagina</p></section>' +
      '<section class="stCard stCardLib"><h2>✏ Modifica un pacchetto della libreria</h2><p class="help">' + esc(client.description()) + '</p>' + libRows + '</section>' +
      '</div></main>';
  }
  function renderStart() { app.innerHTML = startHTML(); }
  function loadStart() {
    S.view = 'start';
    renderStart();
    var libP = client.load().then(function (r) {
      S.library = r.packs.slice().sort(function (a, b) { return String(a.summary.title).localeCompare(String(b.summary.title), 'it'); });
      S.libraryError = null;
    }, function (e) { S.library = []; S.libraryError = 'Libreria non disponibile: ' + e.message; });
    var draftsP = Drafts.list().then(function (l) { S.drafts = l; }, function () { S.drafts = []; });
    var persP = Drafts.persistent().then(function (p) { S.persistent = p; });
    return Promise.all([libP, draftsP, persP]).then(function () { if (S.view === 'start') renderStart(); });
  }

  /* ---------------- editor: struttura ---------------- */
  function editorHTML() {
    return headerHTML('<div class="stDoc" id="stDoc"></div>',
      '<span class="stStatus" id="stStatus"></span><button class="btn ghost" data-act="export">⬇ ESPORTA ZIP</button><button class="btn green" data-act="save">💾 SALVA NELLA LIBRERIA</button><button class="btn ghost" data-act="close">✕ CHIUDI</button>') +
      '<nav class="stTabs" role="tablist" aria-label="Sezioni del pacchetto">' + TABS.map(function (t) {
        return '<button class="tabBtn" role="tab" data-act="tab" data-tab="' + t[0] + '">' + t[1] + ' <span class="stBadge" id="badge-' + t[0] + '"></span></button>';
      }).join('') + '</nav><div id="stMsg"></div><main class="stPanel" id="stPanel"></main>';
  }
  function renderEditor() {
    app.innerHTML = editorHTML();
    paintBar();
    paintMsg();
    renderPanel();
    paintBadges();
  }
  function renderPanel() {
    var p = doc.getElementById('stPanel');
    if (!p) return;
    var list = $('.stListScroll');
    var listTop = list ? list.scrollTop : 0;
    var winTop = root.scrollY;
    p.innerHTML = S.tab === 'info' ? infoHTML() : S.tab === 'questions' ? questionsHTML() : S.tab === 'games' ? gamesHTML() : S.tab === 'images' ? imagesHTML() : checkHTML();
    Array.prototype.forEach.call(app.querySelectorAll('.stTabs .tabBtn'), function (b) {
      var on = b.getAttribute('data-tab') === S.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var list2 = $('.stListScroll');
    if (list2) list2.scrollTop = listTop;
    root.scrollTo(0, winTop);
    paintBadges();
  }
  function paintBar() {
    if (!S.draft) return;
    var m = S.draft.manifest;
    var box = doc.getElementById('stDoc');
    if (box) box.innerHTML = '<b>' + esc(m.title || 'Senza titolo') + '</b><span>versione ' + esc(m.version) + ' · codice ' + esc(m.id) + '</span>';
    var st = doc.getElementById('stStatus');
    if (!st) return;
    var main;
    if (S.seq === S.libSeq) main = '<b class="good">● Salvato nella libreria</b>';
    else if (S.seq === S.zipSeq) main = '<b class="good">● Nessuna modifica dal file</b>';
    else main = '<b class="warn">● Modifiche non ancora nella libreria</b>';
    var sub = S.autoErr ? '<small class="bad">Bozza non salvata: ' + esc(S.autoErr) + '</small>' :
      S.autoAt ? '<small>bozza salvata nel browser alle ' + S.autoAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '</small>' : '';
    st.innerHTML = main + sub;
  }
  function paintBadges() {
    if (!S.draft) return;
    var d = S.draft;
    var c = S.check;
    var s = PS.summary(d);
    function set(id, v, cls) { var e = doc.getElementById('badge-' + id); if (e) { e.textContent = v; e.className = 'stBadge' + (cls ? ' ' + cls : ''); } }
    set('questions', s.questions);
    set('games', s.games);
    set('images', s.images);
    set('info', hasIssue('manifest') ? '!' : '', hasIssue('manifest') ? 'bad' : '');
    set('check', c ? (c.errors.length ? c.errors.length : '✓') : '', c && c.errors.length ? 'bad' : 'good');
    Array.prototype.forEach.call(app.querySelectorAll('[data-qrow]'), function (el) { el.classList.toggle('hasErr', hasIssue('question', Number(el.getAttribute('data-qrow')))); });
    Array.prototype.forEach.call(app.querySelectorAll('[data-grow]'), function (el) {
      var p = el.getAttribute('data-grow').split(':');
      el.classList.toggle('hasErr', hasIssue('game', Number(p[1]), p[0]));
    });
    var box = doc.getElementById('stEdErrors');
    if (box) box.innerHTML = editorIssuesHTML();
  }
  function datalists() {
    var cats = {};
    var topics = {};
    S.draft.questions.forEach(function (q) { if (q.category) cats[q.category] = true; if (q.topic) topics[q.topic] = true; });
    function dl(id, o) { return '<datalist id="' + id + '">' + Object.keys(o).sort().map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist>'; }
    return dl('stCats', cats) + dl('stTopics', topics);
  }

  /* ---------------- scheda Informazioni ---------------- */
  function infoHTML() {
    var m = S.draft.manifest;
    var t = m.theme || {};
    var fromLib = S.draft.origin.libraryId;
    return '<div class="stInfo"><section class="stCard"><h2>Informazioni sul pacchetto</h2><div id="stEdErrors" class="stIssues"></div>' +
      field('Titolo *', input('m.title', m.title, 60, 'es. Le capitali d’Europa'), 'Compare nella schermata iniziale e nell\'elenco dei pacchetti.') +
      field('Sottotitolo', input('m.subtitle', m.subtitle, 80, 'es. Ripasso di fine quadrimestre')) +
      '<div class="stRow2">' + field('Materia', input('m.subject', m.subject, 60, 'es. Geografia')) +
      field('Classe', '<select class="control" data-bind="m.grade:grade">' + gradeOptions(m.grade) + '</select>') + '</div>' +
      '<div class="stRow2">' + field('Classe come testo (facoltativo)', input('m.gradeLabel', m.gradeLabel, 40, 'es. 2ª media')) +
      field('Autore', input('m.author', m.author, 80, 'Nome del docente')) + '</div>' +
      '<div class="stRow2">' + field('Versione', '<span class="stInline">' + input('m.version', m.version, 20, '1.0.0') + '<button class="btn ghost" type="button" data-act="bump">+ AUMENTA</button></span>',
        'Quando aggiorni un pacchetto già nella libreria la versione aumenta da sola (1.0.0 → 1.0.1).') +
      field('Codice del pacchetto', input('m.id', m.id, 40, 'es. capitali_europa', null, 'f-id'),
        'Minuscole, numeri, _ e -. ' + (fromLib ? '<b>Se lo cambi, verrà salvato come un nuovo pacchetto</b> e l\'originale resterà com\'era.' : 'Si compila da solo dal titolo.')) + '</div>' +
      field('Descrizione', textarea('m.description', m.description, 600, 3, 'A cosa serve il pacchetto, per quale classe…')) +
      field('Licenza o note d\'uso', input('m.license', m.license, 120, 'es. CC BY 4.0, oppure: uso scolastico interno')) +
      '</section><section class="stCard"><h2>Aspetto</h2>' +
      field('Immagine della schermata iniziale (facoltativa)', imagePicker('m.theme.homeImage', t.homeImage || '')) +
      '<div class="stRow2">' + field('Colore principale', '<input type="color" class="stColor" data-bind="m.theme.accent" value="' + esc(colorOr(t.accent, '#57d8ff')) + '">') +
      field('Colore secondario', '<input type="color" class="stColor" data-bind="m.theme.accent2" value="' + esc(colorOr(t.accent2, '#f5bd63')) + '">') + '</div>' +
      '</section></div>';
  }

  /* ---------------- scheda Domande ---------------- */
  function qRowHTML(q, i) {
    var st = q.status && q.status !== 'approved' ? (q.status === 'draft' ? 'bozza' : 'da rivedere') : '';
    return '<button class="stRowItem' + (i === S.q ? ' sel' : '') + (hasIssue('question', i) ? ' hasErr' : '') + '" data-act="q-sel" data-i="' + i + '" data-qrow="' + i + '">' +
      '<b>' + (i + 1) + '</b><span class="stRowText">' + esc(clip(q.question, 90) || '(domanda senza testo)') + '</span>' +
      '<small>' + esc([q.category || q.topic, (q.seconds || 30) + ' s', st, q.image ? 'con immagine' : ''].filter(Boolean).join(' · ')) + '</small>' +
      '<i class="stErrDot" title="Da correggere">!</i></button>';
  }
  function questionRows() {
    var d = S.draft;
    var f = S.filter.trim().toLowerCase();
    var rows = d.questions.map(function (q, i) {
      if (f && [q.question, q.category, q.topic, (q.tags || []).join(' '), (q.options || []).join(' ')].join(' ').toLowerCase().indexOf(f) < 0) return '';
      return qRowHTML(q, i);
    }).join('');
    return rows || '<p class="help">' + (d.questions.length ? 'Nessuna domanda corrisponde alla ricerca.' : 'Ancora nessuna domanda: premi «＋ NUOVA DOMANDA».') + '</p>';
  }
  function questionsHTML() {
    var d = S.draft;
    if (S.q >= d.questions.length) S.q = d.questions.length - 1;
    if (S.q < 0) S.q = 0;
    var q = d.questions[S.q];
    var list = '<aside class="stList"><div class="stListTools"><button class="btn green" data-act="q-new">＋ NUOVA DOMANDA</button>' +
      '<input class="control" id="stFilter" type="search" placeholder="Cerca tra le domande" value="' + esc(S.filter) + '" aria-label="Cerca tra le domande"></div>' +
      '<div class="stListScroll">' + questionRows() + '</div></aside>';
    if (!q) {
      return '<div class="stThree">' + list + '<section class="stCard stEmpty"><h2>Nessuna domanda</h2><p>Premi «＋ NUOVA DOMANDA» per scrivere la prima.</p>' +
        '<button class="btn green xl" data-act="q-new">＋ NUOVA DOMANDA</button></section></div>';
    }
    return '<div class="stThree">' + list + questionEditorHTML(q) + previewPane() + '</div>' + datalists();
  }
  function questionEditorHTML(q) {
    var d = S.draft;
    var i = S.q;
    var opts = PS.LETTERS.map(function (L, k) {
      var on = String(q.correct || '').toUpperCase() === L;
      return '<div class="stOpt' + (on ? ' isCorrect' : '') + '"><label class="stOptRadio" title="Risposta corretta"><input type="radio" name="stCorrect" value="' + L + '" data-bind="q.correct"' + (on ? ' checked' : '') + ' aria-label="' + L + ' è la risposta corretta"><b>' + L + '</b></label>' +
        input('q.options.' + k, (q.options || [])[k], 200, 'Alternativa ' + L) + (on ? '<span class="stOk">✓ corretta</span>' : '') + '</div>';
    }).join('');
    var tags = Array.isArray(q.tags) ? q.tags.join(', ') : '';
    return '<section class="stCard stEditor"><div class="stEdHead"><h2>Domanda ' + (i + 1) + ' di ' + d.questions.length + ' <small>codice ' + esc(q.id) + '</small></h2><span class="stEdBtns">' +
      '<button class="btn ghost tiny" data-act="q-up"' + (i ? '' : ' disabled') + ' title="Sposta prima" aria-label="Sposta prima">↑</button>' +
      '<button class="btn ghost tiny" data-act="q-down"' + (i < d.questions.length - 1 ? '' : ' disabled') + ' title="Sposta dopo" aria-label="Sposta dopo">↓</button>' +
      '<button class="btn ghost tiny" data-act="q-dup">DUPLICA</button><button class="btn red tiny" data-act="q-del">ELIMINA</button></span></div>' +
      '<div id="stEdErrors" class="stIssues"></div>' +
      field('Testo della domanda', textarea('q.question', q.question, 500, 3, 'Scrivi qui la domanda', 'stBig')) +
      '<div class="stField"><span>Le quattro alternative <small>— seleziona la lettera della risposta corretta</small></span><div class="stOpts">' + opts + '</div></div>' +
      field('Spiegazione <small>(compare insieme alla soluzione)</small>', textarea('q.explanation', q.explanation, 1000, 3, 'Perché la risposta è corretta')) +
      '<div class="stRow3">' +
        field('Difficoltà', '<select class="control" data-bind="q.difficulty:int">' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (Number(q.difficulty || 1) === n ? ' selected' : '') + '>' + DIFF[n] + '</option>'; }).join('') + '</select>') +
        field('Tempo per rispondere', '<span class="stInline"><input class="control" type="number" min="5" max="600" step="1" data-bind="q.seconds:int" value="' + esc(q.seconds == null ? 30 : q.seconds) + '"><em>secondi</em></span>', 'Da 5 a 600.') +
        field('Stato', '<select class="control" data-bind="q.status">' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + ((q.status || 'approved') === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>') +
      '</div><div class="stRow3">' +
        field('Categoria', input('q.category', q.category, 60, 'es. Geografia', 'stCats'), 'Compare sopra la domanda.') +
        field('Argomento', input('q.topic', q.topic, 80, 'es. Capitali', 'stTopics'), 'Utile per i report.') +
        field('Tag', '<span class="stInputWrap"><input class="control" data-bind="q.tags:tags" maxlength="320" value="' + esc(tags) + '" placeholder="es. europa, ripasso"></span>', 'Parole chiave separate da virgole (massimo 10).') +
      '</div>' + field('Immagine <small>(facoltativa)</small>', imagePicker('q.image', q.image || '')) + '</section>';
  }

  /* ---------------- anteprime (stile schermo della classe) ---------------- */
  function previewPane() {
    var games = S.tab === 'games';
    return '<aside class="stPreviewCol"><div class="stPrevHead"><b>ANTEPRIMA</b><span class="stSeg">' +
      '<button class="btn tiny ' + (S.preview === 'question' ? 'primary' : 'ghost') + '" data-act="prev" data-mode="question">' + (games ? 'IN GIOCO' : 'DOMANDA') + '</button>' +
      '<button class="btn tiny ' + (S.preview === 'answer' ? 'primary' : 'ghost') + '" data-act="prev" data-mode="answer">SOLUZIONE</button></span></div>' +
      '<div id="stPreview">' + previewHTML() + '</div><p class="help">' + (games ? 'Anteprima semplificata della manche sullo schermo della classe.' :
      'Così apparirà sullo schermo della classe. In gara l\'ordine delle alternative viene mescolato.') + '</p></aside>';
  }
  function renderPreview() { var p = doc.getElementById('stPreview'); if (p) p.innerHTML = previewHTML(); }
  function bezel(inner) {
    var t = S.draft.manifest.theme || {};
    return '<div class="screenBezel" style="--accent:' + esc(colorOr(t.accent, '#57d8ff')) + ';--accent2:' + esc(colorOr(t.accent2, '#f5bd63')) + '"><div class="stage">' + inner + '</div></div>';
  }
  function mascot() { return '<div class="mascotStage mood-welcome"><div class="mascotAura"></div><img class="publicHostMascot" src="' + MASCOT + '" alt=""><div class="mascotShadow"></div></div>'; }
  function timerHUD(sec) {
    var s = Math.max(5, Math.min(600, Number(sec) || 30));
    return '<div class="publicTimerHud"><div class="timerWords"><small>TIMER</small><strong>PRONTI</strong><div class="timerMiniBar"><i style="width:100%"></i></div></div>' +
      '<div class="publicTimerRing" style="--pct:100"><b>' + s + '</b><em>SEC</em></div></div>';
  }
  function previewHTML() {
    if (!S.draft) return '';
    if (S.tab === 'questions') { var q = S.draft.questions[S.q]; return q ? questionPreview(q) : ''; }
    if (S.tab === 'games') { var g = curGame(); return g ? gamePreview(S.g.type, g) : ''; }
    return '';
  }
  function questionPreview(q) {
    var ans = S.preview === 'answer';
    var url = imgURL(q.image);
    var correct = String(q.correct || '').toUpperCase();
    var opts = PS.LETTERS.map(function (L, k) {
      return '<div class="option' + (ans ? (L === correct ? ' correct' : ' wrong') : '') + '"><b class="optionLetter">' + L + '</b><span class="optionText">' + esc((q.options || [])[k] || '…') + '</span></div>';
    }).join('');
    var correctText = (q.options || [])[PS.LETTERS.indexOf(correct)] || '';
    var density = READ && READ.className ? READ.className(q) : '';
    var readWarn = READ && READ.warning ? READ.warning(q) : '';
    return (readWarn ? '<div class="stReadabilityWarn">⚠ ' + esc(readWarn) + '</div>' : '') + bezel('<div class="questionShow ' + density + '"><header class="showHeader"><div><span class="showEyebrow">' + esc(q.category || q.topic || S.draft.manifest.title) + '</span>' +
      '<span class="roundCounter">DOMANDA ' + (S.q + 1) + ' / ' + S.draft.questions.length + '</span></div><img src="' + LOGO + '" alt=""></header>' +
      '<div class="questionBody' + (url ? ' hasArt' : '') + '">' + (url ? '<figure class="qVisual"><img src="' + url + '" alt=""></figure>' : '') +
      '<main class="qQA"><h1 class="questionText">' + esc(q.question || 'Scrivi il testo della domanda') + '</h1><div class="options">' + opts + '</div></main>' +
      '<aside class="questionSide">' + timerHUD(q.seconds) + mascot() + '</aside></div>' +
      '<footer class="questionFooter">' + (ans ? '<div class="answerExplanation"><strong>' + esc(correct) + ' · ' + esc(correctText) + '</strong><p>' + esc(q.explanation || '') + '</p></div>' :
      '<span class="publicPhase">PRONTI</span><span class="roundRule">' + esc((q.seconds || 30) + ' SECONDI PER RISPONDERE') + '</span>') + '</footer></div>');
  }
  function gamePreview(t, g) {
    var ans = S.preview === 'answer';
    var head = '<header class="stGpHead"><div><span class="showEyebrow">' + esc(PS.GAME_LABELS[t].toUpperCase()) + (g.theme ? ' · ' + esc(String(g.theme).toUpperCase()) : '') + '</span>' +
      '<h1>' + esc(g.label || PS.GAME_LABELS[t]) + '</h1></div><img src="' + LOGO + '" alt=""></header>';
    var body = '';
    if (t === 'photopuzzle') {
      var u = imgURL(g.image);
      var tiles = '';
      for (var k = 0; k < 30; k++) tiles += '<i' + (k % 3 === 1 ? ' class="gone"' : '') + '></i>';
      // RC1: come sul palco, la foto riempie la cornice e resta inquadrato il punto focale
      var focus = (root.SecchionePackEngine && root.SecchionePackEngine.photoFocus(g.focus)) || '50% 50%';
      body = '<div class="stGpPhoto">' + (u ? '<img src="' + u + '" alt="" style="object-position:' + esc(focus) + '">' + (ans ? '' : '<div class="stGpTiles">' + tiles + '</div>') : '<span>Scegli l\'immagine da riconoscere</span>') + '</div>' +
        '<div class="stGpBand">' + (ans ? esc(g.answer || '—') : '30 TESSERE IN ' + (g.seconds || 30) + ' SECONDI') + '</div>';
    } else if (t === 'indovina') {
      var sol = String(g.subject || '').trim().toLowerCase();
      body = '<div class="stGpCols"><ol class="stGpClues">' + (g.clues || []).map(function (c, i) { return '<li' + (ans || i === 0 ? '' : ' class="dim"') + '>' + esc(c || '…') + '</li>'; }).join('') + '</ol>' +
        '<div class="stGpChips">' + (g.candidates || []).map(function (c) { return '<span class="' + (ans && sol && String(c || '').trim().toLowerCase() === sol ? 'ok' : '') + '">' + esc(c || '…') + '</span>'; }).join('') + '</div></div>';
    } else if (t === 'abbinamenti') {
      body = '<div class="stGpCards">' + [0, 1, 2, 3].map(function (k) {
        var c = (g.cards || [])[k] || {};
        var u2 = imgURL(c.img);
        return '<figure><b>' + (k + 1) + '</b>' + (u2 ? '<img src="' + u2 + '" alt="">' : '<span>immagine ' + (k + 1) + '</span>') + '<figcaption>' + esc(ans ? ((g.names || [])[k] || '…') : (c.title || '')) + '</figcaption></figure>';
      }).join('') + '</div>' + (ans ? '' : '<div class="stGpChips">' + (g.names || []).map(function (n, k) { return '<span>' + PS.LETTERS[k] + ' · ' + esc(n || '…') + '</span>'; }).join('') + '</div>');
    } else if (t === 'ghigliottina') {
      body = '<div class="stGpPairs">' + (g.pairs || []).map(function (p, i) {
        return '<div><b>' + (i + 1) + '</b><span class="' + (ans ? 'ok' : '') + '">' + esc((p || [])[0] || '…') + '</span><span class="' + (ans ? 'no' : '') + '">' + esc((p || [])[1] || '…') + '</span></div>';
      }).join('') + '</div><div class="stGpBand">' + (ans ? esc(String(g.answer || '—').toUpperCase()) : 'QUAL È LA PAROLA FINALE?') + '</div>';
    } else if (t === 'chain') {
      body = '<div class="stGpChain">' + (g.links || []).map(function (l, i) {
        var to = String(l.to || '');
        var masked = ans ? esc(to || '…') : esc(to.split(/\s+/).map(function (part, wi) { if (!part) return ''; var first = wi === 0 ? part.charAt(0) : '_'; var rest = part.slice(1).replace(/\S/g, '_'); return first + (rest ? '\u00a0' + rest.split('').join('\u00a0') : ''); }).join('\u2003\u2003'));
        return '<div>' + (i === 0 ? '<span>' + esc(l.from || '…') + '</span>' : '') + '<em>→</em><span class="' + (ans ? 'ok' : '') + '">' + masked + '</span></div>';
      }).join('') + '</div>';
    }
    return bezel('<div class="stGp stGp-' + t + '">' + head + '<div class="stGpBody">' + body + '</div></div>');
  }

  /* ---------------- scheda Manche speciali ---------------- */
  function firstGame() {
    for (var k = 0; k < PS.GAME_TYPES.length; k++) {
      var t = PS.GAME_TYPES[k];
      if ((S.draft.games[t] || []).length) return { type: t, index: 0 };
    }
    return null;
  }
  function gameMeta(t, g) {
    if (t === 'photopuzzle' || t === 'ghigliottina') return g.answer || '';
    if (t === 'indovina') return g.subject || '';
    if (t === 'chain') return plural((g.links || []).length, 'collegamento', 'collegamenti');
    if (t === 'abbinamenti') return (g.names || []).filter(Boolean).join(', ');
    return '';
  }
  function gRowHTML(t, g, i) {
    return '<button class="stRowItem' + (S.g && S.g.type === t && S.g.index === i ? ' sel' : '') + (hasIssue('game', i, t) ? ' hasErr' : '') + '" data-act="g-sel" data-type="' + t + '" data-i="' + i + '" data-grow="' + t + ':' + i + '">' +
      '<b>' + (i + 1) + '</b><span class="stRowText">' + esc(clip(g.label || g.theme, 60) || '(senza titolo)') + '</span><small>' + esc(clip(gameMeta(t, g), 60)) + '</small><i class="stErrDot" title="Da correggere">!</i></button>';
  }
  function gamesHTML() {
    var d = S.draft;
    if (S.g && !(d.games[S.g.type] || [])[S.g.index]) S.g = firstGame();
    var groups = PS.GAME_TYPES.map(function (t) {
      var list = d.games[t] || [];
      return '<div class="stGroup"><div class="stGroupHead"><b>' + esc(PS.GAME_LABELS[t]) + '</b><span class="miniBadge">' + list.length + '</span>' +
        '<button class="btn green tiny" data-act="g-new" data-type="' + t + '">＋ AGGIUNGI</button></div>' +
        list.map(function (g, i) { return gRowHTML(t, g, i); }).join('') + '</div>';
    }).join('');
    var g = curGame();
    var list = '<aside class="stList"><p class="help stListNote">Facoltative: si giocano dalla regia, scheda Giochi.</p><div class="stListScroll">' + groups + '</div></aside>';
    if (!g) {
      return '<div class="stThree">' + list + '<section class="stCard stEmpty"><h2>Manche speciali</h2><p>Scegli un tipo nell\'elenco e premi «＋ AGGIUNGI». Sono disponibili i giochi già supportati dal Secchione:</p>' +
        '<ul class="stGameTypes">' + PS.GAME_TYPES.map(function (t) { return '<li><b>' + PS.GAME_LABELS[t] + '</b> — ' + GAME_HELP[t] + '</li>'; }).join('') + '</ul></section></div>';
    }
    return '<div class="stThree">' + list + gameEditorHTML(S.g.type, g) + previewPane() + '</div>';
  }
  /** Risposte alternative accettate (acceptedAnswers): le valuta l'answerMatcher esistente; vuoti e doppioni vengono ignorati al salvataggio. */
  function acceptedBlock(path, list, max, compact) {
    var arr = Array.isArray(list) ? list : [];
    return '<div class="stField stAccepted' + (compact ? ' compact' : '') + '"><span>' + (compact ? 'Alternative accettate per questo collegamento' : 'Risposte alternative accettate') +
      ' <small>— nomi completi, grafie o titoli alternativi. Maiuscole, accenti, articolo iniziale e piccoli errori di battitura sono già tollerati.</small></span>' +
      arr.map(function (v, k) {
        return '<div class="stOpt">' + input(path + '.' + k, v, max, 'Alternativa accettata') +
          '<button class="btn ghost tiny" type="button" data-act="acc-up" data-path="' + path + '" data-k="' + k + '"' + (k ? '' : ' disabled') + ' title="Sposta su" aria-label="Sposta su">↑</button>' +
          '<button class="btn ghost tiny" type="button" data-act="acc-del" data-path="' + path + '" data-k="' + k + '" title="Togli" aria-label="Togli alternativa">✕</button></div>';
      }).join('') +
      '<button class="btn ghost tiny" type="button" data-act="acc-add" data-path="' + path + '"' + (arr.length >= 10 ? ' disabled' : '') + '>＋ AGGIUNGI RISPOSTA ALTERNATIVA</button></div>';
  }
  function acceptedAction(act, path, k) {
    var list = getPath(path);
    if (!Array.isArray(list)) { list = []; setPath(path, list); }
    if (act === 'acc-add') list.push('');
    else if (act === 'acc-del') list.splice(k, 1);
    else if (act === 'acc-up' && k > 0) { var x = list[k]; list[k] = list[k - 1]; list[k - 1] = x; }
    structural();
    if (act === 'acc-add') { var inp = $('[data-bind="' + path + '.' + (list.length - 1) + '"]'); if (inp) inp.focus(); }
  }
  function rowBtn(act, arr, k, disabled, label) {
    return '<button class="btn ghost tiny" type="button" data-act="' + act + '" data-arr="' + arr + '"' + (k != null ? ' data-k="' + k + '"' : '') + (disabled ? ' disabled' : '') + (k != null ? ' title="Togli" aria-label="Togli"' : '') + '>' + label + '</button>';
  }
  function gameEditorHTML(t, g) {
    var list = S.draft.games[t];
    var i = S.g.index;
    var html = '<section class="stCard stEditor"><div class="stEdHead"><h2>' + esc(PS.GAME_LABELS[t]) + ' ' + (i + 1) + ' di ' + list.length + '</h2><span class="stEdBtns">' +
      '<button class="btn ghost tiny" data-act="g-up"' + (i ? '' : ' disabled') + ' title="Sposta prima" aria-label="Sposta prima">↑</button>' +
      '<button class="btn ghost tiny" data-act="g-down"' + (i < list.length - 1 ? '' : ' disabled') + ' title="Sposta dopo" aria-label="Sposta dopo">↓</button>' +
      '<button class="btn ghost tiny" data-act="g-dup">DUPLICA</button><button class="btn red tiny" data-act="g-del">ELIMINA</button></span></div>' +
      '<p class="help">' + GAME_HELP[t] + '</p><div id="stEdErrors" class="stIssues"></div>' +
      '<div class="stRow3">' + field('Titolo della manche', input('g.label', g.label, 80, 'es. Vulcani d’Italia')) +
      field('Tema', input('g.theme', g.theme, 70, 'es. Geografia fisica'), 'Se resta vuoto si usa il titolo.') +
      field('Secondi', '<input class="control" type="number" min="10" max="300" data-bind="g.seconds:int" value="' + esc(g.seconds == null ? 30 : g.seconds) + '">', 'Da 10 a 300.') + '</div>';
    if (t === 'photopuzzle') {
      html += field('Immagine da riconoscere', imagePicker('g.image', g.image || '')) +
        field('Punto focale (facoltativo)', input('g.focus', g.focus, 30, 'es. 50% 30%  oppure  alto'), 'La foto riempie tutta la cornice: indica quale parte deve restare inquadrata, in percentuale orizzontale e verticale (50% 50% = centro), oppure alto, basso, sinistra, destra. Utile per le foto verticali.') +
        field('Risposta principale (soluzione)', input('g.answer', g.answer, 80, 'es. Etna')) +
        acceptedBlock('g.acceptedAnswers', g.acceptedAnswers, 80);
    } else if (t === 'indovina') {
      var cands = g.candidates || [];
      var sol = String(g.subject || '').trim().toLowerCase();
      html += '<div class="stField"><span>Alternative <small>— da 2 a 8; seleziona il numero della soluzione</small></span><div class="stOpts">' + cands.map(function (c, k) {
        var on = !!sol && String(c || '').trim().toLowerCase() === sol;
        return '<div class="stOpt' + (on ? ' isCorrect' : '') + '"><label class="stOptRadio" title="È la soluzione"><input type="radio" name="stSol" data-act="ind-sol" data-k="' + k + '"' + (on ? ' checked' : '') + ' aria-label="Alternativa ' + (k + 1) + ' è la soluzione"><b>' + (k + 1) + '</b></label>' +
          input('g.candidates.' + k, c, 60, 'Alternativa ' + (k + 1)) + (on ? '<span class="stOk">✓ soluzione</span>' : '') + rowBtn('arr-del', 'candidates', k, cands.length <= 2, '✕') + '</div>';
      }).join('') + '</div>' + rowBtn('arr-add', 'candidates', null, cands.length >= 8, '＋ ALTERNATIVA') + '</div>';
      html += acceptedBlock('g.acceptedAnswers', g.acceptedAnswers, 80);
      var clues = g.clues || [];
      html += '<div class="stField"><span>Indizi <small>— da 1 a 5; compaiono uno alla volta, conviene andare dal più difficile al più facile</small></span>' + clues.map(function (c, k) {
        return '<div class="stOpt"><b class="stNum">' + (k + 1) + '</b>' + textarea('g.clues.' + k, c, 180, 2, 'Indizio ' + (k + 1)) + rowBtn('arr-del', 'clues', k, clues.length <= 1, '✕') + '</div>';
      }).join('') + rowBtn('arr-add', 'clues', null, clues.length >= 5, '＋ INDIZIO') + '</div>';
    } else if (t === 'abbinamenti') {
      html += '<div class="stField"><span>Quattro immagini, ognuna con il suo termine corretto <small>— in gara i termini vengono mescolati</small></span><div class="stCards">' + [0, 1, 2, 3].map(function (k) {
        var c = (g.cards || [])[k] || {};
        return '<div class="stCardSlot"><b class="stNum">' + (k + 1) + '</b>' + imagePicker('g.cards.' + k + '.img', c.img || '') +
          field('Termine corretto', input('g.names.' + k, (g.names || [])[k], 60, 'es. Etna')) +
          field('Didascalia <small>(facoltativa)</small>', input('g.cards.' + k + '.title', c.title, 60, 'Immagine ' + (k + 1))) + '</div>';
      }).join('') + '</div></div>';
    } else if (t === 'ghigliottina') {
      html += field('Risposta principale (parola finale)', input('g.answer', g.answer, 40, 'es. FIUME')) + acceptedBlock('g.acceptedAnswers', g.acceptedAnswers, 80) +
        '<div class="stField"><span>Cinque coppie <small>— a sinistra la parola collegata alla soluzione, a destra quella che non c\'entra (in gara la posizione viene mescolata)</small></span>' +
        '<div class="stPairs"><div class="stPair stPairHead"><span></span><small class="good">✓ collegata</small><small class="bad">✗ non c\'entra</small></div>' + [0, 1, 2, 3, 4].map(function (k) {
          var p = (g.pairs || [])[k] || ['', ''];
          return '<div class="stPair"><b class="stNum">' + (k + 1) + '</b>' + input('g.pairs.' + k + '.0', p[0], 40, 'collegata') + input('g.pairs.' + k + '.1', p[1], 40, 'non c\'entra') + '</div>';
        }).join('') + '</div></div>';
    } else if (t === 'chain') {
      var links = g.links || [];
      html += '<div class="stField"><span>Collegamenti <small>— da 1 a 20; ogni riga collega una parola a quella successiva</small></span>' + links.map(function (l, k) {
        return '<div class="stPair"><b class="stNum">' + (k + 1) + '</b>' + input('g.links.' + k + '.from', l.from, 40, 'parola') + '<span class="stArrow">→</span>' +
          input('g.links.' + k + '.to', l.to, 40, 'parola collegata') + rowBtn('arr-del', 'links', k, links.length <= 1, '✕') + '</div>' +
          acceptedBlock('g.links.' + k + '.acceptedAnswers', l.acceptedAnswers, 40, true);
      }).join('') + rowBtn('arr-add', 'links', null, links.length >= 20, '＋ COLLEGAMENTO') + '</div>' +
        '<details class="stDetails"><summary>Scrivi tutta la catena in una riga</summary><p class="help">Esempio: <code>NEVE | SORGENTE | FIUME | MARE</code> crea 3 collegamenti.</p>' +
        '<textarea class="control" rows="2" id="stChainText" placeholder="PAROLA | PAROLA | PAROLA"></textarea><button class="btn primary tiny top8" data-act="chain-paste">USA QUESTA CATENA</button></details>';
    }
    return html + '</section>';
  }

  /* ---------------- scheda Immagini ---------------- */
  function usageLabel(w) {
    if (w.kind === 'question') return 'domanda ' + (w.index + 1);
    if (w.kind === 'game') return PS.GAME_LABELS[w.type] + ' ' + (w.index + 1);
    return 'schermata iniziale';
  }
  function imagesHTML() {
    var d = S.draft;
    var usage = PS.imageUsage(d);
    var names = Object.keys(d.images).sort();
    var total = names.reduce(function (a, n) { return a + d.images[n].length; }, 0);
    var cards = names.map(function (n) {
      var u = usage[n] || [];
      var labels = [];
      u.forEach(function (w) { var l = usageLabel(w); if (labels.indexOf(l) < 0) labels.push(l); });
      var ext = (/\.([a-z0-9]+)$/i.exec(n) || [0, ''])[1];
      return '<figure class="stImg' + (u.length ? '' : ' unused') + '"><div class="stImgBox"><img src="' + imgURL(n) + '" alt="" loading="lazy"></div><figcaption>' +
        '<span class="stInline"><input class="control stImgName" value="' + esc(n.replace(/\.[^.]+$/, '')) + '" data-rename="' + esc(n) + '" maxlength="50" aria-label="Nome dell\'immagine ' + esc(n) + '"><em>.' + esc(ext) + '</em></span>' +
        '<small>' + fmtBytes(d.images[n].length) + '</small><small class="stUse">' + (labels.length ? 'Usata in: ' + esc(labels.slice(0, 6).join(', ')) + (labels.length > 6 ? '…' : '') : 'Non usata') + '</small>' +
        '<button class="btn red tiny" data-act="img-del" data-name="' + esc(n) + '">ELIMINA</button></figcaption></figure>';
    }).join('');
    return '<section class="stCard"><h2>Immagini del pacchetto</h2><div class="stImgTop">' +
      '<label class="btn green fileLabel">⬆ AGGIUNGI IMMAGINI<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" data-upload=""></label>' +
      '<label class="checkRow"><input type="checkbox" id="stShrink"' + (S.shrink ? ' checked' : '') + '> riduci le foto molto grandi (lato massimo ' + MAX_SIDE + ' pixel)</label>' +
      '<span class="help">' + plural(names.length, 'immagine', 'immagini') + ' · ' + fmtBytes(total) + ' · JPG, PNG, WEBP o GIF · puoi anche trascinarle qui</span></div>' +
      '<p class="help">Le immagini vengono salvate tutte direttamente nella cartella <code>images/</code> del pacchetto, con nomi semplici (minuscole, senza spazi né accenti): così si vedono anche sulle pulsantiere collegate in rete. ' +
      'Per rinominarne una, modifica il nome e premi Invio: domande e manche che la usano vengono aggiornate.</p>' +
      (names.length ? '<div class="stImgGrid">' + cards + '</div>' : '<p class="help">Ancora nessuna immagine.</p>') + '</section>';
  }

  /* ---------------- scheda Controllo e salvataggio ---------------- */
  function issueItem(x) {
    return '<li><button class="stIssue" data-act="goto" data-kind="' + x.where.kind + '"' + (x.where.index != null ? ' data-i="' + x.where.index + '"' : '') + (x.where.type ? ' data-type="' + x.where.type + '"' : '') + '>' +
      '<b>' + esc(whereLabel(x.where)) + '</b> ' + esc(cap(x.message)) + '</button></li>';
  }
  function checkHTML() {
    var d = S.draft;
    var c = S.check = PS.validate(d);
    var s = PS.summary(d);
    var total = Object.keys(d.images).reduce(function (a, n) { return a + d.images[n].length; }, 0);
    var games = PS.GAME_TYPES.filter(function (t) { return s.gamesByType[t]; }).map(function (t) { return PS.GAME_LABELS[t] + ' ' + s.gamesByType[t]; }).join(', ');
    return '<div class="stCheck"><section class="stCard"><div class="stVerdict ' + (c.ok ? 'ok' : 'err') + '">' +
      (c.ok ? '✓ Il pacchetto è pronto: puoi salvarlo nella libreria o esportarlo come ZIP.' : '✗ ' + plural(c.errors.length, 'problema da correggere', 'problemi da correggere') + ' prima di salvare. Clicca su un problema per andare al punto giusto.') + '</div>' +
      (c.errors.length ? '<h3>Da correggere</h3><ul class="stIssueList">' + c.errors.map(issueItem).join('') + '</ul>' : '') +
      (c.warnings.length ? '<h3>Avvisi <small>(non bloccano il salvataggio)</small></h3><ul class="stIssueList warn">' + c.warnings.map(issueItem).join('') + '</ul>' : '') +
      '</section><section class="stCard"><h2>Riepilogo</h2><ul class="stSummary">' +
      '<li><b>' + s.questions + '</b> domande · ' + s.approved + ' vanno in gara</li>' +
      '<li><b>' + s.games + '</b> manche speciali' + (games ? ' (' + esc(games) + ')' : '') + '</li>' +
      '<li><b>' + s.images + '</b> immagini · ' + fmtBytes(total) + '</li>' +
      '<li>Versione <b>' + esc(s.version) + '</b> · codice <b>' + esc(s.id) + '</b></li></ul>' +
      '<label class="checkRow"><input type="checkbox" id="stAutoBump"' + (S.autoBump ? ' checked' : '') + '> quando aggiorno un pacchetto già nella libreria, aumenta da sola la versione</label>' +
      '<p class="help">' + esc(client.description()) + '</p>' +
      '<div class="stSaveBtns"><button class="btn green xl" data-act="save"' + (c.ok ? '' : ' disabled') + '>💾 SALVA NELLA LIBRERIA</button>' +
      '<button class="btn primary xl" data-act="export"' + (c.ok ? '' : ' disabled') + '>⬇ ESPORTA ZIP</button></div>' +
      '<p class="help">Lo ZIP esportato si reimporta dal Gestore Pacchetti (anche su un altro PC) o si riapre qui con «Apri un file .zip».</p></section></div>';
  }
  function gotoIssue(kind, index, type) {
    if (kind === 'question' || kind === 'questions') { S.tab = 'questions'; S.filter = ''; if (index != null) S.q = index; }
    else if (kind === 'game') { S.tab = 'games'; S.g = { type: type, index: index }; }
    else if (kind === 'manifest') S.tab = 'info';
    else if (kind === 'image') S.tab = 'images';
    else S.tab = 'check';
    S.preview = 'question';
    renderPanel();
    root.scrollTo(0, 0);
  }

  /* ---------------- finestra di conferma ---------------- */
  function ask(title, html, buttons) {
    var dlg = doc.getElementById('stModal');
    return new Promise(function (resolve) {
      if (!dlg || typeof dlg.showModal !== 'function') {
        resolve(root.confirm(title + '\n\n' + html.replace(/<[^>]+>/g, '')) ? buttons[0].v : '');
        return;
      }
      dlg.innerHTML = '<h2>' + esc(title) + '</h2><div class="stModalBody">' + html + '</div><div class="stModalBtns">' +
        buttons.map(function (b) { return '<button class="btn ' + (b.cls || 'ghost') + '" type="button" data-v="' + esc(b.v) + '">' + esc(b.label) + '</button>'; }).join('') + '</div>';
      function done(v) {
        dlg.removeEventListener('click', onClickDlg);
        dlg.removeEventListener('cancel', onCancel);
        if (dlg.open) dlg.close();
        resolve(v);
      }
      function onClickDlg(e) { var b = e.target.closest('button[data-v]'); if (b) done(b.getAttribute('data-v')); }
      function onCancel(e) { e.preventDefault(); done(''); }
      dlg.addEventListener('click', onClickDlg);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
      var first = dlg.querySelector('.stModalBtns button');
      if (first) first.focus();
    });
  }

  /* ---------------- apertura, chiusura ---------------- */
  function startEditing(d, draftId, o) {
    var opt = o || {};
    dropURLs();
    S.draft = d;
    S.draftId = draftId || Drafts.newId();
    S.view = 'edit';
    S.q = 0;
    S.g = firstGame();
    S.filter = '';
    S.preview = 'question';
    S.seq = opt.unsaved ? 1 : 0;
    S.libSeq = d.origin.libraryId && !opt.unsaved ? 0 : -1;
    S.zipSeq = !d.origin.libraryId && !opt.unsaved ? 0 : -1;
    S.contentChanged = !!(opt.contentChanged || opt.unsaved);
    S.idAuto = !!opt.idAuto;
    S.autoAt = null;
    S.autoErr = null;
    S.tab = opt.tab || (d.questions.length ? 'questions' : 'info');
    S.msg = opt.msg || null;
    S.check = PS.validate(d);
    try { root.history.replaceState(null, '', root.location.pathname); } catch (e) { /* ignora */ }
    renderEditor();
    root.scrollTo(0, 0);
    if (opt.unsaved) autosave();
  }
  function openNotes(d) {
    var n = [];
    var fl = d.origin.flattened || [];
    if (fl.length) n.push(fl.length === 1 ? 'Un\'immagine era in una sottocartella ed è stata spostata direttamente in images/ (i riferimenti sono aggiornati).' : fl.length + ' immagini erano in sottocartelle e sono state spostate direttamente in images/ (i riferimenti sono aggiornati).');
    if (d.origin.kind === 'v3') n.push('Edizione v3 convertita nel formato pacchetto.');
    var v = PS.validate(d);
    if (!v.ok) n.push('Ci sono ' + plural(v.errors.length, 'problema', 'problemi') + ' da correggere: li trovi in «Controllo e salvataggio».');
    return n.join(' ');
  }
  function openFromLibrary(id) {
    var pending = S.drafts.filter(function (x) { return x.libraryId === id; })[0];
    var choice = pending ? ask('C\'è una bozza non salvata', 'Di questo pacchetto esiste una bozza modificata il ' + esc(fmtWhen(pending.updatedAt)) + ' e non ancora salvata nella libreria.',
      [{ v: 'draft', label: 'RIPRENDI LA BOZZA', cls: 'green' }, { v: 'library', label: 'APRI LA VERSIONE DELLA LIBRERIA', cls: 'primary' }, { v: '', label: 'ANNULLA' }]) : Promise.resolve('library');
    return choice.then(function (v) {
      if (v === 'draft') return resumeDraft(pending.id);
      if (v !== 'library') return null;
      setBusy(true, 'Apertura del pacchetto…');
      return client.openBytes(id).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.errors && r.errors[0]) || 'apertura non riuscita');
        var raw = PL.readImport(r.filename, r.bytes);
        var d = PS.draftFromImport(raw, { kind: 'library', libraryId: id });
        var included = includeRegiaOverrides(d, id);
        setBusy(false);
        var notes = openNotes(d);
        if (included.length) notes = 'Incluse le modifiche fatte nella regia di questo browser (' + included.join(' e ') + '): sono quelle che il gioco usa adesso. Salvando entrano nel pacchetto, e da quel momento la regia usa solo il pacchetto salvato. ' + notes;
        var changedOnOpen = (d.origin.flattened || []).length > 0 || included.length > 0;
        startEditing(d, null, { contentChanged: changedOnOpen, unsaved: changedOnOpen, msg: notes ? { kind: 'info', html: esc(notes) } : null });
      }).catch(function (e) {
        setBusy(false);
        S.startMsg = { kind: 'err', html: 'Impossibile aprire il pacchetto: ' + esc(e.message) };
        renderStart();
      });
    });
  }
  function openFile(file) {
    setBusy(true, 'Apertura di «' + file.name + '»…');
    return readFileBytes(file).then(function (bytes) {
      var raw = PL.readImport(file.name, bytes);
      var d = PS.draftFromImport(raw, { kind: raw.kind === 'v3' ? 'v3' : 'file', fileName: file.name, libraryId: null });
      setBusy(false);
      var changedOnOpen = d.origin.kind === 'v3' || (d.origin.flattened || []).length > 0;
      startEditing(d, null, { unsaved: changedOnOpen, msg: { kind: 'info', html: '📂 Aperto «' + esc(file.name) + '». ' + esc(openNotes(d)) } });
    }).catch(function (e) {
      setBusy(false);
      var m = { kind: 'err', html: 'Impossibile aprire «' + esc(file.name) + '»: ' + esc(e.message) };
      if (S.view === 'start') { S.startMsg = m; renderStart(); } else { S.msg = m; paintMsg(); }
    });
  }
  function resumeDraft(id) {
    setBusy(true, 'Apertura della bozza…');
    return Drafts.load(id).then(function (d) {
      setBusy(false);
      var f = d.origin.studio || {};
      startEditing(d, id, { unsaved: f.unsaved !== false, contentChanged: !!f.contentChanged, idAuto: !!f.idAuto, msg: { kind: 'info', html: 'Bozza ripresa: continua da dove avevi lasciato.' } });
    }, function (e) {
      setBusy(false);
      S.startMsg = { kind: 'err', html: 'Bozza non disponibile: ' + esc(e.message) };
      loadStart();
    });
  }
  function deleteDraft(id) {
    var d = S.drafts.filter(function (x) { return x.id === id; })[0];
    return ask('Eliminare la bozza?', 'La bozza «' + esc(d ? d.title : id) + '» e le sue modifiche non salvate verranno eliminate da questo browser. I pacchetti della libreria non cambiano.',
      [{ v: 'del', label: 'ELIMINA LA BOZZA', cls: 'red' }, { v: '', label: 'ANNULLA' }]).then(function (v) {
      if (v !== 'del') return null;
      return Drafts.remove(id).then(loadStart);
    });
  }
  function createNew(form) {
    var f = form.elements;
    var title = f.title.value.trim();
    if (!title) { f.title.focus(); return; }
    var d = PS.newDraft({ title: title, subject: f.subject.value, grade: f.grade.value ? Number(f.grade.value) : null, author: f.author.value });
    var taken = (S.library || []).map(function (p) { return p.id; });
    d.manifest.id = PL.uniqueId(d.manifest.id, taken);
    PS.addQuestion(d);
    if (d.manifest.subject) d.questions[0].category = d.manifest.subject;
    startEditing(d, null, { unsaved: true, idAuto: true, tab: 'questions', msg: { kind: 'ok', html: '✓ Pacchetto creato. Scrivi la prima domanda; titolo, materia e classe si modificano nella scheda «Informazioni». Il lavoro viene salvato automaticamente in questo browser.' } });
    var ta = $('[data-bind="q.question"]');
    if (ta) ta.focus();
  }
  function closeEditor() {
    var title = S.draft.manifest.title;
    function finish(keep) {
      clearTimeout(S.autoTimer);
      S.autoTimer = null;
      var p = keep ? autosave() : dropDraft(S.draftId);
      return Promise.resolve(p).then(function () {
        dropURLs();
        S.draft = null;
        S.msg = null;
        S.startMsg = keep ? { kind: 'info', html: 'La bozza «' + esc(title) + '» è tra le «Bozze in corso»: puoi riprenderla quando vuoi.' } : null;
        return loadStart();
      });
    }
    if (!unsaved()) return finish(false);
    return ask('Chiudere il pacchetto?', 'Le ultime modifiche non sono ancora nella libreria né in un file ZIP. Restano salvate in questo browser tra le «Bozze in corso»' +
      (S.persistent ? '.' : ', <b>ma solo finché questa pagina resta aperta</b>.'), [{ v: 'close', label: 'CHIUDI (LA BOZZA RESTA)', cls: 'primary' }, { v: 'save', label: '💾 SALVA PRIMA NELLA LIBRERIA', cls: 'green' }, { v: '', label: 'ANNULLA' }]).then(function (v) {
      if (v === 'close') return finish(true);
      if (v === 'save') return save();
      return null;
    });
  }
  function goBack() {
    if (S.view === 'edit' && unsaved()) autosave();
    try {
      if (root.opener && !root.opener.closed) { root.opener.focus(); root.close(); return; }
    } catch (e) { /* finestra non accessibile */ }
    root.location.href = 'index.html';
  }

  /* ---------------- salvataggio ed esportazione ---------------- */
  function notifyHost(id, mode) {
    var msg = { type: 'pack-saved', id: id, mode: mode, at: Date.now() };
    try { var bc = new root.BroadcastChannel('secchione-packs'); bc.postMessage(msg); bc.close(); } catch (e) { /* non supportato */ }
    try { root.localStorage.setItem('secchione-pack-saved', JSON.stringify(msg)); } catch (e) { /* non disponibile */ }
  }
  function save() {
    if (S.busy || !S.draft) return Promise.resolve();
    var d = S.draft;
    S.check = PS.validate(d);
    if (!S.check.ok) {
      S.tab = 'check';
      renderPanel();
      setMsg('err', 'Prima di salvare correggi i problemi elencati qui sotto.');
      return Promise.resolve();
    }
    setBusy(true, 'Controllo della libreria…');
    return client.load().then(function (r) {
      setBusy(false);
      S.library = r.packs;
      var id = d.manifest.id;
      var existing = r.packs.filter(function (p) { return p.id === id; })[0];
      if (!existing) return doSave('new', null);
      var taken = r.packs.map(function (p) { return p.id; });
      var es = existing.summary || {};
      var readOnly = !existing.removable;
      var ours = d.origin.libraryId === id && !readOnly;
      var bump = S.autoBump && S.contentChanged && String(d.manifest.version) === String(es.version) ? PS.bumpVersion(d.manifest.version) : null;
      var newVersion = bump || d.manifest.version;
      var backupNote = client.mode === 'server' ? ' La versione precedente resta recuperabile nella cartella <code>data/cestino_pacchetti</code>.' : ' Nel browser la versione precedente non viene conservata: se vuoi tenerla, esportala prima come ZIP dal Gestore Pacchetti.';
      var altId = PL.uniqueId(id, taken);
      if (ours) {
        var stale = d.origin.loadedVersion && es.version && String(d.origin.loadedVersion) !== String(es.version);
        return ask('Aggiornare il pacchetto nella libreria?', '«' + esc(es.title || id) + '» (versione ' + esc(es.version || '—') + ') verrà sostituito dalla versione <b>' + esc(newVersion) + '</b>.' + backupNote +
          (stale ? '<br><b>Attenzione:</b> questa bozza era partita dalla versione ' + esc(d.origin.loadedVersion) + ', ma nella libreria adesso c\'è la ' + esc(es.version) + ': aggiornando la sostituisci con questa bozza.' : '') +
          '<br>Se il pacchetto è in gara, nella regia premi ATTIVA per usare la nuova versione: squadre e punti restano.', [{ v: 'replace', label: 'AGGIORNA', cls: 'green' }, { v: '', label: 'ANNULLA' }]).then(function (v) {
          return v === 'replace' ? doSave('replace', bump) : null;
        });
      }
      var buttons = [];
      if (!readOnly) buttons.push({ v: 'replace', label: 'SOSTITUISCI QUEL PACCHETTO', cls: 'red' });
      buttons.push({ v: 'new', label: 'SALVA COME NUOVO (codice ' + altId + ')', cls: 'green' });
      buttons.push({ v: '', label: 'ANNULLA' });
      return ask('Esiste già un pacchetto con questo codice', 'Nella libreria c\'è già «' + esc(es.title || id) + '» (codice <code>' + esc(id) + '</code>, versione ' + esc(es.version || '—') + ').' +
        (readOnly ? ' È un pacchetto del programma e non si può sostituire da qui.' : ' Puoi sostituirlo con questo pacchetto oppure salvare questo come pacchetto separato.' + backupNote), buttons).then(function (v) {
        if (v === 'replace') return doSave('replace', null);
        if (v === 'new') {
          d.manifest.id = altId;
          S.idAuto = false;
          // due pacchetti con lo stesso titolo nella regia sarebbero indistinguibili
          if (String(d.manifest.title).trim().toLowerCase() === String(es.title || '').trim().toLowerCase()) d.manifest.title = String(d.manifest.title).slice(0, 52) + ' (copia)';
          return doSave('new', null);
        }
        return null;
      });
    }, function (e) { setBusy(false); setMsg('err', 'Libreria non disponibile: ' + esc(e.message)); });
  }
  function doSave(mode, bump) {
    var d = S.draft;
    var prevVersion = d.manifest.version;
    if (bump) d.manifest.version = bump;
    var z;
    try { z = PS.toZip(d); } catch (e) {
      d.manifest.version = prevVersion;
      S.tab = 'check';
      renderPanel();
      setMsg('err', esc(e.message));
      return Promise.resolve();
    }
    setBusy(true, 'Salvataggio nella libreria…');
    return client.save(d.manifest.id, z.bytes, mode).then(function (r) {
      setBusy(false);
      if (!r || !r.ok) {
        d.manifest.version = prevVersion;
        setMsg('err', 'Salvataggio non riuscito: ' + esc(((r && r.errors) || ['errore sconosciuto']).join(' · ')));
        return;
      }
      d.origin.libraryId = r.id;
      d.origin.loadedVersion = d.manifest.version;
      d.origin.kind = 'library';
      S.seq++;
      S.libSeq = S.seq;
      S.contentChanged = false;
      S.idAuto = false;
      dropDraft(S.draftId);
      S.autoAt = null;
      var clearedOverrides = clearRegiaOverrides(r.id);
      notifyHost(r.id, mode);
      var s = PS.summary(d);
      renderEditor();
      setMsg('ok', '✓ «' + esc(d.manifest.title) + '» ' + (r.replaced ? 'aggiornato' : 'salvato') + ' nella libreria: versione ' + esc(d.manifest.version) + ', ' + plural(s.questions, 'domanda', 'domande') + ', ' + plural(s.games, 'manche', 'manche') + '.' +
        (bump ? ' La versione è passata da ' + esc(prevVersion) + ' a ' + esc(bump) + '.' : '') +
        (r.backup ? ' La versione precedente è in <code>data/cestino_pacchetti/' + esc(r.backup) + '</code>.' : '') +
        (clearedOverrides ? ' Le modifiche che la regia teneva a parte per questo pacchetto sono ora nel pacchetto salvato.' : '') +
        ' Nella regia lo trovi in 📦 PACCHETTI' + (r.replaced ? ': se è in gara, premi ATTIVA per usare la nuova versione.' : '.') +
        ((r.warnings || []).length ? '<br><small>' + r.warnings.slice(0, 4).map(esc).join('<br>') + '</small>' : ''));
    }, function (e) {
      setBusy(false);
      d.manifest.version = prevVersion;
      setMsg('err', 'Salvataggio non riuscito: ' + esc(e.message));
    });
  }
  function exportZip() {
    var d = S.draft;
    if (!d) return;
    var z;
    try { z = PS.toZip(d); } catch (e) {
      S.check = e.validation || PS.validate(d);
      S.tab = 'check';
      renderPanel();
      setMsg('err', 'Prima di esportare correggi i problemi elencati qui sotto.');
      return;
    }
    download(z.filename, z.bytes);
    S.zipSeq = S.seq;
    paintBar();
    setMsg('ok', '✓ Esportato <b>' + esc(z.filename) + '</b> (' + fmtBytes(z.bytes.length) + '). Si reimporta dal Gestore Pacchetti, anche su un altro PC, o si riapre qui con «Apri un file .zip».' +
      (S.libSeq !== S.seq ? ' Per usarlo in gara su questo PC salvalo anche nella libreria.' : ''));
  }

  /* ---------------- azioni ---------------- */
  function arrayAction(act, arr, k) {
    var g = curGame();
    if (!g) return;
    var list = g[arr] = Array.isArray(g[arr]) ? g[arr] : [];
    if (act === 'arr-add') {
      if (arr === 'links') { var last = list[list.length - 1]; list.push({ from: last ? last.to || '' : '', to: '' }); } else list.push('');
    } else {
      var removed = list.splice(k, 1)[0];
      if (arr === 'candidates' && g.subject && String(removed || '').trim().toLowerCase() === String(g.subject).trim().toLowerCase()) g.subject = '';
    }
    structural();
  }
  function deleteImage(name) {
    var used = PS.imageUsage(S.draft)[name] || [];
    var labels = [];
    used.forEach(function (w) { var l = usageLabel(w); if (labels.indexOf(l) < 0) labels.push(l); });
    return ask('Eliminare l\'immagine?', '«' + esc(name) + '» verrà tolta dal pacchetto.' + (used.length ? ' È usata in: ' + esc(labels.join(', ')) + '; quei punti resteranno senza immagine.' : ''),
      [{ v: 'del', label: 'ELIMINA', cls: 'red' }, { v: '', label: 'ANNULLA' }]).then(function (v) {
      if (v !== 'del') return;
      PS.removeImage(S.draft, name, true);
      dropURL(name);
      structural();
    });
  }
  function renameImage(oldName, value) {
    var r = PS.renameImage(S.draft, oldName, value);
    if (!r.ok) { setMsg('err', esc(r.error)); return; }
    if (r.name !== oldName) {
      dropURL(oldName);
      setMsg('ok', 'Immagine rinominata in «' + esc(r.name) + '»: domande e manche che la usano sono state aggiornate.');
      structural();
    } else renderPanel();
  }
  function uploadInto(path, files) {
    if (!files || !files.length) return Promise.resolve();
    setBusy(true, 'Caricamento delle immagini…');
    return addFiles(files).then(function (r) {
      setBusy(false);
      if (r.added.length) { if (path) setPath(path, r.added[0]); structural(); }
      var parts = [];
      if (r.added.length) parts.push('✓ ' + (r.added.length === 1 ? 'Immagine aggiunta: ' : r.added.length + ' immagini aggiunte: ') + r.added.map(esc).join(', ') + (r.resized ? ' (' + r.resized + ' ridotte di dimensione)' : '') + '.');
      if (r.problems.length) parts.push(r.problems.map(esc).join('<br>'));
      setMsg(r.problems.length ? 'err' : 'ok', parts.join('<br>'));
    });
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !app.contains(b) || b.disabled || S.busy) return;
    var act = b.getAttribute('data-act');
    var d = S.draft;
    var i = Number(b.getAttribute('data-i'));
    if (act === 'back') return goBack();
    if (act === 'open-lib') return openFromLibrary(b.getAttribute('data-id'));
    if (act === 'resume') return resumeDraft(b.getAttribute('data-id'));
    if (act === 'draft-del') return deleteDraft(b.getAttribute('data-id'));
    if (!d) return;
    if (act === 'tab') { S.tab = b.getAttribute('data-tab'); S.preview = 'question'; if (S.msg && S.msg.kind !== 'err') setMsg(); renderPanel(); root.scrollTo(0, 0); return; }
    if (act === 'q-sel') { S.q = i; renderPanel(); return; }
    if (act === 'q-new') {
      var prev = d.questions[S.q];
      S.q = PS.addQuestion(d, d.questions.length ? S.q + 1 : 0);
      if (prev) ['category', 'topic', 'seconds', 'difficulty'].forEach(function (k) { if (prev[k] != null && prev[k] !== '') d.questions[S.q][k] = prev[k]; });
      S.filter = '';
      structural();
      var ta = $('[data-bind="q.question"]');
      if (ta) ta.focus();
      return;
    }
    if (act === 'q-dup') { S.q = PS.duplicateQuestion(d, S.q); structural(); setMsg('ok', 'Domanda duplicata: la copia è la numero ' + (S.q + 1) + '.'); return; }
    if (act === 'q-up' || act === 'q-down') { S.q = PS.moveQuestion(d, S.q, act === 'q-up' ? -1 : 1); structural(); return; }
    if (act === 'q-del') {
      var q = d.questions[S.q];
      ask('Eliminare la domanda ' + (S.q + 1) + '?', '«' + esc(clip(q.question, 140) || 'domanda senza testo') + '»', [{ v: 'del', label: 'ELIMINA', cls: 'red' }, { v: '', label: 'ANNULLA' }]).then(function (v) {
        if (v !== 'del') return;
        S.q = Math.max(0, PS.deleteQuestion(d, S.q));
        structural();
      });
      return;
    }
    if (act === 'g-sel') { S.g = { type: b.getAttribute('data-type'), index: i }; S.preview = 'question'; renderPanel(); return; }
    if (act === 'g-new') { var t = b.getAttribute('data-type'); S.g = { type: t, index: PS.addGame(d, t) }; S.preview = 'question'; structural(); return; }
    if (act === 'g-dup') { S.g.index = PS.duplicateGame(d, S.g.type, S.g.index); structural(); return; }
    if (act === 'g-up' || act === 'g-down') { S.g.index = PS.moveGame(d, S.g.type, S.g.index, act === 'g-up' ? -1 : 1); structural(); return; }
    if (act === 'g-del') {
      var g = curGame();
      ask('Eliminare la manche?', esc(PS.GAME_LABELS[S.g.type]) + ' «' + esc(g.label || 'senza titolo') + '»', [{ v: 'del', label: 'ELIMINA', cls: 'red' }, { v: '', label: 'ANNULLA' }]).then(function (v) {
        if (v !== 'del') return;
        var j = PS.deleteGame(d, S.g.type, S.g.index);
        S.g = j >= 0 ? { type: S.g.type, index: j } : firstGame();
        structural();
      });
      return;
    }
    if (act === 'ind-sol') { var gg = curGame(); gg.subject = String((gg.candidates || [])[Number(b.getAttribute('data-k'))] || '').trim(); structural(); return; }
    if (act === 'arr-add' || act === 'arr-del') { arrayAction(act, b.getAttribute('data-arr'), Number(b.getAttribute('data-k'))); return; }
    if (act === 'acc-add' || act === 'acc-del' || act === 'acc-up') { acceptedAction(act, b.getAttribute('data-path'), Number(b.getAttribute('data-k'))); return; }
    if (act === 'chain-paste') {
      var links = PS.parseChainText(($('#stChainText') || {}).value);
      if (!links.length) { setMsg('err', 'Scrivi almeno due parole separate da | (barra verticale).'); return; }
      curGame().links = links.slice(0, 20);
      structural();
      setMsg('ok', 'Catena inserita: ' + plural(Math.min(20, links.length), 'collegamento', 'collegamenti') + '.');
      return;
    }
    if (act === 'clear-img') { setPath(b.getAttribute('data-path'), ''); structural(); return; }
    if (act === 'img-del') { deleteImage(b.getAttribute('data-name')); return; }
    if (act === 'bump') { d.manifest.version = PS.bumpVersion(d.manifest.version); structural(true); return; }
    if (act === 'prev') { S.preview = b.getAttribute('data-mode'); var col = $('.stPreviewCol'); if (col) col.outerHTML = previewPane(); return; }
    if (act === 'goto') { gotoIssue(b.getAttribute('data-kind'), b.hasAttribute('data-i') ? i : null, b.getAttribute('data-type')); return; }
    if (act === 'save') { save(); return; }
    if (act === 'export') { exportZip(); return; }
    if (act === 'close') { closeEditor(); }
  }
  function onInput(e) {
    var el = e.target;
    if (el.id === 'stFilter') { S.filter = el.value; var sc = $('.stListScroll'); if (sc) sc.innerHTML = questionRows(); return; }
    if (!S.draft || !el.hasAttribute('data-bind')) return;
    if (el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    apply(el);
  }
  function onChange(e) {
    var el = e.target;
    if (el.id === 'stOpenFile') { if (el.files && el.files[0]) openFile(el.files[0]); el.value = ''; return; }
    if (el.id === 'stShrink') { S.shrink = el.checked; savePrefs(); return; }
    if (el.id === 'stAutoBump') { S.autoBump = el.checked; savePrefs(); return; }
    if (!S.draft) return;
    if (el.hasAttribute('data-upload')) { var files = el.files; uploadInto(el.getAttribute('data-upload'), files).then(function () { el.value = ''; }); return; }
    if (el.hasAttribute('data-rename')) { renameImage(el.getAttribute('data-rename'), el.value); return; }
    if (!el.hasAttribute('data-bind')) return;
    if (el.type === 'radio' || el.tagName === 'SELECT') { apply(el); renderPanel(); }
  }
  function onKey(e) {
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-rename')) { e.preventDefault(); e.target.blur(); }
  }

  /* ---------------- trascinamento dei file ---------------- */
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  function onDrop(e) {
    doc.body.classList.remove('stDragging');
    if (!hasFiles(e)) return;
    e.preventDefault();
    var files = e.dataTransfer.files;
    if (!files || !files.length || S.busy) return;
    if (S.view === 'start' || /\.(zip|json)$/i.test(files[0].name)) {
      if (S.view === 'edit' && unsaved()) { setMsg('err', 'Per aprire un altro pacchetto chiudi prima quello in modifica (la bozza resta salvata).'); return; }
      openFile(files[0]);
      return;
    }
    var picker = e.target.closest && e.target.closest('.stPicker');
    uploadInto(picker ? picker.getAttribute('data-path') : '', files);
  }

  /* ---------------- avvio ---------------- */
  function init() {
    if (!PS || !PL || !client || !Drafts) { app.innerHTML = '<p class="bad">Pack Studio non può partire: file del programma mancanti.</p>'; return; }
    loadPrefs();
    app.addEventListener('click', onClick);
    app.addEventListener('input', onInput);
    app.addEventListener('change', onChange);
    app.addEventListener('keydown', onKey);
    app.addEventListener('submit', function (e) { e.preventDefault(); if (e.target.id === 'stNewForm') createNew(e.target); });
    doc.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); doc.body.classList.add('stDragging'); } });
    doc.addEventListener('dragleave', function (e) { if (!e.relatedTarget) doc.body.classList.remove('stDragging'); });
    doc.addEventListener('drop', onDrop);
    root.addEventListener('beforeunload', function (e) {
      if (S.view !== 'edit' || !unsaved()) return undefined;
      var pending = !!S.autoTimer;
      if (pending) autosave();
      if (S.persistent && !pending) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
    var m = /[?&]pack=([^&]+)/.exec(root.location.search);
    loadStart().then(function () {
      if (m) {
        var id = decodeURIComponent(m[1]);
        var p = (S.library || []).filter(function (x) { return x.id === id; })[0];
        if (p && p.ok && p.exportable) openFromLibrary(id);
        else if (p) { S.startMsg = { kind: 'err', html: '«' + esc(p.summary.title) + '» è un pacchetto del programma: per modificarlo avvia il Secchione con AVVIA_IL_SECCHIONE.bat.' }; renderStart(); }
      }
    });
  }

  root.SecchioneStudio = { state: S, ask: ask, save: save, exportZip: exportZip };
  init();
})(typeof self !== 'undefined' ? self : this);
