/* =========================================================================
   ENVÍO Y SINCRONIZACIÓN

   Orden de un envío (cada paso se puede repetir sin daño):
     1. guardar_evaluacion  — los datos (livianos). El servidor guarda POR ID:
                              si ya la tenía, actualiza la misma fila. Devuelve
                              el No. de formulario y las fotos que YA recibió.
     2. subir_foto          — solo las que faltan, una por una.
     3. cerrar_evaluacion   — el servidor confirma que están todas.
   Si la señal se cae en cualquier punto, el siguiente intento retoma donde
   iba. En taludes el id lo ponía el servidor y cada reintento dejaba una
   fila huérfana sin fotos (pasó 5 veces).
   Fase 3 (08/10/2026): los pasos 1 y 3 van a Cloudflare (/envio/guardar y /envio/cerrar)
   y Google recibe la evaluación de Cloudflare sin que el celular espere. El camino de cada
   evaluación (item.via) se fija una sola vez: así nunca tiene dos números.
   ========================================================================= */
'use strict';

/** Datos listos para viajar: sin campos ocultos, fecha con zona, fotos por nombre. */
async function datosParaEnviar(id, datos) {
  const d = Esquema.limpiarOcultos(datos);
  if (datos.id_solicitud) d.id_solicitud = datos.id_solicitud;
  ['fecha_hora_inspeccion', 'eval_previa_fecha'].forEach((k) => {
    if (d[k]) { const f = new Date(d[k]); if (!isNaN(f.getTime())) d[k] = f.toISOString(); }
  });
  const fotos = [];
  for (const k of Object.keys(d)) {
    const c = Esquema.CAMPOS[k];
    if (!c || (c.tipo !== 'fotos' && c.tipo !== 'firma')) continue;
    const registros = (await Promise.all((d[k] || []).map((clave) => DB.leer('fotos', clave)))).filter(Boolean);
    d[k] = registros.map((f) => f.nombre);
    registros.forEach((f) => fotos.push({ clave: f.clave, campo: k, nombre: f.nombre }));
  }
  return { datos: d, fotos };
}

async function enviarActual() {
  const a = APP.actual;
  const faltan = Esquema.faltantes(a.datos);
  if (faltan.length) { toast('Faltan ' + faltan.length + ' datos obligatorios.', 'error'); return; }
  const listo = await preguntar('¿Enviar la evaluación?',
    'Después de enviarla ya no se puede cambiar desde el celular. Las correcciones se hacen en la hoja de la DIGER.',
    [['si', 'Enviar', 'principal'], ['no', 'Volver', '']]);
  if (listo !== 'si') return;
  cancelarAutoguardado();             // un autoguardado pendiente volvería a crear el borrador ya enviado
  cargando(true, 'Preparando el envío…');
  try {
    const { datos, fotos } = await datosParaEnviar(a.id, a.datos);
    await DB.guardar('cola', {
      id: a.id, datos, fotos, solicitud: a.solicitud, encolado: new Date().toISOString(),
      subidas: [], num_formulario: '', intentos: 0, error: ''
    });
    await DB.borrar('borradores', a.id);          // las fotos se quedan: las necesita la cola
  } catch (e) {
    toast('No se pudo preparar el envío: ' + e.message, 'error');
    return;
  } finally { cargando(false); }
  APP.pestana = 'enviadas';
  await cerrarVistaFicha();
  if (!navigator.onLine) {
    toast('Sin señal: quedó en cola y se enviará sola.');
    enviarCola(true);
    return;
  }
  // La app NO se bloquea: el técnico ya puede seguir con la siguiente casa. Solo se
  // espera un momento para decirle en qué quedó. Con buena señal alcanza a salir y ve
  // "Evaluación enviada"; si no, se entera de que sigue sola y no se queda con la duda.
  toast('Enviando…');
  const envio = enviarCola(true);
  const termino = await Promise.race([
    envio.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 3000))
  ]);
  if (!termino) toast('Se sigue enviando sola. Puede continuar con la siguiente.');
}

let _enviando = false, _repetir = false;
async function enviarCola(silencioso) {
  // La nueva no estaba en la lista que ya se recorre: se pide otra vuelta al terminar
  // (antes esperaba hasta 10 minutos con el aviso "Enviando…").
  if (_enviando) { _repetir = true; return; }
  _enviando = true;
  let bien = 0, mal = 0;
  try {
    const cola = await DB.todos('cola');
    for (const item of cola) {
      try {
        await enviarUna(item);
        bien++;
      } catch (e) {
        mal++;
        item.intentos = (item.intentos || 0) + 1;
        item.error = e.delServidor ? e.message : 'Sin conexión';
        await DB.guardar('cola', item);
        if (!e.delServidor) break;                  // sin señal: no tiene caso seguir con las demás
      }
    }
  } finally {
    _enviando = false;
    await recargarLocales();
    pintarInicio();
  }
  if (_repetir) { _repetir = false; enviarCola(true); }
  if (!silencioso || bien) {
    if (bien) toast(bien === 1 ? 'Evaluación enviada' : bien + ' evaluaciones enviadas', 'ok');
    else if (mal && !silencioso) toast('No se pudo enviar. Se reintentará sola.', 'error');
  }
  return { bien, mal };
}

/**
 * Reintenta una llamada que falló POR LA RED (señal intermitente en campo),
 * esperando un poco más cada vez. Un error del servidor no se reintenta: si
 * dijo que no, insistir no cambia nada.
 *
 * (23/09) Antes, una sola foto que no respondía tumbaba el envío entero y la
 * evaluación quedaba en "RECIBIENDO FOTOS" hasta 10 minutos después. Repetir
 * es seguro: el servidor reconoce la foto por su nombre y no la duplica.
 */
async function conReintentoDeRed(fn, avisar) {
  for (let intento = 1; ; intento++) {
    try { return await fn(); }
    catch (e) {
      if (e.delServidor || intento >= 3) throw e;
      if (avisar) avisar(intento);
      await new Promise((r) => setTimeout(r, intento * 2000));
    }
  }
}

/**
 * Fotos que suben a la vez (27/09). Una por una, cada foto pagaba ~2,5 s de
 * arranque de Apps Script. Google da 30 ejecuciones simultáneas para TODOS
 * los evaluadores juntos (el servidor corre a nombre de una sola cuenta):
 * con 3, aguantan 10 evaluadores enviando al mismo tiempo.
 */
const FOTOS_A_LA_VEZ = 3;

/**
 * Fotos directo a Cloudflare (fase 1, 07/10/2026). Si guardar_evaluacion trae `subida`
 * ({ url, permiso }), cada foto va al Worker como ARCHIVO (no como texto base64: ~25 %
 * menos) en ~0,2-0,5 s, en vez de ~2,5 s por Google. El permiso lo firma Google y vale
 * 24 h; cada intento de envío empieza con guardar_evaluacion, así que siempre está fresco.
 * Un 4xx (permiso vencido, nombre raro) es "del servidor": insistir no cambia nada.
 */
async function pedirCloudflare(url, opciones, ms) {
  const control = new AbortController();
  const temp = setTimeout(() => control.abort(), ms || 45000);
  try {
    let res;
    try { res = await fetch(url, Object.assign({ signal: control.signal }, opciones || {})); }
    catch (e) {
      if (e && e.name === 'AbortError') {
        const t = new Error('El servidor de fotos tardó demasiado en responder.');
        t.tiempoAgotado = true;
        throw t;
      }
      throw e;
    }
    let j = null;
    try { j = await res.json(); } catch (e) { /* sin JSON: se informa abajo con el código */ }
    if (!res.ok || !j || !j.ok) {
      const err = new Error((j && j.error) || ('El servidor de fotos respondió ' + res.status + '.'));
      if (res.status >= 400 && res.status < 500) err.delServidor = true;
      throw err;
    }
    return j;
  } finally {
    clearTimeout(temp);
  }
}

/** "data:image/jpeg;base64,..." -> bytes, para mandar la foto como archivo. */
function bytesDe(dataUrl) {
  const bin = atob(String(dataUrl).split(',')[1] || '');
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

/** ¿Se puede entregar la evaluación a Cloudflare? (fase 3; en la demostración nunca). */
function recibeLaNube() {
  return typeof CONFIG !== 'undefined' && !CONFIG.DEMO && !!CONFIG.URL_NUBE;
}

/** /envio/guardar o /envio/cerrar del Worker, con lo mismo que api() le agrega a Google. */
function alaNube(paso, cuerpo) {
  return pedirCloudflare(CONFIG.URL_NUBE + '/envio/' + paso, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ codigo: APP.perfil ? APP.perfil.codigo : '', versionApp: VERSION_APP,
      esquema: Esquema.huella() }, cuerpo))
  }, 45000);
}

async function enviarUna(item) {
  item.error = 'Enviando…';
  await DB.guardar('cola', item);
  pintarInicio();

  const cuerpo = { id: item.id, datos: item.datos, fotosEsperadas: item.fotos.length };
  // Las de antes de la v54 que ya tienen número siguen por Google (Cloudflare no conoce ese número).
  if (!item.via && item.num_formulario) item.via = 'google';
  let r;
  if (item.via === 'nube') r = await alaNube('guardar', cuerpo);
  else if (item.via === 'google') r = await api('guardar_evaluacion', cuerpo);
  else {
    try {
      if (!recibeLaNube()) throw new Error('sin Cloudflare');
      r = await alaNube('guardar', cuerpo);
      item.via = 'nube';
    } catch (e) {
      // Cloudflare no la recibió (apagado, código que no conoce, sin respuesta): por Google.
      // Si Google tampoco responde, el camino queda sin fijar y el próximo intento prueba Cloudflare.
      try { r = await api('guardar_evaluacion', cuerpo); }
      catch (g) {
        // Se demoró o respondió raro: la petición SÍ llegó a Google y pudo darle número. Desde aquí, solo Google.
        if (g.tiempoAgotado || g.respuestaRara) item.via = 'google';
        throw g;
      }
      item.via = 'google';
    }
  }
  item.num_formulario = r.num_formulario;
  const nube = r.subida || null;          // fase 1: con esto las fotos van a Cloudflare
  const yaEstan = new Set(r.fotosRecibidas || []);
  if (nube) {
    // Las que ya llegaron a Cloudflare en un intento anterior (las de Drive vienen en fotosRecibidas).
    const l = await conReintentoDeRed(() => pedirCloudflare(nube.url + '/fotos/' + item.id + '?permiso=' + encodeURIComponent(nube.permiso)));
    (l.nombres || []).forEach((n) => yaEstan.add(n));
  }
  await DB.guardar('cola', item);

  // Completa en Cloudflare (se perdió la respuesta del cierre): no hay fotos que subir, solo cerrar otra vez.
  const pendientes = item.via === 'nube' && r.yaCompleta ? [] : item.fotos.filter((f) => !yaEstan.has(f.nombre));
  const perdidas = [];
  let hechas = item.fotos.length - pendientes.length;
  const avisar = (extra) => {
    item.error = 'Subiendo fotos: ' + hechas + ' de ' + item.fotos.length + (extra || '') + '…';
    pintarInicio();
  };

  /** Sube una foto. false si ya no estaba en el celular. */
  async function subirFoto(f) {
    const reg = await DB.leer('fotos', f.clave);
    // Se borró del celular (el sistema liberó espacio): no hay nada que subir.
    // No se sigue esperando: si no, la evaluación quedaba en cola para siempre.
    if (!reg) { perdidas.push(f.nombre); return false; }
    await conReintentoDeRed(
      () => (nube
        ? pedirCloudflare(nube.url + '/fotos/' + item.id + '/' + f.nombre + '?permiso=' + encodeURIComponent(nube.permiso),
          { method: 'PUT', headers: { 'Content-Type': reg.tipo, 'X-Campo': f.campo }, body: bytesDe(reg.dataUrl) }, 45000)
        : api('subir_foto', {
          id: item.id, campo: f.campo, nombre: f.nombre, tipo: reg.tipo,
          base64: reg.dataUrl.split(',')[1]
        }, 45000)),
      (intento) => avisar(' (reintento ' + intento + ')')
    );
    item.subidas.push(f.nombre);
    hechas++;
    avisar();
    await DB.guardar('cola', item);
    return true;
  }

  avisar();
  let i = 0;
  // La primera va SOLA cuando va a Drive y el servidor aún no tiene ninguna: es la que
  // crea la carpeta, y si arrancaran varias juntas cada una podía crear la suya.
  // En Cloudflare no hay carpeta que crear: arrancan juntas desde la primera.
  let hayCarpeta = !!nube || yaEstan.size > 0;
  while (!hayCarpeta && i < pendientes.length) hayCarpeta = await subirFoto(pendientes[i++]);

  // Las demás de a FOTOS_A_LA_VEZ. Si una falla no se arrancan más, pero las que
  // ya iban terminan y quedan anotadas: el próximo intento sube solo las que falten.
  let fallo = null;
  async function turno() {
    while (i < pendientes.length && !fallo) {
      const f = pendientes[i++];
      try { await subirFoto(f); } catch (e) { fallo = fallo || e; }
    }
  }
  await Promise.all(Array.from({ length: FOTOS_A_LA_VEZ }, turno));
  if (fallo) throw fallo;

  if (perdidas.length) console.warn('Fotos que ya no estaban en el celular:', item.id, perdidas);
  // El cierre es justo donde se quedaban trabadas ("RECIBIENDO FOTOS"): con
  // reintento, un tropiezo de señal aquí ya no deja la evaluación a medias.
  item.error = 'Cerrando el envío…';
  pintarInicio();
  const paraCerrar = { id: item.id, fotos: item.fotos.map((f) => f.nombre).filter((x) => perdidas.indexOf(x) === -1) };
  const cierre = await conReintentoDeRed(() => (item.via === 'nube' ? alaNube('cerrar', paraCerrar) : api('cerrar_evaluacion', paraCerrar)));
  if (cierre.faltan && cierre.faltan.length) {
    // El servidor no tiene todas: se queda en cola y el próximo intento
    // sube solo las que faltan (guardar_evaluacion dice cuáles ya están).
    const e = new Error('Al servidor le faltan ' + cierre.faltan.length + ' fotos; se reintentará.');
    e.delServidor = true;
    throw e;
  }

  // Queda en el historial local hasta que la próxima sincronización lo traiga del servidor.
  const enviadas = (await DB.leerKV('enviadasLocal')) || [];
  enviadas.unshift(Object.assign({ id: item.id, num_formulario: item.num_formulario, ficha_url: cierre.ficha_url || '' },
    resumenDeDatos(item.datos)));
  await DB.guardarKV('enviadasLocal', enviadas.slice(0, 200));
  await DB.borrar('cola', item.id);
  for (const f of await DB.fotosDe(item.id)) await DB.borrar('fotos', f.clave);
}

/**
 * Cuánto espera el catálogo. Con 432 evaluaciones y 250 solicitudes tarda ~7 s
 * (medido 02/10; 3,1 s son el arranque de Google), pero Google a veces se pone
 * lento (se vio una llamada de 153 s): rendirse a los 45 s y volver a pedirlo
 * solo sumaba carga.
 */
const ESPERA_CATALOGO = 90000;
let _resincronizar = false;
let _reintentosPrimera = 0;

/** Qué decirle a la persona cuando una llamada al servidor no resultó. */
function explicarFallo(e) {
  if (e.delServidor) return e.message;
  if (!navigator.onLine) return 'Sin conexión.';
  if (e.tiempoAgotado || e.respuestaRara) return 'El servidor está lento o muy ocupado.';
  return 'No se pudo conectar con el servidor.';
}

/**
 * Catálogo desde Cloudflare (fase 2, 08/10/2026): una copia de la hoja que responde en
 * menos de 1 s, y "sin cambios" si la versión es la misma. null = pedírselo a Google,
 * como antes: sin señal, Cloudflare caído, puente detenido (usarGoogle) o código que
 * Cloudflare no reconoce (Google es el dueño de los códigos y lo confirma).
 */
const ESPERA_NUBE = 15000;
async function catalogoDeLaNube() {
  try {
    if (CONFIG.DEMO || !CONFIG.URL_NUBE) return null;
    return await pedirCloudflare(CONFIG.URL_NUBE + '/catalogo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ codigo: APP.perfil ? APP.perfil.codigo : '', version: APP.versionCatalogo || '' }, quienSoy()))
    }, ESPERA_NUBE);
  } catch (e) {
    return null;
  }
}

/**
 * Cambió quién usa el celular (ingresar, Mis datos, Salir): la versión se olvida en memoria
 * Y en lo guardado. Si no, al reabrir la app Cloudflare respondería "sin cambios" y quedaría
 * la lista filtrada para la persona anterior (revisión 08/10).
 */
async function olvidarVersion() {
  APP.versionCatalogo = '';
  const cat = await DB.leerKV('catalogo');
  if (cat && cat.version) await DB.guardarKV('catalogo', Object.assign(cat, { version: '' }));
}

/** Cloudflare dice que nada cambió: lo guardado sigue valiendo; solo cambia la hora. */
async function marcarSinCambios(ms) {
  APP.ultimaSync = new Date().toISOString();
  APP.ultimaSyncMs = ms || null;
  APP.primeraSyncFallo = false;
  const cat = (await DB.leerKV('catalogo')) || {};
  await DB.guardarKV('catalogo', Object.assign(cat, { cuando: APP.ultimaSync, ms: APP.ultimaSyncMs }));
}

/** Deja el catálogo en la app y en el celular. ms: lo que tardó, para verlo en el estado. */
async function aplicarCatalogo(r, ms) {
  APP.solicitudes = r.solicitudes || [];
  APP.historial = r.evaluaciones || [];
  APP.versionCatalogo = r.version || '';          // el de Google no trae versión: la próxima, Cloudflare manda todo
  await guardarListas(r.listas);
  APP.ultimaSync = new Date().toISOString();
  APP.ultimaSyncMs = ms || null;
  APP.primeraSyncFallo = false;
  _reintentosPrimera = 0;
  await DB.guardarKV('catalogo', { solicitudes: APP.solicitudes, historial: APP.historial, cuando: APP.ultimaSync, ms: APP.ultimaSyncMs,
    version: APP.versionCatalogo });
  // Lo que el servidor ya devuelve deja de hacer falta en el historial local.
  const ids = new Set(APP.historial.map((h) => h.id));
  const locales = ((await DB.leerKV('enviadasLocal')) || []).filter((e) => !ids.has(e.id));
  await DB.guardarKV('enviadasLocal', locales);
}

/** Quien nunca logró descargar su lista: se reintenta sola, 3 veces, cada 10 s. */
function reintentarPrimera() {
  if (_reintentosPrimera >= 3 || !navigator.onLine) return;
  _reintentosPrimera++;
  setTimeout(() => { if (!APP.ultimaSync) sincronizar(true); }, 10000);
}

async function sincronizar(silencioso) {
  if (APP.sincronizando || !APP.perfil) return;
  APP.sincronizando = true;
  pintarConexion();
  if (!APP.ultimaSync) pintarInicio();      // persona nueva: que la lista diga "Descargando…", no "sin visitas"
  // (02/10) La cola se envía DE FONDO. Antes se esperaba aquí: con mala señal cada foto
  // espera 45 s por intento (3 intentos) y el catálogo ni siquiera se pedía; la app
  // decía "Sincronizando…" durante minutos. Si algo se envió, se vuelve a sincronizar
  // al terminar para traer lo recién enviado.
  enviarCola(true).then((r) => {
    if (!r || !r.bien) return;
    if (APP.sincronizando) _resincronizar = true; else sincronizar(true);
  }, () => {});
  try {
    const t0 = Date.now();
    const n = await catalogoDeLaNube();
    if (n && n.sinCambios) await marcarSinCambios(Date.now() - t0);
    else if (n) await aplicarCatalogo(n, Date.now() - t0);
    else await aplicarCatalogo(await api('catalogo', quienSoy(), ESPERA_CATALOGO), Date.now() - t0);
    if (!silencioso) toast('Sincronizado', 'ok');
  } catch (e) {
    if (!APP.ultimaSync) { APP.primeraSyncFallo = true; reintentarPrimera(); }
    if (!silencioso) toast(e.delServidor ? e.message : explicarFallo(e) + ' Trabajando con lo guardado.', 'error');
  } finally {
    APP.sincronizando = false;
    await recargarLocales();
    pintarInicio();
    pintarConexion();
    aplicarVersionSiSePuede();            // una versión nueva que esperaba a que terminara
    if (_resincronizar) { _resincronizar = false; sincronizar(true); }
  }
}

function estadoDeConexion() {
  const enCola = APP.cola.length;
  const cuando = APP.ultimaSync ? fechaBonita(APP.ultimaSync) : 'nunca';
  let t = (navigator.onLine ? '' : 'Sin señal · ') + 'Última sincronización: ' + cuando;
  if (APP.ultimaSync && APP.ultimaSyncMs) t += ' (' + Math.max(1, Math.round(APP.ultimaSyncMs / 1000)) + ' s)';
  if (enCola) t += ' · ' + enCola + (enCola === 1 ? ' por enviar' : ' por enviar');
  return t;
}

function pintarConexion() {
  const el = $('#estado-conexion');
  if (el) el.textContent = APP.sincronizando ? 'Sincronizando…' : estadoDeConexion();
  const ic = $('#btn-sync');
  if (ic) ic.classList.toggle('girando', APP.sincronizando);
}
