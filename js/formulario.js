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
    municipio: 'pereira',
    zona: 'urbano'
  };
  if (solicitud) {
    d.id_solicitud = solicitud.id_solicitud;
    d.direccion = solicitud.direccion || '';
    d.barrio_vereda = solicitud.barrio || '';
    d.persona_contacto = solicitud.contacto || '';
    d.num_contacto = solicitud.telefono || '';
    const m = Esquema.codigoDe('municipio', solicitud.municipio);
    if (m && Esquema.LISTAS.municipio.some((o) => o[0] === m)) d.municipio = m;
  }
  return d;
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

/** Píldora de la barra: la sugerencia del sistema en vivo. */
function actualizarSemaforo() {
  const s = Esquema.sugerencia(APP.actual.datos);
  const el = $('#semaforo');
  if (!s.color) {
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
  if (s.sugerencia) h += htmlSugerencia();
  if (sid === 's10' && d.tipo_inspeccion !== 'completa') {
    h += '<p class="aviso-suave">' + icono('info') + 'Inspección <b>exterior</b>: los elementos interiores no se piden.</p>';
  }
  if (sid === 's1' && APP.actual.solicitud) h += htmlSolicitud(APP.actual.solicitud);
  const visibles = s.campos.filter((c) => Esquema.visible(c, d));
  if (s.soloLectura) return h + htmlSoloLectura(visibles);
  const esDano = visibles.some((c) => c.tipo === 'nlms');
  // Sin atajo para "marcar todo N/L": la DIGER pide que cada elemento se revise y marque uno por uno (18/09).
  h += '<div class="campos' + (esDano ? ' campos-dano' : '') + '">' + (esDano ? gruposDano(visibles) : visibles.map(htmlCampo).join('')) + '</div>';
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

function htmlSugerencia() {
  const s = Esquema.sugerencia(APP.actual.datos);
  if (!s.color) {
    return '<div class="sugerencia"><b>Sugerencia del sistema:</b> faltan ' + s.faltan.length +
      ' casillas de las secciones 7 a 10 para calcularla.</div>';
  }
  const motivos = s.motivos.length
    ? '<ul>' + s.motivos.map((m) => '<li class="m-' + m.color + '">' + esc(m.texto) + '</li>').join('') + '</ul>'
    : '<p>Ninguna casilla roja o amarilla marcada.</p>';
  return '<div class="sugerencia s-' + s.color + '"><b>Sugerencia del sistema: ' + NOMBRE_COLOR[s.color] + '</b>' + motivos +
    '<p class="nota">Según los colores del formulario. La decisión es suya; si clasifica menos grave, se pide justificarlo.</p>' +
    (APP.actual.datos.clasif_habitabilidad ? '' :
      '<button type="button" class="btn-secundario btn-chico" data-usar-sugerencia="' + s.clasif + '">Usar la sugerencia</button>') +
    '</div>';
}

function errorVisible(c) {
  if (!APP.actual.mostrarErrores) return '';
  const e = Esquema.errorDe(c, APP.actual.datos);
  return e ? '<span class="error">' + esc(e) + '</span>' : '';
}

function cabeceraCampo(c) {
  return '<div class="c-etiqueta">' + esc(c.etiqueta) + (c.req ? ' <span class="req" aria-label="obligatorio">*</span>' : '') +
    (c.nota ? ' <span class="c-nota">' + esc(c.nota) + '</span>' : '') + '</div>';
}

function htmlCampo(c) {
  const d = APP.actual.datos;
  const v = d[c.id];
  const envoltura = (interior, extra) => '<div class="campo campo-' + c.tipo + (extra || '') + '" data-campo="' + c.id + '">' +
    interior + errorVisible(c) + '</div>';

  switch (c.tipo) {
    case 'sistema':
      return envoltura(cabeceraCampo(c) + '<div class="c-sistema">' + esc(v || 'Se asigna al enviar') + '</div>');
    case 'texto': case 'telefono': case 'entero': case 'decimal': {
      const modo = { telefono: 'tel', entero: 'numeric', decimal: 'decimal' }[c.tipo] || 'text';
      const tipo = c.tipo === 'telefono' ? 'tel' : 'text';
      return envoltura('<label>' + cabeceraCampo(c) + '<input type="' + tipo + '" inputmode="' + modo + '" data-id="' + c.id +
        '" value="' + esc(v == null ? '' : v) + '" maxlength="' + (c.tipo === 'texto' ? 300 : 30) + '" autocomplete="off"></label>');
    }
    case 'largo':
      return envoltura('<label>' + cabeceraCampo(c) + '<textarea rows="3" maxlength="4000" data-id="' + c.id + '">' + esc(v || '') + '</textarea></label>');
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
      return envoltura(cabeceraCampo(c) + '<div class="fotos" data-fotos="' + c.id + '"></div>' +
        '<div class="fotos-botones">' +
        '<label class="' + (c.compacto ? 'btn-secundario btn-chico' : 'btn-principal') + '">' + icono('camara') + 'Tomar foto<input type="file" accept="image/*" capture="environment" data-subir="' + c.id + '" hidden></label>' +
        '<label class="btn-secundario' + (c.compacto ? ' btn-chico' : '') + '">' + icono('galeria') + 'Galería<input type="file" accept="image/*" multiple data-subir="' + c.id + '" hidden></label>' +
        '<span class="c-nota">Máx. ' + c.max + '</span></div>', c.compacto ? ' compacto' : '');
  }
  return '';
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
        (v.origen === 'solicitud' ? 'De la solicitud (no medida en el sitio)' : v.manual ? 'Escrita a mano' : '±' + v.precision + ' m') + '</span>'
      : '<span>Sin ubicación todavía</span>') + '</div>' +
    '<div class="fotos-botones">' +
    '<button type="button" class="btn-principal btn-chico" id="btn-gps">' + icono('ubicacion') + (hay ? 'Volver a medir' : 'Tomar ubicación') + '</button>' +
    '<button type="button" class="btn-texto btn-chico" id="btn-gps-manual">Escribirla a mano</button>' +
    (solicitudConPunto() ? '<button type="button" class="btn-texto btn-chico" id="btn-gps-solicitud">Usar la de la solicitud</button>' : '') + '</div>' +
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
  if (s.color && clasif && Esquema.COLOR_DE_CLASIF[clasif] !== s.color) {
    h += '<p class="aviso-suave">' + icono('info') + 'La sugerencia del sistema era <b>' + NOMBRE_COLOR[s.color] + '</b>.</p>';
  }
  h += '<div class="acciones-revisar">' +
    '<button type="button" class="btn-secundario" id="btn-vista-previa">' + icono('documento') + 'Ver la ficha como quedará</button>' +
    '<button type="button" class="btn-principal" id="btn-enviar"' + (f.length ? ' disabled' : '') + '>' + icono('enviar') + 'Enviar evaluación</button>' +
    '</div><p class="c-nota centro">Si no hay señal, queda en cola y se envía sola apenas vuelva.</p>';
  return h;
}

// ---------------------------------------------------------------- EVENTOS
function enlazarSeccion(raiz) {
  const d = APP.actual.datos;

  $$('input[data-id], textarea[data-id], select[data-id]', raiz).forEach((el) => {
    const evento = el.tagName === 'SELECT' || el.type === 'date' || el.type === 'datetime-local' ? 'change' : 'input';
    el.addEventListener(evento, () => {
      d[el.dataset.id] = el.value;
      cambio(el.tagName === 'SELECT');
    });
  });

  $$('[data-una]', raiz).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.una;
    d[id] = d[id] === b.dataset.valor && !Esquema.CAMPOS[id].req ? '' : b.dataset.valor;   // opcional: segundo toque desmarca
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

  $$('[data-fotos]', raiz).forEach((cont) => pintarMiniaturas(cont.dataset.fotos, cont));
  $$('input[data-subir]', raiz).forEach((inp) => inp.addEventListener('change', async () => {
    const c = Esquema.CAMPOS[inp.dataset.subir];
    if (!inp.files.length) return;
    cargando(true, 'Preparando fotos…');
    try {
      d[c.id] = await agregarFotos(APP.actual.id, c.id, inp.files, c.max);
      cambio(false);
      pintarMiniaturas(c.id, $('[data-fotos="' + c.id + '"]'));
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

  const btnGps = $('#btn-gps', raiz);
  if (btnGps) enlazarGps(raiz);

  $$('[data-ir]', raiz).forEach((b) => b.addEventListener('click', () => irAPaso(b.dataset.ir, b.dataset.campoIr)));
  const prev = $('#btn-vista-previa', raiz);
  if (prev) prev.addEventListener('click', () => abrirVistaPrevia(APP.actual.id, APP.actual.datos, 'Vista previa — esta evaluación AÚN NO se ha enviado.'));
  const env = $('#btn-enviar', raiz);
  if (env) env.addEventListener('click', enviarActual);
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
    if (!confirm('¿Quitar esta foto?')) return;
    await quitarFoto(b.dataset.quitar);
    APP.actual.datos[campo] = (APP.actual.datos[campo] || []).filter((k) => k !== b.dataset.quitar);
    cambio(true);
  }));
}

function enlazarGps(raiz) {
  const d = APP.actual.datos;
  const btn = $('#btn-gps', raiz);
  const dato = $('#gps-dato', raiz);
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.innerHTML = icono('ubicacion') + 'Buscando…';
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
        d.ubicacion = { lat: m.lat, lon: m.lon, precision: m.precision };
        if (!Esquema.coordenadaValida(m.lat, m.lon)) toast('Ojo: esa ubicación queda fuera de Risaralda.', 'error');
        cambio(true);
      },
      error: (e) => {
        btn.disabled = false; btn.innerHTML = icono('ubicacion') + 'Tomar ubicación';
        toast(e.code === 1 ? 'El celular no dio permiso de ubicación.' : 'No se pudo tomar la ubicación. Puede escribirla a mano.', 'error');
      }
    }, true);
  });
  $('#btn-gps-manual', raiz).addEventListener('click', () => { $('#gps-manual', raiz).hidden = false; });
  const deSolicitud = $('#btn-gps-solicitud', raiz);
  if (deSolicitud) deSolicitud.addEventListener('click', () => {
    const s = APP.actual.solicitud;
    d.ubicacion = { lat: +s.lat, lon: +s.lon, precision: null, manual: true, origen: 'solicitud' };
    cambio(true);
  });
  $('#gps-manual-ok', raiz).addEventListener('click', () => {
    const lat = Esquema.aNumero($('#gps-lat', raiz).value), lon = Esquema.aNumero($('#gps-lon', raiz).value);
    if (!Esquema.coordenadaValida(lat, lon)) { toast('Esa coordenada no queda en Risaralda. Revise el orden y el signo menos.', 'error'); return; }
    d.ubicacion = { lat, lon, precision: null, manual: true };
    cambio(true);
  });
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
