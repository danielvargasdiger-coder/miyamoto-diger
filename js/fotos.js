/* =========================================================================
   FOTOS Y FIRMA

   Las fotos NO van dentro de los datos de la ficha (pesan mucho y cada
   autoguardado las reescribiría). Van en su propio almacén 'fotos', y la
   ficha solo guarda las claves: datos.foto_columnas = ['MIY-...|foto_columnas|1'].
   La firma del evaluador es una foto más (PNG), así sube por el mismo
   camino y el servidor no necesita nada especial.
   ========================================================================= */
'use strict';

function comprimirImagen(archivo, anchoMax, calidad) {
  return new Promise((ok, fallo) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); fallo(new Error('No se pudo leer la imagen')); };
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > anchoMax) { const f = anchoMax / Math.max(w, h); w = Math.round(w * f); h = Math.round(h * f); }
      const lienzo = document.createElement('canvas');
      lienzo.width = w; lienzo.height = h;
      lienzo.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      ok(lienzo.toDataURL('image/jpeg', calidad));
    };
    img.src = url;
  });
}

/** Nombre de archivo estable: es lo que usa el servidor para no duplicar. */
function nombreFoto(campo, n, ext) { return campo.replace(/^foto_/, '') + '_' + n + '.' + (ext || 'jpg'); }

async function agregarFotos(idEval, campo, archivos, max) {
  const actuales = (APP.actual.datos[campo] || []).slice();
  const libres = max - actuales.length;
  const lista = Array.from(archivos).slice(0, Math.max(0, libres));
  if (archivos.length > libres) toast('Máximo ' + max + ' fotos aquí; se tomaron las primeras ' + lista.length + '.');
  let n = actuales.reduce((m, c) => Math.max(m, +c.split('|')[2] || 0), 0);
  for (const archivo of lista) {
    n++;
    const dataUrl = await comprimirImagen(archivo, CONFIG.ANCHO_MAX_FOTO, CONFIG.CALIDAD_FOTO);
    const clave = idEval + '|' + campo + '|' + n;
    await DB.guardar('fotos', { clave, idEval, campo, nombre: nombreFoto(campo, n), dataUrl, tipo: 'image/jpeg' });
    actuales.push(clave);
  }
  return actuales;
}

async function quitarFoto(clave) { await DB.borrar('fotos', clave); }

/** Fotos y firma para la vista previa de la ficha: { fotos: {campo:[dataUrl]}, firma }. */
async function fotosParaFicha(idEval, datos) {
  const todas = await DB.fotosDe(idEval);
  const porClave = {};
  todas.forEach((f) => { porClave[f.clave] = f.dataUrl; });
  const fotos = {};
  let firma = '';
  Object.keys(Esquema.CAMPOS).forEach((id) => {
    const c = Esquema.CAMPOS[id];
    const claves = datos[id];
    if (!Array.isArray(claves)) return;
    const urls = claves.map((k) => porClave[k]).filter(Boolean);
    if (c.tipo === 'fotos') fotos[id] = urls;
    if (c.tipo === 'firma' && urls[0]) firma = urls[0];
  });
  return { fotos, firma };
}

/**
 * La firma del perfil se copia a cada evaluación como un archivo más
 * (firma_1.png), así sube por el mismo camino que las fotos y la ficha del
 * servidor la tiene aunque el ingeniero cambie su firma después.
 */
async function ponerFirmaEnEvaluacion(idEval, firmaDataUrl) {
  if (!firmaDataUrl) return [];
  const clave = idEval + '|eval_firma|1';
  await DB.guardar('fotos', { clave, idEval, campo: 'eval_firma', nombre: 'firma_1.png', dataUrl: firmaDataUrl, tipo: 'image/png' });
  return [clave];
}

// ---------------------------------------------------------------- PANEL DE FIRMA
/**
 * Panel a pantalla completa para firmar con el dedo. Se usa al ingresar y
 * desde "Mis datos"; la firma queda en el perfil del celular. Los trazos se
 * guardan en 0..1 para redibujarse bien si el celular gira.
 */
const FIRMA = { trazos: [], actual: null, lienzo: null, ctx: null, alListo: null };
const ANCHO_FIRMA = 600;

function abrirFirma(alListo) {
  FIRMA.alListo = alListo; FIRMA.trazos = [];
  $('#vista-firma').hidden = false;
  document.body.classList.add('sin-scroll');
  FIRMA.lienzo = $('#firma-lienzo');
  requestAnimationFrame(ajustarLienzoFirma);
}

function ajustarLienzoFirma() {
  const l = FIRMA.lienzo, caja = l.parentElement.getBoundingClientRect();
  // Proporción fija 5:2, como el renglón de firma del formulario.
  const ancho = Math.min(caja.width, 900), alto = Math.min(caja.height, ancho * 0.4);
  const ratio = window.devicePixelRatio || 1;
  l.width = Math.round(ancho * ratio); l.height = Math.round(alto * ratio);
  l.style.width = ancho + 'px'; l.style.height = alto + 'px';
  FIRMA.ctx = l.getContext('2d');
  redibujarFirma();
}

function pintarTrazos(ctx, w, h, trazos) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0a1f44';
  ctx.lineWidth = Math.max(2, w / 180);
  trazos.forEach((t) => {
    ctx.beginPath();
    t.forEach((pt, i) => { const x = pt[0] * w, y = pt[1] * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (t.length === 1) ctx.lineTo(t[0][0] * w + 0.1, t[0][1] * h);
    ctx.stroke();
  });
}

function redibujarFirma() {
  const { ctx, lienzo } = FIRMA;
  pintarTrazos(ctx, lienzo.width, lienzo.height, FIRMA.trazos);
  // Renglón guía, solo en pantalla (no sale en la firma guardada).
  ctx.strokeStyle = '#c3ccd6'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(lienzo.width * 0.06, lienzo.height * 0.78); ctx.lineTo(lienzo.width * 0.94, lienzo.height * 0.78); ctx.stroke();
}

function puntoDe(ev) {
  const r = FIRMA.lienzo.getBoundingClientRect();
  return [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
}

function iniciarEventosFirma() {
  const l = $('#firma-lienzo');
  l.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); l.setPointerCapture(ev.pointerId);
    FIRMA.actual = [puntoDe(ev)]; FIRMA.trazos.push(FIRMA.actual); redibujarFirma();
  });
  l.addEventListener('pointermove', (ev) => { if (FIRMA.actual) { FIRMA.actual.push(puntoDe(ev)); redibujarFirma(); } });
  const soltar = () => { FIRMA.actual = null; };
  l.addEventListener('pointerup', soltar); l.addEventListener('pointercancel', soltar);
  $('#firma-deshacer').addEventListener('click', () => { FIRMA.trazos.pop(); redibujarFirma(); });
  $('#firma-limpiar').addEventListener('click', () => { FIRMA.trazos = []; redibujarFirma(); });
  $('#firma-cancelar').addEventListener('click', cerrarFirma);
  $('#firma-guardar').addEventListener('click', () => {
    const puntos = FIRMA.trazos.reduce((n, t) => n + t.length, 0);
    if (puntos < 8) { toast('Firme dentro del recuadro'); return; }
    // Tamaño fijo, sin depender de la pantalla del celular.
    const w = ANCHO_FIRMA, h = Math.round(w * FIRMA.lienzo.height / FIRMA.lienzo.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    pintarTrazos(c.getContext('2d'), w, h, FIRMA.trazos);
    const dataUrl = c.toDataURL('image/png');
    const listo = FIRMA.alListo;
    cerrarFirma();
    if (listo) listo(dataUrl);
  });
  window.addEventListener('resize', () => { if (!$('#vista-firma').hidden) ajustarLienzoFirma(); });
}

function cerrarFirma() {
  $('#vista-firma').hidden = true;
  // El menú y la ficha también bloquean el scroll: solo se libera si no hay otra pantalla abierta.
  if ($('#vista-menu').hidden && $('#vista-ficha').hidden) document.body.classList.remove('sin-scroll');
}
