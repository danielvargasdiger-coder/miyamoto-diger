/* =========================================================================
   DESCARGAS — PDF de una evaluación. Lo arma el servidor (acción
   pdf_evaluacion); es la salida que sirve en iPhone.
   Las descargas en Excel se quitaron el 18/09 a pedido de la DIGER (los
   datos se consultan en la hoja de Google).
   ========================================================================= */
'use strict';

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
