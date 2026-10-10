/* Verifica la copia di distribuzione PRIMA del primo utilizzo. Zero dipendenze. */
'use strict';
var fs=require('fs'),path=require('path'),crypto=require('crypto');
var root=path.resolve(__dirname,'..'),bad=[],count=0;
fs.readFileSync(path.join(root,'SHA256SUMS.txt'),'utf8').split(/\r?\n/).filter(Boolean).forEach(function(line){
  var m=/^([a-f0-9]{64})  (.+)$/.exec(line);
  if(!m){bad.push('Riga manifest non valida');return;}
  var f=path.resolve(root,m[2]);
  if(f.indexOf(root+path.sep)!==0){bad.push('Percorso non valido: '+m[2]);return;}
  try{
    var hash=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    if(hash!==m[1])bad.push('Diverso: '+m[2]);
    count++;
  }catch(e){bad.push('Non leggibile: '+m[2]);}
});
if(bad.length){console.error(bad.join('\n'));process.exitCode=1;}
else console.log('OK: '+count+' file corrispondono ai checksum della release.');
