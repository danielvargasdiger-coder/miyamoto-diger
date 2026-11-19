/* =========================================================================
   CERTIFICADOS DE SERVICIOS PÚBLICOS — módulo pequeño, se entra desde el menú (19/11/2026).
   Campos, reglas y página: js/certificado.js (la misma del Worker). Aquí: lista, formulario, borradores y cola.
   Va por Cloudflare solamente (el código y el QR los da el Worker); sin señal queda en "Por enviar".
   Almacén IndexedDB `certificados`: { id, estado:'borrador'|'cola'|'emitido', datos, fotos:[clave], firma?, creado,
   codigo?, url?, error?, encolado? }. Las fotos van al almacén `fotos` de siempre, con idEval = id del certificado.
   ========================================================================= */
'use strict';

function nuevoIdCert() { return nuevoId().replace(/^MIY-/, 'CSP-'); }

/** Los datos del profesional salen siempre de "Mis datos". */
function profesionalDe(p) {
  p = p || {};
  return { prof_nombre: p.nombre || '', prof_profesion: p.profesion || '', prof_matricula: p.matricula || '', prof_num_doc: p.num_doc || '' };
}

function datosInicialesCert(p) {
  return Object.assign({ fecha_hora_visita: new Date().toISOString(), ubicacion: null, direccion: '', barrio_vereda: '', comuna: '',
    ficha_catastral: '', uso: '', uso_otro: '', propietario: '', areas: '', obs_sin_dano: false, obs_indicios: false,
    obs_zonas_sin_evaluar: false, reparaciones: '', concepto: '' }, profesionalDe(p));
}

/** '' si el perfil sirve para firmar certificados; si no, qué falta (se pide en "Mis datos"). */
function estadoPerfilParaCert(p) {
  p = p || {};
  if (!String(p.profesion || '').trim()) return 'Antes de emitir certificados, escriba su profesión en "Mis datos".';
  if (!p.firma) return 'Antes de emitir certificados, haga su firma en "Mis datos".';
  return '';
}

/** Quita un concepto que ya no es posible con las observaciones marcadas, y dice por qué. */
function aplicarReglasCert(d) {
  if (d.concepto && Certificado.conceptosPermitidos(d).indexOf(d.concepto) === -1) {
    d.concepto = '';
    return 'Con indicios o zonas sin evaluar, el concepto solo puede ser Condicionado o Desfavorable. Escoja de nuevo.';
  }
  return '';
}

/** Abierto y sin nada escrito ni fotos: al salir no se guarda (si no, la lista se llenaba de borradores vacíos). */
function certVacio(reg) {
  const d = reg.datos || {};
  return !reg.fotos.length && !['direccion', 'barrio_vereda', 'propietario', 'reparaciones', 'ficha_catastral']
    .some((k) => String(d[k] || '').trim()) && !d.uso && !d.areas && !d.concepto;
}

// ---------------------------------------------------------------- LISTA
async function abrirCertificados() {
  $('#vista-menu').hidden = true;
  $('#vista-certificados').hidden = false;
  document.body.classList.add('sin-scroll');
  await pintarCertificados();
  enviarColaCert(true);
  if (await cargarEquipoCert()) pintarCertificados();
}

// ---------------------------------------------------------------- DEL EQUIPO (19/11/2026)
/* Los certificados de todos (Cloudflare /cert/lista, con el código de acceso). Se guardan en el celular (kv certEquipo)
   para verlos sin señal; cada uno se abre por su enlace, que es la página oficial. */
const MAX_EQUIPO_VISIBLES = 50;
const sinTildes = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Lista del equipo sin los propios (ya salen arriba), filtrada por código, dirección, barrio, comuna o profesional. */
function filtrarEquipoCert(lista, texto, propios) {
  const q = sinTildes(texto).trim();
  return (lista || []).filter((c) => propios.indexOf(c.codigo) === -1 &&
    (!q || sinTildes([c.codigo, c.direccion, c.barrio_vereda, c.comuna, c.prof_nombre].join(' ')).indexOf(q) !== -1));
}

/** true si trajo una lista nueva. Sin señal o sin Cloudflare, se queda con la guardada. */
async function cargarEquipoCert() {
  try {
    let lista;
    if (CONFIG.DEMO) lista = Demo.CERT_EQUIPO || [];
    else {
      if (!recibeLaNube() || !navigator.onLine) return false;
      lista = (await alCert('lista', {})).certificados || [];
    }
    await DB.guardarKV('certEquipo', { lista, cuando: new Date().toISOString() });
    return true;
  } catch (e) { return false; }
}

function htmlEquipoCert(c) {
  const anulado = c.estado === 'ANULADO';
  return '<article class="tarjeta cert-item"><span class="cert-codigo">' + esc(c.codigo) + (anulado ? ' · ANULADO' : '') + '</span>' +
    '<div class="cert-item-cab"><b>' + esc(c.direccion || 'Sin dirección') + '</b>' +
    (c.concepto ? '<span class="chip-concepto c-' + esc(anulado ? 'anulado' : c.concepto) + '">' + esc(ROTULO_CONCEPTO[c.concepto] || c.concepto) + '</span>' : '') + '</div>' +
    '<span class="c-nota">' + esc([c.barrio_vereda, fechaBonita(c.fecha_hora_visita), c.prof_nombre].filter(Boolean).join(' · ')) + '</span>' +
    '<div class="cert-item-pie"><button type="button" class="btn-secundario btn-chico" data-cert-url="' + esc(c.url || '') + '">Ver certificado</button></div></article>';
}

async function pintarEquipoCert() {
  const caja = $('#cert-equipo-items');
  if (!caja) return;
  const guardado = (await DB.leerKV('certEquipo')) || { lista: [] };
  const propios = (await DB.todos('certificados')).map((r) => r.codigo).filter(Boolean);
  const todos = filtrarEquipoCert(guardado.lista, '', propios);
  const hallados = filtrarEquipoCert(guardado.lista, ($('#cert-buscar') || {}).value || '', propios);
  $('#cert-equipo-cuenta').textContent = todos.length;
  caja.innerHTML = (hallados.length ? hallados.slice(0, MAX_EQUIPO_VISIBLES).map(htmlEquipoCert).join('') +
    (hallados.length > MAX_EQUIPO_VISIBLES ? '<p class="c-nota">Se muestran ' + MAX_EQUIPO_VISIBLES + ' de ' + hallados.length + '. Escriba para buscar.</p>' : '')
    : '<p class="c-nota">' + (todos.length ? 'Ninguno coincide con la búsqueda.' : 'Aún no hay certificados de otros ingenieros' +
      (guardado.cuando ? '.' : ' (se cargan con señal).')) + '</p>');
}

function cerrarCertificados() {
  $('#vista-certificados').hidden = true;
  abrirMenu();
}

const ROTULO_CONCEPTO = { favorable: 'Favorable', condicionado: 'Condicionado', desfavorable: 'Desfavorable' };

function htmlCert(r) {
  const d = r.datos || {};
  const lugar = [d.barrio_vereda, fechaBonita(d.fecha_hora_visita)].filter(Boolean).join(' · ');
  const chip = d.concepto ? '<span class="chip-concepto c-' + esc(d.concepto) + '">' + esc(ROTULO_CONCEPTO[d.concepto] || d.concepto) + '</span>' : '';
  let pie = '';
  if (r.estado === 'borrador') {
    pie = '<button type="button" class="btn-principal btn-chico" data-cert-abrir="' + esc(r.id) + '">Seguir llenando</button>' +
      '<button type="button" class="btn-texto btn-chico peligro" data-cert-descartar="' + esc(r.id) + '">Descartar</button>';
  } else if (r.estado === 'cola') {
    pie = '<span class="c-nota">' + esc(r.error || 'Esperando señal para emitir…') + '</span>' +
      '<button type="button" class="btn-secundario btn-chico" data-cert-reintentar>Reintentar</button>';
  } else {
    pie = '<button type="button" class="btn-principal btn-chico" data-cert-ver="' + esc(r.id) + '">Ver certificado</button>' +
      (r.url ? '<button type="button" class="btn-secundario btn-chico" data-cert-copiar="' + esc(r.url) + '">Copiar enlace</button>' +
        '<a class="btn-secundario btn-chico" target="_blank" rel="noopener" href="https://wa.me/?text=' +
        encodeURIComponent('Certificado de servicios públicos ' + r.codigo + ': ' + r.url) + '">WhatsApp</a>' : '');
  }
  return '<article class="tarjeta cert-item">' +
    (r.codigo ? '<span class="cert-codigo">' + esc(r.codigo) + '</span>' : '') +
    '<div class="cert-item-cab"><b>' + esc(d.direccion || 'Sin dirección todavía') + '</b>' + chip + '</div>' +
    (lugar ? '<span class="c-nota">' + esc(lugar) + '</span>' : '') +
    '<div class="cert-item-pie">' + pie + '</div></article>';
}

/**
 * Demostración con datos: los certificados de ejemplo (js/demo.js) entran la primera vez que se abre el módulo.
 * No en reiniciarDemostracion: esa borra la base y recarga, así que no alcanzaría a guardarlos.
 */
async function sembrarCertificadosDemo() {
  if (!CONFIG.DEMO_CON_DATOS || await DB.leerKV('certificadosDemo')) return;
  for (const [i, c] of Demo.CERTIFICADOS.entries()) {
    const reg = JSON.parse(JSON.stringify(c));
    for (let j = 0; j < 2; j++) {
      const clave = reg.id + '|fotos|' + (j + 1);
      await DB.guardar('fotos', { clave, idEval: reg.id, campo: 'fotos', nombre: 'fotos_' + (j + 1) + '.jpg', dataUrl: Demo.fotoCertificado(i * 7 + j + 3, j), tipo: 'image/jpeg' });
      reg.fotos.push(clave);
    }
    await DB.guardar('certificados', reg);
  }
  await DB.guardarKV('certificadosDemo', true);
}

async function pintarCertificados() {
  await sembrarCertificadosDemo();
  const todos = (await DB.todos('certificados')).sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
  const falta = estadoPerfilParaCert(APP.perfil);
  const grupo = (titulo, lista) => (lista.length
    ? '<h3 class="cert-grupo">' + titulo + ' <span class="cuenta">' + lista.length + '</span></h3>' + lista.map(htmlCert).join('') : '');
  const de = (estado) => todos.filter((r) => r.estado === estado);
  $('#cert-lista').innerHTML =
    (falta ? '<div class="cert-aviso"><span>' + esc(falta) + '</span><button type="button" class="btn-secundario btn-chico" data-cert-mis-datos>Ir a Mis datos</button></div>' : '') +
    (todos.length ? grupo('Borradores', de('borrador')) + grupo('Por enviar', de('cola')) + grupo('Emitidos', de('emitido'))
      : vacioHtml('Aún no ha emitido certificados.', 'Toque "Nuevo certificado" para llenar el concepto técnico en la visita.')) +
    '<h3 class="cert-grupo">Del equipo <span class="cuenta" id="cert-equipo-cuenta">0</span></h3>' +
    '<input type="search" id="cert-buscar" class="cert-buscar" placeholder="Buscar por código, dirección, barrio o ingeniero" autocomplete="off" value="' +
    esc(pintarCertificados._busqueda || '') + '">' +
    '<div id="cert-equipo-items"></div>';
  await pintarEquipoCert();
}

// ---------------------------------------------------------------- FORMULARIO
async function abrirFormCert(id) {
  let reg = id ? await DB.leer('certificados', id) : null;
  if (!reg) {
    const falta = estadoPerfilParaCert(APP.perfil);
    if (falta) { toast(falta, 'error'); return; }
    reg = { id: nuevoIdCert(), estado: 'borrador', datos: datosInicialesCert(APP.perfil), fotos: [], creado: new Date().toISOString() };
  }
  Object.assign(reg.datos, profesionalDe(APP.perfil));      // si cambió "Mis datos", el borrador lo toma
  APP.cert = { reg, errores: {} };
  $('#vista-certificados').hidden = true;
  $('#vista-cert-form').hidden = false;
  $('#cert-form-titulo').textContent = 'Certificado nuevo';
  pintarFormCert();
  $('#cert-form').scrollTop = 0;
  cargarZonas().then(pintarBarriosCert);
}

function pintarBarriosCert() {
  const lista = $('#cert-barrios');
  if (!lista) return;
  lista.innerHTML = gruposDeZonas().map((g) => g.nombres.map((n) => '<option value="' + esc(n) + '"></option>').join('')).join('');
}

function errorCert(campo) {
  const e = APP.cert.errores[campo];
  return e ? '<span class="error">' + esc(e) + '</span>' : '';
}

function campoCert(campo, etiqueta, interior, req) {
  return '<div class="campo' + (APP.cert.errores[campo] ? ' con-error' : '') + '" data-campo-cert="' + campo + '">' +
    '<div class="c-etiqueta">' + etiqueta + (req ? ' <span class="req">*</span>' : '') + '</div>' + interior + errorCert(campo) + '</div>';
}

function chipsCert(id, lista, valor) {
  return '<div class="chips" role="radiogroup">' + lista.map((o) =>
    '<button type="button" role="radio" class="chip" data-cert-una="' + id + '" data-valor="' + o[0] + '" aria-checked="' + (valor === o[0]) + '">' +
    esc(o[1]) + '</button>').join('') + '</div>';
}

function textoCert(id, valor, opciones) {
  return '<input type="text" data-cert="' + id + '" value="' + esc(valor || '') + '" maxlength="300" autocomplete="off"' + (opciones || '') + '>';
}

function htmlGpsCert(u) {
  return (u ? '<div class="gps-dato ok"><b>' + u.lat.toFixed(6) + ', ' + u.lon.toFixed(6) + '</b><span>Precisión ±' + u.precision + ' m</span></div>'
    : '<p class="c-nota">Opcional. Llena solo el barrio y la comuna.</p>') +
    '<button type="button" class="btn-secundario btn-chico" id="cert-gps">' + icono('ubicacion') + (u ? 'Volver a medir' : 'Tomar ubicación') + '</button>';
}

function htmlConceptoCert() {
  const d = APP.cert.reg.datos;
  const permitidos = Certificado.conceptosPermitidos(d);
  const aviso = Certificado.avisoArea(d);
  return campoCert('concepto', 'Concepto profesional', '<div class="cert-concepto">' + Certificado.CONCEPTOS.map((c) => {
    const no = permitidos.indexOf(c[0]) === -1;
    return '<button type="button" role="radio" class="c-' + c[0] + '" data-cert-una="concepto" data-valor="' + c[0] + '" aria-checked="' + (d.concepto === c[0]) + '"' +
      (no ? ' disabled' : '') + '><b>' + esc(c[1]) + '</b><span>' + esc(c[2]) + '</span></button>';
  }).join('') + '</div>' +
    (permitidos.length < 3 ? '<p class="c-nota">Favorable no está disponible: hay indicios de daño o zonas sin evaluar.</p>' : '') +
    (aviso ? '<p class="cert-aviso">' + esc(aviso) + '</p>' : ''), true);
}

async function htmlFotosCert() {
  const reg = APP.cert.reg;
  const porClave = {};
  (await DB.fotosDe(reg.id)).forEach((f) => { porClave[f.clave] = f.dataUrl; });
  return reg.fotos.filter((k) => porClave[k]).map((k) => '<div class="mini"><img src="' + porClave[k] + '" alt="Foto">' +
    '<button type="button" class="mini-quitar" data-cert-quitar="' + esc(k) + '" aria-label="Quitar foto">×</button></div>').join('');
}

async function pintarFotosCert() {
  const caja = $('#cert-fotos');
  if (caja) caja.innerHTML = await htmlFotosCert();
  const n = $('#cert-fotos-n');
  if (n) n.textContent = APP.cert.reg.fotos.length + ' de ' + Certificado.MAX_FOTOS;
}

function pintarFormCert() {
  const d = APP.cert.reg.datos;
  const p = APP.perfil || {};
  const fecha = new Date(d.fecha_hora_visita);
  $('#cert-form').innerHTML =
    '<p class="c-nota cert-intro">Concepto técnico simplificado para solicitud de servicios públicos. Los campos con <span class="req">*</span> son obligatorios.</p>' +
    campoCert('fecha_hora_visita', 'Fecha y hora de la visita', '<input type="datetime-local" data-cert="fecha_hora_visita" value="' +
      (isNaN(fecha.getTime()) ? '' : ahoraLocal(fecha)) + '">', true) +
    campoCert('ubicacion', 'Ubicación (GPS)', '<div id="cert-gps-caja">' + htmlGpsCert(d.ubicacion) + '</div>') +
    campoCert('direccion', 'Dirección', textoCert('direccion', d.direccion), true) +
    campoCert('barrio_vereda', 'Barrio o vereda', textoCert('barrio_vereda', d.barrio_vereda, ' list="cert-barrios"') + '<datalist id="cert-barrios"></datalist>', true) +
    campoCert('comuna', 'Comuna o corregimiento', textoCert('comuna', d.comuna)) +
    campoCert('ficha_catastral', 'Ficha catastral – matrícula inmobiliaria', textoCert('ficha_catastral', d.ficha_catastral)) +
    campoCert('uso', 'Uso – ocupación', chipsCert('uso', Certificado.USOS, d.uso) +
      '<label id="cert-uso-otro"' + (d.uso === 'otro' ? '' : ' hidden') + '>¿Cuál?' + textoCert('uso_otro', d.uso_otro) + errorCert('uso_otro') + '</label>', true) +
    campoCert('propietario', 'Propietario – responsable', textoCert('propietario', d.propietario), true) +
    campoCert('areas', 'Áreas inspeccionadas', chipsCert('areas', Certificado.AREAS, d.areas), true) +
    campoCert('observaciones', 'Observaciones técnicas de la visita <span class="c-nota">· marque las que apliquen</span>',
      '<div class="cert-obs">' + Certificado.OBSERVACIONES.map((o) => '<button type="button" role="checkbox" class="chip" data-cert-obs="' + o[0] +
        '" aria-checked="' + !!d[o[0]] + '">' + esc(o[1]) + '</button>').join('') + '</div>' + errorCert('obs_indicios'), true) +
    campoCert('reparaciones', 'Descripción de reparaciones locativas visibles',
      '<textarea rows="3" maxlength="2000" data-cert="reparaciones" placeholder="Opcional. Si no hay, el certificado dice: No se registraron.">' + esc(d.reparaciones) + '</textarea>') +
    '<div id="cert-concepto-caja">' + htmlConceptoCert() + '</div>' +
    campoCert('fotos', 'Registro fotográfico <span class="c-nota" id="cert-fotos-n"></span>', '<div class="fotos" id="cert-fotos"></div>' +
      '<div class="fotos-botones">' +
      '<label class="btn-principal">' + icono('camara') + 'Tomar foto<input type="file" accept="image/*" capture="environment" data-cert-subir hidden></label>' +
      '<label class="btn-secundario">' + icono('galeria') + 'Galería<input type="file" accept="image/*" multiple data-cert-subir hidden></label></div>', true) +
    campoCert('profesional', 'Profesional responsable <span class="c-nota">· de "Mis datos"</span>',
      '<div class="cert-prof"><b>' + esc(p.nombre || '') + '</b><span>' + esc(p.profesion || 'Sin profesión') +
      (p.matricula ? ' · Mat. ' + esc(p.matricula) : '') + '</span>' +
      (p.firma ? '<img src="' + p.firma + '" alt="Firma">' : '<span class="error">Sin firma</span>') + '</div>' + errorCert('prof_nombre') + errorCert('prof_profesion')) +
    '<button type="button" class="btn-texto" id="cert-previa">Vista previa del certificado</button>';
  pintarBarriosCert();
  pintarFotosCert();
}

function pintarConceptoCert() { $('#cert-concepto-caja').innerHTML = htmlConceptoCert(); }

/** Al corregir un campo, su error se va (los demás se quedan hasta el próximo "Emitir"). */
function limpiarErrorCert(campo) {
  const grupo = { uso_otro: 'uso', obs_indicios: 'observaciones', obs_sin_dano: 'observaciones', obs_zonas_sin_evaluar: 'observaciones' }[campo] || campo;
  [campo, grupo].forEach((k) => { delete APP.cert.errores[k]; });
  const el = $('[data-campo-cert="' + grupo + '"]');
  if (el) { el.classList.remove('con-error'); $$('.error', el).forEach((x) => x.remove()); }
}

function guardarCertPronto() {
  clearTimeout(guardarCertPronto._r);
  const reg = APP.cert.reg;
  guardarCertPronto._r = setTimeout(() => { if (reg.estado === 'borrador') DB.guardar('certificados', reg).catch(() => {}); }, 800);
}

function cambioCert(campo) {
  const d = APP.cert.reg.datos;
  limpiarErrorCert(campo);
  const aviso = aplicarReglasCert(d);
  if (aviso) toast(aviso, 'error');
  if (aviso || /^(obs_|areas|concepto)/.test(campo)) pintarConceptoCert();
  if (campo === 'uso') $('#cert-uso-otro').hidden = d.uso !== 'otro';
  guardarCertPronto();
}

function tomarUbicacionCert() {
  const caja = $('#cert-gps-caja');
  caja.innerHTML = '<p class="c-nota">Buscando señal de GPS…</p>';
  pedirUbicacion({
    progreso: (m, seg) => { caja.innerHTML = '<p class="c-nota">Buscando señal de GPS… ' + seg + ' s' + (m ? ' · ±' + m.precision + ' m' : '') + '</p>'; },
    listo: async (m) => {
      const d = APP.cert.reg.datos;
      d.ubicacion = { lat: m.lat, lon: m.lon, precision: m.precision };
      caja.innerHTML = htmlGpsCert(d.ubicacion);
      const z = await buscarZonaDePunto(m.lat, m.lon);
      if (z) {
        d.barrio_vereda = z.nombre; d.comuna = z.grupo;
        $('[data-cert="barrio_vereda"]').value = z.nombre; $('[data-cert="comuna"]').value = z.grupo;
        limpiarErrorCert('barrio_vereda');
      }
      guardarCertPronto();
    },
    error: (e) => { caja.innerHTML = htmlGpsCert(APP.cert.reg.datos.ubicacion); toast((e && e.message) || 'No se pudo tomar la ubicación.', 'error'); }
  }, true);
}

/** Fotos del certificado más livianas que las de Miyamoto (~60-90 KB cada una): solo son de apoyo, y R2 y la hoja tienen tope. */
var FOTO_CERT = { ancho: 900, calidad: 0.5 };

/** agregarFotos (fotos.js) lee APP.actual.datos[campo]: se le presta el certificado y se devuelve lo que había. */
async function subirFotosCert(archivos) {
  const reg = APP.cert.reg;
  const antes = APP.actual;
  APP.actual = { datos: { fotos: reg.fotos } };
  try { reg.fotos = await agregarFotos(reg.id, 'fotos', archivos, Certificado.MAX_FOTOS, FOTO_CERT.ancho, FOTO_CERT.calidad); }
  catch (e) { toast('No se pudo agregar la foto.', 'error'); }
  finally { APP.actual = antes; }
  limpiarErrorCert('fotos');
  await pintarFotosCert();
  guardarCertPronto();
}

async function salirFormCert() {
  clearTimeout(guardarCertPronto._r);
  const reg = APP.cert.reg;
  if (reg.estado === 'borrador') {
    if (certVacio(reg)) await DB.borrar('certificados', reg.id);       // por si el autoguardado alcanzó a guardarlo
    else await DB.guardar('certificados', reg);
  }
  $('#vista-cert-form').hidden = true;
  $('#vista-certificados').hidden = false;
  await pintarCertificados();
}

async function emitirCert() {
  const reg = APP.cert.reg;
  const falta = estadoPerfilParaCert(APP.perfil);
  if (falta) { toast(falta, 'error'); return; }
  Object.assign(reg.datos, profesionalDe(APP.perfil));
  const errores = Certificado.validar(reg.datos, reg.fotos.length);
  if (errores.length) {
    APP.cert.errores = {};
    errores.forEach((e) => { if (!APP.cert.errores[e.campo]) APP.cert.errores[e.campo] = e.error; });
    pintarFormCert();
    const campo = { uso_otro: 'uso', obs_indicios: 'observaciones', prof_nombre: 'profesional', prof_profesion: 'profesional' }[errores[0].campo] || errores[0].campo;
    const el = $('[data-campo-cert="' + campo + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(errores.length === 1 ? errores[0].error : 'Faltan ' + errores.length + ' datos. Están marcados en rojo.', 'error');
    return;
  }
  const r = await preguntar('¿Emitir el certificado?', 'Después de emitido no se puede cambiar desde el celular. Si hay que corregir algo, lo hace la oficina en la hoja.',
    [['si', 'Emitir', ''], ['no', 'Revisar otra vez', '']]);
  if (r !== 'si') return;
  clearTimeout(guardarCertPronto._r);
  reg.firma = (await ponerFirmaEnEvaluacion(reg.id, APP.perfil.firma))[0];
  reg.datos.version_app = VERSION_APP;
  reg.estado = 'cola';
  reg.encolado = new Date().toISOString();
  delete reg.error;
  await DB.guardar('certificados', reg);
  $('#vista-cert-form').hidden = true;
  $('#vista-certificados').hidden = false;
  await pintarCertificados();
  enviarColaCert(false);
}

// ---------------------------------------------------------------- ENVÍO
/** /cert/guardar o /cert/cerrar del Worker, con el código de acceso como en alaNube (envio.js). */
function alCert(paso, cuerpo) {
  return pedirCloudflare(CONFIG.URL_NUBE + '/cert/' + paso, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ codigo: APP.perfil ? APP.perfil.codigo : '' }, cuerpo))
  }, 45000);
}

async function enviarUnCert(r) {
  r.error = 'Enviando…';
  await DB.guardar('certificados', r);
  if (!$('#vista-certificados').hidden) pintarCertificados();
  // Repetir guardar es seguro: el Worker reconoce el id y devuelve el MISMO código.
  const g = await conReintentoDeRed(() => alCert('guardar', { id: r.id, datos: r.datos }));
  let cierre = g.yaEmitido ? { estado: 'EMITIDO', codigo_certificado: g.codigo_certificado, url: g.url } : null;
  if (!cierre) {
    const nube = g.subida;
    const permiso = '?permiso=' + encodeURIComponent(nube.permiso);
    const ya = new Set(((await conReintentoDeRed(() => pedirCloudflare(nube.url + '/fotos/' + r.id + permiso))).nombres) || []);
    const porClave = {};
    (await DB.fotosDe(r.id)).forEach((f) => { porClave[f.clave] = f; });
    const fotos = r.fotos.map((k) => porClave[k]).filter(Boolean);
    const firma = r.firma && porClave[r.firma];
    for (const f of fotos.concat(firma ? [firma] : [])) {
      if (ya.has(f.nombre)) continue;
      await conReintentoDeRed(() => pedirCloudflare(nube.url + '/fotos/' + r.id + '/' + f.nombre + permiso, {
        method: 'PUT', headers: { 'Content-Type': f.tipo, 'X-Campo': f === firma ? 'prof_firma' : 'fotos' }, body: bytesDe(f.dataUrl)
      }, 45000));
    }
    cierre = await conReintentoDeRed(() => alCert('cerrar', { id: r.id, fotos: fotos.map((f) => f.nombre), firma: firma ? firma.nombre : '' }));
    if (cierre.estado !== 'EMITIDO') {
      const e = new Error('A Cloudflare le faltan ' + ((cierre.faltan || []).length || 'algunas') + ' fotos; se reintentará.');
      e.delServidor = true;
      throw e;
    }
  }
  r.codigo = cierre.codigo_certificado;
  r.url = cierre.url;
  r.estado = 'emitido';
  r.emitido = new Date().toISOString();
  delete r.error;
  await DB.guardar('certificados', r);
  for (const f of await DB.fotosDe(r.id)) await quitarFoto(f.clave);     // ya están en Cloudflare
}

let _enviandoCert = false;
async function enviarColaCert(silencioso) {
  if (_enviandoCert) return;
  _enviandoCert = true;
  let bien = 0, mal = 0;
  try {
    const cola = (await DB.todos('certificados')).filter((r) => r.estado === 'cola');
    if (!cola.length) return;
    if (CONFIG.DEMO) {
      // Demostración: nada sale del celular. Un código de mentira para ver cómo queda.
      for (const r of cola) {
        r.codigo = 'SP-DEMO-' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
        r.url = '';
        r.estado = 'emitido';
        r.emitido = new Date().toISOString();
        delete r.error;
        await DB.guardar('certificados', r);
        bien++;
      }
      return;
    }
    if (!recibeLaNube() || !navigator.onLine) return;              // sin señal: lo intenta la próxima vez
    for (const r of cola) {
      try { await enviarUnCert(r); bien++; }
      catch (e) {
        mal++;
        r.error = explicarFallo(e);
        await DB.guardar('certificados', r);
        if (!e.delServidor) break;                                 // sin señal: no tiene caso seguir
      }
    }
  } finally {
    _enviandoCert = false;
    if (!$('#vista-certificados').hidden) await pintarCertificados();
    if (bien) toast(bien === 1 ? 'Certificado emitido' : bien + ' certificados emitidos', 'ok');
    else if (mal && !silencioso) toast('No se pudo emitir todavía. Se reintentará solo.', 'error');
  }
}

// ---------------------------------------------------------------- VER
/** Borrador: vista previa sin validez. Emitido en la demostración: como quedaría (con su QR). */
async function verCertificadoLocal(id, volverA) {
  const reg = id === (APP.cert && APP.cert.reg.id) ? APP.cert.reg : await DB.leer('certificados', id);
  if (!reg) return;
  const porClave = {};
  (await DB.fotosDe(reg.id)).forEach((f) => { porClave[f.clave] = f.dataUrl; });
  const o = { fotos: reg.fotos.map((k) => porClave[k]).filter(Boolean), firma: porClave[reg.firma] || (APP.perfil && APP.perfil.firma) || '',
    logo: 'img/logo-diger-alcaldia.png' };
  if (reg.estado === 'emitido') {
    Object.assign(o, { codigo: reg.codigo, estado: 'EMITIDO', enlace: reg.url || location.origin + '/certificado/' + String(reg.codigo).toLowerCase(),
      consultado: Certificado.fechaColombia(new Date().toISOString()) });
  } else o.vistaPrevia = true;
  APP.certVolverA = volverA;
  $('#cert-ver-titulo').textContent = reg.estado === 'emitido' ? 'Certificado ' + reg.codigo : 'Vista previa · sin validez';
  $('#cert-ver-marco').srcdoc = Certificado.pagina(reg.datos, o);
  $('#' + volverA).hidden = true;
  $('#vista-cert-ver').hidden = false;
}

function cerrarVerCert() {
  $('#vista-cert-ver').hidden = true;
  $('#' + (APP.certVolverA || 'vista-certificados')).hidden = false;
}

// ---------------------------------------------------------------- EVENTOS (una sola vez, desde iniciar())
function iniciarCertificados() {
  $('#btn-certificados').addEventListener('click', abrirCertificados);
  $('#cert-volver').addEventListener('click', cerrarCertificados);
  $('#cert-nuevo').addEventListener('click', () => abrirFormCert(null));
  $('#cert-form-volver').addEventListener('click', salirFormCert);
  $('#cert-guardar').addEventListener('click', async () => { await salirFormCert(); toast('Borrador guardado', 'ok'); });
  $('#cert-emitir').addEventListener('click', emitirCert);
  $('#cert-ver-volver').addEventListener('click', cerrarVerCert);

  $('#cert-lista').addEventListener('input', (ev) => {
    if (ev.target.id !== 'cert-buscar') return;
    pintarCertificados._busqueda = ev.target.value;
    pintarEquipoCert();
  });
  $('#cert-lista').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.certAbrir) abrirFormCert(b.dataset.certAbrir);
    else if (b.dataset.certVer) {
      const reg = await DB.leer('certificados', b.dataset.certVer);
      if (reg && reg.url && !CONFIG.DEMO) window.open(reg.url, '_blank', 'noopener');
      else verCertificadoLocal(b.dataset.certVer, 'vista-certificados');
    } else if ('certUrl' in b.dataset) {
      if (b.dataset.certUrl) window.open(b.dataset.certUrl, '_blank', 'noopener');
      else toast('En la demostración los certificados del equipo no se abren.');
    } else if (b.dataset.certCopiar) {
      const url = b.dataset.certCopiar;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => toast('Enlace copiado', 'ok'), () => toast(url));
      } else toast(url);
    } else if ('certReintentar' in b.dataset) enviarColaCert(false);
    else if ('certMisDatos' in b.dataset) cerrarCertificados();
    else if (b.dataset.certDescartar) {
      const r = await preguntar('¿Descartar este borrador?', 'Se borran sus datos y sus fotos de este celular.', [['si', 'Descartar', 'peligro'], ['no', 'Cancelar', '']]);
      if (r !== 'si') return;
      for (const f of await DB.fotosDe(b.dataset.certDescartar)) await quitarFoto(f.clave);
      await DB.borrar('certificados', b.dataset.certDescartar);
      pintarCertificados();
    }
  });

  const form = $('#cert-form');
  form.addEventListener('input', (ev) => {
    const id = ev.target.dataset.cert;
    if (!id) return;
    const d = APP.cert.reg.datos;
    if (id === 'fecha_hora_visita') {
      const f = new Date(ev.target.value);
      d.fecha_hora_visita = isNaN(f.getTime()) ? '' : f.toISOString();
    } else d[id] = ev.target.value;
    if (id === 'barrio_vereda') {
      // Escogido de la lista: la comuna es la del grupo de ese barrio (se puede corregir).
      const g = gruposDeZonas().find((x) => x.nombres.indexOf(ev.target.value) !== -1);
      if (g) { d.comuna = g.grupo; $('[data-cert="comuna"]').value = g.grupo; }
    }
    cambioCert(id);
  });
  form.addEventListener('change', (ev) => { if ('certSubir' in ev.target.dataset && ev.target.files.length) { subirFotosCert(ev.target.files); ev.target.value = ''; } });
  form.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const d = APP.cert.reg.datos;
    if (b.dataset.certUna) {
      const id = b.dataset.certUna;
      d[id] = d[id] === b.dataset.valor ? '' : b.dataset.valor;            // tocar el escogido lo quita
      $$('[data-cert-una="' + id + '"]', form).forEach((x) => x.setAttribute('aria-checked', String(x.dataset.valor === d[id])));
      cambioCert(id);
    } else if (b.dataset.certObs) {
      d[b.dataset.certObs] = !d[b.dataset.certObs];
      b.setAttribute('aria-checked', String(d[b.dataset.certObs]));
      cambioCert(b.dataset.certObs);
    } else if (b.dataset.certQuitar) {
      await quitarFoto(b.dataset.certQuitar);
      APP.cert.reg.fotos = APP.cert.reg.fotos.filter((k) => k !== b.dataset.certQuitar);
      await pintarFotosCert();
      guardarCertPronto();
    } else if (b.id === 'cert-gps') tomarUbicacionCert();
    else if (b.id === 'cert-previa') verCertificadoLocal(APP.cert.reg.id, 'vista-cert-form');
  });
}
