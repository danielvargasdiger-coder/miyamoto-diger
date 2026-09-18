/* =========================================================================
   COMPARTIR LA APP — QR, WhatsApp, copiar el enlace e instalar.
   Igual que en taludes. El QR va dibujado dentro de index.html.
   Un QR NO puede instalar la app (ningún navegador lo permite): lleva a la
   app y desde ahí se instala. Si el navegador no ofrece el botón de
   instalar, se explica dónde está la opción en vez de dejar un botón muerto.
   ========================================================================= */
'use strict';

const MENSAJE_COMPARTIR = 'App de Evaluación de daños en edificaciones (formato Miyamoto) de la DIGER Pereira. ' +
  'Ábrela en el celular y agrégala a la pantalla de inicio: ' + CONFIG.URL_PUBLICA;

let invitacionInstalar = null;

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();           // sin esto Chrome saca su propio cartel encima
  invitacionInstalar = ev;
  pintarCompartir();
});
window.addEventListener('appinstalled', () => { invitacionInstalar = null; pintarCompartir(); });

function yaEstaInstalada() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

/** Botón y ayuda de instalar en la pantalla de ingreso (antes de tener código). */
function pintarInstalarIngreso() {
  const boton = $('#btn-instalar-ingreso'), ayuda = $('#instalar-ingreso-ayuda');
  if (!boton) return;
  if (yaEstaInstalada()) { boton.hidden = true; ayuda.hidden = true; return; }
  boton.hidden = !invitacionInstalar;
  ayuda.hidden = !!invitacionInstalar;
  ayuda.textContent = textoAyudaInstalar();
}

function textoAyudaInstalar() {
  // Sin el símbolo ⋮: muchas fuentes de celular no lo traen y sale un cuadrito.
  return esIPhoneOIPad()
    ? 'Para instalarla en iPhone: ábrala en Safari, toque Compartir (el cuadrito con la flecha hacia arriba) y luego «Añadir a pantalla de inicio».'
    : 'Para instalarla: abra el menú del navegador Chrome (los tres puntitos, arriba a la derecha) y toque «Instalar aplicación» o «Añadir a pantalla de inicio».';
}

async function instalarAhora() {
  if (!invitacionInstalar) return;
  invitacionInstalar.prompt();
  try { await invitacionInstalar.userChoice; } catch (e) { /* la cerró sin decidir */ }
  invitacionInstalar = null;     // el navegador solo la ofrece una vez
  pintarCompartir();
}

function pintarCompartir() {
  pintarInstalarIngreso();
  const url = $('#qr-url');
  if (!url) return;
  url.textContent = CONFIG.URL_PUBLICA;
  $('#btn-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(MENSAJE_COMPARTIR);
  $('#btn-compartir').hidden = !navigator.share;
  const boton = $('#btn-instalar'), ayuda = $('#instalar-ayuda');
  if (yaEstaInstalada()) {
    boton.hidden = true; ayuda.hidden = false;
    ayuda.textContent = 'Esta app ya está instalada en este celular.';
  } else if (invitacionInstalar) {
    boton.hidden = false; ayuda.hidden = true;
  } else {
    boton.hidden = true; ayuda.hidden = false;
    ayuda.textContent = textoAyudaInstalar();
  }
}

/** Portapapeles: el camino moderno y, si falla, el de navegadores viejos. */
async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
  } catch (e) { /* se intenta con el de abajo */ }
  try {
    const t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(t);
    return ok;
  } catch (e) { return false; }
}

function enlazarCompartir() {
  $('#btn-instalar').addEventListener('click', instalarAhora);
  $('#btn-instalar-ingreso').addEventListener('click', instalarAhora);
  $('#btn-compartir').addEventListener('click', async () => {
    try { await navigator.share({ title: 'Evaluación de daños · DIGER', text: MENSAJE_COMPARTIR, url: CONFIG.URL_PUBLICA }); }
    catch (e) { /* canceló el menú: no es un error */ }
  });
  $('#btn-copiar').addEventListener('click', async () => {
    const b = $('#btn-copiar');
    const ok = await copiarTexto(CONFIG.URL_PUBLICA);
    b.textContent = ok ? '¡Copiado!' : 'No se pudo copiar';
    setTimeout(() => { b.textContent = 'Copiar el enlace'; }, 2000);
  });
  pintarCompartir();
}
