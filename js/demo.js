/* =========================================================================
   DEMOSTRACIÓN — datos de ejemplo para mostrar la app llena
   (…/miyamoto-diger/?demo=1, o el enlace de la pantalla de ingreso).

   TODO ES INVENTADO Y NADA SALE DEL CELULAR: no hay servidor, la base local
   es otra ('miyamoto-demo') y no se cruza con la real. Nombres, direcciones
   y teléfonos son de mentira; las coordenadas caen en barrios de Pereira
   para que el mapa se vea bien.

   Las evaluaciones se arman con el MISMO esquema del formulario y se
   comprueba (verificaciones/probar_demo.js) que estén completas y que la
   habitabilidad coincida con la sugerencia de los colores: así la ficha de
   ejemplo sale igual a una real. Las fotos y firmas se dibujan aquí mismo.
   ========================================================================= */
'use strict';

var Demo = (function () {
  var E = typeof Esquema !== 'undefined' ? Esquema : require('./esquema.js');

  var PERFIL = {
    nombre: 'Laura Restrepo Ocampo', tipo_doc: 'cc', num_doc: '1088000001', matricula: '66202-00001 RSD',
    entidad_ficha: 'Alcaldía de Pereira', dependencia: 'DIGER'
  };

  /** Equipo de ejemplo. El primero se reemplaza por quien ingresó a la demostración. */
  var EQUIPO = [
    ['@yo', '1088000001'], ['Carlos Andrés Mejía', '1088000002'], ['Diana Marcela Ríos', '1088000003'],
    ['Julián Osorio Cardona', '1088000004'], ['Paula Andrea Giraldo', '1088000005']
  ];

  // Coordenadas de OpenStreetMap (Nominatim, consultadas el 18/09/2026) para que cada punto caiga en su barrio.
  var BARRIOS = [
    ['Centro', 4.8135, -75.6952], ['Cuba', 4.8048, -75.7395], ['Boston', 4.8000, -75.6970], ['Villavicencio', 4.8115, -75.6842],
    ['Kennedy', 4.8088, -75.6725], ['San Nicolás', 4.8080, -75.7040], ['Pinares de San Martín', 4.8038, -75.6877],
    ['Villa Santana', 4.7959, -75.6671], ['El Jardín', 4.8090, -75.7145], ['Samaria', 4.7960, -75.7095],
    ['Los Corales', 4.8012, -75.7464], ['Perla del Otún', 4.7963, -75.7298]
  ];
  var CONTACTOS = ['María López', 'Jorge Ruiz', 'Luz Dary Cardona', 'Hernán Gallego', 'Olga Patricia Marín', 'Fabio Arango',
    'Rosa Elena Valencia', 'Andrés Castaño', 'Gloria Henao', 'Wilson Toro'];
  var EDIFICIOS = ['Edificio Los Cedros', 'Conjunto Torres del Parque', 'Colegio San José (bloque B)', 'Edificio Mariela',
    'Local comercial La 19', 'Puesto de salud del barrio'];

  var COMENTARIOS = {
    verde: ['Fisuras menores en pañetes, sin compromiso estructural. Se recomienda resanar.',
      'Sin daños visibles en elementos estructurales. Desprendimiento leve de pintura.',
      'Grieta capilar en muro de fachada. Se orienta a la familia sobre seguimiento.'],
    amarillo: ['Grietas diagonales en muros no portantes y cielo raso con desprendimientos. Restringir el uso del segundo piso.',
      'Daño moderado en muros de fachada; riesgo de caída de elementos sobre el andén. Restringir paso peatonal.',
      'Fisuras en vigas del primer piso. Se requiere evaluación estructural detallada antes de ocupar la zona afectada.'],
    rojo: ['Columna del primer piso con pérdida de recubrimiento y acero expuesto. Evacuar y apuntalar.',
      'Grietas en X en muros portantes y desplazamiento de la cubierta. Se ordena evacuar la edificación.',
      'Inclinación visible de la estructura y asentamiento del terreno. Evacuar edificación y aledañas.']
  };

  var SOLICITUDES = [
    // [prioridad, asignado ('@yo' = quien ingresó, '' = todos), dirección, barrio, contacto, teléfono, descripción]
    ['ALTA', '@yo', 'Cra 7 # 18-40', 'Centro', 'María López', '3001234567', 'Grietas grandes en muros después del sismo; la familia sigue adentro.'],
    ['ALTA', '@yo', 'Mz 4 Cs 12', 'Cuba', 'Jorge Ruiz', '3109876543', 'Se cayó parte del cielo raso y hay fisuras en una columna.'],
    ['MEDIA', '@yo', 'Cll 19 # 11-25', 'San Nicolás', 'Luz Dary Cardona', '3154445566', 'Fisuras en la fachada y vidrios rotos.'],
    ['MEDIA', '@yo', 'Cra 12 Bis # 25-08', 'Boston', 'Hernán Gallego', '3207778899', 'Muro de cerramiento inclinado hacia la vía.'],
    ['BAJA', '@yo', 'Cll 45 # 3-16', 'Pinares de San Martín', 'Olga Patricia Marín', '3012223344', 'Grieta pequeña en el baño; piden revisión.'],
    ['ALTA', '', 'Mz 22 Cs 5', 'Villa Santana', 'Fabio Arango', '3168889900', 'Vivienda en ladera con grietas en el piso; hubo desprendimiento de tierra.'],
    ['MEDIA', '', 'Cra 26 # 72-10', 'Kennedy', 'Rosa Elena Valencia', '3125556677', 'Tanque elevado con fisuras y filtraciones.'],
    ['BAJA', '', 'Cll 14 # 23-51', 'El Jardín', 'Andrés Castaño', '3183332211', 'Desprendimiento de tejas.'],
    ['ALTA', 'Carlos Andrés Mejía', 'Cra 5 # 31-60', 'Villavicencio', 'Gloria Henao', '3006667788', 'Edificio de 4 pisos con grietas en escaleras.'],
    ['MEDIA', 'Diana Marcela Ríos', 'Mz 9 Cs 20', 'Samaria', 'Wilson Toro', '3141112233', 'Muros divisorios agrietados.'],
    ['BAJA', 'Julián Osorio Cardona', 'Cll 80 # 18-04', 'Los Corales', 'María López', '3175554433', 'Fisura en muro de patio.']
  ];

  /** Números al azar que salen iguales cada vez (misma semilla, misma demostración). */
  // mulberry32. Un generador lineal (s * 16807) daba, con semillas seguidas
  // (foto 1, foto 2), dibujos casi idénticos.
  function azarCon(semilla) {
    var a = (semilla >>> 0) ^ 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pad(n, k) { return ('0000' + n).slice(-(k || 4)); }

  function fechaLocal(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2) + 'T' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2);
  }

  function miembro(i, yo) {
    var m = EQUIPO[i % EQUIPO.length];
    return { nombre: m[0] === '@yo' ? (yo || PERFIL.nombre) : m[0], doc: m[1] };
  }

  var N_EVALUACIONES = 42;

  /** Una evaluación completa. yo = nombre de quien ingresó (le tocan algunas, para "Solo las mías"). */
  function datosDeEvaluacion(i, yo, hoy) {
    var r = azarCon(7919 * (i + 11));
    var uno = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    var p = r();
    var color = p < 0.16 ? 'rojo' : (p < 0.45 ? 'amarillo' : 'verde');
    var b = BARRIOS[(i * 5 + Math.floor(r() * 3)) % BARRIOS.length];
    var ev = miembro(i % 3 === 0 ? 0 : 1 + (i % 4), yo);
    var cuando = new Date((hoy || new Date()).getTime());
    cuando.setDate(cuando.getDate() - Math.floor(i * 26 / N_EVALUACIONES) - (r() < 0.3 ? 1 : 0));
    cuando.setHours(8 + Math.floor(r() * 9), Math.floor(r() * 60), 0, 0);
    var pisos = uno([1, 1, 2, 2, 2, 3, 3, 4, 5]);

    var d = {
      num_formulario: 'DEMO-' + cuando.getFullYear() + '-' + pad(i + 1),
      fecha_hora_inspeccion: fechaLocal(cuando),
      tipo_inspeccion: r() < 0.8 ? 'completa' : 'exterior', tipo_amenaza: 'sismo',
      persona_contacto: uno(CONTACTOS), num_contacto: '3' + String(Math.floor(100000000 + r() * 899999999)),
      ubicacion: { lat: +(b[1] + (r() - 0.5) * 0.004).toFixed(6), lon: +(b[2] + (r() - 0.5) * 0.004).toFixed(6), precision: 3 + Math.floor(r() * 9) },
      departamento: 'risaralda', municipio: 'pereira', barrio_vereda: b[0], zona: 'urbano',
      direccion: r() < 0.5 ? uno(['Cra', 'Cll', 'Av']) + ' ' + (1 + Math.floor(r() * 90)) + ' # ' + (1 + Math.floor(r() * 80)) + '-' + pad(Math.floor(r() * 90), 2)
        : 'Mz ' + (1 + Math.floor(r() * 30)) + ' Cs ' + (1 + Math.floor(r() * 25)),
      nombre_edificacion: pisos >= 3 && r() < 0.5 ? uno(EDIFICIOS) : '',
      num_pisos: pisos, num_sotanos: 0, tipo_edificacion: r() < 0.85 ? 'privada' : 'publica',
      uso: uno(['residencial', 'residencial', 'residencial', 'residencial', 'comercial', 'educacional', 'oficinas', 'salud']),
      dim_frente: 6 + Math.round(r() * 16) / 2, dim_fondo: 12 + Math.round(r() * 36) / 2,
      mat_estructural: uno(['concreto', 'concreto', 'mamposteria', 'mamposteria', 'bahareque_tapia']),
      mat_entrepiso: pisos === 1 ? 'no_tiene' : uno(['concreto', 'concreto', 'madera']),
      mat_sop_cubierta: uno(['madera', 'madera', 'concreto', 'acero']),
      tipo_cubierta: uno(['teja_zinc', 'teja_barro', 'teja_fibrocemento', 'teja_fibrocemento']),
      morfologia_sitio: uno(['ladera', 'valle', 'divisoria', 'pie_ladera', 'valle']),
      amenaza_hidrica: r() < 0.2 ? 'si' : 'no',
      piso_debil: r() < 0.15 ? 'si' : 'no', columna_corta: r() < 0.1 ? 'si' : 'no', cambios_rigidez: 'no',
      colapso_total: 'no', colapso_parcial: 'no', inclinacion_evidente: 'no', riesgo_edif_adyacentes: 'no',
      licuacion_subsidencia: 'no', mov_masa_cercanos: 'no',
      eval_previa: 'no', comentarios_finales: uno(COMENTARIOS[color]),
      eval_nombre: ev.nombre, eval_tipo_doc: 'cc', eval_num_doc: ev.doc, eval_matricula: '66202-' + ev.doc.slice(-5) + ' RSD',
      eval_entidad: 'Alcaldía de Pereira', eval_dependencia: 'DIGER', eval_firma: ['firma_1.png']
    };
    if (d.amenaza_hidrica === 'si') { d.distancia_hidrica = 20 + Math.floor(r() * 60); d.obs_hidrica = 'Quebrada cercana a la edificación.'; }

    // Sistemas: una opción que no pida "¿cuál?" (las "otro"/"mixto" abren otra casilla).
    ['sist_estructural', 'sist_entrepiso', 'sop_cubierta'].forEach(function (id) {
      if (!E.visible(E.CAMPOS[id], d)) return;
      var ops = E.opciones(E.CAMPOS[id], d).map(function (o) { return o[0]; }).filter(function (c) { return !/otro|mixto/.test(c); });
      if (ops.length) d[id] = uno(ops);
    });

    // Daños: todos N/L y se suben los necesarios para llegar al color.
    var danos = [];
    ['s9', 's10'].forEach(function (sid) {
      E.seccion(sid).campos.forEach(function (c) { if (c.tipo === 'nlms' && c.req && E.visible(c, d)) { d[c.id] = 'nl'; danos.push(c); } });
    });
    var conColor = function (col, v) { return danos.filter(function (c) { return c.colores[v] === col; }); };
    if (color === 'amarillo') {
      var amar = conColor('amarillo', 'm');
      d[uno(amar).id] = 'm';
      if (r() < 0.5) d[uno(amar).id] = 'm';
      if (r() < 0.3) d.riesgo_edif_adyacentes = 'si';
    } else if (color === 'rojo') {
      var rojos = conColor('rojo', 's');
      if (rojos.length && r() < 0.8) d[uno(rojos).id] = 's'; else d.inclinacion_evidente = 'si';
      var amar2 = conColor('amarillo', 'm');
      if (amar2.length) d[uno(amar2).id] = 'm';
    }
    // Fotos de la fachada y de cada elemento dañado (M o S).
    d.fotos_generales = ['fotos_generales_1.jpg', 'fotos_generales_2.jpg'];
    danos.forEach(function (c) {
      if (d[c.id] === 'm' || d[c.id] === 's') {
        var campo = c.id.replace(/^dano_/, 'foto_'), n = 1 + Math.floor(r() * 2);
        d[campo] = [];
        for (var k = 1; k <= n; k++) d[campo].push(campo.replace(/^foto_/, '') + '_' + k + '.jpg');
      }
    });

    var sug = E.sugerencia(d);
    d.clasif_habitabilidad = sug.clasif;
    d.nivel_dano = { verde: 'ninguno_menor', amarillo: 'moderado', rojo: 'severo' }[sug.color];
    d.estado_ocupacion = sug.color === 'rojo' ? 'desocupada' : 'ocupada';
    d.eval_adicional = sug.color === 'verde' ? ['ninguna'] : (sug.color === 'rojo' && r() < 0.5 ? ['estructural', 'geotecnica'] : ['estructural']);
    if (sug.color === 'verde') d.medidas_seguridad = ['ninguna'];
    else if (sug.color === 'amarillo') { d.medidas_seguridad = ['restringir_paso']; d.restringir_paso = ['peatonal']; }
    else {
      d.medidas_seguridad = ['evacuar_edificacion', 'desconectar_servicios', 'restringir_paso'];
      d.servicios_desconectar = ['gas', 'energia']; d.restringir_paso = ['peatonal', 'vehicular'];
    }
    return E.limpiarOcultos(d);
  }

  function idDeEvaluacion(i) { return 'DEMO-EV-' + pad(i + 1, 3); }

  /** Lo que la lista, el mapa y el tablero necesitan (igual que el resumen del servidor). */
  function resumen(id, d, idSolicitud) {
    var u = d.ubicacion || {};
    return {
      id: id, num_formulario: d.num_formulario, fecha: new Date(d.fecha_hora_inspeccion).toISOString(),
      direccion: d.direccion, barrio: d.barrio_vereda, municipio: E.etiquetaDe('municipio', d.municipio),
      clasif: d.clasif_habitabilidad, nivel: d.nivel_dano, evaluador: d.eval_nombre, entidad: 'DIGER',
      id_solicitud: idSolicitud || '', estado: 'COMPLETA', lat: u.lat, lon: u.lon, ficha_url: '#demo-ficha=' + id
    };
  }

  function evaluaciones(yo, hoy) {
    var r = [];
    for (var i = 0; i < N_EVALUACIONES; i++) r.push(resumen(idDeEvaluacion(i), datosDeEvaluacion(i, yo, hoy)));
    return r;
  }

  function datosDe(id, yo) {
    var m = /^DEMO-EV-(\d+)$/.exec(id || '');
    return m ? datosDeEvaluacion(Number(m[1]) - 1, yo) : null;
  }

  /** Las pendientes que le tocan a quien ingresó (asignadas a él) o a todos; las de otros no se ven. */
  function solicitudes(yo) {
    var anio = new Date().getFullYear();
    return SOLICITUDES.map(function (s, i) {
      var b = BARRIOS.filter(function (x) { return x[0] === s[3]; })[0] || BARRIOS[0];
      var r = azarCon(31 * (i + 3));
      return {
        id_solicitud: 'SOL-' + anio + '-' + pad(101 + i), prioridad: s[0], asignado: s[1] === '@yo' ? (yo || PERFIL.nombre) : s[1],
        direccion: s[2], barrio: s[3], municipio: 'Pereira', contacto: s[4], telefono: s[5], descripcion: s[6],
        lat: +(b[1] + (r() - 0.5) * 0.004).toFixed(6), lon: +(b[2] + (r() - 0.5) * 0.004).toFixed(6)
      };
    }).filter(function (s, i) { return !SOLICITUDES[i][1] || SOLICITUDES[i][1] === '@yo'; })
      .map(function (s, i) { s.para_mi = !!s.asignado; return s; });
  }

  // ---------------------------------------------------------------- DIBUJOS (solo en el navegador)
  function lienzo(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function marcaDemo(g, w, h) {
    g.font = 'bold 18px sans-serif'; g.textAlign = 'right';
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(w - 170, h - 34, 164, 28);
    g.fillStyle = '#fff'; g.fillText('DEMOSTRACIÓN', w - 14, h - 13);
  }

  function grieta(g, r, x, y, largo, grosor) {
    g.strokeStyle = '#2b2118'; g.lineWidth = grosor; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
    for (var k = 0; k < 9; k++) { x += (r() - 0.3) * largo / 6; y += largo / 9; g.lineTo(x, y); }
    g.stroke();
  }

  /** Fachada: casa o edificio del número de pisos, con grietas si hay daño. */
  function fotoFachada(semilla, pisos, color, vista) {
    var r = azarCon(semilla), w = 640, h = 480, c = lienzo(w, h), g = c.getContext('2d');
    var cielo = g.createLinearGradient(0, 0, 0, h); cielo.addColorStop(0, '#9fd3f5'); cielo.addColorStop(1, '#e8f4fb');
    g.fillStyle = cielo; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7c8b8f'; g.fillRect(0, h - 70, w, 70);                        // calle
    g.fillStyle = '#c9c3b6'; g.fillRect(0, h - 86, w, 16);                        // andén
    var tonos = ['#f2e2c4', '#e7c9a9', '#d9e4d2', '#f1d0d0', '#dfe6ee', '#f5efe0'];
    var pisosV = Math.max(1, Math.min(5, pisos || 1)), alto = Math.min(330, 90 + pisosV * 62), ancho = vista === 2 ? 300 : 380;
    var x0 = (w - ancho) / 2 + (vista === 2 ? 60 : 0), y0 = h - 86 - alto;
    g.fillStyle = tonos[Math.floor(r() * tonos.length)]; g.fillRect(x0, y0, ancho, alto);
    g.strokeStyle = '#8d7b68'; g.lineWidth = 2; g.strokeRect(x0, y0, ancho, alto);
    g.fillStyle = '#8a3b2a'; g.beginPath(); g.moveTo(x0 - 20, y0); g.lineTo(x0 + ancho / 2, y0 - 50); g.lineTo(x0 + ancho + 20, y0); g.fill();
    var altoPiso = alto / pisosV;
    for (var p = 0; p < pisosV; p++) {
      for (var v = 0; v < 3; v++) {
        var vx = x0 + 30 + v * (ancho - 60) / 3, vy = y0 + p * altoPiso + altoPiso * 0.22;
        if (p === pisosV - 1 && v === 1) { g.fillStyle = '#6b4a2f'; g.fillRect(vx + 10, y0 + p * altoPiso + altoPiso * 0.25, 60, altoPiso * 0.75); continue; }
        g.fillStyle = '#5b7f99'; g.fillRect(vx, vy, 70, altoPiso * 0.45);
        g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(vx, vy, 70, altoPiso * 0.45);
      }
    }
    if (color === 'amarillo' || color === 'rojo') {
      var n = color === 'rojo' ? 4 : 2;
      for (var k = 0; k < n; k++) grieta(g, r, x0 + 40 + r() * (ancho - 80), y0 + 20 + r() * alto * 0.4, alto * 0.5, color === 'rojo' ? 4 : 2);
    }
    if (color === 'rojo') { g.fillStyle = '#b8ab97'; g.beginPath(); g.ellipse(x0 + ancho * 0.8, h - 92, 60, 14, 0, 0, 2 * Math.PI); g.fill(); }
    marcaDemo(g, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  }

  /** Acercamiento a un elemento dañado: muro con grieta (M) o grieta ancha con desprendimiento (S). */
  function fotoDano(semilla, nivel) {
    var r = azarCon(semilla), w = 640, h = 480, c = lienzo(w, h), g = c.getContext('2d');
    g.fillStyle = '#d8d0c3'; g.fillRect(0, 0, w, h);
    for (var k = 0; k < 900; k++) { g.fillStyle = 'rgba(90,80,70,' + (r() * 0.12) + ')'; g.fillRect(r() * w, r() * h, 3, 3); }
    if (nivel === 's') {
      g.fillStyle = '#9a8f80'; g.beginPath(); g.ellipse(w * 0.45, h * 0.5, 120, 60, 0.5, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = '#5a3d2b'; g.lineWidth = 5;
      for (var v = 0; v < 3; v++) { g.beginPath(); g.moveTo(w * 0.3 + v * 45, h * 0.35); g.lineTo(w * 0.3 + v * 45 + 30, h * 0.68); g.stroke(); }
    }
    grieta(g, r, w * (0.3 + r() * 0.3), 20, h - 40, nivel === 's' ? 9 : 3);
    if (nivel === 's') grieta(g, r, w * (0.55 + r() * 0.2), 60, h - 120, 5);
    marcaDemo(g, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  }

  /** Una firma a mano alzada, distinta para cada nombre. */
  function firma(nombre) {
    var semilla = 0;
    String(nombre || 'x').split('').forEach(function (ch) { semilla = (semilla * 31 + ch.charCodeAt(0)) % 2147483647; });
    var r = azarCon(semilla + 1), c = lienzo(600, 220), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 220);
    g.strokeStyle = '#0a1f44'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(50, 150);
    var x = 50;
    for (var k = 0; k < 7; k++) {
      var nx = x + 55 + r() * 25;
      g.bezierCurveTo(x + 15, 40 + r() * 60, nx - 20, 170 + r() * 30, nx, 110 + r() * 40);
      x = nx;
    }
    g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(70, 185); g.quadraticCurveTo(300, 165 + r() * 20, x, 180); g.stroke();
    return c.toDataURL('image/png');
  }

  /** Fotos de una evaluación de ejemplo, con los mismos nombres de archivo que trae su dato. */
  function fotosDe(id, d) {
    var semilla = Number(String(id).replace(/\D/g, '')) || 1;
    var color = E.COLOR_DE_CLASIF[d.clasif_habitabilidad];
    var fotos = {};
    Object.keys(E.CAMPOS).forEach(function (k) {
      var c = E.CAMPOS[k];
      if (c.tipo !== 'fotos' || !Array.isArray(d[k]) || !d[k].length) return;
      fotos[k] = d[k].map(function (n, j) {
        if (k === 'fotos_generales') return fotoFachada(semilla * 13 + j, d.num_pisos, color, j + 1);
        return fotoDano(semilla * 17 + j + k.length, d[k.replace(/^foto_/, 'dano_')]);
      });
    });
    return { fotos: fotos, firma: firma(d.eval_nombre) };
  }

  return {
    PERFIL: PERFIL, N_EVALUACIONES: N_EVALUACIONES,
    datosDeEvaluacion: datosDeEvaluacion, idDeEvaluacion: idDeEvaluacion, evaluaciones: evaluaciones, datosDe: datosDe,
    resumen: resumen, solicitudes: solicitudes, fotosDe: fotosDe, firma: firma
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Demo;
