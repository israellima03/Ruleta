
/* =========================================================
   Ruleta en Cascada — Sincronización en vivo (Firebase)
   Presentador: gira y transmite. Espectador: solo mira, en vivo.
   ========================================================= */
(function () {
  'use strict';

  // ⚠️ Reemplazá esto con el "firebaseConfig" que copiaste de la
  // consola de Firebase (Configuración del proyecto > Tus apps).
  var firebaseConfig = {
    apiKey: "AIzaSyC-iBzgu73yiW1URXDBzo2cujvS8jSAQTQ",
  authDomain: "ruleta-reekie.firebaseapp.com",
  databaseURL: "https://ruleta-reekie-default-rtdb.firebaseio.com",
  projectId: "ruleta-reekie",
  storageBucket: "ruleta-reekie.firebasestorage.app",
  messagingSenderId: "246706673946",
  appId: "1:246706673946:web:9113706345eb30572cf4a3",
  measurementId: "G-3NS55G863T"
  };

  firebase.initializeApp(firebaseConfig);
  var db = firebase.database();

  function randomRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  var params = new URLSearchParams(window.location.search);
  var sala = params.get('sala');
  var isViewer = params.get('rol') === 'espectador';

  if (!sala && !isViewer) {
    // El presentador entra sin código: se genera uno nuevo y queda en la URL.
    sala = randomRoomCode();
    window.history.replaceState({}, '', window.location.pathname + '?sala=' + sala);
  }

  document.documentElement.classList.toggle('is-viewer', isViewer);

  var roomRef = sala ? db.ref('salas/' + sala) : null;
  var lastSpinSeq = -1;

  window.RuletaSync = {
    sala: sala,
    isViewer: isViewer,
    isPresenter: function () { return !isViewer && !!roomRef; },

    // Llamado por main.js cada vez que cambia navegación o resultado.
    broadcastState: function () {
      if (!this.isPresenter() || !window.RuletaApp) return;
      roomRef.update({
        config: JSON.stringify(window.RuletaApp.getRoot()),
        pathIds: window.RuletaApp.getPathIds(),
        resultVisible: window.RuletaApp.isResultVisible(),
        resultWinnerId: window.RuletaApp.getResultWinnerId()
      });
    },

    // Llamado por main.js en el instante exacto en que arranca un giro.
    broadcastSpin: function (rotation, durationMs) {
      if (!this.isPresenter()) return;
      roomRef.child('spin').set({
        seq: Date.now(),
        rotation: rotation,
        duration: durationMs,
        startedAt: Date.now()
      });
    },

    showRoomBadge: function () {
      var badge = document.getElementById('syncRoomCode');
      var linkInput = document.getElementById('syncShareLink');
      if (!badge || !sala) return;
      badge.textContent = sala;
      var shareUrl = window.location.origin + window.location.pathname + '?sala=' + sala + '&rol=espectador';
      if (linkInput) linkInput.value = shareUrl;
    }
  };

  if (!roomRef) return; // espectador sin ?sala= válido: no hay nada a lo que unirse

  roomRef.on('value', function (snapshot) {
    var data = snapshot.val();
    if (!data || !data.config || !isViewer || !window.RuletaApp) return;
    window.RuletaApp.applyRemoteConfig(
      JSON.parse(data.config),
      data.pathIds || ['root'],
      !!data.resultVisible,
      data.resultWinnerId || null
    );
  });

  roomRef.child('spin').on('value', function (snapshot) {
    var spin = snapshot.val();
    if (!spin || !isViewer || !window.RuletaApp) return;
    if (spin.seq === lastSpinSeq) return;
    lastSpinSeq = spin.seq;

    var elapsed = Date.now() - spin.startedAt;
    var remaining = spin.duration - elapsed;
    window.RuletaApp.playRemoteSpin(spin.rotation, Math.max(remaining, 0));
  });

  document.addEventListener('DOMContentLoaded', function () {
    window.RuletaSync.showRoomBadge();

    var copyBtn = document.getElementById('syncCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var input = document.getElementById('syncShareLink');
        if (!input || !input.value) return;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(input.value);
        } else {
          input.select();
          document.execCommand('copy');
        }
        copyBtn.textContent = '✓ Copiado';
        setTimeout(function () { copyBtn.textContent = '🔗 Copiar enlace'; }, 1500);
      });
    }
  });
})();