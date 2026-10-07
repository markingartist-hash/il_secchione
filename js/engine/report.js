/*
 * Il Secchione · report.js
 * Export didattici a partire dai dati grezzi della sessione: CSV (una riga per risposta),
 * report HTML leggibile e stampabile, log tecnico. Funzioni pure (browser e Node).
 * Report FORMATIVO: descrive le risposte date, non misura competenze.
 */
(function (root, factory) {
  var scoring = (typeof module !== 'undefined' && module.exports) ? require('./scoring.js') : root.SecchioneScoring;
  var api = factory(scoring);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneReport = api;
})(typeof self !== 'undefined' ? self : this, function (Scoring) {
  'use strict';

  var OUTCOME_IT = { correct: 'corretta', wrong: 'errata', omitted: 'omessa' };
  var MODE_IT = { lesson: 'lezione', qualification: 'qualificazione', final: 'finale' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  /*
   * Contratto CSV versione 2 (da v3.5.3) — vedi EXPORT_CSV.md
   * - separatore ";", BOM UTF-8, righe CRLF, virgolette doppie se la cella contiene ; " o un a capo (invariato);
   * - modalità "foglio di calcolo" (PREDEFINITA): una cella di testo che inizia con = + - @, con un carattere di controllo
   *   (codici 0-31 e 127: tabulazione, ritorno a capo, a capo…) o con i corrispondenti segni a larghezza piena
   *   viene preceduta da un apostrofo ', così Excel, LibreOffice e Fogli Google non la eseguono come formula.
   *   I numeri veri (anche negativi, es. punti -2) restano numeri;
   * - modalità "dati grezzi" ({ raw: true }): celle esattamente come registrate, per programmi che rielaborano i dati.
   */
  var CSV_CONTRACT = { version: 2, separator: ';', encoding: 'utf-8-bom', defaultMode: 'spreadsheet', modes: ['spreadsheet', 'raw'] };
  var FORMULA_START = new RegExp('^[=+\\-@\\x00-\\x1f\\x7f' + String.fromCharCode(0xFF1D, 0xFF0B, 0xFF0D, 0xFF20) + ']');
  var PLAIN_NUMBER = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/;
  /** Cella sicura per i fogli di calcolo (vedi contratto sopra). I valori numerici non vengono mai toccati. */
  function spreadsheetSafe(v) {
    if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
    var s = String(v);
    return FORMULA_START.test(s) && !PLAIN_NUMBER.test(s) ? "'" + s : s;
  }
  function csvCell(v, raw) {
    if (v == null) return '';
    var s = String(raw ? v : spreadsheetSafe(v));
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(rows, opts) {
    var raw = !!(opts && opts.raw);
    return '﻿' + rows.map(function (r) { return r.map(function (c) { return csvCell(c, raw); }).join(';'); }).join('\r\n') + '\r\n';
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }
  function mean(arr) { return arr.length ? Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) : null; }
  function sec(ms) { return ms == null ? '—' : (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** Indici di supporto: round confermati, punti per (round, partecipante), nomi. */
  function index(session) {
    var rounds = {};
    (session.rounds || []).forEach(function (r) { rounds[r.roundInstanceId] = r; });
    var points = {}, bonus = {};
    (session.scoreEvents || []).forEach(function (e) { if (!e.voided) { points[e.roundInstanceId + '|' + e.participantId] = e.points; bonus[e.roundInstanceId + '|' + e.participantId] = e.speedBonus || 0; } });
    var names = {};
    (session.participants || []).forEach(function (p) { names[p.id] = p.name; });
    return { rounds: rounds, points: points, bonus: bonus, names: names };
  }

  function letterText(round, letter) {
    if (!round || !round.question || !letter) return '';
    var d = (round.displayed || []).filter(function (x) { return x.letter === letter; })[0];
    return d && round.question.options ? round.question.options[d.sourceIndex] || '' : '';
  }

  /** Statistiche per il report. Solo round confermati e record non annullati. */
  function computeStats(session) {
    var ix = index(session);
    var valid = (session.responses || []).filter(function (r) { var rd = ix.rounds[r.roundInstanceId]; return !r.voided && rd && rd.committed; });
    var totals = Scoring.totals(session.scoreEvents, session.adjustments);
    var teams = (session.participants || []).map(function (p) {
      var mine = valid.filter(function (r) { return r.participantId === p.id; });
      var q = mine.filter(function (r) { return r.kind === 'question'; });
      var times = q.filter(function (r) { return r.inputMode === 'tablet' && !r.auto && r.responseTimeMs != null; }).map(function (r) { return r.responseTimeMs; });
      var c = { correct: 0, wrong: 0, omitted: 0 };
      mine.forEach(function (r) { c[r.outcome] = (c[r.outcome] || 0) + 1; });
      return {
        id: p.id, name: p.name, points: totals[p.id] || 0, answered: mine.length,
        correct: c.correct, wrong: c.wrong, omitted: c.omitted, pctCorrect: pct(c.correct, mine.length),
        questionCorrect: q.filter(function (r) { return r.outcome === 'correct'; }).length, questionTotal: q.length,
        timeMean: mean(times), timeMedian: median(times), timeCount: times.length
      };
    }).sort(function (a, b) { return b.points - a.points || b.correct - a.correct; });
    var cats = {};
    var questions = {};
    valid.forEach(function (r) {
      if (r.kind !== 'question') return;
      var rd = ix.rounds[r.roundInstanceId];
      var cat = (rd.question && rd.question.category) || 'Senza categoria';
      var c = cats[cat] = cats[cat] || { category: cat, total: 0, correct: 0, wrong: 0, omitted: 0, questions: {} };
      c.total++;
      c[r.outcome]++;
      c.questions[rd.questionId] = true;
      var q = questions[r.roundInstanceId] = questions[r.roundInstanceId] || { roundInstanceId: r.roundInstanceId, number: rd.number, text: rd.question ? rd.question.text : '', category: cat, correctAnswer: rd.correctAnswer, correctText: letterText(rd, rd.correctAnswer), total: 0, correct: 0, wrong: 0, omitted: 0, choices: {} };
      q.total++;
      q[r.outcome]++;
      if (r.outcome === 'wrong' && r.selectedAnswer) {
        var key = letterText(rd, r.selectedAnswer) || r.selectedAnswer;
        q.choices[key] = (q.choices[key] || 0) + 1;
      }
    });
    var categories = Object.keys(cats).map(function (k) { var c = cats[k]; c.pctCorrect = pct(c.correct, c.total); c.questionCount = Object.keys(c.questions).length; delete c.questions; return c; })
      .sort(function (a, b) { return a.pctCorrect - b.pctCorrect || b.total - a.total; });
    var hardest = Object.keys(questions).map(function (k) { var q = questions[k]; q.pctCorrect = pct(q.correct, q.total); return q; })
      .filter(function (q) { return q.correct < q.total; })
      .sort(function (a, b) { return a.pctCorrect - b.pctCorrect || (b.wrong + b.omitted) - (a.wrong + a.omitted); })
      .slice(0, 8);
    var byPack = {};
    valid.forEach(function (r) {
      var rd = ix.rounds[r.roundInstanceId] || {};
      var src = origin(r, rd, session, null);
      var k = src.packId || '—';
      var b = byPack[k] = byPack[k] || { packId: k, packVersion: src.packVersion, subject: src.subject, total: 0, correct: 0, wrong: 0, omitted: 0, title: '' };
      b.total++;
      b[r.outcome]++;
    });
    (session.packs || []).forEach(function (p) { if (byPack[p.packId]) { byPack[p.packId].title = p.title; byPack[p.packId].subject = byPack[p.packId].subject || p.subject; } });
    var packs = Object.keys(byPack).map(function (k) { var b = byPack[k]; b.pctCorrect = pct(b.correct, b.total); return b; });
    var modes = { manual: 0, tablet: 0 };
    valid.forEach(function (r) { modes[r.inputMode] = (modes[r.inputMode] || 0) + 1; });
    var committed = (session.rounds || []).filter(function (r) { return r.committed; });
    return {
      teams: teams, categories: categories, hardest: hardest, modes: modes, packs: packs,
      questionRounds: committed.filter(function (r) { return r.kind === 'question'; }).length,
      arcadeRounds: committed.filter(function (r) { return r.kind === 'arcade'; }).length,
      responses: valid.length,
      measuredTimes: valid.filter(function (r) { return r.responseTimeMs != null; }).length
    };
  }

  /** Pacchetto, versione, materia e argomento di origine di una risposta. */
  function origin(r, rd, s, ctx) {
    var q = rd.question || {};
    var packId = r.packId || rd.packId || (ctx && ctx.pack && ctx.pack.id !== 'mix' ? ctx.pack.id : '') || s.packId || '';
    var info = (s.packs || []).filter(function (p) { return p.packId === packId; })[0] || {};
    return {
      packId: packId,
      packVersion: r.packVersion || rd.packVersion || info.packVersion || (packId === s.packId ? s.packVersion : '') || '',
      subject: r.subject || rd.subject || q.subject || info.subject || '',
      topic: r.topic || rd.topic || q.topic || '',
      sourceQuestionId: r.sourceQuestionId || rd.sourceQuestionId || null
    };
  }

  var CSV_HEADER = ['sessione', 'data', 'modalita_sessione', 'classe', 'anno_scolastico', 'istituto', 'pack_id', 'pack_versione', 'profilo_punteggio',
    'round_id', 'tipo_round', 'numero_domanda', 'id_domanda', 'id_domanda_originale', 'gioco', 'materia', 'argomento', 'categoria', 'difficolta', 'domanda',
    'partecipante_id', 'partecipante', 'tipo_partecipante', 'risposta_lettera', 'risposta_testo', 'corretta_lettera', 'corretta_testo',
    'esito', 'tempo_ms', 'tempo_disponibile_ms', 'modalita_input', 'omessa_automatica', 'ricevuta_alle', 'ordine', 'punti', 'bonus_velocita', 'dispositivo', 'annullata'];

  /** CSV: una riga per risposta (anche quelle annullate, segnate nella colonna "annullata"). opts.raw → dati grezzi. */
  function toCSV(ctx, opts) {
    var s = ctx.session;
    var ix = index(s);
    var m = s.meta || {};
    var rows = [CSV_HEADER];
    (s.responses || []).forEach(function (r) {
      var rd = ix.rounds[r.roundInstanceId] || {};
      var q = rd.question || {};
      var isQ = r.kind === 'question';
      var p = ix.points[r.roundInstanceId + '|' + r.participantId];
      var src = origin(r, rd, s, ctx);
      rows.push([
        s.sessionId, fmtDate(r.receivedAt || s.createdAt), MODE_IT[m.mode] || m.mode, m.classLabel, m.schoolYear, m.institution, src.packId, src.packVersion, rd.profileId || s.scoringProfile,
        r.roundInstanceId, isQ ? 'domanda' : 'gioco', isQ ? rd.number : '', r.questionId || '', isQ ? (src.sourceQuestionId || '') : '', isQ ? '' : (rd.gameType || r.gameType || ''), src.subject, src.topic, isQ ? q.category : rd.label, q.difficulty || '', isQ ? q.text : rd.label,
        r.participantId, ix.names[r.participantId] || '', r.participantType, r.selectedAnswer || '', isQ ? letterText(rd, r.selectedAnswer) : '', r.correctAnswer || '', isQ ? letterText(rd, r.correctAnswer) : (rd.solution || ''),
        OUTCOME_IT[r.outcome] || r.outcome, r.responseTimeMs == null ? '' : r.responseTimeMs, r.availableMs == null ? (rd.availableMs || '') : r.availableMs, r.inputMode === 'tablet' ? 'pulsantiera' : 'manuale', r.auto ? 'si' : '', r.receivedAt, r.order == null ? '' : r.order,
        r.voided || !rd.committed ? '' : (p == null ? '' : p), r.voided || !rd.committed || p == null ? '' : (ix.bonus[r.roundInstanceId + '|' + r.participantId] || 0), r.deviceId || '', r.voided ? 'si' : ''
      ]);
    });
    return csv(rows, opts);
  }

  /** Log tecnico (regia + server). Predefinito: neutralizzato per i fogli di calcolo; opts.raw → dati grezzi. */
  function logToCSV(hostLog, serverLog, opts) {
    var all = (hostLog || []).map(function (e) { return Object.assign({ source: 'host' }, e); })
      .concat((serverLog || []).map(function (e) { return Object.assign({}, e, { source: 'server' }); }))
      .sort(function (a, b) { return String(a.timestamp).localeCompare(String(b.timestamp)); });
    var rows = [['timestamp', 'origine', 'sessionId', 'roundInstanceId', 'participantId', 'deviceId', 'evento', 'risposta', 'accettata', 'motivo', 'latenza_ms', 'delta_punti']];
    all.forEach(function (e) {
      rows.push([e.timestamp, e.source === 'server' ? 'server' : 'regia', e.sessionId, e.roundInstanceId, e.participantId, e.deviceId, e.event, e.answer,
        e.accepted == null ? '' : (e.accepted ? 'si' : 'no'), e.reason, e.latency, e.scoreDelta]);
    });
    return csv(rows, opts);
  }

  function bar(p) { return '<span class="bar"><i style="width:' + Math.max(0, Math.min(100, p)) + '%"></i></span>'; }

  /** Report HTML autonomo (nessuna risorsa esterna), stampabile. */
  function toHTML(ctx) {
    var s = ctx.session;
    var st = computeStats(s);
    var m = s.meta || {};
    var profile = Scoring.getProfile(s.scoringProfile);
    var title = 'Report di classe · ' + (ctx.pack ? ctx.pack.title : s.packId);
    var hasTimes = st.teams.some(function (t) { return t.timeCount; });
    var h = [];
    h.push('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' +
      'body{font:15px/1.5 "Segoe UI",system-ui,sans-serif;color:#17202b;max-width:980px;margin:0 auto;padding:28px 20px;background:#fff}' +
      'h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:30px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}' +
      '.meta{color:#475569;font-size:13px}.meta b{color:#17202b}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}' +
      'th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#475569}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.bar{display:inline-block;width:90px;height:8px;background:#e2e8f0;border-radius:4px;vertical-align:middle;margin-right:6px}.bar i{display:block;height:100%;background:#0e7a55;border-radius:4px}' +
      '.cards{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.card{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;min-width:120px}.card b{display:block;font-size:22px}.card small{color:#475569}' +
      '.note{background:#f8fafc;border-left:4px solid #94a3b8;padding:10px 14px;font-size:13px;color:#334155}.muted{color:#64748b;font-size:12px}' +
      '@media print{body{padding:0}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>');
    h.push('<h1>' + esc(title) + '</h1>');
    h.push('<div class="meta">Data <b>' + esc(fmtDate(s.createdAt)) + '</b>' + (m.classLabel ? ' · Classe <b>' + esc(m.classLabel) + '</b>' : '') + (m.schoolYear ? ' · A.s. <b>' + esc(m.schoolYear) + '</b>' : '') +
      (m.institution ? ' · ' + esc(m.institution) : '') + ' · Modalità <b>' + esc(MODE_IT[m.mode] || m.mode) + '</b> · Punteggio <b>' + esc(profile.label) + '</b> (' + esc(Scoring.rulesSummary(profile)) + ')</div>');
    h.push('<div class="cards"><div class="card"><b>' + st.teams.length + '</b><small>squadre</small></div><div class="card"><b>' + st.questionRounds + '</b><small>domande confermate</small></div><div class="card"><b>' + st.arcadeRounds + '</b><small>manche di gioco</small></div><div class="card"><b>' + st.responses + '</b><small>risposte registrate</small></div><div class="card"><b>' + (st.modes.tablet || 0) + ' / ' + (st.modes.manual || 0) + '</b><small>da pulsantiera / a mano</small></div></div>');

    var used = (s.packs || []).length ? s.packs : (s.packId ? [{ packId: s.packId, packVersion: s.packVersion, title: ctx.pack ? ctx.pack.title : s.packId, subject: '' }] : []);
    if (used.length) {
      h.push('<h2>Pacchetti usati</h2><table><thead><tr><th>Pacchetto</th><th>Versione</th><th>Materia</th><th>Argomenti</th></tr></thead><tbody>');
      used.forEach(function (p) { h.push('<tr><td>' + esc(p.title || p.packId) + ' <span class="muted">(' + esc(p.packId) + ')</span></td><td>' + esc(p.packVersion || '—') + '</td><td>' + esc(p.subject || '—') + '</td><td>' + esc((p.topics || []).slice(0, 6).join(', ') || '—') + '</td></tr>'); });
      h.push('</tbody></table>');
    }
    /* v3.7.0: scaletta della puntata (solo riferimenti: pacchetto, versione, contenuto, esito). */
    (Array.isArray(s.plans) ? s.plans : []).forEach(function (pl) {
      var STATUS_IT = { played: 'giocato', skipped: 'saltato', missing: 'mancante', not_played: 'non giocato' };
      h.push('<h2>Scaletta · ' + esc(pl.name || '') + '</h2><table><thead><tr><th>#</th><th>Contenuto</th><th>Pacchetto</th><th>Versione</th><th>Esito</th></tr></thead><tbody>');
      (pl.items || []).forEach(function (it) {
        var what = it.kind === 'question' ? 'Domanda · ' + esc(it.title || '') + ' <span class="muted">(' + esc(it.sourceQuestionId || '') + ')</span>' : 'Gioco ' + esc(it.gameType || '') + ' · ' + esc(it.label || it.title || '');
        h.push('<tr><td class="n">' + esc(it.position) + '</td><td>' + what + '</td><td>' + esc(it.packId || '') + '</td><td>' + esc(it.packVersion || '—') + '</td><td>' + esc(STATUS_IT[it.status] || it.status || '') + '</td></tr>');
      });
      h.push('</tbody></table>');
    });
    if (st.packs.length > 1) {
      h.push('<h2>Risultati per pacchetto</h2><table><thead><tr><th>Pacchetto</th><th>Materia</th><th>Risposte</th><th>Corrette</th><th>Errate</th><th>Omesse</th><th>% corrette</th></tr></thead><tbody>');
      st.packs.forEach(function (b) { h.push('<tr><td>' + esc(b.title || b.packId) + '</td><td>' + esc(b.subject || '—') + '</td><td class="n">' + b.total + '</td><td class="n">' + b.correct + '</td><td class="n">' + b.wrong + '</td><td class="n">' + b.omitted + '</td><td>' + bar(b.pctCorrect) + b.pctCorrect + '%</td></tr>'); });
      h.push('</tbody></table>');
    }
    h.push('<h2>Classifica</h2><table><thead><tr><th>#</th><th>Squadra</th><th>Punti</th><th>Corrette</th><th>Errate</th><th>Omesse</th><th>% corrette</th></tr></thead><tbody>');
    st.teams.forEach(function (t, i) {
      h.push('<tr><td class="n">' + (i + 1) + '</td><td>' + esc(t.name) + '</td><td class="n"><b>' + t.points + '</b></td><td class="n">' + t.correct + '</td><td class="n">' + t.wrong + '</td><td class="n">' + t.omitted + '</td><td>' + bar(t.pctCorrect) + t.pctCorrect + '%</td></tr>');
    });
    h.push('</tbody></table><p class="muted">Le percentuali comprendono domande e giochi; la colonna "Punti" dipende dal profilo di punteggio, le altre no.</p>');

    if (st.categories.length) {
      h.push('<h2>Risultati per categoria</h2><table><thead><tr><th>Categoria</th><th>Domande</th><th>Risposte</th><th>Corrette</th><th>Errate</th><th>Omesse</th><th>% corrette</th></tr></thead><tbody>');
      st.categories.forEach(function (c) {
        h.push('<tr><td>' + esc(c.category) + '</td><td class="n">' + c.questionCount + '</td><td class="n">' + c.total + '</td><td class="n">' + c.correct + '</td><td class="n">' + c.wrong + '</td><td class="n">' + c.omitted + '</td><td>' + bar(c.pctCorrect) + c.pctCorrect + '%</td></tr>');
      });
      h.push('</tbody></table><p class="muted">Ordinate dalla categoria con meno risposte corrette.</p>');
    }

    if (st.hardest.length) {
      h.push('<h2>Domande con più errori</h2><table><thead><tr><th>N.</th><th>Domanda</th><th>Risposta corretta</th><th>% corrette</th><th>Risposte errate scelte</th></tr></thead><tbody>');
      st.hardest.forEach(function (q) {
        var ch = Object.keys(q.choices).sort(function (a, b) { return q.choices[b] - q.choices[a]; }).map(function (k) { return esc(k) + ' (' + q.choices[k] + ')'; }).join('<br>');
        h.push('<tr><td class="n">' + (q.number || '') + '</td><td>' + esc(q.text) + '<br><span class="muted">' + esc(q.category) + '</span></td><td>' + esc(q.correctText) + '</td><td>' + bar(q.pctCorrect) + q.pctCorrect + '%<br><span class="muted">' + q.wrong + ' errate · ' + q.omitted + ' omesse</span></td><td>' + (ch || '—') + '</td></tr>');
      });
      h.push('</tbody></table>');
    }

    h.push('<h2>Tempi di risposta</h2>');
    if (hasTimes) {
      h.push('<table><thead><tr><th>Squadra</th><th>Risposte cronometrate</th><th>Tempo medio</th><th>Tempo mediano</th></tr></thead><tbody>');
      st.teams.forEach(function (t) { h.push('<tr><td>' + esc(t.name) + '</td><td class="n">' + t.timeCount + '</td><td class="n">' + sec(t.timeMean) + '</td><td class="n">' + sec(t.timeMedian) + '</td></tr>'); });
      h.push('</tbody></table><p class="muted">Tempo misurato dal server tra l’apertura della domanda e la ricezione della risposta (pause escluse). Le risposte registrate a mano e le omissioni non hanno un tempo.</p>');
    } else {
      h.push('<p class="muted">Nessun tempo misurato: in questa sessione le risposte sono state registrate a mano. L’ordine di inserimento non è un tempo di risposta.</p>');
    }

    h.push('<h2>Nota</h2><p class="note">Report formativo: riassume le risposte date dalle squadre in questa sessione di gioco. Non è una valutazione delle competenze individuali e non sostituisce una verifica. I dati grezzi completi sono nel file CSV e nel JSON della sessione.</p>');
    h.push('<p class="muted">Generato da Il Secchione ' + esc(ctx.app || '') + ' il ' + esc(fmtDate(ctx.generatedAt || new Date().toISOString())) + ' · sessione ' + esc(s.sessionId) + '</p>');
    h.push('</body></html>');
    return h.join('');
  }

  return { computeStats: computeStats, toCSV: toCSV, toHTML: toHTML, logToCSV: logToCSV, CSV_HEADER: CSV_HEADER, CSV_CONTRACT: CSV_CONTRACT, spreadsheetSafe: spreadsheetSafe, median: median };
});
