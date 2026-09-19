/* =========================================================================
   TABLERO — resumen de lo evaluado. Se arma con lo que el celular ya tiene
   (abre al instante y funciona sin señal, con el corte de la última
   sincronización). Gráficas en HTML a mano: una librería pesaría más que
   toda la app.

   Dinámico (pedido del 18/09): se filtra tocando las gráficas. Tocar una
   barra, un día o una cifra aplica ese filtro a TODO el tablero (cifras,
   mapa, demás gráficas y la lista de abajo); tocarla otra vez lo quita.
   Cada gráfica se calcula con los demás filtros pero no con el suyo, para
   que se vean las otras opciones y se pueda cambiar de una a otra.
   ========================================================================= */
'use strict';

const TABLERO = { periodo: '30', quien: 'todas', mapa: null, filtros: {}, mostrar: 20 };
const PERIODOS = [['7', '7 días'], ['30', '30 días'], ['todo', 'Todo']];
const VACIO = '__vacio__';

/** Filtros que se aplican desde las gráficas: cómo sacar el valor y cómo nombrarlo. */
const FILTROS_TABLERO = {
  clasif: { titulo: 'Habitabilidad', valor: (e) => e.clasif || '', nombre: (v) => NOMBRE_COLOR[COLOR_CLASIF[v]] || v },
  nivel: { titulo: 'Daño', valor: (e) => e.nivel || '', nombre: (v) => Esquema.etiquetaDe('nivel_dano', v) || v },
  dia: { titulo: 'Día', valor: (e) => diaDe(e.fecha), nombre: (v) => new Date(v + 'T12:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) },
  barrio: { titulo: 'Barrio', valor: (e) => e.barrio || '', nombre: (v) => v },
  evaluador: { titulo: 'Evaluador', valor: (e) => e.evaluador || '', nombre: (v) => v }
};

function diaDe(fecha) {
  const f = new Date(fecha);
  if (isNaN(f)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate());
}

function evaluacionesConocidas() {
  const vistos = new Set(), r = [];
  APP.cola.forEach((c) => { vistos.add(c.id); r.push(Object.assign({ id: c.id, enCola: true }, resumenDeDatos(c.datos))); });
  (APP.enviadasLocal || []).concat(APP.historial).forEach((h) => { if (!vistos.has(h.id)) { vistos.add(h.id); r.push(h); } });
  return r;
}

/** Periodo y "todo el equipo / solo las mías" (los selectores de arriba). */
function evaluacionesDelPeriodo() {
  const dias = TABLERO.periodo === 'todo' ? null : Number(TABLERO.periodo);
  const desde = dias ? Date.now() - dias * 86400000 : 0;
  const yo = Esquema.normalizarTexto(APP.perfil && APP.perfil.nombre);
  return evaluacionesConocidas().filter((e) => {
    if (desde && !(new Date(e.fecha).getTime() >= desde)) return false;
    if (TABLERO.quien === 'mias' && Esquema.normalizarTexto(e.evaluador) !== yo) return false;
    return true;
  });
}

/** Aplica los filtros de las gráficas, menos el que se indique (para dibujar esa gráfica). */
function aplicarFiltros(lista, salvo) {
  return lista.filter((e) => Object.keys(TABLERO.filtros).every((k) => {
    if (k === salvo) return true;
    const v = FILTROS_TABLERO[k].valor(e);
    return (v === '' ? VACIO : v) === TABLERO.filtros[k];
  }));
}

/** Lo que cuentan las cifras, el mapa y la lista (usado también desde fuera). */
function evaluacionesDelTablero() { return aplicarFiltros(evaluacionesDelPeriodo()); }

/** [[valor, n]] de mayor a menor. */
function contar(lista, clave) {
  const m = new Map();
  lista.forEach((x) => { const k = FILTROS_TABLERO[clave].valor(x) || VACIO; m.set(k, (m.get(k) || 0) + 1); });
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

const etiquetaFiltro = (clave, v) => (v === VACIO ? 'Sin dato' : FILTROS_TABLERO[clave].nombre(v));

/**
 * Barras horizontales que se tocan para filtrar. datos: [[valor, n, color?]].
 * Con un filtro puesto, la barra elegida queda marcada y las demás tenues.
 */
function barras(clave, datos, colorBase) {
  if (!datos.some((d) => d[1])) return '<p class="c-nota">Sin datos con estos filtros.</p>';
  const tope = Math.max.apply(null, datos.map((d) => d[1])) || 1;
  const activo = TABLERO.filtros[clave];
  return '<div class="barras">' + datos.map(([valor, n, color]) => {
    const et = etiquetaFiltro(clave, valor);
    return '<button type="button" class="barra-fila' + (activo && activo !== valor ? ' tenue' : '') + '" data-filtro="' + clave + '" data-valor="' + esc(valor) + '"' +
      ' aria-pressed="' + (activo === valor) + '" title="' + esc((activo === valor ? 'Quitar filtro: ' : 'Filtrar por: ') + et) + '">' +
      '<span class="barra-et">' + esc(et) + '</span>' +
      '<span class="barra-pista"><span class="barra" style="width:' + (n ? Math.max(2, Math.round(100 * n / tope)) : 0) + '%;background:' + (color || colorBase) + '"></span></span>' +
      '<span class="barra-n">' + n + '</span></button>';
  }).join('') + '</div>';
}

/** Columnas por día de los últimos N días (máx. 30). Cada día se toca para filtrar. */
function porDia(lista) {
  const n = TABLERO.periodo === '7' ? 7 : 30;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = [];
  for (let i = n - 1; i >= 0; i--) dias.push(diaDe(new Date(hoy.getTime() - i * 86400000 + 43200000)));
  const cuentas = new Map(dias.map((d) => [d, 0]));
  lista.forEach((e) => { const d = diaDe(e.fecha); if (cuentas.has(d)) cuentas.set(d, cuentas.get(d) + 1); });
  const tope = Math.max.apply(null, Array.from(cuentas.values())) || 1;
  const activo = TABLERO.filtros.dia;
  return '<div class="columnas" role="group" aria-label="Evaluaciones por día">' + dias.map((d) => {
    const c = cuentas.get(d);
    return '<button type="button" class="col' + (activo && activo !== d ? ' tenue' : '') + '" data-filtro="dia" data-valor="' + d + '" aria-pressed="' + (activo === d) + '"' +
      ' title="' + esc(FILTROS_TABLERO.dia.nombre(d)) + ': ' + c + '"' + (c ? '' : ' disabled') + '>' +
      '<span style="height:' + (c ? Math.max(6, Math.round(100 * c / tope)) : 0) + '%"></span></button>';
  }).join('') + '</div><div class="columnas-eje"><span>hace ' + (n - 1) + ' días</span><span>hoy</span></div>';
}

function htmlFiltrosActivos() {
  const claves = Object.keys(TABLERO.filtros);
  if (!claves.length) return '<p class="c-nota filtros-ayuda">Toque una barra, un día o una cifra para filtrar todo el tablero.</p>';
  return '<div class="filtros-activos" aria-label="Filtros aplicados">' + claves.map((k) =>
    '<button type="button" class="chip-filtro" data-quitar="' + k + '" title="Quitar este filtro">' +
    '<span>' + esc(FILTROS_TABLERO[k].titulo) + ': <b>' + esc(etiquetaFiltro(k, TABLERO.filtros[k])) + '</b></span>' +
    '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>').join('') +
    (claves.length > 1 ? '<button type="button" class="btn-texto" data-quitar="todos">Quitar todos</button>' : '') + '</div>';
}

/** Las evaluaciones que quedan con los filtros, para abrir su ficha desde el tablero. */
function htmlListaTablero(lista) {
  if (!lista.length) return '<p class="c-nota">Ninguna evaluación cumple estos filtros.</p>';
  const orden = lista.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const filas = orden.slice(0, TABLERO.mostrar).map((e) =>
    '<li class="fila-eval">' + chipClasif(e.clasif) +
    '<span class="fila-eval-txt"><b>' + esc(e.direccion || 'Sin dirección') + '</b>' +
    '<span>' + esc([e.barrio, fechaBonita(e.fecha), e.evaluador].filter(Boolean).join(' · ')) + '</span></span>' +
    (e.ficha_url ? '<a class="btn-texto" target="_blank" rel="noopener" href="' + esc(e.ficha_url) + '">' + icono('documento') + 'Ficha</a>' : '<span class="c-nota">En cola</span>') +
    '</li>').join('');
  return '<ul class="lista-tablero">' + filas + '</ul>' +
    (orden.length > TABLERO.mostrar ? '<button type="button" class="btn-secundario btn-chico" data-mas>Ver ' + Math.min(20, orden.length - TABLERO.mostrar) + ' más (de ' + orden.length + ')</button>' : '');
}

function pintarTablero() {
  const base = evaluacionesDelPeriodo();
  const lista = aplicarFiltros(base);
  const por = (c) => lista.filter((e) => COLOR_CLASIF[e.clasif] === c).length;
  const fc = TABLERO.filtros.clasif;
  const cifra = (t, n, color, valor) => {
    const tocable = valor !== undefined;
    const marcada = tocable && valor && fc === valor;
    return '<' + (tocable ? 'button type="button"' : 'div') + ' class="cifra c-' + color + (marcada ? ' marcada' : '') + (fc && valor && !marcada ? ' tenue' : '') + '"' +
      (tocable ? ' data-cifra="' + valor + '" aria-pressed="' + !!marcada + '"' : '') + '><b>' + n + '</b><span>' + t + '</span></' + (tocable ? 'button' : 'div') + '>';
  };
  const selector = (clave, ops) => '<div class="chips">' + ops.map(([k, t]) =>
    '<button type="button" class="chip" data-tablero="' + clave + '" data-valor="' + k + '" aria-checked="' + (TABLERO[clave] === k) + '">' + t + '</button>').join('') + '</div>';

  const sinClasif = aplicarFiltros(base, 'clasif');
  const cuentaClasif = (c) => sinClasif.filter((e) => e.clasif === c).length;
  const niveles = Esquema.LISTAS.nivel_dano.map(([v]) => [v, aplicarFiltros(base, 'nivel').filter((e) => e.nivel === v).length]);

  $('#tablero-cuerpo').innerHTML =
    '<div class="tablero-filtros">' + selector('periodo', PERIODOS) +
    selector('quien', [['todas', 'Todo el equipo'], ['mias', 'Solo las mías']]) + '</div>' +
    htmlFiltrosActivos() +
    '<div class="cifras">' +
    cifra('Evaluadas', lista.length, '', '') +
    cifra('No habitables', por('rojo'), 'rojo', 'no_habitable') +
    cifra('Uso restringido', por('amarillo'), 'amarillo', 'uso_restringido') +
    cifra('Habitables', por('verde'), 'verde', 'habitable') +
    '<button type="button" class="cifra c-azul" data-ir-por-evaluar title="Ver la lista de visitas por evaluar"><b>' + solicitudesPendientes().length + '</b><span>Por evaluar</span></button>' +
    '</div>' +
    '<div class="paneles">' +
    '<section class="panel panel-ancho"><h3>Mapa de las evaluaciones</h3><div id="mapa-tablero" class="mapa-tablero"></div>' +
    '<p class="c-nota" id="mapa-tablero-nota"></p></section>' +
    '<section class="panel"><h3>Habitabilidad</h3>' + barras('clasif', [
      ['no_habitable', cuentaClasif('no_habitable'), 'var(--rojo)'], ['uso_restringido', cuentaClasif('uso_restringido'), 'var(--amarillo)'],
      ['habitable', cuentaClasif('habitable'), 'var(--verde)']]) + '</section>' +
    '<section class="panel"><h3>Nivel de daño</h3>' + barras('nivel', niveles, 'var(--azul)') + '</section>' +
    '<section class="panel panel-ancho"><h3>Evaluaciones por día</h3>' + porDia(aplicarFiltros(base, 'dia')) + '</section>' +
    '<section class="panel"><h3>Barrios / veredas con más evaluaciones</h3>' + barras('barrio', conElegido('barrio', contar(aplicarFiltros(base, 'barrio'), 'barrio'), 8), 'var(--azul)') + '</section>' +
    '<section class="panel"><h3>Por evaluador</h3>' + barras('evaluador', conElegido('evaluador', contar(aplicarFiltros(base, 'evaluador'), 'evaluador'), 10), 'var(--inst-verde)') + '</section>' +
    '<section class="panel panel-ancho"><h3>Evaluaciones' + (Object.keys(TABLERO.filtros).length ? ' filtradas' : '') + ' (' + lista.length + ')</h3>' + htmlListaTablero(lista) + '</section>' +
    '</div><p class="c-nota centro">Corte: ' + esc(estadoDeConexion()) + '</p>';
  pintarMapaTablero(lista);
}

/** Los primeros N, pero sin perder de vista el elegido aunque quede más abajo. */
function conElegido(clave, datos, n) {
  const top = datos.slice(0, n);
  const elegido = TABLERO.filtros[clave];
  if (elegido && !top.some((d) => d[0] === elegido)) {
    const d = datos.find((x) => x[0] === elegido);
    top.push(d || [elegido, 0]);
  }
  return top;
}

/**
 * Mapa del tablero: las MISMAS evaluaciones que cuentan las cifras (periodo,
 * "todo el equipo / solo las mías" y filtros de las gráficas), con su color.
 */
function pintarMapaTablero(lista) {
  const div = $('#mapa-tablero');
  if (!div) return;
  if (TABLERO.mapa) { TABLERO.mapa.remove(); TABLERO.mapa = null; }
  if (typeof L === 'undefined') { div.innerHTML = '<p class="vacio">No se pudo cargar el mapa.</p>'; return; }
  const conPunto = lista.filter((e) => Esquema.coordenadaValida(e.lat, e.lon));
  $('#mapa-tablero-nota').textContent = conPunto.length === lista.length
    ? conPunto.length + ' evaluaciones en el mapa.'
    : conPunto.length + ' de ' + lista.length + ' evaluaciones tienen ubicación.';
  const m = L.map(div, { zoomControl: true, scrollWheelZoom: false }).setView([4.8133, -75.6961], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  conPunto.forEach((e) => {
    const color = COLOR_PUNTO[COLOR_CLASIF[e.clasif] || 'sin'];
    L.circleMarker([+e.lat, +e.lon], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 })
      .bindPopup(htmlPopup({ tipo: 'evaluada', h: e }), { maxWidth: 260 }).addTo(m);
  });
  if (conPunto.length) m.fitBounds(L.latLngBounds(conPunto.map((e) => [+e.lat, +e.lon])), { padding: [24, 24], maxZoom: 16 });
  TABLERO.mapa = m;
  // Si en esos 60 ms se tocó otro filtro, este mapa ya se borró: no se toca (daba error en la consola).
  setTimeout(() => { if (TABLERO.mapa === m) m.invalidateSize(); }, 60);
}

/** Pone o quita un filtro y vuelve a dibujar, sin que la pantalla salte. */
function alternarFiltro(clave, valor) {
  if (TABLERO.filtros[clave] === valor) delete TABLERO.filtros[clave];
  else TABLERO.filtros[clave] = valor;
  TABLERO.mostrar = 20;
  repintarTableroEnSuSitio();
}

function repintarTableroEnSuSitio() {
  const y = window.scrollY;
  pintarTablero();
  window.scrollTo(0, y);
}

function enlazarTablero() {
  $('#tablero-cuerpo').addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.tablero) { TABLERO[t.dataset.tablero] = t.dataset.valor; repintarTableroEnSuSitio(); }
    else if (t.dataset.filtro) alternarFiltro(t.dataset.filtro, t.dataset.valor);
    else if (t.dataset.cifra !== undefined) {
      if (t.dataset.cifra) alternarFiltro('clasif', t.dataset.cifra);
      else { TABLERO.filtros = {}; TABLERO.mostrar = 20; repintarTableroEnSuSitio(); }      // "Evaluadas" = ver todo
    } else if (t.dataset.quitar) {
      if (t.dataset.quitar === 'todos') TABLERO.filtros = {};
      else delete TABLERO.filtros[t.dataset.quitar];
      repintarTableroEnSuSitio();
    } else if (t.hasAttribute('data-mas')) { TABLERO.mostrar += 20; repintarTableroEnSuSitio(); }
    else if (t.hasAttribute('data-ir-por-evaluar')) { APP.pestana = 'porEvaluar'; irAVista('lista'); }
  });
}
