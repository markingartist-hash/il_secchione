/*
 * Il Secchione · PACK STUDIO — bozze salvate automaticamente nel browser (IndexedDB "secchione-studio").
 * Tre archivi: "meta" (elenco leggero), "data" (testi della bozza), "images" (byte delle immagini, chiave "<bozza>|<nome>").
 * Le immagini vengono riscritte solo quando cambiano, così il salvataggio automatico resta leggero anche con pack grandi.
 * Se IndexedDB non è disponibile le bozze restano solo in memoria finché la pagina è aperta.
 * ES5 + Promise.
 */
(function (root) {
  'use strict';
  var PS = root.SecchionePackStudio;
  var dbp = null;
  var memory = null;   // {meta:{}, data:{}, images:{}} quando IndexedDB manca
  var written = {};    // bozza → {nome immagine: Uint8Array già salvato}

  function db() {
    if (!dbp) {
      dbp = new Promise(function (resolve, reject) {
        var req;
        try { req = indexedDB.open('secchione-studio', 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () {
          var d = req.result;
          ['meta', 'data'].forEach(function (s) { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
          if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'key' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB non disponibile')); };
        req.onblocked = function () { reject(new Error('archivio delle bozze bloccato da un\'altra finestra')); };
      });
      dbp.catch(function () { memory = { meta: {}, data: {}, images: {} }; });
    }
    return dbp;
  }

  function run(stores, mode, work) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(stores, mode);
        var box = { value: undefined };
        t.oncomplete = function () { resolve(box.value); };
        t.onerror = function () { reject(t.error || new Error('errore dell\'archivio delle bozze')); };
        t.onabort = function () { reject(t.error || new Error('bozza non salvata (spazio esaurito?)')); };
        work(t, box);
      });
    });
  }
  function range(id) { return IDBKeyRange.bound(id + '|', id + '|' + String.fromCharCode(65535)); }

  function metaOf(id, draft) {
    var s = PS.summary(draft);
    return {
      id: id, title: s.title, packId: s.id, version: s.version, questions: s.questions, games: s.games, images: s.images,
      libraryId: (draft.origin && draft.origin.libraryId) || null, updatedAt: new Date().toISOString()
    };
  }
  function buf(b) { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }

  var Drafts = {
    newId: function () { return 'bozza-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); },
    /** true se le bozze sopravvivono alla chiusura della pagina */
    persistent: function () { return db().then(function () { return true; }, function () { return false; }); },
    list: function () {
      return db().then(function () {
        return run(['meta'], 'readonly', function (t, box) {
          var req = t.objectStore('meta').getAll();
          req.onsuccess = function () { box.value = req.result || []; };
        });
      }, function () { return Object.keys(memory.meta).map(function (k) { return memory.meta[k]; }); }).then(function (l) {
        return l.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      });
    },
    save: function (id, draft) {
      var meta = metaOf(id, draft);
      var s = PS.serialize(draft);
      var imgs = s.images;
      s.images = {};
      var prev = written[id] || {};
      var toPut = Object.keys(imgs).filter(function (n) { return prev[n] !== imgs[n]; });
      var toDel = Object.keys(prev).filter(function (n) { return !imgs[n]; });
      var data = { id: id, draft: s, imageNames: Object.keys(imgs) };
      return db().then(function () {
        return run(['meta', 'data', 'images'], 'readwrite', function (t) {
          t.objectStore('meta').put(meta);
          t.objectStore('data').put(data);
          var is = t.objectStore('images');
          toDel.forEach(function (n) { is.delete(id + '|' + n); });
          toPut.forEach(function (n) { is.put({ key: id + '|' + n, data: buf(imgs[n]) }); });
        });
      }, function () {
        memory.meta[id] = meta;
        memory.data[id] = data;
        memory.images[id] = imgs;
      }).then(function () {
        var w = {};
        Object.keys(imgs).forEach(function (n) { w[n] = imgs[n]; });
        written[id] = w;
        return meta;
      });
    },
    load: function (id) {
      return db().then(function () {
        return run(['data', 'images'], 'readonly', function (t, box) {
          var out = { rec: null, images: {} };
          box.value = out;
          var r = t.objectStore('data').get(id);
          r.onsuccess = function () { out.rec = r.result || null; };
          var c = t.objectStore('images').openCursor(range(id));
          c.onsuccess = function () {
            var cur = c.result;
            if (!cur) return;
            out.images[cur.value.key.slice(id.length + 1)] = new Uint8Array(cur.value.data);
            cur.continue();
          };
        });
      }, function () { return { rec: memory.data[id], images: memory.images[id] || {} }; }).then(function (x) {
        if (!x.rec) throw new Error('bozza non trovata');
        var s = x.rec.draft;
        s.images = {};
        (x.rec.imageNames || []).forEach(function (n) { if (x.images[n]) s.images[n] = x.images[n]; });
        var d = PS.deserialize(s);
        var w = {};
        Object.keys(d.images).forEach(function (n) { w[n] = d.images[n]; });
        written[id] = w;
        return d;
      });
    },
    remove: function (id) {
      delete written[id];
      return db().then(function () {
        return run(['meta', 'data', 'images'], 'readwrite', function (t) {
          t.objectStore('meta').delete(id);
          t.objectStore('data').delete(id);
          t.objectStore('images').delete(range(id));
        });
      }, function () { delete memory.meta[id]; delete memory.data[id]; delete memory.images[id]; });
    }
  };

  root.SecchioneStudioDrafts = Drafts;
})(typeof self !== 'undefined' ? self : this);
