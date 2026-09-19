/* =========================================================================
   ARRANQUE — se carga de último.
   ========================================================================= */
'use strict';

async function iniciar() {
  document.body.classList.toggle('entorno-pruebas', CONFIG.ENTORNO === 'pruebas');
  document.body.classList.toggle('modo-demo', CONFIG.DEMO);
  $('#cinta-entorno').textContent = CONFIG.DEMO ? 'DEMOSTRACIÓN · nada sale del celular' : (CONFIG.ENTORNO === 'pruebas' ? 'PRUEBAS' : '');
  if (CONFIG.DEMO_CON_DATOS) {
    $('#cinta-entorno').innerHTML = 'DEMOSTRACIÓN · datos de ejemplo · <a href="./">Salir</a>';
  }

  enlazarInicio();
  enlazarMenu();
  enlazarMapa();
  enlazarTablero();
  enlazarCompartir();
  $$('[data-vista]').forEach((b) => b.addEventListener('click', () => irAVista(b.dataset.vista)));
  iniciarEventosFicha();
  iniciarEventosFirma();
  $('#form-ingreso').addEventListener('submit', ingresar);
  // Una sola vez (antes se agregaban en cada ingreso y se duplicaban).
  window.addEventListener('online', () => sincronizar(true));
  window.addEventListener('offline', pintarConexion);
  registrarSW();

  // Que el navegador no borre la base local cuando se llene el celular.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  await cargarListas();
  APP.perfil = await DB.leerKV('perfil');
  if (!APP.perfil) APP.perfilAnterior = (await DB.leerKV('perfilAnterior')) || (CONFIG.DEMO_CON_DATOS ? perfilDeDemostracion() : null);
  if (!APP.perfil) { mostrarIngreso(); return; }
  entrarApp();
  sincronizar(true);
}

async function entrarApp() {
  $$('section.vista').forEach((v) => { v.hidden = true; });
  $('#vista-inicio').hidden = false;
  const cat = await DB.leerKV('catalogo');
  if (cat) { APP.solicitudes = cat.solicitudes || []; APP.historial = cat.historial || []; APP.ultimaSync = cat.cuando; }
  APP.verSolicitudes = (await DB.leerKV('verSolicitudes')) || 'mias';
  await recargarLocales();
  irAVista(APP.vista || 'lista');

  clearInterval(entrarApp._reloj);
  entrarApp._reloj = setInterval(() => { if (navigator.onLine) sincronizar(true); }, CONFIG.MINUTOS_AUTOSYNC * 60000);
}

/** Borra la base local de la demostración (nunca la real) y la deja como nueva. */
async function reiniciarDemostracion() {
  if (!CONFIG.DEMO_CON_DATOS || NOMBRE_BD !== 'miyamoto-demo') return;
  if (DB._db) { DB._db.close(); DB._db = null; }
  await new Promise((ok) => { const r = indexedDB.deleteDatabase(NOMBRE_BD); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
  location.reload();
}

// ---------------------------------------------------------------- ACTUALIZACIONES
/**
 * La versión nueva se descarga sola. Se activa SOLA si en ese momento nadie
 * está llenando una evaluación, sincronizando ni escribiendo (18/09: con solo
 * la barra "Actualizar", quien no la tocaba seguía con la versión vieja sin
 * saberlo). Si está ocupado, sale la barra y además se activa sola apenas
 * salga de la evaluación o vuelva a la app. Nunca a mitad de una ficha.
 */
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  let recargando = false;
  // Solo se recarga cuando CAMBIA la versión. En el primer uso el service
  // worker también "toma el control" a los pocos segundos, y recargar ahí
  // borraba lo que el técnico nuevo estaba escribiendo en el ingreso
  // (código, datos y firma). Encontrado en la auditoría del 18/09.
  const habiaVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando || !habiaVersion) return;
    recargando = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) avisarVersionNueva(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      if (!nuevo) return;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisarVersionNueva(nuevo);
      });
    });
    const revisar = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(revisar, CONFIG.MINUTOS_BUSCAR_ACTUALIZACION * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
  }).catch(() => console.warn('Sin modo fuera de línea (requiere https o localhost).'));
}

let _versionEsperando = null;

function sePuedeActualizarSolo() {
  const foco = document.activeElement;
  const escribiendo = !!foco && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName);
  return !APP.actual && !APP.sincronizando && !escribiendo && $('#vista-previa').hidden && $('#vista-firma').hidden;
}

/** Si hay una versión nueva esperando y el momento es bueno, se activa (la página se recarga sola). */
function aplicarVersionSiSePuede() {
  if (_versionEsperando && sePuedeActualizarSolo()) { _versionEsperando.postMessage('SALTAR_ESPERA'); _versionEsperando = null; }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) aplicarVersionSiSePuede(); });

function avisarVersionNueva(worker) {
  _versionEsperando = worker;
  if (sePuedeActualizarSolo()) { aplicarVersionSiSePuede(); return; }
  const barra = $('#aviso-version');
  barra.hidden = false;
  $('#btn-actualizar').onclick = async () => {
    $('#btn-actualizar').disabled = true;
    $('#btn-actualizar').textContent = 'Actualizando…';
    if (APP.actual) await guardarBorrador(true);
    worker.postMessage('SALTAR_ESPERA');
  };
}

iniciar().catch((e) => {
  console.error(e);
  alert('No se pudo iniciar la aplicación: ' + e.message);
});
