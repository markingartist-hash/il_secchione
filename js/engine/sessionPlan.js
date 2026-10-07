/*
 * Il Secchione · sessionPlan.js — Scaletta della puntata (v3.7.0).
 * Una scaletta è un elenco ordinato di RIFERIMENTI a contenuti dei pacchetti installati:
 *  - domanda: packId + questionId (id "packId/idOriginale" della regia, come packlib.composeBank);
 *  - gioco:   packId + tipo + titolo della manche (+ occorrenza, se nello stesso pacchetto più manche hanno lo stesso titolo).
 * Le domande e i giochi NON vengono copiati: la scaletta conserva solo l'anteprima per riconoscere un contenuto che non
 * esiste più (mostrato come MANCANTE, mai sostituito con un altro).
 * Funzioni pure: nessun DOM, nessuna rete, nessun punteggio. Browser (window.SecchioneSessionPlan) e Node (test).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneSessionPlan = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 'secchione-scaletta';
  var VERSION = 1;
  var LIMITS = { items: 300, plans: 60, name: 80 };
  var GAME_TYPES = ['photopuzzle', 'indovina', 'abbinamenti', 'ghigliottina', 'chain'];

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function str(x, max) { var s = String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); return max && s.length > max ? s.slice(0, max - 1) + '…' : s; }
  function nowISO() { return new Date().toISOString(); }
  function uid(rnd) {
    var r = rnd || Math.random, s = '';
    for (var i = 0; i < 12; i++) s += Math.floor(r() * 16).toString(16);
    return s;
  }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  /* ---------------- elementi ---------------- */
  function questionPreview(q) {
    return {
      title: str(q && q.question, 160) || '(domanda senza testo)',
      type: 'Domanda A/B/C/D',
      difficulty: q && q.difficulty != null ? q.difficulty : null,
      topic: str((q && (q.topic || q.category)) || '', 60)
    };
  }
  function gamePreview(type, set, gameName) {
    return {
      title: str(set && set.label, 120) || '(manche senza titolo)',
      type: str(gameName || type, 40),
      difficulty: set && set.difficulty != null ? set.difficulty : null,
      topic: str((set && set.theme) || '', 60)
    };
  }
  /** Elemento "domanda" da una domanda della regia (id "packId/id" e source come packlib.composeBank). */
  function questionItem(q, opts) {
    var o = opts || {}, src = (q && q.source) || {};
    var id = String(q && q.id || '');
    var packId = src.packId || (id.indexOf('/') > 0 ? id.slice(0, id.indexOf('/')) : '');
    return {
      uid: uid(o.rnd), kind: 'question', packId: packId, packVersion: src.packVersion || '', packTitle: src.packTitle || '',
      questionId: id, sourceQuestionId: src.questionId || (id.indexOf('/') > 0 ? id.slice(id.indexOf('/') + 1) : id),
      preview: questionPreview(q)
    };
  }
  /** Occorrenza della manche tra quelle con lo stesso titolo nello stesso pacchetto (0 = la prima). */
  function occurrenceOf(sets, index) {
    var set = sets[index], n = 0;
    for (var i = 0; i < index; i++) if (sets[i] && set && sets[i].label === set.label) n++;
    return n;
  }
  /** Elemento "gioco": sets = manche di quel tipo NEL SOLO pacchetto packId. */
  function gameItem(pack, type, sets, index, opts) {
    var o = opts || {}, set = sets[index] || {};
    return {
      uid: uid(o.rnd), kind: 'game', packId: pack.id, packVersion: pack.version || '', packTitle: pack.title || '',
      gameType: type, label: set.label || '', occurrence: occurrenceOf(sets, index),
      preview: gamePreview(type, set, o.gameName)
    };
  }
  function contentKey(item) {
    if (!item) return '';
    if (item.kind === 'question') return 'q:' + item.questionId;
    return 'g:' + item.packId + '|' + item.gameType + '|' + item.label + '|' + (item.occurrence || 0);
  }

  /* ---------------- scaletta ---------------- */
  function createPlan(name, opts) {
    var o = opts || {}, at = o.now || nowISO();
    return { format: FORMAT, version: VERSION, id: 'sc_' + uid(o.rnd), name: str(name, LIMITS.name) || 'Nuova scaletta', createdAt: at, updatedAt: at, items: [] };
  }
  function touch(plan, now) { plan.updatedAt = now || nowISO(); return plan; }

  /** Aggiunge elementi senza duplicare in silenzio: un contenuto già presente viene saltato e segnalato. */
  function addItems(plan, items, opts) {
    var o = opts || {}, have = {}, added = [], skipped = [];
    plan.items.forEach(function (it) { have[contentKey(it)] = true; });
    var at = o.at == null ? plan.items.length : Math.max(0, Math.min(plan.items.length, o.at));
    (items || []).forEach(function (it) {
      var k = contentKey(it);
      if (have[k]) { skipped.push(it); return; }
      if (plan.items.length >= LIMITS.items) { skipped.push(it); return; }
      have[k] = true;
      plan.items.splice(at + added.length, 0, it);
      added.push(it);
    });
    if (added.length) touch(plan, o.now);
    return { added: added.length, skipped: skipped.length, skippedItems: skipped };
  }
  function move(plan, from, to) {
    var n = plan.items.length;
    if (from < 0 || from >= n) return false;
    to = Math.max(0, Math.min(n - 1, to));
    if (to === from) return false;
    var it = plan.items.splice(from, 1)[0];
    plan.items.splice(to, 0, it);
    touch(plan);
    return true;
  }
  function remove(plan, index) {
    if (index < 0 || index >= plan.items.length) return null;
    var it = plan.items.splice(index, 1)[0];
    touch(plan);
    return it;
  }
  /** Duplicazione ESPLICITA: stesso contenuto, nuovo elemento subito dopo (in gara diventa un nuovo round). */
  function duplicate(plan, index, opts) {
    var it = plan.items[index];
    if (!it || plan.items.length >= LIMITS.items) return null;
    var copy = clone(it);
    copy.uid = uid((opts || {}).rnd);
    copy.duplicateOf = it.duplicateOf || it.uid;
    plan.items.splice(index + 1, 0, copy);
    touch(plan);
    return copy;
  }
  /** Mescola SOLO le domande: i giochi restano nella loro posizione. Fisher–Yates. */
  function shuffleQuestions(plan, rnd) {
    var r = rnd || Math.random, slots = [], qs = [];
    plan.items.forEach(function (it, i) { if (it.kind === 'question') { slots.push(i); qs.push(it); } });
    for (var i = qs.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = qs[i]; qs[i] = qs[j]; qs[j] = t; }
    slots.forEach(function (pos, k) { plan.items[pos] = qs[k]; });
    if (qs.length > 1) touch(plan);
    return qs.length;
  }
  function packIds(plan) {
    var out = [];
    (plan.items || []).forEach(function (it) { if (it.packId && out.indexOf(it.packId) < 0) out.push(it.packId); });
    return out;
  }

  /* ---------------- risoluzione sui pacchetti installati ---------------- */
  /**
   * Catalogo dei contenuti installati.
   * parts: [{ pack: {id, title, version}, questions: [domande come composeBank], games: {tipo: [manche del solo pack]} }]
   */
  function catalog(parts) {
    var c = { packs: {}, questions: {}, games: {} };
    (parts || []).forEach(function (p) {
      var pk = p.pack || {};
      c.packs[pk.id] = { id: pk.id, title: pk.title || pk.id, version: pk.version || '' };
      (p.questions || []).forEach(function (q) { c.questions[q.id] = q; });
      c.games[pk.id] = p.games || {};
    });
    return c;
  }
  /** Indice della manche nell'elenco `sets` (anche misto: _packId) o -1. Nessun ripiego su un'altra manche. */
  function findGameIndex(sets, item, defaultPackId) {
    var seen = 0;
    for (var i = 0; i < (sets || []).length; i++) {
      var s = sets[i] || {};
      if ((s._packId || defaultPackId) !== item.packId || s.label !== item.label) continue;
      if (seen === (item.occurrence || 0)) return i;
      seen++;
    }
    return -1;
  }
  /** Ogni elemento con `missing` (e il motivo) e, se presente, l'anteprima aggiornata. Gli elementi mancanti restano dove sono. */
  function resolve(plan, cat, opts) {
    var o = opts || {};
    return (plan.items || []).map(function (it) {
      var r = clone(it), pk = cat.packs[it.packId];
      r.missing = false; r.reason = '';
      if (!pk) { r.missing = true; r.reason = 'Pacchetto «' + (it.packTitle || it.packId) + '» non installato'; return r; }
      r.currentVersion = pk.version;
      if (it.kind === 'question') {
        var q = cat.questions[it.questionId];
        if (!q) { r.missing = true; r.reason = 'Domanda non più presente in «' + pk.title + '»'; return r; }
        r.preview = questionPreview(q);
      } else if (it.kind === 'game') {
        var sets = (cat.games[it.packId] || {})[it.gameType] || [];
        var idx = findGameIndex(sets, it, it.packId);
        if (idx < 0) { r.missing = true; r.reason = 'Manche non più presente in «' + pk.title + '»'; return r; }
        r.preview = gamePreview(it.gameType, sets[idx], o.gameNames && o.gameNames[it.gameType]);
      } else { r.missing = true; r.reason = 'Elemento non riconosciuto'; }
      return r;
    });
  }
  function summary(resolved) {
    var s = { total: 0, questions: 0, games: 0, missing: 0, playable: 0 };
    (resolved || []).forEach(function (it) {
      s.total++;
      if (it.kind === 'question') s.questions++; else s.games++;
      if (it.missing) s.missing++; else s.playable++;
    });
    return s;
  }
  function nextPlayable(items, from) { for (var i = from + 1; i < items.length; i++) if (!items[i].missing) return i; return -1; }
  function prevPlayable(items, from) { for (var i = Math.min(from, items.length) - 1; i >= 0; i--) if (!items[i].missing) return i; return -1; }

  /* ---------------- esecuzione in classe ---------------- */
  function startRun(plan, resolved, now) {
    return { planId: plan.id, name: plan.name, startedAt: now || nowISO(), items: clone(resolved), cursor: -1, visited: {}, finished: false };
  }
  /** Posizione per la regia: n-esimo elemento giocabile su totale giocabile, elemento successivo. */
  function position(run) {
    if (!run) return null;
    var playable = run.items.filter(function (it) { return !it.missing; });
    var cur = run.items[run.cursor] || null;
    var n = cur ? playable.indexOf(cur) + 1 : 0;
    var ni = nextPlayable(run.items, run.cursor);
    var visited = Object.keys(run.visited || {}).length;
    return { current: n, total: playable.length, missing: run.items.length - playable.length, item: cur, next: ni >= 0 ? run.items[ni] : null, isLast: ni < 0, visited: visited };
  }
  /** Dati della scaletta per la sessione (report/JSON): riferimenti con pacchetto e versione, nessun contenuto copiato. */
  function sessionRecord(run) {
    return {
      planId: run.planId, name: run.name, startedAt: run.startedAt, finishedAt: run.finishedAt || null,
      items: run.items.map(function (it, i) {
        var x = { position: i + 1, uid: it.uid, kind: it.kind, packId: it.packId, packVersion: it.currentVersion || it.packVersion || '', missing: !!it.missing, status: (run.visited || {})[it.uid] || (it.missing ? 'missing' : 'not_played') };
        if (it.kind === 'question') { x.questionId = it.questionId; x.sourceQuestionId = it.sourceQuestionId; } else { x.gameType = it.gameType; x.label = it.label; x.occurrence = it.occurrence || 0; }
        if (it.duplicateOf) x.duplicateOf = it.duplicateOf;
        x.title = it.preview && it.preview.title || '';
        return x;
      })
    };
  }

  /* ---------------- validazione (preferenze, importazione) ---------------- */
  function normalizeItem(raw) {
    if (!isObj(raw)) return null;
    var kind = raw.kind === 'game' ? 'game' : raw.kind === 'question' ? 'question' : null;
    if (!kind) return null;
    var packId = str(raw.packId, 60);
    if (!/^[a-z0-9][a-z0-9_-]{0,59}$/i.test(packId)) return null;
    var pv = isObj(raw.preview) ? raw.preview : {};
    var it = {
      uid: /^[a-z0-9]{6,24}$/i.test(String(raw.uid || '')) ? String(raw.uid) : uid(), kind: kind, packId: packId,
      packVersion: str(raw.packVersion, 30), packTitle: str(raw.packTitle, 120)
    };
    if (kind === 'question') {
      var qid = str(raw.questionId, 140);
      if (!qid) return null;
      if (qid.indexOf('/') < 0) qid = packId + '/' + qid;
      it.questionId = qid;
      it.sourceQuestionId = str(raw.sourceQuestionId, 120) || qid.slice(qid.indexOf('/') + 1);
    } else {
      if (GAME_TYPES.indexOf(raw.gameType) < 0) return null;
      it.gameType = raw.gameType; it.label = String(raw.label == null ? '' : raw.label).slice(0, 120);
      it.occurrence = Math.max(0, Math.min(200, Math.floor(Number(raw.occurrence) || 0)));
    }
    /* stesso ordine dei campi di questionItem/gameItem */
    it.preview = { title: str(pv.title, 160), type: str(pv.type, 40), difficulty: pv.difficulty == null ? null : pv.difficulty, topic: str(pv.topic, 60) };
    if (raw.duplicateOf && /^[a-z0-9]{6,24}$/i.test(String(raw.duplicateOf))) it.duplicateOf = String(raw.duplicateOf);
    return it;
  }
  /** { ok, plan, dropped } — accetta una scaletta salvata o importata; gli elementi illeggibili vengono contati, non inventati. */
  function normalize(raw) {
    if (!isObj(raw) || (raw.format && raw.format !== FORMAT) || !Array.isArray(raw.items)) return { ok: false, error: 'Non è una scaletta del Secchione.' };
    var items = [], dropped = 0, seen = {};
    raw.items.slice(0, LIMITS.items).forEach(function (r) {
      var it = normalizeItem(r);
      if (!it) { dropped++; return; }
      if (seen[it.uid]) it.uid = uid();
      seen[it.uid] = true;
      items.push(it);
    });
    dropped += Math.max(0, raw.items.length - LIMITS.items);
    var at = nowISO();
    var plan = {
      format: FORMAT, version: VERSION,
      id: /^sc_[a-z0-9]{6,24}$/i.test(String(raw.id || '')) ? String(raw.id) : 'sc_' + uid(),
      name: str(raw.name, LIMITS.name) || 'Scaletta senza nome',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : at,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : at,
      items: items
    };
    return { ok: true, plan: plan, dropped: dropped };
  }
  /** Inserisce o sostituisce (stesso id) nell'elenco delle scalette salvate, più recenti prima. */
  function upsert(list, plan) {
    var out = (Array.isArray(list) ? list : []).filter(function (p) { return p && p.id !== plan.id; });
    out.unshift(clone(plan));
    out.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    return out.slice(0, LIMITS.plans);
  }
  /** Unisce le scalette di due copie (browser e server): per ogni id vince la più recente. */
  function mergeLists(a, b) {
    var by = {};
    [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach(function (p) {
      var r = normalize(p);
      if (!r.ok) return;
      var old = by[r.plan.id];
      if (!old || String(r.plan.updatedAt) > String(old.updatedAt)) by[r.plan.id] = r.plan;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return String(y.updatedAt).localeCompare(String(x.updatedAt)); }).slice(0, LIMITS.plans);
  }
  function exportJSON(plan) {
    var p = clone(plan);
    return JSON.stringify({ format: FORMAT, version: VERSION, id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, items: p.items }, null, 2);
  }

  return {
    FORMAT: FORMAT, VERSION: VERSION, LIMITS: LIMITS,
    questionItem: questionItem, gameItem: gameItem, contentKey: contentKey, occurrenceOf: occurrenceOf,
    createPlan: createPlan, addItems: addItems, move: move, remove: remove, duplicate: duplicate,
    shuffleQuestions: shuffleQuestions, packIds: packIds,
    catalog: catalog, findGameIndex: findGameIndex, resolve: resolve, summary: summary,
    nextPlayable: nextPlayable, prevPlayable: prevPlayable,
    startRun: startRun, position: position, sessionRecord: sessionRecord,
    normalize: normalize, upsert: upsert, mergeLists: mergeLists, exportJSON: exportJSON
  };
});
