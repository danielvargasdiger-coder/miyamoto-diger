/* =========================================================================
   TABLERO — resumen de lo evaluado. Se arma con lo que el celular ya tiene
   (abre al instante y funciona sin señal, con el corte de la última
   sincronización). Gráficas en HTML a mano: una librería pesaría más que
   toda la app.
   ========================================================================= */
'use strict';

const TABLERO = { periodo: '30', quien: 'todas' };
const PERIODOS = [['7', '7 días'], ['30', '30 días'], ['todo', 'Todo']];

function evaluacionesConocidas() {
  const vistos = new Set(), r = [];
  APP.cola.forEach((c) => { vistos.add(c.id); r.push(Object.assign({ id: c.id, enCola: true }, resumenDeDatos(c.datos))); });
  (APP.enviadasLocal || []).concat(APP.historial).forEach((h) => { if (!vistos.has(h.id)) { vistos.add(h.id); r.push(h); } });
  return r;
}

function evaluacionesDelTablero() {
  const dias = TABLERO.periodo === 'todo' ? null : Number(TABLERO.periodo);
  const desde = dias ? Date.now() - dias * 86400000 : 0;
  const yo = Esquema.normalizarTexto(APP.perfil && APP.perfil.nombre);
  return evaluacionesConocidas().filter((e) => {
    if (desde && !(new Date(e.fecha).getTime() >= desde)) return false;
    if (TABLERO.quien === 'mias' && Esquema.normalizarTexto(e.evaluador) !== yo) return false;
    return true;
  });
}

function contar(lista, saca) {
  const m = new Map();
  lista.forEach((x) => { const k = saca(x) || 'Sin dato'; m.set(k, (m.get(k) || 0) + 1); });
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

/** Barras horizontales. datos: [[etiqueta, n, color?]] */
function barras(datos, colorBase) {
  if (!datos.length) return '<p class="c-nota">Sin datos en este periodo.</p>';
  const tope = Math.max.apply(null, datos.map((d) => d[1])) || 1;
  return '<div class="barras">' + datos.map(([et, n, color]) =>
    '<div class="barra-fila"><span class="barra-et">' + esc(et) + '</span>' +
    '<span class="barra-pista"><span class="barra" style="width:' + Math.max(2, Math.round(100 * n / tope)) + '%;background:' + (color || colorBase) + '"></span></span>' +
    '<span class="barra-n">' + n + '</span></div>').join('') + '</div>';
}

/** Columnas por día de los últimos N días (máx. 30). */
function porDia(lista) {
  const n = TABLERO.periodo === '7' ? 7 : 30;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const cuentas = new Array(n).fill(0);
  lista.forEach((e) => {
    const f = new Date(e.fecha); if (isNaN(f)) return;
    f.setHours(0, 0, 0, 0);
    const i = n - 1 - Math.round((hoy - f) / 86400000);
    if (i >= 0 && i < n) cuentas[i]++;
  });
  const tope = Math.max.apply(null, cuentas) || 1;
  return '<div class="columnas" role="img" aria-label="Evaluaciones por día">' + cuentas.map((c, i) => {
    const d = new Date(hoy.getTime() - (n - 1 - i) * 86400000);
    return '<span class="col" title="' + d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) + ': ' + c + '">' +
      '<span style="height:' + (c ? Math.max(6, Math.round(100 * c / tope)) : 0) + '%"></span></span>';
  }).join('') + '</div><div class="columnas-eje"><span>hace ' + (n - 1) + ' días</span><span>hoy</span></div>';
}

function pintarTablero() {
  const lista = evaluacionesDelTablero();
  const por = (c) => lista.filter((e) => COLOR_CLASIF[e.clasif] === c).length;
  const cifras = [
    ['Evaluadas', lista.length, ''],
    ['No habitables', por('rojo'), 'rojo'],
    ['Uso restringido', por('amarillo'), 'amarillo'],
    ['Habitables', por('verde'), 'verde'],
    ['Por evaluar', solicitudesPendientes().length, 'azul']
  ];
  const selector = (clave, ops) => '<div class="chips">' + ops.map(([k, t]) =>
    '<button type="button" class="chip" data-tablero="' + clave + '" data-valor="' + k + '" aria-checked="' + (TABLERO[clave] === k) + '">' + t + '</button>').join('') + '</div>';

  $('#tablero-cuerpo').innerHTML =
    '<div class="tablero-filtros">' + selector('periodo', PERIODOS) +
    selector('quien', [['todas', 'Todo el equipo'], ['mias', 'Solo las mías']]) + '</div>' +
    '<div class="cifras">' + cifras.map(([t, n, c]) => '<div class="cifra c-' + c + '"><b>' + n + '</b><span>' + t + '</span></div>').join('') + '</div>' +
    '<div class="paneles">' +
    '<section class="panel"><h3>Habitabilidad</h3>' + barras([
      ['No habitable', por('rojo'), 'var(--rojo)'], ['Uso restringido', por('amarillo'), 'var(--amarillo)'],
      ['Habitable', por('verde'), 'var(--verde)']].filter((x) => x[1] || lista.length === 0)) + '</section>' +
    '<section class="panel"><h3>Nivel de daño</h3>' + barras(contar(lista, (e) => e.nivel && Esquema.etiquetaDe('nivel_dano', e.nivel)), 'var(--azul)') + '</section>' +
    '<section class="panel panel-ancho"><h3>Evaluaciones por día</h3>' + porDia(lista) + '</section>' +
    '<section class="panel"><h3>Barrios / veredas con más evaluaciones</h3>' + barras(contar(lista, (e) => e.barrio).slice(0, 8), 'var(--azul)') + '</section>' +
    '<section class="panel"><h3>Por evaluador</h3>' + barras(contar(lista, (e) => e.evaluador).slice(0, 10), 'var(--inst-verde)') + '</section>' +
    '</div><p class="c-nota centro">Corte: ' + esc(estadoDeConexion()) + '</p>';
}

function enlazarTablero() {
  $('#tablero-cuerpo').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tablero]');
    if (!b) return;
    TABLERO[b.dataset.tablero] = b.dataset.valor;
    pintarTablero();
  });
}
