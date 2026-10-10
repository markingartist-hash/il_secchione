/*
 * Il Secchione · zip.js
 * Lettura e scrittura di archivi .zip senza dipendenze (browser, anche da file://, e Node >= 8).
 * - lettura: metodi "stored" e "deflate" (decompressione DEFLATE RFC 1951 in JavaScript puro), controllo CRC-32
 * - scrittura: metodo "stored" (nessuna compressione: le immagini JPG/PNG sono già compresse), nomi UTF-8
 * Non supportati, con messaggio chiaro: ZIP64, archivi cifrati, metodi diversi da stored/deflate.
 * ES5 per i browser più vecchi.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SecchioneZip = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- CRC-32 ---------------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------------- UTF-8 ---------------- */
  function utf8Encode(str) {
    var s = unescape(encodeURIComponent(String(str)));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function latin1(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + 8192)));
    return s;
  }
  function utf8Decode(bytes) {
    var bin = latin1(bytes);
    try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
  }

  /* ---------------- DEFLATE (RFC 1951) ---------------- */
  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function buildTree(lengths, n) {
    var counts = new Uint16Array(16);
    var offs = new Uint16Array(16);
    var symbols = new Uint16Array(n);
    var i;
    for (i = 0; i < n; i++) counts[lengths[i]]++;
    counts[0] = 0;
    for (i = 0, offs[0] = 0; i < 15; i++) offs[i + 1] = offs[i] + counts[i];
    for (i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
    return { counts: counts, symbols: symbols };
  }

  var FIXED_LIT = (function () {
    var l = new Uint8Array(288);
    for (var i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
    return buildTree(l, 288);
  })();
  var FIXED_DIST = (function () {
    var l = new Uint8Array(30);
    for (var i = 0; i < 30; i++) l[i] = 5;
    return buildTree(l, 30);
  })();

  /** Decomprime dati DEFLATE "raw" (senza intestazione zlib). expectedSize è facoltativo. */
  function inflateRaw(input, expectedSize) {
    var out = new Uint8Array(expectedSize > 0 ? expectedSize : Math.max(1024, input.length * 3));
    var op = 0;
    var ip = 0;
    var bitbuf = 0;
    var bitcnt = 0;

    function need(n) {
      if (typeof expectedSize === 'number' && op + n > expectedSize) throw new Error('dimensione decompressa oltre il limite dichiarato');
      if (op + n <= out.length) return;
      var nb = new Uint8Array(Math.max(out.length * 2, op + n));
      nb.set(out.subarray(0, op));
      out = nb;
    }
    function bits(n) {
      while (bitcnt < n) {
        if (ip >= input.length) throw new Error('dati compressi incompleti');
        bitbuf |= input[ip++] << bitcnt;
        bitcnt += 8;
      }
      var v = bitbuf & ((1 << n) - 1);
      bitbuf >>>= n;
      bitcnt -= n;
      return v;
    }
    function decode(t) {
      var sum = 0;
      var cur = 0;
      var len = 0;
      do {
        cur = 2 * cur + bits(1);
        if (++len > 15) throw new Error('codice Huffman non valido');
        sum += t.counts[len];
        cur -= t.counts[len];
      } while (cur >= 0);
      return t.symbols[sum + cur];
    }
    function dynamicTrees() {
      var hlit = bits(5) + 257;
      var hdist = bits(5) + 1;
      var hclen = bits(4) + 4;
      var cl = new Uint8Array(19);
      for (var i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
      var clTree = buildTree(cl, 19);
      var lengths = new Uint8Array(hlit + hdist);
      for (var n = 0; n < hlit + hdist;) {
        var sym = decode(clTree);
        if (sym < 16) { lengths[n++] = sym; continue; }
        var rep = 0;
        var val = 0;
        if (sym === 16) { if (!n) throw new Error('ripetizione senza valore'); val = lengths[n - 1]; rep = 3 + bits(2); }
        else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (n + rep > hlit + hdist) throw new Error('lunghezze dei codici non valide');
        while (rep--) lengths[n++] = val;
      }
      return { lit: buildTree(lengths.subarray(0, hlit), hlit), dist: buildTree(lengths.subarray(hlit), hdist) };
    }

    var final = 0;
    while (!final) {
      final = bits(1);
      var type = bits(2);
      if (type === 0) {
        bitbuf = 0;
        bitcnt = 0;
        if (ip + 4 > input.length) throw new Error('blocco non compresso troncato');
        var len = input[ip] | (input[ip + 1] << 8);
        var nlen = input[ip + 2] | (input[ip + 3] << 8);
        ip += 4;
        if ((len ^ 0xFFFF) !== nlen) throw new Error('blocco non compresso danneggiato');
        if (ip + len > input.length) throw new Error('blocco non compresso troncato');
        need(len);
        out.set(input.subarray(ip, ip + len), op);
        ip += len;
        op += len;
      } else if (type === 1 || type === 2) {
        var trees = type === 1 ? { lit: FIXED_LIT, dist: FIXED_DIST } : dynamicTrees();
        for (;;) {
          var s = decode(trees.lit);
          if (s < 256) { need(1); out[op++] = s; continue; }
          if (s === 256) break;
          s -= 257;
          if (s >= 29) throw new Error('lunghezza non valida');
          var length = LEN_BASE[s] + bits(LEN_EXTRA[s]);
          var d = decode(trees.dist);
          if (d >= 30) throw new Error('distanza non valida');
          var dist = DIST_BASE[d] + bits(DIST_EXTRA[d]);
          if (dist > op) throw new Error('distanza oltre l\'inizio dei dati');
          need(length);
          for (var k = 0; k < length; k++, op++) out[op] = out[op - dist];
        }
      } else {
        throw new Error('tipo di blocco non valido');
      }
    }
    return op === out.length ? out : out.subarray(0, op);
  }

  /* ---------------- lettura .zip ---------------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  /** Elenco delle voci dalla directory centrale. bytes: Uint8Array. */
  function readEntries(bytes) {
    if (!bytes || bytes.length < 22) throw new Error('non è un file .zip valido');
    var eocd = -1;
    for (var i = bytes.length - 22, stop = Math.max(0, bytes.length - 65557); i >= stop; i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('non è un file .zip valido');
    var total = u16(bytes, eocd + 10);
    var cdOff = u32(bytes, eocd + 16);
    if (total === 0xFFFF || cdOff === 0xFFFFFFFF) throw new Error('archivio ZIP64 non supportato (troppo grande)');
    var entries = [];
    var p = cdOff;
    for (var k = 0; k < total; k++) {
      if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw new Error('archivio .zip danneggiato');
      var flags = u16(bytes, p + 8);
      var nlen = u16(bytes, p + 28);
      var nameBytes = bytes.subarray(p + 46, p + 46 + nlen);
      var name = flags & 0x800 ? utf8Decode(nameBytes) : utf8Decode(nameBytes);
      entries.push({
        name: name.replace(/\\/g, '/'),
        flags: flags,
        method: u16(bytes, p + 10),
        crc: u32(bytes, p + 16),
        compressedSize: u32(bytes, p + 20),
        size: u32(bytes, p + 24),
        localOffset: u32(bytes, p + 42),
        isDir: /\/$/.test(name)
      });
      p += 46 + nlen + u16(bytes, p + 30) + u16(bytes, p + 32);
    }
    return entries;
  }

  /** Dati di una voce (verifica il CRC). inflate: funzione (Uint8Array, size) → Uint8Array; predefinita quella JS. */
  function readEntry(bytes, e, inflate) {
    if (e.flags & 1) throw new Error('"' + e.name + '": i file .zip protetti da password non sono supportati');
    var off = e.localOffset;
    if (off + 30 > bytes.length || u32(bytes, off) !== 0x04034b50) throw new Error('"' + e.name + '": intestazione danneggiata');
    var start = off + 30 + u16(bytes, off + 26) + u16(bytes, off + 28);
    var comp = bytes.subarray(start, start + e.compressedSize);
    var data;
    if (e.method === 0) data = comp;
    else if (e.method === 8) data = (inflate || inflateRaw)(comp, e.size);
    else throw new Error('"' + e.name + '": metodo di compressione ' + e.method + ' non supportato');
    if (data.length !== e.size || crc32(data) !== e.crc) throw new Error('"' + e.name + '": file danneggiato (controllo CRC fallito)');
    return data;
  }

  /** Tutte le voci (file, non cartelle) → {nome: Uint8Array}. limits: {maxFiles, maxTotal} */
  function unzip(bytes, opts) {
    var o = opts || {};
    var entries = readEntries(bytes).filter(function (e) { return !e.isDir; });
    if (o.maxFiles && entries.length > o.maxFiles) throw new Error('troppi file nell\'archivio (massimo ' + o.maxFiles + ')');
    var total = entries.reduce(function (s, e) { return s + e.size; }, 0);
    if (o.maxTotal && total > o.maxTotal) throw new Error('archivio troppo grande una volta estratto (massimo ' + Math.round(o.maxTotal / 1048576) + ' MB)');
    var files = {};
    entries.forEach(function (e) { files[e.name] = readEntry(bytes, e, o.inflate); });
    return files;
  }

  /* ---------------- scrittura .zip (stored) ---------------- */
  function dosDateTime(d) {
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    return { date: date & 0xFFFF, time: time & 0xFFFF };
  }

  /** files: [{name, data: Uint8Array | string}] → Uint8Array */
  function zip(files, when) {
    var dt = dosDateTime(when || new Date());
    var parts = [];
    var central = [];
    var offset = 0;
    function w16(a, o, v) { a[o] = v & 0xFF; a[o + 1] = (v >>> 8) & 0xFF; }
    function w32(a, o, v) { a[o] = v & 0xFF; a[o + 1] = (v >>> 8) & 0xFF; a[o + 2] = (v >>> 16) & 0xFF; a[o + 3] = (v >>> 24) & 0xFF; }
    files.forEach(function (f) {
      var name = utf8Encode(f.name);
      var data = typeof f.data === 'string' ? utf8Encode(f.data) : f.data;
      var crc = crc32(data);
      var lh = new Uint8Array(30 + name.length);
      w32(lh, 0, 0x04034b50); w16(lh, 4, 20); w16(lh, 6, 0x800); w16(lh, 8, 0);
      w16(lh, 10, dt.time); w16(lh, 12, dt.date); w32(lh, 14, crc); w32(lh, 18, data.length); w32(lh, 22, data.length);
      w16(lh, 26, name.length); w16(lh, 28, 0); lh.set(name, 30);
      var ch = new Uint8Array(46 + name.length);
      w32(ch, 0, 0x02014b50); w16(ch, 4, 20); w16(ch, 6, 20); w16(ch, 8, 0x800); w16(ch, 10, 0);
      w16(ch, 12, dt.time); w16(ch, 14, dt.date); w32(ch, 16, crc); w32(ch, 20, data.length); w32(ch, 24, data.length);
      w16(ch, 28, name.length); w16(ch, 30, 0); w16(ch, 32, 0); w16(ch, 34, 0); w16(ch, 36, 0); w32(ch, 38, 0); w32(ch, 42, offset);
      ch.set(name, 46);
      parts.push(lh, data);
      central.push(ch);
      offset += lh.length + data.length;
    });
    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new Uint8Array(22);
    w32(end, 0, 0x06054b50); w16(end, 8, files.length); w16(end, 10, files.length); w32(end, 12, cdSize); w32(end, 16, offset);
    var all = parts.concat(central, [end]);
    var size = all.reduce(function (s, a) { return s + a.length; }, 0);
    var out = new Uint8Array(size);
    var pos = 0;
    all.forEach(function (a) { out.set(a, pos); pos += a.length; });
    return out;
  }

  function isZip(bytes) { return !!bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5) ; }

  return { crc32: crc32, inflateRaw: inflateRaw, readEntries: readEntries, readEntry: readEntry, unzip: unzip, zip: zip, isZip: isZip, utf8Encode: utf8Encode, utf8Decode: utf8Decode };
});
