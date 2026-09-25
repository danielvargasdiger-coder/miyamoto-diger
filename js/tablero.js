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

/**
 * (24/09) Entra mostrando TODAS las evaluaciones: desde/hasta en blanco es
 * "todo". Se quitaron los atajos de 7 y 30 días; quien quiera un periodo lo
 * escoge en el calendario. Evaluador y barrio son de selección MÚLTIPLE:
 * lista vacía = todos.
 */
const TABLERO = { desde: '', hasta: '', evaluadores: [], barrios: [], mapa: null, mapaGrande: null, filtros: {}, mostrar: 20 };
const VACIO = '__vacio__';

/** Gráficas cuyo filtro es una lista de varios, no un solo valor. */
const MULTI = { barrio: 'barrios', evaluador: 'evaluadores' };
const seleccionDe = (clave) => (MULTI[clave] ? TABLERO[MULTI[clave]] : null);

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

/**
 * Fechas escogidas, o ['',''] si no se ha tocado el calendario (= todas).
 * Si alguien pone el "desde" después del "hasta", se voltean en vez de dejar
 * el tablero vacío sin explicación.
 */
function rangoDeFechas() {
  const a = TABLERO.desde, b = TABLERO.hasta;
  if (a && b && a > b) return [b, a];
  return [a, b];
}

/** El rango de fechas de arriba y el buscador. Lo demás son filtros cruzados. */
function evaluacionesDelPeriodo() {
  const [desde, hasta] = rangoDeFechas();
  return evaluacionesConocidas().filter((e) => {
    if (!coincideEvaluacion(e)) return false;
    if (desde || hasta) {
      const d = diaDe(e.fecha);
      if (!d) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
    }
    return true;
  });
}

/**
 * Aplica los filtros cruzados, menos el que se indique (para poder dibujar esa
 * gráfica con todas sus opciones). Los de selección múltiple pasan si la lista
 * está vacía (= todos) o si el valor está entre los escogidos.
 */
function aplicarFiltros(lista, salvo) {
  const claves = Object.keys(FILTROS_TABLERO);
  return lista.filter((e) => claves.every((k) => {
    if (k === salvo) return true;
    const v = FILTROS_TABLERO[k].valor(e) || VACIO;
    const sel = seleccionDe(k);
    if (sel) return !sel.length || sel.indexOf(v) !== -1;
    return TABLERO.filtros[k] === undefined || v === TABLERO.filtros[k];
  }));
}

/** ¿Está puesto este valor? Sirve igual para los de uno y los de varios. */
function filtroActivo(clave, valor) {
  const sel = seleccionDe(clave);
  return sel ? sel.indexOf(valor) !== -1 : TABLERO.filtros[clave] === valor;
}

/** Valores escogidos de una gráfica, para atenuar las demás barras. */
function hayFiltroDe(clave) {
  const sel = seleccionDe(clave);
  return sel ? sel.length > 0 : TABLERO.filtros[clave] !== undefined;
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
  const hayAlguno = hayFiltroDe(clave);
  return '<div class="barras">' + datos.map(([valor, n, color]) => {
    const et = etiquetaFiltro(clave, valor);
    const marcada = filtroActivo(clave, valor);
    return '<button type="button" class="barra-fila' + (hayAlguno && !marcada ? ' tenue' : '') + '" data-filtro="' + clave + '" data-valor="' + esc(valor) + '"' +
      ' aria-pressed="' + marcada + '" title="' + esc((marcada ? 'Quitar filtro: ' : 'Filtrar por: ') + et) + '"' +
      // En 0 no se deja tocar: el tablero quedaría vacío sin explicación.
      (!n && !marcada ? ' disabled' : '') + '>' +
      '<span class="barra-et">' + esc(et) + '</span>' +
      '<span class="barra-pista"><span class="barra" style="width:' + (n ? Math.max(2, Math.round(100 * n / tope)) : 0) + '%;background:' + (color || colorBase) + '"></span></span>' +
      '<span class="barra-n">' + n + '</span></button>';
  }).join('') + '</div>';
}

/**
 * Columnas por día. Toma los días del rango escogido; si no se escogió ninguno,
 * desde la primera evaluación hasta hoy. Tope de 62 columnas para que se puedan
 * tocar con el dedo. Cada día se toca para filtrar.
 */
function porDia(lista) {
  const [a, b] = rangoDeFechas();
  let fin = b ? new Date(b + 'T12:00') : new Date();
  fin.setHours(12, 0, 0, 0);
  let inicio = a;
  if (!inicio) {
    const dias0 = lista.map((e) => diaDe(e.fecha)).filter(Boolean).sort();
    inicio = dias0[0] || diaDe(fin);
  }
  let n = Math.round((fin - new Date(inicio + 'T12:00')) / 86400000) + 1;
  n = Math.max(1, Math.min(62, n));
  const dias = [];
  for (let i = n - 1; i >= 0; i--) dias.push(diaDe(new Date(fin.getTime() - i * 86400000)));
  const cuentas = new Map(dias.map((d) => [d, 0]));
  lista.forEach((e) => { const d = diaDe(e.fecha); if (cuentas.has(d)) cuentas.set(d, cuentas.get(d) + 1); });
  const tope = Math.max.apply(null, Array.from(cuentas.values())) || 1;
  const activo = TABLERO.filtros.dia;
  return '<div class="columnas" role="group" aria-label="Evaluaciones por día">' + dias.map((d) => {
    const c = cuentas.get(d);
    return '<button type="button" class="col' + (activo && activo !== d ? ' tenue' : '') + '" data-filtro="dia" data-valor="' + d + '" aria-pressed="' + (activo === d) + '"' +
      ' title="' + esc(FILTROS_TABLERO.dia.nombre(d)) + ': ' + c + '"' + (c ? '' : ' disabled') + '>' +
      '<span style="height:' + (c ? Math.max(6, Math.round(100 * c / tope)) : 0) + '%"></span></button>';
  }).join('') + '</div><div class="columnas-eje"><span>' + esc(FILTROS_TABLERO.dia.nombre(dias[0])) + '</span><span>' +
    esc(FILTROS_TABLERO.dia.nombre(dias[dias.length - 1])) + '</span></div>';
}

/** Los filtros puestos, cada uno con su X. Los de varios valores salen uno por uno. */
function htmlFiltrosActivos() {
  const chips = [];
  const equis = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  Object.keys(TABLERO.filtros).forEach((k) => {
    chips.push('<button type="button" class="chip-filtro" data-quitar="' + k + '" title="Quitar este filtro">' +
      '<span>' + esc(FILTROS_TABLERO[k].titulo) + ': <b>' + esc(etiquetaFiltro(k, TABLERO.filtros[k])) + '</b></span>' + equis + '</button>');
  });
  Object.keys(MULTI).forEach((k) => {
    TABLERO[MULTI[k]].forEach((v) => {
      chips.push('<button type="button" class="chip-filtro" data-filtro="' + k + '" data-valor="' + esc(v) + '" title="Quitar este filtro">' +
        '<span>' + esc(FILTROS_TABLERO[k].titulo) + ': <b>' + esc(etiquetaFiltro(k, v)) + '</b></span>' + equis + '</button>');
    });
  });
  if (!chips.length) return '<p class="c-nota filtros-ayuda">Toque una barra, un día o una cifra para filtrar todo el tablero.</p>';
  return '<div class="filtros-activos" aria-label="Filtros aplicados">' + chips.join('') +
    (chips.length > 1 ? '<button type="button" class="btn-texto" data-quitar="todos">Quitar todos</button>' : '') + '</div>';
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
  const niveles = Esquema.LISTAS.nivel_dano.map(([v]) => [v, aplicarFiltros(base, 'nivel').filter((e) => e.nivel === v).length]);

  $('#tablero-cuerpo').innerHTML =
    htmlFiltrosTablero(base) +
    (APP.busqueda ? '<p class="c-nota filtros-ayuda">Mostrando solo lo que coincide con «' + esc(APP.busqueda) + '» (buscador de arriba).</p>' : '') +
    htmlFiltrosActivos() +
    '<div class="cifras">' +
    cifra('Evaluadas', lista.length, '', '') +
    cifra('No habitables', por('rojo'), 'rojo', 'no_habitable') +
    cifra('Uso restringido', por('amarillo'), 'amarillo', 'uso_restringido') +
    cifra('Habitables', por('verde'), 'verde', 'habitable') +
    '<button type="button" class="cifra c-azul" data-ir-por-evaluar title="Ver la lista de visitas por evaluar"><b>' + solicitudesPendientes().length + '</b><span>Por evaluar</span></button>' +
    '</div>' +
    // El mapa manda: va a todo el ancho, que es como se aprovecha que Pereira
    // se extiende de lado a lado (24/09).
    '<section class="panel panel-mapa"><h3>Mapa de las evaluaciones</h3>' +
    '<div id="mapa-tablero" class="mapa-tablero"></div>' +
    '<div class="mapa-pie"><p class="c-nota" id="mapa-tablero-nota"></p>' +
    '<button type="button" class="btn-secundario btn-chico" data-mapa-grande>' + icono('ubicacion') + 'Ver el mapa completo</button></div></section>' +
    '<div class="paneles">' +
    '<section class="panel panel-ancho"><h3>Evaluaciones por día</h3>' + porDia(aplicarFiltros(base, 'dia')) + '</section>' +
    '<section class="panel"><h3>Barrios / veredas con más evaluaciones</h3>' + barras('barrio', conElegido('barrio', contar(aplicarFiltros(base, 'barrio'), 'barrio'), 8), 'var(--azul)') + '</section>' +
    '<section class="panel"><h3>Nivel de daño</h3>' + barras('nivel', niveles, 'var(--azul)') + '</section>' +
    '<section class="panel"><h3>Por evaluador</h3>' + barras('evaluador', conElegido('evaluador', contar(aplicarFiltros(base, 'evaluador'), 'evaluador'), 10), 'var(--inst-verde)') + '</section>' +
    '<section class="panel panel-ancho"><h3>Evaluaciones' + (hayAlgunFiltro() ? ' filtradas' : '') + ' (' + lista.length + ')</h3>' + htmlListaTablero(lista) + '</section>' +
    '</div><p class="c-nota centro">Corte: ' + esc(estadoDeConexion()) + '</p>';
  pintarMapaTablero(lista);
}

function hayAlgunFiltro() {
  return Object.keys(TABLERO.filtros).length > 0 || TABLERO.barrios.length > 0 || TABLERO.evaluadores.length > 0;
}

/** Fechas, evaluador y barrio/vereda. Los dos últimos, de selección múltiple. */
function htmlFiltrosTablero(base) {
  const [a, b] = rangoDeFechas(), hoy = diaDe(new Date());
  const resumen = (lista, singular) => (!lista.length ? 'Todos' : lista.length === 1 ? etiquetaFiltro(singular, lista[0]) : lista.length + ' escogidos');
  const boton = (clave, titulo, lista, singular) =>
    '<button type="button" class="filtro-multi' + (lista.length ? ' puesto' : '') + '" data-abrir-multi="' + clave + '">' +
    '<span class="filtro-et">' + titulo + '</span><span class="filtro-val">' + esc(resumen(lista, singular)) + '</span>' +
    icono('derecha') + '</button>';
  return '<div class="tablero-filtros">' +
    '<div class="rango-fechas"><label>Desde<input type="date" data-rango="desde" value="' + a + '" max="' + hoy + '"></label>' +
    '<label>Hasta<input type="date" data-rango="hasta" value="' + b + '" max="' + hoy + '"></label></div>' +
    boton('evaluador', 'Evaluador', TABLERO.evaluadores, 'evaluador') +
    boton('barrio', 'Barrio/vereda', TABLERO.barrios, 'barrio') +
    (a || b || hayAlgunFiltro() ? '<button type="button" class="btn-texto btn-chico" data-limpiar-todo>Quitar todos los filtros</button>' : '') +
    '</div>';
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
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true }).addTo(m);
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

/**
 * Pone o quita un filtro y vuelve a dibujar, sin que la pantalla salte.
 * Evaluador y barrio admiten varios a la vez; los demás, uno solo.
 */
function alternarFiltro(clave, valor) {
  const sel = seleccionDe(clave);
  if (sel) {
    const i = sel.indexOf(valor);
    if (i === -1) sel.push(valor); else sel.splice(i, 1);
  } else if (TABLERO.filtros[clave] === valor) delete TABLERO.filtros[clave];
  else TABLERO.filtros[clave] = valor;
  TABLERO.mostrar = 20;
  repintarTableroEnSuSitio();
}

/**
 * Selector de varios (evaluador o barrio/vereda) a pantalla completa, con
 * buscador. A pantalla completa y no un desplegable: en el celular una lista
 * de 500 barrios dentro de un <select> es imposible de usar.
 */
function abrirSelectorMulti(clave) {
  const lista = seleccionDe(clave);
  if (!lista) return;
  const titulo = FILTROS_TABLERO[clave].titulo;
  const opciones = contar(aplicarFiltros(evaluacionesDelPeriodo(), clave), clave);
  const caja = document.createElement('div');
  caja.className = 'pantalla selector-zona selector-multi';
  caja.innerHTML =
    '<div class="topbar"><button type="button" class="btn-icono" data-cerrar aria-label="Volver">' + icono('atras') + '</button>' +
    '<div class="topbar-titulo"><b>' + esc(titulo) + '</b><span id="multi-cuenta"></span></div>' +
    '<button type="button" class="btn-icono" data-limpiar aria-label="Quitar todos">' + icono('basura') + '</button></div>' +
    '<div class="selector-buscar"><input type="search" id="multi-filtro" placeholder="Buscar…" autocomplete="off"></div>' +
    '<div class="selector-lista" id="multi-lista"></div>' +
    '<div class="selector-pie"><button type="button" class="btn-principal" data-cerrar>Listo</button></div>';
  document.body.appendChild(caja);
  document.body.classList.add('sin-scroll');

  const cuenta = () => {
    $('#multi-cuenta', caja).textContent = !lista.length ? 'Todos'
      : lista.length === 1 ? '1 escogido' : lista.length + ' escogidos';
  };
  const pintar = (texto) => {
    const t = Esquema.normalizarTexto(texto || '');
    const vistos = opciones.filter(([v]) => !t || Esquema.normalizarTexto(etiquetaFiltro(clave, v)).indexOf(t) !== -1);
    cuenta();
    $('#multi-lista', caja).innerHTML = vistos.length
      ? vistos.map(([v, n]) => '<button type="button" class="selector-item' + (lista.indexOf(v) !== -1 ? ' elegido' : '') +
        '" data-valor="' + esc(v) + '"><span>' + esc(etiquetaFiltro(clave, v)) + '</span><span class="multi-n">' + n + '</span></button>').join('')
      : '<p class="selector-vacio">Nada con ese nombre.</p>';
  };
  pintar('');

  caja.addEventListener('input', (ev) => { if (ev.target.id === 'multi-filtro') pintar(ev.target.value); });
  caja.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-cerrar')) { cerrarSelectorMulti(caja); return; }
    if (t.hasAttribute('data-limpiar')) { lista.length = 0; pintar($('#multi-filtro', caja).value); repintarTableroEnSuSitio(); return; }
    if (t.dataset.valor === undefined) return;
    const v = t.dataset.valor, i = lista.indexOf(v);
    if (i === -1) lista.push(v); else lista.splice(i, 1);
    TABLERO.mostrar = 20;
    // Solo se marca el que tocó: repintar la lista entera la hacía saltar
    // justo cuando iba a tocar el siguiente (escoger varios era una pelea).
    t.classList.toggle('elegido', i === -1);
    cuenta();
    repintarTableroEnSuSitio();
  });
}

function cerrarSelectorMulti(caja) {
  caja.remove();
  if ($('#vista-menu').hidden && $('#vista-ficha').hidden) document.body.classList.remove('sin-scroll');
}

/**
 * El mapa a pantalla completa, con las mismas evaluaciones que se están viendo.
 * En el celular el mapa del tablero es bajito para poder bajar con el pulgar, y
 * en el PC igual queda corto para mirar de cerca: este botón es la salida.
 */
function abrirMapaGrande() {
  const lista = evaluacionesDelTablero();
  const caja = document.createElement('div');
  caja.className = 'pantalla mapa-pantalla';
  caja.innerHTML =
    '<div class="topbar"><button type="button" class="btn-icono" data-cerrar aria-label="Volver">' + icono('atras') + '</button>' +
    '<div class="topbar-titulo"><b>Mapa de las evaluaciones</b><span>' + lista.length + (lista.length === 1 ? ' evaluación' : ' evaluaciones') + '</span></div></div>' +
    '<div id="mapa-grande" class="mapa-grande"></div>';
  document.body.appendChild(caja);
  document.body.classList.add('sin-scroll');
  caja.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-cerrar]')) {
      if (TABLERO.mapaGrande) { TABLERO.mapaGrande.remove(); TABLERO.mapaGrande = null; }
      caja.remove();
      if ($('#vista-menu').hidden && $('#vista-ficha').hidden) document.body.classList.remove('sin-scroll');
    }
  });
  if (typeof L === 'undefined') { $('#mapa-grande', caja).innerHTML = '<p class="vacio">No se pudo cargar el mapa.</p>'; return; }
  const conPunto = lista.filter((e) => Esquema.coordenadaValida(e.lat, e.lon));
  const m = L.map($('#mapa-grande', caja), { zoomControl: true }).setView([4.8133, -75.6961], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true }).addTo(m);
  conPunto.forEach((e) => {
    L.circleMarker([+e.lat, +e.lon], { radius: 8, color: '#fff', weight: 2, fillColor: COLOR_PUNTO[COLOR_CLASIF[e.clasif] || 'sin'], fillOpacity: 0.95 })
      .bindPopup(htmlPopup({ tipo: 'evaluada', h: e }), { maxWidth: 260 }).addTo(m);
  });
  if (conPunto.length) m.fitBounds(L.latLngBounds(conPunto.map((e) => [+e.lat, +e.lon])), { padding: [30, 30], maxZoom: 17 });
  TABLERO.mapaGrande = m;
  setTimeout(() => { if (TABLERO.mapaGrande === m) m.invalidateSize(); }, 60);
}

function repintarTableroEnSuSitio() {
  const y = window.scrollY;
  pintarTablero();
  window.scrollTo(0, y);
}

function enlazarTablero() {
  $('#tablero-cuerpo').addEventListener('change', (ev) => {
    const campo = ev.target.closest('[data-rango]');
    if (!campo) return;
    TABLERO[campo.dataset.rango] = campo.value;   // en blanco = sin tope por ese lado
    delete TABLERO.filtros.dia;                   // un día fuera del rango nuevo dejaría el tablero vacío
    repintarTableroEnSuSitio();
  });
  $('#tablero-cuerpo').addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.abrirMulti) abrirSelectorMulti(t.dataset.abrirMulti);
    else if (t.hasAttribute('data-mapa-grande')) abrirMapaGrande();
    else if (t.hasAttribute('data-limpiar-todo')) {
      TABLERO.desde = ''; TABLERO.hasta = ''; TABLERO.evaluadores = []; TABLERO.barrios = [];
      TABLERO.filtros = {}; TABLERO.mostrar = 20;
      repintarTableroEnSuSitio();
    } else if (t.dataset.filtro) alternarFiltro(t.dataset.filtro, t.dataset.valor);
    else if (t.dataset.cifra !== undefined) {
      if (t.dataset.cifra) alternarFiltro('clasif', t.dataset.cifra);
      else { TABLERO.filtros = {}; TABLERO.mostrar = 20; repintarTableroEnSuSitio(); }      // "Evaluadas" = ver todo
    } else if (t.dataset.quitar) {
      if (t.dataset.quitar === 'todos') { TABLERO.filtros = {}; TABLERO.evaluadores = []; TABLERO.barrios = []; }
      else delete TABLERO.filtros[t.dataset.quitar];
      repintarTableroEnSuSitio();
    } else if (t.hasAttribute('data-mas')) { TABLERO.mostrar += 20; repintarTableroEnSuSitio(); }
    else if (t.hasAttribute('data-ir-por-evaluar')) { APP.pestana = 'porEvaluar'; irAVista('lista'); }
  });
}
