/* =========================================================================
   GPS — misma lógica probada en taludes: escucha varios segundos y se queda
   con la MEJOR lectura, no con la primera (que suele venir de la red, ±50 m).
   ========================================================================= */
'use strict';

const GPS = { buscando: false, mejor: null, cuando: 0, inicio: 0, vigia: null, reloj: null, oyentes: [] };
const GPS_VIGENCIA = 120000;   // a los 2 minutos el ingeniero ya caminó

function gpsSegundos() { return Math.round((Date.now() - GPS.inicio) / 1000); }
function gpsFresco() { return !!GPS.mejor && (Date.now() - GPS.cuando) < GPS_VIGENCIA; }

/** Se conforma con menos a medida que pasan los segundos. */
function gpsSuficiente(m, seg) {
  return m <= CONFIG.GPS_PRECISION_OBJETIVO || (seg >= 6 && m <= 15) || (seg >= 12 && m <= 25);
}

function calidadGps(m) {
  if (m == null) return '';
  if (m <= CONFIG.GPS_PRECISION_OBJETIVO) return 'ok';
  return m <= 25 ? 'regular' : 'malo';
}

function gpsCerrar(err) {
  if (GPS.vigia != null) navigator.geolocation.clearWatch(GPS.vigia);
  clearInterval(GPS.reloj);
  GPS.vigia = null; GPS.reloj = null; GPS.buscando = false;
  const oyentes = GPS.oyentes; GPS.oyentes = [];
  oyentes.forEach((o) => {
    if (GPS.mejor && o.listo) o.listo(Object.assign({}, GPS.mejor));
    else if (!GPS.mejor && o.error) o.error(err || { code: 3, message: 'Sin lecturas de GPS.' });
  });
}

/** cb = { progreso(mejor, seg), listo(mejor), error(err) } */
function pedirUbicacion(cb, remedir) {
  if (!navigator.geolocation) { if (cb && cb.error) cb.error({ code: 2, message: 'Este celular no tiene GPS disponible.' }); return; }
  if (cb) GPS.oyentes.push(cb);
  if (GPS.buscando) { if (cb && cb.progreso) cb.progreso(GPS.mejor, gpsSegundos()); return; }
  if (!remedir && gpsFresco()) { gpsCerrar(); return; }

  GPS.mejor = null; GPS.buscando = true; GPS.inicio = Date.now();
  const limite = CONFIG.GPS_SEGUNDOS_MAX * 1000;
  let ultimaMejora = Date.now();

  GPS.vigia = navigator.geolocation.watchPosition((pos) => {
    const p = pos.coords;
    // Se guardan NÚMEROS. En taludes viajaban como texto y la hoja en
    // español convertía 4.8133 en 48133.
    if (!GPS.mejor || p.accuracy < GPS.mejor.precision) {
      GPS.mejor = { lat: +p.latitude.toFixed(7), lon: +p.longitude.toFixed(7), precision: Math.round(p.accuracy),
        alt: p.altitude != null ? Math.round(p.altitude) : null };
      GPS.cuando = Date.now(); ultimaMejora = Date.now();
    }
    const seg = gpsSegundos();
    GPS.oyentes.forEach((o) => o.progreso && o.progreso(GPS.mejor, seg));
    if (gpsSuficiente(GPS.mejor.precision, seg)) gpsCerrar();
  }, (err) => { if (GPS.buscando) gpsCerrar(err); },
  { enableHighAccuracy: true, timeout: limite, maximumAge: 0 });

  GPS.reloj = setInterval(() => {
    GPS.oyentes.forEach((o) => o.progreso && o.progreso(GPS.mejor, gpsSegundos()));
    const estancado = GPS.mejor && (Date.now() - ultimaMejora) >= 5000 && GPS.mejor.precision <= 30;
    if (estancado || (Date.now() - GPS.inicio) >= limite) gpsCerrar();
  }, 1000);
}

function usarLoQueHayaGps() { if (GPS.buscando) gpsCerrar(); }

/** Arranca el GPS al abrir la ficha SOLO si el permiso ya estaba concedido. */
function precalentarGps() {
  if (!navigator.permissions || !navigator.permissions.query) return;
  navigator.permissions.query({ name: 'geolocation' })
    .then((p) => { if (p.state === 'granted') pedirUbicacion(null); }).catch(() => {});
}

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
