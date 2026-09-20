/* =========================================================================
   PÁGINA DE LA FICHA (ficha.html?id=...&t=...)

   Se ve desde la app y no desde una página de Google, porque con varias
   cuentas de Google abiertas en el navegador las páginas de Apps Script
   muestran "Google Drive: No se puede abrir el archivo" (reportado el
   18/09). Aquí solo se piden los DATOS al servidor y se dibujan con el
   mismo Ficha.html() de la vista previa y del PDF.
   Quien tiene el enlace completo la ve sin código: es para mandarla por
   WhatsApp, igual que en taludes. Sin la firma (&t=) no abre.
   ========================================================================= */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var id = q.get('id') || '', t = q.get('t') || '';
  var LOGOS = { sngrd: 'img/logo-sngrd.png', miyamoto: 'img/logo-usaid-miyamoto.png', pie: 'img/logos-pie.png', entidad: 'img/logo-app.png' };
  var $ = function (s) { return document.querySelector(s); };

  /** Volver: a la pantalla anterior si la hay; si la ficha se abrió en una
   *  pestaña nueva desde la app, a la app. Se enlaza de una, así el botón
   *  sirve también cuando la ficha no carga. */
  function enlazarVolver() {
    $('#btn-volver').onclick = function () {
      if (history.length > 1) history.back();
      else location.href = './';
    };
  }

  function mostrarError(texto) {
    $('#contenido').innerHTML = '<div class="estado error"><b>No se pudo abrir la ficha</b><p>' + Ficha.esc(texto) + '</p></div>';
    $('#barra').hidden = false;
    $('#barra').classList.add('solo-volver');
    enlazarVolver();
  }

  /**
   * Código de acceso guardado en ESTE celular, si el ingeniero ya ingresó a
   * la app. Con él la ficha sale completa; sin él, la versión pública (sin
   * teléfono, documento ni firma). Si la base no existe, NO se crea: se
   * aborta la creación para no dañar la de la app.
   */
  function codigoLocal() {
    return new Promise(function (ok) {
      try {
        var req = indexedDB.open('miyamoto-' + CONFIG.ENTORNO);
        req.onupgradeneeded = function () { req.transaction.abort(); };
        req.onerror = function () { ok(''); };
        req.onsuccess = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('kv')) { db.close(); ok(''); return; }
          var g = db.transaction('kv', 'readonly').objectStore('kv').get('perfil');
          g.onsuccess = function () { db.close(); ok((g.result && g.result.codigo) || ''); };
          g.onerror = function () { db.close(); ok(''); };
        };
      } catch (e) { ok(''); }
    });
  }
  var codigo = '';

  function llamar(accion, carga) {
    return fetch(CONFIG.URL_SERVIDOR_FICHAS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ accion: accion, id: id, t: t, codigo: codigo }, carga || {})),
      redirect: 'follow'
    }).then(function (r) { return r.text(); }).then(function (texto) {
      var j;
      try { j = JSON.parse(texto); } catch (e) { throw new Error('El servidor respondió algo inesperado.'); }
      if (!j.ok) throw new Error(j.error || 'Error del servidor');
      return j;
    });
  }

  /** En pantallas angostas la hoja carta se encoge entera, como un visor de PDF. */
  function ajustar() {
    var z = Math.min(1, (window.innerWidth - 12) / 760);
    Array.prototype.forEach.call(document.querySelectorAll('.pagina, .aviso'), function (e) { e.style.zoom = z; });
  }

  function enlazarBarra(num) {
    var enlace = location.href;
    $('#titulo-ficha').textContent = 'Formulario ' + num;
    enlazarVolver();
    $('#btn-imprimir').onclick = function () { window.print(); };
    $('#btn-copiar').onclick = function () {
      var hecho = function (ok) { $('#aviso-copia').textContent = ok ? 'Enlace copiado. Ya lo puede pegar donde lo necesite.' : 'Copie el enlace de la barra de direcciones.'; setTimeout(function () { $('#aviso-copia').textContent = ''; }, 4000); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(enlace).then(function () { hecho(true); }, function () { hecho(false); });
      else hecho(false);
    };
    // En iPhone "Imprimir" a veces no guarda PDF: este botón lo arma el servidor.
    $('#btn-pdf').onclick = function () {
      var b = $('#btn-pdf'), t = b.querySelector('span'); b.disabled = true; t.textContent = 'Armando…';
      llamar('pdf_evaluacion').then(function (r) {
        var bin = atob(r.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        var a = document.createElement('a'); a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      }).catch(function (e) { alert('No se pudo armar el PDF: ' + e.message); })
        .then(function () { b.disabled = false; t.textContent = 'PDF'; });
    };
    $('#barra').hidden = false;
  }

  if (!id || !t) { mostrarError('El enlace está incompleto.'); return; }
  if (!CONFIG.URL_SERVIDOR_FICHAS) { mostrarError('La app no tiene servidor configurado.'); return; }

  codigoLocal().then(function (c) { codigo = c; return llamar('ficha'); }).then(function (r) {
    var avisos = [];
    if (r.estado && r.estado !== 'COMPLETA') avisos.push('Estado del envío: ' + r.estado);
    if (!r.completa) avisos.push('Versión pública: se ocultan el teléfono del contacto, los números de documento y la firma. La completa se ve desde la app de la DIGER.');
    $('#contenido').innerHTML = Ficha.html(r.datos, { logos: LOGOS, fotos: r.fotos, firma: r.firma, firmaTexto: r.firmaTexto,
      aviso: avisos.join(' · '), enlace: location.href, cuerpoSolo: true });
    document.title = 'Formulario ' + r.num_formulario + ' · DIGER';
    enlazarBarra(r.num_formulario);
    ajustar();
    window.addEventListener('resize', ajustar);
  }).catch(function (e) {
    mostrarError(/Failed to fetch|NetworkError/.test(e.message) ? 'Sin conexión. Se necesita señal para ver la ficha.' : e.message);
  });
})();
