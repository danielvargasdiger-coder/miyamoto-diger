/* =========================================================================
   BASE — estado, almacenamiento local, utilidades y conexión al servidor.
   Lo cargan todos los demás archivos de js/.
   ========================================================================= */
'use strict';

const VERSION_APP = 'miyamoto-30';     // subirla junto con VERSION en sw.js

const APP = {
  perfil: null,          // { codigo, entidad, nombre, tipo_doc, num_doc, id_evaluador, matricula, dependencia }
  solicitudes: [],       // lo que la DIGER programó para visitar (del servidor)
  historial: [],         // evaluaciones ya recibidas por el servidor
  borradores: [],        // evaluaciones a medio llenar en ESTE celular
  cola: [],              // evaluaciones terminadas esperando envío
  actual: null,          // { id, datos, solicitud, seccion, alAbrir }
  pestana: 'porEvaluar',
  vista: 'lista',        // lista | mapa | tablero
  busqueda: '',          // lo escrito en el buscador (filtra Visitas, Mapa y Tablero)
  ultimaSync: null,
  sincronizando: false,
  huellaServidor: null
};

const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

// ---------------------------------------------------------------- ALMACÉN LOCAL
/**
 * IndexedDB. Producción y pruebas viven en el mismo dominio: el nombre de la
 * base lleva el entorno para que una ficha de prueba jamás caiga en la cola
 * real (en taludes eso se resolvía a mano con CONFIG.ESPACIO).
 */
const NOMBRE_BD = 'miyamoto-' + CONFIG.ENTORNO;

const DB = {
  _db: null,
  async abrir() {
    if (this._db) return this._db;
    this._db = await new Promise((ok, fallo) => {
      const req = indexedDB.open(NOMBRE_BD, 1);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        db.createObjectStore('kv');
        db.createObjectStore('borradores', { keyPath: 'id' });
        db.createObjectStore('cola', { keyPath: 'id' });
        const f = db.createObjectStore('fotos', { keyPath: 'clave' });
        f.createIndex('idEval', 'idEval');
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fallo(req.error);
    });
    return this._db;
  },
  async _tx(almacen, modo, fn) {
    const db = await this.abrir();
    return new Promise((ok, fallo) => {
      const tx = db.transaction(almacen, modo);
      const req = fn(tx.objectStore(almacen));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => fallo(tx.error);
      tx.onabort = () => fallo(tx.error || new Error('Almacenamiento lleno o bloqueado'));
    });
  },
  guardar: (almacen, valor) => DB._tx(almacen, 'readwrite', (s) => s.put(valor)),
  leer: (almacen, clave) => DB._tx(almacen, 'readonly', (s) => s.get(clave)),
  borrar: (almacen, clave) => DB._tx(almacen, 'readwrite', (s) => s.delete(clave)),
  todos: (almacen) => DB._tx(almacen, 'readonly', (s) => s.getAll()),
  fotosDe: (idEval) => DB._tx('fotos', 'readonly', (s) => s.index('idEval').getAll(idEval)),
  guardarKV: (clave, valor) => DB._tx('kv', 'readwrite', (s) => s.put(valor, clave)),
  leerKV: (clave) => DB._tx('kv', 'readonly', (s) => s.get(clave))
};

// ---------------------------------------------------------------- ICONOS
/**
 * Iconos de trazo, nunca caracteres: en taludes ←, ☰, 📞 y ⋮ salían
 * distintos (o como un cuadrito) según el celular.
 */
const ICONOS = {
  atras: '<path d="M15 18l-6-6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  derecha: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
  alerta: '<path d="M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17v.01"/>',
  telefono: '<path d="M5 4h3.5l1.8 4.4-2.2 1.4a11 11 0 0 0 6.1 6.1l1.4-2.2L20 15.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  ubicacion: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
  lapiz: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l2 2"/>',
  camara: '<path d="M4 8h3l1.8-2.5h6.4L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  galeria: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-10 9"/>',
  documento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  sincronizar: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
  basura: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  borrador: '<path d="M16 3l5 5-11 11H5v-5L16 3z"/><path d="M4 21h16"/>',
  enviar: '<path d="M4 12l16-8-6 16-3-7-7-1z"/>',
  edificio: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18"/><path d="M8 7h1M11 7h1M8 10.5h1M11 10.5h1M8 14h1M11 14h1"/>',
  salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  descargar: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  ruta: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};

function icono(nombre) {
  const t = ICONOS[nombre];
  return t ? '<svg class="ico ico-' + nombre + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + t + '</svg>' : '';
}

// ---------------------------------------------------------------- UTILIDADES
function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(texto, tipo) {
  const t = $('#toast');
  t.textContent = texto;
  t.className = 'toast visible ' + (tipo || '');
  clearTimeout(toast._r);
  toast._r = setTimeout(() => { t.className = 'toast'; }, tipo === 'error' ? 6000 : 3200);
}

function cargando(mostrar, texto) {
  $('#cargando').hidden = !mostrar;
  if (texto) $('#cargando-texto').textContent = texto;
}

/** Fecha-hora local para <input type="datetime-local"> (sin zona). */
function ahoraLocal(fecha) {
  const d = fecha || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fechaBonita(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Identificador de la evaluación, creado EN EL CELULAR al abrir la ficha.
 * El servidor guarda por este id: si el celular reintenta un envío que sí
 * había llegado, actualiza la misma fila en vez de crear otra. En taludes
 * el id lo ponía el servidor y cada reintento dejaba una fila huérfana.
 */
function nuevoId() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'MIY-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + azar;
}

function iniciales(nombre) {
  return String(nombre || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

const COLOR_CLASIF = { habitable: 'verde', uso_restringido: 'amarillo', no_habitable: 'rojo' };
const NOMBRE_COLOR = { verde: 'Habitable', amarillo: 'Uso restringido', rojo: 'No habitable' };

// ---------------------------------------------------------------- SERVIDOR
/**
 * Llamada al servidor. text/plain a propósito: Apps Script no responde
 * la consulta previa (CORS) que haría un application/json.
 */
async function api(accion, carga, msTimeout) {
  if (CONFIG.DEMO) return apiDemo(accion, carga || {});
  const control = new AbortController();
  const temp = setTimeout(() => control.abort(), msTimeout || 45000);
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({
        accion: accion,
        codigo: APP.perfil ? APP.perfil.codigo : '',
        versionApp: VERSION_APP,
        esquema: Esquema.huella()
      }, carga || {})),
      signal: control.signal,
      redirect: 'follow'
    });
    const texto = await res.text();
    let json;
    try { json = JSON.parse(texto); }
    catch (e) { throw new Error('El servidor respondió algo inesperado. ¿La app web está publicada para "Cualquier usuario"?'); }
    if (json.esquema) APP.huellaServidor = json.esquema;
    if (!json.ok) {
      const err = new Error(json.error || 'Error del servidor');
      err.delServidor = true;             // hubo señal: el problema es de esta ficha
      if (json.codigoInvalido) { err.codigoInvalido = true; pedirCodigoDeNuevo(); }
      throw err;
    }
    return json;
  } finally {
    clearTimeout(temp);
  }
}

/**
 * Servidor de mentira para el MODO DEMOSTRACIÓN (API_URL vacío). Permite
 * probar la app completa —y mostrársela a los ingenieros— antes de montar
 * el servidor. Contesta con la misma forma que el servidor real.
 */
async function apiDemo(accion, p) {
  await new Promise((r) => setTimeout(r, 350));
  const leer = async () => (await DB.leerKV('demo-servidor')) || { n: 0, evaluaciones: {} };
  const s = await leer();
  switch (accion) {
    case 'listas':
      return { ok: true, listas: s.listas || { entidades: [CONFIG.ENTIDAD_FICHA], dependencias: [{ valor: CONFIG.DEPENDENCIA, entidad: CONFIG.ENTIDAD_FICHA }] } };
    case 'ingresar': {
      if (!p.codigo && !APP.perfil) throw new Error('Escriba un código');
      // Imitación sencilla de la lista del servidor: agrega lo nuevo, sin duplicar por mayúsculas o tildes.
      const l = s.listas || { entidades: [CONFIG.ENTIDAD_FICHA], dependencias: [{ valor: CONFIG.DEPENDENCIA, entidad: CONFIG.ENTIDAD_FICHA }] };
      const igual = (a, b) => Esquema.normalizarTexto(a) === Esquema.normalizarTexto(b);
      let ent = p.entidad_ficha, dep = p.dependencia;
      if (ent) { const e = l.entidades.find((x) => igual(x, ent)); if (e) ent = e; else l.entidades.push(ent); }
      if (dep) { const d = l.dependencias.find((x) => igual(x.valor, dep)); if (d) dep = d.valor; else l.dependencias.push({ valor: dep, entidad: ent }); }
      s.listas = l;
      await DB.guardarKV('demo-servidor', s);
      return { ok: true, entidad: CONFIG.ENTIDAD, entidad_ficha: ent, dependencia: dep, listas: l, esquema: Esquema.huella() };
    }
    case 'catalogo': {
      // Las enviadas en la demostración, más (con ?demo=1) las de ejemplo del equipo.
      const yo = p.nombre || (APP.perfil && APP.perfil.nombre) || '';
      const propias = Object.values(s.evaluaciones).map((ev) => { const x = Object.assign({}, ev); delete x.datos; delete x.fotosData; return x; });
      const conDatos = CONFIG.DEMO_CON_DATOS;
      const hechas = new Set(propias.map((e) => e.id_solicitud).filter(Boolean));
      return {
        ok: true,
        solicitudes: (conDatos ? Demo.solicitudes(yo) : SOLICITUDES_DEMO).filter((x) => !hechas.has(x.id_solicitud)),
        evaluaciones: propias.concat(conDatos ? Demo.evaluaciones(yo) : []),
        esquema: Esquema.huella()
      };
    }
    case 'guardar_evaluacion': {
      let ev = s.evaluaciones[p.id];
      // Aleatorio, como en el servidor.
      if (!ev) { s.n++; ev = { id: p.id, num_formulario: Demo.numeroDemo(), fotos: [] }; }
      Object.assign(ev, resumenDeDatos(p.datos), { id: p.id, fotos: ev.fotos, datos: p.datos, fotosData: ev.fotosData || {} });
      s.evaluaciones[p.id] = ev;
      await DB.guardarKV('demo-servidor', s);
      return { ok: true, num_formulario: ev.num_formulario, fotosRecibidas: ev.fotos };
    }
    case 'subir_foto': {
      const ev = s.evaluaciones[p.id];
      if (ev && ev.fotos.indexOf(p.nombre) === -1) ev.fotos.push(p.nombre);
      if (ev) ev.fotosData[p.nombre] = 'data:' + (p.tipo || 'image/jpeg') + ';base64,' + p.base64;   // para abrir su ficha después
      await DB.guardarKV('demo-servidor', s);
      return { ok: true };
    }
    case 'cerrar_evaluacion': {
      const ev = s.evaluaciones[p.id];
      if (ev) { ev.ficha_url = '#demo-ficha=' + p.id; ev.estado = 'COMPLETA'; await DB.guardarKV('demo-servidor', s); }
      return { ok: true, estado: 'COMPLETA', faltan: [], ficha_url: '#demo-ficha=' + p.id };
    }
    case 'pdf_evaluacion': {
      const e = new Error('En la demostración el PDF no se arma en el servidor: toque «Abrir ficha» y luego «Imprimir / PDF».');
      e.delServidor = true;
      throw e;
    }
    default:
      throw new Error('Acción no disponible en demostración: ' + accion);
  }
}

/**
 * "Cómo llegar": abre Google Maps (o la app de mapas) con la ruta. Con
 * coordenadas va al punto exacto; si no, busca la dirección.
 */
function urlComoLlegar(s) {
  const destino = Esquema.coordenadaValida(s.lat, s.lon) ? s.lat + ',' + s.lon
    : [s.direccion, s.barrio, s.municipio || 'Pereira', 'Risaralda'].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destino);
}

// ---------------------------------------------------------------- BÚSQUEDA
/**
 * Un solo buscador para Visitas, Mapa y Tablero. Busca en lo que ya está en
 * el celular (al instante y sin señal): sin importar tildes ni mayúsculas, y
 * con varias palabras todas deben aparecer ("cuba 12" encuentra "Mz 4 Cs 12,
 * Cuba"). Alcanza a las 800 evaluaciones más recientes que baja la
 * sincronización; las más viejas se buscan en la hoja de Google.
 */
function coincideBusqueda() {
  const q = Esquema.normalizarTexto(APP.busqueda);
  if (!q) return true;
  const texto = Esquema.normalizarTexto(Array.prototype.slice.call(arguments).filter((x) => x != null && x !== '').join(' '));
  return q.split(/\s+/).every((p) => texto.indexOf(p) !== -1);
}

function coincideSolicitud(s) {
  return coincideBusqueda(s.id_solicitud, s.direccion, s.barrio, s.municipio, s.contacto, s.telefono, s.descripcion, s.asignado);
}

function coincideEvaluacion(h) {
  return coincideBusqueda(h.num_formulario, h.direccion, h.barrio, h.municipio, h.evaluador, h.id_solicitud);
}

/** Quién es, para el registro de TECNICOS y para recibir solo sus visitas asignadas. */
function quienSoy() {
  const p = APP.perfil || {};
  return { nombre: p.nombre || '', tipo_doc: p.tipo_doc || '', num_doc: p.num_doc || '', matricula: p.matricula || '',
    entidad_ficha: p.entidad_ficha || '', dependencia: p.dependencia || '' };
}

/** Lo mínimo para listar y ubicar una evaluación sin abrirla. */
function resumenDeDatos(d) {
  d = d || {};
  const u = d.ubicacion || {};
  return {
    fecha: d.fecha_hora_inspeccion || '',
    direccion: d.direccion || '',
    barrio: d.barrio_vereda || '',
    municipio: d.municipio ? Esquema.etiquetaDe('municipio', d.municipio) : '',
    clasif: d.clasif_habitabilidad || '',
    nivel: d.nivel_dano || '',
    lat: u.lat || '', lon: u.lon || '',
    evaluador: d.eval_nombre || '',
    id_solicitud: d.id_solicitud || ''
  };
}

const SOLICITUDES_DEMO = [
  { id_solicitud: 'SOL-DEMO-1', prioridad: 'ALTA', direccion: 'Cra 7 # 18-40', barrio: 'Centro', municipio: 'Pereira',
    contacto: 'María López', telefono: '3001234567', descripcion: 'Grietas en muros tras el sismo', lat: 4.8143, lon: -75.6946 },
  { id_solicitud: 'SOL-DEMO-2', prioridad: 'MEDIA', direccion: 'Mz 4 Cs 12', barrio: 'Cuba', municipio: 'Pereira',
    contacto: 'Jorge Ruiz', telefono: '3109876543', descripcion: 'Desprendimiento de cielo raso', lat: 4.7937, lon: -75.7327 }
];
