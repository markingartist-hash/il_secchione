'use strict';
var assert = require('assert');
var test = require('./harness.js').test;
var QR = require('../js/lib/qr.js');

/* Valori di riferimento della specifica QR (tabella dei format bits). */
var FORMAT_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
var FORMAT_L = [0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976];

test('format bits conformi alla tabella ISO (livelli M e L, maschere 0–7)', function () {
  for (var m = 0; m < 8; m++) {
    assert.strictEqual(QR.encodeText('Secchione', 'M', m).formatBits, FORMAT_M[m], 'M mask ' + m);
    assert.strictEqual(QR.encodeText('Secchione', 'L', m).formatBits, FORMAT_L[m], 'L mask ' + m);
  }
});

test('version bits della versione 7 = 0x07C94', function () {
  var long = new Array(120).join('x');
  var q = QR.encodeText(long, 'M');
  assert.ok(q.version >= 7, 'versione ' + q.version);
  var v7 = QR.encodeText(new Array(111).join('y'), 'M');
  assert.strictEqual(v7.version, 7);
  assert.strictEqual(v7.versionBits, 0x07C94);
});

test('Reed-Solomon: ogni blocco ha sindromi nulle sulle radici α^0..α^(n-1)', function () {
  var I = QR._internal;
  ['http://192.168.1.23:8765/player?pin=4821', 'Il Secchione · prova UTF-8 àèìòù', new Array(300).join('z')].forEach(function (text) {
    ['L', 'M', 'Q', 'H'].forEach(function (ecc) {
      var q = QR.encodeText(text, ecc);
      var nEcc = I.eccPerBlock(q.version, ecc);
      q.blocks.forEach(function (block) {
        var alpha = 1;
        for (var i = 0; i < nEcc; i++) {
          var s = 0;
          for (var k = 0; k < block.length; k++) s = I.gfMultiply(s, alpha) ^ block[k];
          assert.strictEqual(s, 0, 'sindrome ' + i + ' non nulla (v' + q.version + ' ' + ecc + ')');
          alpha = I.gfMultiply(alpha, 2);
        }
      });
    });
  });
});

test('dimensione e pattern di posizionamento corretti', function () {
  var q = QR.encodeText('http://10.0.0.5:8765/player?pin=0042', 'M');
  assert.strictEqual(q.size, q.version * 4 + 17);
  // angolo in alto a sinistra: finder 7x7 con bordo scuro e anello chiaro
  var m = q.modules;
  for (var i = 0; i < 7; i++) {
    assert.strictEqual(m[0][i], true);
    assert.strictEqual(m[6][i], true);
    assert.strictEqual(m[i][0], true);
  }
  assert.strictEqual(m[1][1], false);
  assert.strictEqual(m[3][3], true);
  assert.strictEqual(m[q.size - 8][8], true, 'dark module');
});

test('toSVG produce un SVG con sfondo bianco', function () {
  var svg = QR.svgFor('prova');
  assert.ok(/^<svg[^>]+viewBox="0 0 29 29"/.test(svg), svg.slice(0, 80));
  assert.ok(svg.indexOf('fill="#ffffff"') > 0);
});
