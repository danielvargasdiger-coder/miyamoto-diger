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
    if (!c || (c.tipo !== 'fotos' && c.tipo !== 'croquis')) continue;
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
  clearTimeout(_autoguardado);        // un autoguardado pendiente volvería a crear el borrador ya enviado
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
  toast(navigator.onLine ? 'Enviando…' : 'Sin señal: quedó en cola y se enviará sola.');
  enviarCola(true);
}

let _enviando = false;
async function enviarCola(silencioso) {
  if (_enviando) return;
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
  if (!silencioso || bien) {
    if (bien) toast(bien === 1 ? 'Evaluación enviada' : bien + ' evaluaciones enviadas', 'ok');
    else if (mal && !silencioso) toast('No se pudo enviar. Se reintentará sola.', 'error');
  }
  return { bien, mal };
}

async function enviarUna(item) {
  item.error = 'Enviando…';
  await DB.guardar('cola', item);
  pintarInicio();

  const r = await api('guardar_evaluacion', { id: item.id, datos: item.datos, fotosEsperadas: item.fotos.length });
  item.num_formulario = r.num_formulario;
  const yaEstan = new Set(r.fotosRecibidas || []);
  await DB.guardar('cola', item);

  let n = 0;
  for (const f of item.fotos) {
    n++;
    if (yaEstan.has(f.nombre)) continue;
    const reg = await DB.leer('fotos', f.clave);
    if (!reg) continue;                              // se borró del celular: no hay nada que subir
    item.error = 'Subiendo foto ' + n + ' de ' + item.fotos.length + '…';
    pintarInicio();
    await api('subir_foto', {
      id: item.id, campo: f.campo, nombre: f.nombre, tipo: reg.tipo,
      base64: reg.dataUrl.split(',')[1]
    }, 90000);
    item.subidas.push(f.nombre);
    await DB.guardar('cola', item);
  }

  const cierre = await api('cerrar_evaluacion', { id: item.id, fotos: item.fotos.map((f) => f.nombre) });
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

async function sincronizar(silencioso) {
  if (APP.sincronizando || !APP.perfil) return;
  APP.sincronizando = true;
  pintarConexion();
  try {
    await enviarCola(true);
    const r = await api('catalogo', {});
    APP.solicitudes = r.solicitudes || [];
    APP.historial = r.evaluaciones || [];
    APP.ultimaSync = new Date().toISOString();
    await DB.guardarKV('catalogo', { solicitudes: APP.solicitudes, historial: APP.historial, cuando: APP.ultimaSync });
    // Lo que el servidor ya devuelve deja de hacer falta en el historial local.
    const ids = new Set(APP.historial.map((h) => h.id));
    const locales = ((await DB.leerKV('enviadasLocal')) || []).filter((e) => !ids.has(e.id));
    await DB.guardarKV('enviadasLocal', locales);
    if (!silencioso) toast('Sincronizado', 'ok');
  } catch (e) {
    if (!silencioso) toast(e.delServidor ? e.message : 'Sin conexión. Trabajando con lo guardado.', 'error');
  } finally {
    APP.sincronizando = false;
    await recargarLocales();
    pintarInicio();
    pintarConexion();
  }
}

function estadoDeConexion() {
  const enCola = APP.cola.length;
  const cuando = APP.ultimaSync ? fechaBonita(APP.ultimaSync) : 'nunca';
  let t = (navigator.onLine ? '' : 'Sin señal · ') + 'Última sincronización: ' + cuando;
  if (enCola) t += ' · ' + enCola + (enCola === 1 ? ' por enviar' : ' por enviar');
  return t;
}

function pintarConexion() {
  const el = $('#estado-conexion');
  if (el) el.textContent = APP.sincronizando ? 'Sincronizando…' : estadoDeConexion();
  const ic = $('#btn-sync');
  if (ic) ic.classList.toggle('girando', APP.sincronizando);
}
