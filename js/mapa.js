/* =========================================================================
   MAPA — solicitudes por evaluar y evaluaciones hechas, con su color.

   Leaflet va DENTRO de la app (vendor/leaflet), no de unpkg: en taludes,
   si unpkg fallaba el mapa decía "necesita internet" aunque hubiera señal.
   Los cuadritos del mapa que ya se vieron quedan guardados (sw.js), así una
   zona revisada con señal se sigue viendo en la vereda.
   Todo sale de lo ya descargado: funciona sin señal.
   ========================================================================= */
'use strict';

const MAPA = { mapa: null, capa: null, yo: null, filtro: 'todas', reencuadrar: true };

const COLOR_PUNTO = { verde: '#12a150', amarillo: '#e0b800', rojo: '#e3000f', porEvaluar: '#0b4f6c', sin: '#78909c' };
const FILTROS_MAPA = [['todas', 'Todas'], ['porEvaluar', 'Por evaluar'], ['evaluadas', 'Evaluadas']];

/** Puntos del mapa a partir de lo que hay en el celular. */
function puntosDelMapa() {
  const puntos = [];
  solicitudesPendientes().filter(coincideSolicitud).forEach((s) => {
    if (!Esquema.coordenadaValida(s.lat, s.lon)) return;
    puntos.push({ tipo: 'porEvaluar', lat: +s.lat, lon: +s.lon, s });
  });
  const vistos = new Set();
  (APP.enviadasLocal || []).concat(APP.historial).forEach((h) => {
    if (vistos.has(h.id) || !Esquema.coordenadaValida(h.lat, h.lon) || !coincideEvaluacion(h)) return;
    vistos.add(h.id);
    puntos.push({ tipo: 'evaluada', color: COLOR_CLASIF[h.clasif] || 'sin', lat: +h.lat, lon: +h.lon, h });
  });
  APP.cola.forEach((c) => {
    const u = c.datos.ubicacion || {};
    if (!Esquema.coordenadaValida(u.lat, u.lon) || !coincideBusqueda(c.datos.direccion, c.datos.barrio_vereda, c.datos.id_solicitud)) return;
    puntos.push({ tipo: 'evaluada', color: COLOR_CLASIF[c.datos.clasif_habitabilidad] || 'sin', lat: +u.lat, lon: +u.lon,
      h: Object.assign({ id: c.id, num_formulario: 'En cola' }, resumenDeDatos(c.datos)) });
  });
  return puntos;
}

function htmlPopup(p) {
  if (p.tipo === 'porEvaluar') {
    const s = p.s;
    return '<b>' + esc(s.direccion || 'Sin dirección') + '</b><br>' + esc([s.barrio, s.prioridad].filter(Boolean).join(' · ')) +
      (s.descripcion ? '<br><span class="pop-desc">' + esc(s.descripcion) + '</span>' : '') +
      '<br><button type="button" class="btn-principal btn-chico pop-btn" data-evaluar="' + esc(s.id_solicitud) + '">Evaluar</button>' +
      '<a class="btn-secundario btn-chico pop-btn" target="_blank" rel="noopener" href="' + esc(urlComoLlegar(s)) + '">' + icono('ruta') + 'Cómo llegar</a>';
  }
  const h = p.h;
  return '<b>' + esc(h.direccion || 'Sin dirección') + '</b><br>' + chipClasif(h.clasif) + ' ' + esc(h.num_formulario || '') +
    '<br>' + esc([fechaBonita(h.fecha), h.evaluador].filter(Boolean).join(' · ')) +
    (h.ficha_url ? '<br><a class="btn-secundario btn-chico pop-btn" target="_blank" rel="noopener" href="' + esc(h.ficha_url) + '">Abrir ficha</a>' : '');
}

async function abrirMapa() {
  if (typeof L === 'undefined') { $('#mapa').innerHTML = '<p class="vacio">No se pudo cargar el mapa.</p>'; return; }
  const guardado = await DB.leerKV('filtroMapa');
  MAPA.filtro = FILTROS_MAPA.some((f) => f[0] === guardado) ? guardado : 'todas';   // un valor raro nunca deja el mapa en blanco
  ajustarAltoMapa();
  if (!MAPA.mapa) {
    MAPA.mapa = L.map('mapa', { zoomControl: true, attributionControl: true }).setView([4.8133, -75.6961], 13);
    // Sin {s}: el mismo cuadrito se guardaba hasta tres veces con a./b./c.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(MAPA.mapa);
    MAPA.capa = L.layerGroup().addTo(MAPA.mapa);
    MAPA.mapa.on('popupopen', (ev) => {
      const b = ev.popup.getElement().querySelector('[data-evaluar]');
      if (b) b.onclick = () => abrirEvaluacion({ solicitud: APP.solicitudes.find((x) => x.id_solicitud === b.dataset.evaluar) });
    });
  }
  MAPA.reencuadrar = true;
  pintarMapa();
  setTimeout(() => MAPA.mapa.invalidateSize(), 60);
}

function ajustarAltoMapa() {
  const el = $('#mapa');
  const arriba = el.getBoundingClientRect().top + window.scrollY;
  // En el celular la barra de Visitas / Mapa / Tablero va abajo, encima del mapa.
  const nav = $('.topbar-vistas');
  const abajo = nav && getComputedStyle(nav).position === 'fixed' ? nav.offsetHeight : 0;
  el.style.height = Math.max(280, window.innerHeight - arriba - abajo) + 'px';
}

function pintarMapa() {
  if (!MAPA.mapa) return;
  const todos = puntosDelMapa();
  // Las cuentas se sacan ANTES de filtrar: si no, el botón apagado dice 0
  // y parece que no queda nada por evaluar (pasó en taludes).
  // "Por evaluar" cuenta lo mismo que la lista, aunque alguna visita no tenga
  // ubicación (el celular decía 0 en el mapa y 1 en la lista).
  const sinUbicacion = solicitudesPendientes().filter(coincideSolicitud).filter((s) => !Esquema.coordenadaValida(s.lat, s.lon)).length;
  const conPunto = todos.filter((p) => p.tipo === 'porEvaluar').length;
  const cuentas = { porEvaluar: conPunto + sinUbicacion, evaluadas: todos.length - conPunto };
  cuentas.todas = cuentas.porEvaluar + cuentas.evaluadas;
  $('#mapa-filtros').innerHTML = FILTROS_MAPA.map(([k, t]) =>
    '<button type="button" class="chip chip-mapa" data-filtro-mapa="' + k + '" aria-checked="' + (MAPA.filtro === k) + '">' +
    t + ' <span class="cuenta">' + cuentas[k] + '</span></button>').join('');
  $('#mapa-leyenda').innerHTML = [['porEvaluar', 'Por evaluar'], ['verde', 'Habitable'], ['amarillo', 'Uso restringido'], ['rojo', 'No habitable']]
    .map(([c, t]) => '<span><i style="background:' + COLOR_PUNTO[c] + '"></i>' + t + '</span>').join('') +
    (sinUbicacion && MAPA.filtro !== 'evaluadas'
      ? '<span class="mapa-sin-ubicacion">' + sinUbicacion + (sinUbicacion === 1 ? ' visita sin ubicación: está solo en la lista' : ' visitas sin ubicación: están solo en la lista') + '</span>' : '');

  const visibles = todos.filter((p) => MAPA.filtro === 'todas' ||
    (MAPA.filtro === 'porEvaluar' ? p.tipo === 'porEvaluar' : p.tipo === 'evaluada'));
  MAPA.capa.clearLayers();
  visibles.forEach((p) => {
    const color = p.tipo === 'porEvaluar' ? COLOR_PUNTO.porEvaluar : COLOR_PUNTO[p.color];
    L.circleMarker([p.lat, p.lon], {
      radius: p.tipo === 'porEvaluar' ? 8 : 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95
    }).bindPopup(htmlPopup(p), { maxWidth: 260 }).addTo(MAPA.capa);
  });
  if (MAPA.reencuadrar && visibles.length) {
    MAPA.mapa.fitBounds(L.latLngBounds(visibles.map((p) => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 16 });
  }
  MAPA.reencuadrar = false;
  $('#mapa-vacio').hidden = visibles.length > 0;
  // La leyenda y los filtros recién dibujados cambian dónde empieza el mapa:
  // se vuelve a medir para que el borde de abajo no quede bajo la barra inferior.
  if (APP.vista === 'mapa') { ajustarAltoMapa(); MAPA.mapa.invalidateSize(); }
}

function centrarEnMi() {
  const b = $('#btn-mapa-yo');
  b.disabled = true;
  b.innerHTML = icono('ubicacion') + '<span>Buscando…</span>';
  const listo = () => { b.disabled = false; b.innerHTML = icono('ubicacion') + '<span>Dónde estoy</span>'; };
  pedirUbicacion({
    listo: (m) => {
      listo();
      if (MAPA.yo) MAPA.yo.remove();
      MAPA.yo = L.circleMarker([m.lat, m.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#1e88e5', fillOpacity: 1 })
        .bindPopup('Usted está aquí (±' + m.precision + ' m)').addTo(MAPA.mapa);
      MAPA.mapa.setView([m.lat, m.lon], 17);
    },
    error: () => { listo(); toast('No se pudo tomar la ubicación.', 'error'); }
  });
}

function enlazarMapa() {
  $('#mapa-filtros').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-filtro-mapa]');
    if (!b) return;
    MAPA.filtro = b.dataset.filtroMapa;
    DB.guardarKV('filtroMapa', MAPA.filtro);
    MAPA.reencuadrar = true;                    // si no, lo que queda puede estar fuera de pantalla
    pintarMapa();
  });
  $('#btn-mapa-yo').addEventListener('click', centrarEnMi);
  window.addEventListener('resize', () => {
    if (APP.vista === 'mapa' && MAPA.mapa) { ajustarAltoMapa(); MAPA.mapa.invalidateSize(); }
  });
}
