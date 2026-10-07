/*
 * Il Secchione · SessionStore lato browser (regia).
 * - localStorage: sempre (funziona anche da file://)
 * - server locale: copia di sicurezza su disco quando la regia è aperta da http://localhost
 * Una partita non conclusa non viene MAI sovrascritta da una partita vuota finché il docente non sceglie
 * RIPRENDI / NUOVA PARTITA / ESPORTA E ARCHIVIA.
 */
(function (root) {
  'use strict';
  var PREFS_KEY = 'il-secchione-v35-prefs';
  var SNAP_KEY = 'il-secchione-v35-session';
  var ARCHIVE_KEY = 'il-secchione-v35-archive';
  var ARCHIVE_MAX = 3;

  function hostKey() {
    var m = document.querySelector('meta[name="secchione-host-key"]');
    return m ? m.getAttribute('content') || '' : '';
  }
  function serverAvailable() { return /^https?:$/.test(location.protocol) && !!hostKey(); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function parse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function hasProgress(snap) {
    var s = snap && snap.session;
    return !!s && s.status === 'active' && (((s.participants || []).length > 0) || ((s.responses || []).length > 0));
  }

  function api(path, opts) {
    var o = opts || {};
    var headers = { 'X-Secchione-Host': hostKey() };
    if (o.body) headers['Content-Type'] = 'application/json';
    return fetch(path, { method: o.method || 'GET', headers: headers, body: o.body, keepalive: !!o.keepalive, cache: 'no-store' });
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
  }

  /* Guardia: sessionId della partita non conclusa trovata all'avvio. */
  var guard = (function () { var s = parse(lsGet(SNAP_KEY)); return hasProgress(s) ? s.session.sessionId : null; })();

  var postTO = null;
  var pendingJson = null;
  var serverFailures = 0;
  function postSnapshot(json, immediate) {
    pendingJson = json;
    clearTimeout(postTO);
    var run = function () {
      var body = pendingJson;
      pendingJson = null;
      if (!body) return;
      api('/api/host/snapshot', { method: 'POST', body: body, keepalive: body.length < 60000 })
        .then(function (r) { serverFailures = r.ok ? 0 : serverFailures + 1; })
        .catch(function () { serverFailures++; });
    };
    if (immediate) run(); else postTO = setTimeout(run, 400);
  }

  var Store = {
    serverAvailable: serverAvailable,
    hasProgress: hasProgress,

    loadPrefs: function () { var p = parse(lsGet(PREFS_KEY)); return isObj(p) ? p : {}; },
    savePrefs: function (p) {
      var json = JSON.stringify(p);
      var ok = lsSet(PREFS_KEY, json);
      if (serverAvailable()) api('/api/host/prefs', { method: 'PUT', body: json }).catch(function () {});
      return ok;
    },
    /** Copia delle preferenze sul server (data/prefs.json): serve a ripristinare le scalette se il browser le ha perse. */
    loadServerPrefs: function () {
      if (!serverAvailable()) return Promise.resolve(null);
      return withTimeout(api('/api/host/prefs'), 1500).then(function (r) { return r.status === 200 ? r.json() : null; }).catch(function () { return null; });
    },
    /** Preferenze salvate dalla v3 (stessa origine file://). */
    loadV3Prefs: function (v3Key) { var p = parse(lsGet('il-secchione-' + v3Key + '-v30')); return isObj(p) ? p : null; },

    loadSnapshot: function () { return parse(lsGet(SNAP_KEY)); },
    loadServerSnapshot: function () {
      if (!serverAvailable()) return Promise.resolve(null);
      return withTimeout(api('/api/host/snapshot'), 1500).then(function (r) { return r.status === 200 ? r.json() : null; }).catch(function () { return null; });
    },
    saveSnapshot: function (snap, immediate) {
      if (!snap || !snap.session) return false;
      if (guard && snap.session.sessionId !== guard) return false;
      if (guard && snap.session.sessionId === guard) guard = null;
      var json = JSON.stringify(snap);
      if (!lsSet(SNAP_KEY, json)) {
        lsSet(ARCHIVE_KEY, '[]');
        if (!lsSet(SNAP_KEY, json)) { /* quota piena: resta la copia sul server */ }
      }
      if (serverAvailable()) postSnapshot(json, immediate || snap.reason === 'unload' || snap.reason === 'hidden');
      return true;
    },
    /** Archivia (locale + server) e libera lo spazio della partita in corso. */
    archiveSnapshot: function (snap) {
      guard = null;
      if (!snap || !snap.session) return;
      var copy = JSON.parse(JSON.stringify(snap));
      copy.session.status = 'archived';
      var list = parse(lsGet(ARCHIVE_KEY));
      if (!Array.isArray(list)) list = [];
      list.unshift({ archivedAt: new Date().toISOString(), snapshot: copy });
      while (list.length > ARCHIVE_MAX) list.pop();
      if (!lsSet(ARCHIVE_KEY, JSON.stringify(list))) lsSet(ARCHIVE_KEY, JSON.stringify(list.slice(0, 1)));
      var cur = parse(lsGet(SNAP_KEY));
      if (cur && cur.session && cur.session.sessionId === snap.session.sessionId) lsDel(SNAP_KEY);
      if (serverAvailable()) api('/api/host/archive', { method: 'POST', body: JSON.stringify(copy) }).catch(function () {});
    },
    listArchive: function () { var l = parse(lsGet(ARCHIVE_KEY)); return Array.isArray(l) ? l : []; },
    release: function () { guard = null; },
    status: function () { return { server: serverAvailable(), serverFailures: serverFailures, guarded: !!guard }; }
  };

  root.SecchioneStore = Store;
})(typeof self !== 'undefined' ? self : this);
