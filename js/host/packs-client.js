/*
 * Il Secchione · client del Gestore Pacchetti nella regia.
 * - Con il server locale (AVVIA_IL_SECCHIONE.bat): la libreria è la cartella packs/ sul disco (API /api/host/packs).
 * - Senza server (file://): pacchetti del programma in sola lettura + libreria del browser (IndexedDB),
 *   con immagini salvate nel browser. Stessa logica (js/engine/packlib.js), stessa interfaccia.
 * ES5 + Promise.
 */
(function (root) {
  'use strict';
  var PL = root.SecchionePackLib;
  var Z = root.SecchioneZip;

  function hostKey() {
    var m = document.querySelector('meta[name="secchione-host-key"]');
    return m ? m.getAttribute('content') || '' : '';
  }
  var serverMode = /^https?:$/.test(location.protocol) && !!hostKey();

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

  /* ---------------- adattatore IndexedDB ---------------- */
  function idbAdapter() {
    var dbp = null;
    function db() {
      if (!dbp) {
        dbp = new Promise(function (resolve, reject) {
          var req;
          try { req = indexedDB.open('secchione-pacchetti', 1); } catch (e) { reject(e); return; }
          req.onupgradeneeded = function () {
            var d = req.result;
            if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'key' });
          };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error || new Error('IndexedDB non disponibile')); };
          req.onblocked = function () { reject(new Error('archivio del browser bloccato da un\'altra finestra')); };
        });
      }
      return dbp;
    }
    function run(stores, mode, work) {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          var t = d.transaction(stores, mode);
          var box = { value: undefined };
          t.oncomplete = function () { resolve(box.value); };
          t.onerror = function () { reject(t.error || new Error('errore dell\'archivio del browser')); };
          t.onabort = function () { reject(t.error || new Error('operazione annullata (spazio esaurito?)')); };
          work(t, box);
        });
      });
    }
    function range(id) { return IDBKeyRange.bound(id + '\u0000', id + '\u0001', false, true); }
    function getImages(id) {
      return run(['images'], 'readonly', function (t, box) {
        box.value = {};
        var req = t.objectStore('images').openCursor(range(id));
        req.onsuccess = function () {
          var c = req.result;
          if (!c) return;
          box.value[c.value.name] = new Uint8Array(c.value.data);
          c.continue();
        };
      });
    }
    return {
      name: 'browser', writable: true, removable: true, canReadImages: true, volatile: false,
      ready: function () { return db().then(function () { return true; }); },
      list: function () {
        return run(['packs'], 'readonly', function (t, box) {
          var req = t.objectStore('packs').getAll();
          req.onsuccess = function () { box.value = (req.result || []).map(function (r) { return { id: r.id, pack: r.pack, meta: r.meta || {} }; }); };
        });
      },
      readImages: getImages,
      imageURLs: function (id) {
        return getImages(id).then(function (imgs) {
          var map = {};
          Object.keys(imgs).forEach(function (n) { map[n] = URL.createObjectURL(new Blob([imgs[n]], { type: mimeOf(n) })); });
          return map;
        });
      },
      write: function (id, pack, images, meta) {
        return run(['packs', 'images'], 'readwrite', function (t) {
          var ps = t.objectStore('packs');
          var check = ps.get(id);
          check.onsuccess = function () {
            if (check.result) { t.abort(); return; }
            ps.add({ id: id, pack: pack, meta: meta || {} });
            var is = t.objectStore('images');
            Object.keys(images || {}).forEach(function (n) {
              var b = images[n];
              is.put({ key: id + '\u0000' + n, id: id, name: n, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
            });
          };
        });
      },
      remove: function (id) {
        return run(['packs', 'images'], 'readwrite', function (t) {
          t.objectStore('packs').delete(id);
          t.objectStore('images').delete(range(id));
        });
      },
      /* Pack Studio: sostituzione dello stesso pacchetto in un'unica transazione (nel browser senza copia di sicurezza) */
      replace: function (id, pack, images, meta) {
        return run(['packs', 'images'], 'readwrite', function (t) {
          var is = t.objectStore('images');
          t.objectStore('packs').put({ id: id, pack: pack, meta: meta || {} });
          is.delete(range(id));
          Object.keys(images || {}).forEach(function (n) {
            var b = images[n];
            is.put({ key: id + '\u0000' + n, id: id, name: n, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
          });
        }).then(function () { return { backup: null }; });
      }
    };
  }

  /* ---------------- client ---------------- */
  function api(path, opts) {
    var o = opts || {};
    var headers = { 'X-Secchione-Host': hostKey() };
    Object.keys(o.headers || {}).forEach(function (k) { headers[k] = o.headers[k]; });
    return fetch(path, { method: o.method || 'GET', headers: headers, body: o.body, cache: 'no-store' });
  }
  function json(p) {
    return p.then(function (r) {
      return r.json().catch(function () { return { ok: false, errors: ['risposta non valida dal server (' + r.status + ')'] }; });
    }, function () { return { ok: false, errors: ['server non raggiungibile: controlla la finestra nera del Secchione'] }; });
  }

  var local = null;
  var localIdb = null;
  var imageURLCache = {};

  function localLibrary() {
    if (local) return Promise.resolve(local);
    var bundle = PL.sourcesAdapter(root.SECCHIONE_PACK_SOURCES || [], 'programma');
    localIdb = idbAdapter();
    return localIdb.ready().then(function () {
      local = new PL.PackLibrary([localIdb, bundle]);
      return local;
    }, function () {
      // IndexedDB non disponibile: libreria in memoria (i pacchetti importati spariscono chiudendo la pagina)
      localIdb = PL.memoryAdapter('memoria');
      localIdb.volatile = true;
      localIdb.imageURLs = function (id) {
        return localIdb.readImages(id).then(function (imgs) {
          var map = {};
          Object.keys(imgs).forEach(function (n) { map[n] = URL.createObjectURL(new Blob([imgs[n]], { type: mimeOf(n) })); });
          return map;
        });
      };
      local = new PL.PackLibrary([localIdb, bundle]);
      return local;
    });
  }

  var Client = {
    mode: serverMode ? 'server' : 'browser',
    description: function () {
      if (serverMode) return 'Libreria: cartella packs/ del programma (server locale attivo).';
      if (localIdb && localIdb.volatile) return 'Libreria: solo memoria temporanea (il browser non consente di salvare): i pacchetti importati spariranno chiudendo la pagina. Avvia con AVVIA_IL_SECCHIONE.bat per salvarli nella cartella packs/.';
      return 'Libreria: pacchetti del programma (packs/) + pacchetti salvati in questo browser. Con il server attivo i pacchetti vengono salvati nella cartella packs/.';
    },

    /** Elenco completo: [{id, ok, errors, summary, pack, storage, removable, exportable}] + mappe immagini per i pack del browser. */
    load: function () {
      if (serverMode) {
        return json(api('/api/host/packs')).then(function (r) {
          if (!r || !r.ok) throw new Error((r && r.errors && r.errors[0]) || 'elenco pacchetti non disponibile');
          return { packs: r.packs, imageMaps: {} };
        });
      }
      return localLibrary().then(function (lib) {
        return lib.list().then(function (list) {
          var browserIds = list.filter(function (p) { return p.storage === localIdb.name; }).map(function (p) { return p.id; });
          return Promise.all(browserIds.map(function (id) {
            if (imageURLCache[id]) return Promise.resolve(imageURLCache[id]);
            return localIdb.imageURLs(id).then(function (m) { imageURLCache[id] = m; return m; });
          })).then(function (maps) {
            var imageMaps = {};
            browserIds.forEach(function (id, i) { imageMaps[id] = maps[i]; });
            return { packs: list, imageMaps: imageMaps };
          });
        });
      });
    },

    /** Importa un file (.zip o .json) scelto o trascinato dal docente. */
    importFile: function (file) {
      if (serverMode) {
        return json(api('/api/host/packs/import', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name || 'pacchetto.zip') } }));
      }
      return Promise.all([localLibrary(), readFileBytes(file)]).then(function (x) { return x[0].importFile(file.name || 'pacchetto.zip', x[1]); });
    },
    /** Importa byte già in memoria (migrazione dei pack importati nella versione precedente). */
    importBytes: function (name, bytes) {
      if (serverMode) return json(api('/api/host/packs/import', { method: 'POST', body: new Blob([bytes]), headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) } }));
      return localLibrary().then(function (lib) { return lib.importFile(name, bytes); });
    },
    duplicate: function (id) {
      if (serverMode) return json(api('/api/host/packs/' + encodeURIComponent(id) + '/duplicate', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }));
      return localLibrary().then(function (lib) { return lib.duplicate(id); });
    },
    /** → {ok, blob, filename, warnings} */
    exportZip: function (id) {
      if (serverMode) {
        return api('/api/host/packs/' + encodeURIComponent(id) + '/export').then(function (r) {
          if (!r.ok) return r.json().then(function (j) { return j; }, function () { return { ok: false, errors: ['esportazione non riuscita'] }; });
          var disp = r.headers.get('Content-Disposition') || '';
          var m = /filename="([^"]+)"/.exec(disp);
          var warnings = [];
          try { warnings = JSON.parse(decodeURIComponent(r.headers.get('X-Export-Warnings') || '%5B%5D')); } catch (e) { warnings = []; }
          return r.blob().then(function (b) { return { ok: true, blob: b, filename: m ? m[1] : id + '.zip', warnings: warnings }; });
        }, function () { return { ok: false, errors: ['server non raggiungibile'] }; });
      }
      return localLibrary().then(function (lib) { return lib.exportZip(id); }).then(function (r) {
        if (!r.ok) return r;
        return { ok: true, blob: new Blob([r.bytes], { type: 'application/zip' }), filename: r.filename, warnings: r.warnings };
      });
    },
    /** Pack Studio: salva uno zip come pacchetto nuovo (mode 'new') o sostituendo quello con lo stesso codice ('replace'). */
    save: function (id, bytes, mode) {
      if (serverMode) return json(api('/api/host/packs/' + encodeURIComponent(id) + (mode === 'replace' ? '?mode=replace' : ''), { method: 'PUT', body: new Blob([bytes]), headers: { 'Content-Type': 'application/zip' } }));
      return localLibrary().then(function (lib) {
        return lib.save(id + '.zip', bytes, { mode: mode, expectedId: id }).then(function (r) {
          if (r.ok && imageURLCache[id]) { Object.keys(imageURLCache[id]).forEach(function (n) { URL.revokeObjectURL(imageURLCache[id][n]); }); delete imageURLCache[id]; }
          return r;
        });
      });
    },
    /** Pack Studio: byte .zip completi di un pacchetto della libreria (per riaprirlo e modificarlo). */
    openBytes: function (id) {
      return Client.exportZip(id).then(function (r) {
        if (!r.ok) return r;
        return new Promise(function (resolve) {
          var fr = new FileReader();
          fr.onload = function () { resolve({ ok: true, bytes: new Uint8Array(fr.result), filename: r.filename }); };
          fr.onerror = function () { resolve({ ok: false, errors: ['lettura non riuscita'] }); };
          fr.readAsArrayBuffer(r.blob);
        });
      });
    },
    remove: function (id) {
      if (serverMode) return json(api('/api/host/packs/' + encodeURIComponent(id), { method: 'DELETE' }));
      return localLibrary().then(function (lib) { return lib.remove(id); }).then(function (r) {
        if (r.ok && imageURLCache[id]) { Object.keys(imageURLCache[id]).forEach(function (n) { URL.revokeObjectURL(imageURLCache[id][n]); }); delete imageURLCache[id]; }
        return r;
      });
    },
    zip: Z
  };

  root.SecchionePacksClient = Client;
})(typeof self !== 'undefined' ? self : this);
