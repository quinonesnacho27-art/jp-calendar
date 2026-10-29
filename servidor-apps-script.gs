/* Servidor de sincronización — Hipotecario Itaú
   Guarda los datos compartidos del Calendario Comercial y del Control TOCTOC.
   - GET  ?op=get&app=<app>                 -> {ok, env}
   - POST {op:'put', app, baseRev, env}     -> {ok, rev} | {ok:false, conflict:true, env}
   La escritura es atómica (LockService) y solo se acepta si nadie guardó antes
   (baseRev = versión actual); si no, devuelve la versión vigente para mezclarla.
   Se conserva además la versión anterior de cada app como respaldo. */
var APPS = {'calendario-hipotecario': 1, 'control-toctoc-itau': 1, 'jp-calendar': 1, 'selftest': 1};
var CHUNK = 7000;

function doGet(e) { return handle_(e && e.parameter ? e.parameter : {}); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (x) { return out_({ok: false, error: 'Solicitud inválida'}); }
  return handle_(p);
}

function handle_(p) {
  try {
    var app = String(p.app || '');
    if (!APPS[app]) return out_({ok: false, error: 'Aplicación desconocida'});
    var op = p.op || 'get';
    if (op === 'get') return out_({ok: true, env: read_(app)});
    if (op === 'put') {
      var env = p.env;
      if (!env || typeof env !== 'object') return out_({ok: false, error: 'Datos vacíos'});
      var lock = LockService.getScriptLock();
      lock.waitLock(25000);
      try {
        var cur = read_(app), curRev = cur ? (cur.rev || 0) : 0;
        if (Number(p.baseRev) !== curRev) return out_({ok: false, conflict: true, env: cur});
        env.app = app; env.rev = curRev + 1; env.serverAt = new Date().toISOString();
        write_(app, env);
        if (cur) write_(app + '~prev', cur);
        return out_({ok: true, rev: env.rev, serverAt: env.serverAt});
      } finally { lock.releaseLock(); }
    }
    return out_({ok: false, error: 'Operación desconocida'});
  } catch (err) {
    return out_({ok: false, error: String(err && err.message || err)});
  }
}

function read_(key) {
  var sp = PropertiesService.getScriptProperties(), all = sp.getProperties();
  var n = Number(all[key + ':n'] || 0);
  if (!n) return null;
  var s = '';
  for (var i = 0; i < n; i++) s += all[key + ':' + i] || '';
  return JSON.parse(s);
}

function write_(key, obj) {
  var sp = PropertiesService.getScriptProperties();
  var s = JSON.stringify(obj), parts = {}, n = Math.ceil(s.length / CHUNK) || 1;
  var oldN = Number(sp.getProperty(key + ':n') || 0);
  for (var i = 0; i < n; i++) parts[key + ':' + i] = s.substr(i * CHUNK, CHUNK);
  parts[key + ':n'] = String(n);
  sp.setProperties(parts, false);
  for (var j = n; j < oldN; j++) sp.deleteProperty(key + ':' + j);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* Ejecutar una vez desde el editor para autorizar el script. */
function probar() {
  write_('selftest', {app: 'selftest', rev: 0, data: 'ok'});
  Logger.log(JSON.stringify(read_('selftest')));
}
