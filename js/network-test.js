/* Il Secchione · /network-test: misura HTTP e WebSocket verso il PC del docente. ES5. */
(function () {
  'use strict';
  var title = document.getElementById('ntTitle');
  var detail = document.getElementById('ntDetail');
  var results = document.getElementById('ntResults');
  var again = document.getElementById('ntAgain');
  var ws = null;

  function line(ok, text) { results.innerHTML += '<div>' + (ok ? '✓ ' : '✗ ') + text + '</div>'; }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.floor(s.length / 2)] : null; }

  function httpTest(n, done) {
    var times = [];
    var i = 0;
    function next() {
      if (i++ >= n) return done(times);
      var t0 = Date.now();
      var x = new XMLHttpRequest();
      x.open('GET', '/api/ping?t=' + t0, true);
      x.timeout = 4000;
      x.onload = function () { if (x.status === 200) times.push(Date.now() - t0); next(); };
      x.onerror = x.ontimeout = function () { next(); };
      x.send();
    }
    next();
  }

  function wsTest(n, done) {
    var times = [];
    var sent = 0;
    var finished = false;
    function finish(ok) { if (finished) return; finished = true; try { ws.close(); } catch (e) { /* ignore */ } done(ok, times); }
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { return done(false, times); }
    var guard = setTimeout(function () { finish(times.length > 0); }, 8000);
    ws.onopen = function () { ws.send(JSON.stringify({ type: 'hello', role: 'nettest' })); };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'nettest.ok' || m.type === 'pong') {
        if (m.type === 'pong') times.push(Date.now() - m.t);
        if (sent < n) { sent++; ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); }
        else { clearTimeout(guard); finish(true); }
      }
    };
    ws.onerror = function () { clearTimeout(guard); finish(false); };
  }

  function run() {
    results.innerHTML = '';
    title.textContent = 'VERIFICA IN CORSO…';
    title.style.color = '';
    again.disabled = true;
    httpTest(5, function (h) {
      line(h.length > 0, 'Pagine dal PC: ' + h.length + '/5 risposte' + (h.length ? ', mediana ' + median(h) + ' ms' : ''));
      wsTest(10, function (ok, w) {
        line(ok && w.length > 0, 'Canale in tempo reale (WebSocket): ' + w.length + '/10' + (w.length ? ', mediana ' + median(w) + ' ms, massimo ' + Math.max.apply(null, w) + ' ms' : ''));
        var good = h.length >= 4 && w.length >= 8;
        var slow = good && median(w) > 300;
        title.textContent = good ? (slow ? 'RETE LENTA MA USABILE' : 'RETE OK') : 'PROBLEMI DI RETE';
        title.style.color = good ? (slow ? '#ffd258' : '#62e5ab') : '#ff8b9a';
        detail.textContent = good ? 'Questo dispositivo può usare la pulsantiera.' : 'La connessione non è stabile: avvicinati al Wi-Fi, usa l’hotspot del PC o la modalità manuale.';
        again.disabled = false;
      });
    });
  }
  again.addEventListener('click', run);
  run();
})();
