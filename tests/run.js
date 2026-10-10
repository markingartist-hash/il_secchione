#!/usr/bin/env node
/*
 * Esegue tutti i test automatici:  node tests/run.js  [filtro]
 * Esempio: node tests/run.js scoring
 */
'use strict';
var fs = require('fs');
var path = require('path');
var h = require('./harness.js');

var files = fs.readdirSync(__dirname).filter(function (f) { return /\.test\.js$/.test(f); }).sort();
files.forEach(function (f) {
  h.setFile(f);
  require(path.join(__dirname, f));
});

h.run(process.argv[2]).then(function (failures) {
  process.exit(failures ? 1 : 0);
}, function (e) {
  console.error(e);
  process.exit(1);
});
