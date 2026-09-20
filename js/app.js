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
  enlazarBuscador();
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
  await recargarLocales();
  irAVista(APP.vista || 'lista');

  clearInterval(entrarApp._reloj);
  entrarApp._reloj = setInterval(() => { if (navigator.onLine) sincronizar(true); }, CONFIG.MINUTOS_AUTOSYNC * 60000);
}

/** El buscador filtra la vista que esté abierta; espera a que deje de escribir un momento. */
function enlazarBuscador() {
  const campo = $('#buscar'), limpiar = $('#buscar-limpiar');
  let espera = null;
  const aplicar = () => {
    APP.busqueda = campo.value.trim();
    limpiar.hidden = !campo.value;
    MAPA.reencuadrar = true;                   // el mapa se acerca a lo encontrado
    TABLERO.mostrar = 20;
    pintarInicio();
  };
  campo.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 250); });
  campo.addEventListener('search', aplicar);   // la X nativa del campo y la tecla Enter
  limpiar.addEventListener('click', () => { campo.value = ''; aplicar(); campo.focus(); });
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
  // Ingreso y menú también: recargar borraba lo que estaban escribiendo en "Mis datos" o la firma.
  return !APP.actual && !APP.sincronizando && !escribiendo && $('#vista-previa').hidden && $('#vista-firma').hidden &&
    $('#vista-ingreso').hidden && $('#vista-menu').hidden;
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

/**
 * Si la app no arranca (base local dañada, navegador viejo), se muestra con
 * el estilo de la app y no con el aviso gris del navegador: ese alert no se
 * puede leer bien en el celular y se ve como un error de página.
 */
function mostrarFalloDeArranque(e) {
  console.error(e);
  const caja = document.createElement('div');
  caja.className = 'fallo-arranque';
  caja.innerHTML = '<div class="fallo-caja"><b>No se pudo abrir la aplicación</b>' +
    '<p>' + esc(e && e.message ? e.message : String(e)) + '</p>' +
    '<p class="fallo-nota">Cierre la app y vuelva a abrirla. Si sigue igual, avise a la DIGER.</p>' +
    '<button type="button" class="btn-principal" id="btn-reintentar">Reintentar</button></div>';
  document.body.appendChild(caja);
  document.getElementById('btn-reintentar').addEventListener('click', () => location.reload());
}

iniciar().catch(mostrarFalloDeArranque);
