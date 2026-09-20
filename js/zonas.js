/* =========================================================================
   BARRIOS Y VEREDAS — en qué polígono cayó la ubicación.

   Los datos (datos/zonas.json, ~240 KB) salen de las capas oficiales de la
   Alcaldía con herramientas/armar_zonas.py y viajan DENTRO de la app: en
   campo casi nunca hay señal, así que no se puede preguntar a un servidor.

   El archivo se carga una sola vez, cuando se necesita (no al abrir la app),
   y el service worker lo guarda como cualquier otro archivo.
   ========================================================================= */
'use strict';

const ZONAS = { datos: null, cargando: null, falló: false };

/** Nombres oficiales, sin repetidos y en orden alfabético. */
function nombresDe(zonas) {
  const vistos = new Set();
  zonas.forEach((z) => vistos.add(z.n));
  return [...vistos].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Lista para el selector: [{ grupo, tipo, nombres:[...] }], ordenada por
 * grupo (comuna o corregimiento) y por nombre. Con `tipo` se sabe si lo
 * elegido es urbano o rural.
 */
function gruposDeZonas() {
  const j = ZONAS.datos;
  if (!j) return [];
  const mapa = new Map();
  const meter = (z, tipo) => {
    const clave = tipo + '|' + (z.g || 'Sin grupo');
    if (!mapa.has(clave)) mapa.set(clave, { grupo: z.g || 'Sin grupo', tipo, nombres: new Set() });
    mapa.get(clave).nombres.add(z.n);
  };
  j.barrios.forEach((z) => meter(z, 'urbano'));
  j.veredas.forEach((z) => meter(z, 'rural'));
  return [...mapa.values()]
    .map((g) => ({ grupo: g.grupo, tipo: g.tipo, nombres: [...g.nombres].sort((a, b) => a.localeCompare(b, 'es')) }))
    .sort((a, b) => (a.tipo === b.tipo ? a.grupo.localeCompare(b.grupo, 'es') : (a.tipo === 'urbano' ? -1 : 1)));
}

/** Carga datos/zonas.json una sola vez. Si no se puede, devuelve null. */
async function cargarZonas() {
  if (ZONAS.datos) return ZONAS.datos;
  if (ZONAS.falló) return null;
  if (!ZONAS.cargando) {
    ZONAS.cargando = fetch('datos/zonas.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => {
        ZONAS.datos = j;
        // El esquema necesita los nombres para validar que el barrio sea uno real.
        // (En las pruebas de node el esquema puede no estar cargado.)
        if (typeof Esquema !== 'undefined' && Esquema.ponerNombresZona) {
          Esquema.ponerNombresZona(nombresDe(j.barrios), nombresDe(j.veredas));
        }
        return j;
      })
      .catch((e) => { console.warn('Zonas no disponibles:', e); ZONAS.falló = true; return null; });
  }
  return ZONAS.cargando;
}

/**
 * ¿El punto está dentro del anillo? El anillo viene comprimido: pares de
 * deltas en diezmilésimas de grado (ver armar_zonas.py). Se recorre sin
 * armar el arreglo de puntos, que para 487 barrios sería mucha memoria.
 * Algoritmo de cruce de rayos (par/impar).
 */
function dentroDelAnillo(anillo, escala, x, y) {
  let dentro = false;
  let ax = 0, ay = 0, px = 0, py = 0, primero = true;
  let x0 = 0, y0 = 0;
  for (let i = 0; i < anillo.length; i += 2) {
    ax += anillo[i]; ay += anillo[i + 1];
    const cx = ax / escala, cy = ay / escala;
    if (primero) { x0 = cx; y0 = cy; px = cx; py = cy; primero = false; continue; }
    if ((cy > y) !== (py > y) && x < (px - cx) * (y - cy) / (py - cy) + cx) dentro = !dentro;
    px = cx; py = cy;
  }
  // Cierra el anillo con el primer punto, por si el archivo no lo repite.
  if ((y0 > y) !== (py > y) && x < (px - x0) * (y - y0) / (py - y0) + x0) dentro = !dentro;
  return dentro;
}

/** Par/impar entre todos los anillos: así los huecos (un barrio dentro de otro) restan. */
function dentroDeZona(zona, escala, x, y) {
  const c = zona.c;
  if (x < c[0] || x > c[2] || y < c[1] || y > c[3]) return false;
  let dentro = false;
  for (const anillo of zona.p) if (dentroDelAnillo(anillo, escala, x, y)) dentro = !dentro;
  return dentro;
}

/**
 * Busca el barrio (urbano) y, si no, la vereda (rural).
 * Devuelve { zona: 'urbano'|'rural', nombre, grupo } o null.
 */
async function buscarZonaDePunto(lat, lon) {
  const j = await cargarZonas();
  if (!j) return null;
  const escala = Math.pow(10, j.decimales);
  const x = Number(lon), y = Number(lat);
  if (!isFinite(x) || !isFinite(y)) return null;
  for (const z of j.barrios) if (dentroDeZona(z, escala, x, y)) return { zona: 'urbano', nombre: z.n, grupo: z.g };
  for (const z of j.veredas) if (dentroDeZona(z, escala, x, y)) return { zona: 'rural', nombre: z.n, grupo: z.g };
  return null;
}

/**
 * Llena Zona y Barrio/Vereda con la ubicación recién tomada. Es una AYUDA:
 * lo escrito a mano por el evaluador no se pisa, y lo que ponga la app se
 * puede cambiar. Devuelve true si cambió algo (para volver a dibujar).
 */
async function completarZonaPorUbicacion(datos, forzar) {
  const u = datos.ubicacion;
  if (!u || u.lat == null) return false;
  const r = await buscarZonaDePunto(u.lat, u.lon);
  if (!r) { delete datos.zona_auto; return false; }
  const escrito = datos.barrio_vereda && datos.barrio_vereda !== datos.zona_auto;
  if (escrito && !forzar) return false;
  const cambió = datos.barrio_vereda !== r.nombre || datos.zona !== r.zona;
  datos.barrio_vereda = r.nombre;
  datos.zona = r.zona;
  datos.zona_auto = r.nombre;          // marca de "lo puso la app"
  return cambió;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { cargarZonas, buscarZonaDePunto, completarZonaPorUbicacion, dentroDeZona, gruposDeZonas };
