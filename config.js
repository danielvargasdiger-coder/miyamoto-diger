/**
 * CONFIGURACIÓN DE LA APP — Evaluación de daños (formato Miyamoto) · DIGER Pereira
 * ================================================================================
 *
 * UN solo archivo para producción Y pruebas. La app decide sola cuál usar
 * mirando su propia dirección:
 *   .../miyamoto-diger/           -> produccion
 *   .../miyamoto-diger/pruebas/   -> pruebas
 *   localhost / 127.0.0.1         -> pruebas
 *
 * Por qué: en taludes había un config.js por entorno y un día se subieron
 * los de pruebas a la raíz; producción quedó hablándole al servidor de
 * pruebas. Con un solo archivo, copiar la carpeta entera a /pruebas/ es
 * seguro: no hay nada que cambiar ni que se pueda cruzar.
 *
 * Si API_URL está vacío, la app funciona en MODO DEMOSTRACIÓN: se puede
 * llenar todo, ver la ficha y "enviar", pero nada sale del celular.
 */
var CONFIG = (function () {
  var SERVIDORES = {
    // Pegar aquí la URL /exec de cada implementación de Apps Script.
    produccion: 'https://script.google.com/macros/s/AKfycbzUkYVX6Otl421kpg6raRmfCb1efuJti3OHIRX8kP4ObvVF6uoF7lhOVXrvjqrUOGU/exec',
    pruebas: ''
  };

  var ruta = (self.location && self.location.pathname) || '';
  var host = (self.location && self.location.hostname) || '';
  var local = host === 'localhost' || host === '127.0.0.1';
  var entorno = (ruta.indexOf('/pruebas/') !== -1 || local) ? 'pruebas' : 'produccion';
  var api = SERVIDORES[entorno];

  return {
    ENTORNO: entorno,
    API_URL: api,
    DEMO: !api,

    /** Nombre corto de la app y de la entidad que la usa. */
    NOMBRE_APP: 'Evaluación de daños',
    ENTIDAD: 'DIGER Pereira',

    /** Dirección pública para compartir (y para el QR, cuando se haga). */
    URL_PUBLICA: 'https://danielvargasdiger-coder.github.io/miyamoto-diger/',

    /** Fotos: mismo punto medido en taludes (1200 px / 0.60 ~ 237 KB por foto). */
    ANCHO_MAX_FOTO: 1200,
    CALIDAD_FOTO: 0.60,

    /** Croquis: se guarda en PNG a este ancho. */
    ANCHO_CROQUIS: 1000,

    MINUTOS_AUTOSYNC: 10,
    MINUTOS_BUSCAR_ACTUALIZACION: 15,

    /** GPS: igual que taludes — escucha y se queda con la mejor lectura. */
    GPS_PRECISION_OBJETIVO: 8,
    GPS_SEGUNDOS_MAX: 20
  };
})();
