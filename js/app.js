/* =========================================================================
   ARRANQUE — se carga de último.
   ========================================================================= */
'use strict';

async function iniciar() {
  document.body.classList.toggle('entorno-pruebas', CONFIG.ENTORNO === 'pruebas');
  document.body.classList.toggle('modo-demo', CONFIG.DEMO);
  $('#cinta-entorno').textContent = CONFIG.DEMO ? 'DEMOSTRACIÓN · nada sale del celular' : (CONFIG.ENTORNO === 'pruebas' ? 'PRUEBAS' : '');

  enlazarInicio();
  enlazarMenu();
  enlazarMapa();
  enlazarTablero();
  enlazarCompartir();
  $$('[data-vista]').forEach((b) => b.addEventListener('click', () => irAVista(b.dataset.vista)));
  iniciarEventosFicha();
  iniciarEventosFirma();
  $('#form-ingreso').addEventListener('submit', ingresar);
  registrarSW();

  // Que el navegador no borre la base local cuando se llene el celular.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  await cargarListas();
  APP.perfil = await DB.leerKV('perfil');
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
  window.addEventListener('online', () => sincronizar(true));
  window.addEventListener('offline', pintarConexion);
}

// ---------------------------------------------------------------- ACTUALIZACIONES
/**
 * Igual que taludes: la versión nueva se descarga pero NO se activa hasta
 * que el ingeniero toca "Actualizar". Nunca le cambia la app a mitad de ficha.
 */
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
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

function avisarVersionNueva(worker) {
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
