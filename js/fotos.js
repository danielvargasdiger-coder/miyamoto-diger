/* =========================================================================
   FOTOS Y CROQUIS

   Las fotos NO van dentro de los datos de la ficha (pesan mucho y cada
   autoguardado las reescribiría). Van en su propio almacén 'fotos', y la
   ficha solo guarda las claves: datos.foto_columnas = ['MIY-...|foto_columnas|1'].
   El croquis de la sección 11 es una foto más (PNG), así sube por el mismo
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

/** { campo: [dataUrl] } para la vista previa de la ficha. */
async function fotosParaFicha(idEval, datos) {
  const todas = await DB.fotosDe(idEval);
  const porClave = {};
  todas.forEach((f) => { porClave[f.clave] = f.dataUrl; });
  const fotos = {}, croquis = {};
  Object.keys(Esquema.CAMPOS).forEach((id) => {
    const c = Esquema.CAMPOS[id];
    const claves = datos[id];
    if (!Array.isArray(claves)) return;
    const urls = claves.map((k) => porClave[k]).filter(Boolean);
    if (c.tipo === 'fotos') fotos[id] = urls;
    if (c.tipo === 'croquis' && urls[0]) croquis[id] = urls[0];
  });
  return { fotos, croquis };
}

// ---------------------------------------------------------------- CROQUIS
/**
 * Editor de croquis a pantalla completa, sobre cuadrícula como el papel.
 * Lápiz, borrador, deshacer y limpiar. Se guarda como PNG.
 */
const CROQUIS = { trazos: [], actual: null, modo: 'lapiz', campo: null, lienzo: null, ctx: null, alListo: null };

function abrirCroquis(campo, etiqueta, alListo) {
  CROQUIS.campo = campo; CROQUIS.alListo = alListo; CROQUIS.trazos = []; CROQUIS.modo = 'lapiz';
  $('#croquis-titulo').textContent = etiqueta;
  $('#vista-croquis').hidden = false;
  document.body.classList.add('sin-scroll');
  const lienzo = $('#croquis-lienzo');
  CROQUIS.lienzo = lienzo;
  requestAnimationFrame(() => { ajustarLienzo(); marcarModo(); });
}

function ajustarLienzo() {
  const l = CROQUIS.lienzo, caja = l.parentElement.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  l.width = Math.round(caja.width * ratio); l.height = Math.round(caja.height * ratio);
  l.style.width = caja.width + 'px'; l.style.height = caja.height + 'px';
  CROQUIS.ctx = l.getContext('2d');
  redibujarCroquis();
}

function cuadricula(ctx, w, h, paso) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#dde3ea'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += paso) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (let y = 0; y <= h; y += paso) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();
}

/** Los trazos se guardan en coordenadas 0..1: así se redibujan a cualquier tamaño. */
function pintarTrazos(ctx, w, h, trazos) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  trazos.forEach((t) => {
    ctx.strokeStyle = t.borrar ? '#fff' : '#10233a';
    ctx.lineWidth = (t.borrar ? 22 : 3.2) * (w / 700);
    ctx.beginPath();
    t.p.forEach((pt, i) => { const x = pt[0] * w, y = pt[1] * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (t.p.length === 1) ctx.lineTo(t.p[0][0] * w + 0.1, t.p[0][1] * h);
    ctx.stroke();
  });
}

function redibujarCroquis() {
  const { ctx, lienzo } = CROQUIS;
  cuadricula(ctx, lienzo.width, lienzo.height, Math.round(lienzo.width / 28));
  pintarTrazos(ctx, lienzo.width, lienzo.height, CROQUIS.trazos);
  // La cuadrícula se vuelve a pintar debajo del borrador: el blanco del borrador la tapa.
}

function puntoDe(ev) {
  const r = CROQUIS.lienzo.getBoundingClientRect();
  return [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
}

function marcarModo() {
  $$('#vista-croquis [data-modo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.modo === CROQUIS.modo));
}

function iniciarEventosCroquis() {
  const l = $('#croquis-lienzo');
  l.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); l.setPointerCapture(ev.pointerId);
    CROQUIS.actual = { borrar: CROQUIS.modo === 'borrador', p: [puntoDe(ev)] };
    CROQUIS.trazos.push(CROQUIS.actual); redibujarCroquis();
  });
  l.addEventListener('pointermove', (ev) => {
    if (!CROQUIS.actual) return;
    CROQUIS.actual.p.push(puntoDe(ev)); redibujarCroquis();
  });
  const soltar = () => { CROQUIS.actual = null; };
  l.addEventListener('pointerup', soltar); l.addEventListener('pointercancel', soltar);

  $$('#vista-croquis [data-modo]').forEach((b) => b.addEventListener('click', () => { CROQUIS.modo = b.dataset.modo; marcarModo(); }));
  $('#croquis-deshacer').addEventListener('click', () => { CROQUIS.trazos.pop(); redibujarCroquis(); });
  $('#croquis-limpiar').addEventListener('click', () => {
    if (CROQUIS.trazos.length && confirm('¿Borrar todo el dibujo?')) { CROQUIS.trazos = []; redibujarCroquis(); }
  });
  $('#croquis-cancelar').addEventListener('click', cerrarCroquis);
  $('#croquis-guardar').addEventListener('click', () => {
    if (!CROQUIS.trazos.length) { toast('No hay nada dibujado'); return; }
    // Se exporta a un tamaño fijo, sin depender de la pantalla del celular.
    const w = CONFIG.ANCHO_CROQUIS, h = Math.round(w * CROQUIS.lienzo.height / CROQUIS.lienzo.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    cuadricula(ctx, w, h, Math.round(w / 28));
    pintarTrazos(ctx, w, h, CROQUIS.trazos);
    const dataUrl = c.toDataURL('image/png');
    const listo = CROQUIS.alListo;
    cerrarCroquis();
    if (listo) listo(dataUrl);
  });
  window.addEventListener('resize', () => { if (!$('#vista-croquis').hidden) ajustarLienzo(); });
}

function cerrarCroquis() {
  $('#vista-croquis').hidden = true;
  document.body.classList.remove('sin-scroll');
}

async function guardarCroquis(idEval, campo, dataUrl) {
  // Un croquis por campo: se reemplaza con la misma clave y un nombre nuevo,
  // para que el servidor lo reciba como archivo distinto si ya había subido el viejo.
  const version = Date.now().toString(36);
  const clave = idEval + '|' + campo + '|1';
  await DB.guardar('fotos', { clave, idEval, campo, nombre: campo + '_' + version + '.png', dataUrl, tipo: 'image/png' });
  return [clave];
}
