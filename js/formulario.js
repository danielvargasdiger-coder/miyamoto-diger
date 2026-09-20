/* =========================================================================
   FORMULARIO — se dibuja a partir del esquema, una sección a la vez.
   ========================================================================= */
'use strict';

/** Orden de los pasos. La sección 2 del papel no es un paso: se arma sola con 12. */
const PASOS = Esquema.SECCIONES.map((s) => s.id).concat(['revisar']);

// ---------------------------------------------------------------- ABRIR / CERRAR
function datosIniciales(solicitud) {
  const d = {
    fecha_hora_inspeccion: ahoraLocal(),
    tipo_amenaza: 'sismo',          // pedido de la DIGER: casi todas son por sismo; se puede cambiar
    departamento: 'risaralda',
    municipio: 'pereira'
    // Sin zona por defecto (19/09): la pone la ubicación, y si cae fuera de
    // la capa el evaluador tiene que escoger Urbano o Rural a conciencia.
  };
  if (solicitud) {
    d.id_solicitud = solicitud.id_solicitud;
    d.direccion = solicitud.direccion || '';
    // El barrio de la solicitud es texto libre de quien la digitó: NO se copia.
    // Barrio/Vereda y Zona salen solo de la ubicación o de la lista oficial (20/09).
    d.persona_contacto = solicitud.contacto || '';
    d.num_contacto = solicitud.telefono || '';
  }
  return Esquema.aplicarFijos(d);
}

/**
 * Sección 16: sale SIEMPRE del perfil del celular (lo que el ingeniero puso
 * al ingresar), también en borradores viejos, para que un cambio en "Mis
 * datos" o en la firma se vea en todo lo que aún no se ha enviado.
 */
async function aplicarPerfil(idEval, d) {
  const p = APP.perfil || {};
  d.eval_nombre = p.nombre || '';
  d.eval_tipo_doc = p.tipo_doc || 'cc';
  d.eval_num_doc = p.num_doc || '';
  d.eval_matricula = p.matricula || '';
  // Los perfiles de antes de los desplegables no las tienen: Alcaldía de Pereira / DIGER.
  d.eval_entidad = p.entidad_ficha || CONFIG.ENTIDAD_FICHA;
  d.eval_dependencia = p.dependencia || CONFIG.DEPENDENCIA;
  delete d.eval_id;
  d.eval_firma = await ponerFirmaEnEvaluacion(idEval, p.firma);
  return d;
}

async function abrirEvaluacion(opciones) {
  let registro;
  if (opciones.borrador) {
    registro = opciones.borrador;
  } else {
    registro = { id: nuevoId(), datos: datosIniciales(opciones.solicitud), solicitud: opciones.solicitud || null, creado: new Date().toISOString() };
  }
  // Antes de la "foto" de abajo: así aplicar el perfil no cuenta como un cambio del ingeniero.
  await aplicarPerfil(registro.id, registro.datos);
  Esquema.aplicarFijos(registro.datos);   // borradores de antes del bloqueo
  await depurarBarrio(registro.datos);
  APP.actual = {
    id: registro.id,
    datos: registro.datos,
    solicitud: registro.solicitud,
    creado: registro.creado,
    paso: registro.paso || 's1',
    mostrarErrores: false,
    // FOTO de los datos al abrir: para saber al salir si escribió algo.
    // (En taludes se comparaba contra datosIniciales() regenerado, que trae
    // la hora de ahora, y siempre parecía que había cambios.)
    alAbrir: JSON.stringify(registro.datos),
    esNueva: !opciones.borrador
  };
  $('#vista-ficha').hidden = false;
  document.body.classList.add('sin-scroll');
  $('#ficha-id').textContent = registro.solicitud ? registro.solicitud.id_solicitud : 'Evaluación nueva';
  precalentarGps();
  irAPaso(APP.actual.paso);
}

function huboCambios() { return APP.actual && JSON.stringify(APP.actual.datos) !== APP.actual.alAbrir; }

/**
 * Al salir se PREGUNTA si se guarda el borrador (decisión de taludes). Si no
 * tocó nada y era nueva, se va sin preguntar y sin dejar un borrador vacío:
 * en taludes unos días de pruebas dejaron 92 borradores.
 */
async function salirDeFicha() {
  if (!APP.actual) return;
  clearTimeout(_autoguardado);
  if (!huboCambios()) {
    if (APP.actual.esNueva) await borrarBorrador(APP.actual.id);
    return await cerrarVistaFicha();
  }
  const r = await preguntar('¿Guardar esta evaluación como borrador?',
    'Queda solo en este celular y puede seguir llenándola después.',
    [['guardar', 'Guardar borrador', 'principal'], ['descartar', 'Descartar', 'peligro'], ['seguir', 'Seguir llenando', '']]);
  if (r === 'seguir' || !r) return;
  if (r === 'guardar') await guardarBorrador(true);
  else await borrarBorrador(APP.actual.id);
  await cerrarVistaFicha();
}

/**
 * Cierra la ficha y vuelve a LEER lo guardado antes de pintar la lista.
 * Antes pintaba con la lista que tenía en memoria: un borrador recién
 * guardado no aparecía en "Borradores" hasta sincronizar, y parecía perdido
 * (lo encontraron las pruebas del 18/09).
 */
async function cerrarVistaFicha() {
  soltarMapaPunto();
  clearTimeout(_autoguardado);            // que un autoguardado pendiente no resucite un borrador descartado
  $('#vista-ficha').hidden = true;
  document.body.classList.remove('sin-scroll');
  APP.actual = null;
  await recargarLocales();
  pintarInicio();
  aplicarVersionSiSePuede();              // si llegó una versión nueva mientras llenaba
}

// ---------------------------------------------------------------- BORRADORES
let _autoguardado = null;
function programarAutoguardado() {
  clearTimeout(_autoguardado);
  _autoguardado = setTimeout(() => guardarBorrador(true), 700);
}

async function guardarBorrador(silencioso) {
  if (!APP.actual) return;
  const a = APP.actual;
  await DB.guardar('borradores', {
    id: a.id, datos: a.datos, solicitud: a.solicitud, creado: a.creado, paso: a.paso,
    modificado: new Date().toISOString()
  });
  if (!silencioso) toast('Borrador guardado');
  const aviso = $('#ficha-guardado');
  if (aviso) { aviso.textContent = 'Guardado ' + new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }); }
}

async function borrarBorrador(id) {
  await DB.borrar('borradores', id);
  // Las fotos se borran solo si la evaluación no pasó a la cola.
  if (!(await DB.leer('cola', id))) {
    for (const f of await DB.fotosDe(id)) await DB.borrar('fotos', f.clave);
  }
}

// ---------------------------------------------------------------- NAVEGACIÓN
function irAPaso(paso, campoDestino) {
  soltarMapaPunto();                      // el mapita del paso anterior ya no existe
  APP.actual.paso = paso;
  pintarIndice();
  const cuerpo = $('#ficha-cuerpo');
  cuerpo.innerHTML = paso === 'revisar' ? htmlRevisar() : htmlSeccion(paso);
  enlazarSeccion(cuerpo);
  actualizarSemaforo();
  const i = PASOS.indexOf(paso);
  $('#btn-anterior').disabled = i === 0;
  $('#btn-siguiente').hidden = paso === 'revisar';
  $('#btn-siguiente').innerHTML = (PASOS[i + 1] === 'revisar' ? 'Revisar y enviar' : 'Siguiente') + icono('derecha');
  if (campoDestino) {
    const el = cuerpo.querySelector('[data-campo="' + campoDestino + '"]');
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('resaltar'); setTimeout(() => el.classList.remove('resaltar'), 1600); }
  } else {
    $('#ficha-scroll').scrollTop = 0;
  }
  const chip = $('#ficha-indice [aria-current="step"]');
  if (chip) chip.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function pasoRelativo(delta) {
  const i = PASOS.indexOf(APP.actual.paso) + delta;
  if (i >= 0 && i < PASOS.length) irAPaso(PASOS[i]);
}

function estadoSeccion(sid) {
  const d = APP.actual.datos;
  let req = 0, ok = 0;
  Esquema.seccion(sid).campos.forEach((c) => {
    if (!Esquema.visible(c, d) || !c.req) return;
    req++;
    if (!Esquema.errorDe(c, d)) ok++;
  });
  return { req, ok, completa: ok === req, tocada: ok > 0 };
}

function pintarIndice() {
  const html = Esquema.SECCIONES.map((s) => {
    const e = estadoSeccion(s.id);
    const clase = e.completa ? 'completa' : (APP.actual.mostrarErrores ? 'con-faltas' : (e.tocada ? 'a-medias' : ''));
    return '<button type="button" class="paso ' + clase + '" data-paso="' + s.id + '"' +
      (APP.actual.paso === s.id ? ' aria-current="step"' : '') + ' title="' + esc(s.titulo) + '">' + s.n + '</button>';
  }).join('') + '<button type="button" class="paso paso-fin" data-paso="revisar"' +
    (APP.actual.paso === 'revisar' ? ' aria-current="step"' : '') + '>' + icono('check') + '</button>';
  $('#ficha-indice').innerHTML = html;
  const total = Esquema.faltantes(APP.actual.datos).length;
  const pedidos = Esquema.SECCIONES.reduce((n, s) => n + estadoSeccion(s.id).req, 0) || 1;
  $('#barra-progreso').style.width = Math.round(100 * (pedidos - Math.min(total, pedidos)) / pedidos) + '%';
}

/**
 * Píldora de la barra: la sugerencia del sistema en vivo, hasta que el
 * evaluador clasifica; desde ahí muestra SU clasificación (no se le
 * recuerda la sugerencia como si no le hubiera hecho caso).
 */
function actualizarSemaforo() {
  const d = APP.actual.datos;
  const s = Esquema.sugerencia(d);
  const el = $('#semaforo');
  if (d.clasif_habitabilidad) {
    el.className = 'semaforo ' + COLOR_CLASIF[d.clasif_habitabilidad];
    el.innerHTML = '<span class="punto"></span>' + NOMBRE_COLOR[COLOR_CLASIF[d.clasif_habitabilidad]];
  } else if (!s.color) {
    el.className = 'semaforo';
    // Sin la cuenta: "faltan 17" chocaba con el "Faltan 41 datos" de Revisar (son cosas distintas).
    el.innerHTML = '<span class="punto"></span>Sin sugerencia';
  } else {
    el.className = 'semaforo ' + s.color;
    el.innerHTML = '<span class="punto"></span>' + NOMBRE_COLOR[s.color];
  }
}

// ---------------------------------------------------------------- DIBUJO DE CAMPOS
function htmlSeccion(sid) {
  const s = Esquema.seccion(sid);
  const d = APP.actual.datos;
  let h = '<h2 class="sec-titulo"><span class="sec-n">' + s.n + '</span>' + esc(s.titulo) + '</h2>';
  if (s.ayuda) h += '<p class="sec-ayuda">' + esc(s.ayuda) + '</p>';
  if (sid === 's10' && d.tipo_inspeccion !== 'completa') {
    h += '<p class="aviso-suave">' + icono('info') + 'Inspección <b>exterior</b>: los elementos interiores no se piden.</p>';
  }
  if (sid === 's1' && APP.actual.solicitud) h += htmlSolicitud(APP.actual.solicitud);
  const visibles = s.campos.filter((c) => Esquema.visible(c, d));
  if (s.soloLectura) return h + htmlSoloLectura(visibles);
  const esDano = visibles.some((c) => c.tipo === 'nlms');
  // Sin atajo para "marcar todo N/L": la DIGER pide que cada elemento se revise y marque uno por uno (18/09).
  const campos = esDano ? gruposDano(visibles)
    : visibles.map((c) => (c.id === 'clasif_habitabilidad' ? htmlSugerencia() : '') +
      (c.id === 'nivel_dano' ? htmlSugerenciaDano() : '') +
      htmlCampo(/^justificacion_/.test(c.id) ? Object.assign({}, c, { nota: motivoJustificacion(c) }) : c)).join('');
  h += '<div class="campos' + (esDano ? ' campos-dano' : '') + '">' + campos + '</div>';
  return h;
}

/**
 * En las secciones 9 y 10 cada elemento va en un grupo con lo que depende de
 * él (su foto, el "¿cuál?"). En PC la grilla es de dos columnas y, sueltos,
 * la foto ocupaba la celda del elemento vecino y descuadraba todo.
 */
function gruposDano(campos) {
  const grupos = [];
  campos.forEach((c) => {
    if (c.tipo === 'nlms' || !grupos.length) grupos.push([]);
    grupos[grupos.length - 1].push(c);
  });
  return grupos.map((g) => '<div class="grupo-dano">' + g.map(htmlCampo).join('') + '</div>').join('');
}

/**
 * Un barrio o vereda que no esté en la lista oficial se quita (venía de una
 * solicitud o de un borrador anterior a la lista): si no, la ficha quedaría
 * con un nombre que no existe y sin dejar enviar. Si la lista no cargó, no
 * se toca nada.
 */
async function depurarBarrio(d) {
  if (!d.barrio_vereda) return;
  await cargarZonas();
  if (!Esquema.nombresZona(d).length) return;
  const oficial = Esquema.nombreOficial(d, d.barrio_vereda);
  if (oficial) d.barrio_vereda = oficial;
  else { delete d.barrio_vereda; delete d.zona_auto; }
}

/** Sección 16: solo se ve. Se cambia desde "Mis datos" (menú). */
function htmlSoloLectura(campos) {
  const d = APP.actual.datos;
  const filas = campos.map((c) => {
    let v;
    if (c.tipo === 'firma') v = '<div class="firma-muestra" data-firma-evaluacion></div>';
    else v = Esquema.vacio(d[c.id]) ? '<span class="error">Falta</span>' : esc(c.lista ? Esquema.etiquetaDe(c.lista, d[c.id]) : d[c.id]);
    return '<div class="dato" data-campo="' + c.id + '"><span class="dato-et">' + esc(c.etiqueta) + '</span><span class="dato-v">' + v + '</span></div>';
  }).join('');
  return '<p class="aviso-suave">' + icono('info') + 'Estos datos salen de lo que usted registró al ingresar.</p>' +
    '<div class="tarjeta solo-lectura">' + filas + '</div>' +
    '<button type="button" class="btn-secundario" data-ir-menu>' + icono('lapiz') + 'Cambiar mis datos o mi firma</button>';
}

function htmlSolicitud(s) {
  return '<div class="tarjeta-solicitud"><b>' + esc(s.id_solicitud) + '</b> · ' + esc(s.direccion || '') +
    (s.descripcion ? '<br><span>' + esc(s.descripcion) + '</span>' : '') + '</div>';
}

/*
 * Las dos sugerencias (habitabilidad y nivel de daño) usan la MISMA caja,
 * justo encima de su pregunta: resultado, por qué (máx. 3), una línea de
 * avisos, las definiciones plegadas y el botón. Poco texto: es un celular.
 */
const COLOR_NIVEL = { ninguno_menor: 'verde', moderado: 'amarillo', severo: 'rojo' };

function cajaSugerencia(o) {
  if (!o.valor) {
    return '<div class="sugerencia campo-ancho"><b>Sugerencia:</b> complete las secciones 7 a 10 (faltan ' + o.faltan + ').</div>';
  }
  const extra = o.motivos.length > 3 ? '<li class="mas">y ' + (o.motivos.length - 3) + ' más</li>' : '';
  const porque = o.motivos.length
    ? '<ul>' + o.motivos.slice(0, 3).map((m) => '<li>' + esc(m) + '</li>').join('') + extra + '</ul>'
    : '<p class="nota">' + esc(o.sinMotivos) + '</p>';
  const defs = '<details class="niveles-def"><summary>¿Qué significa cada opción?</summary><dl>' +
    o.lista.map((x) => '<dt>' + esc(x[1]) + '</dt><dd>' + esc(o.definiciones[x[0]]) + '</dd>').join('') + '</dl></details>';
  return '<div class="sugerencia campo-ancho s-' + o.color + '">' +
    '<div class="sug-cab"><span>Sugerencia</span><b>' + esc(o.etiqueta) + '</b></div>' + porque +
    (o.avisos && o.avisos.length ? '<p class="nota">' + esc(o.avisos.join(' ')) + '</p>' : '') + defs +
    (o.elegido ? '' : '<button type="button" class="btn-secundario btn-chico" ' + o.boton + '="' + o.valor + '">Usar la sugerencia</button>') +
    '</div>';
}

function htmlSugerencia() {
  const d = APP.actual.datos;
  const s = Esquema.sugerencia(d);
  return cajaSugerencia({
    valor: s.clasif, faltan: s.faltan.length, color: s.color, etiqueta: s.clasif ? Esquema.etiquetaDe('habitabilidad', s.clasif) : '',
    motivos: s.motivos.map((m) => m.texto), sinMotivos: 'Ninguna casilla roja o amarilla.',
    lista: Esquema.LISTAS.habitabilidad, definiciones: Esquema.DEFINICION_CLASIF,
    elegido: !!d.clasif_habitabilidad, boton: 'data-usar-sugerencia'
  });
}

function htmlSugerenciaDano() {
  const d = APP.actual.datos;
  const s = Esquema.sugerenciaDano(d);
  return cajaSugerencia({
    valor: s.nivel, faltan: s.faltan.length, color: COLOR_NIVEL[s.nivel], etiqueta: s.nivel ? Esquema.etiquetaDe('nivel_dano', s.nivel) : '',
    motivos: s.motivos, sinMotivos: 'Estructura sin daño; daño no estructural leve o aislado.', avisos: s.avisos,
    lista: Esquema.LISTAS.nivel_dano, definiciones: Esquema.DEFINICION_NIVEL,
    elegido: !!d.nivel_dano, boton: 'data-usar-dano'
  });
}

/** Por qué se pide una justificación: va como nota corta de la misma casilla. */
function motivoJustificacion(c) {
  if (c.id === 'justificacion_dano') return Esquema.coherenciaDano(APP.actual.datos).motivo;
  if (c.id === 'justificacion_clasif') {
    const s = Esquema.sugerencia(APP.actual.datos);
    return 'La sugerencia era ' + Esquema.etiquetaDe('habitabilidad', s.clasif) + ': ¿por qué es habitable?';
  }
  return '';
}

/** Actualiza solo el aviso de error de un campo, sin volver a dibujar la sección. */
function refrescarError(id, raiz) {
  if (!APP.actual.mostrarErrores) return;
  const caja = $('[data-campo="' + id + '"]', raiz);
  if (!caja) return;
  const viejo = $('.error', caja);
  const e = Esquema.errorDe(Esquema.CAMPOS[id], APP.actual.datos);
  if (viejo && !e) viejo.remove();
  else if (viejo) viejo.textContent = e;
  else if (e) caja.insertAdjacentHTML('beforeend', '<span class="error">' + esc(e) + '</span>');
}

function errorVisible(c) {
  // La incoherencia habitabilidad / nivel de daño se avisa de una vez, no solo al intentar enviar.
  if (c.coherencia) {
    const co = Esquema.coherenciaDano(APP.actual.datos);
    if (co.bloquea) return '<span class="error">' + esc(co.bloquea) + '</span>';
  }
  if (!APP.actual.mostrarErrores) return '';
  const e = Esquema.errorDe(c, APP.actual.datos);
  return e ? '<span class="error">' + esc(e) + '</span>' : '';
}

function cabeceraCampo(c) {
  const nota = c.nota;
  return '<div class="c-etiqueta">' + esc(c.etiqueta) + (c.req ? ' <span class="req" aria-label="obligatorio">*</span>' : '') +
    (nota ? ' <span class="c-nota">' + esc(nota) + '</span>' : '') + '</div>';
}

/**
 * Barrio/Vereda y Zona quedan BLOQUEADOS cuando la ubicación cayó dentro de
 * un polígono: ese dato no se discute (19/09). Solo se pueden escoger a mano
 * cuando el punto no cruzó con ninguna capa, o cuando no hay ubicación.
 */
function fijadoPorUbicacion(c, d) {
  return (c.id === 'barrio_vereda' || c.id === 'zona') && !!d.zona_auto && d.zona_auto === d.barrio_vereda;
}

function htmlCampo(c) {
  const d = APP.actual.datos;
  const v = d[c.id];
  const envoltura = (interior, extra) => '<div class="campo campo-' + c.tipo + (extra || '') + '" data-campo="' + c.id + '">' +
    interior + errorVisible(c) + '</div>';

  if (c.fijo) {
    return envoltura(cabeceraCampo(c) + '<div class="c-sistema c-fijo">' + icono('candado') + esc(Esquema.etiquetaDe(c.lista, c.fijo)) + '</div>');
  }
  if (fijadoPorUbicacion(c, d)) {
    const texto = c.lista ? Esquema.etiquetaDe(c.lista, v) : v;
    return envoltura(cabeceraCampo(Object.assign({}, c, { nota: 'Lo define la ubicación' })) +
      '<div class="c-sistema c-fijo">' + icono('candado') + esc(texto) + '</div>');
  }
  switch (c.tipo) {
    case 'sistema':
      return envoltura(cabeceraCampo(c) + '<div class="c-sistema">' + esc(v || 'Se asigna al enviar') + '</div>');
    case 'texto': case 'telefono': case 'entero': case 'decimal': {
      const modo = { telefono: 'tel', entero: 'numeric', decimal: 'decimal' }[c.tipo] || 'text';
      const tipo = c.tipo === 'telefono' ? 'tel' : 'text';
      return envoltura('<label>' + cabeceraCampo(c) + '<input type="' + tipo + '" inputmode="' + modo + '" data-id="' + c.id +
        '" value="' + esc(v == null ? '' : v) + '" maxlength="' + (c.tipo === 'texto' ? 300 : 30) + '" autocomplete="off"></label>');
    }
    case 'buscable':
      // Botón, no casilla de texto: el nombre solo entra tocándolo en la lista.
      return envoltura(cabeceraCampo(c) +
        '<button type="button" class="elegir-zona' + (v ? '' : ' vacio') + '" data-buscable="' + c.id + '">' +
        '<span>' + esc(v || 'Sin barrio · toque para elegir') + '</span>' + icono('derecha') + '</button>');
    case 'largo':
      return envoltura('<label>' + cabeceraCampo(c) +
        '<textarea rows="' + (c.id === 'comentarios_finales' ? 4 : 3) + '" maxlength="4000" data-id="' + c.id + '"' +
        (c.ejemplo ? ' placeholder="' + esc(c.ejemplo) + '"' : '') + '>' + esc(v || '') + '</textarea></label>');
    case 'fecha':
      return envoltura('<label>' + cabeceraCampo(c) + '<input type="date" data-id="' + c.id + '" value="' + esc(v || '') + '"></label>');
    case 'fechahora':
      return envoltura('<label>' + cabeceraCampo(c) + '<input type="datetime-local" data-id="' + c.id + '" value="' + esc(v || '') + '"></label>');
    case 'una': {
      const ops = Esquema.opciones(c, d);
      if (c.desplegable) {
        return envoltura('<label>' + cabeceraCampo(c) + '<select data-id="' + c.id + '"><option value="">— Elegir —</option>' +
          ops.map((o) => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') +
          '</select></label>');
      }
      return envoltura(cabeceraCampo(c) + '<div class="chips" role="radiogroup">' + ops.map((o) => {
        const color = c.colores && c.colores[o[0]];
        const colorClasif = c.lista === 'habitabilidad' ? COLOR_CLASIF[o[0]] : '';
        return '<button type="button" role="radio" class="chip' + (color ? ' c-' + color : '') + (colorClasif ? ' c-' + colorClasif : '') +
          '" data-una="' + c.id + '" data-valor="' + o[0] + '" aria-checked="' + (o[0] === v) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>');
    }
    case 'varias': {
      const sel = Array.isArray(v) ? v : [];
      return envoltura(cabeceraCampo(Object.assign({}, c, { nota: (c.nota ? c.nota + ' · ' : '') + 'puede marcar varias' })) + '<div class="chips">' + Esquema.opciones(c, d).map((o) =>
        '<button type="button" role="checkbox" class="chip" data-varias="' + c.id + '" data-valor="' + o[0] +
        '" aria-checked="' + (sel.indexOf(o[0]) !== -1) + '">' + esc(o[1]) + '</button>').join('') + '</div>');
    }
    case 'nlms':
      return envoltura('<div class="dano-etiqueta">' + esc(c.etiqueta) + (c.req ? ' <span class="req">*</span>' : '') + '</div>' +
        '<div class="nlms" role="radiogroup" aria-label="' + esc(c.etiqueta) + '">' + Esquema.LISTAS.nlms.map((o) => {
          const color = (c.colores && c.colores[o[0]]) || 'blanco';
          return '<button type="button" role="radio" class="nl c-' + color + '" data-una="' + c.id + '" data-valor="' + o[0] +
            '" aria-checked="' + (o[0] === v) + '">' + o[1] + '</button>';
        }).join('') + '</div>');
    case 'gps':
      return envoltura(cabeceraCampo(c) + htmlGps(v));
    case 'fotos':
      return envoltura(cabeceraCampo(c) + (c.ejemploMasa ? htmlEjemploMasa() : '') + '<div class="fotos" data-fotos="' + c.id + '"></div>' +
        '<div class="fotos-botones">' +
        '<label class="' + (c.compacto ? 'btn-secundario btn-chico' : 'btn-principal') + '">' + icono('camara') + 'Tomar foto<input type="file" accept="image/*" capture="environment" data-subir="' + c.id + '" hidden></label>' +
        '<label class="btn-secundario' + (c.compacto ? ' btn-chico' : '') + '">' + icono('galeria') + 'Galería<input type="file" accept="image/*" multiple data-subir="' + c.id + '" hidden></label>' +
        '<span class="c-nota">Máx. ' + c.max + '</span></div>', c.compacto ? ' compacto' : '');
  }
  return '';
}

/**
 * Ejemplo de movimiento en masa junto a la foto que se pide: para que el
 * ingeniero compare antes de dejar el "Sí" (antes se marcaba sin serlo).
 */
function htmlEjemploMasa() {
  // Sin loading="lazy": la imagen ya está en el celular (sw.js) y debe verse al instante, aun sin señal.
  return '<figure class="ejemplo-masa"><img src="img/ejemplo-movimiento-masa.jpg" alt="Ejemplo de movimiento en masa" width="720" height="393" decoding="async">' +
    '<figcaption><b>Así se ve un movimiento en masa:</b> terreno desprendido o deslizado, con material suelto (tierra, rocas, ' +
    'árboles caídos) y una cicatriz o escarpe en la ladera. Una grieta en un muro o un piso hundido <b>no</b> es un movimiento en masa.' +
    '<br>Tome una foto del movimiento en masa que ve cerca de la edificación.</figcaption></figure>';
}

/** La solicitud trae coordenadas: sirven si el GPS no alcanza (dentro de una casa, sin cielo). */
function solicitudConPunto() {
  const s = APP.actual && APP.actual.solicitud;
  return !!s && Esquema.coordenadaValida(s.lat, s.lon);
}

function htmlGps(v) {
  const hay = v && v.lat != null;
  const calidad = hay ? calidadGps(v.precision) : '';
  return '<div class="gps">' +
    '<div class="gps-dato ' + calidad + '" id="gps-dato">' + (hay
      ? '<b>' + Number(v.lat).toFixed(6) + ', ' + Number(v.lon).toFixed(6) + '</b><span>' +
        (v.origen === 'solicitud' ? 'De la solicitud (no medida en el sitio)'
          : v.origen === 'ajustado' ? 'Ajustada en el mapa'
          : v.manual ? 'Escrita a mano' : '±' + v.precision + ' m') + '</span>'
      : '<span>Sin ubicación todavía</span>') + '</div>' +
    '<div class="fotos-botones">' +
    '<button type="button" class="btn-principal btn-chico" id="btn-gps">' + icono('ubicacion') + (hay ? 'Volver a medir' : 'Tomar ubicación') + '</button>' +
    '<button type="button" class="btn-texto btn-chico" id="btn-gps-manual">Escribirla a mano</button>' +
    (solicitudConPunto() ? '<button type="button" class="btn-texto btn-chico" id="btn-gps-solicitud">Usar la de la solicitud</button>' : '') + '</div>' +
    (hay ? '<div class="gps-mapa" id="gps-mapa"></div><p class="c-nota centro">Arrastre el punto si no quedó en el sitio exacto</p>' : '') +
    '<div class="gps-manual" id="gps-manual" hidden>' +
    '<label>Latitud<input inputmode="decimal" id="gps-lat" placeholder="4.8133"></label>' +
    '<label>Longitud<input inputmode="decimal" id="gps-lon" placeholder="-75.6961"></label>' +
    '<button type="button" class="btn-secundario btn-chico" id="gps-manual-ok">Usar</button></div></div>';
}

function htmlRevisar() {
  const d = APP.actual.datos;
  const f = Esquema.faltantes(d);
  const s = Esquema.sugerencia(d);
  let h = '<h2 class="sec-titulo"><span class="sec-n">' + icono('check') + '</span>Revisar y enviar</h2>';
  if (f.length) {
    h += '<div class="faltan"><b>Faltan ' + f.length + ' ' + (f.length === 1 ? 'dato' : 'datos') + '</b> — toque uno para ir a llenarlo:<ul>' +
      f.map((x) => '<li><button type="button" class="btn-faltante" data-ir="' + x.seccion + '" data-campo-ir="' + x.campo + '">' +
        '<span class="sec-n chico">' + x.n + '</span>' + esc(x.etiqueta) + ' <em>' + esc(x.error) + '</em></button></li>').join('') + '</ul></div>';
  } else {
    h += '<div class="todo-listo">' + icono('check') + 'Todo lo obligatorio está lleno.</div>';
  }
  const clasif = d.clasif_habitabilidad;
  if (clasif) {
    h += '<div class="resumen-clasif c-' + COLOR_CLASIF[clasif] + '">' + esc(Esquema.etiquetaDe('habitabilidad', clasif)) +
      (d.nivel_dano ? ' · Daño ' + esc(Esquema.etiquetaDe('nivel_dano', d.nivel_dano).toLowerCase()) : '') + '</div>';
  }
  // Sin "Ver la ficha como quedará" (19/09): se quedaban mirándola y olvidaban
  // enviar. Aquí va un resumen de lo principal y, debajo, el botón de enviar.
  h += htmlResumen(d);
  h += '<div class="acciones-revisar">' +
    '<button type="button" class="btn-principal" id="btn-enviar"' + (f.length ? ' disabled' : '') + '>' + icono('enviar') + 'Enviar evaluación</button>' +
    '</div><p class="c-nota centro">Si no hay señal, queda en cola y se envía sola apenas vuelva.</p>';
  return h;
}

/** Resumen de lo más importante para revisar antes de enviar. */
function htmlResumen(d) {
  const et = (id) => {
    const c = Esquema.CAMPOS[id];
    const v = d[id];
    if (Esquema.vacio(v)) return '<span class="error">Falta</span>';
    return esc(c.lista ? Esquema.etiquetaDe(c.lista, v) : v);
  };
  const nFotos = (d.fotos_generales || []).length;
  const danos = [];
  ['s9', 's10'].forEach((sid) => Esquema.seccion(sid).campos.forEach((c) => {
    if (c.tipo === 'nlms' && Esquema.visible(c, d) && (d[c.id] === 'm' || d[c.id] === 's')) {
      danos.push(c.etiqueta + ' (' + (d[c.id] === 's' ? 'severo' : 'moderado') + ')');
    }
  }));
  const colapso = d.colapso_total === 'si' ? 'Total' : d.colapso_parcial === 'si' ? 'Parcial'
    : (d.colapso_total && d.colapso_parcial ? 'No' : '<span class="error">Falta</span>');
  const masa = d.mov_masa_cercanos === 'si'
    ? 'Sí — ' + (d.mov_masa_confirma === 'si' ? (d.foto_mov_masa || []).length + ' foto(s), confirmado' : '<span class="error">falta foto o confirmación</span>')
    : et('mov_masa_cercanos');
  const filas = [
    ['Dirección', esc([d.direccion, d.barrio_vereda].filter(Boolean).join(' · ')) || '<span class="error">Falta</span>'],
    ['Edificación', et('uso') + ' · ' + esc(d.num_pisos || '?') + ' piso(s)'],
    ['Sistema estructural', et('sist_estructural')],
    ['Colapso', colapso],
    ['Movimiento en masa cercano', masa],
    ['Daños M/S', danos.length ? esc(danos.join(', ')) : 'Ninguno'],
    ['Fotos de la fachada', nFotos ? String(nFotos) : '<span class="error">Falta</span>'],
    ['Ocupación', et('estado_ocupacion')],
    ['Comentarios', d.comentarios_finales ? esc(d.comentarios_finales) : '<span class="error">Falta</span>']
  ];
  return '<div class="tarjeta solo-lectura resumen-envio"><h3>Resumen de la evaluación</h3>' + filas.map((x) =>
    '<div class="dato"><span class="dato-et">' + x[0] + '</span><span class="dato-v">' + x[1] + '</span></div>').join('') + '</div>';
}

// ---------------------------------------------------------------- EVENTOS
function enlazarSeccion(raiz) {
  const d = APP.actual.datos;

  $$('input[data-id], textarea[data-id], select[data-id]', raiz).forEach((el) => {
    const evento = el.tagName === 'SELECT' || el.type === 'date' || el.type === 'datetime-local' ? 'change' : 'input';
    el.addEventListener(evento, () => {
      const t = Esquema.CAMPOS[el.dataset.id] && Esquema.CAMPOS[el.dataset.id].tipo;
      if (t === 'entero' || t === 'decimal' || t === 'telefono') {
        const limpio = soloNumero(el.value, t);
        if (limpio !== el.value) el.value = limpio;
      }
      d[el.dataset.id] = el.value;
      refrescarError(el.dataset.id, raiz);   // el "Falta" desaparece al escribir
      cambio(el.tagName === 'SELECT');
    });
  });

  $$('[data-buscable]', raiz).forEach((b) => b.addEventListener('click', () => abrirSelectorZona(b.dataset.buscable)));

  $$('[data-una]', raiz).forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.una;
    const c = Esquema.CAMPOS[id];
    if (c.confirmaMasa && b.dataset.valor === 'no') { await descartarMovMasa(); return; }
    d[id] = d[id] === b.dataset.valor && !c.req ? '' : b.dataset.valor;   // opcional: segundo toque desmarca
    if (c.excluye && d[id] === 'si') d[c.excluye] = 'no';                 // colapso total <-> parcial
    cambio(true);
  }));

  $$('[data-varias]', raiz).forEach((b) => b.addEventListener('click', () => {
    const c = Esquema.CAMPOS[b.dataset.varias];
    let sel = Array.isArray(d[c.id]) ? d[c.id].slice() : [];
    const val = b.dataset.valor;
    if (sel.indexOf(val) !== -1) sel = sel.filter((x) => x !== val);
    else if (c.exclusiva && val === c.exclusiva) sel = [val];          // "Ninguna" deja solo "Ninguna"
    else sel = sel.filter((x) => x !== c.exclusiva).concat([val]);
    d[c.id] = sel;
    cambio(true);
  }));

  const usar = $('[data-usar-sugerencia]', raiz);
  if (usar) usar.addEventListener('click', () => { d.clasif_habitabilidad = usar.dataset.usarSugerencia; cambio(true); });
  const usarDano = $('[data-usar-dano]', raiz);
  if (usarDano) usarDano.addEventListener('click', () => { d.nivel_dano = usarDano.dataset.usarDano; cambio(true); });

  $$('[data-fotos]', raiz).forEach((cont) => pintarMiniaturas(cont.dataset.fotos, cont));
  $$('input[data-subir]', raiz).forEach((inp) => inp.addEventListener('change', async () => {
    const c = Esquema.CAMPOS[inp.dataset.subir];
    if (!inp.files.length) return;
    cargando(true, 'Preparando fotos…');
    try {
      d[c.id] = await agregarFotos(APP.actual.id, c.id, inp.files, c.max);
      // Redibujar YA: lo que depende de la foto (la confirmación del
      // movimiento en masa) no salía hasta el siguiente toque.
      cambio(true);
      const conf = c.ejemploMasa && $('[data-campo="mov_masa_confirma"]');
      if (conf) conf.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { toast('No se pudo guardar la foto: ' + e.message, 'error'); }
    finally { cargando(false); inp.value = ''; }
  }));

  const muestra = $('[data-firma-evaluacion]', raiz);
  if (muestra) {
    const clave = (d.eval_firma || [])[0];
    (clave ? DB.leer('fotos', clave) : Promise.resolve(null)).then((f) => {
      muestra.innerHTML = f ? '<img src="' + f.dataUrl + '" alt="Firma">' : '<span class="error">Falta la firma</span>';
    });
  }
  const irMenu = $('[data-ir-menu]', raiz);
  if (irMenu) irMenu.addEventListener('click', abrirMenu);

  if ($('[data-buscable]', raiz) && !Esquema.nombresZona(d).length) {
    cargarZonas().then(() => { if (APP.actual && APP.actual.datos === d) cambio(true); });
  }

  const btnGps = $('#btn-gps', raiz);
  if (btnGps) enlazarGps(raiz);

  $$('[data-ir]', raiz).forEach((b) => b.addEventListener('click', () => irAPaso(b.dataset.ir, b.dataset.campoIr)));
  const env = $('#btn-enviar', raiz);
  if (env) env.addEventListener('click', enviarActual);
}

/**
 * Selector de barrio o vereda: pantalla completa, agrupado por comuna o
 * corregimiento. El buscador SOLO filtra la lista; el valor entra únicamente
 * al tocar un renglón, así nadie puede escribir un barrio que no exista.
 */
async function abrirSelectorZona(campo) {
  const d = APP.actual.datos;
  cargando(true, 'Abriendo la lista…');
  await cargarZonas();
  cargando(false);
  const grupos = gruposDeZonas();
  if (!grupos.length) { toast('No se pudo abrir la lista de barrios.', 'error'); return; }

  const caja = document.createElement('section');
  caja.className = 'vista pantalla selector-zona';
  caja.innerHTML =
    '<header class="ficha-cab">' +
    '<button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">' +
    '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
    '<div class="ficha-cab-texto"><b>Barrio o vereda</b><span>Toque el que corresponde</span></div></header>' +
    '<div class="selector-buscar"><input type="search" id="selector-filtro" placeholder="Buscar…" autocomplete="off"></div>' +
    '<div class="selector-lista" id="selector-lista"></div>';
  document.body.appendChild(caja);
  document.body.classList.add('sin-scroll');

  const lista = $('#selector-lista', caja);
  const pintar = (texto) => {
    const t = Esquema.normalizarTexto(texto || '');
    let html = '', hallados = 0;
    grupos.forEach((g) => {
      const nombres = t ? g.nombres.filter((n) => Esquema.normalizarTexto(n).indexOf(t) !== -1) : g.nombres;
      if (!nombres.length) return;
      hallados += nombres.length;
      html += '<h3 class="selector-grupo">' + esc(g.grupo) + ' · ' + (g.tipo === 'rural' ? 'rural' : 'urbano') + '</h3>' +
        nombres.map((n) => '<button type="button" class="selector-item' + (n === d[campo] ? ' elegido' : '') +
          '" data-nombre="' + esc(n) + '" data-tipo="' + g.tipo + '">' + esc(n) + '</button>').join('');
    });
    lista.innerHTML = hallados ? html : '<p class="selector-vacio">No hay barrios ni veredas con ese nombre.</p>';
    $$('.selector-item', lista).forEach((b) => b.addEventListener('click', () => {
      d[campo] = b.dataset.nombre;
      d.zona = b.dataset.tipo;               // barrio -> urbano, vereda -> rural
      delete d.zona_auto;                    // lo escogió el evaluador
      cerrar();
      cambio(true);
    }));
  };
  const cerrar = () => { caja.remove(); document.body.classList.remove('sin-scroll'); };
  $('[data-cerrar]', caja).addEventListener('click', cerrar);
  $('#selector-filtro', caja).addEventListener('input', (ev) => pintar(ev.target.value));
  pintar('');
  setTimeout(() => { const f = $('#selector-filtro', caja); if (f) f.focus(); }, 50);
}

/** En los campos de número solo entran números (y un separador decimal). */
function soloNumero(v, tipo) {
  if (tipo === 'telefono') return v.replace(/[^0-9 +()-]/g, '');
  if (tipo === 'entero') return v.replace(/\D/g, '');
  let t = v.replace(/[^0-9.,]/g, '');
  const i = t.search(/[.,]/);
  if (i !== -1) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/[.,]/g, '');
  return t;
}

/**
 * El evaluador comparó su foto con el ejemplo y dijo que NO es un movimiento
 * en masa: la casilla vuelve a "No" y la foto se borra (no sirve).
 */
async function descartarMovMasa() {
  const d = APP.actual.datos;
  for (const k of d.foto_mov_masa || []) await quitarFoto(k);
  d.foto_mov_masa = [];
  delete d.mov_masa_confirma;
  d.mov_masa_cercanos = 'no';
  toast('Listo: se marcó "No" en movimientos en masa y se descartó la foto.');
  cambio(true);
}

/**
 * Después de un cambio: guardar y, si puede cambiar qué se ve (una opción,
 * no una letra escrita), volver a dibujar la sección sin perder el scroll.
 */
function cambio(redibujar) {
  const a = APP.actual;
  if (redibujar) {
    // Lo que queda oculto NO se borra aquí: un toque equivocado (marcar
    // "Exterior") no debe tumbar lo ya llenado. Se limpia al enviar y en la
    // vista previa. Solo sale al vuelo un sistema que ya no corresponde al
    // material, porque se vería como lleno sin estar marcado.
    Esquema.limpiarFiltros(a.datos);
    const scroll = $('#ficha-scroll').scrollTop;
    const cuerpo = $('#ficha-cuerpo');
    cuerpo.innerHTML = a.paso === 'revisar' ? htmlRevisar() : htmlSeccion(a.paso);
    enlazarSeccion(cuerpo);
    $('#ficha-scroll').scrollTop = scroll;
  }
  pintarIndice();
  actualizarSemaforo();
  programarAutoguardado();
}

async function pintarMiniaturas(campo, cont) {
  if (!cont) return;
  const claves = APP.actual.datos[campo] || [];
  const fotos = await Promise.all(claves.map((k) => DB.leer('fotos', k)));
  cont.innerHTML = fotos.filter(Boolean).map((f) =>
    '<div class="mini"><img src="' + f.dataUrl + '" alt=""><button type="button" class="mini-quitar" data-quitar="' + esc(f.clave) +
    '" aria-label="Quitar foto">×</button></div>').join('');
  $$('[data-quitar]', cont).forEach((b) => b.addEventListener('click', async () => {
    const r = await preguntar('¿Quitar esta foto?', 'Se borra de este celular. Puede tomar otra enseguida.',
      [['si', 'Quitar', 'peligro'], ['no', 'Cancelar', '']]);
    if (r !== 'si') return;
    await quitarFoto(b.dataset.quitar);
    APP.actual.datos[campo] = (APP.actual.datos[campo] || []).filter((k) => k !== b.dataset.quitar);
    cambio(true);
  }));
}

/**
 * Mapita de la sección 3: el evaluador ve dónde quedó el punto y lo corrige
 * arrastrándolo (o tocando el mapa). Sin señal los cuadritos no cargan, pero
 * el punto se puede mover igual; los que ya vio quedan guardados (sw.js).
 */
let MAPA_PUNTO = null;

/** Suelta el mapita: si no, queda un Leaflet vivo por cada paso que se abre. */
function soltarMapaPunto() {
  if (!MAPA_PUNTO) return;
  try { MAPA_PUNTO.remove(); } catch (e) { /* ya no estaba */ }
  MAPA_PUNTO = null;
}

function pintarMapaPunto(raiz, d) {
  const caja = $('#gps-mapa', raiz);
  if (!caja || typeof L === 'undefined' || !d.ubicacion || d.ubicacion.lat == null) return;
  soltarMapaPunto();
  const punto = [Number(d.ubicacion.lat), Number(d.ubicacion.lon)];
  const mapa = L.map(caja, { zoomControl: true, attributionControl: false }).setView(punto, 17);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapa);
  // Pin dibujado: el paquete de Leaflet no trae marker-icon-2x.png y el pin
   // normal quedaba invisible en pantallas de celular (19/09).
  const pin = L.divIcon({ className: 'pin-ficha', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 14] });
  const marca = L.marker(punto, { draggable: true, autoPan: true, icon: pin, keyboard: false }).addTo(mapa);
  const mover = (lat, lon) => {
    if (!Esquema.coordenadaValida(lat, lon)) {
      toast('Esa ubicación queda fuera de Risaralda.', 'error');
      marca.setLatLng(punto);
      return;
    }
    d.ubicacion = { lat: +lat.toFixed(6), lon: +lon.toFixed(6), precision: null, manual: true, origen: 'ajustado' };
    cambio(true);                      // la coordenada nueva a la vista
    ponerZona(d);                      // y de paso recalcula barrio/vereda y zona
  };
  marca.on('dragend', () => { const p = marca.getLatLng(); mover(p.lat, p.lng); });
  mapa.on('click', (ev) => { marca.setLatLng(ev.latlng); mover(ev.latlng.lat, ev.latlng.lng); });
  MAPA_PUNTO = mapa;
  setTimeout(() => mapa.invalidateSize(), 60);
}

function enlazarGps(raiz) {
  const d = APP.actual.datos;
  const btn = $('#btn-gps', raiz);
  const dato = $('#gps-dato', raiz);
  pintarMapaPunto(raiz, d);
  /**
   * Medir con el GPS. `auto` = arranque solo al entrar a la sección 3: no
   * molesta con avisos si el celular no da permiso y no pisa una ubicación
   * que el evaluador ya haya puesto.
   */
  const medir = (auto) => {
    if (!auto) { btn.disabled = true; btn.innerHTML = icono('ubicacion') + 'Buscando…'; }
    pedirUbicacion({
      progreso: (m, seg) => {
        dato.className = 'gps-dato ' + (m ? calidadGps(m.precision) : '');
        dato.innerHTML = m ? '<b>±' + m.precision + ' m</b><span>afinando… ' + seg + ' s · <button type="button" class="btn-texto" id="gps-ya">Usar esta</button></span>'
          : '<span>Buscando satélites… ' + seg + ' s</span>';
        const ya = $('#gps-ya', raiz); if (ya) ya.onclick = usarLoQueHayaGps;
      },
      listo: (m) => {
        // Salió de la evaluación (o abrió otra) mientras el GPS buscaba: no se toca nada.
        if (!APP.actual || APP.actual.datos !== d) return;
        if (auto && d.ubicacion && d.ubicacion.lat != null) return;   // ya la puso a mano mientras medía
        d.ubicacion = { lat: m.lat, lon: m.lon, precision: m.precision };
        if (!Esquema.coordenadaValida(m.lat, m.lon)) toast('Ojo: esa ubicación queda fuera de Risaralda.', 'error');
        cambio(true);
        ponerZona(d);
      },
      error: (e) => {
        btn.disabled = false; btn.innerHTML = icono('ubicacion') + 'Tomar ubicación';
        if (auto) { dato.className = 'gps-dato'; dato.innerHTML = '<span>Sin ubicación todavía</span>'; return; }
        toast(e.code === 1 ? 'El celular no dio permiso de ubicación.' : 'No se pudo tomar la ubicación. Puede escribirla a mano.', 'error');
      }
    }, !auto);
  };
  btn.addEventListener('click', () => medir(false));

  /**
   * Arranque automático, UNA sola vez por evaluación (19/09): al entrar a la
   * sección 3 el GPS empieza a medir para que se vaya afinando mientras el
   * ingeniero llena lo demás. La marca `gps_auto` se guarda con el borrador,
   * así al reabrirlo no vuelve a medir solo: para eso está "Tomar ubicación".
   */
  if (!d.gps_auto && !(d.ubicacion && d.ubicacion.lat != null)) {
    d.gps_auto = true;
    programarAutoguardado();
    medir(true);
  }
  $('#btn-gps-manual', raiz).addEventListener('click', () => { $('#gps-manual', raiz).hidden = false; });
  const deSolicitud = $('#btn-gps-solicitud', raiz);
  if (deSolicitud) deSolicitud.addEventListener('click', () => {
    const s = APP.actual.solicitud;
    d.ubicacion = { lat: +s.lat, lon: +s.lon, precision: null, manual: true, origen: 'solicitud' };
    cambio(true);
    ponerZona(d);
  });
  $('#gps-manual-ok', raiz).addEventListener('click', () => {
    const lat = Esquema.aNumero($('#gps-lat', raiz).value), lon = Esquema.aNumero($('#gps-lon', raiz).value);
    if (!Esquema.coordenadaValida(lat, lon)) { toast('Esa coordenada no queda en Risaralda. Revise el orden y el signo menos.', 'error'); return; }
    d.ubicacion = { lat, lon, precision: null, manual: true };
    cambio(true);
    ponerZona(d);
  });
}

/**
 * Con la ubicación ya puesta, la app dice en qué barrio o vereda cayó
 * (capas de la Alcaldía, dentro del celular) y llena Zona y Barrio/Vereda.
 * No pisa lo que el evaluador haya escrito a mano.
 */
async function ponerZona(d) {
  const antes = d.barrio_vereda;
  const cambió = await completarZonaPorUbicacion(d);
  if (!APP.actual || APP.actual.datos !== d) return;     // cerró la ficha mientras tanto
  if (!cambió) return;
  if (d.barrio_vereda) {
    toast((d.zona === 'rural' ? 'Vereda' : 'Barrio') + ': ' + d.barrio_vereda + (antes ? ' (antes: ' + antes + ')' : ''));
  } else {
    toast('Esa ubicación queda fuera de los barrios y veredas de Pereira: marque la zona.', 'error');
  }
  cambio(true);
}

// ---------------------------------------------------------------- VISTA PREVIA
const LOGOS_FICHA = { sngrd: 'img/logo-sngrd.png', miyamoto: 'img/logo-usaid-miyamoto.png', pie: 'img/logos-pie.png', entidad: 'img/logo-app.png' };

async function abrirVistaPrevia(idEval, datos, aviso) {
  cargando(true, 'Armando la ficha…');
  try {
    const { fotos, firma } = await fotosParaFicha(idEval, datos);
    const html = Ficha.html(Esquema.limpiarOcultos(datos), { logos: LOGOS_FICHA, fotos, firma, aviso,
      sello: 'Vista previa generada en el celular el ' + Ficha.ahoraColombia() + '. Aún no se ha enviado a la DIGER; no es una ficha oficial.' });
    const marco = $('#previa-marco');
    marco.srcdoc = html;
    $('#vista-previa').hidden = false;
  } finally { cargando(false); }
}

/**
 * Demostración: "Abrir ficha" (enlaces #demo-ficha=ID) arma la ficha aquí
 * mismo. Las de ejemplo se dibujan (fotos y firma); las que se enviaron en
 * la demostración salen de lo guardado en el celular.
 */
async function abrirFichaDemo(id) {
  cargando(true, 'Armando la ficha…');
  try {
    let datos = Demo.datosDe(id, APP.perfil && APP.perfil.nombre), fotos = {}, firma = '';
    if (datos) ({ fotos, firma } = Demo.fotosDe(id, datos));
    else {
      const s = (await DB.leerKV('demo-servidor')) || { evaluaciones: {} };
      const ev = s.evaluaciones[id];
      if (!ev || !ev.datos) { toast('No se encontró esa ficha en la demostración.', 'error'); return; }
      datos = Object.assign({}, ev.datos, { num_formulario: ev.num_formulario });
      if (datos.fecha_hora_inspeccion) datos.fecha_hora_inspeccion = ahoraLocal(new Date(datos.fecha_hora_inspeccion));
      Object.keys(Esquema.CAMPOS).forEach((k) => {
        const c = Esquema.CAMPOS[k];
        if (!Array.isArray(datos[k])) return;
        const urls = datos[k].map((n) => (ev.fotosData || {})[n]).filter(Boolean);
        if (c.tipo === 'fotos') fotos[k] = urls;
        if (c.tipo === 'firma' && urls[0]) firma = urls[0];
      });
    }
    $('#previa-marco').srcdoc = Ficha.html(Esquema.limpiarOcultos(datos), { logos: LOGOS_FICHA, fotos, firma,
      sello: 'FICHA DE DEMOSTRACIÓN generada el ' + Ficha.ahoraColombia() + ' con datos inventados. No corresponde a ninguna edificación real.' });
    $('#vista-previa').hidden = false;
  } finally { cargando(false); }
}

function iniciarEventosFicha() {
  // Los enlaces de ficha de la demostración no salen de la app.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="#demo-ficha="]');
    if (!a) return;
    ev.preventDefault();
    abrirFichaDemo(a.getAttribute('href').slice('#demo-ficha='.length));
  }, true);
  $('#btn-salir-ficha').addEventListener('click', salirDeFicha);
  $('#btn-anterior').addEventListener('click', () => pasoRelativo(-1));
  $('#btn-siguiente').addEventListener('click', () => {
    if (PASOS[PASOS.indexOf(APP.actual.paso) + 1] === 'revisar') APP.actual.mostrarErrores = true;
    pasoRelativo(1);
  });
  $('#ficha-indice').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-paso]');
    if (b) { if (b.dataset.paso === 'revisar') APP.actual.mostrarErrores = true; irAPaso(b.dataset.paso); }
  });
  $('#semaforo').addEventListener('click', () => irAPaso('s12'));
  $('#previa-cerrar').addEventListener('click', () => { $('#vista-previa').hidden = true; $('#previa-marco').srcdoc = ''; });
  $('#previa-imprimir').addEventListener('click', () => { const w = $('#previa-marco').contentWindow; if (w) w.print(); });
}

// ---------------------------------------------------------------- DIÁLOGO
/** Pregunta con varios botones. Devuelve la clave elegida (o null). */
function preguntar(titulo, texto, botones) {
  return new Promise((ok) => {
    const dlg = $('#dialogo');
    $('#dialogo-titulo').textContent = titulo;
    $('#dialogo-texto').textContent = texto;
    $('#dialogo-botones').innerHTML = botones.map((b) =>
      '<button type="button" class="' + (b[2] === 'principal' ? 'btn-principal' : b[2] === 'peligro' ? 'btn-peligro' : 'btn-secundario') +
      '" value="' + b[0] + '">' + esc(b[1]) + '</button>').join('');
    // Se responde con el TOQUE, no con el evento 'close' del cuadro: Chrome
    // no lo dispara mientras la página no se está dibujando (se comprobó en
    // las pruebas: el envío se quedaba esperando para siempre). El 'close'
    // queda solo para Esc / botón atrás, que cierran sin tocar un botón.
    let listo = false;
    const responder = (v) => { if (listo) return; listo = true; if (dlg.open) dlg.close(v || ''); ok(v || null); };
    $$('#dialogo-botones button').forEach((b) => b.addEventListener('click', () => responder(b.value)));
    dlg.onclose = () => responder(dlg.returnValue);
    dlg.returnValue = '';
    dlg.showModal();
  });
}
