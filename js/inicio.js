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
function solicitudesPendientes() {
  const hechas = new Set();
  APP.historial.forEach((h) => h.id_solicitud && hechas.add(h.id_solicitud));
  (APP.enviadasLocal || []).forEach((h) => h.id_solicitud && hechas.add(h.id_solicitud));
  APP.cola.forEach((c) => c.datos.id_solicitud && hechas.add(c.datos.id_solicitud));
  return APP.solicitudes.filter((s) => !hechas.has(s.id_solicitud));
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
  const pend = solicitudesPendientes();
  const enviadas = APP.cola.length + (APP.enviadasLocal || []).length + APP.historial.length;
  const cuentas = { porEvaluar: pend.length, borradores: APP.borradores.length, enviadas };
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
  if (!pend.length) {
    return vacioHtml('No hay solicitudes pendientes',
      'Cuando la DIGER programe visitas aparecerán aquí. Para evaluar una edificación que no está en la lista, toque el botón +.');
  }
  const orden = { 'ALTA': 0, 'MEDIA': 1, 'BAJA': 2 };
  pend = pend.slice().sort((a, b) => (orden[a.prioridad] ?? 3) - (orden[b.prioridad] ?? 3));
  return pend.map((s) => {
    const b = borradorDeSolicitud(s.id_solicitud);
    return '<article class="tarjeta">' +
      '<div class="t-cab"><span class="prioridad p-' + esc((s.prioridad || '').toLowerCase()) + '">' + esc(s.prioridad || 'Sin prioridad') + '</span>' +
      '<span class="t-id">' + esc(s.id_solicitud) + '</span></div>' +
      '<h3>' + esc(s.direccion || 'Sin dirección') + '</h3>' +
      '<p class="t-lugar">' + esc([s.barrio, s.municipio].filter(Boolean).join(' · ')) + '</p>' +
      (s.descripcion ? '<p class="t-desc">' + esc(s.descripcion) + '</p>' : '') +
      '<div class="t-pie">' +
      (s.telefono ? '<a class="btn-texto" href="tel:' + esc(String(s.telefono).replace(/\s/g, '')) + '">' + icono('telefono') + esc(s.contacto || s.telefono) + '</a>' : '<span></span>') +
      (b ? '<button type="button" class="btn-principal btn-chico" data-continuar="' + esc(b.id) + '">' + icono('lapiz') + 'Continuar</button>'
        : '<button type="button" class="btn-principal btn-chico" data-evaluar="' + esc(s.id_solicitud) + '">Evaluar' + icono('derecha') + '</button>') +
      '</div></article>';
  }).join('');
}

function htmlBorradores() {
  if (!APP.borradores.length) return vacioHtml('Sin borradores', 'Las evaluaciones que deje a medias quedan aquí, solo en este celular.');
  return APP.borradores.map((b) => {
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
  APP.cola.forEach((c) => {
    const d = c.datos;
    partes.push('<article class="tarjeta en-cola">' +
      '<div class="t-cab"><span class="etiqueta-cola">' + icono('sincronizar') + 'Por enviar</span>' + chipClasif(d.clasif_habitabilidad) + '</div>' +
      '<h3>' + esc(d.direccion || 'Sin dirección') + '</h3>' +
      '<p class="t-lugar">' + esc([d.barrio_vereda, c.num_formulario].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="t-desc">' + esc(c.error || 'Esperando señal') + (c.intentos ? ' · intento ' + c.intentos : '') + '</p>' +
      '<div class="t-pie"><span></span><button type="button" class="btn-secundario btn-chico" data-ver-cola="' + esc(c.id) + '">' + icono('documento') + 'Ver ficha</button></div>' +
      '</article>');
  });
  const vistos = new Set();
  (APP.enviadasLocal || []).concat(APP.historial).forEach((h) => {
    if (vistos.has(h.id)) return;
    vistos.add(h.id);
    partes.push('<article class="tarjeta">' +
      '<div class="t-cab"><span class="t-id">' + esc(h.num_formulario || '') + '</span>' + chipClasif(h.clasif) + '</div>' +
      '<h3>' + esc(h.direccion || 'Sin dirección') + '</h3>' +
      '<p class="t-lugar">' + esc([h.barrio, h.municipio].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="t-desc">' + esc([fechaBonita(h.fecha), h.evaluador].filter(Boolean).join(' · ')) + '</p>' +
      (h.ficha_url ? '<div class="t-pie"><button type="button" class="btn-texto" data-pdf="' + esc(h.id) + '">' + icono('descargar') + 'PDF</button>' +
        '<a class="btn-secundario btn-chico" target="_blank" rel="noopener" href="' + esc(h.ficha_url) + '">' + icono('documento') + 'Abrir ficha</a></div>' : '') +
      '</article>');
  });
  return partes.length ? partes.join('') : vacioHtml('Aún no hay evaluaciones enviadas', 'Aquí verá las suyas y las del equipo después de sincronizar.');
}

function enlazarInicio() {
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
// Entidad (Alcaldía de Pereira) y dependencia (DIGER) son fijas: salen de
// config.js y no se preguntan.

/** Firma dibujada en esta pantalla y aún no guardada en el perfil. */
let firmaPendiente = null;

function pintarFirmas(dataUrl) {
  $$('[data-firma-muestra]').forEach((el) => {
    el.innerHTML = dataUrl ? '<img src="' + dataUrl + '" alt="Firma">' : '<span class="c-nota">Aún no ha firmado</span>';
  });
  $$('[data-firmar]').forEach((b) => { b.textContent = dataUrl ? 'Firmar de nuevo' : 'Firmar'; });
  $$('[data-entidad-fija]').forEach((el) => { el.textContent = CONFIG.ENTIDAD_FICHA; });
  $$('[data-dependencia-fija]').forEach((el) => { el.textContent = CONFIG.DEPENDENCIA; });
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
  }).join('');
}

function leerPerfil(form) {
  const p = {};
  CAMPOS_PERFIL.forEach(([k]) => { p[k] = (form.elements[k].value || '').trim(); });
  return p;
}

function mostrarIngreso() {
  $$('section.vista').forEach((v) => { v.hidden = true; });
  $('#vista-ingreso').hidden = false;
  $('#ingreso-perfil').innerHTML = htmlCamposPerfil(APP.perfilAnterior);
  firmaPendiente = null;
  pintarFirmas(APP.perfilAnterior && APP.perfilAnterior.firma);
  $('#modo-demo').hidden = !CONFIG.DEMO;
}

async function ingresar(ev) {
  ev.preventDefault();
  const form = ev.target;
  const codigo = form.elements.codigo.value.trim();
  const perfil = leerPerfil(form);
  if (!codigo) { toast('Escriba el código de acceso', 'error'); return; }
  const firma = firmaPendiente || (APP.perfilAnterior && APP.perfilAnterior.firma);
  if (!firma) { toast('Falta su firma: toque "Firmar".', 'error'); return; }
  perfil.firma = firma;
  cargando(true, 'Verificando el código…');
  try {
    APP.perfil = { codigo };                          // api() lo necesita para mandarlo
    const r = await api('ingresar', { codigo });
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
function pedirCodigoDeNuevo() {
  if (!APP.perfil) return;
  APP.perfilAnterior = APP.perfil;
  APP.perfil = null;
  DB.guardarKV('perfil', null);
  toast('El código de acceso ya no es válido. Pídale el nuevo a la DIGER.', 'error');
  mostrarIngreso();
}

function abrirMenu() {
  const p = APP.perfil;
  $('#menu-iniciales').textContent = iniciales(p.nombre);
  $('#menu-nombre').textContent = p.nombre || '';
  $('#menu-entidad').textContent = p.entidad + (CONFIG.DEMO ? ' · demostración' : '');
  $('#perfil-campos').innerHTML = htmlCamposPerfil(p);
  firmaPendiente = null;
  pintarFirmas(p.firma);
  $('#menu-version').textContent = 'Versión ' + VERSION_APP + ' · formulario ' + Esquema.VERSION +
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
    Object.assign(APP.perfil, leerPerfil(ev.target));
    if (firmaPendiente) APP.perfil.firma = firmaPendiente;
    await DB.guardarKV('perfil', APP.perfil);
    toast('Datos guardados. Se usarán en sus evaluaciones sin enviar.', 'ok');
    cerrarMenu();
    // Si estaba en una ficha (vino desde la sección 16), se refresca con los datos nuevos.
    if (APP.actual) { await aplicarPerfil(APP.actual.id, APP.actual.datos); irAPaso(APP.actual.paso); }
  });
  $('#menu-salir').addEventListener('click', async () => {
    const pendientes = APP.cola.length + APP.borradores.length;
    const r = await preguntar('¿Salir de este celular?',
      pendientes ? 'Tiene ' + pendientes + ' evaluaciones sin enviar. No se borran: vuelven a aparecer al ingresar de nuevo.' : 'Tendrá que escribir el código otra vez.',
      [['si', 'Salir', 'peligro'], ['no', 'Cancelar', '']]);
    if (r !== 'si') return;
    APP.perfilAnterior = APP.perfil;
    APP.perfil = null;
    await DB.guardarKV('perfil', null);
    cerrarMenu();
    mostrarIngreso();
  });
}
