/* =========================================================================
   ESQUEMA DEL FORMULARIO REGIONAL DE EVALUACIÓN RÁPIDA DE DAÑOS
   (formato Miyamoto / USAID, versión V.1.0 - 03-2023)

   ESTE ARCHIVO ES LA ÚNICA FUENTE DE VERDAD DEL FORMULARIO.
   Lo usan, sin cambiar una letra:
     - la app del celular   (app/js/esquema.js)
     - el servidor          (servidor/Esquema.gs, copia exacta)
     - las verificaciones   (verificaciones/*.js)

   En taludes había dos esquemas escritos a mano (Schema.gs y
   ficha-schema.js) y había que compararlos campo por campo. Aquí hay uno:
   la verificación exige que la copia del servidor sea idéntica, y el
   servidor informa su huella para que la app avise si no coinciden.

   No usa nada del navegador ni de Google: solo datos y funciones puras.
   Todo va dentro de una función para no chocar con otros archivos, porque
   Apps Script mete todos los .gs en el mismo espacio de nombres.
   ========================================================================= */
var Esquema = (function () {
  'use strict';

  var VERSION = '2026-09-18.3';

  // ---------------------------------------------------------------- LISTAS
  // [código, etiqueta, (filtro)]. El código es lo que viaja y se guarda en
  // el celular; en la hoja se escribe la ETIQUETA, que es lo que la DIGER
  // lee y corrige a mano.
  var LISTAS = {
    si_no: [['si', 'Sí'], ['no', 'No']],
    si_no_noclaro: [['si', 'Sí'], ['no', 'No'], ['no_claro', 'No es claro']],
    tipo_inspeccion: [['exterior', 'Exterior solamente'], ['completa', 'Completa']],
    tipo_amenaza: [
      ['avenida_torrencial', 'Avenida torrencial'], ['erupcion_volcanica', 'Erupción volcánica'],
      ['incendio_estructural', 'Incendio estructural'], ['inundacion', 'Inundación'],
      ['movimiento_masa', 'Movimiento en masa'], ['sismo', 'Sismo'],
      ['vendaval', 'Vendaval'], ['otro', 'Otro']
    ],
    departamento: [['risaralda', 'Risaralda']],
    municipio: [
      ['pereira', 'Pereira'], ['dosquebradas', 'Dosquebradas'], ['santa_rosa', 'Santa Rosa de Cabal'],
      ['la_virginia', 'La Virginia'], ['marsella', 'Marsella'], ['belen_umbria', 'Belén de Umbría'],
      ['apia', 'Apía'], ['balboa', 'Balboa'], ['la_celia', 'La Celia'], ['santuario', 'Santuario'],
      ['pueblo_rico', 'Pueblo Rico'], ['mistrato', 'Mistrató'], ['guatica', 'Guática'],
      ['quinchia', 'Quinchía']
    ],
    zona: [['urbano', 'Urbano'], ['rural', 'Rural']],
    tipo_edificacion: [['publica', 'Pública'], ['privada', 'Privada']],
    uso: [
      ['residencial', 'Residencial'], ['comercial', 'Comercial'], ['educacional', 'Educacional'],
      ['salud', 'Salud'], ['hotelero', 'Hotelero'], ['oficinas', 'Oficinas'],
      ['institucional', 'Institucional'], ['industrial', 'Industrial'], ['bodegas', 'Bodegas'],
      ['estacionamientos', 'Estacionamientos'], ['otro', 'Otro']
    ],
    // 5.1 — el sistema depende del material (tercer elemento = material).
    material_estructural: [
      ['concreto', 'Concreto reforzado'], ['mamposteria', 'Mampostería'], ['acero', 'Acero'],
      ['madera', 'Madera'], ['bahareque_tapia', 'Bahareque o tapia'], ['otros', 'Otros']
    ],
    sistema_estructural: [
      ['porticos', 'Pórticos', 'concreto'], ['muros_estructurales', 'Muros estructurales', 'concreto'],
      ['dual_combinado', 'Sistema dual o combinado', 'concreto'], ['prefabricado', 'Prefabricado', 'concreto'],
      ['mamp_confinada', 'Mampostería confinada', 'mamposteria'],
      ['mamp_reforzada', 'Mampostería reforzada', 'mamposteria'],
      ['mamp_simple', 'Mampostería simple', 'mamposteria'],
      ['porticos_arriostrados', 'Pórticos arriostrados', 'acero'],
      ['porticos_no_arriostrados', 'Pórticos no arriostrados', 'acero'],
      ['acero_otro', 'Otro (acero)', 'acero'],
      ['estructura_madera', 'Estructura en madera', 'madera'],
      ['estructura_guadua', 'Estructura en guadua', 'madera'],
      ['muros_bahareque', 'Muros en bahareque', 'bahareque_tapia'],
      ['muros_tapia', 'Muros en tapia', 'bahareque_tapia'],
      ['mixto', 'Mixto', 'otros'], ['ninguno', 'Ninguno', 'otros']
    ],
    material_entrepiso: [
      ['concreto', 'Concreto reforzado'], ['acero', 'Acero'], ['madera', 'Madera'],
      ['otro', 'Otro'], ['no_tiene', 'No tiene (un solo piso)']
    ],
    sistema_entrepiso: [
      ['placa_maciza', 'Placa maciza', 'concreto'], ['placa_aligerada', 'Placa aligerada', 'concreto'],
      ['steeldeck', 'Steeldeck', 'acero'], ['vigas_con_conectores', 'Vigas con conectores', 'acero'],
      ['vigas_sin_conectores', 'Vigas sin conectores', 'acero'],
      ['vigas', 'Vigas', 'madera'], ['cerchas', 'Cerchas', 'madera'],
      ['mixto', 'Mixto', 'otro'], ['entrepiso_otro', 'Otro', 'otro']
    ],
    material_cubierta: [['concreto', 'Concreto reforzado'], ['acero', 'Acero'], ['madera', 'Madera'], ['otro', 'Otro']],
    soporte_cubierta: [
      ['vigas_concreto', 'Vigas de concreto', 'concreto'],
      ['placa_maciza_aligerada', 'Placa maciza / aligerada', 'concreto'],
      ['vigas_acero', 'Vigas de acero', 'acero'], ['cerchas_acero', 'Cerchas de acero', 'acero'],
      ['vigas_madera', 'Vigas de madera', 'madera'], ['cerchas_madera', 'Cerchas de madera', 'madera'],
      ['cubierta_otro', 'Otro', 'otro']
    ],
    tipo_cubierta: [
      ['teja_zinc', 'Teja de zinc'], ['teja_barro', 'Teja de barro'],
      ['teja_fibrocemento', 'Teja de fibrocemento'], ['teja_plastica', 'Teja plástica'],
      ['plastico_paja', 'Plástico-paja'], ['otro', 'Otro']
    ],
    morfologia: [
      ['divisoria', 'Divisoria'], ['ladera', 'Ladera'], ['pie_ladera', 'Pie de ladera'],
      ['valle', 'Valle'], ['borde_rio', 'Borde de río'], ['talud', 'Talud'], ['otro', 'Otro']
    ],
    // Secciones 9 y 10: el papel tiene TRES casillas (N/L, M, S), no cuatro.
    nlms: [['nl', 'N/L'], ['m', 'M'], ['s', 'S']],
    habitabilidad: [
      ['habitable', 'Habitable (Verde)'], ['uso_restringido', 'Uso restringido (Amarillo)'],
      ['no_habitable', 'No habitable (Rojo)']
    ],
    nivel_dano: [['ninguno_menor', 'Ninguno/Menor'], ['moderado', 'Moderado'], ['severo', 'Severo']],
    ocupacion: [['ocupada', 'Ocupada'], ['desocupada', 'Desocupada']],
    eval_adicional: [
      ['ninguna', 'Ninguna'], ['estructural', 'Estructural'], ['geotecnica', 'Geotécnica'],
      ['empresa_servicios', 'Empresa prestadora de servicios públicos']
    ],
    medidas: [
      ['ninguna', 'Ninguna'], ['evacuar_edificacion', 'Evacuar edificación'],
      ['evacuar_aledanas', 'Evacuar edificaciones aledañas'], ['apuntalar', 'Apuntalar'],
      ['demoler_elementos', 'Demoler elementos en peligro de caer'],
      ['estabilizar_taludes', 'Estabilizar taludes'], ['drenar_agua', 'Drenar agua'],
      ['desconectar_servicios', 'Desconectar servicios'], ['restringir_paso', 'Restringir paso'],
      ['limpiar_cubierta', 'Limpiar material acumulado en cubierta'],
      ['cambiar_cubierta', 'Cambiar teja/material de cubierta'], ['otro', 'Otro']
    ],
    servicios: [['energia', 'Energía'], ['agua', 'Agua'], ['gas', 'Gas']],
    paso: [['peatonal', 'Peatonal'], ['vehicular', 'Vehicular']],
    tipo_documento: [['cc', 'C.C.'], ['pasaporte', 'Pasaporte']]
  };

  // ---------------------------------------------------------------- COLORES
  // Copiados del formulario impreso, casilla por casilla. El color de la
  // casilla ES la regla de habitabilidad: rojo empuja a "No habitable",
  // amarillo a "Uso restringido". El EDR de Survey123 tenía otra regla
  // (columnas M en amarillo, vigas S en rojo, colapso parcial en rojo,
  // licuación en amarillo) y no miraba la sección 10; aquí manda el papel.
  var V = 'verde', A = 'amarillo', R = 'rojo';
  var ESTRUCTURALES = [          // sección 9: [id, etiqueta, color N/L, M, S]
    ['columnas', 'Columnas', V, R, R],
    ['muros_portantes', 'Muros portantes', V, R, R],
    ['vigas', 'Vigas', V, A, A],
    ['nodos', 'Nodos o puntos de conexión', V, R, R],
    ['riostras', 'Riostras', V, R, R],
    ['entrepiso', 'Entrepiso', V, A, A]
  ];
  // Sección 10. "interior": solo se pide si la inspección es completa
  // (desde afuera no se ven). Misma decisión que el EDR.
  var NO_ESTRUCTURALES = [
    ['muros_fachada', 'Muros de fachada/antepechos', V, A, A],
    ['muros_divisorios', 'Muros divisorios', V, A, A, 'interior'],
    ['ventanales', 'Ventanales/vidrios de fachada', V, V, A],
    ['cielo_raso', 'Cielo raso/luminarias', V, A, A, 'interior'],
    ['cubiertas', 'Cubiertas', V, A, A],
    ['escaleras', 'Escaleras', V, A, A, 'interior'],
    ['ascensores', 'Ascensores', V, V, A, 'interior'],
    ['balcones', 'Balcones', V, V, A],
    ['tanques', 'Tanques elevados', V, A, A],
    ['gas', 'Instalaciones de gas', V, V, A, 'interior'],
    ['electricas', 'Instalaciones eléctricas', V, V, A, 'interior'],
    ['acueducto', 'Acueducto y alcantarillado', V, V, A, 'interior']
  ];

  function campoDano(fila, seccionN) {
    var c = {
      id: 'dano_' + fila[0], etiqueta: fila[1], tipo: 'nlms', lista: 'nlms', req: true,
      colores: { nl: fila[2], m: fila[3], s: fila[4] }, grupoDano: seccionN
    };
    if (fila[5] === 'interior') {
      c.si = { campo: 'tipo_inspeccion', es: 'completa' };
      c.nota = 'Solo en inspección completa';
    }
    return c;
  }
  /**
   * Foto opcional del elemento dañado: aparece al marcar M o S (máx. 3).
   * Se había quitado el 18/09 junto con los esquemas y la DIGER pidió
   * volverla a tener; en la ficha van en un anexo al final.
   */
  function fotoDano(fila) {
    return {
      id: 'foto_' + fila[0], etiqueta: 'Foto del daño — ' + fila[1], tipo: 'fotos', max: 3,
      compacto: true, si: { campo: 'dano_' + fila[0], es: ['m', 's'] }
    };
  }

  var SI_SISMO = { campo: 'tipo_amenaza', es: 'sismo' };
  var SI_PREVIA = { campo: 'eval_previa', es: 'si' };

  // ---------------------------------------------------------------- SECCIONES
  // Tipos: texto, largo, entero, decimal, telefono, fechahora, fecha,
  //        una (una opción), varias (varias opciones), nlms, gps, fotos,
  //        firma, sistema (lo pone la app o el servidor, no se escribe).
  // req: obligatorio (solo cuando está visible). si: condición para mostrarlo.
  // enApp:false -> no se pide en campo; lo llena la DIGER en la hoja.
  // perfil: se llena solo con los datos del evaluador guardados en el celular.
  // Sección con soloLectura: se muestra pero no se edita en la ficha.
  //
  // Ajustes pedidos por la DIGER el 2026-09-18: amenaza por defecto Sismo;
  // ID Zona e ID Grupo no se llenan en campo; sin croquis ni fotos por
  // elemento, solo 1 o 2 fotos de fachada; la sección 16 sale del perfil
  // (sin ID evaluador) y la firma se dibuja una vez al ingresar.
  var SECCIONES = [
    { id: 's1', n: '1', titulo: 'Identificación de la evaluación', campos: [
      { id: 'num_formulario', etiqueta: 'No. del formulario', tipo: 'sistema', nota: 'Lo asigna el servidor al recibirla' },
      { id: 'fecha_hora_inspeccion', etiqueta: 'Fecha y hora de inspección', tipo: 'fechahora', req: true },
      { id: 'tipo_inspeccion', etiqueta: 'Tipo de inspección', tipo: 'una', lista: 'tipo_inspeccion', req: true },
      { id: 'tipo_amenaza', etiqueta: 'Tipo de amenaza', tipo: 'una', lista: 'tipo_amenaza', req: true },
      { id: 'tipo_amenaza_otro', etiqueta: '¿Cuál amenaza?', tipo: 'texto', req: true, si: { campo: 'tipo_amenaza', es: 'otro' } },
      { id: 'id_zona', etiqueta: 'ID Zona', tipo: 'texto', enApp: false },
      { id: 'id_grupo', etiqueta: 'ID Grupo', tipo: 'texto', enApp: false },
      { id: 'persona_contacto', etiqueta: 'Persona de contacto', tipo: 'texto' },
      { id: 'num_contacto', etiqueta: 'Núm. de contacto', tipo: 'telefono' }
    ] },
    { id: 's3', n: '3', titulo: 'Información general', campos: [
      { id: 'ubicacion', etiqueta: 'Ubicación (WGS 84)', tipo: 'gps', req: true },
      { id: 'departamento', etiqueta: 'Departamento', tipo: 'una', lista: 'departamento', req: true, desplegable: true },
      { id: 'municipio', etiqueta: 'Municipio', tipo: 'una', lista: 'municipio', req: true, desplegable: true },
      { id: 'barrio_vereda', etiqueta: 'Barrio/Vereda', tipo: 'texto', req: true },
      { id: 'zona', etiqueta: 'Zona', tipo: 'una', lista: 'zona', req: true }
    ] },
    { id: 's4', n: '4', titulo: 'Identificación de la edificación', campos: [
      { id: 'direccion', etiqueta: 'Dirección', tipo: 'texto', req: true },
      { id: 'nombre_edificacion', etiqueta: 'Nombre de la edificación', tipo: 'texto' },
      { id: 'num_pisos', etiqueta: 'Núm. pisos sobre el nivel del suelo', tipo: 'entero', req: true, min: 1, max: 200 },
      { id: 'num_sotanos', etiqueta: 'Núm. sótanos', tipo: 'entero', req: true, min: 0, max: 20 },
      { id: 'tipo_edificacion', etiqueta: 'Tipo de edificación', tipo: 'una', lista: 'tipo_edificacion', req: true },
      { id: 'uso', etiqueta: 'Uso', tipo: 'una', lista: 'uso', req: true },
      { id: 'uso_otro', etiqueta: '¿Cuál uso?', tipo: 'texto', req: true, si: { campo: 'uso', es: 'otro' } },
      { id: 'dim_frente', etiqueta: 'Frente aproximado (m)', tipo: 'decimal', req: true, min: 0.5, max: 1000 },
      { id: 'dim_fondo', etiqueta: 'Fondo aproximado (m)', tipo: 'decimal', req: true, min: 0.5, max: 1000 }
    ] },
    { id: 's5', n: '5', titulo: 'Sistema estructural, entrepiso y cubierta', campos: [
      { id: 'mat_estructural', etiqueta: '5.1 Sistema estructural — material', tipo: 'una', lista: 'material_estructural', req: true },
      { id: 'sist_estructural', etiqueta: '5.1 Sistema estructural', tipo: 'una', lista: 'sistema_estructural', req: true, filtro: 'mat_estructural', si: { campo: 'mat_estructural', lleno: true } },
      { id: 'sist_estructural_otro', etiqueta: '¿Cuál? / ¿qué combina?', tipo: 'texto', req: true, si: { campo: 'sist_estructural', es: ['acero_otro', 'mixto'] } },
      { id: 'mat_entrepiso', etiqueta: '5.2 Sistema de entrepiso — material', tipo: 'una', lista: 'material_entrepiso', req: true },
      { id: 'sist_entrepiso', etiqueta: '5.2 Sistema de entrepiso', tipo: 'una', lista: 'sistema_entrepiso', req: true, filtro: 'mat_entrepiso', si: { campo: 'mat_entrepiso', no: 'no_tiene' } },
      { id: 'sist_entrepiso_otro', etiqueta: '¿Cuál? / ¿qué combina?', tipo: 'texto', req: true, si: { campo: 'sist_entrepiso', es: ['entrepiso_otro', 'mixto'] } },
      { id: 'mat_sop_cubierta', etiqueta: '5.3 Soporte de la cubierta — material', tipo: 'una', lista: 'material_cubierta', req: true },
      { id: 'sop_cubierta', etiqueta: '5.3 Sistema de soporte de la cubierta', tipo: 'una', lista: 'soporte_cubierta', req: true, filtro: 'mat_sop_cubierta', si: { campo: 'mat_sop_cubierta', lleno: true } },
      { id: 'sop_cubierta_otro', etiqueta: '¿Cuál soporte?', tipo: 'texto', req: true, si: { campo: 'sop_cubierta', es: 'cubierta_otro' } },
      { id: 'tipo_cubierta', etiqueta: '5.4 Tipo de cubierta', tipo: 'una', lista: 'tipo_cubierta', req: true },
      { id: 'tipo_cubierta_otro', etiqueta: '¿Cuál cubierta?', tipo: 'texto', req: true, si: { campo: 'tipo_cubierta', es: 'otro' } }
    ] },
    { id: 's6', n: '6', titulo: 'Condiciones preexistentes y de entorno', campos: [
      { id: 'morfologia_sitio', etiqueta: '6.1 Morfología del sitio', tipo: 'una', lista: 'morfologia', req: true },
      { id: 'morfologia_otro', etiqueta: '¿Cuál morfología?', tipo: 'texto', req: true, si: { campo: 'morfologia_sitio', es: 'otro' } },
      { id: 'amenaza_hidrica', etiqueta: '6.2 Amenaza por cuerpos hídricos afectados', tipo: 'una', lista: 'si_no', req: true },
      { id: 'distancia_hidrica', etiqueta: 'Distancia aprox. (m)', tipo: 'decimal', req: true, min: 0, max: 10000, si: { campo: 'amenaza_hidrica', es: 'si' } },
      { id: 'obs_hidrica', etiqueta: 'Observaciones', tipo: 'largo', si: { campo: 'amenaza_hidrica', es: 'si' } },
      { id: 'piso_debil', etiqueta: '6.3 ¿Hay piso débil?', tipo: 'una', lista: 'si_no', req: true, si: SI_SISMO },
      { id: 'columna_corta', etiqueta: '6.4 ¿Hay piso con columna corta?', tipo: 'una', lista: 'si_no', req: true, si: SI_SISMO },
      { id: 'cambios_rigidez', etiqueta: '6.5 ¿Hay cambios drásticos de rigidez?', tipo: 'una', lista: 'si_no', req: true, si: SI_SISMO }
    ] },
    { id: 's7', n: '7', titulo: 'Peligro global', campos: [
      { id: 'colapso_total', etiqueta: 'Colapso total', tipo: 'una', lista: 'si_no', req: true, colores: { si: R } },
      { id: 'colapso_parcial', etiqueta: 'Colapso parcial', tipo: 'una', lista: 'si_no_noclaro', req: true, colores: { si: A } },
      { id: 'inclinacion_evidente', etiqueta: 'Inclinación evidente', tipo: 'una', lista: 'si_no', req: true, colores: { si: R } },
      { id: 'riesgo_edif_adyacentes', etiqueta: 'Riesgo por edif. adyacentes', tipo: 'una', lista: 'si_no_noclaro', req: true, colores: { si: A } }
    ] },
    { id: 's8', n: '8', titulo: 'Peligro por condiciones geotécnicas', campos: [
      { id: 'licuacion_subsidencia', etiqueta: 'Licuación, asentamiento o subsidencia del terreno', tipo: 'una', lista: 'si_no', req: true, colores: { si: R } },
      { id: 'mov_masa_cercanos', etiqueta: 'Movimientos en masa cercanos', tipo: 'una', lista: 'si_no', req: true, colores: { si: R } }
    ] },
    { id: 's9', n: '9', titulo: 'Peligro por daño en elementos estructurales', ayuda: 'N/L: ninguno o leve · M: moderado · S: severo', campos: [] },
    { id: 's10', n: '10', titulo: 'Peligro por daño en elementos no estructurales', ayuda: 'N/L: ninguno o leve · M: moderado · S: severo', campos: [] },
    { id: 's11', n: '11', titulo: 'Fotos de la fachada', campos: [
      { id: 'fotos_generales', etiqueta: 'Fotos de la fachada (mínimo 1, máximo 2)', tipo: 'fotos', max: 2, min: 1, req: true },
      { id: 'fotos_descripcion', etiqueta: 'Descripción de las fotos', tipo: 'largo', enApp: false }
    ] },
    { id: 's12', n: '12', titulo: 'Clasificación de habitabilidad y del daño', sugerencia: true, campos: [
      { id: 'clasif_habitabilidad', etiqueta: 'Clasificación de habitabilidad', tipo: 'una', lista: 'habitabilidad', req: true },
      { id: 'justificacion_clasif', etiqueta: 'Justifique por qué clasifica menos grave que la sugerencia', tipo: 'largo', req: true, si: { menosGraveQueSugerencia: true } },
      { id: 'nivel_dano', etiqueta: 'Clasificación del daño', tipo: 'una', lista: 'nivel_dano', req: true },
      { id: 'eval_previa', etiqueta: '¿Existe una evaluación previa?', tipo: 'una', lista: 'si_no', req: true },
      { id: 'eval_previa_tipo', etiqueta: 'Tipo de evaluación', tipo: 'texto', si: SI_PREVIA },
      { id: 'eval_previa_entidad', etiqueta: 'Entidad', tipo: 'texto', si: SI_PREVIA },
      { id: 'eval_previa_clasif', etiqueta: 'Clasificación de habitabilidad de la evaluación previa', tipo: 'una', lista: 'habitabilidad', si: SI_PREVIA },
      { id: 'eval_previa_fecha', etiqueta: 'Fecha de la evaluación previa', tipo: 'fecha', si: SI_PREVIA }
    ] },
    { id: 's13', n: '13', titulo: 'Ocupación de la edificación', campos: [
      { id: 'estado_ocupacion', etiqueta: 'Estado al momento de la evaluación', tipo: 'una', lista: 'ocupacion', req: true }
    ] },
    { id: 's14', n: '14', titulo: 'Recomendaciones y medidas de seguridad', campos: [
      { id: 'eval_adicional', etiqueta: 'Evaluación adicional', tipo: 'varias', lista: 'eval_adicional', req: true, exclusiva: 'ninguna' },
      { id: 'medidas_seguridad', etiqueta: 'Medidas de seguridad', tipo: 'varias', lista: 'medidas', req: true, exclusiva: 'ninguna' },
      { id: 'servicios_desconectar', etiqueta: 'Desconectar servicios', tipo: 'varias', lista: 'servicios', req: true, si: { campo: 'medidas_seguridad', incluye: 'desconectar_servicios' } },
      { id: 'restringir_paso', etiqueta: 'Restringir paso', tipo: 'varias', lista: 'paso', req: true, si: { campo: 'medidas_seguridad', incluye: 'restringir_paso' } },
      { id: 'medidas_otro', etiqueta: '¿Cuál otra medida?', tipo: 'texto', req: true, si: { campo: 'medidas_seguridad', incluye: 'otro' } }
    ] },
    { id: 's15', n: '15', titulo: 'Comentarios finales', campos: [
      { id: 'comentarios_finales', etiqueta: 'Comentarios finales', tipo: 'largo' }
    ] },
    { id: 's16', n: '16', titulo: 'Información del evaluador', soloLectura: true, campos: [
      { id: 'eval_nombre', etiqueta: 'Nombre', tipo: 'texto', req: true, perfil: 'nombre' },
      { id: 'eval_id', etiqueta: 'ID Evaluador (según registro de evaluadores)', tipo: 'texto', enApp: false },
      { id: 'eval_tipo_doc', etiqueta: 'Tipo de documento', tipo: 'una', lista: 'tipo_documento', req: true, perfil: 'tipo_doc' },
      { id: 'eval_num_doc', etiqueta: 'Número de documento', tipo: 'texto', req: true, perfil: 'num_doc' },
      { id: 'eval_matricula', etiqueta: 'Matrícula / tarjeta profesional', tipo: 'texto', perfil: 'matricula' },
      { id: 'eval_entidad', etiqueta: 'Entidad', tipo: 'texto', req: true, perfil: 'entidad' },
      { id: 'eval_dependencia', etiqueta: 'Dependencia', tipo: 'texto', req: true, perfil: 'dependencia' },
      { id: 'eval_firma', etiqueta: 'Firma', tipo: 'firma', req: true, perfil: 'firma' },
      // Funcionario responsable: lo completa la DIGER en la hoja, no el evaluador.
      { id: 'resp_nombre', etiqueta: 'Funcionario responsable', tipo: 'texto', enApp: false },
      { id: 'resp_cc', etiqueta: 'C.C. funcionario responsable', tipo: 'texto', enApp: false },
      { id: 'resp_entidad', etiqueta: 'Entidad del funcionario responsable', tipo: 'texto', enApp: false }
    ] }
  ];

  // Se arman las secciones 9 y 10 a partir de las tablas de colores.
  SECCIONES.forEach(function (s) {
    if (s.id === 's9') ESTRUCTURALES.forEach(function (f) { s.campos.push(campoDano(f, 9), fotoDano(f)); });
    if (s.id === 's10') {
      NO_ESTRUCTURALES.forEach(function (f) { s.campos.push(campoDano(f, 10), fotoDano(f)); });
      // "Otros" no tiene color en el papel (casillas blancas): no pesa en la sugerencia.
      s.campos.push(
        { id: 'dano_otros_ne', etiqueta: 'Otros', tipo: 'nlms', lista: 'nlms', grupoDano: 10 },
        { id: 'dano_otros_ne_desc', etiqueta: 'Otros — ¿cuál?', tipo: 'texto', req: true, si: { campo: 'dano_otros_ne', es: ['m', 's'] } },
        fotoDano(['otros_ne', 'Otros'])
      );
    }
  });

  // Índices id -> campo e id -> sección.
  var CAMPOS = {};
  var SECCION_DE = {};
  SECCIONES.forEach(function (s) {
    s.campos.forEach(function (c) {
      if (CAMPOS[c.id]) throw new Error('Campo repetido en el esquema: ' + c.id);
      CAMPOS[c.id] = c; SECCION_DE[c.id] = s.id;
    });
  });

  // ---------------------------------------------------------------- UTILIDADES
  function vacio(v) {
    if (v == null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object' && !(v instanceof Date)) return Object.keys(v).length === 0;
    return false;
  }

  function normalizarTexto(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function opciones(campo, datos) {
    var lista = LISTAS[campo.lista] || [];
    if (campo.filtro && datos) {
      var m = datos[campo.filtro];
      lista = lista.filter(function (o) { return o[2] === m; });
    }
    return lista;
  }

  function etiquetaDe(listaNombre, codigo) {
    var l = LISTAS[listaNombre] || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === codigo) return l[i][1];
    return codigo == null ? '' : String(codigo);
  }

  function seccion(id) {
    for (var i = 0; i < SECCIONES.length; i++) if (SECCIONES[i].id === id) return SECCIONES[i];
    return null;
  }

  // ---------------------------------------------------------------- SUGERENCIA
  var GRAVEDAD = { verde: 0, amarillo: 1, rojo: 2 };
  var CLASIF_DE_COLOR = { verde: 'habitable', amarillo: 'uso_restringido', rojo: 'no_habitable' };
  var COLOR_DE_CLASIF = { habitable: 'verde', uso_restringido: 'amarillo', no_habitable: 'rojo' };

  /**
   * Sugerencia de habitabilidad según los colores del papel (secciones 7-10).
   * Devuelve { color, clasif, motivos:[{color, texto}], faltan:[id] }.
   * color = null mientras falte alguna casilla obligatoria de 7 a 10: una
   * sugerencia a medias ("verde" porque aún no marcó columnas) es peligrosa.
   */
  function sugerencia(datos) {
    datos = datos || {};
    var peor = 'verde', motivos = [], faltan = [];
    ['s7', 's8', 's9', 's10'].forEach(function (sid) {
      seccion(sid).campos.forEach(function (c) {
        if (!c.colores || !visible(c, datos)) return;
        var v = datos[c.id];
        if (vacio(v)) { if (c.req) faltan.push(c.id); return; }
        var color = c.colores[v];
        if (!color || color === 'verde') return;
        motivos.push({ color: color, texto: c.etiqueta + ': ' + etiquetaDe(c.lista, v) });
        if (GRAVEDAD[color] > GRAVEDAD[peor]) peor = color;
      });
    });
    motivos.sort(function (a, b) { return GRAVEDAD[b.color] - GRAVEDAD[a.color]; });
    var listo = faltan.length === 0;
    return {
      color: listo ? peor : null,
      clasif: listo ? CLASIF_DE_COLOR[peor] : null,
      motivos: motivos,
      faltan: faltan
    };
  }

  function menosGraveQueSugerencia(datos) {
    var s = sugerencia(datos);
    var elegido = COLOR_DE_CLASIF[datos.clasif_habitabilidad];
    return !!(s.color && elegido && GRAVEDAD[elegido] < GRAVEDAD[s.color]);
  }

  // ---------------------------------------------------------------- CONDICIONES
  function cumple(cond, d) {
    if (!cond) return true;
    if (cond.todos) return cond.todos.every(function (c) { return cumple(c, d); });
    if (cond.alguno) return cond.alguno.some(function (c) { return cumple(c, d); });
    if (cond.menosGraveQueSugerencia) return menosGraveQueSugerencia(d);
    var v = d[cond.campo];
    if ('es' in cond) {
      var lista = [].concat(cond.es);
      if (Array.isArray(v)) return v.some(function (x) { return lista.indexOf(x) !== -1; });
      return lista.indexOf(v) !== -1;
    }
    if ('no' in cond) return !vacio(v) && [].concat(cond.no).indexOf(v) === -1;
    if ('incluye' in cond) {
      return Array.isArray(v) && [].concat(cond.incluye).some(function (x) { return v.indexOf(x) !== -1; });
    }
    if ('lleno' in cond) return !vacio(v) === !!cond.lleno;
    return true;
  }

  /**
   * Un campo se ve si se pide en campo, su condición se cumple Y el campo
   * del que depende también se ve. Sin esto último, un "¿Cuál?" quedaba a
   * la vista aunque su pregunta madre ya estuviera oculta.
   */
  function visible(campo, datos, _prof) {
    if (campo.enApp === false) return false;
    datos = datos || {};
    if (!cumple(campo.si, datos)) return false;
    var madre = campo.si && campo.si.campo ? CAMPOS[campo.si.campo] : null;
    if (madre && (_prof || 0) < 8) return visible(madre, datos, (_prof || 0) + 1);
    return true;
  }

  /** Quita solo las opciones que ya no corresponden al material elegido. */
  function limpiarFiltros(datos) {
    SECCIONES.forEach(function (s) {
      s.campos.forEach(function (c) {
        if (!c.filtro || vacio(datos[c.id])) return;
        var ok = opciones(c, datos).some(function (o) { return o[0] === datos[c.id]; });
        if (!ok) delete datos[c.id];
      });
    });
    return datos;
  }

  // ---------------------------------------------------------------- VALIDACIÓN
  /** Error de un campo visible, o '' si está bien. */
  function errorDe(campo, datos) {
    var v = datos[campo.id];
    if (campo.tipo === 'sistema') return '';
    if (vacio(v)) return campo.req ? 'Falta' : '';
    if (campo.tipo === 'entero' || campo.tipo === 'decimal') {
      var n = aNumero(v);
      if (n === null) return 'No es un número';
      if (campo.tipo === 'entero' && Math.round(n) !== n) return 'Debe ser un número entero';
      if (campo.min != null && n < campo.min) return 'Mínimo ' + campo.min;
      if (campo.max != null && n > campo.max) return 'Máximo ' + campo.max;
    }
    if (campo.tipo === 'telefono' && !/^[0-9 +()-]{7,20}$/.test(String(v))) return 'Teléfono no válido';
    if (campo.tipo === 'gps' && !coordenadaValida(v.lat, v.lon)) return 'La ubicación no está en Risaralda';
    if (campo.tipo === 'fotos' && campo.min && (!Array.isArray(v) || v.length < campo.min)) {
      return 'Mínimo ' + campo.min + (campo.min === 1 ? ' foto' : ' fotos');
    }
    if (campo.tipo === 'fechahora' || campo.tipo === 'fecha') {
      var f = new Date(v);
      if (isNaN(f.getTime())) return 'Fecha no válida';
      if (f.getTime() > Date.now() + 10 * 60000) return 'La fecha no puede ser futura';
    }
    return '';
  }

  /** Lo que falta o está mal, en el orden del formulario. */
  function faltantes(datos) {
    datos = datos || {};
    var r = [];
    SECCIONES.forEach(function (s) {
      s.campos.forEach(function (c) {
        if (!visible(c, datos)) return;
        var e = errorDe(c, datos);
        if (e) r.push({ seccion: s.id, n: s.n, campo: c.id, etiqueta: c.etiqueta, error: e });
      });
    });
    return r;
  }

  /**
   * Quita los valores de campos que quedaron ocultos (ej. se cambió el
   * material y el sistema ya no corresponde). Así no viaja basura que la
   * ficha después imprimiría como si fuera cierta.
   */
  function limpiarOcultos(datos) {
    var d = {};
    Object.keys(datos || {}).forEach(function (k) { d[k] = datos[k]; });
    // Dos pasadas: quitar un valor puede ocultar otro que dependía de él.
    for (var pasada = 0; pasada < 3; pasada++) {
      SECCIONES.forEach(function (s) {
        s.campos.forEach(function (c) {
          if (c.enApp === false || !(c.id in d)) return;
          if (!visible(c, d)) { delete d[c.id]; return; }
          if (c.filtro && !vacio(d[c.id])) {
            var ok = opciones(c, d).some(function (o) { return o[0] === d[c.id]; });
            if (!ok) delete d[c.id];
          }
        });
      });
    }
    return d;
  }

  // ---------------------------------------------------------------- NÚMEROS Y COORDENADAS
  /**
   * Texto -> número, aceptando coma o punto decimal. null si no es número.
   * OJO: en una hoja en español, "4.81" escrito como TEXTO se vuelve 481
   * (pasó en taludes con las coordenadas). Por eso el servidor pasa TODO
   * número por aquí antes de escribir.
   */
  function aNumero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    var t = String(v).trim().replace(/\s/g, '');
    if (!t) return null;
    if (t.indexOf(',') !== -1 && t.indexOf('.') === -1) t = t.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  }

  /** Risaralda con margen: latitud 4.6 a 5.6, longitud -76.4 a -75.3. */
  function coordenadaValida(lat, lon) {
    lat = aNumero(lat); lon = aNumero(lon);
    return lat !== null && lon !== null && lat >= 4.6 && lat <= 5.6 && lon >= -76.4 && lon <= -75.3;
  }

  // ---------------------------------------------------------------- HOJA <-> CÓDIGOS
  // En la hoja van etiquetas legibles; la app y la ficha trabajan con códigos.
  // La ida y vuelta está probada en verificaciones/probar_esquema.js.
  var SEP = '; ';

  function aHoja(campo, v) {
    if (vacio(v)) return '';
    if (campo.tipo === 'una' || campo.tipo === 'nlms') return etiquetaDe(campo.lista, v);
    if (campo.tipo === 'varias') {
      return [].concat(v).map(function (x) { return etiquetaDe(campo.lista, x); }).join(SEP);
    }
    if (campo.tipo === 'entero' || campo.tipo === 'decimal') { var n = aNumero(v); return n === null ? String(v) : n; }
    return v;
  }

  function codigoDe(listaNombre, texto) {
    var t = normalizarTexto(texto);
    if (!t) return '';
    var l = LISTAS[listaNombre] || [];
    for (var i = 0; i < l.length; i++) {
      if (normalizarTexto(l[i][1]) === t || normalizarTexto(l[i][0]) === t) return l[i][0];
    }
    // Acepta "Habitable" por "Habitable (Verde)" y parecidos escritos a mano.
    for (var j = 0; j < l.length; j++) {
      if (normalizarTexto(l[j][1]).indexOf(t) === 0) return l[j][0];
    }
    return String(texto).trim();
  }

  function desdeHoja(campo, celda) {
    if (celda == null || celda === '') return '';
    if (campo.tipo === 'una' || campo.tipo === 'nlms') return codigoDe(campo.lista, celda);
    if (campo.tipo === 'varias') {
      return String(celda).split(/;|\n/).map(function (x) { return x.trim(); }).filter(Boolean)
        .map(function (x) { return codigoDe(campo.lista, x); });
    }
    return celda;
  }

  // ---------------------------------------------------------------- HUELLA
  /** Huella corta del esquema, para saber si app y servidor usan el mismo. */
  function huella() {
    var s = JSON.stringify([VERSION, LISTAS, SECCIONES]);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return VERSION + '/' + (h >>> 0).toString(36);
  }

  return {
    VERSION: VERSION,
    FORMATO: 'V.1.0 - 03-2023',
    LISTAS: LISTAS,
    SECCIONES: SECCIONES,
    CAMPOS: CAMPOS,
    SECCION_DE: SECCION_DE,
    GRAVEDAD: GRAVEDAD,
    COLOR_DE_CLASIF: COLOR_DE_CLASIF,
    CLASIF_DE_COLOR: CLASIF_DE_COLOR,
    vacio: vacio,
    normalizarTexto: normalizarTexto,
    opciones: opciones,
    etiquetaDe: etiquetaDe,
    seccion: seccion,
    visible: visible,
    sugerencia: sugerencia,
    menosGraveQueSugerencia: menosGraveQueSugerencia,
    errorDe: errorDe,
    faltantes: faltantes,
    limpiarOcultos: limpiarOcultos,
    limpiarFiltros: limpiarFiltros,
    aNumero: aNumero,
    coordenadaValida: coordenadaValida,
    aHoja: aHoja,
    desdeHoja: desdeHoja,
    codigoDe: codigoDe,
    huella: huella
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Esquema;
