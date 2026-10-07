/*
 * Il Secchione · packstudio.js — modello di Pack Studio (editor dei pacchetti per docenti).
 * Funzioni pure su una "bozza" di pacchetto: nessun DOM, nessun disco. Usato dalla pagina studio.html e dai test.
 *
 * Bozza = { manifest, questions[], games{tipo:[]}, images{nome: Uint8Array}, origin{...} }
 * - le domande e le manche restano nella forma del formato pack (PACK_FORMAT.md), con eventuali campi extra conservati
 * - le immagini stanno SEMPRE direttamente in images/ (nessuna sottocartella: la pubblicazione in LAN
 *   della baseline espone solo images/<nome>)
 * - la validazione usa le stesse regole del Gestore Pacchetti (packs.js + packlib.js) e indica dove correggere
 */
(function (root, factory) {
  var node = typeof module !== 'undefined' && module.exports;
  var api = factory(node ? require('./packs.js') : root.SecchionePackEngine, node ? require('./packlib.js') : root.SecchionePackLib, node ? require('../lib/zip.js') : root.SecchioneZip,
    node ? require('./answerMatcher.js') : root.SecchioneAnswerMatcher);
  if (node) module.exports = api;
  if (root) root.SecchionePackStudio = api;
})(typeof self !== 'undefined' ? self : this, function (PE, PL, Z, AM) {
  'use strict';

  var GAME_TYPES = PE.GAME_TYPES;
  var LETTERS = ['A', 'B', 'C', 'D'];
  var MAX_TAGS = 10;
  var GAME_LABELS = { photopuzzle: 'Photopuzzle', indovina: 'Indovina', abbinamenti: 'Abbinamenti', ghigliottina: 'Parola Segreta', chain: 'Staffetta di parole' };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function str(v) { return typeof v === 'string' ? v.trim() : ''; }
  function fold(s) {
    var x = String(s || '');
    if (x.normalize) x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return x;
  }

  /* ---------------- bozza ---------------- */
  function emptyGames() { var g = {}; GAME_TYPES.forEach(function (t) { g[t] = []; }); return g; }

  function newDraft(opts) {
    var o = opts || {};
    var title = str(o.title) || 'Nuovo pacchetto';
    return {
      manifest: {
        format: PE.FORMAT, formatVersion: PE.FORMAT_VERSION,
        id: o.id || PL.slug(title),
        title: title, subtitle: '', subject: str(o.subject), grade: o.grade == null ? null : o.grade, gradeLabel: '',
        author: str(o.author), version: '1.0.0', description: '', language: 'it', license: '',
        theme: { eyebrow: 'IL SECCHIONE', accent: '#57d8ff', accent2: '#f5bd63', homeImage: '', tags: [] },
        texts: {}, gameNames: {}
      },
      questions: [],
      games: emptyGames(),
      images: {},
      origin: { kind: 'new', libraryId: null, loadedVersion: null, createdAt: new Date().toISOString() }
    };
  }

  /** Bozza da un pacchetto letto con PackLib.readImport (zip, json o edizione v3). Le immagini annidate vengono appiattite. */
  function draftFromImport(raw, origin) {
    var full = clone(raw.full);
    var images = {};
    Object.keys(raw.images || {}).forEach(function (k) { images[k] = raw.images[k]; });
    // immagini incorporate (data:) nei pack .json: diventano file in images/
    if (PL.extractInlineImages) PL.extractInlineImages(full, images);
    var questions = Array.isArray(full.questions) ? full.questions : [];
    var gsrc = isObj(full.games) && isObj(full.games.games) ? full.games.games : (isObj(full.games) ? full.games : {});
    var games = emptyGames();
    GAME_TYPES.forEach(function (t) { if (Array.isArray(gsrc[t])) games[t] = gsrc[t]; });
    var manifest = full;
    delete manifest.questions;
    delete manifest.games;
    delete manifest.imageBase;
    delete manifest.files;
    manifest.format = PE.FORMAT;
    manifest.formatVersion = PE.FORMAT_VERSION;
    manifest.theme = isObj(manifest.theme) ? manifest.theme : {};
    manifest.texts = isObj(manifest.texts) ? manifest.texts : {};
    manifest.gameNames = isObj(manifest.gameNames) ? manifest.gameNames : {};
    // prefissi legacy delle edizioni v3 (es. "romana/"): tolti dai riferimenti, come fa il motore
    var prefix = manifest.legacy && manifest.legacy.imagePrefix;
    var d = { manifest: manifest, questions: questions, games: games, images: images, origin: Object.assign({ kind: raw.kind || 'zip', loadedVersion: manifest.version || null }, origin || {}) };
    if (prefix) renameRefs(d, function (n) { return n && n.indexOf(prefix) === 0 ? n.slice(prefix.length) : n; });
    var flattened = flattenImages(d);
    d.origin.flattened = flattened;
    return d;
  }

  /* ---------------- immagini (piatte) ---------------- */
  var IMG_EXT = { jpg: true, jpeg: true, png: true, webp: true, gif: true };

  /** Nome file sicuro, senza cartelle, unico nel pacchetto. */
  function sanitizeImageName(name, taken) {
    var base = String(name || 'immagine').split(/[\\/]/).pop();
    var m = /^(.*?)(?:\.([A-Za-z0-9]+))?$/.exec(base);
    var stem = fold(m[1]).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'immagine';
    var e = (m[2] || '').toLowerCase();
    if (e === 'jpeg') e = 'jpg';
    if (!IMG_EXT[e]) e = 'png';
    var t = taken || {};
    var candidate = stem + '.' + e;
    for (var n = 2; t[candidate]; n++) candidate = stem + '_' + n + '.' + e;
    return candidate;
  }

  /** Estensione corretta in base ai primi byte (il nome dato dall'utente può mentire). */
  function detectImageExt(bytes) {
    var b = bytes;
    if (!b || b.length < 12) return null;
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    return null;
  }

  /** Aggiunge un'immagine. Restituisce {ok, name, error}. */
  function addImage(d, fileName, bytes) {
    var e = detectImageExt(bytes);
    if (!e) return { ok: false, error: '"' + fileName + '" non è un\'immagine JPG, PNG, WEBP o GIF' };
    if (bytes.length > PL.LIMITS.maxImageBytes) return { ok: false, error: '"' + fileName + '" è troppo grande (massimo ' + Math.round(PL.LIMITS.maxImageBytes / 1048576) + ' MB)' };
    if (Object.keys(d.images).length >= PL.LIMITS.maxImages) return { ok: false, error: 'troppe immagini nel pacchetto' };
    var stem = String(fileName || 'immagine').split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]+$/, '');
    var name = sanitizeImageName(stem + '.' + e, d.images);
    d.images[name] = bytes;
    return { ok: true, name: name };
  }

  function forEachRef(d, fn) {
    d.questions.forEach(function (q, i) {
      if (q.image) fn(q.image, { kind: 'question', index: i }, function (v) { q.image = v; });
      if (Array.isArray(q.media)) q.media.forEach(function (m) { if (m && m.src) fn(m.src, { kind: 'question', index: i }, function (v) { m.src = v; }); });
    });
    (d.games.photopuzzle || []).forEach(function (s, i) { if (s.image) fn(s.image, { kind: 'game', type: 'photopuzzle', index: i }, function (v) { s.image = v; }); });
    (d.games.abbinamenti || []).forEach(function (s, i) { (s.cards || []).forEach(function (c) { if (c && c.img) fn(c.img, { kind: 'game', type: 'abbinamenti', index: i }, function (v) { c.img = v; }); }); });
    if (d.manifest.theme && d.manifest.theme.homeImage) fn(d.manifest.theme.homeImage, { kind: 'manifest' }, function (v) { d.manifest.theme.homeImage = v; });
  }

  function renameRefs(d, mapFn) { forEachRef(d, function (name, where, set) { var n = mapFn(name); if (n !== name) set(n); }); }

  /** Dove è usata ogni immagine: {nome: [{kind, index, type}]} */
  function imageUsage(d) {
    var u = {};
    Object.keys(d.images).forEach(function (n) { u[n] = []; });
    forEachRef(d, function (name, where) { (u[name] = u[name] || []).push(where); });
    return u;
  }

  /** Rinomina un'immagine aggiornando tutti i riferimenti. */
  function renameImage(d, oldName, newName) {
    if (!d.images[oldName]) return { ok: false, error: 'immagine non trovata' };
    var taken = {};
    Object.keys(d.images).forEach(function (n) { if (n !== oldName) taken[n] = true; });
    var e = /\.([a-z0-9]+)$/i.exec(oldName);
    var target = sanitizeImageName(String(newName || '').replace(/\.[A-Za-z0-9]+$/, '') + '.' + (e ? e[1] : 'png'), taken);
    if (target === oldName) return { ok: true, name: oldName };
    d.images[target] = d.images[oldName];
    delete d.images[oldName];
    renameRefs(d, function (n) { return n === oldName ? target : n; });
    return { ok: true, name: target };
  }

  /** Elimina un'immagine. Se è usata serve force=true e i riferimenti vengono svuotati. */
  function removeImage(d, name, force) {
    var used = (imageUsage(d)[name] || []).length;
    if (used && !force) return { ok: false, used: used, error: 'immagine usata in ' + used + ' punti' };
    delete d.images[name];
    if (used) renameRefs(d, function (n) { return n === name ? '' : n; });
    return { ok: true, cleared: used };
  }

  /** Porta in images/ le immagini che stavano in sottocartelle (rinominandole e aggiornando i riferimenti). */
  function flattenImages(d) {
    var moved = [];
    Object.keys(d.images).forEach(function (n) {
      if (n.indexOf('/') < 0) return;
      var taken = {};
      Object.keys(d.images).forEach(function (k) { if (k !== n) taken[k] = true; });
      var flat = sanitizeImageName(n.replace(/\//g, '_'), taken);
      d.images[flat] = d.images[n];
      delete d.images[n];
      renameRefs(d, function (r) { return r === n ? flat : r; });
      moved.push({ from: n, to: flat });
    });
    return moved;
  }

  /* ---------------- domande ---------------- */
  function nextQuestionId(d) {
    var used = {};
    d.questions.forEach(function (q) { used[q.id] = true; });
    for (var n = d.questions.length + 1; ; n++) {
      var id = 'q' + String(n).padStart(3, '0');
      if (!used[id]) return id;
    }
  }

  function blankQuestion(d) {
    return {
      id: nextQuestionId(d), type: 'mcq', question: '', options: ['', '', '', ''], correct: 'A', explanation: '',
      difficulty: 1, category: '', topic: '', tags: [], image: '', status: 'approved'
    };
  }

  function addQuestion(d, at) {
    var q = blankQuestion(d);
    var i = at == null ? d.questions.length : Math.max(0, Math.min(d.questions.length, at));
    d.questions.splice(i, 0, q);
    return i;
  }

  function duplicateQuestion(d, i) {
    var src = d.questions[i];
    if (!src) return -1;
    var q = clone(src);
    q.id = nextQuestionId(d);
    d.questions.splice(i + 1, 0, q);
    return i + 1;
  }

  function deleteQuestion(d, i) { if (d.questions[i]) d.questions.splice(i, 1); return Math.min(i, d.questions.length - 1); }

  function moveQuestion(d, i, delta) {
    var j = i + delta;
    if (!d.questions[i] || j < 0 || j >= d.questions.length) return i;
    var x = d.questions[i];
    d.questions[i] = d.questions[j];
    d.questions[j] = x;
    return j;
  }

  /** Testo libero "storia, roma antica" → ["storia", "roma antica"] (max 10, 30 caratteri ciascuno). */
  function parseTags(text) {
    var seen = {};
    return String(text || '').split(/[,;\n]/).map(function (t) { return t.trim().slice(0, 30); }).filter(function (t) {
      var k = t.toLowerCase();
      if (!t || seen[k]) return false;
      seen[k] = true;
      return true;
    }).slice(0, MAX_TAGS);
  }

  /* ---------------- manche speciali ---------------- */
  function blankGame(type) {
    var base = { label: '', theme: '' }; // durata: tempo standard del tipo (engine/timer.js) finché il docente non la cambia
    if (type === 'photopuzzle') return Object.assign(base, { image: '', answer: '' });
    if (type === 'indovina') return Object.assign(base, { subject: '', candidates: ['', '', '', ''], clues: ['', '', ''] });
    if (type === 'abbinamenti') return Object.assign(base, { cards: [0, 1, 2, 3].map(function (i) { return { img: '', title: 'Immagine ' + (i + 1) }; }), names: ['', '', '', ''] });
    if (type === 'ghigliottina') return Object.assign(base, { answer: '', pairs: [0, 1, 2, 3, 4].map(function () { return ['', '']; }) });
    if (type === 'chain') return Object.assign(base, { links: [{ from: '', to: '' }] });
    throw new Error('tipo di manche sconosciuto: ' + type);
  }

  /*
   * RC2-A.3 · Abbinamenti nello Studio: il docente scrive le voci (A, B, C, D) nell'ordine che vuole e sceglie per ogni immagine la voce giusta.
   * Nel pacchetto resta il formato di sempre: names[i] = voce corretta dell'immagine i (in gara le lettere vengono comunque mescolate).
   * terms e match sono solo dati della bozza: la validazione del pacchetto non li salva.
   */
  function matchingModel(g) {
    var n = ((g && g.cards) || []).length || 4;
    var names = ((g && g.names) || []).map(function (v) { return v == null ? '' : String(v); });
    var terms = Array.isArray(g && g.terms) && g.terms.length === n ? g.terms.map(function (v) { return v == null ? '' : String(v); }) : names.slice(0, n);
    while (terms.length < n) terms.push('');
    var match = Array.isArray(g && g.match) && g.match.length === n ? g.match.map(function (k) { var x = Math.floor(Number(k)); return x >= 0 && x < n ? x : 0; }) : terms.map(function (_, i) { return i; });
    return { terms: terms, match: match };
  }
  function applyMatching(g, terms, match) {
    var m = matchingModel({ cards: g.cards, names: g.names, terms: terms || g.terms, match: match || g.match });
    g.terms = m.terms;
    g.match = m.match;
    g.names = m.match.map(function (k) { return m.terms[k] == null ? '' : m.terms[k]; });
    return g;
  }
  /** Ogni voce va abbinata a una sola immagine: messaggi chiari per lo Studio. */
  function matchingIssues(g) {
    if (!g || !Array.isArray(g.match)) return [];
    var used = {}, out = [];
    g.match.forEach(function (k, i) { (used[k] = used[k] || []).push(i + 1); });
    Object.keys(used).forEach(function (k) {
      if (used[k].length > 1) out.push('la voce ' + LETTERS[k] + ' è abbinata a più immagini (' + used[k].join(' e ') + '): ogni voce va con una sola immagine');
    });
    ((g.terms || [])).forEach(function (t, k) { if (!used[k] && String(t || '').trim()) out.push('la voce ' + LETTERS[k] + ' non è abbinata a nessuna immagine'); });
    return out;
  }

  function addGame(d, type) {
    if (GAME_TYPES.indexOf(type) < 0) throw new Error('tipo di manche sconosciuto: ' + type);
    d.games[type].push(blankGame(type));
    return d.games[type].length - 1;
  }
  function duplicateGame(d, type, i) {
    var src = d.games[type] && d.games[type][i];
    if (!src) return -1;
    var g = clone(src);
    g.label = (String(g.label || '') + ' (copia)').slice(0, 80);
    d.games[type].splice(i + 1, 0, g);
    return i + 1;
  }
  function deleteGame(d, type, i) { if (d.games[type] && d.games[type][i]) d.games[type].splice(i, 1); return Math.min(i, d.games[type].length - 1); }
  function moveGame(d, type, i, delta) {
    var list = d.games[type] || [];
    var j = i + delta;
    if (!list[i] || j < 0 || j >= list.length) return i;
    var x = list[i];
    list[i] = list[j];
    list[j] = x;
    return j;
  }

  /** "A | B | C" oppure righe "PARTENZA | ARRIVO" → collegamenti della Staffetta. */
  function parseChainText(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return [];
    if (lines.length === 1) {
      var t = lines[0].split('|').map(function (x) { return x.trim(); }).filter(Boolean);
      return t.slice(0, -1).map(function (from, i) { return { from: from, to: t[i + 1] }; });
    }
    var out = [];
    lines.forEach(function (l) {
      var t2 = l.split('|').map(function (x) { return x.trim(); }).filter(Boolean);
      for (var i = 0; i < t2.length - 1; i++) out.push({ from: t2[i], to: t2[i + 1] });
    });
    return out;
  }

  /* ---------------- pacchetto completo e validazione ---------------- */
  /** Oggetto pack "completo" (manifest + questions + games) pronto per packs.js / packlib.js. */
  function toFull(d) {
    var full = clone(d.manifest);
    full.questions = clone(d.questions).map(function (q) {
      if (Array.isArray(q.tags) && !q.tags.length) delete q.tags;
      return q;
    });
    var games = {};
    GAME_TYPES.forEach(function (t) { if ((d.games[t] || []).length) games[t] = clone(d.games[t]).map(function (g) { return cleanGameAccepted(t, g); }); });
    full.games = { games: games };
    return full;
  }

  /* ---------------- risposte alternative accettate (acceptedAnswers) ---------------- */
  var ACCEPTED_MAIN = { photopuzzle: 'answer', indovina: 'subject', ghigliottina: 'answer' };
  function normAnswer(s) {
    if (AM && typeof AM.normalize === 'function') return AM.normalize(s);
    return String(s == null ? '' : s).trim().toLowerCase();
  }
  /** Niente vuoti, niente doppioni dopo la normalizzazione dell'answerMatcher, niente copie della risposta principale. */
  function cleanAccepted(main, list) {
    var seen = {};
    var m = normAnswer(main);
    if (m) seen[m] = true;
    return (Array.isArray(list) ? list : []).map(function (v) { return String(v == null ? '' : v).trim(); }).filter(function (v) {
      var k = normAnswer(v);
      if (!v || !k || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }
  function cleanGameAccepted(type, g) {
    if (!g || typeof g !== 'object') return g;
    if (type === 'chain') {
      (g.links || []).forEach(function (l) {
        if (!l || l.acceptedAnswers == null) return;
        var c = cleanAccepted(l.to, l.acceptedAnswers);
        if (c.length) l.acceptedAnswers = c; else delete l.acceptedAnswers;
      });
      return g;
    }
    if (g.acceptedAnswers != null) {
      var list = cleanAccepted(ACCEPTED_MAIN[type] ? g[ACCEPTED_MAIN[type]] : '', g.acceptedAnswers);
      if (list.length) g.acceptedAnswers = list; else delete g.acceptedAnswers;
    }
    return g;
  }
  /** Quante alternative scritte verrebbero ignorate (vuote o doppioni): per l'avviso nel Controllo. */
  function ignoredAccepted(type, g) {
    if (!g) return 0;
    if (type === 'chain') return (g.links || []).reduce(function (n, l) { return n + (l && Array.isArray(l.acceptedAnswers) ? l.acceptedAnswers.length - cleanAccepted(l.to, l.acceptedAnswers).length : 0); }, 0);
    return Array.isArray(g.acceptedAnswers) ? g.acceptedAnswers.length - cleanAccepted(ACCEPTED_MAIN[type] ? g[ACCEPTED_MAIN[type]] : '', g.acceptedAnswers).length : 0;
  }

  function where(kind, index, type) { var w = { kind: kind }; if (index != null) w.index = index; if (type) w.type = type; return w; }

  /**
   * Controllo completo prima di salvare o esportare.
   * Restituisce {ok, errors:[{where, message}], warnings:[{where, message}], pack (normalizzato), images}
   */
  function validate(d) {
    var errors = [];
    var warnings = [];
    function err(w, m) { errors.push({ where: w, message: m }); }
    function warn(w, m) { warnings.push({ where: w, message: m }); }
    var m = d.manifest || {};
    if (!str(m.title)) err(where('manifest'), 'manca il titolo del pacchetto');
    else if (str(m.title).length > 60) err(where('manifest'), 'titolo troppo lungo (massimo 60 caratteri)');
    if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(String(m.id || ''))) err(where('manifest'), 'codice del pacchetto non valido: da 2 a 40 caratteri, solo minuscole, numeri, _ e -');
    if (!str(m.version)) err(where('manifest'), 'manca la versione (es. 1.0.0)');
    if (m.grade != null && m.grade !== '' && !(Number(m.grade) >= 1 && Number(m.grade) <= 13)) err(where('manifest'), 'la classe deve essere un numero da 1 a 13');
    if (!str(m.subject)) warn(where('manifest'), 'materia non indicata');
    // immagini: solo direttamente in images/
    Object.keys(d.images).forEach(function (n) {
      if (n.indexOf('/') >= 0 || n.indexOf('\\') >= 0) err(where('image'), 'l\'immagine "' + n + '" è in una sottocartella: le immagini devono stare direttamente in images/');
    });
    // domande, una per una (per indicare quale correggere)
    var ids = {};
    var approved = 0;
    d.questions.forEach(function (q, i) {
      try {
        var nq = PE.normalizeQuestion(q, i, { ids: ids });
        if (nq.status === 'approved') approved++;
      } catch (e) { err(where('question', i), e.message.replace(/^domanda \d+: /, '')); }
      if (q && q.image && !d.images[q.image] && !/^data:/i.test(q.image)) err(where('question', i), 'immagine "' + q.image + '" non presente nel pacchetto');
      if (q && q.tags != null && (!Array.isArray(q.tags) || q.tags.length > MAX_TAGS || q.tags.some(function (t) { return typeof t !== 'string' || !t.trim() || t.length > 30; }))) err(where('question', i), 'tag non validi (massimo 10, 30 caratteri ciascuno)');
      if (q && !str(q.explanation)) warn(where('question', i), 'senza spiegazione (comparirebbe vuota alla soluzione)');
    });
    if (!d.questions.length) err(where('questions'), 'il pacchetto non ha domande');
    else if (!approved) err(where('questions'), 'nessuna domanda è "approvata": le bozze non vanno in gara');
    // manche speciali
    GAME_TYPES.forEach(function (t) {
      (d.games[t] || []).forEach(function (g, i) {
        try { PE.validateGame(t, cleanGameAccepted(t, clone(g))); } catch (e) { err(where('game', i, t), e.message); }
        var ign = ignoredAccepted(t, g);
        if (ign > 0) warn(where('game', i, t), ign === 1 ? '1 risposta alternativa vuota o doppia verrà ignorata' : ign + ' risposte alternative vuote o doppie verranno ignorate');
        if (t === 'photopuzzle' && g.image && !d.images[g.image]) err(where('game', i, t), 'immagine "' + g.image + '" non presente nel pacchetto');
        if (t === 'abbinamenti') matchingIssues(g).forEach(function (msg) { err(where('game', i, t), msg); });
        if (t === 'abbinamenti') (g.cards || []).forEach(function (c, k) { if (c && c.img && !d.images[c.img]) err(where('game', i, t), 'immagine ' + (k + 1) + ' ("' + c.img + '") non presente nel pacchetto'); });
      });
    });
    if (m.theme && m.theme.homeImage && !d.images[m.theme.homeImage]) err(where('manifest'), 'immagine della home "' + m.theme.homeImage + '" non presente nel pacchetto');
    // controllo finale con le stesse regole del Gestore Pacchetti (importazione)
    var full = toFull(d);
    var res = PL.validateImport({ full: full, images: d.images, warnings: [] });
    var known = errors.map(function (e) { return e.message; }).join('\n');
    res.errors.forEach(function (e) {
      var short = e.replace(/^domanda \d+: /, '');
      if (known.indexOf(short) < 0 && known.indexOf(e) < 0) err(where('pack'), e);
    });
    var usage = imageUsage(d);
    var unused = Object.keys(usage).filter(function (n) { return !usage[n].length; });
    if (unused.length) warn(where('image'), (unused.length === 1 ? '1 immagine non usata: ' : unused.length + ' immagini non usate: ') + unused.slice(0, 5).join(', ') + (unused.length > 5 ? '…' : ''));
    var drafts = d.questions.length - approved;
    if (drafts > 0 && approved) warn(where('questions'), drafts === 1 ? '1 domanda in bozza o da rivedere non andrà in gara' : drafts + ' domande in bozza o da rivedere non andranno in gara');
    return { ok: errors.length === 0, errors: errors, warnings: warnings, pack: res.pack, images: d.images };
  }

  /** File dello zip (stesso formato dell'ESPORTA del Gestore Pacchetti). Lancia un errore se la bozza non è valida. */
  function toZip(d, when) {
    var v = validate(d);
    if (!v.ok) {
      var e = new Error('il pacchetto contiene errori: ' + v.errors[0].message);
      e.validation = v;
      throw e;
    }
    return { bytes: Z.zip(PL.packFiles(v.pack, d.images), when), filename: v.pack.id + '_v' + String(v.pack.version).replace(/[^\w.-]/g, '') + '.zip', pack: v.pack };
  }

  /** 1.0.0 → 1.0.1 ; "2" → "2.0.1" ; "1.2.3-copia" → "1.2.4" */
  function bumpVersion(v) {
    var m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(v || ''));
    if (!m) return '1.0.1';
    return (Number(m[1]) || 0) + '.' + (Number(m[2]) || 0) + '.' + ((Number(m[3]) || 0) + 1);
  }

  /** Impronta del contenuto della bozza (per capire se è cambiata dall'ultimo salvataggio). */
  function contentKey(d) {
    var imgs = Object.keys(d.images).sort().map(function (n) { return n + ':' + d.images[n].length + ':' + Z.crc32(d.images[n]); });
    var b = Z.utf8Encode(JSON.stringify({ m: d.manifest, q: d.questions, g: d.games, i: imgs }));
    return Z.crc32(b).toString(16) + '-' + b.length.toString(36);
  }

  function summary(d) {
    var g = {};
    var total = 0;
    GAME_TYPES.forEach(function (t) { g[t] = (d.games[t] || []).length; total += g[t]; });
    return {
      id: d.manifest.id, title: d.manifest.title, version: d.manifest.version,
      questions: d.questions.length, approved: d.questions.filter(function (q) { return (q.status || 'approved') === 'approved'; }).length,
      games: total, gamesByType: g, images: Object.keys(d.images).length
    };
  }

  /** Bozza → oggetto serializzabile (per l'archivio delle bozze). Le immagini restano byte. */
  function serialize(d) {
    return { manifest: clone(d.manifest), questions: clone(d.questions), games: clone(d.games), images: d.images, origin: clone(d.origin || {}) };
  }

  function deserialize(o) {
    var d = { manifest: o.manifest, questions: o.questions || [], games: Object.assign(emptyGames(), o.games || {}), images: {}, origin: o.origin || {} };
    Object.keys(o.images || {}).forEach(function (k) { var b = o.images[k]; d.images[k] = b instanceof Uint8Array ? b : new Uint8Array(b); });
    return d;
  }

  return {
    GAME_TYPES: GAME_TYPES, GAME_LABELS: GAME_LABELS, LETTERS: LETTERS, MAX_TAGS: MAX_TAGS,
    newDraft: newDraft, draftFromImport: draftFromImport,
    sanitizeImageName: sanitizeImageName, detectImageExt: detectImageExt, addImage: addImage, imageUsage: imageUsage,
    renameImage: renameImage, removeImage: removeImage, flattenImages: flattenImages,
    nextQuestionId: nextQuestionId, blankQuestion: blankQuestion, addQuestion: addQuestion, duplicateQuestion: duplicateQuestion,
    deleteQuestion: deleteQuestion, moveQuestion: moveQuestion, parseTags: parseTags,
    blankGame: blankGame, addGame: addGame, matchingModel: matchingModel, applyMatching: applyMatching, matchingIssues: matchingIssues, duplicateGame: duplicateGame, deleteGame: deleteGame, moveGame: moveGame, parseChainText: parseChainText,
    cleanAccepted: cleanAccepted, ACCEPTED_MAIN: ACCEPTED_MAIN,
    toFull: toFull, validate: validate, toZip: toZip, bumpVersion: bumpVersion, contentKey: contentKey, summary: summary,
    serialize: serialize, deserialize: deserialize
  };
});
