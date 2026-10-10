/* Indirizzi IPv4 della LAN, ordinati dal più probabile (Wi-Fi/Ethernet) al meno probabile (adattatori virtuali). */
'use strict';
var os = require('os');

var VIRTUAL = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|vbox|loopback|bluetooth|tailscale|zerotier|hamachi/i;

function isPrivate(ip) {
  return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

function lanAddresses() {
  var ifs = os.networkInterfaces();
  var out = [];
  Object.keys(ifs).forEach(function (name) {
    (ifs[name] || []).forEach(function (a) {
      var v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal) return;
      var linkLocal = /^169\.254\./.test(a.address);
      var virtual = VIRTUAL.test(name);
      var hotspot = a.address === '192.168.137.1';
      var score = (isPrivate(a.address) ? 0 : 20) + (virtual ? 50 : 0) + (linkLocal ? 100 : 0) - (hotspot ? 1 : 0);
      out.push({ interface: name, address: a.address, virtual: virtual, linkLocal: linkLocal, hotspot: hotspot, score: score });
    });
  });
  out.sort(function (x, y) { return x.score - y.score; });
  return out;
}

module.exports = { lanAddresses: lanAddresses, isPrivate: isPrivate };
