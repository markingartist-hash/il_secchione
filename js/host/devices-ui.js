/*
 * Il Secchione · finestra PULSANTIERE della regia: QR, PIN, ingressi, assegnazione tablet → squadra,
 * espulsione, verifica rete. Legge lo stato da SecchioneNet e non conosce il resto della regia.
 */
(function (root) {
  'use strict';
  var NET = root.SecchioneNet;
  var QR = root.SecchioneQR;
  var ctx = null;
  var dlg = null;
  var body = null;
  var qrMode = 'player';

  function esc(s) { return ctx ? ctx.esc(s) : String(s); }
  function teams() { return ctx ? ctx.getTeams() : []; }
  function teamName(id) { var t = teams().filter(function (x) { return x.id === id; })[0]; return t ? t.name : '—'; }

  function qrSvg(text) {
    try { return QR.svgFor(text, 'M'); } catch (e) { return '<p class="help">QR non disponibile</p>'; }
  }

  function manualHTML() {
    return '<div class="devManual"><h3>Modalità manuale (nessun server)</h3>' +
      '<p>La regia è stata aperta direttamente dal file, quindi i tablet non possono collegarsi. Le risposte si registrano dalla griglia <b>A B C D Ø</b> nella scheda DOMANDA.</p>' +
      '<p>Per usare i tablet: chiudi questa finestra del browser e avvia <b>AVVIA_IL_SECCHIONE.bat</b>. Se non parte, vedi <b>RISOLUZIONE_PROBLEMI</b>.</p></div>';
  }

  function deviceRow(d) {
    var opts = '<option value="">— nessuna squadra —</option>' + teams().map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (d.participantId === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
    var state = d.status === 'assigned' ? '<b>' + esc(teamName(d.participantId)) + '</b>' :
      d.requestedParticipantId ? 'chiede <b>' + esc(teamName(d.requestedParticipantId)) + '</b>' : '<i>in attesa</i>';
    var conn = d.connected ? '<span class="devDot on">●</span> ' + (d.rttMs != null ? d.rttMs + ' ms' : 'connesso') : '<span class="devDot off">○</span> disconnesso';
    return '<div class="devRow' + (d.connected ? '' : ' offline') + '">' +
      '<span class="devLabel">' + esc(d.label) + '</span>' +
      '<span class="devState">' + state + '</span>' +
      '<span class="devConn">' + conn + '</span>' +
      '<span class="devActions">' +
      (d.requestedParticipantId && d.status !== 'assigned' ? '<button class="btn green tiny" data-dev-approve="' + esc(d.deviceId) + '">✓ APPROVA</button>' : '') +
      '<select class="control devSelect" data-dev-assign="' + esc(d.deviceId) + '" aria-label="Squadra di ' + esc(d.label) + '">' + opts + '</select>' +
      '<button class="btn red tiny" data-dev-kick="' + esc(d.deviceId) + '" title="Espelli: il tablet dovrà rientrare con il PIN">Espelli</button>' +
      '</span></div>';
  }

  function render() {
    if (!body || !dlg || !dlg.open) return;
    var st = NET.status();
    if (!st.available) { body.innerHTML = manualHTML(); return; }
    if (!st.connected) {
      body.innerHTML = '<div class="devManual"><h3>Server non raggiungibile</h3><p>Controlla che la finestra nera del server sia ancora aperta. La regia si ricollega da sola; nel frattempo puoi registrare le risposte a mano.</p></div>';
      return;
    }
    var room = NET.room();
    var urls = room.urls || [];
    var main = urls[0];
    var devs = NET.devices();
    var requests = devs.filter(function (d) { return d.requestedParticipantId && d.status !== 'assigned'; });
    var connectedCount = devs.filter(function (d) { return d.connected; }).length;
    var rtts = devs.filter(function (d) { return d.connected && d.rttMs != null; }).map(function (d) { return d.rttMs; });
    var avg = rtts.length ? Math.round(rtts.reduce(function (a, b) { return a + b; }, 0) / rtts.length) : null;
    var assignedTeams = {};
    devs.forEach(function (d) { if (d.status === 'assigned') assignedTeams[d.participantId] = true; });
    var missing = teams().filter(function (t) { return !assignedTeams[t.id]; });
    var target = main ? (qrMode === 'test' ? main.networkTest : main.player + '?pin=' + room.pin) : '';
    body.innerHTML =
      '<div class="devTop">' +
        '<div class="devQr">' + (main ? qrSvg(target) : '<p class="help">Nessuna rete locale</p>') +
          '<div class="devQrTabs"><button class="btn tiny ' + (qrMode === 'player' ? 'primary' : 'ghost') + '" data-qr-mode="player">QR pulsantiera</button><button class="btn tiny ' + (qrMode === 'test' ? 'primary' : 'ghost') + '" data-qr-mode="test">QR test rete</button></div></div>' +
        '<div class="devInfo">' +
          '<div class="devPin"><small>PIN</small><b>' + esc(room.pin || '—') + '</b></div>' +
          (main ? '<ol class="devSteps"><li>Tablet e PC sulla <b>stessa rete</b> (Wi-Fi della scuola, hotspot del PC o router dedicato).</li><li>Inquadra il QR oppure apri <b class="devUrl">' + esc(main.player) + '</b></li><li>Inserisci il PIN, scegli la squadra e attendi l’approvazione.</li></ol>' : '<p class="help">Il PC non ha un indirizzo di rete locale: collegalo al Wi-Fi o attiva l’hotspot.</p>') +
          (urls.length > 1 ? '<details class="devOther"><summary>Altri indirizzi del PC (' + (urls.length - 1) + ')</summary>' + urls.slice(1).map(function (u) { return '<div>' + esc(u.player) + ' <small>' + esc(u.interface) + (u.virtual ? ' · virtuale' : '') + (u.hotspot ? ' · hotspot' : '') + '</small></div>'; }).join('') + '</details>' : '') +
          '<div class="row gap top8"><button class="btn ' + (st.joinLocked ? 'green' : 'amber') + ' wide" data-dev-lock="' + (st.joinLocked ? '0' : '1') + '">' + (st.joinLocked ? '🔓 RIAPRI INGRESSI' : '🔒 CHIUDI INGRESSI') + '</button></div>' +
          '<p class="help">' + (st.joinLocked ? 'Ingressi chiusi: entrano solo i tablet già assegnati (anche dopo un refresh).' : 'Ingressi aperti: chiudili quando tutte le squadre sono collegate.') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="devListHead"><h3>DISPOSITIVI (' + devs.length + ')</h3>' + (requests.length ? '<button class="btn green tiny" data-dev-approve-all="1">✓ APPROVA TUTTE LE RICHIESTE (' + requests.length + ')</button>' : '') + '</div>' +
      '<div class="devList">' + (devs.map(deviceRow).join('') || '<p class="help">Nessun tablet collegato. Fai inquadrare il QR.</p>') + '</div>' +
      (teams().length ? '<p class="help">' + (missing.length ? 'Squadre senza tablet (useranno la griglia manuale): <b>' + missing.map(function (t) { return esc(t.name); }).join(', ') + '</b>' : '✓ Tutte le squadre hanno un tablet.') + '</p>' : '<p class="help">Crea prima le squadre nella colonna di sinistra.</p>') +
      '<div class="devNet"><h3>VERIFICA RETE</h3><span>Dispositivi connessi: <b>' + connectedCount + '</b></span><span>Latenza media: <b>' + (avg != null ? avg + ' ms' : '—') + '</b></span><span>Tablet in test rete: <b>' + (st.testClients || 0) + '</b></span><span>Schermi /show: <b>' + (st.showClients || 0) + '</b></span>' +
      '<p class="help">Se un tablet non apre la pagina, la rete della scuola probabilmente isola i dispositivi: usa l’hotspot del PC o un router dedicato (vedi RISOLUZIONE_PROBLEMI), oppure continua senza tablet.</p></div>';
  }

  function onClick(e) {
    var t = e.target;
    var el;
    if ((el = t.closest('[data-qr-mode]'))) { qrMode = el.getAttribute('data-qr-mode'); render(); return; }
    if ((el = t.closest('[data-dev-lock]'))) { NET.setJoinLocked(el.getAttribute('data-dev-lock') === '1'); render(); return; }
    if ((el = t.closest('[data-dev-approve]'))) {
      var id = el.getAttribute('data-dev-approve');
      var d = NET.devices().filter(function (x) { return x.deviceId === id; })[0];
      if (d && d.requestedParticipantId) NET.assign(id, d.requestedParticipantId);
      return;
    }
    if (t.closest('[data-dev-approve-all]')) {
      NET.devices().forEach(function (d) { if (d.requestedParticipantId && d.status !== 'assigned') NET.assign(d.deviceId, d.requestedParticipantId); });
      return;
    }
    if ((el = t.closest('[data-dev-kick]'))) {
      var kid = el.getAttribute('data-dev-kick');
      if (confirm('Espellere questo dispositivo? Per rientrare dovrà usare di nuovo il PIN.')) NET.kick(kid);
    }
  }
  function onChange(e) {
    var el = e.target.closest('[data-dev-assign]');
    if (el) NET.assign(el.getAttribute('data-dev-assign'), el.value || null);
  }

  root.SecchioneDevicesUI = {
    init: function (c) {
      ctx = c;
      dlg = document.getElementById('devicesDialog');
      body = document.getElementById('devicesBody');
      if (!dlg || !body) return;
      body.addEventListener('click', onClick);
      body.addEventListener('change', onChange);
      var closeBtn = document.getElementById('devicesClose');
      if (closeBtn) closeBtn.onclick = function () { dlg.close(); };
    },
    open: function () { if (!dlg) return; dlg.showModal(); render(); },
    render: function () {
      /* non ridisegnare mentre il docente sta scegliendo da un menu a tendina */
      if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('devSelect') && body.contains(document.activeElement)) return;
      render();
    }
  };
})(typeof self !== 'undefined' ? self : this);
