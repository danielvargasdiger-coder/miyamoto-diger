/* =========================================================================
   DESCARGAS — Excel y PDF.
   - Solicitudes por evaluar: se arma en el celular, funciona sin señal.
   - Evaluaciones: las pide al servidor (acción exportar_evaluaciones), con
     todas las columnas del formulario y el enlace a cada ficha.
   - PDF de una evaluación: lo arma el servidor (acción pdf_evaluacion); es
     la salida que sirve en iPhone.
   ========================================================================= */
'use strict';

const TIPO_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function esIPhoneOIPad() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Entrega un archivo. En iPhone usa el menú de compartir ("Guardar en
 * Archivos"), que solo abre con un toque RECIENTE: si el archivo tardó
 * (viene del servidor), se muestra la barra "Listo · Guardar" para un toque
 * nuevo. En Android y PC, descarga normal. (Todo esto es de taludes.)
 */
async function entregarArchivo(bytes, nombre, tipo) {
  if (esIPhoneOIPad() && navigator.canShare) {
    const archivo = new File([bytes], nombre, { type: tipo });
    if (navigator.canShare({ files: [archivo] })) {
      const toqueVigente = !!(navigator.userActivation && navigator.userActivation.isActive);
      if (!toqueVigente) { ofrecerGuardar(archivo); return; }
      try { await navigator.share({ files: [archivo], title: nombre }); }
      catch (e) { if (!e || e.name !== 'AbortError') ofrecerGuardar(archivo); }
      return;
    }
  }
  descargarArchivo(bytes, nombre, tipo);
}

function descargarArchivo(bytes, nombre, tipo) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);   // liberarlo al instante cancela la descarga en algunos celulares
}

function ofrecerGuardar(archivo) {
  const barra = $('#archivo-listo');
  $('#archivo-listo-txt').textContent = archivo.name + ' está listo';
  barra.hidden = false;
  $('#btn-archivo-guardar').onclick = async () => {
    barra.hidden = true;
    try { await navigator.share({ files: [archivo], title: archivo.name }); }
    catch (e) { if (!e || e.name !== 'AbortError') descargarArchivo(archivo, archivo.name, archivo.type); }
  };
  $('#btn-archivo-cerrar').onclick = () => { barra.hidden = true; };
}

function nombreDeArchivo(partes, ext) {
  const hoy = new Date(), p = (n) => String(n).padStart(2, '0');
  const limpio = partes.map((x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).filter(Boolean).join('_').slice(0, 80);
  return limpio + '_' + hoy.getFullYear() + '-' + p(hoy.getMonth() + 1) + '-' + p(hoy.getDate()) + '.' + ext;
}

function hojaAcercaDe(que, cuantas) {
  return {
    nombre: 'Acerca de',
    columnas: [{ titulo: 'Dato', ancho: 26 }, { titulo: 'Valor', ancho: 70 }],
    filas: [['Contenido', que], ['Registros', cuantas], ['Entidad', APP.perfil.entidad],
      ['Generado', new Date().toLocaleString('es-CO')], ['Última sincronización', APP.ultimaSync ? fechaBonita(APP.ultimaSync) : 'nunca'],
      ['Formato', 'Formulario regional de evaluación rápida de daños (Miyamoto) V.1.0 - 03-2023']]
  };
}

const num = (v) => { const n = Esquema.aNumero(v); return n === null ? '' : n; };

async function excelSolicitudes() {
  const lista = solicitudesPendientes();
  if (!lista.length) { toast('No hay solicitudes por evaluar.'); return; }
  const hoja = {
    nombre: 'Por evaluar',
    columnas: ['ID solicitud', 'Prioridad', 'Dirección', 'Barrio/Vereda', 'Municipio', 'Contacto', 'Teléfono', 'Descripción',
      'Asignada a', 'Latitud', 'Longitud'],
    filas: lista.map((s) => [s.id_solicitud, s.prioridad, s.direccion, s.barrio, s.municipio, s.contacto, String(s.telefono || ''),
      s.descripcion, s.asignado || '', num(s.lat), num(s.lon)])
  };
  await entregarArchivo(Excel.crear([hoja, hojaAcercaDe('Solicitudes por evaluar', lista.length)]),
    nombreDeArchivo(['Solicitudes por evaluar', APP.perfil.entidad], 'xlsx'), TIPO_EXCEL);
}

async function excelEvaluaciones(boton) {
  const texto = boton.innerHTML;
  boton.disabled = true; boton.textContent = 'Pidiendo al servidor…';
  try {
    const r = await api('exportar_evaluaciones', {}, 90000);
    const hoja = { nombre: 'Evaluaciones', columnas: r.columnas, filas: r.filas };
    await entregarArchivo(Excel.crear([hoja, hojaAcercaDe('Evaluaciones recibidas (todas las entidades)', r.filas.length)]),
      nombreDeArchivo(['Evaluaciones Miyamoto'], 'xlsx'), TIPO_EXCEL);
  } catch (e) {
    toast(e.delServidor ? e.message : 'Se necesita señal para descargar las evaluaciones.', 'error');
  } finally { boton.disabled = false; boton.innerHTML = texto; }
}

function base64ABytes(b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function descargarPdf(id, boton) {
  const texto = boton.innerHTML;
  boton.disabled = true; boton.textContent = 'Armando PDF…';
  try {
    const r = await api('pdf_evaluacion', { id }, 120000);
    await entregarArchivo(base64ABytes(r.base64), r.nombre, 'application/pdf');
  } catch (e) {
    toast(e.delServidor ? e.message : 'Se necesita señal para descargar el PDF.', 'error');
  } finally { boton.disabled = false; boton.innerHTML = texto; }
}

function enlazarDescargas() {
  $('#btn-excel-solicitudes').addEventListener('click', excelSolicitudes);
  $('#btn-excel-evaluaciones').addEventListener('click', (ev) => excelEvaluaciones(ev.currentTarget));
}
