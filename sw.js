/**
 * Service Worker — la app abre y funciona sin señal.
 *
 * Reglas aprendidas en taludes (no cambiarlas sin leer por qué):
 *  - La caché de cada versión es INMUTABLE. Refrescar archivos sueltos en
 *    segundo plano mezcló un index.html viejo con un app.js nuevo.
 *  - La versión nueva se instala pero NO se activa hasta que el ingeniero
 *    toca "Actualizar" (mensaje SALTAR_ESPERA). Nunca a mitad de una ficha.
 *  - cache:'reload' al instalar: GitHub Pages manda max-age=600 y sin esto
 *    se guardaban copias viejas para siempre.
 *
 * El prefijo sale de la dirección: producción y /pruebas/ nunca comparten
 * caché, sin tener que editar nada al copiar la carpeta.
 *
 * AL PUBLICAR UNA VERSIÓN NUEVA: subir VERSION aquí y VERSION_APP en js/base.js.
 */
const ENTORNO = self.location.pathname.indexOf('/pruebas/') !== -1 ? 'pruebas' : 'prod';
const PREFIJO = 'miyamoto-' + ENTORNO;
const VERSION = PREFIJO + '-v5';

/**
 * Cuadritos del mapa ya vistos. NO lleva el número de versión: borrarlos en
 * cada actualización dejaría al ingeniero sin mapa en campo justo después
 * de actualizar. Se limpia sola por tamaño (400 cuadritos, ~8 MB).
 */
const CACHE_MAPA = PREFIJO + '-mapa';
const TOPE_CUADRITOS = 400;
const esCuadrito = (url) => url.hostname === 'tile.openstreetmap.org';

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './manifest.json',
  './js/esquema.js',
  './js/ficha.js',
  './js/base.js',
  './js/gps.js',
  './js/fotos.js',
  './js/formulario.js',
  './js/envio.js',
  './js/descargas.js',
  './js/compartir.js',
  './js/verficha.js',
  './ficha.html',
  './js/mapa.js',
  './js/tablero.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './js/inicio.js',
  './js/app.js',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/logo-app.png',
  './img/logo-sngrd.png',
  './img/logo-usaid-miyamoto.png',
  './img/logos-pie.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', (ev) => { if (ev.data === 'SALTAR_ESPERA') self.skipWaiting(); });

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves
        .filter((k) => k.indexOf(PREFIJO + '-') === 0 && k !== VERSION && k !== CACHE_MAPA)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET') return;
  // El servidor nunca se guarda en caché: siempre datos frescos.
  if (url.hostname.indexOf('script.google') !== -1 || url.hostname.indexOf('googleusercontent') !== -1) return;
  if (esCuadrito(url)) { ev.respondWith(responderCuadrito(ev.request)); return; }
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(ev.request, { ignoreSearch: true }).then((guardado) => {
        if (guardado) return guardado;
        return fetch(ev.request)
          .then((res) => { if (res && res.ok) cache.put(ev.request, res.clone()); return res; })
          .catch(() => cache.match('./index.html'));
      })
    )
  );
});

/** Primero lo guardado, si no la red. Una zona vista con señal se sigue viendo sin ella. */
let puestos = 0;
function responderCuadrito(pedido) {
  return caches.open(CACHE_MAPA).then((cache) => cache.match(pedido).then((guardado) => {
    if (guardado) return guardado;
    return fetch(pedido).then((res) => {
      if (res && res.ok) cache.put(pedido, res.clone()).then(() => limpiarCuadritos(cache));
      return res;
    });
  }));
}

function limpiarCuadritos(cache) {
  if (++puestos < 25) return null;          // revisar cada 25, no en cada uno
  puestos = 0;
  return cache.keys().then((claves) => {
    if (claves.length <= TOPE_CUADRITOS) return null;
    return Promise.all(claves.slice(0, claves.length - TOPE_CUADRITOS).map((r) => cache.delete(r)));   // los más viejos primero
  }).catch(() => null);
}
