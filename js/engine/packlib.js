/*
 * Il Secchione · packlib.js — Gestore Pacchetti (libreria locale di pack).
 * Comune a browser (anche file://), server Node e riga di comando. Non conosce il motore di gara:
 * produce solo contenuti validati e la loro provenienza.
 *
 *  - lettura di pacchetti .zip (o .json in file singolo) conformi a PACK_FORMAT.md
 *  - conversione automatica delle edizioni v3 (cartella con js/packs.js e immagini/)
 *  - validazione completa: dati, immagini citate presenti, nomi sicuri, firme dei file immagine
 *  - installazione senza sovrascrivere: collisione di id → nuovo id; contenuto identico → "già installato"
 *  - duplicazione, esportazione .zip, eliminazione (spostamento nel cestino dell'archiviazione)
 *  - composizione di sessioni con più pack: id domanda qualificati "packId/idOriginale" + provenienza
 *
 * L'archiviazione è delegata ad "adattatori" (disco, IndexedDB, memoria) con la stessa interfaccia.
 */
(function (root, factory) {
  var node = typeof module !== 'undefined' && module.exports;
  var api = factory(node ? require('./packs.js') : root.SecchionePackEngine, node ? require('../lib/zip.js') : root.SecchioneZip);
  if (node) module.exports = api;
  if (root) root.SecchionePackLib = api;
})(typeof self !== 'undefined' ? self : this, function (PE, Z) {
  'use strict';

  var LIMITS = {
    maxArchiveBytes: 300 * 1048576,
    maxFiles: 3000,
    maxExtracted: 400 * 1048576,
    maxImageBytes: 15 * 1048576,
    maxImages: 2000
  };
  var IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  var IGNORED = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;
  var ID_SEP = '/';

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function text(bytes) { return Z.utf8Decode(bytes).replace(/^﻿/, ''); }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }
  function slug(s) {
    var x = String(s || '').toLowerCase().normalize ? String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : String(s || '').toLowerCase();
    x = x.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
    return /^[a-z0-9]/.test(x) && x.length >= 2 ? x : 'pack_' + x;
  }
  function hex8(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }

  /* ---------------- immagini ---------------- */
  /** Controlla che i byte siano davvero un'immagine del tipo indicato dall'estensione. */
  function imageSignatureOk(name, b) {
    var e = ext(name);
    if (!b || b.length < 12) return false;
    if (e === 'jpg' || e === 'jpeg') return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
    if (e === 'png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    if (e === 'gif') return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
    if (e === 'webp') return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    return false;
  }

  function base64ToBytes(b64) {
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Immagini "data:" incorporate (pack in file singolo) → file veri in images/. */
  function extractInlineImages(full, images) {
    var n = 0;
    function take(src) {
      var m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/i.exec(String(src || ''));
      if (!m) return src;
      var e = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
      var name;
      do { name = 'incorporata-' + (++n) + '.' + e; } while (images[name]);
      images[name] = base64ToBytes(m[2]);
      return name;
    }
    (full.questions || []).forEach(function (q) {
      if (q && q.image) q.image = take(q.image);
      if (q && Array.isArray(q.media)) q.media.forEach(function (m) { if (m && typeof m === 'object' && m.src) m.src = take(m.src); });
    });
    var g = isObj(full.games) && isObj(full.games.games) ? full.games.games : full.games;
    if (isObj(g)) {
      (g.photopuzzle || []).forEach(function (s) { if (s) s.image = take(s.image); });
      (g.abbinamenti || []).forEach(function (s) { (s && s.cards || []).forEach(function (c) { if (c) c.img = take(c.img); }); });
    }
    if (isObj(full.theme) && full.theme.homeImage) full.theme.homeImage = take(full.theme.homeImage);
    return n;
  }

  /** Nomi delle immagini citate dal pack (dopo la normalizzazione). */
  function referencedImages(pack) {
    var refs = {};
    function add(name, where) {
      if (!name || /^data:/i.test(name)) return;
      (refs[name] = refs[name] || []).push(where);
    }
    (pack.questions || []).forEach(function (q, i) {
      add(q.image, 'domanda ' + (i + 1));
      (q.media || []).forEach(function (m) { add(m.src, 'domanda ' + (i + 1)); });
    });
    var g = pack.games || {};
    (g.photopuzzle || []).forEach(function (s, i) { add(s.image, 'photopuzzle ' + (i + 1)); });
    (g.abbinamenti || []).forEach(function (s, i) { (s.cards || []).forEach(function (c) { add(c.img, 'abbinamenti ' + (i + 1)); }); });
    if (pack.theme) add(pack.theme.homeImage, 'immagine della home');
    return refs;
  }

  /* ---------------- archivio → pacchetto ---------------- */
  /** Pulisce i nomi dell'archivio e rifiuta percorsi pericolosi (zip slip). */
  function cleanFiles(files) {
    var out = {};
    Object.keys(files).forEach(function (raw) {
      var name = raw.replace(/\\/g, '/');
      if (IGNORED.test(name)) return;
      if (/^\//.test(name) || /^[a-z]:/i.test(name) || name.split('/').some(function (s) { return s === '..'; })) {
        throw new Error('percorso non consentito nell\'archivio: "' + raw + '"');
      }
      out[name.replace(/^\.\//, '')] = files[raw];
    });
    return out;
  }

  function parseJSON(files, path, label) {
    if (!files[path]) throw new Error('manca ' + label + ' (' + path + ')');
    try { return JSON.parse(text(files[path])); } catch (e) { throw new Error(label + ': JSON non valido (' + e.message + ')'); }
  }

  function detect(files) {
    var names = Object.keys(files);
    var packs = names.filter(function (n) { return /(^|\/)pack\.json$/.test(n); });
    if (packs.length) {
      var depth = Math.min.apply(null, packs.map(function (n) { return n.split('/').length; }));
      var top = packs.filter(function (n) { return n.split('/').length === depth; });
      if (top.length > 1) throw new Error('l\'archivio contiene più pacchetti (' + top.length + '): importali uno alla volta');
      return { kind: 'pack', root: top[0].slice(0, -'pack.json'.length) };
    }
    var v3 = names.filter(function (n) { return /(^|\/)js\/packs\.js$/.test(n); }).sort(function (a, b) { return a.length - b.length; })[0];
    if (v3) return { kind: 'v3', root: v3.slice(0, -'js/packs.js'.length) };
    return { kind: 'unknown', root: '' };
  }

  function packFromFolderFiles(files, rootDir) {
    var manifest = parseJSON(files, rootDir + 'pack.json', 'pack.json');
    if (!isObj(manifest)) throw new Error('pack.json deve contenere un oggetto');
    var f = isObj(manifest.files) ? manifest.files : {};
    var qPath = rootDir + String(f.questions || 'questions.json').replace(/^\.?\//, '');
    var gPath = rootDir + String(f.games || 'games.json').replace(/^\.?\//, '');
    var imgDir = rootDir + String(f.images || 'images/').replace(/^\.?\//, '').replace(/\/?$/, '/');
    var full = clone(manifest);
    delete full.imageBase;
    full.questions = Array.isArray(manifest.questions) ? manifest.questions : parseJSON(files, qPath, 'questions.json');
    full.games = isObj(manifest.games) ? manifest.games : (files[gPath] ? parseJSON(files, gPath, 'games.json') : {});
    var images = {};
    Object.keys(files).forEach(function (n) { if (n.indexOf(imgDir) === 0 && n.length > imgDir.length) images[n.slice(imgDir.length)] = files[n]; });
    return { kind: 'pack', full: full, images: images, warnings: [] };
  }

  /** Edizione v3: legge il blocco dati JSON di js/packs.js (senza eseguire codice) e le immagini/<chiave>/. */
  function packFromV3(files, rootDir) {
    var src = text(files[rootDir + 'js/packs.js']);
    var a = src.indexOf('const PACKS=');
    var b = src.indexOf(';root.SECCHIONE_PACKS');
    if (a < 0 || b < a) throw new Error('edizione v3 non riconosciuta (js/packs.js in un formato inatteso)');
    var packs;
    try { packs = JSON.parse(src.slice(a + 'const PACKS='.length, b)); } catch (e) { throw new Error('edizione v3 non riconosciuta (dati non leggibili)'); }
    var key = Object.keys(packs)[0];
    var p = packs[key];
    if (!p || !Array.isArray(p.questions)) throw new Error('edizione v3 senza domande');
    var prefix = key + '/';
    var strip = function (s) { return String(s || '').indexOf(prefix) === 0 ? String(s).slice(prefix.length) : s; };
    var title = String(p.title || key);
    title = title.charAt(0) + title.slice(1).toLowerCase();
    var games = {};
    Object.keys(p.arcadeSets || {}).forEach(function (t) {
      games[t] = (p.arcadeSets[t] || []).map(function (s) {
        var x = clone(s);
        if (x.image) x.image = strip(x.image);
        if (Array.isArray(x.cards)) x.cards.forEach(function (c) { c.img = strip(c.img); });
        return x;
      });
    });
    var full = {
      format: 'secchione-pack', formatVersion: 1, id: slug(p.title || key), title: title, subtitle: p.subtitle || '',
      subject: 'Arte e immagine', grade: null, author: '', version: '3.0.0',
      description: 'Convertito automaticamente da un\'edizione v3 del Secchione.', language: 'it', license: '',
      theme: { eyebrow: p.eyebrow || 'IL SECCHIONE', accent: p.accent, accent2: p.accent2, homeImage: strip(p.homeImage), tags: p.tags || [] },
      texts: { homeEyebrow: 'IL GAME SHOW DI ARTE' },
      gameNames: {},
      legacy: { v3PackKey: key, imagePrefix: prefix, convertedFrom: 'edizione v3' },
      questions: p.questions.map(function (q) { var x = clone(q); x.image = strip(x.image); delete x.points; return x; }),
      games: { games: games }
    };
    var imgDir = rootDir + 'immagini/' + key + '/';
    var images = {};
    Object.keys(files).forEach(function (n) { if (n.indexOf(imgDir) === 0 && n.length > imgDir.length) images[n.slice(imgDir.length)] = files[n]; });
    return { kind: 'v3', full: full, images: images, warnings: ['edizione v3 convertita automaticamente: la materia è stata impostata su "Arte e immagine", verificala'] };
  }

  /**
   * Da file importato (nome + byte) a pacchetto grezzo {kind, full, images, warnings}.
   * Accetta: .zip di un pack, .zip di un'edizione v3, .json di un pack in file singolo.
   * opts.inflate: decompressore (in Node si passa zlib per velocità).
   */
  function readImport(name, bytes, opts) {
    var o = opts || {};
    if (!bytes || !bytes.length) throw new Error('file vuoto');
    if (bytes.length > LIMITS.maxArchiveBytes) throw new Error('file troppo grande (massimo ' + Math.round(LIMITS.maxArchiveBytes / 1048576) + ' MB)');
    if (Z.isZip(bytes)) {
      var files = cleanFiles(Z.unzip(bytes, { maxFiles: LIMITS.maxFiles, maxTotal: LIMITS.maxExtracted, inflate: o.inflate }));
      var d = detect(files);
      if (d.kind === 'pack') return packFromFolderFiles(files, d.root);
      if (d.kind === 'v3') return packFromV3(files, d.root);
      throw new Error('l\'archivio non contiene pack.json: non è un pacchetto del Secchione');
    }
    var obj;
    try { obj = JSON.parse(text(bytes)); } catch (e) { throw new Error('"' + name + '" non è né un .zip né un pack .json valido'); }
    if (!isObj(obj) || obj.format !== PE.FORMAT) throw new Error('il file .json non è un pacchetto (manca "format": "secchione-pack")');
    if (!Array.isArray(obj.questions)) throw new Error('un pack in file singolo deve contenere l\'elenco "questions"');
    var full = clone(obj);
    delete full.imageBase;
    return { kind: 'json', full: full, images: {}, warnings: [] };
  }

  /** Validazione completa del pacchetto grezzo. Restituisce {ok, errors, warnings, pack, images}. */
  function validateImport(raw) {
    var images = {};
    Object.keys(raw.images || {}).forEach(function (k) { images[k] = raw.images[k]; });
    var full = clone(raw.full);
    var inlined = extractInlineImages(full, images);
    var res = PE.validatePack(full);
    var errors = res.errors.slice();
    var warnings = (raw.warnings || []).concat(res.warnings);
    if (inlined) warnings.push(inlined + ' immagini incorporate salvate come file');
    var names = Object.keys(images);
    if (names.length > LIMITS.maxImages) errors.push('troppe immagini (massimo ' + LIMITS.maxImages + ')');
    names.forEach(function (n) {
      var e = ext(n);
      if (e === 'svg') { errors.push('immagine "' + n + '": il formato SVG non è ammesso nei pacchetti importati (usa PNG o JPG)'); return; }
      if (!IMAGE_TYPES[e]) { warnings.push('file ignorato in images/: "' + n + '" (non è un\'immagine JPG, PNG, WEBP o GIF)'); delete images[n]; return; }
      if (images[n].length > LIMITS.maxImageBytes) errors.push('immagine "' + n + '" troppo grande (massimo ' + Math.round(LIMITS.maxImageBytes / 1048576) + ' MB)');
      else if (!imageSignatureOk(n, images[n])) errors.push('"' + n + '" non è un\'immagine ' + e.toUpperCase() + ' valida');
      if (/[^A-Za-z0-9._\-\/]/.test(n)) warnings.push('nome di file con spazi o caratteri speciali: "' + n + '" (meglio solo lettere, numeri, _ e -)');
    });
    if (res.pack) {
      var refs = referencedImages(res.pack);
      var missing = Object.keys(refs).filter(function (n) { return !images[n]; });
      missing.slice(0, 12).forEach(function (n) { errors.push('immagine mancante: "' + n + '" (usata in ' + refs[n].slice(0, 3).join(', ') + ')'); });
      if (missing.length > 12) errors.push('… e altre ' + (missing.length - 12) + ' immagini mancanti');
      var unused = Object.keys(images).filter(function (n) { return !refs[n]; });
      if (unused.length) warnings.push(unused.length + ' immagini non usate da domande o giochi (vengono comunque copiate)');
      var nestedImgs = Object.keys(images).filter(function (n) { return n.indexOf('/') >= 0; });
      if (nestedImgs.length) warnings.push(nestedImgs.length + ' immagini in sottocartelle di images/ (es. ' + nestedImgs[0] + '): sui dispositivi in rete potrebbero non vedersi; aprendo il pacchetto in Pack Studio vengono spostate direttamente in images/');
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, pack: res.pack, images: images };
  }

  /** Impronta del CONTENUTO (domande, giochi, immagini): serve a riconoscere un pacchetto già installato. */
  function fingerprint(pack, images) {
    var imgs = Object.keys(images || {}).sort().map(function (n) { return [n, images[n].length, Z.crc32(images[n])]; });
    var payload = JSON.stringify({ q: pack.questions, g: pack.games, i: imgs });
    var bytes = Z.utf8Encode(payload);
    return 'fp-' + hex8(Z.crc32(bytes)) + '-' + bytes.length.toString(36) + '-' + imgs.length;
  }

  function uniqueId(base, taken) {
    var b = String(base).slice(0, 36);
    if (taken.indexOf(b) < 0) return b;
    for (var n = 2; n < 1000; n++) if (taken.indexOf(b + '-' + n) < 0) return b + '-' + n;
    throw new Error('troppe copie dello stesso pacchetto');
  }

  /** Riepilogo per la schermata Pacchetti. */
  function summary(pack, meta) {
    var g = pack.games || {};
    var byType = {};
    PE.GAME_TYPES.forEach(function (t) { byType[t] = (g[t] || []).length; });
    var approved = (pack.questions || []).filter(function (q) { return (q.status || 'approved') === 'approved'; }).length;
    return {
      id: pack.id, title: pack.title, subtitle: pack.subtitle || '', subject: pack.subject || '', grade: pack.grade == null ? null : pack.grade,
      gradeLabel: pack.gradeLabel || '', version: pack.version || '', author: pack.author || '', description: pack.description || '',
      questions: approved, questionsTotal: (pack.questions || []).length, games: PE.countGames(g), gamesByType: byType,
      origin: (meta && meta.origin) || 'installato', installedAt: (meta && meta.installedAt) || null,
      derivedFrom: (meta && meta.derivedFrom) || null, importedAs: (meta && meta.importedAs) || null
    };
  }

  /** Oggetto manifest (pack.json) senza domande e giochi, per l'esportazione su disco o .zip. */
  function manifestOf(pack) {
    var m = clone(pack);
    delete m.questions;
    delete m.games;
    delete m.imageBase;
    m.files = { questions: 'questions.json', games: 'games.json', images: 'images/' };
    return m;
  }

  /** File di un pacchetto pronto da zippare: <id>/pack.json, questions.json, games.json, images/*. */
  function packFiles(pack, images) {
    var id = pack.id;
    var out = [
      { name: id + '/pack.json', data: JSON.stringify(manifestOf(pack), null, 2) + '\n' },
      { name: id + '/questions.json', data: JSON.stringify(pack.questions, null, 2) + '\n' },
      { name: id + '/games.json', data: JSON.stringify({ games: pack.games }, null, 2) + '\n' }
    ];
    Object.keys(images || {}).sort().forEach(function (n) { out.push({ name: id + '/images/' + n, data: images[n] }); });
    return out;
  }

  /* ---------------- libreria ---------------- */
  /**
   * PackLibrary su uno o più adattatori. Il primo adattatore scrivibile riceve le installazioni.
   * Interfaccia adattatore (tutte le funzioni restituiscono Promise):
   *   name, writable, removable, canReadImages
   *   list()                 → [{id, pack, meta}]   (pack già normalizzato o grezzo)
   *   readImages(id)         → {nome: Uint8Array}
   *   write(id, pack, images, meta)  (deve fallire se l'id esiste)
   *   remove(id)
   */
  function PackLibrary(adapters) {
    this.adapters = Array.isArray(adapters) ? adapters : [adapters];
  }

  PackLibrary.prototype.entries = function () {
    var self = this;
    return Promise.all(this.adapters.map(function (a) {
      return Promise.resolve(a.list()).then(function (list) { return list.map(function (e) { return { id: e.id, pack: e.pack, meta: e.meta || {}, adapter: a }; }); });
    })).then(function (lists) {
      var seen = {};
      var out = [];
      lists.forEach(function (l) { l.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = true; out.push(e); } }); });
      void self;
      return out;
    });
  };

  /** Elenco con validazione: [{id, ok, errors, summary, pack (normalizzato), meta, writable}] */
  PackLibrary.prototype.list = function () {
    return this.entries().then(function (entries) {
      return entries.map(function (e) {
        var r = PE.validatePack(e.pack);
        return {
          id: e.id, ok: r.ok, errors: r.errors, warnings: r.warnings,
          pack: r.pack, meta: e.meta, summary: r.pack ? summary(r.pack, e.meta) : { id: e.id, title: e.id },
          storage: e.adapter.name, removable: !!e.adapter.removable, exportable: !!e.adapter.canReadImages
        };
      });
    });
  };

  PackLibrary.prototype.writer = function () {
    for (var i = 0; i < this.adapters.length; i++) if (this.adapters[i].writable) return this.adapters[i];
    return null;
  };

  /**
   * Importa un file (.zip o .json). Non sovrascrive mai: se l'id esiste già con un contenuto diverso
   * il pacchetto viene installato con un nuovo id (es. "vulcani-2"); se il contenuto è identico non fa nulla.
   * Restituisce {ok, action: 'installed'|'already-installed'|'rejected', id, renamedFrom, errors, warnings, summary}
   */
  PackLibrary.prototype.importFile = function (name, bytes, opts) {
    var self = this;
    var writer = this.writer();
    if (!writer) return Promise.resolve({ ok: false, action: 'rejected', errors: ['questa libreria è in sola lettura'], warnings: [] });
    var checked;
    try {
      checked = validateImport(readImport(name, bytes, opts));
    } catch (e) {
      return Promise.resolve({ ok: false, action: 'rejected', errors: [e.message], warnings: [] });
    }
    if (!checked.ok) return Promise.resolve({ ok: false, action: 'rejected', errors: checked.errors, warnings: checked.warnings });
    var pack = checked.pack;
    var fp = fingerprint(pack, checked.images);
    return this.entries().then(function (entries) {
      var same = entries.filter(function (e) { return e.meta && e.meta.fingerprint === fp; })[0];
      if (same) return { ok: true, action: 'already-installed', id: same.id, errors: [], warnings: checked.warnings, summary: summary(PE.validatePack(same.pack).pack || pack, same.meta) };
      var ids = entries.map(function (e) { return e.id; });
      var finalId = uniqueId(pack.id, ids);
      var renamedFrom = finalId !== pack.id ? pack.id : null;
      if (renamedFrom) {
        pack.id = finalId;
        pack.title = (pack.title + ' (' + finalId.slice(finalId.lastIndexOf('-') + 1) + ')').slice(0, 60);
      }
      var meta = {
        origin: checked.warnings.some(function (w) { return /edizione v3/.test(w); }) ? 'convertito-v3' : 'importato',
        installedAt: new Date().toISOString(), fileName: String(name || '').slice(0, 120), fingerprint: fp,
        importedAs: renamedFrom ? { originalId: renamedFrom } : null
      };
      return Promise.resolve(writer.write(finalId, pack, checked.images, meta)).then(function () {
        return { ok: true, action: 'installed', id: finalId, renamedFrom: renamedFrom, errors: [], warnings: checked.warnings, summary: summary(pack, meta) };
      });
    }).catch(function (e) { return { ok: false, action: 'rejected', errors: [e.message], warnings: checked.warnings }; });
  };

  /** Duplica un pacchetto (anche in sola lettura) in uno nuovo, modificabile e indipendente. */
  PackLibrary.prototype.duplicate = function (id, opts) {
    var o = opts || {};
    var writer = this.writer();
    if (!writer) return Promise.resolve({ ok: false, errors: ['questa libreria è in sola lettura'] });
    return this.entries().then(function (entries) {
      var src = entries.filter(function (e) { return e.id === id; })[0];
      if (!src) throw new Error('pacchetto "' + id + '" non trovato');
      var r = PE.validatePack(src.pack);
      if (!r.ok) throw new Error('il pacchetto di partenza non è valido: ' + r.errors[0]);
      var ids = entries.map(function (e) { return e.id; });
      var newId = o.newId ? String(o.newId) : uniqueId(id.replace(/-copia(-\d+)?$/, '') + '-copia', ids);
      if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(newId)) throw new Error('id non valido: ' + newId);
      if (ids.indexOf(newId) >= 0) throw new Error('esiste già un pacchetto con id "' + newId + '"');
      var pack = clone(r.pack);
      pack.id = newId;
      pack.title = String(o.title || (r.pack.title + ' (copia)')).slice(0, 60);
      var p = src.adapter.canReadImages ? Promise.resolve(src.adapter.readImages(id)) : Promise.resolve(null);
      return p.then(function (images) {
        // Senza accesso ai byte (es. pack su disco aperto da file://) la copia usa le immagini dell'originale.
        if (!images) pack.imageBase = r.pack.imageBase || ('packs/' + id + '/images/');
        var meta = { origin: 'copia', installedAt: new Date().toISOString(), derivedFrom: { id: id, version: r.pack.version }, fingerprint: fingerprint(pack, images || {}) + '-copia-' + Date.now().toString(36) };
        return Promise.resolve(writer.write(newId, pack, images || {}, meta)).then(function () { return { ok: true, id: newId, summary: summary(pack, meta), sharedImages: !images }; });
      });
    }).catch(function (e) { return { ok: false, errors: [e.message] }; });
  };

  /** Esporta un pacchetto come .zip conforme a PACK_FORMAT.md. */
  PackLibrary.prototype.exportZip = function (id) {
    return this.entries().then(function (entries) {
      var src = entries.filter(function (e) { return e.id === id; })[0];
      if (!src) throw new Error('pacchetto "' + id + '" non trovato');
      if (!src.adapter.canReadImages) throw new Error('questo pacchetto è una cartella del programma (packs/' + id + '): per esportarlo avvia il Secchione con AVVIA_IL_SECCHIONE.bat oppure comprimi la cartella');
      var r = PE.validatePack(src.pack);
      if (!r.ok) throw new Error('pacchetto non valido: ' + r.errors[0]);
      return Promise.resolve(src.adapter.readImages(id)).then(function (images) {
        var pack = clone(r.pack);
        var warnings = [];
        var refs = referencedImages(pack);
        var missing = Object.keys(refs).filter(function (n) { return !images[n]; });
        if (missing.length) warnings.push(missing.length + ' immagini citate non sono nel pacchetto (es. ' + missing[0] + ')');
        return { ok: true, bytes: Z.zip(packFiles(pack, images)), filename: id + '_v' + String(pack.version || '1').replace(/[^\w.-]/g, '') + '.zip', warnings: warnings };
      });
    }).catch(function (e) { return { ok: false, errors: [e.message] }; });
  };

  /** Elimina (sposta nel cestino dell'archiviazione). L'ultimo pacchetto rimasto non si può eliminare. */
  /**
   * Salvataggio da Pack Studio (diverso dall'importazione, che non sovrascrive mai):
   *  opts.mode 'new'     → fallisce se il codice esiste già
   *  opts.mode 'replace' → sostituisce il pacchetto con lo stesso codice (l'adattatore può conservare una copia di sicurezza)
   * Le immagini devono stare direttamente in images/ (nessuna sottocartella).
   */
  PackLibrary.prototype.save = function (name, bytes, opts) {
    var o = opts || {};
    var writer = this.writer();
    if (!writer) return Promise.resolve({ ok: false, errors: ['questa libreria è in sola lettura'], warnings: [] });
    var checked;
    try { checked = validateImport(readImport(name, bytes, o)); } catch (e) { return Promise.resolve({ ok: false, errors: [e.message], warnings: [] }); }
    if (!checked.ok) return Promise.resolve({ ok: false, errors: checked.errors, warnings: checked.warnings });
    var nested = Object.keys(checked.images).filter(function (n) { return /[\/\\]/.test(n); });
    if (nested.length) return Promise.resolve({ ok: false, errors: ['le immagini devono stare direttamente in images/ (trovata: ' + nested[0] + ')'], warnings: checked.warnings });
    var pack = checked.pack;
    if (o.expectedId && o.expectedId !== pack.id) return Promise.resolve({ ok: false, errors: ['il codice del pacchetto (' + pack.id + ') non corrisponde a quello indicato (' + o.expectedId + ')'], warnings: checked.warnings });
    var fp = fingerprint(pack, checked.images);
    return this.entries().then(function (entries) {
      var existing = entries.filter(function (e) { return e.id === pack.id; })[0];
      var now = new Date().toISOString();
      if (existing && o.mode !== 'replace') throw new Error('esiste già un pacchetto con codice "' + pack.id + '": scegli di sostituirlo oppure cambia il codice');
      if (existing && existing.adapter !== writer) throw new Error('"' + pack.id + '" è un pacchetto del programma: per modificarlo avvia il Secchione con AVVIA_IL_SECCHIONE.bat, oppure salvalo con un altro codice');
      var prev = existing ? PE.validatePack(existing.pack).pack : null;
      var meta = {
        origin: existing ? ((existing.meta && existing.meta.origin) || 'installato') : 'studio',
        installedAt: existing && existing.meta && existing.meta.installedAt ? existing.meta.installedAt : now,
        updatedAt: now, editedWith: 'Pack Studio', fileName: String(name || '').slice(0, 120), fingerprint: fp,
        previousVersion: prev ? prev.version : null,
        derivedFrom: existing && existing.meta ? existing.meta.derivedFrom || null : null
      };
      if (existing) {
        if (!writer.replace) throw new Error('questa libreria non permette di sostituire un pacchetto');
        return Promise.resolve(writer.replace(pack.id, pack, checked.images, meta)).then(function (r) {
          return { ok: true, id: pack.id, replaced: true, backup: (r && r.backup) || null, previousVersion: meta.previousVersion, warnings: checked.warnings, summary: summary(pack, meta) };
        });
      }
      return Promise.resolve(writer.write(pack.id, pack, checked.images, meta)).then(function () {
        return { ok: true, id: pack.id, replaced: false, backup: null, previousVersion: null, warnings: checked.warnings, summary: summary(pack, meta) };
      });
    }).catch(function (e) { return { ok: false, errors: [e.message], warnings: checked.warnings }; });
  };

  PackLibrary.prototype.remove = function (id) {
    return this.entries().then(function (entries) {
      var src = entries.filter(function (e) { return e.id === id; })[0];
      if (!src) throw new Error('pacchetto "' + id + '" non trovato');
      if (!src.adapter.removable) throw new Error('questo pacchetto è una cartella del programma (packs/' + id + '): si elimina con il server attivo oppure dalla cartella');
      if (entries.length <= 1) throw new Error('è l\'ultimo pacchetto installato: non può essere eliminato');
      return Promise.resolve(src.adapter.remove(id)).then(function () { return { ok: true, id: id }; });
    }).catch(function (e) { return { ok: false, errors: [e.message] }; });
  };

  /** Adattatore in memoria (test e riserva quando IndexedDB non è disponibile). */
  function memoryAdapter(name) {
    var store = {};
    return {
      name: name || 'memoria', writable: true, removable: true, canReadImages: true, store: store,
      list: function () { return Promise.resolve(Object.keys(store).map(function (id) { return { id: id, pack: clone(store[id].pack), meta: clone(store[id].meta) }; })); },
      readImages: function (id) { return Promise.resolve(store[id] ? store[id].images : {}); },
      write: function (id, pack, images, meta) {
        if (store[id]) return Promise.reject(new Error('esiste già "' + id + '"'));
        store[id] = { pack: clone(pack), images: images, meta: clone(meta || {}) };
        return Promise.resolve();
      },
      remove: function (id) { delete store[id]; return Promise.resolve(); },
      backups: [],
      replace: function (id, pack, images, meta) {
        if (store[id]) this.backups.push({ id: id, at: new Date().toISOString(), pack: store[id].pack, meta: store[id].meta });
        store[id] = { pack: clone(pack), images: images, meta: clone(meta || {}) };
        return Promise.resolve({ backup: store[id] ? 'memoria' : null });
      }
    };
  }

  /** Adattatore in sola lettura sui pack già caricati (es. packs.bundle.js aperto da file://). */
  function sourcesAdapter(sources, name) {
    return {
      name: name || 'programma', writable: false, removable: false, canReadImages: false,
      list: function () { return Promise.resolve((sources || []).map(function (s) { return { id: s.id, pack: s, meta: { origin: 'installato' } }; })); },
      readImages: function () { return Promise.reject(new Error('immagini non leggibili')); },
      write: function () { return Promise.reject(new Error('sola lettura')); },
      remove: function () { return Promise.reject(new Error('sola lettura')); }
    };
  }

  /* ---------------- sessioni (una o più pack) ---------------- */
  function qualifyId(packId, questionId) { return packId + ID_SEP + questionId; }
  function splitId(id) {
    var s = String(id || '');
    var i = s.indexOf(ID_SEP);
    return i > 0 ? { packId: s.slice(0, i), questionId: s.slice(i + 1) } : { packId: null, questionId: s };
  }

  /**
   * Domande della sessione: concatenazione dei pack attivi, nell'ordine dato.
   * parts: [{pack: runtimePack, questions: elenco (originale o personalizzato)}]
   * Ogni domanda riceve id qualificato "packId/idOriginale" e la provenienza in `source`.
   */
  function composeBank(parts) {
    var out = [];
    parts.forEach(function (part) {
      var rt = part.pack;
      var meta = rt.meta || {};
      (part.questions || []).forEach(function (q) {
        var orig = q.source && q.source.questionId ? q.source.questionId : splitId(q.id).packId === rt.id ? splitId(q.id).questionId : q.id;
        var x = clone(q);
        x.id = qualifyId(rt.id, orig);
        x.source = {
          packId: rt.id, packVersion: meta.version || '', packTitle: rt.title,
          subject: q.subject || meta.subject || '', topic: q.topic || rt.title, questionId: orig
        };
        out.push(x);
      });
    });
    return out;
  }

  /** Domanda della sessione → forma da salvare nell'archivio personalizzato del pack (id originale). */
  function storedQuestion(q) {
    var x = clone(q);
    if (x.source && x.source.questionId) x.id = x.source.questionId;
    delete x.source;
    return x;
  }

  /** Giochi della sessione mista: concatenazione, ogni manche sa da quale pack proviene. */
  function composeArcade(runtimes) {
    var out = {};
    PE.GAME_TYPES.forEach(function (t) {
      out[t] = [];
      runtimes.forEach(function (rt) {
        ((rt.arcadeSets || {})[t] || []).forEach(function (s) {
          out[t].push(Object.assign({}, s, { _packId: rt.id, _packTitle: rt.title, _packVersion: (rt.meta || {}).version || '', _subject: (rt.meta || {}).subject || '' }));
        });
      });
    });
    return out;
  }

  /* ---------- IMPORTA CONTENUTI (v3.7.3): un solo ingresso, il tipo si riconosce dal contenuto ---------- */
  /**
   * Che cosa contiene un file .json già letto:
   *  'questions' (archivio domande: elenco, o { questions: [...] }), 'games' (archivio giochi { games: {tipo: [...]} }),
   *  'pack' (pacchetto completo), 'plan' (scaletta), 'results' (partita/risultati: non è un contenuto), 'unknown'.
   */
  function contentKind(data) {
    if (Array.isArray(data)) return { kind: 'questions', list: data };
    if (!data || typeof data !== 'object') return { kind: 'unknown' };
    if (data.format === PE.FORMAT) return { kind: 'pack' };
    if (data.format === 'secchione-scaletta') return { kind: 'plan' };
    if (data.format === 'secchione-snapshot' || data.format === 'secchione-session' || (data.session && data.session.sessionId)) return { kind: 'results' };
    if (data.format === 'secchione-games' || (data.games && typeof data.games === 'object' && !Array.isArray(data.games) && !Array.isArray(data.questions))) return { kind: 'games' };
    if (Array.isArray(data.questions)) return { kind: 'questions', list: data.questions };
    return { kind: 'unknown' };
  }
  /** Manche pronte per il pacchetto: senza i campi di servizio della sessione mista (_packId, _packTitle…). */
  function cleanGameSet(set) {
    var x = clone(set);
    Object.keys(x).forEach(function (k) { if (k.charAt(0) === '_') delete x[k]; });
    return x;
  }
  /**
   * Sostituzione dei giochi (nessuna unione): i tipi presenti nel file sostituiscono quelli del pacchetto,
   * i tipi assenti dal file restano come sono. Restituisce i giochi risultanti e il riepilogo per tipo.
   */
  function replaceGames(current, imported) {
    var games = {}, rows = [];
    PE.GAME_TYPES.forEach(function (t) {
      var now = ((current || {})[t] || []), add = ((imported || {})[t] || []);
      var replaced = add.length > 0;
      games[t] = replaced ? add.map(cleanGameSet) : now.map(cleanGameSet);
      if (now.length || add.length) rows.push({ type: t, before: now.length, inFile: add.length, after: games[t].length, replaced: replaced });
    });
    return { games: games, rows: rows, replacedTypes: rows.filter(function (r) { return r.replaced; }).map(function (r) { return r.type; }), imported: rows.reduce(function (n, r) { return n + r.inFile; }, 0) };
  }
  /** Id di una domanda da salvare nel pacchetto: senza il prefisso "packId/" della regia. */
  function storedQuestionId(id) {
    var s = String(id == null ? '' : id);
    return s.indexOf('/') >= 0 ? s.slice(s.lastIndexOf('/') + 1) : s;
  }

  /** Registra nella sessione i pack usati (con versione, materia e argomenti) senza duplicati. */
  function recordActivation(session, runtimes, when) {
    if (!session) return;
    var at = when || new Date().toISOString();
    session.packs = Array.isArray(session.packs) ? session.packs : [];
    runtimes.forEach(function (rt) {
      var meta = rt.meta || {};
      var exists = session.packs.filter(function (p) { return p.packId === rt.id && p.packVersion === (meta.version || ''); })[0];
      var topics = {};
      (rt.questions || []).forEach(function (q) { if (q.topic) topics[q.topic] = true; });
      if (exists) { exists.lastActivatedAt = at; return; }
      session.packs.push({
        packId: rt.id, packVersion: meta.version || '', title: rt.title, subject: meta.subject || '', grade: meta.grade == null ? null : meta.grade,
        topics: Object.keys(topics).slice(0, 20), firstActivatedAt: at, lastActivatedAt: at
      });
    });
    if (runtimes[0]) {
      session.packId = runtimes.length > 1 ? runtimes.map(function (r) { return r.id; }).join('+') : runtimes[0].id;
      session.packVersion = runtimes.length > 1 ? '' : ((runtimes[0].meta || {}).version || '');
    }
    session.activePacks = runtimes.map(function (r) { return r.id; });
  }

  /** Provenienza da copiare in ogni risposta esportata. */
  function provenance(q, fallbackPack) {
    var s = q && q.source;
    if (s) return { packId: s.packId, packVersion: s.packVersion, subject: s.subject, topic: s.topic, sourceQuestionId: s.questionId };
    var p = fallbackPack || {};
    return { packId: p.id || null, packVersion: (p.meta || {}).version || '', subject: (p.meta || {}).subject || '', topic: p.title || '', sourceQuestionId: q ? splitId(q.id).questionId : null };
  }

  return {
    LIMITS: LIMITS,
    IMAGE_TYPES: IMAGE_TYPES,
    slug: slug,
    imageSignatureOk: imageSignatureOk,
    referencedImages: referencedImages,
    readImport: readImport,
    extractInlineImages: extractInlineImages,
    validateImport: validateImport,
    fingerprint: fingerprint,
    uniqueId: uniqueId,
    summary: summary,
    manifestOf: manifestOf,
    packFiles: packFiles,
    PackLibrary: PackLibrary,
    memoryAdapter: memoryAdapter,
    sourcesAdapter: sourcesAdapter,
    qualifyId: qualifyId,
    splitId: splitId,
    composeBank: composeBank,
    storedQuestion: storedQuestion,
    composeArcade: composeArcade,
    recordActivation: recordActivation,
    provenance: provenance,
    contentKind: contentKind,
    cleanGameSet: cleanGameSet,
    replaceGames: replaceGames,
    storedQuestionId: storedQuestionId
  };
});
