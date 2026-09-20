/* =========================================================================
   INICIO — pestañas "Por evaluar", "Borradores" y "Enviadas".
   Los borradores tienen su propia pestaña desde el principio (en taludes
   se mezclaban con "Por visitar" y la lista se volvió inservible).
   ========================================================================= */
'use strict';

async function recargarLocales() {
  APP.borradores = (await DB.todos('borradores')).sort((a, b) => (b.modificado || '').localeCompare(a.modificado || ''));
  APP.cola = (await DB.todos('cola')).sort((a, b) => (b.encolado || '').localeCompare(a.encolado || ''));
  APP.enviadasLocal = (await DB.leerKV('enviadasLocal')) || [];
}

/** Solicitudes que todavía nadie evaluó (ni en el servidor, ni en cola, ni empezadas aquí). */
function solicitudesSinEvaluar() {
  const hechas = new Set();
  APP.historial.forEach((h) => h.id_solicitud && hechas.add(h.id_solicitud));
  (APP.enviadasLocal || []).forEach((h) => h.id_solicitud && hechas.add(h.id_solicitud));
  APP.cola.forEach((c) => c.datos.id_solicitud && hechas.add(c.datos.id_solicitud));
  return APP.solicitudes.filter((s) => !hechas.has(s.id_solicitud));
}

/**
 * Solo las visitas asignadas a esta persona (DIGER, 19/09: sin selector
 * "Todas"). Si el servidor todavía no marca las asignadas (versión vieja,
 * sin para_mi), se muestran todas: si no, la lista quedaría vacía.
 */
function servidorMarcaAsignadas() { return APP.solicitudes.some((s) => 'para_mi' in s); }

function solicitudesPendientes() {
  const lista = solicitudesSinEvaluar();
  return servidorMarcaAsignadas() ? lista.filter((s) => s.para_mi) : lista;
}

function borradorDeSolicitud(idSol) {
  return APP.borradores.find((b) => b.datos && b.datos.id_solicitud === idSol);
}

/** Lista, mapa o tablero: los tres viven bajo la misma barra (una app homogénea, como taludes). */
function irAVista(vista) {
  APP.vista = vista;
  $('#panel-lista').hidden = vista !== 'lista';
  $('#panel-mapa').hidden = vista !== 'mapa';
  $('#panel-tablero').hidden = vista !== 'tablero';
  $('#btn-nueva').hidden = vista === 'tablero';
  $$('[data-vista]').forEach((b) => { if (b.dataset.vista === vista) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  pintarInicio();
  if (vista === 'mapa') abrirMapa();
}

function pintarInicio() {
  if (!APP.perfil) return;
  if (APP.vista === 'mapa') pintarMapa();
  if (APP.vista === 'tablero') pintarTablero();
  const pend = solicitudesPendientes().filter(coincideSolicitud);
  const cuentas = { porEvaluar: pend.length, borradores: borradoresVisibles().length, enviadas: enviadasVisibles().length };
  $$('.pestana').forEach((b) => {
    const activa = b.dataset.pestana === APP.pestana;
    b.setAttribute('aria-selected', activa);
    b.querySelector('.cuenta').textContent = cuentas[b.dataset.pestana];
  });
  const lista = $('#lista');
  if (APP.pestana === 'porEvaluar') lista.innerHTML = htmlPorEvaluar(pend);
  else if (APP.pestana === 'borradores') lista.innerHTML = htmlBorradores();
  else lista.innerHTML = htmlEnviadas();
  pintarConexion();
}

function vacioHtml(titulo, texto) {
  return '<div class="vacio">' + icono('edificio') + '<b>' + esc(titulo) + '</b><p>' + esc(texto) + '</p></div>';
}

function htmlPorEvaluar(pend) {
  if (!pend.length && APP.busqueda) return vacioBusqueda();
  if (!pend.length) {
    return vacioHtml('No tiene visitas asignadas',
      'Aquí aparecen las visitas que la DIGER le asigne. Para evaluar una edificación que no está en la lista, toque el botón +.');
  }
  const orden = { 'ALTA': 0, 'MEDIA': 1, 'BAJA': 2 };
  pend = pend.slice().sort((a, b) => (b.para_mi ? 1 : 0) - (a.para_mi ? 1 : 0) || (orden[a.prioridad] ?? 3) - (orden[b.prioridad] ?? 3));
  return pend.map((s) => {
    const b = borradorDeSolicitud(s.id_solicitud);
    return '<article class="tarjeta">' +
      '<div class="t-cab"><span class="t-etiquetas"><span class="prioridad p-' + esc((s.prioridad || '').toLowerCase()) + '">' + esc(s.prioridad || 'Sin prioridad') + '</span>' +
      (s.para_mi ? '<span class="asignada">' + icono('check') + 'Asignada a usted</span>' : '') + '</span>' +
      '<span class="t-id">' + esc(s.id_solicitud) + '</span></div>' +
      '<h3>' + esc(s.direccion || 'Sin dirección') + '</h3>' +
      '<p class="t-lugar">' + esc([s.barrio, s.municipio].filter(Boolean).join(' · ')) + '</p>' +
      (s.descripcion ? '<p class="t-desc">' + esc(s.descripcion) + '</p>' : '') +
      '<div class="t-pie"><span class="t-enlaces">' +
      (s.telefono ? '<a class="btn-texto" href="tel:' + esc(String(s.telefono).replace(/\s/g, '')) + '">' + icono('telefono') + esc(s.contacto || s.telefono) + '</a>' : '') +
      ((s.direccion || Esquema.coordenadaValida(s.lat, s.lon)) ? '<a class="btn-texto" target="_blank" rel="noopener" href="' + esc(urlComoLlegar(s)) + '">' + icono('ruta') + 'Cómo llegar</a>' : '') +
      '</span>' +
      (b ? '<button type="button" class="btn-principal btn-chico" data-continuar="' + esc(b.id) + '">' + icono('lapiz') + 'Continuar</button>'
        : '<button type="button" class="btn-principal btn-chico" data-evaluar="' + esc(s.id_solicitud) + '">Evaluar' + icono('derecha') + '</button>') +
      '</div></article>';
  }).join('');
}

function borradoresVisibles() {
  return APP.borradores.filter((b) => { const d = b.datos || {}; return coincideBusqueda(d.direccion, d.barrio_vereda, d.nombre_edificacion, d.id_solicitud, d.persona_contacto); });
}

/** Cola y enviadas (sin repetir), ya filtradas por la búsqueda. */
function enviadasVisibles() {
  const r = [];
  APP.cola.forEach((c) => { if (coincideBusqueda(c.num_formulario, c.datos.direccion, c.datos.barrio_vereda, c.datos.id_solicitud, c.datos.eval_nombre)) r.push({ cola: c }); });
  const vistos = new Set();
  (APP.enviadasLocal || []).concat(APP.historial).forEach((h) => {
    if (vistos.has(h.id)) return;
    vistos.add(h.id);
    if (coincideEvaluacion(h)) r.push({ h });
  });
  return r;
}

function vacioBusqueda() {
  return vacioHtml('Nada coincide con «' + APP.busqueda + '»', 'Revise lo escrito o borre la búsqueda (la X del buscador).');
}

function htmlBorradores() {
  const lista = borradoresVisibles();
  if (!lista.length && APP.busqueda) return vacioBusqueda();
  if (!lista.length) return vacioHtml('Sin borradores', 'Las evaluaciones que deje a medias quedan aquí, solo en este celular.');
  return lista.map((b) => {
    const d = b.datos || {};
    const faltan = Esquema.faltantes(d).length;
    return '<article class="tarjeta">' +
      '<div class="t-cab"><span class="etiqueta-borrador">' + icono('borrador') + 'Borrador</span><span class="t-id">' + esc(fechaBonita(b.modificado)) + '</span></div>' +
      '<h3>' + esc(d.direccion || d.nombre_edificacion || 'Sin dirección todavía') + '</h3>' +
      '<p class="t-lugar">' + esc([d.barrio_vereda, d.id_solicitud].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="t-desc">' + (faltan ? 'Faltan ' + faltan + ' datos' : 'Lista para enviar') + '</p>' +
      '<div class="t-pie"><button type="button" class="btn-texto peligro" data-descartar="' + esc(b.id) + '">' + icono('basura') + 'Descartar</button>' +
      '<button type="button" class="btn-principal btn-chico" data-continuar="' + esc(b.id) + '">' + icono('lapiz') + 'Continuar</button></div>' +
      '</article>';
  }).join('');
}

function chipClasif(clasif) {
  if (!clasif) return '';
  const color = COLOR_CLASIF[clasif] || Esquema.COLOR_DE_CLASIF[Esquema.codigoDe('habitabilidad', clasif)];
  return '<span class="clasif c-' + (color || '') + '">' + esc(NOMBRE_COLOR[color] || clasif) + '</span>';
}

function htmlEnviadas() {
  const partes = [];
  const items = enviadasVisibles();
  if (!items.length && APP.busqueda) return vacioBusqueda();
  items.filter((x) => x.cola).map((x) => x.cola).forEach((c) => {
    const d = c.datos;
    partes.push('<article class="tarjeta en-cola">' +
      '<div class="t-cab"><span class="etiqueta-cola">' + icono('sincronizar') + 'Por enviar</span>' + chipClasif(d.clasif_habitabilidad) + '</div>' +
      '<h3>' + esc(d.direccion || 'Sin dirección') + '</h3>' +
      '<p class="t-lugar">' + esc([d.barrio_vereda, c.num_formulario].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="t-desc">' + esc(c.error || 'Esperando señal') + (c.intentos ? ' · intento ' + c.intentos : '') + '</p>' +
      '<div class="t-pie"><span></span><button type="button" class="btn-secundario btn-chico" data-ver-cola="' + esc(c.id) + '">' + icono('documento') + 'Ver ficha</button></div>' +
      '</article>');
  });
  items.filter((x) => x.h).map((x) => x.h).forEach((h) => {
    partes.push('<article class="tarjeta">' +
      '<div class="t-cab"><span class="t-id">' + esc(h.num_formulario || '') + '</span>' + chipClasif(h.clasif) + '</div>' +
      '<h3>' + esc(h.direccion || 'Sin dirección') + '</h3>' +
      '<p class="t-lugar">' + esc([h.barrio, h.municipio].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="t-desc">' + esc([fechaBonita(h.fecha), h.evaluador].filter(Boolean).join(' · ')) + '</p>' +
      (h.ficha_url ? '<div class="t-pie"><button type="button" class="btn-texto" data-pdf="' + esc(h.id) + '">' + icono('descargar') + 'PDF</button>' +
        '<a class="btn-secundario btn-chico" data-ficha target="_blank" href="' + esc(h.ficha_url) + '">' + icono('documento') + 'Abrir ficha</a></div>' : '') +
      '</article>');
  });
  return partes.length ? partes.join('') : vacioHtml('Aún no hay evaluaciones enviadas', 'Aquí verá las suyas y las del equipo después de sincronizar.');
}

/**
 * Enlaces de ficha: se abren con window.open (sin rel=noopener) para que el
 * botón "Volver" de la ficha pueda CERRAR esa pestaña. Con target="_blank" a
 * secas el navegador no deja cerrarla y en el PC quedaban dos pestañas de la
 * app abiertas.
 */
function enlazarFichasEnPestana() {
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[data-ficha]');
    if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
    ev.preventDefault();
    window.open(a.href, '_blank');
  });
}

function enlazarInicio() {
  enlazarFichasEnPestana();
  $$('.pestana').forEach((b) => b.addEventListener('click', () => { APP.pestana = b.dataset.pestana; pintarInicio(); window.scrollTo(0, 0); }));
  $('#lista').addEventListener('click', async (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.evaluar) {
      const s = APP.solicitudes.find((x) => x.id_solicitud === t.dataset.evaluar);
      abrirEvaluacion({ solicitud: s });
    } else if (t.dataset.continuar) {
      abrirEvaluacion({ borrador: await DB.leer('borradores', t.dataset.continuar) });
    } else if (t.dataset.descartar) {
      const r = await preguntar('¿Descartar el borrador?', 'Se borra de este celular con sus fotos. No se puede deshacer.',
        [['si', 'Descartar', 'peligro'], ['no', 'Conservar', '']]);
      if (r === 'si') { await borrarBorrador(t.dataset.descartar); await recargarLocales(); pintarInicio(); }
    } else if (t.dataset.pdf) {
      descargarPdf(t.dataset.pdf, t);
    } else if (t.dataset.verCola) {
      const c = await DB.leer('cola', t.dataset.verCola);
      abrirVistaPreviaCola(c);
    }
  });
  $('#btn-nueva').addEventListener('click', () => abrirEvaluacion({}));
  $('#btn-sync').addEventListener('click', () => sincronizar(false));
}

/** La ficha de algo que está en cola: sus fotos siguen en el celular. */
async function abrirVistaPreviaCola(c) {
  // En la cola las fotos van por nombre; para la vista previa se vuelven a claves.
  const datos = Object.assign({}, c.datos);
  c.fotos.forEach((f) => { datos[f.campo] = (Array.isArray(datos[f.campo]) ? datos[f.campo] : []).map((n) => (n === f.nombre ? f.clave : n)); });
  if (datos.fecha_hora_inspeccion) datos.fecha_hora_inspeccion = ahoraLocal(new Date(datos.fecha_hora_inspeccion));
  abrirVistaPrevia(c.id, datos, 'Esta evaluación está en cola: todavía no ha llegado al servidor.');
}

// ---------------------------------------------------------------- INGRESO Y PERFIL
const CAMPOS_PERFIL = [
  ['nombre', 'Nombre completo', 'text', true],
  ['tipo_doc', 'Tipo de documento', 'doc', true],
  ['num_doc', 'Número de documento', 'numeric', true],
  ['matricula', 'Matrícula / tarjeta profesional', 'text', false]
];

// ---------------------------------------------------------------- ENTIDAD Y DEPENDENCIA
/**
 * Desplegables que se van acotando: la lista vive en la pestaña LISTAS de
 * la hoja y crece cuando alguien escribe una nueva con "Otra…". El
 * servidor la normaliza (tildes, mayúsculas, variantes marcadas por la
 * DIGER). Aquí se guarda la última lista conocida para trabajar sin señal.
 */
const OTRA = '__otra__';
const LISTAS_BASE = { entidades: [CONFIG.ENTIDAD_FICHA], dependencias: [{ valor: CONFIG.DEPENDENCIA, entidad: CONFIG.ENTIDAD_FICHA }] };
APP.listas = LISTAS_BASE;

async function cargarListas() {
  const guardadas = await DB.leerKV('listas');
  if (guardadas && guardadas.entidades) APP.listas = guardadas;
}

async function guardarListas(l) {
  if (!l || !Array.isArray(l.entidades)) return;
  APP.listas = l;
  await DB.guardarKV('listas', l);
}

/** Pide la lista al servidor (no necesita código). Sin señal, se queda con la guardada. */
async function refrescarListas() {
  try { const r = await api('listas', {}, 20000); await guardarListas(r.listas); } catch (e) { /* sin señal */ }
}

const mismaClave = (a, b) => Esquema.normalizarTexto(a) === Esquema.normalizarTexto(b);

function opcionesDe(valores, actual) {
  const hay = valores.some((v) => mismaClave(v, actual));
  return '<option value="">— Elegir —</option>' +
    valores.map((v) => '<option' + (mismaClave(v, actual) ? ' selected' : '') + '>' + esc(v) + '</option>').join('') +
    '<option value="' + OTRA + '"' + (actual && !hay ? ' selected' : '') + '>Otra… (escribirla)</option>';
}

function dependenciasDe(entidad) {
  return APP.listas.dependencias.filter((d) => !d.entidad || mismaClave(d.entidad, entidad)).map((d) => d.valor);
}

/** Dos desplegables (entidad → dependencia) con su casilla "Otra…". */
function htmlEntidadDependencia(p) {
  // Sin nada guardado arranca en Alcaldía de Pereira / DIGER: son casi todos los usuarios.
  const ent = p.entidad_ficha || CONFIG.ENTIDAD_FICHA;
  const dep = p.dependencia || (p.entidad_ficha ? '' : CONFIG.DEPENDENCIA);
  const entEnLista = APP.listas.entidades.some((v) => mismaClave(v, ent));
  const deps = dependenciasDe(ent);
  const depEnLista = deps.some((v) => mismaClave(v, dep));
  return '<label>Entidad <span class="req">*</span><select name="entidad_sel" data-lista="entidad">' + opcionesDe(APP.listas.entidades, ent) + '</select></label>' +
    '<label data-otra="entidad"' + (ent && !entEnLista ? '' : ' hidden') + '>¿Cuál entidad?<input name="entidad_otra" maxlength="120" value="' + esc(entEnLista ? '' : ent) + '" autocomplete="off"></label>' +
    '<label>Dependencia <span class="req">*</span><select name="dependencia_sel" data-lista="dependencia">' + opcionesDe(deps, dep) + '</select></label>' +
    '<label data-otra="dependencia"' + (dep && !depEnLista ? '' : ' hidden') + '>¿Cuál dependencia?<input name="dependencia_otra" maxlength="120" value="' + esc(depEnLista ? '' : dep) + '" autocomplete="off"></label>' +
    '<p class="c-nota">Si no aparece la suya, elija «Otra…» y escríbala: queda en la lista para todos.</p>';
}

/** Al cambiar la entidad se rearma la lista de dependencias; "Otra…" abre la casilla para escribir. */
function enlazarEntidadDependencia(form) {
  const selEnt = form.elements.entidad_sel, selDep = form.elements.dependencia_sel;
  const mostrar = () => {
    form.querySelector('[data-otra="entidad"]').hidden = selEnt.value !== OTRA;
    form.querySelector('[data-otra="dependencia"]').hidden = selDep.value !== OTRA;
  };
  selEnt.addEventListener('change', () => {
    const ent = selEnt.value === OTRA ? '' : selEnt.value;
    const deps = ent ? dependenciasDe(ent) : [];
    const antes = selDep.value;
    selDep.innerHTML = opcionesDe(deps, deps.some((v) => v === antes) ? antes : '');
    if (selEnt.value === OTRA) selDep.value = OTRA;       // entidad nueva: su dependencia también se escribe
    else if (deps.length === 1 && !selDep.value) selDep.value = deps[0];
    mostrar();
  });
  selDep.addEventListener('change', mostrar);
  mostrar();
}

function leerEntidadDependencia(form) {
  const ent = form.elements.entidad_sel.value === OTRA ? form.elements.entidad_otra.value : form.elements.entidad_sel.value;
  const dep = form.elements.dependencia_sel.value === OTRA ? form.elements.dependencia_otra.value : form.elements.dependencia_sel.value;
  const limpio = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  return { entidad_ficha: limpio(ent), dependencia: limpio(dep) };
}

/** Firma dibujada en esta pantalla y aún no guardada en el perfil. */
let firmaPendiente = null;

function pintarFirmas(dataUrl) {
  $$('[data-firma-muestra]').forEach((el) => {
    el.innerHTML = dataUrl ? '<img src="' + dataUrl + '" alt="Firma">' : '<span class="c-nota">Aún no ha firmado</span>';
  });
  $$('[data-firmar]').forEach((b) => { b.textContent = dataUrl ? 'Firmar de nuevo' : 'Firmar'; });
}

function htmlCamposPerfil(p) {
  p = p || {};
  return CAMPOS_PERFIL.map(([k, et, tipo, req]) => {
    if (tipo === 'doc') {
      return '<label>' + et + '<select name="' + k + '">' + Esquema.LISTAS.tipo_documento.map((o) =>
        '<option value="' + o[0] + '"' + ((p[k] || 'cc') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>';
    }
    return '<label>' + et + (req ? ' <span class="req">*</span>' : '') + '<input name="' + k + '" ' +
      (tipo === 'numeric' ? 'inputmode="numeric" ' : '') + (req ? 'required ' : '') + 'value="' + esc(p[k] || '') + '" autocomplete="off"></label>';
  }).join('') + htmlEntidadDependencia(p);
}

function leerPerfil(form) {
  const p = {};
  CAMPOS_PERFIL.forEach(([k]) => { p[k] = (form.elements[k].value || '').trim(); });
  return Object.assign(p, leerEntidadDependencia(form));
}

function mostrarIngreso() {
  $$('section.vista').forEach((v) => { v.hidden = true; });
  $$('.selector-zona').forEach((v) => v.remove());     // el selector de barrio queda suelto si no
  soltarMapaPunto();
  document.body.classList.remove('sin-scroll');        // la ficha lo pone; sin quitarlo el ingreso no se desplaza
  $('#vista-ingreso').hidden = false;
  const pintar = () => {
    const form = $('#form-ingreso');
    // Conserva lo que ya haya escrito si la lista llega mientras llena.
    const escrito = form.elements.nombre ? leerPerfil(form) : null;
    $('#ingreso-perfil').innerHTML = htmlCamposPerfil(Object.assign({}, APP.perfilAnterior || {}, escrito || {}));
    enlazarEntidadDependencia(form);
  };
  pintar();
  refrescarListas().then(pintar);
  firmaPendiente = null;
  pintarFirmas(APP.perfilAnterior && APP.perfilAnterior.firma);
  $('#modo-demo').hidden = !CONFIG.DEMO;
  $('#enlace-demo').hidden = CONFIG.DEMO;
  if (CONFIG.DEMO_CON_DATOS) {
    $('#modo-demo').textContent = 'Demostración con datos de ejemplo: todo es inventado y nada sale de este celular. Los datos ya están llenos: toque «Ingresar».';
    if (!$('#form-ingreso').elements.codigo.value) $('#form-ingreso').elements.codigo.value = 'DEMO';
  }
}

/** Para la demostración: el perfil de ejemplo con su firma ya dibujada. */
function perfilDeDemostracion() {
  return Object.assign({}, Demo.PERFIL, { firma: Demo.firma(Demo.PERFIL.nombre) });
}

async function ingresar(ev) {
  ev.preventDefault();
  const form = ev.target;
  const codigo = form.elements.codigo.value.trim();
  const perfil = leerPerfil(form);
  if (!codigo) { toast('Escriba el código de acceso', 'error'); return; }
  if (!perfil.entidad_ficha || !perfil.dependencia) { toast('Elija o escriba su entidad y su dependencia.', 'error'); return; }
  const firma = firmaPendiente || (APP.perfilAnterior && APP.perfilAnterior.firma);
  if (!firma) { toast('Falta su firma: toque "Firmar".', 'error'); return; }
  perfil.firma = firma;
  cargando(true, 'Verificando el código…');
  try {
    APP.perfil = { codigo };                          // api() lo necesita para mandarlo
    // Con nombre y documento queda en la pestaña TECNICOS (para asignarle visitas).
    const r = await api('ingresar', { codigo, nombre: perfil.nombre, tipo_doc: perfil.tipo_doc, num_doc: perfil.num_doc,
      matricula: perfil.matricula, entidad_ficha: perfil.entidad_ficha, dependencia: perfil.dependencia });
    // El servidor devuelve los nombres oficiales (normalizados) y la lista al día.
    if (r.entidad_ficha) perfil.entidad_ficha = r.entidad_ficha;
    if (r.dependencia) perfil.dependencia = r.dependencia;
    await guardarListas(r.listas);
    APP.perfil = Object.assign(perfil, { codigo, entidad: r.entidad || CONFIG.ENTIDAD });
    await DB.guardarKV('perfil', APP.perfil);
    entrarApp();
    sincronizar(true);
  } catch (e) {
    APP.perfil = null;
    toast(e.delServidor ? e.message : 'Se necesita señal para el primer ingreso.', 'error');
  } finally { cargando(false); }
}

/**
 * El código dejó de servir. Lo guardado en el celular NO se toca: borradores
 * y cola siguen ahí y se envían apenas entre con el código nuevo.
 */
async function pedirCodigoDeNuevo() {
  // Al ingresar, APP.perfil es solo { codigo }: un código mal escrito no tiene nada que recordar
  // (antes borraba el nombre, el documento y la firma guardados).
  if (!APP.perfil || !APP.perfil.nombre) return;
  recordarPerfil(APP.perfil);
  APP.perfil = null;
  DB.guardarKV('perfil', null);
  // Si estaba llenando una ficha: se guarda como borrador y se cierra, o el celular quedaba
  // con la pantalla bloqueada sin poder llegar al botón Ingresar.
  if (APP.actual) {
    cancelarAutoguardado();
    try { await guardarBorrador(true); } catch (e) { /* el borrador anterior sigue en el celular */ }
    APP.actual = null;
  }
  cerrarMenu();
  toast('El código de acceso ya no es válido. Pídale el nuevo a la DIGER.', 'error');
  mostrarIngreso();
}

/**
 * Nombre, documento y firma quedan guardados (sin el código) para el
 * próximo ingreso. Antes solo quedaban en memoria: si el código cambiaba y
 * se cerraba la app, el ingeniero tenía que llenar todo y firmar otra vez.
 */
function recordarPerfil(p) {
  if (!p) return;
  const sinCodigo = Object.assign({}, p);
  delete sinCodigo.codigo;
  APP.perfilAnterior = sinCodigo;
  DB.guardarKV('perfilAnterior', sinCodigo).catch(() => {});
}

function abrirMenu() {
  const p = APP.perfil;
  $('#menu-iniciales').textContent = iniciales(p.nombre);
  $('#menu-nombre').textContent = p.nombre || '';
  $('#menu-entidad').textContent = p.entidad + (CONFIG.DEMO ? ' · demostración' : '');
  $('#perfil-campos').innerHTML = htmlCamposPerfil(p);
  enlazarEntidadDependencia($('#form-perfil'));
  pintarCompartir();
  firmaPendiente = null;
  pintarFirmas(p.firma);
  $('#menu-version').textContent = VERSION_APP + ' · formulario ' + Esquema.VERSION +
    (APP.huellaServidor && APP.huellaServidor !== Esquema.huella() ? ' · ⚠ el servidor tiene otro esquema' : '');
  $('#vista-menu').hidden = false;
  document.body.classList.add('sin-scroll');
}

function cerrarMenu() {
  $('#vista-menu').hidden = true;
  if ($('#vista-ficha').hidden) document.body.classList.remove('sin-scroll');
}

function enlazarMenu() {
  $$('[data-firmar]').forEach((b) => b.addEventListener('click', () => abrirFirma((dataUrl) => {
    firmaPendiente = dataUrl;
    pintarFirmas(dataUrl);
  })));
  $('#btn-menu').addEventListener('click', abrirMenu);
  $('#menu-cerrar').addEventListener('click', cerrarMenu);
  $('#form-perfil').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nuevo = leerPerfil(ev.target);
    if (!nuevo.entidad_ficha || !nuevo.dependencia) { toast('Elija o escriba su entidad y su dependencia.', 'error'); return; }
    Object.assign(APP.perfil, nuevo);
    if (firmaPendiente) APP.perfil.firma = firmaPendiente;
    // Con señal, se normaliza y entra a la lista de una vez; sin señal, se
    // normaliza cuando llegue la primera evaluación.
    api('ingresar', quienSoy())
      .then(async (r) => {
        if (r.entidad_ficha) APP.perfil.entidad_ficha = r.entidad_ficha;
        if (r.dependencia) APP.perfil.dependencia = r.dependencia;
        await DB.guardarKV('perfil', APP.perfil);
        await guardarListas(r.listas);
      }).catch(() => {});
    await DB.guardarKV('perfil', APP.perfil);
    toast('Datos guardados. Se usarán en sus evaluaciones sin enviar.', 'ok');
    cerrarMenu();
    // Si estaba en una ficha (vino desde la sección 16), se refresca con los datos nuevos.
    if (APP.actual) { await aplicarPerfil(APP.actual.id, APP.actual.datos); irAPaso(APP.actual.paso); }
  });
  $('#menu-salir').addEventListener('click', async () => {
    if (CONFIG.DEMO_CON_DATOS) {
      const r = await preguntar('¿Salir de la demostración?', 'Se borra todo lo que hizo en la demostración y vuelve a quedar como nueva.',
        [['si', 'Salir y reiniciar', 'peligro'], ['no', 'Cancelar', '']]);
      if (r === 'si') await reiniciarDemostracion();
      return;
    }
    const pendientes = APP.cola.length + APP.borradores.length;
    const r = await preguntar('¿Salir de este celular?',
      pendientes ? 'Tiene ' + pendientes + ' evaluaciones sin enviar. No se borran: vuelven a aparecer al ingresar de nuevo.' : 'Tendrá que escribir el código otra vez.',
      [['si', 'Salir', 'peligro'], ['no', 'Cancelar', '']]);
    if (r !== 'si') return;
    recordarPerfil(APP.perfil);
    APP.perfil = null;
    await DB.guardarKV('perfil', null);
    cerrarMenu();
    mostrarIngreso();
  });
}
