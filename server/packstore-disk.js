/*
 * Archiviazione su disco della libreria pacchetti (server locale e riga di comando).
 *   packs/<id>/pack.json, questions.json, games.json, images/*, install.json (metadati di installazione)
 * - installazione atomica: scrittura in packs/.tmp-<casuale>/ e poi rename (mai un pack a metà)
 * - mai sovrascrivere: se packs/<id> esiste l'installazione fallisce (la libreria sceglie un altro id)
 * - eliminazione = spostamento in data/cestino_pacchetti/ (recuperabile)
 * - dopo ogni modifica ricostruisce packs/packs.bundle.js (serve alla regia aperta da file://)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var zlib = require('zlib');
var PE = require('../js/engine/packs.js');
var PL = require('../js/engine/packlib.js');
var bp = require('../tools/build_packs.js');

function mkdirp(dir) {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  try { fs.mkdirSync(dir); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}
function rmrf(p) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) { fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); }); fs.rmdirSync(p); }
  else fs.unlinkSync(p);
}
function readJSON(file, fb) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { return fb; } }
function walkImages(dir, prefix, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(function (f) {
    var p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkImages(p, prefix + f + '/', out);
    else if (/\.(jpe?g|png|webp|gif|svg)$/i.test(f)) out[prefix + f] = new Uint8Array(fs.readFileSync(p));
  });
  return out;
}
function renameRetry(a, b) {
  for (var i = 0; i < 8; i++) {
    try { fs.renameSync(a, b); return; } catch (e) {
      if (i === 7 || (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES')) throw e;
      var until = Date.now() + 40 * (i + 1);
      while (Date.now() < until) { /* attesa breve: antivirus o indicizzazione */ }
    }
  }
}

/** Decompressione nativa di Node (più veloce della versione JavaScript usata nel browser). */
function inflate(bytes, size) {
  // I runtime vecchi usano il decoder JS limitato: non ignorare maxOutputLength.
  if (+process.versions.node.split('.')[0] < 16) return require('../js/lib/zip.js').inflateRaw(bytes, size);
  var out = zlib.inflateRawSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { maxOutputLength: Math.max(1, size) });
  if (out.length > size) throw new Error('dimensione decompressa oltre il limite dichiarato');
  return new Uint8Array(out);
}

function DiskAdapter(opts) {
  var o = opts || {};
  this.name = 'disco';
  this.writable = true;
  this.removable = true;
  this.canReadImages = true;
  this.packsDir = o.packsDir || bp.PACKS_DIR || path.join(__dirname, '..', 'packs');
  this.trashDir = o.trashDir || path.join(__dirname, '..', 'data', 'cestino_pacchetti');
  this.rebuild = o.rebuild !== false;
  this.bundleFile = o.bundleFile || null;
}

DiskAdapter.prototype.folders = function () {
  var dir = this.packsDir;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (d) {
    return !/^[._]/.test(d) && fs.statSync(path.join(dir, d)).isDirectory() && fs.existsSync(path.join(dir, d, 'pack.json'));
  }).sort();
};

DiskAdapter.prototype.list = function () {
  var self = this;
  return Promise.resolve(this.folders().map(function (d) {
    var full;
    try { full = bp.loadPackFolder(path.join(self.packsDir, d)); } catch (e) { full = { id: d, title: d, error: e.message }; }
    full.imageBase = 'packs/' + d + '/images/';
    return { id: d, pack: full, meta: readJSON(path.join(self.packsDir, d, 'install.json'), { origin: 'installato' }) };
  }));
};

DiskAdapter.prototype.readImages = function (id) {
  return Promise.resolve(walkImages(path.join(this.packsDir, id, 'images'), '', {}));
};

DiskAdapter.prototype.write = function (id, pack, images, meta) {
  var dest = path.join(this.packsDir, id);
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id)) return Promise.reject(new Error('id non valido: ' + id));
  if (fs.existsSync(dest)) return Promise.reject(new Error('la cartella packs/' + id + ' esiste già'));
  var tmp = path.join(this.packsDir, '.tmp-' + crypto.randomBytes(6).toString('hex'));
  try {
    mkdirp(path.join(tmp, 'images'));
    var manifest = PL.manifestOf(pack);
    if (pack.imageBase) manifest.imageBase = pack.imageBase; // copia che usa le immagini di un altro pack
    fs.writeFileSync(path.join(tmp, 'pack.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(tmp, 'questions.json'), JSON.stringify(pack.questions, null, 2) + '\n');
    fs.writeFileSync(path.join(tmp, 'games.json'), JSON.stringify({ games: pack.games }, null, 2) + '\n');
    Object.keys(images || {}).forEach(function (n) {
      var target = path.join(tmp, 'images', n);
      if (path.relative(path.join(tmp, 'images'), target).split(path.sep)[0] === '..') throw new Error('nome immagine non valido: ' + n);
      mkdirp(path.dirname(target));
      fs.writeFileSync(target, Buffer.from(images[n].buffer, images[n].byteOffset, images[n].byteLength));
    });
    fs.writeFileSync(path.join(tmp, 'install.json'), JSON.stringify(meta || {}, null, 2) + '\n');
    if (fs.existsSync(dest)) throw new Error('la cartella packs/' + id + ' esiste già');
    renameRetry(tmp, dest);
  } catch (e) {
    try { rmrf(tmp); } catch (x) { /* ignore */ }
    return Promise.reject(e);
  }
  this.changed();
  return Promise.resolve();
};

/** Scrive l'albero di un pacchetto in una cartella (usato dalla sostituzione di Pack Studio). */
function writeTree(dir, pack, images, meta) {
  mkdirp(path.join(dir, 'images'));
  var manifest = PL.manifestOf(pack);
  if (pack.imageBase) manifest.imageBase = pack.imageBase;
  fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'questions.json'), JSON.stringify(pack.questions, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'games.json'), JSON.stringify({ games: pack.games }, null, 2) + '\n');
  Object.keys(images || {}).forEach(function (n) {
    if (/[\\/]/.test(n) || n === '.' || n === '..') throw new Error('nome immagine non valido (sottocartelle non ammesse): ' + n);
    fs.writeFileSync(path.join(dir, 'images', n), Buffer.from(images[n].buffer, images[n].byteOffset, images[n].byteLength));
  });
  fs.writeFileSync(path.join(dir, 'install.json'), JSON.stringify(meta || {}, null, 2) + '\n');
}

/**
 * Sostituzione esplicita (Pack Studio): il nuovo pacchetto viene scritto a parte, la versione precedente
 * va nel cestino come copia di sicurezza, poi il nuovo prende il suo posto. In caso di errore si ripristina il precedente.
 */
DiskAdapter.prototype.replace = function (id, pack, images, meta) {
  var dest = path.join(this.packsDir, id);
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id)) return Promise.reject(new Error('id non valido: ' + id));
  if (!fs.existsSync(dest)) return this.write(id, pack, images, meta).then(function () { return { backup: null }; });
  var tmp = path.join(this.packsDir, '.tmp-' + crypto.randomBytes(6).toString('hex'));
  var stamp = new Date().toISOString().replace(/[:.]/g, '-');
  var backup = path.join(this.trashDir, id + '_' + stamp + '_prima-della-modifica');
  try {
    writeTree(tmp, pack, images, meta);
    mkdirp(this.trashDir);
    renameRetry(dest, backup);
    try { renameRetry(tmp, dest); } catch (e) { renameRetry(backup, dest); throw e; }
  } catch (e) {
    try { rmrf(tmp); } catch (x) { /* ignore */ }
    return Promise.reject(e);
  }
  this.changed();
  return Promise.resolve({ backup: path.basename(backup) });
};

DiskAdapter.prototype.remove = function (id) {
  var src = path.join(this.packsDir, id);
  if (!fs.existsSync(src)) return Promise.reject(new Error('pacchetto non trovato: ' + id));
  mkdirp(this.trashDir);
  var stamp = new Date().toISOString().replace(/[:.]/g, '-');
  renameRetry(src, path.join(this.trashDir, id + '_' + stamp));
  this.changed();
  return Promise.resolve();
};

DiskAdapter.prototype.changed = function () {
  if (!this.rebuild) return;
  try { bp.build({ packsDir: this.packsDir, bundle: this.bundleFile }); } catch (e) { /* il bundle verrà ricostruito al prossimo avvio */ }
};

/**
 * Migrazione automatica: registra i pack già presenti come cartelle (es. arte_romana della v3.5)
 * creando install.json con l'impronta del contenuto. Non modifica domande, giochi o immagini.
 */
DiskAdapter.prototype.migrate = function () {
  var self = this;
  var done = [];
  this.folders().forEach(function (d) {
    var metaFile = path.join(self.packsDir, d, 'install.json');
    if (fs.existsSync(metaFile)) return;
    try {
      var full = bp.loadPackFolder(path.join(self.packsDir, d));
      var r = PE.validatePack(full);
      if (!r.ok) return;
      var images = walkImages(path.join(self.packsDir, d, 'images'), '', {});
      var stat = fs.statSync(path.join(self.packsDir, d, 'pack.json'));
      var meta = { origin: r.pack.legacy && r.pack.legacy.v3PackKey ? 'migrato-v3' : 'preinstallato', installedAt: stat.mtime.toISOString(), fingerprint: PL.fingerprint(r.pack, images), migratedAt: new Date().toISOString() };
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
      done.push(d);
    } catch (e) { /* un pack non valido resta com'è e viene segnalato da build_packs */ }
  });
  // cartelle temporanee rimaste da un'installazione interrotta
  if (fs.existsSync(this.packsDir)) fs.readdirSync(this.packsDir).forEach(function (d) { if (/^\.tmp-/.test(d)) { try { rmrf(path.join(self.packsDir, d)); } catch (e) { /* ignore */ } } });
  return done;
};

function diskLibrary(opts) {
  var a = new DiskAdapter(opts);
  var lib = new PL.PackLibrary([a]);
  lib.disk = a;
  return lib;
}

module.exports = { DiskAdapter: DiskAdapter, diskLibrary: diskLibrary, inflate: inflate, rmrf: rmrf, mkdirp: mkdirp };
