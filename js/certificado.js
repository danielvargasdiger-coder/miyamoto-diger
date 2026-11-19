/* =========================================================================
   CERTIFICADO DE SERVICIOS PÚBLICOS — una sola fuente (19/11/2026)
   "Concepto técnico simplificado para solicitud de servicios públicos" (formato Downloads\Formato Diger.docx).

   La usan: la app (vista previa y demostración) y el Worker de Cloudflare (/certificado/<código>, pegada
   por herramientas/armar_worker.py). Campos, reglas contra contradicciones y la página, en un solo lugar:
   el celular y el servidor validan con el MISMO código.
   La página es HTML vivo (sin PDF en el servidor): si la oficina corrige la hoja, el QR muestra lo nuevo.
   ========================================================================= */
'use strict';

var Certificado = (function () {
  var QR = typeof qrcode !== 'undefined' ? qrcode : (typeof require === 'function' ? require('../vendor/qrcode.js') : null);

  var ID = /^CSP-\d{8}-\d{6}-[A-Z0-9]{4}$/;
  var CODIGO = /^SP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  var MAX_FOTOS = 8;

  var USOS = [['vivienda', 'Vivienda'], ['local_comercial', 'Local comercial'], ['mixto', 'Mixto'], ['otro', 'Otro']];
  var AREAS = [['int_ext', 'Interiores y exteriores'], ['parcial', 'Parcial'], ['solo_exterior', 'Solo exterior']];
  var OBSERVACIONES = [
    ['obs_sin_dano', 'No se observan signos manifiestos de daño estructural relevante, en los elementos accesibles para evaluación técnica.'],
    ['obs_indicios', 'Se observan indicios que ameritan evaluación adicional.'],
    ['obs_zonas_sin_evaluar', 'Existen zonas que no se lograron evaluar durante la visita, condición que impide un concepto técnico ajustado a las condiciones reales de la estructura.']
  ];
  var CONCEPTOS = [
    ['favorable', 'FAVORABLE', 'En las áreas inspeccionadas y a la fecha de la visita técnica, no se identificaron manifestaciones visibles de afectación estructural que, por sí solas, indiquen la necesidad de restringir la ocupación.'],
    ['condicionado', 'CONDICIONADO', 'Requiere subsanar restricciones o efectuar evaluación complementaria.'],
    ['desfavorable', 'DESFAVORABLE', 'No se recomienda ocupación ni gestión de reconexión, hasta nueva evaluación técnica detallada.']
  ];
  var TEXTOS = {
    titulo: 'CONCEPTO TÉCNICO SIMPLIFICADO PARA SOLICITUD DE SERVICIOS PÚBLICOS',
    evento: 'Sismo del 10 de agosto de 2026.',
    descripcion: 'Registrar el estado aparente del inmueble después de las reparaciones locativas, informadas tras el sismo del 10 de agosto de 2026, mediante reconocimiento ocular de los sectores accesibles, como soporte para el trámite de conexión o desconexión de servicios públicos domiciliarios, ante las empresas prestadoras de dichos servicios.',
    constancia: 'Este documento sirve como soporte técnico ocular de las condiciones aparentes de ocupación del inmueble, para que la empresa prestadora estudie la solicitud de conexión o desconexión de los servicios públicos. La autorización y ejecución para los casos de la reconexión, dependen de sus verificaciones técnicas, reglamentarias y operativas; especialmente de las redes y acometidas de la estructura evaluada. Este documento no constituye una certificación de estabilidad estructural.',
    alcance: 'Concepto provisional basado exclusivamente en observación visual de áreas accesibles; sin ensayos, exploraciones, cálculos de diseño, revisión de diseños, ni estudio patológico o de vulnerabilidad estructural. No acredita ausencia absoluta de riesgo, cumplimiento integral de NSR-10, estabilidad estructural ante futuros sismos, ni seguridad técnica de redes internas de servicios públicos.'
  };
  /** Adaptado del aviso legal de la ficha Miyamoto (app/js/ficha.js) a este concepto (spec §6.4). */
  var AVISO_LEGAL = [
    ['Carácter', 'Concepto provisional basado exclusivamente en reconocimiento ocular de las áreas accesibles en la fecha de la visita.'],
    ['Alcance técnico', 'No constituye certificación de estabilidad estructural, estudio de vulnerabilidad, peritaje ni concepto técnico definitivo.'],
    ['Efectos', 'No constituye acto administrativo ni autoriza por sí mismo la conexión o reconexión de servicios públicos; esa decisión corresponde a la empresa prestadora según sus verificaciones.'],
    ['Vigencia', 'El registro oficial es el que administra la DIGER de la Alcaldía de Pereira y se consulta con el código QR. Las impresiones, capturas y copias reflejan únicamente el estado de la información al momento de obtenerlas.'],
    ['Datos personales', 'Los datos personales aquí contenidos se tratan conforme a la Ley 1581 de 2012 y sus normas reglamentarias, con la única finalidad de la gestión del riesgo de desastres y del trámite de servicios públicos. Se prohíbe su divulgación o uso para fines distintos.'],
    ['Exoneración de responsabilidad', 'La entidad no se hace responsable por la alteración, la reproducción fuera de contexto ni las decisiones que terceros adopten con fundamento en copias no verificadas.'],
    ['Consultas y reclamaciones', 'Las solicitudes de corrección o actualización deben presentarse ante la DIGER – Alcaldía de Pereira por los canales oficiales de atención al ciudadano.']
  ];

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var vacio = function (v) { return !String(v == null ? '' : v).trim(); };
  var etiqueta = function (lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === id) return lista[i][1]; return ''; };

  function conceptosPermitidos(d) {
    var todos = CONCEPTOS.map(function (c) { return c[0]; });
    return d.obs_indicios || d.obs_zonas_sin_evaluar ? todos.slice(1) : todos;
  }

  function validar(d, nFotos) {
    var e = [];
    var falta = function (campo, texto) { e.push({ campo: campo, error: texto }); };
    if (vacio(d.fecha_hora_visita) || isNaN(new Date(d.fecha_hora_visita).getTime())) falta('fecha_hora_visita', 'Falta la fecha y hora de la visita.');
    if (vacio(d.direccion)) falta('direccion', 'Falta la dirección.');
    if (vacio(d.barrio_vereda)) falta('barrio_vereda', 'Falta el barrio o la vereda.');
    if (!etiqueta(USOS, d.uso)) falta('uso', 'Falta el uso u ocupación.');
    else if (d.uso === 'otro' && vacio(d.uso_otro)) falta('uso_otro', 'Escriba cuál es el uso.');
    if (vacio(d.propietario)) falta('propietario', 'Falta el propietario o responsable.');
    if (!etiqueta(AREAS, d.areas)) falta('areas', 'Falta indicar las áreas inspeccionadas.');
    if (!d.obs_sin_dano && !d.obs_indicios && !d.obs_zonas_sin_evaluar) falta('observaciones', 'Marque al menos una observación técnica.');
    else if (d.obs_sin_dano && d.obs_indicios) falta('obs_indicios', '"No se observan signos de daño" y "Se observan indicios" se contradicen: deje solo una.');
    if (!etiqueta(CONCEPTOS, d.concepto)) falta('concepto', 'Falta el concepto profesional.');
    else if (conceptosPermitidos(d).indexOf(d.concepto) === -1 && !(d.obs_sin_dano && d.obs_indicios)) {
      falta('concepto', 'Con indicios o zonas sin evaluar, el concepto solo puede ser Condicionado o Desfavorable.');
    }
    if (!(nFotos >= 1 && nFotos <= MAX_FOTOS)) falta('fotos', 'Agregue entre 1 y ' + MAX_FOTOS + ' fotos.');
    if (vacio(d.prof_nombre)) falta('prof_nombre', 'Falta su nombre en "Mis datos".');
    if (vacio(d.prof_profesion)) falta('prof_profesion', 'Falta su profesión en "Mis datos".');
    return e;
  }

  function avisoArea(d) {
    return d.concepto === 'favorable' && (d.areas === 'parcial' || d.areas === 'solo_exterior')
      ? 'El concepto favorable aplica solo a las áreas inspeccionadas.' : '';
  }

  /** Matriz del QR (corrección M): [[true = negro]]. */
  function qrMatriz(texto) {
    var q = QR(0, 'M');
    q.addData(texto, 'Byte');
    q.make();
    var n = q.getModuleCount(), m = [];
    for (var y = 0; y < n; y++) { var f = []; for (var x = 0; x < n; x++) f.push(q.isDark(y, x)); m.push(f); }
    return m;
  }

  function qrSvg(texto) {
    var m = qrMatriz(texto), n = m.length, d = '';
    m.forEach(function (fila, y) { fila.forEach(function (negro, x) { if (negro) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z'; }); });
    return '<svg class="qr" viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="Código QR de verificación">' +
      '<rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  /** "19 de noviembre de 2026, 09:30" en hora de Colombia (UTC-5), se abra donde se abra. */
  function fechaColombia(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var c = new Date(t - 5 * 3600000), p = function (x) { return ('0' + x).slice(-2); };
    return c.getUTCDate() + ' de ' + MESES[c.getUTCMonth()] + ' de ' + c.getUTCFullYear() + ', ' + p(c.getUTCHours()) + ':' + p(c.getUTCMinutes());
  }

  /* Formato de los documentos de la Alcaldía de Pereira (p. ej. el informe de supervisión, 19/11/2026): logo arriba a la
     izquierda, título en mayúsculas a la derecha, Arial en negro, tablas de borde negro delgado con rótulos en negrilla,
     firma sobre una línea con el nombre en mayúsculas y la dirección de la Alcaldía centrada al pie. El único color es el
     del concepto escogido (pedido del usuario tras la prueba real, 19/11/2026). */
  var CSS = '*{box-sizing:border-box}body{margin:0;background:#eef1f4;color:#000;font-family:Arial,Helvetica,sans-serif}' +
    '.hoja{position:relative;max-width:816px;margin:12px auto;background:#fff;padding:36px 56px 24px;box-shadow:0 1px 4px rgba(0,0,0,.12);font-size:10pt;line-height:1.3}' +
    // Membrete: logos a la izquierda, título a la derecha y la línea roja de borde a borde de la hoja (como la Alcaldía).
    '.cab{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 -56px 8px;padding:0 56px 8px;border-bottom:2px solid #e30000}' +
    '.cab img{height:56px}.cab h1{font-size:12.5pt;font-weight:800;margin:0;color:#3a3a3a;text-align:right;line-height:1.25;max-width:58%}' +
    '.meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:2px 18px;font-size:9.5pt;margin:0 0 10px}' +
    'h2{font-size:10pt;margin:12px 0 4px;text-transform:uppercase}' +
    'table.datos{width:100%;border-collapse:collapse}table.datos th,table.datos td{border:1px solid #000;padding:2px 5px;text-align:left;vertical-align:top}' +
    'table.datos th{width:34%;font-weight:700}.casilla{margin:2px 0}.gris{color:#555}' +
    '.concepto{border:1.5px solid #000;border-left-width:6px;padding:5px 8px;margin:3px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.concepto.c-favorable{background:#e3f4e6;border-color:#2e7d32}.concepto.c-condicionado{background:#fff3d6;border-color:#c48a00}' +
    '.concepto.c-desfavorable{background:#fde4e4;border-color:#c62828}' +
    '.texto{text-align:justify;margin:0 0 4px}.firma{margin:22px 0 4px;min-height:40px}.firma img{max-height:64px;display:block}' +
    '.linea{width:240px;max-width:100%;border-top:1px solid #000;margin-top:2px;padding-top:2px}.linea b{text-transform:uppercase}' +
    '.legal{font-size:5.5pt;line-height:1.2;text-align:justify;color:#333;margin-top:10px}' +
    // QR discreto (pedido del usuario, 19/11): lo central es el certificado. 18 mm impreso sigue leyéndose (~0,4 mm por cuadrito).
    '.pie{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:6.5pt;color:#555;line-height:1.3}.pie .qr{width:18mm;height:18mm;flex:none}' +
    '.sello{margin-top:2px}.dir{text-align:center;font-size:9pt;margin-top:14px;line-height:1.35}' +
    '.franja{max-width:816px;margin:12px auto 0;padding:9px 14px;border-radius:8px;font-weight:600;color:#fff;font-family:system-ui,sans-serif}' +
    '.f-ok{background:#2e7d32}.f-anulado{background:#c62828}.fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}' +
    '.fotos img{width:100%;aspect-ratio:4/3;object-fit:cover;border:1px solid #000;display:block}' +
    '.marca-anulado,.marca-previa{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;' +
    'font-size:64pt;font-weight:800;transform:rotate(-24deg);opacity:.14}.marca-anulado{color:#c62828}.marca-previa{color:#333;font-size:46pt}' +
    '@media (max-width:600px){.hoja{padding:18px 14px}.cab{flex-direction:column;align-items:flex-start;gap:8px;margin:0 -14px 8px;padding:0 14px 8px}' +
    '.cab img{height:44px;max-width:100%}.cab h1{text-align:left;max-width:none}' +
    '.texto,.legal{text-align:left}.fotos{grid-template-columns:1fr 1fr}}' +
    // Al guardar en PDF: sin margen a los lados de la hoja, para que la línea roja llegue de borde a borde; el margen lo da .hoja.
    '@page{size:letter;margin:12mm 0}' +
    '@media print{body{background:#fff}.franja,.barra-ficha{display:none}.hoja{box-shadow:none;margin:0;max-width:none;padding:0 18mm}' +
    '.cab{margin:0 -18mm 8px;padding:0 18mm 8px}.salto{page-break-before:always}}';

  function casilla(marcada, texto) { return '<div class="casilla' + (marcada ? '' : ' gris') + '">' + (marcada ? '☒' : '☐') + ' ' + esc(texto) + '</div>'; }

  function pagina(d, o) {
    o = o || {};
    var anulado = o.estado === 'ANULADO';
    var uso = d.uso === 'otro' ? 'Otro: ' + (d.uso_otro || '') : etiqueta(USOS, d.uso);
    var fila = function (k, v) { return '<tr><th>' + esc(k) + ':</th><td>' + esc(v || '—') + '</td></tr>'; };
    var franja = o.vistaPrevia ? '' : anulado
      ? '<div class="franja f-anulado">Certificado ANULADO por la DIGER Pereira</div>'
      : '<div class="franja f-ok">Certificado registrado · DIGER Pereira</div>';
    // Encabezado y pie de cada hoja, como en los documentos de la Alcaldía.
    var cab = '<div class="cab">' + (o.logo ? '<img src="' + esc(o.logo) + '" alt="Alcaldía de Pereira · DIGER">' : '<span></span>') + '<h1>' + esc(TEXTOS.titulo) + '</h1></div>' +
      '<div class="meta"><span>Certificado No. <b>' + esc(o.codigo || 'sin código') + '</b></span><span>Evento de referencia: ' + esc(TEXTOS.evento) + '</span></div>';
    var dir = '<div class="dir">Carrera 7 18-55 Pereira – Risaralda<br>www.pereira.gov.co</div>';
    var conceptos = CONCEPTOS.map(function (c) {
      return d.concepto === c[0]
        ? '<div class="concepto c-' + c[0] + '">☒ <b>' + esc(c[1]) + ':</b> ' + esc(c[2]) + '</div>'
        : casilla(false, c[1] + ': ' + c[2]);
    }).join('');
    var pie = o.vistaPrevia ? '' : '<div class="pie">' + qrSvg(o.enlace || '') + '<div>Verifique este certificado con el código o en ' +
      esc(o.enlace || '') + '<div class="sello">Datos tomados el <b>' + esc(o.consultado || '') + '</b> (hora de Colombia).</div></div></div>';
    var fotos = (o.fotos || []).length ? '<section class="hoja salto">' + cab + '<h2>Anexo técnico – registro fotográfico</h2><div class="fotos">' +
      o.fotos.map(function (u) { return '<img src="' + esc(u) + '" alt="Foto del inmueble">'; }).join('') + '</div>' + dir + '</section>' : '';
    var cuerpo = '<section class="hoja">' +
      (anulado ? '<div class="marca-anulado">ANULADO</div>' : '') +
      (o.vistaPrevia ? '<div class="marca-previa">VISTA PREVIA · SIN VALIDEZ</div>' : '') + cab +
      '<table class="datos">' + fila('Fecha y hora de la visita', fechaColombia(d.fecha_hora_visita)) + fila('Dirección', d.direccion) +
      fila('Barrio – comuna', [d.barrio_vereda, d.comuna].filter(Boolean).join(' – ')) +
      fila('Ficha catastral – matrícula inmobiliaria', d.ficha_catastral) + fila('Uso – ocupación', uso) + fila('Propietario – responsable', d.propietario) + '</table>' +
      '<h2>Descripción de la visita</h2><p class="texto">' + esc(TEXTOS.descripcion) + '</p>' +
      '<h2>Observaciones técnicas de la visita</h2><div>Áreas inspeccionadas: <b>' + esc(etiqueta(AREAS, d.areas)) + '</b></div>' +
      OBSERVACIONES.map(function (x) { return casilla(!!d[x[0]], x[1]); }).join('') +
      '<div><b>Descripción de reparaciones locativas visibles:</b> ' + (vacio(d.reparaciones) ? 'No se registraron.' : esc(d.reparaciones)) + '</div>' +
      '<h2>Concepto profesional</h2>' + conceptos +
      '<h2>Constancia para trámite de conexión o reconexión</h2><p class="texto">' + esc(TEXTOS.constancia) + '</p>' +
      '<h2>Alcance y limitaciones del concepto técnico</h2><p class="texto">' + esc(TEXTOS.alcance) + '</p>' +
      '<h2>Profesional responsable del concepto</h2><div class="firma">' + (o.firma ? '<img src="' + esc(o.firma) + '" alt="Firma">' : '') + '</div>' +
      '<div class="linea"><b>' + esc(d.prof_nombre) + '</b><br>' + esc(String(d.prof_profesion || '').toUpperCase()) +
      (d.prof_matricula ? '<br>Matrícula profesional: ' + esc(d.prof_matricula) : '') + '</div>' +
      '<div class="legal"><b>AVISO LEGAL.</b> ' + AVISO_LEGAL.map(function (x, i) { return '<b>' + (i + 1) + '. ' + esc(x[0]) + '.</b> ' + esc(x[1]); }).join(' ') + '</div>' +
      pie + dir + '</section>' + fotos;
    return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="robots" content="noindex"><meta name="format-detection" content="telephone=no"><title>Certificado ' + esc(o.codigo || '') + ' · DIGER</title>' +
      '<style>' + CSS + '</style></head><body>' + (o.barra || '') + franja + cuerpo + '</body></html>';
  }

  return { ID: ID, CODIGO: CODIGO, MAX_FOTOS: MAX_FOTOS, USOS: USOS, AREAS: AREAS, OBSERVACIONES: OBSERVACIONES, CONCEPTOS: CONCEPTOS,
    TEXTOS: TEXTOS, AVISO_LEGAL: AVISO_LEGAL, esc: esc, conceptosPermitidos: conceptosPermitidos, validar: validar, avisoArea: avisoArea,
    qrMatriz: qrMatriz, qrSvg: qrSvg, fechaColombia: fechaColombia, pagina: pagina };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Certificado;
