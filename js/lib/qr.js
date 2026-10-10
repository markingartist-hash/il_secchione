/*
 * Il Secchione · qr.js
 * Generatore QR Code minimo e senza dipendenze (modalità byte, UTF-8, versioni 1–40).
 * Algoritmo basato sulla specifica ISO/IEC 18004 seguendo l'impostazione della
 * libreria "QR Code generator" di Project Nayuki (MIT). Riscritto in ES5 per funzionare
 * offline nel browser e in Node >= 8.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneQR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ECL = { L: { ord: 0, fmt: 1 }, M: { ord: 1, fmt: 0 }, Q: { ord: 2, fmt: 3 }, H: { ord: 3, fmt: 2 } };

  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(String(str)));
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl.ord][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ord][ver];
  }

  function gfMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMultiply(coef, factor); });
    });
    return result;
  }

  function QrCode(ver, ecl, dataCodewords, forcedMask) {
    this.version = ver;
    this.ecl = ecl;
    this.size = ver * 4 + 17;
    this.modules = [];
    this.isFunction = [];
    for (var y = 0; y < this.size; y++) {
      this.modules.push(new Array(this.size).fill(false));
      this.isFunction.push(new Array(this.size).fill(false));
    }
    this.drawFunctionPatterns();
    var all = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(all);
    var mask = typeof forcedMask === 'number' ? forcedMask : -1;
    if (mask < 0) {
      var best = Infinity;
      for (var m = 0; m < 8; m++) {
        this.applyMask(m);
        this.drawFormatBits(m);
        var p = this.penalty();
        if (p < best) { best = p; mask = m; }
        this.applyMask(m);
      }
    }
    this.mask = mask;
    this.applyMask(mask);
    this.drawFormatBits(mask);
    this.isFunction = null;
  }

  QrCode.prototype.setFunctionModule = function (x, y, dark) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  };

  QrCode.prototype.drawFunctionPatterns = function () {
    var size = this.size;
    for (var i = 0; i < size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    var pos = this.alignmentPositions();
    var n = pos.length;
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        if (!((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0))) this.drawAlignment(pos[a], pos[b]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  };

  QrCode.prototype.drawFinder = function (x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx;
        var yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  };

  QrCode.prototype.drawAlignment = function (x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  };

  QrCode.prototype.alignmentPositions = function () {
    if (this.version === 1) return [];
    var numAlign = Math.floor(this.version / 7) + 2;
    var step = Math.floor((this.version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    var result = [6];
    for (var pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  };

  QrCode.prototype.drawFormatBits = function (mask) {
    var data = (this.ecl.fmt << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    var size = this.size;
    for (var a = 0; a <= 5; a++) this.setFunctionModule(8, a, getBit(bits, a));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (var b = 9; b < 15; b++) this.setFunctionModule(14 - b, 8, getBit(bits, b));
    for (var c = 0; c < 8; c++) this.setFunctionModule(size - 1 - c, 8, getBit(bits, c));
    for (var d = 8; d < 15; d++) this.setFunctionModule(8, size - 15 + d, getBit(bits, d));
    this.setFunctionModule(8, size - 8, true);
    this.formatBits = bits;
  };

  QrCode.prototype.drawVersion = function () {
    if (this.version < 7) return;
    var rem = this.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (this.version << 12) | rem;
    this.versionBits = bits;
    for (var k = 0; k < 18; k++) {
      var bit = getBit(bits, k);
      var a = this.size - 11 + (k % 3);
      var b = Math.floor(k / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  };

  QrCode.prototype.addEccAndInterleave = function (data) {
    var ver = this.version;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[this.ecl.ord][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[this.ecl.ord][ver];
    var raw = Math.floor(numRawDataModules(ver) / 8);
    var numShort = numBlocks - (raw % numBlocks);
    var shortLen = Math.floor(raw / numBlocks);
    var div = rsDivisor(blockEccLen);
    var blocks = [];
    this.blocks = [];
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - blockEccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      this.blocks.push(dat.concat(ecc));
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var c = 0; c < blocks[0].length; c++) {
      for (var j = 0; j < blocks.length; j++) {
        if (c !== shortLen - blockEccLen || j >= numShort) result.push(blocks[j][c]);
      }
    }
    return result;
  };

  QrCode.prototype.drawCodewords = function (data) {
    var size = this.size;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  QrCode.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        var inv;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
        }
        if (!this.isFunction[y][x] && inv) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };

  /* Penalità semplificata (regole 1, 2 e 4): ogni maschera produce comunque un codice valido. */
  QrCode.prototype.penalty = function () {
    var size = this.size;
    var m = this.modules;
    var result = 0;
    var dark = 0;
    for (var y = 0; y < size; y++) {
      var runR = 1;
      var runC = 1;
      for (var x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (x > 0) {
          if (m[y][x] === m[y][x - 1]) { runR++; if (runR === 5) result += 3; else if (runR > 5) result++; } else runR = 1;
          if (m[x][y] === m[x - 1][y]) { runC++; if (runC === 5) result += 3; else if (runC > 5) result++; } else runC = 1;
        }
        if (x < size - 1 && y < size - 1) {
          var c = m[y][x];
          if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
        }
      }
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * 10;
    return result;
  };

  /** Codifica un testo. ecc: 'L' | 'M' (default) | 'Q' | 'H'. */
  function encodeText(text, ecc, forcedMask) {
    var ecl = ECL[ecc || 'M'] || ECL.M;
    var bytes = utf8Bytes(text);
    var ver;
    var ccBits;
    for (ver = 1; ver <= 40; ver++) {
      ccBits = ver < 10 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= numDataCodewords(ver, ecl) * 8) break;
    }
    if (ver > 40) throw new Error('Testo troppo lungo per un QR code');
    var bits = [];
    function append(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    append(4, 4);
    append(bytes.length, ccBits);
    bytes.forEach(function (b) { append(b, 8); });
    var capacity = numDataCodewords(ver, ecl) * 8;
    append(0, Math.min(4, capacity - bits.length));
    append(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) append(pad, 8);
    var codewords = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      codewords.push(v);
    }
    return new QrCode(ver, ecl, codewords, forcedMask);
  }

  /** SVG pronto da inserire nel DOM (quadrato, sfondo bianco, bordo di `border` moduli). */
  function toSVG(qr, border) {
    var b = border == null ? 4 : border;
    var dim = qr.size + b * 2;
    var parts = [];
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) if (qr.modules[y][x]) parts.push('M' + (x + b) + ',' + (y + b) + 'h1v1h-1z');
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="100%" height="100%" fill="#ffffff"/><path d="' + parts.join('') + '" fill="#000000"/></svg>';
  }

  return {
    encodeText: encodeText,
    toSVG: toSVG,
    svgFor: function (text, ecc) { return toSVG(encodeText(text, ecc)); },
    _internal: { eccPerBlock: function (ver, ecc) { return ECC_CODEWORDS_PER_BLOCK[(ECL[ecc || 'M'] || ECL.M).ord][ver]; }, gfMultiply: gfMultiply, rsDivisor: rsDivisor, rsRemainder: rsRemainder, numDataCodewords: numDataCodewords, ECL: ECL }
  };
});
