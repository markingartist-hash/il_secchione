/*
 * Il Secchione · packs.js (motore)
 * Validazione e normalizzazione dei PACK di contenuti, con compatibilità v3.
 * Il motore è neutro: niente qui dentro conosce l'Arte romana.
 * Formato documentato in PACK_FORMAT.md.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchionePackEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 'secchione-pack';
  var FORMAT_VERSION = 1;
  var LETTERS = ['A', 'B', 'C', 'D'];
  var GAME_TYPES = ['photopuzzle', 'indovina', 'abbinamenti', 'ghigliottina', 'chain'];
  var EDITABLE_GAMES = ['chain', 'indovina', 'ghigliottina'];
  var QUESTION_TYPES = ['mcq'];
  var RESERVED_TYPES = ['truefalse', 'numeric', 'text', 'buzzer'];
  var STATUSES = ['approved', 'draft', 'review'];
  /* Nomi visibili neutri. Gli ID interni restano quelli della v3 per compatibilità dei dati. */
  var DEFAULT_GAME_NAMES = {
    photopuzzle: 'Photopuzzle',
    indovina: 'Indovina',
    abbinamenti: 'Abbinamenti',
    ghigliottina: 'Parola Segreta',
    chain: 'Staffetta di parole'
  };
  var LEGACY_GAME_NAMES = { ghigliottina: 'Ghigliottina', chain: 'Catena di parole' };
  var MAX_QUESTIONS = 1000;
  var MAX_SETS_PER_GAME = 200;

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function str(v) { return typeof v === 'string' ? v.trim() : ''; }
  function clampInt(v, min, max, fb) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fb;
    return Math.max(min, Math.min(max, n));
  }
  function safeAssetName(name) {
    var n = String(name || '').trim();
    if (!n) return '';
    if (/["<>\r\n]/.test(n)) throw new Error('nome file immagine non valido');
    if (/^(data:image\/(png|jpeg|webp|gif);base64,)/i.test(n)) return n;
    if (/^[a-z][a-z0-9+.-]*:/i.test(n)) throw new Error('le immagini devono essere file locali (niente indirizzi web)');
    if (n.indexOf('..') >= 0) throw new Error('il percorso immagine non può contenere ".."');
    return n.replace(/\\/g, '/');
  }
  function stripPrefixes(name, prefixes) {
    var n = name;
    (prefixes || []).forEach(function (p) { if (p && n.indexOf(p) === 0) n = n.slice(p.length); });
    return n;
  }

  /**
   * Valida e normalizza una domanda.
   * opts.lenient: rigenera id mancanti/duplicati invece di segnalare errore (import archivio v3).
   * opts.imagePrefixes: prefissi legacy da togliere (es. "romana/").
   * opts.ids: oggetto condiviso per controllare i duplicati.
   * opts.makeId: funzione per creare nuovi id.
   */
  function normalizeQuestion(x, index, opts) {
    var o = opts || {};
    var where = 'domanda ' + (index + 1);
    if (!isObj(x)) throw new Error(where + ': non è un oggetto');
    var type = str(x.type) || 'mcq';
    if (QUESTION_TYPES.indexOf(type) < 0) {
      if (RESERVED_TYPES.indexOf(type) >= 0) throw new Error(where + ': il tipo "' + type + '" è previsto ma non ancora giocabile dalla regia (usa "mcq")');
      throw new Error(where + ': tipo "' + type + '" sconosciuto');
    }
    var question = str(x.question);
    if (!question) throw new Error(where + ': manca il testo della domanda');
    if (question.length > 500) throw new Error(where + ': domanda oltre 500 caratteri');
    if (!Array.isArray(x.options) || x.options.length !== 4) throw new Error(where + ': servono esattamente 4 alternative');
    var options = x.options.map(function (v) { return str(v); });
    if (options.some(function (v) { return !v || v.length > 200; })) throw new Error(where + ': ogni alternativa deve avere da 1 a 200 caratteri');
    var lower = options.map(function (v) { return v.toLowerCase(); });
    if (lower.some(function (v, i) { return lower.indexOf(v) !== i; })) throw new Error(where + ': le 4 alternative devono essere diverse');
    var correct = str(x.correct).toUpperCase();
    if (LETTERS.indexOf(correct) < 0) throw new Error(where + ': "correct" deve essere A, B, C o D');
    var id = typeof x.id === 'string' && x.id.trim() ? x.id.trim() : (typeof x.id === 'number' ? String(x.id) : '');
    var ids = o.ids || {};
    if (!id || ids[id]) {
      if (!o.lenient) throw new Error(where + ': ' + (id ? 'id "' + id + '" duplicato' : 'manca "id"'));
      id = (o.makeId || defaultId)('q');
    }
    ids[id] = true;
    var image = '';
    try { image = stripPrefixes(safeAssetName(x.image), o.imagePrefixes); } catch (e) { throw new Error(where + ': ' + e.message); }
    var media = Array.isArray(x.media) ? x.media.map(function (m) {
      if (typeof m === 'string') return { type: 'image', src: stripPrefixes(safeAssetName(m), o.imagePrefixes) };
      if (isObj(m)) return { type: str(m.type) || 'image', src: stripPrefixes(safeAssetName(m.src), o.imagePrefixes), caption: str(m.caption) };
      throw new Error(where + ': elemento "media" non valido');
    }) : [];
    if (!image && media.length && media[0].type === 'image') image = media[0].src;
    var status = STATUSES.indexOf(str(x.status)) >= 0 ? str(x.status) : 'approved';
    var out = {};
    // Conserva eventuali campi extra (es. sourcePage, section) per compatibilità.
    Object.keys(x).forEach(function (k) { out[k] = x[k]; });
    out.id = id;
    out.type = type;
    out.subject = str(x.subject) || (o.defaults && o.defaults.subject) || '';
    out.grade = x.grade == null || x.grade === '' ? ((o.defaults && o.defaults.grade) || null) : clampInt(x.grade, 1, 13, null);
    out.topic = str(x.topic) || (o.defaults && o.defaults.topic) || '';
    out.category = str(x.category) || out.topic || (o.defaults && o.defaults.topic) || 'Generale';
    out.difficulty = clampInt(x.difficulty, 1, 5, 1);
    out.question = question;
    out.options = options;
    out.correct = correct;
    out.explanation = str(x.explanation).slice(0, 1000);
    /* RC2-A: senza "seconds" la domanda usa il tempo standard (engine/timer.js), quindi il campo resta assente. */
    if (x.seconds == null || x.seconds === '' || !isFinite(Number(x.seconds))) delete out.seconds;
    else out.seconds = clampInt(x.seconds, 5, 600, 15);
    out.image = image;
    out.media = media;
    out.author = str(x.author);
    out.status = status;
    delete out.points; // il valore della domanda dipende dal profilo di punteggio, non dalla domanda
    return out;
  }

  function defaultId(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /** Normalizza un array di domande. Restituisce {questions, errors}. Con opts.lenient salta solo gli id. */
  function normalizeQuestions(arr, opts) {
    var o = opts || {};
    var errors = [];
    var list = Array.isArray(arr) ? arr : (isObj(arr) && Array.isArray(arr.questions) ? arr.questions : null);
    if (!list) return { questions: [], errors: ['le domande devono essere un elenco (array JSON)'] };
    if (!list.length) return { questions: [], errors: ['nessuna domanda presente'] };
    if (list.length > MAX_QUESTIONS) return { questions: [], errors: ['massimo ' + MAX_QUESTIONS + ' domande'] };
    var ids = {};
    var questions = [];
    list.forEach(function (x, i) {
      try {
        questions.push(normalizeQuestion(x, i, { lenient: o.lenient, imagePrefixes: o.imagePrefixes, ids: ids, makeId: o.makeId, defaults: o.defaults }));
      } catch (e) { errors.push(e.message); }
    });
    return { questions: questions, errors: errors };
  }

  /* ---------- Giochi ---------- */

  function text(v, label, max) {
    if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw new Error(label + ': inserisci da 1 a ' + max + ' caratteri.');
    return v.trim();
  }

  /**
   * Photopuzzle (RC1): punto dell'immagine che resta inquadrato quando la foto riempie la cornice (object-fit:cover).
   * Accetta "X% Y%" (0–100) oppure parole: centro/center, alto/top, basso/bottom, sinistra/left, destra/right (anche in coppia).
   * Restituisce sempre la forma normalizzata "X% Y%", oppure '' se il valore non è valido.
   */
  var FOCUS_WORDS = { centro: [50, null], center: [50, null], alto: [null, 0], top: [null, 0], basso: [null, 100], bottom: [null, 100], sinistra: [0, null], left: [0, null], destra: [100, null], right: [100, null] };
  function photoFocus(value) {
    var s = String(value == null ? '' : value).trim().toLowerCase();
    if (!s || s.length > 30) return '';
    var m = /^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/.exec(s);
    if (m) {
      var px = Number(m[1]), py = Number(m[2]);
      return px <= 100 && py <= 100 ? Math.round(px) + '% ' + Math.round(py) + '%' : '';
    }
    var words = s.split(/\s+/), x = null, y = null;
    if (words.length > 2) return '';
    for (var i = 0; i < words.length; i++) {
      var w = FOCUS_WORDS[words[i]];
      if (!w) return '';
      if (w[0] != null) { if (x != null && words[i] !== 'centro' && words[i] !== 'center') return ''; x = w[0]; }
      if (w[1] != null) { if (y != null) return ''; y = w[1]; }
    }
    return (x == null ? 50 : x) + '% ' + (y == null ? 50 : y) + '%';
  }

  /**
   * Valida una manche. Stesse regole della v3 per Indovina / Ghigliottina / Catena
   * (messaggi riusati dall'editor della regia), più Photopuzzle e Abbinamenti.
   */
  function validateGame(type, raw, opts) {
    var o = opts || {};
    if (GAME_TYPES.indexOf(type) < 0 || !isObj(raw)) throw new Error('Tipo di gioco non valido.');
    var x = { label: text(raw.label, 'Titolo', 80), theme: text(raw.theme || raw.label, 'Tema', 70) };
    /* RC2-A: senza "seconds" vale il tempo standard del tipo di gioco (engine/timer.js). */
    if (raw.seconds != null && raw.seconds !== '' && isFinite(Number(raw.seconds))) x.seconds = clampInt(raw.seconds, 10, 300, 45);
    function variants(value, max) {
      if (!Array.isArray(value)) throw new Error('acceptedAnswers deve essere un elenco di risposte testuali.');
      return value.map(function (v) { return text(v, 'Risposta accettata', max); }).filter(function (v, i, list) { return list.indexOf(v) === i; });
    }
    if (raw.acceptedAnswers != null) {
      if (type === 'chain') throw new Error('Staffetta: inserisci acceptedAnswers nei singoli collegamenti.');
      x.acceptedAnswers = variants(raw.acceptedAnswers, 80);
    }
    if (type === 'chain') {
      if (!Array.isArray(raw.links) || !raw.links.length || raw.links.length > 20) throw new Error('Inserisci da 1 a 20 collegamenti validi.');
      x.links = raw.links.map(function (p) {
        if (!isObj(p)) throw new Error('Collegamento non valido.');
        var from = text(p.from, 'Parola iniziale', 40);
        var to = text(p.to, 'Parola finale', 40);
        if (from.toLowerCase() === to.toLowerCase()) throw new Error('Due parole collegate devono essere diverse.');
        var link = { from: from, to: to };
        if (p.acceptedAnswers != null) link.acceptedAnswers = variants(p.acceptedAnswers, 40);
        return link;
      });
    } else if (type === 'indovina') {
      x.subject = text(raw.subject, 'Soluzione', 60);
      if (!Array.isArray(raw.candidates) || raw.candidates.length < 2 || raw.candidates.length > 8) throw new Error('Inserisci da 2 a 8 alternative.');
      x.candidates = raw.candidates.map(function (v) { return text(v, 'Alternativa', 60); });
      var keys = x.candidates.map(function (v) { return v.toLocaleLowerCase(); });
      if (keys.some(function (k, i) { return keys.indexOf(k) !== i; })) throw new Error('Le alternative devono essere tutte diverse.');
      if (keys.indexOf(x.subject.toLocaleLowerCase()) < 0) throw new Error('La soluzione deve essere presente tra le alternative.');
      if (!Array.isArray(raw.clues) || !raw.clues.length || raw.clues.length > 5) throw new Error('Inserisci da 1 a 5 indizi.');
      x.clues = raw.clues.map(function (v) { return text(v, 'Indizio', 180); });
    } else if (type === 'ghigliottina') {
      x.answer = text(raw.answer, 'Parola finale', 40);
      if (!Array.isArray(raw.pairs) || raw.pairs.length !== 5) throw new Error('Servono esattamente 5 coppie.');
      x.pairs = raw.pairs.map(function (p) {
        if (!Array.isArray(p) || p.length !== 2) throw new Error('Ogni riga deve contenere due parole separate da |.');
        var pair = p.map(function (v) { return text(v, 'Parola della coppia', 40); });
        if (pair[0].toLowerCase() === pair[1].toLowerCase()) throw new Error('Le parole di ogni coppia devono essere diverse.');
        return pair;
      });
    } else if (type === 'photopuzzle') {
      x.image = stripPrefixes(safeAssetName(text(raw.image, 'Immagine', 2000000)), o.imagePrefixes);
      x.answer = text(raw.answer, 'Soluzione', 80);
      if (raw.sourcePage != null) x.sourcePage = raw.sourcePage;
      if (raw.sourceLabel != null) x.sourceLabel = raw.sourceLabel;
      if (raw.focus != null && String(raw.focus).trim() !== '') {
        var f = photoFocus(raw.focus);
        if (!f) throw new Error('Punto focale: scrivi due percentuali (orizzontale verticale), es. 50% 30%, oppure una parola come alto, centro, basso.');
        x.focus = f;
      }
    } else if (type === 'abbinamenti') {
      if (!Array.isArray(raw.cards) || raw.cards.length !== 4) throw new Error('Servono esattamente 4 immagini.');
      if (!Array.isArray(raw.names) || raw.names.length !== raw.cards.length) throw new Error('Serve un termine per ogni immagine.');
      x.cards = raw.cards.map(function (c, i) {
        if (!isObj(c)) throw new Error('Immagine ' + (i + 1) + ' non valida.');
        return { img: stripPrefixes(safeAssetName(text(c.img, 'Immagine ' + (i + 1), 2000000)), o.imagePrefixes), title: str(c.title) || ('Immagine ' + (i + 1)) };
      });
      x.names = raw.names.map(function (v) { return text(v, 'Termine', 60); });
      var lk = x.names.map(function (v) { return v.toLowerCase(); });
      if (lk.some(function (k, i) { return lk.indexOf(k) !== i; })) throw new Error('I termini devono essere tutti diversi.');
    }
    /* RC2-A.3: istruzione facoltativa del docente, mostrata sulla tendina del gioco (i programmi precedenti la ignorano). */
    if (raw.instruction != null && String(raw.instruction).trim() !== '') {
      var ins = String(raw.instruction).replace(/[\u0000-\u001f]/g, ' ').trim();
      if (ins.length > 160) throw new Error('Istruzione troppo lunga (massimo 160 caratteri).');
      x.instruction = ins;
    }
    return x;
  }

  /** Accetta {games:{...}} (v3.5) oppure {version:3, games:{...}} (export v3) oppure direttamente {tipo:[...]}. */
  function normalizeGames(obj, opts) {
    var o = opts || {};
    var errors = [];
    var games = {};
    GAME_TYPES.forEach(function (t) { games[t] = []; });
    if (obj == null) return { games: games, errors: errors };
    var src = isObj(obj) && isObj(obj.games) ? obj.games : obj;
    if (!isObj(src)) return { games: games, errors: ['i giochi devono essere un oggetto { "tipo": [ ... ] }'] };
    Object.keys(src).forEach(function (type) {
      if (GAME_TYPES.indexOf(type) < 0) { errors.push('gioco sconosciuto "' + type + '"'); return; }
      if (!Array.isArray(src[type])) { errors.push(type + ': serve un elenco di manche'); return; }
      if (src[type].length > MAX_SETS_PER_GAME) { errors.push(type + ': massimo ' + MAX_SETS_PER_GAME + ' manche'); return; }
      src[type].forEach(function (raw, i) {
        try { games[type].push(validateGame(type, raw, o)); } catch (e) { errors.push(type + ' manche ' + (i + 1) + ': ' + e.message); }
      });
    });
    return { games: games, errors: errors };
  }

  function countGames(games) {
    return GAME_TYPES.reduce(function (n, t) { return n + ((games && games[t]) || []).length; }, 0);
  }

  /* ---------- Pack ---------- */

  /**
   * Valida un pack completo (manifest + questions + games già caricati).
   * Restituisce {ok, errors, warnings, pack} dove pack è la sorgente normalizzata.
   */
  function validatePack(input) {
    var errors = [];
    var warnings = [];
    if (!isObj(input)) return { ok: false, errors: ['il pack deve essere un oggetto JSON'], warnings: warnings, pack: null };
    if (input.format !== FORMAT) errors.push('"format" deve valere "' + FORMAT + '"');
    if (Number(input.formatVersion) !== FORMAT_VERSION) errors.push('"formatVersion" deve valere ' + FORMAT_VERSION);
    var id = str(input.id);
    if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id)) errors.push('"id" obbligatorio: 2-40 caratteri, solo minuscole, numeri, _ e -');
    var title = str(input.title);
    if (!title || title.length > 60) errors.push('"title" obbligatorio (max 60 caratteri)');
    var version = str(input.version);
    if (!version) errors.push('"version" obbligatoria (es. "1.0.0")');
    var legacy = isObj(input.legacy) ? input.legacy : {};
    var prefixes = legacy.imagePrefix ? [String(legacy.imagePrefix)] : [];
    var defaults = { subject: str(input.subject), grade: input.grade == null ? null : clampInt(input.grade, 1, 13, null), topic: title };
    var q = normalizeQuestions(input.questions, { imagePrefixes: prefixes, defaults: defaults });
    q.errors.forEach(function (e) { errors.push(e); });
    var g = normalizeGames(input.games, { imagePrefixes: prefixes });
    g.errors.forEach(function (e) { errors.push(e); });
    var playable = q.questions.filter(function (x) { return x.status === 'approved'; });
    if (q.questions.length && !playable.length) errors.push('nessuna domanda con status "approved"');
    if (q.questions.length !== playable.length) warnings.push((q.questions.length - playable.length) + ' domande in bozza non verranno usate in gara');
    var theme = isObj(input.theme) ? input.theme : {};
    var pack = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      id: id,
      title: title,
      subtitle: str(input.subtitle),
      subject: defaults.subject,
      grade: defaults.grade,
      gradeLabel: str(input.gradeLabel),
      author: str(input.author),
      version: version,
      description: str(input.description),
      language: str(input.language) || 'it',
      license: str(input.license),
      theme: {
        eyebrow: str(theme.eyebrow) || 'IL SECCHIONE',
        accent: /^#[0-9a-f]{3,8}$/i.test(str(theme.accent)) ? str(theme.accent) : '#f5bd63',
        accent2: /^#[0-9a-f]{3,8}$/i.test(str(theme.accent2)) ? str(theme.accent2) : '#d9784b',
        homeImage: (function () { try { return stripPrefixes(safeAssetName(theme.homeImage), prefixes); } catch (e) { errors.push('theme.homeImage: ' + e.message); return ''; } })(),
        tags: Array.isArray(theme.tags) ? theme.tags.map(str).filter(Boolean).slice(0, 6) : []
      },
      texts: isObj(input.texts) ? input.texts : {},
      gameNames: isObj(input.gameNames) ? input.gameNames : {},
      imageBase: str(input.imageBase),
      legacy: legacy,
      questions: q.questions,
      games: g.games
    };
    if (!countGames(g.games)) warnings.push('nessun gioco arcade nel pack');
    return { ok: errors.length === 0, errors: errors, warnings: warnings, pack: pack };
  }

  /** Converte la sorgente normalizzata nell'oggetto usato dalla regia (stessa forma della v3). */
  function toRuntime(src, opts) {
    var o = opts || {};
    var names = {};
    GAME_TYPES.forEach(function (t) {
      var custom = src.gameNames && typeof src.gameNames[t] === 'string' && src.gameNames[t].trim();
      names[t] = custom || DEFAULT_GAME_NAMES[t];
    });
    var arcade = {};
    GAME_TYPES.forEach(function (t) { arcade[t] = (src.games && src.games[t] ? src.games[t] : []).map(function (x) { return JSON.parse(JSON.stringify(x)); }); });
    var texts = src.texts || {};
    return {
      key: src.id,
      id: src.id,
      title: src.title,
      eyebrow: (src.theme && src.theme.eyebrow) || 'IL SECCHIONE',
      subtitle: src.subtitle || '',
      tags: (src.theme && src.theme.tags) || [],
      homeImage: (src.theme && src.theme.homeImage) || '',
      accent: (src.theme && src.theme.accent) || '#f5bd63',
      accent2: (src.theme && src.theme.accent2) || '#d9784b',
      imageBase: src.imageBase || o.imageBase || ('packs/' + src.id + '/images/'),
      imagePrefixes: src.legacy && src.legacy.imagePrefix ? [src.legacy.imagePrefix] : [],
      v3Key: src.legacy && src.legacy.v3PackKey ? src.legacy.v3PackKey : '',
      questions: src.questions.filter(function (x) { return x.status === 'approved'; }),
      arcadeSets: arcade,
      gameNames: names,
      texts: {
        homeEyebrow: texts.homeEyebrow || 'IL GAME SHOW DELLA CLASSE',
        homeClaim: texts.homeClaim || 'Osserva. Ragiona. Rispondi.\nConquista la classifica.',
        mascotHome: texts.mascotHome || 'Pronti\nper la sfida?',
        footer: texts.footer || ((src.theme && src.theme.tags) || []).join(' · ').toUpperCase()
      },
      meta: { subject: src.subject, grade: src.grade, gradeLabel: src.gradeLabel, author: src.author, version: src.version, description: src.description, license: src.license },
      origin: o.origin || 'installed'
    };
  }

  /** Import di un archivio domande v3 (domande_romana.json) dentro un pack esistente. */
  function importV3Questions(arr, runtimePack, makeId) {
    return normalizeQuestions(arr, { lenient: true, imagePrefixes: runtimePack ? runtimePack.imagePrefixes : [], makeId: makeId, defaults: runtimePack ? { subject: runtimePack.meta && runtimePack.meta.subject, grade: runtimePack.meta && runtimePack.meta.grade, topic: runtimePack.title } : null });
  }

  /** Import di un export giochi v3 ({version:3, games:{...}}). */
  function importV3Games(obj, runtimePack) {
    if (!isObj(obj) || !isObj(obj.games)) return { games: null, errors: ['usa un archivio giochi esportato dalla versione 3 o 3.5'] };
    return normalizeGames(obj, { imagePrefixes: runtimePack ? runtimePack.imagePrefixes : [] });
  }

  return {
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    LETTERS: LETTERS,
    GAME_TYPES: GAME_TYPES,
    EDITABLE_GAMES: EDITABLE_GAMES,
    QUESTION_TYPES: QUESTION_TYPES,
    RESERVED_TYPES: RESERVED_TYPES,
    DEFAULT_GAME_NAMES: DEFAULT_GAME_NAMES,
    LEGACY_GAME_NAMES: LEGACY_GAME_NAMES,
    normalizeQuestion: normalizeQuestion,
    normalizeQuestions: normalizeQuestions,
    validateGame: validateGame,
    photoFocus: photoFocus,
    normalizeGames: normalizeGames,
    countGames: countGames,
    validatePack: validatePack,
    toRuntime: toRuntime,
    importV3Questions: importV3Questions,
    importV3Games: importV3Games,
    safeAssetName: safeAssetName
  };
});
