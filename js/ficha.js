/* =========================================================================
   FICHA IMPRESA — réplica del Formulario Regional (2 páginas + anexo)

   UNA sola función arma la ficha, y la usan:
     - la app: vista previa ANTES de enviar, sin señal
     - el servidor (servidor/Ficha.gs, copia exacta): ficha en línea y PDF

   En taludes la ficha del servidor y el detalle de la app eran dos códigos
   distintos. Aquí lo que ve el ingeniero en el celular es exactamente lo
   que queda impreso.

   Maquetada con TABLAS a propósito: el conversor a PDF de Google entiende
   tablas y bordes, pero no flex ni grid. Las casillas son cuadros de CSS
   con una X, no caracteres ☒/☐: esos dependen de la fuente y en el PDF de
   Google salían con otra letra.

   Entrada: datos con CÓDIGOS (los del esquema). Para una fila de la hoja,
   el servidor primero convierte etiquetas a códigos con Esquema.desdeHoja.
   ========================================================================= */
var Ficha = (function () {
  'use strict';

  // Se busca al usarlo, no al cargar: en Apps Script los .gs se cargan en
  // orden y Ficha.gs podría correr antes que Esquema.gs.
  var E = null;
  function cargarEsquema() {
    if (!E) E = (typeof Esquema !== 'undefined') ? Esquema : require('./esquema.js');
    return E;
  }

  var COLOR = { verde: '#12a150', amarillo: '#ffe600', rojo: '#e3000f', blanco: '#ffffff' };

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------- PIEZAS
  function tiene(v, codigo) { return Array.isArray(v) ? v.indexOf(codigo) !== -1 : v === codigo; }

  /** Casilla. color: nombre de COLOR para pintarla como en el papel. */
  function cb(marcado, color) {
    var fondo = color ? COLOR[color] : '#fff';
    return '<span class="cb' + (marcado ? ' on' : '') + '" style="background:' + fondo + '">' +
      (marcado ? 'X' : '&nbsp;') + '</span>';
  }

  /** "Etiqueta [ ]" para una opción de una lista. */
  function op(d, campo, codigo, texto, color) {
    return '<span class="op">' + esc(texto) + ' ' + cb(tiene(d[campo], codigo), color) + '</span>';
  }

  function val(v) { return '<span class="val">' + (E.vacio(v) ? '&nbsp;' : esc(v)) + '</span>'; }

  function et(listaNombre, v) { return E.vacio(v) ? '' : E.etiquetaDe(listaNombre, v); }

  function numero(v, dec) {
    var n = E.aNumero(v);
    if (n === null) return v == null ? '' : String(v);
    return dec == null ? String(n) : n.toFixed(dec);
  }

  function titulo(t) { return '<div class="tit">' + esc(t) + '</div>'; }
  function subt(t) { return '<div class="subt">' + esc(t) + '</div>'; }

  function fechaPartes(iso) {
    var f = iso ? new Date(iso) : null;
    if (!f || isNaN(f.getTime())) return { fecha: '', hora: '', am: false, pm: false };
    var dd = ('0' + f.getDate()).slice(-2), mm = ('0' + (f.getMonth() + 1)).slice(-2);
    var h = f.getHours(), mi = ('0' + f.getMinutes()).slice(-2);
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return { fecha: dd + '/' + mm + '/' + f.getFullYear(), hora: h12 + ':' + mi, am: h < 12, pm: h >= 12 };
  }

  function fechaCorta(iso) { return fechaPartes(iso).fecha; }

  // ---------------------------------------------------------------- ENCABEZADO
  function encabezado(o, consecutivo) {
    var L = o.logos || {};
    return '<table class="enc"><tr>' +
      '<td class="enc-izq">' + (L.sngrd ? '<img src="' + L.sngrd + '" alt="SNGRD">' : 'Sistema Nacional de Gestión del Riesgo de Desastres') + '</td>' +
      '<td class="enc-cen">FORMULARIO REGIONAL PARA EVALUACIÓN<br>RÁPIDA DE DAÑOS EN EDIFICACIONES</td>' +
      '<td class="enc-der">' + (L.miyamoto ? '<img src="' + L.miyamoto + '" alt="USAID · Miyamoto">' : '') + '</td>' +
      '</tr></table>';
  }

  function pie(o, consecutivo) {
    var L = o.logos || {};
    return '<table class="pie"><tr>' +
      '<td class="pie-izq">' + (L.pie ? '<img src="' + L.pie + '" alt="">' : '') + '</td>' +
      '<td class="pie-cen">Número consecutivo: <b>' + esc(consecutivo) + '</b></td>' +
      '<td class="pie-der"><b>Versión:</b> ' + esc(E.FORMATO) + '</td>' +
      '</tr></table>' + rastro(o);
  }

  // ---------------------------------------------------------------- SECCIONES
  function s1(d) {
    var f = fechaPartes(d.fecha_hora_inspeccion);
    var am = d.tipo_amenaza;
    function amz(cod, n, txt) { return '<td>' + n + '. ' + esc(txt) + '</td><td class="c">' + cb(am === cod) + '</td>'; }
    return '<div class="caja">' + titulo('1. IDENTIFICACIÓN DE LA EVALUACIÓN') +
      '<table class="t">' +
      '<tr><td class="l">No. del formulario:</td><td>' + val(d.num_formulario) + '</td><td class="l">ID Zona:</td><td>' + val(d.id_zona) + '</td></tr>' +
      '<tr><td class="l">Nombre del evaluador:</td><td colspan="3">' + val(d.eval_nombre) + '</td></tr>' +
      '<tr><td class="l">Fecha de inspección:</td><td>' + val(f.fecha) + '</td><td class="l">Hora:</td><td>' + val(f.hora) +
      ' ' + op({ x: f.am ? 'am' : '' }, 'x', 'am', 'am') + ' ' + op({ x: f.pm ? 'pm' : '' }, 'x', 'pm', 'pm') + '</td></tr>' +
      '<tr><td class="l">ID Grupo:</td><td>' + val(d.id_grupo) + '</td><td class="l">Entidad:</td><td>' + val(d.eval_entidad) + '</td></tr>' +
      '</table>' +
      '<div class="lbl">Tipo de amenaza</div>' +
      '<table class="t amz">' +
      '<tr>' + amz('avenida_torrencial', 1, 'Avenida torrencial') + amz('erupcion_volcanica', 2, 'Erupción volcánica') + '</tr>' +
      '<tr>' + amz('incendio_estructural', 3, 'Incendio estructural') + amz('inundacion', 4, 'Inundación') + '</tr>' +
      '<tr>' + amz('movimiento_masa', 5, 'Movimiento en masa') + amz('sismo', 6, 'Sismo') + '</tr>' +
      '<tr>' + amz('vendaval', 7, 'Vendaval') + amz('otro', 8, 'Otro') + '</tr>' +
      '</table>' +
      (am === 'otro' ? '<div>¿Cuál? ' + val(d.tipo_amenaza_otro) + '</div>' : '') +
      '<table class="t">' +
      '<tr><td class="l">Persona de contacto:</td><td>' + val(d.persona_contacto) + '</td></tr>' +
      '<tr><td class="l">Núm. de contacto:</td><td>' + val(d.num_contacto) + '</td></tr>' +
      '</table></div>';
  }

  function s2(d) {
    var h = d.clasif_habitabilidad, n = d.nivel_dano;
    return '<div class="caja">' + titulo('2. CLASIFICACIÓN DE HABITABILIDAD Y NIVEL DE DAÑO') +
      '<table class="t"><tr><td class="l">Tipo de inspección:</td><td>' + op(d, 'tipo_inspeccion', 'exterior', 'Exterior solamente') +
      '</td><td>' + op(d, 'tipo_inspeccion', 'completa', 'Completa') + '</td></tr></table>' +
      '<table class="t"><tr><td class="l">Clasificación de habitabilidad:</td><td class="l">Nivel de daño:</td></tr>' +
      '<tr><td>Habitable (Verde) ' + cb(h === 'habitable', 'verde') + '</td><td>Ninguno/Menor ' + cb(n === 'ninguno_menor') + '</td></tr>' +
      '<tr><td>Uso restringido (Amarillo) ' + cb(h === 'uso_restringido', 'amarillo') + '</td><td>Moderado ' + cb(n === 'moderado') + '</td></tr>' +
      '<tr><td>No habitable (Rojo) ' + cb(h === 'no_habitable', 'rojo') + '</td><td>Severo ' + cb(n === 'severo') + '</td></tr>' +
      '</table></div>';
  }

  function s3(d) {
    var u = d.ubicacion || {};
    return '<div class="caja">' + titulo('3. INFORMACIÓN GENERAL') +
      '<table class="t">' +
      '<tr><td class="l">Departamento:</td><td>' + val(et('departamento', d.departamento)) + '</td><td class="l">Municipio:</td><td>' + val(et('municipio', d.municipio)) + '</td></tr>' +
      '<tr><td class="l">Barrio/Vereda:</td><td>' + val(d.barrio_vereda) + '</td><td colspan="2">' + op(d, 'zona', 'urbano', 'Urbano:') + ' ' + op(d, 'zona', 'rural', 'Rural:') + '</td></tr>' +
      '<tr><td class="l">Longitud (WGS 84):</td><td>' + val(numero(u.lon, 6)) + '</td><td class="l">Latitud (WGS 84):</td><td>' + val(numero(u.lat, 6)) + '</td></tr>' +
      (u.precision ? '<tr><td colspan="4" class="nota">Precisión del GPS: ±' + esc(Math.round(u.precision)) + ' m</td></tr>' : '') +
      '</table></div>';
  }

  function s4(d) {
    var usos = E.LISTAS.uso, filas = '';
    for (var i = 0; i < usos.length; i += 3) {
      filas += '<tr>';
      for (var j = i; j < i + 3; j++) {
        filas += usos[j] ? '<td>' + esc(usos[j][1]) + '</td><td class="c">' + cb(d.uso === usos[j][0]) + '</td>' : '<td></td><td></td>';
      }
      filas += '</tr>';
    }
    return '<div class="caja">' + titulo('4. IDENTIFICACIÓN DE LA EDIFICACIÓN') +
      '<table class="t mitades"><colgroup><col class="ancha"><col></colgroup><tr><td>' +
      '<table class="t">' +
      '<tr><td class="l">Dirección:</td><td colspan="3">' + val(d.direccion) + '</td></tr>' +
      '<tr><td class="l">Nombre de la edificación:</td><td colspan="3">' + val(d.nombre_edificacion) + '</td></tr>' +
      '<tr><td class="l">Núm. pisos sobre el nivel del suelo:</td><td>' + val(numero(d.num_pisos)) + '</td><td class="l">Núm. sótanos:</td><td>' + val(numero(d.num_sotanos)) + '</td></tr>' +
      '<tr><td class="l">Tipo de edificación:</td><td colspan="3">' + op(d, 'tipo_edificacion', 'publica', 'Pública') + ' ' + op(d, 'tipo_edificacion', 'privada', 'Privada') + '</td></tr>' +
      '<tr><td class="l">Dimensiones aproximadas (m)</td><td>Frente: ' + val(numero(d.dim_frente)) + '</td><td colspan="2">Fondo: ' + val(numero(d.dim_fondo)) + '</td></tr>' +
      '</table></td><td>' +
      '<div class="lbl">Uso:</div><table class="t">' + filas + '</table>' +
      (d.uso === 'otro' ? '<div>¿Cuál? ' + val(d.uso_otro) + '</div>' : '') +
      '</td></tr></table></div>';
  }

  /** Filas "Material: [sistemas]" de 5.1, 5.2 y 5.3. */
  function filasMaterial(d, campoMat, campoSis, listaMat, listaSis) {
    return E.LISTAS[listaMat].map(function (m) {
      var sistemas = E.LISTAS[listaSis].filter(function (s) { return s[2] === m[0]; });
      if (!sistemas.length) {                 // p. ej. "No tiene (un solo piso)"
        return '<tr><td class="l">' + esc(m[1]) + '</td><td>' + cb(d[campoMat] === m[0]) + '</td></tr>';
      }
      return '<tr><td class="l">' + esc(m[1]) + ':</td><td>' + sistemas.map(function (s) {
        return '<span class="op">' + esc(s[1]) + ' ' + cb(d[campoMat] === m[0] && d[campoSis] === s[0]) + '</span>';
      }).join(' ') + '</td></tr>';
    }).join('');
  }

  function s5(d) {
    var otro51 = d.sist_estructural_otro ? '<div>¿Cuál? ' + val(d.sist_estructural_otro) + '</div>' : '';
    var otro52 = d.sist_entrepiso_otro ? '<div>¿Cuál? ' + val(d.sist_entrepiso_otro) + '</div>' : '';
    var otro53 = d.sop_cubierta_otro ? '<div>¿Cuál? ' + val(d.sop_cubierta_otro) + '</div>' : '';
    var cub = E.LISTAS.tipo_cubierta.map(function (t) { return op(d, 'tipo_cubierta', t[0], t[1]); }).join(' ');
    return '<div class="caja">' + titulo('5. SISTEMA ESTRUCTURAL, ENTREPISO Y CUBIERTA') +
      subt('5.1. Sistema estructural') +
      '<table class="t sis">' + filasMaterial(d, 'mat_estructural', 'sist_estructural', 'material_estructural', 'sistema_estructural') + '</table>' + otro51 +
      '<table class="t mitades"><tr><td>' + subt('5.2. Sistema de entrepiso') +
      '<table class="t sis">' + filasMaterial(d, 'mat_entrepiso', 'sist_entrepiso', 'material_entrepiso', 'sistema_entrepiso') + '</table>' + otro52 +
      '</td><td>' + subt('5.3. Sistema de soporte de la cubierta') +
      '<table class="t sis">' + filasMaterial(d, 'mat_sop_cubierta', 'sop_cubierta', 'material_cubierta', 'soporte_cubierta') + '</table>' + otro53 +
      '</td></tr></table>' +
      '<div class="fila">' + subt('5.4. Tipo de cubierta') + ' ' + cub + '</div>' +
      (d.tipo_cubierta === 'otro' ? '<div>¿Cuál? ' + val(d.tipo_cubierta_otro) + '</div>' : '') +
      '</div>';
  }

  function s6(d) {
    var morf = E.LISTAS.morfologia.map(function (m, i) { return op(d, 'morfologia_sitio', m[0], (i + 1) + '. ' + m[1]); }).join(' ');
    var sismo = d.tipo_amenaza === 'sismo';
    return '<div class="caja">' + titulo('6. CONDICIONES PREEXISTENTES Y CONDICIONES DE ENTORNO') +
      '<div class="lbl">6.1. Morfología del sitio</div><div class="fila">' + morf +
      (d.morfologia_sitio === 'otro' ? ' ¿Cuál? ' + val(d.morfologia_otro) : '') + '</div>' +
      '<div class="fila">6.2. Amenaza por cuerpos hídricos afectados ' + op(d, 'amenaza_hidrica', 'si', 'Sí') + ' ' + op(d, 'amenaza_hidrica', 'no', 'No') +
      ' &nbsp; Distancia aprox. (m) ' + val(numero(d.distancia_hidrica)) + ' &nbsp; Observaciones: ' + val(d.obs_hidrica) + '</div>' +
      '<div class="gris">Diligenciar campos 6.3., 6.4. y 6.5. si la evaluación de daños es por sismo' +
      (sismo ? '' : ' <i>(no aplica)</i>') + '<br>' +
      '6.3. ¿Hay piso débil? ' + op(d, 'piso_debil', 'si', 'Sí') + ' ' + op(d, 'piso_debil', 'no', 'No') + ' &nbsp; ' +
      '6.4. ¿Hay piso con columna corta? ' + op(d, 'columna_corta', 'si', 'Sí') + ' ' + op(d, 'columna_corta', 'no', 'No') + ' &nbsp; ' +
      '6.5. ¿Hay cambios drásticos de rigidez? ' + op(d, 'cambios_rigidez', 'si', 'Sí') + ' ' + op(d, 'cambios_rigidez', 'no', 'No') +
      '</div></div>';
  }

  /** "Etiqueta: Sí[color] No[ ] (No es claro[ ])" para 7 y 8. */
  function siNo(d, id) {
    var c = E.CAMPOS[id];
    var s = esc(c.etiqueta) + ': </td><td>' + op(d, id, 'si', 'Sí', c.colores.si) + ' ' + op(d, id, 'no', 'No');
    if (c.lista === 'si_no_noclaro') s += ' ' + op(d, id, 'no_claro', 'No es claro');
    return '<td class="l">' + s + '</td>';
  }

  function s7y8(d) {
    return '<div class="caja">' + titulo('7. PELIGRO GLOBAL') +
      '<table class="t"><tr>' + siNo(d, 'colapso_total') + siNo(d, 'colapso_parcial') + '</tr>' +
      '<tr>' + siNo(d, 'inclinacion_evidente') + siNo(d, 'riesgo_edif_adyacentes') + '</tr></table></div>' +
      '<div class="caja">' + titulo('8. PELIGRO POR CONDICIONES GEOTÉCNICAS') +
      '<table class="t"><tr>' + siNo(d, 'licuacion_subsidencia') + siNo(d, 'mov_masa_cercanos') + '</tr></table></div>';
  }

  /** Tabla de daño N/L-M-S con las casillas de color del papel, 3 por fila. */
  function tablaDano(d, campos, nota) {
    var cab = '<td></td><td class="c">N/L</td><td class="c">M</td><td class="c">S</td>';
    var filas = '<tr>' + cab + cab + cab + '</tr>';
    for (var i = 0; i < campos.length; i += 3) {
      filas += '<tr>';
      for (var j = i; j < i + 3; j++) {
        var c = campos[j];
        if (!c) { filas += '<td colspan="4"></td>'; continue; }
        var col = c.colores || {};
        var etiqueta = esc(c.etiqueta) + ':';
        if (c.id === 'dano_otros_ne') etiqueta = 'Otros: ¿Cuál? ' + val(d.dano_otros_ne_desc);
        filas += '<td class="l">' + etiqueta + '</td>' + ['nl', 'm', 's'].map(function (k) {
          return '<td class="c">' + cb(d[c.id] === k, col[k] || 'blanco') + '</td>';
        }).join('');
      }
      filas += '</tr>';
    }
    return '<table class="t dano">' + filas + '</table><div class="nota">' + nota + '</div>';
  }

  function camposNLMS(sid) {
    return E.seccion(sid).campos.filter(function (c) { return c.tipo === 'nlms'; });
  }

  function s9(d) {
    return '<div class="caja">' + titulo('9. PELIGRO POR DAÑO EN ELEMENTOS ESTRUCTURALES') +
      tablaDano(d, camposNLMS('s9'), 'N: Ninguno / L: Leve / M: Moderado / S: Severo') + '</div>';
  }

  function s10(d) {
    var nota = 'N: Ninguno / L: Leve / M: Moderado / S: Severo';
    if (d.tipo_inspeccion === 'exterior') nota += ' — Inspección exterior: los elementos interiores no se evaluaron.';
    return '<div class="caja">' + titulo('10. PELIGRO POR DAÑO EN ELEMENTOS NO ESTRUCTURALES') +
      tablaDano(d, camposNLMS('s10'), nota) + '</div>';
  }

  /**
   * Sección 11. La DIGER no dibuja esquemas en campo (decisión del 18/09):
   * los dos recuadros del papel llevan las 1 o 2 fotos de la fachada.
   */
  function s11(d, o) {
    var f = (o.fotos && o.fotos.fotos_generales) || [];
    function hueco(url) { return url ? '<img src="' + url + '" alt="">' : ''; }
    return '<div class="caja">' + titulo('11. ESQUEMA — REGISTRO FOTOGRÁFICO DE LA FACHADA') +
      '<table class="t esq"><tr><td class="c esq-t">FOTO 1</td><td class="c esq-t">FOTO 2</td></tr>' +
      '<tr><td class="cuad">' + hueco(f[0]) + '</td><td class="cuad">' + hueco(f[1]) + '</td></tr></table>' +
      (d.fotos_descripcion ? '<div class="texto">' + esc(d.fotos_descripcion) + '</div>' : '') + '</div>';
  }

  function s12(d) {
    var h = d.clasif_habitabilidad, n = d.nivel_dano;
    return '<div class="caja">' + titulo('12. CLASIFICACIÓN DE HABITABILIDAD Y CLASIFICACIÓN DEL DAÑO') +
      '<table class="t">' +
      '<tr><td>Habitable (Verde) ' + cb(h === 'habitable', 'verde') + '</td><td>Uso restringido (Amarillo) ' + cb(h === 'uso_restringido', 'amarillo') +
      '</td><td>No habitable (Rojo) ' + cb(h === 'no_habitable', 'rojo') + '</td></tr>' +
      '<tr><td>Clasificación del daño: Ninguno/Menor ' + cb(n === 'ninguno_menor') + '</td><td>Moderado ' + cb(n === 'moderado') + '</td><td>Severo ' + cb(n === 'severo') + '</td></tr>' +
      '<tr><td>¿Existe una evaluación previa? ' + op(d, 'eval_previa', 'si', 'Sí') + ' ' + op(d, 'eval_previa', 'no', 'No') + '</td>' +
      '<td>Tipo de evaluación: ' + val(d.eval_previa_tipo) + '</td><td>Entidad: ' + val(d.eval_previa_entidad) + '</td></tr>' +
      '<tr><td colspan="2">Clasificación de habitabilidad de la evaluación previa: ' + val(et('habitabilidad', d.eval_previa_clasif)) + '</td>' +
      '<td>Fecha: ' + val(fechaCorta(d.eval_previa_fecha)) + '</td></tr>' +
      '</table></div>';
  }

  function s13(d) {
    return '<div class="caja">' + titulo('13. OCUPACIÓN DE LA EDIFICACIÓN') +
      '<div class="fila">Estado al momento de la evaluación: ' + op(d, 'estado_ocupacion', 'ocupada', 'Ocupada') + ' &nbsp; ' +
      op(d, 'estado_ocupacion', 'desocupada', 'Desocupada') + '</div></div>';
  }

  function s14(d) {
    function m(cod, txt) { return op(d, 'medidas_seguridad', cod, txt); }
    return '<div class="caja">' + titulo('14. RECOMENDACIONES Y MEDIDAS DE SEGURIDAD') +
      '<table class="t">' +
      '<tr><td>Evaluación adicional: ' + op(d, 'eval_adicional', 'estructural', 'Estructural') + ' ' + op(d, 'eval_adicional', 'geotecnica', 'Geotécnica') +
      ' ' + op(d, 'eval_adicional', 'empresa_servicios', 'Empresa prestadora de servicios públicos') + '</td></tr>' +
      '<tr><td>' + m('evacuar_edificacion', 'Evacuar edificación') + ' ' + m('evacuar_aledanas', 'Evacuar edificaciones aledañas') +
      ' &nbsp; Desconectar servicios: ' + op(d, 'servicios_desconectar', 'energia', 'Energía') + ' ' + op(d, 'servicios_desconectar', 'agua', 'Agua') +
      ' ' + op(d, 'servicios_desconectar', 'gas', 'Gas') + '</td></tr>' +
      '<tr><td>' + m('apuntalar', 'Apuntalar') + ' ' + m('demoler_elementos', 'Demoler elementos en peligro de caer') +
      ' &nbsp; Restringir paso: ' + op(d, 'restringir_paso', 'peatonal', 'Peatonal') + ' ' + op(d, 'restringir_paso', 'vehicular', 'Vehicular') + '</td></tr>' +
      '<tr><td>' + m('estabilizar_taludes', 'Estabilizar taludes') + ' ' + m('drenar_agua', 'Drenar agua') + ' ' +
      m('limpiar_cubierta', 'Limpiar material acumulado en cubierta') + '</td></tr>' +
      '<tr><td>' + m('cambiar_cubierta', 'Cambiar teja/material de cubierta') + ' ' + m('otro', 'Otro') +
      ' ¿Cuál? ' + val(d.medidas_otro) + '</td></tr>' +
      '</table></div>';
  }

  function s15(d) {
    return '<div class="caja">' + titulo('15. COMENTARIOS FINALES') +
      '<div class="texto">' + (d.comentarios_finales ? esc(d.comentarios_finales) : '&nbsp;') + '</div></div>';
  }

  function s16(d, o) {
    return '<div class="caja">' + titulo('16. INFORMACIÓN DEL EVALUADOR') +
      '<table class="t">' +
      '<tr><td class="l">Nombre:</td><td>' + val(d.eval_nombre) + '</td><td class="l">ID Evaluador (Según registro evaluadores):</td><td>' + val(d.eval_id) + '</td></tr>' +
      '<tr><td class="l">Tipo de documento:</td><td>' + op(d, 'eval_tipo_doc', 'cc', 'C.C.') + ' ' + op(d, 'eval_tipo_doc', 'pasaporte', 'Pasaporte') +
      '</td><td class="l">Número de documento:</td><td>' + val(d.eval_num_doc) + '</td></tr>' +
      '<tr><td class="l">Entidad:</td><td>' + val(d.eval_entidad) + '</td><td class="l">Dependencia:</td><td>' + val(d.eval_dependencia) + '</td></tr>' +
      '<tr><td class="l">Matrícula profesional:</td><td>' + val(d.eval_matricula) + '</td><td class="l">Firma:</td><td class="firma">' +
      (o.firma ? '<img class="img-firma" src="' + o.firma + '" alt="Firma">' : (o.firmaTexto ? esc(o.firmaTexto) : '&nbsp;')) + '</td></tr>' +
      '<tr><td colspan="2"></td><td class="l">Firma Funcionario Responsable:</td><td>' + val(d.resp_nombre) + '</td></tr>' +
      '<tr><td colspan="2"></td><td class="l">C.C. No.:</td><td>' + val(d.resp_cc) + '</td></tr>' +
      '<tr><td colspan="2"></td><td class="l">Entidad:</td><td>' + val(d.resp_entidad) + '</td></tr>' +
      '</table></div>';
  }

  // ---------------------------------------------------------------- AVISO LEGAL
  /**
   * Aviso legal de la ficha. Adaptado del que ya usan las fichas del EDR
   * (CDGRD Risaralda) a la DIGER, más un punto de datos personales (Ley 1581
   * de 2012), porque la ficha lleva teléfonos, documentos y firma.
   * Pedido del 18/09. Va al final de la página 2, en letra pequeña, para no
   * agregar hojas; también sale en la ficha en línea y en el PDF.
   */
  var AVISO_LEGAL = [
    ['Carácter preliminar', 'Esta ficha corresponde a una evaluación rápida por inspección visual practicada en el marco de la gestión del riesgo y la atención de emergencias. Es preliminar y está sujeta a modificación por evaluaciones posteriores.'],
    ['Alcance técnico', 'No constituye estudio de vulnerabilidad estructural, peritaje ni concepto técnico definitivo.'],
    ['Efectos', 'Las categorías Habitable, Uso restringido y No habitable son recomendaciones técnicas de seguridad. No constituyen acto administrativo ni generan, por sí solas, orden de desalojo, declaratoria de ruina, autorización de demolición ni derecho a subsidio, ayuda o reubicación, ni sustituyen los registros de la autoridad competente.'],
    ['Vigencia', 'El registro oficial es el que administra la DIGER de la Alcaldía de Pereira. Las impresiones, capturas y copias reflejan únicamente el estado de la información al momento de obtenerlas.'],
    ['Datos personales', 'Los datos personales aquí contenidos se tratan conforme a la Ley 1581 de 2012 y sus normas reglamentarias, con la única finalidad de la gestión del riesgo de desastres. Se prohíbe su divulgación o uso para fines distintos.'],
    ['Exoneración de responsabilidad', 'La entidad no se hace responsable por el uso indebido, la interpretación errónea, la alteración o la reproducción fuera de contexto de esta información, ni por las decisiones que terceros adopten con fundamento en ella.'],
    ['Consultas y reclamaciones', 'Las solicitudes de corrección o actualización deben presentarse ante la DIGER – Alcaldía de Pereira por los canales oficiales de atención al ciudadano.']
  ];

  /** Un solo párrafo numerado: ocupa la mitad que una lista y cabe en la página 2. */
  function avisoLegal() {
    return '<div class="caja legal"><b class="legal-tit">AVISO LEGAL.</b> ' +
      AVISO_LEGAL.map(function (x, i) { return '<b>' + (i + 1) + '. ' + esc(x[0]) + '.</b> ' + esc(x[1]); }).join(' ') +
      '</div>';
  }

  // ---------------------------------------------------------------- FECHA DE CONSULTA
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** "18 de septiembre de 2026, 15:32" en hora de Colombia (UTC-5), sin importar dónde se abra. */
  function ahoraColombia(fecha) {
    var c = new Date((fecha ? fecha.getTime() : Date.now()) - 5 * 3600000);
    var p = function (x) { return ('0' + x).slice(-2); };
    return c.getUTCDate() + ' de ' + MESES[c.getUTCMonth()] + ' de ' + c.getUTCFullYear() + ', ' +
      p(c.getUTCHours()) + ':' + p(c.getUTCMinutes());
  }

  /**
   * Sello de consulta, como en las fichas del EDR (CDGRD): cuándo se sacaron
   * los datos. Una impresión o captura queda fechada; los datos pueden
   * cambiar después. o.sello cambia el texto (p. ej. en la vista previa).
   */
  function selloConsulta(o) {
    if (o.sello === false) return '';
    return '<div class="sello">' + (o.sello ? esc(o.sello) : 'Datos consultados el <b>' + esc(o.consultado) + '</b> · Esta ficha se genera ' +
      'en el momento de abrirla y siempre muestra la información vigente en la base de datos de la DIGER – Alcaldía de Pereira.') + '</div>';
  }

  function rastro(o) {
    if (o.sello === false) return '';
    return '<div class="rastro">' + (o.sello ? esc(o.sello) : 'Consultado el ' + esc(o.consultado) + '.' +
      (o.enlace ? ' Fuente: ' + esc(o.enlace) + '.' : '') + ' Los datos pueden haber cambiado después de esta fecha.') + '</div>';
  }

  // ---------------------------------------------------------------- ANEXO
  /**
   * Hoja anexa: solo cuando el evaluador clasificó MENOS grave que la
   * sugerencia del sistema, para dejar constancia de su justificación. En los
   * demás casos la ficha queda en las 2 páginas del formulario oficial.
   */
  function anexo(d, o, consecutivo) {
    if (!E.menosGraveQueSugerencia(d) && !d.justificacion_clasif) return '';
    var L = o.logos || {};
    var sug = E.sugerencia(d);
    var nombres = { verde: 'HABITABLE (Verde)', amarillo: 'USO RESTRINGIDO (Amarillo)', rojo: 'NO HABITABLE (Rojo)' };
    var bloqueSug = sug.color
      ? '<b>' + nombres[sug.color] + '</b>' + (sug.motivos.length ? ' — por: ' + sug.motivos.map(function (m) { return esc(m.texto); }).join('; ') : '')
      : 'Sin sugerencia: faltan casillas de las secciones 7 a 10.';
    var elegido = d.clasif_habitabilidad ? E.etiquetaDe('habitabilidad', d.clasif_habitabilidad) : '(sin clasificar)';
    return '<div class="pagina salto">' +
      '<table class="enc"><tr><td class="enc-izq">' + (L.entidad ? '<img src="' + L.entidad + '" alt="">' : '') +
      '</td><td class="enc-cen">ANEXO — JUSTIFICACIÓN DE LA CLASIFICACIÓN<br><span class="enc-sub">Formulario No. ' + esc(consecutivo) + '</span></td><td class="enc-der"></td></tr></table>' +
      '<div class="caja">' + titulo('SUGERENCIA DEL SISTEMA Y CLASIFICACIÓN DEL EVALUADOR') +
      '<div class="texto">Sugerencia automática según los colores del formulario (secciones 7 a 10): ' + bloqueSug +
      '<br>Clasificación del evaluador: <b>' + esc(elegido) + '</b>' +
      (d.justificacion_clasif ? '<br>Justificación: ' + esc(d.justificacion_clasif) : '') +
      '<br><span class="nota">La sugerencia es una ayuda: la clasificación la decide el evaluador.</span></div></div>' +
      '</div>';
  }

  // ---------------------------------------------------------------- CSS
  var CSS =
    '@page{size:letter;margin:8mm 9mm}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#000;background:#fff}' +
    '.pagina{width:196mm;margin:0 auto}' +
    '.salto{page-break-before:always;break-before:page}' +
    '.aviso{background:#fff3cd;border:1px solid #d9a400;padding:6px 8px;margin:0 auto 6px;max-width:196mm;font-size:9pt}' +
    '.enc{width:100%;border-collapse:collapse;margin-bottom:2px}' +
    '.enc td{vertical-align:middle}' +
    '.enc-izq{width:24%}.enc-der{width:24%;text-align:right}' +
    '.enc-izq img,.enc-der img{max-width:100%;max-height:12mm}' +
    '.enc-cen{text-align:center;font-weight:bold;font-size:11pt;line-height:1.35}' +
    '.enc-sub{font-weight:normal;font-size:9pt}' +
    '.pie{width:100%;border-collapse:collapse;margin-top:2px;font-size:7.6pt}' +
    '.pie-izq img{max-height:7mm}.pie-cen{text-align:center}.pie-der{text-align:right}' +
    '.caja{border:1.3px solid #000;padding:1px 5px 3px;margin-bottom:3px;page-break-inside:avoid;break-inside:avoid}' +
    '.tit{text-align:center;font-weight:bold;font-size:9pt;margin:1px 0 2px}' +
    '.subt{font-weight:bold;font-size:9pt;margin:3px 0 1px;display:inline-block}' +
    '.lbl{margin-top:2px}' +
    '.t{width:100%;border-collapse:collapse}' +
    '.t td{padding:1px 3px;vertical-align:middle}' +
    '.t td.l{white-space:nowrap;width:1%}' +
    '.t td.c{text-align:center;width:1%}' +
    '.mitades{table-layout:fixed}.mitades>tbody>tr>td{width:50%;vertical-align:top;padding:0 4px 0 0}' +
    '.mitades>colgroup>col.ancha{width:58%}' +
    '.val{display:inline-block;min-width:14mm;border-bottom:1px solid #000;padding:0 2px;min-height:11px}' +
    '.cb{display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;font-size:8.5pt;line-height:10px;font-weight:bold;vertical-align:middle}' +
    '.cb.on{outline:1.5px solid #000}' +
    '.op{white-space:nowrap;margin-right:6px}' +
    '.fila{margin:2px 0}' +
    '.gris{background:#e6e6e6;padding:3px 4px;margin-top:3px}' +
    '.nota{font-size:7.6pt;color:#333}' +
    '.sis td.l{width:22%}' +
    '.dano td.l{white-space:normal;width:auto}' +
    '.esq-t{border:1px solid #000;font-weight:bold;width:50%}' +
    '.cuad{border:1px solid #000;height:46mm;vertical-align:middle;text-align:center;' +
      'background-image:linear-gradient(#ddd 1px,transparent 1px),linear-gradient(90deg,#ddd 1px,transparent 1px);background-size:5mm 5mm}' +
    '.cuad img{max-width:100%;max-height:44mm;background:#fff}' +
    '.texto{min-height:9mm;padding:2px;white-space:pre-wrap}' +
    '.firma{font-style:italic}.img-firma{max-height:16mm;max-width:60mm;display:block}' +
    '.fotos td.foto{width:50%;text-align:center;vertical-align:top;padding:3px}' +
    '.fotos img{max-width:100%;max-height:85mm}' +
    '.pie-foto{font-size:8pt;margin-top:2px}' +
    '.legal{padding:2px 6px 3px;font-size:6pt;line-height:1.2;color:#222;text-align:justify}' +
    '.legal-tit{font-size:6.6pt}' +
    '.sello{border-left:3px solid #1F4E79;background:#EEF3F8;padding:3px 7px;margin-bottom:3px;font-size:7.2pt;color:#333}' +
    '.rastro{font-size:5.6pt;color:#444;text-align:center;margin-top:0;overflow-wrap:anywhere;line-height:1.15}' +
    '@media screen{body{background:#eef1f4;padding:10px 6px}.pagina{background:#fff;padding:8px;box-shadow:0 1px 4px rgba(0,0,0,.2);margin-bottom:12px}}' +
    '@media screen{.aviso{width:196mm}}' +
    '@media print{.no-imprimir{display:none}.pagina,.aviso{zoom:1!important}}';

  // En pantallas angostas la hoja carta se encoge entera, como un visor de
  // PDF, en vez de desbordarse o reacomodarse (debe verse igual al papel).
  // Al imprimir no se toca. El conversor a PDF de Google no ejecuta esto.
  var AJUSTE = '<script>(function(){function f(){var z=Math.min(1,(window.innerWidth-12)/760);' +
    'var e=document.querySelectorAll(".pagina,.aviso");for(var i=0;i<e.length;i++)e[i].style.zoom=z;}' +
    'window.addEventListener("resize",f);f();})();<\/script>';

  // ---------------------------------------------------------------- ARMADO
  /**
   * @param {Object} d  datos con códigos
   * @param {Object} o  { logos:{sngrd,miyamoto,pie,entidad}, fotos:{campo:[url]},
   *                      firma: url de la imagen de la firma, aviso:'texto',
   *                      cuerpoSolo:bool (sin <html>, para incrustar) }
   */
  function html(d, o) {
    cargarEsquema();
    d = d || {}; o = o || {};
    var consecutivo = d.num_formulario || '(sin asignar)';
    o.consultado = o.consultado || ahoraColombia();
    var p1 = '<div class="pagina">' + encabezado(o, consecutivo) + selloConsulta(o) +
      '<table class="t mitades"><tr><td>' + s1(d) + '</td><td>' + s2(d) + s3(d) + '</td></tr></table>' +
      s4(d) + s5(d) + s6(d) + s7y8(d) + s9(d) + pie(o, consecutivo) + '</div>';
    var p2 = '<div class="pagina salto">' + encabezado(o, consecutivo) +
      s10(d) + s11(d, o) + s12(d) + s13(d) + s14(d) + s15(d) + s16(d, o) + avisoLegal() + pie(o, consecutivo) + '</div>';
    var cuerpo = (o.aviso ? '<div class="aviso no-imprimir">' + esc(o.aviso) + '</div>' : '') + p1 + p2 + anexo(d, o, consecutivo);
    if (o.cuerpoSolo) return '<style>' + CSS + '</style>' + cuerpo;
    return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Formulario ' + esc(consecutivo) + '</title><style>' + CSS + '</style></head><body>' + cuerpo +
      (o.sinAjuste ? '' : AJUSTE) + '</body></html>';
  }

  return { html: html, esc: esc, fechaPartes: fechaPartes, ahoraColombia: ahoraColombia };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Ficha;
