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

  function mostrarError(texto) {
    $('#contenido').innerHTML = '<div class="estado error"><b>No se pudo abrir la ficha</b><p>' + Ficha.esc(texto) + '</p></div>';
  }

  function llamar(accion, carga) {
    return fetch(CONFIG.URL_SERVIDOR_FICHAS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ accion: accion, id: id, t: t }, carga || {})),
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
    var mensaje = 'Evaluación de daños ' + num + ' — DIGER Pereira: ' + enlace;
    $('#titulo-ficha').textContent = 'Formulario ' + num;
    $('#btn-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(mensaje);
    $('#btn-imprimir').onclick = function () { window.print(); };
    $('#btn-copiar').onclick = function () {
      var hecho = function (ok) { $('#aviso-copia').textContent = ok ? 'Enlace copiado. Ya lo puede pegar en WhatsApp o en un oficio.' : 'Copie el enlace de la barra de direcciones.'; };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(enlace).then(function () { hecho(true); }, function () { hecho(false); });
      else hecho(false);
    };
    // En iPhone "Imprimir" a veces no guarda PDF: este botón lo arma el servidor.
    $('#btn-pdf').onclick = function () {
      var b = $('#btn-pdf'); b.disabled = true; b.textContent = 'Armando PDF…';
      llamar('pdf_evaluacion').then(function (r) {
        var bin = atob(r.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        var a = document.createElement('a'); a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      }).catch(function (e) { alert('No se pudo armar el PDF: ' + e.message); })
        .then(function () { b.disabled = false; b.textContent = 'Descargar PDF'; });
    };
    $('#barra').hidden = false;
  }

  if (!id || !t) { mostrarError('El enlace está incompleto.'); return; }
  if (!CONFIG.URL_SERVIDOR_FICHAS) { mostrarError('La app no tiene servidor configurado.'); return; }

  llamar('ficha').then(function (r) {
    var aviso = r.estado && r.estado !== 'COMPLETA' ? 'Estado del envío: ' + r.estado : '';
    $('#contenido').innerHTML = Ficha.html(r.datos, { logos: LOGOS, fotos: r.fotos, firma: r.firma, aviso: aviso, cuerpoSolo: true });
    document.title = 'Formulario ' + r.num_formulario + ' · DIGER';
    enlazarBarra(r.num_formulario);
    ajustar();
    window.addEventListener('resize', ajustar);
  }).catch(function (e) {
    mostrarError(/Failed to fetch|NetworkError/.test(e.message) ? 'Sin conexión. Se necesita señal para ver la ficha.' : e.message);
  });
})();
