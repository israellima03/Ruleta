/* =========================================================
   Ruleta en Cascada — Colegio Reekie
   Lógica: árbol de opciones + ruleta canvas + editor sincronizado
   Hasta 4 niveles de ruletas anidadas.
   ========================================================= */

(function () {
  'use strict';

  // ---------- Configuración ----------
  var maxLevels = 4;          // elegido por el usuario en la barra superior (1 a 4)
  var MIN_OPTIONS = 2;
  var MAX_OPTIONS = 12;
  var SPIN_DURATION_MS = 4200;
  var mode = 'config';        // 'config' = armando la cascada · 'play' = ruleta funcionando

  var PALETTE = [
    '#f0c14b', '#122455', '#e8394a', '#fff3d1',
    '#2a4390', '#ff7d8a', '#ffd76b', '#0b1836',
    '#c81f33', '#1a2f6b', '#a9791f', '#fff8ea'
  ];

  var uidCounter = 0;
  function makeId() {
    uidCounter += 1;
    return 'n' + uidCounter + '_' + Date.now().toString(36);
  }

  function nextColor(index) {
    return PALETTE[index % PALETTE.length];
  }

  function makeOption(name, colorIndex) {
    return {
      id: makeId(),
      name: name,
      color: nextColor(colorIndex),
      children: null // null = sin sub-ruleta todavía
    };
  }

  // ---------- Estado ----------
  var root = {
    id: 'root',
    name: 'Inicio',
    color: null,
    children: [
      makeOption('Opción 1', 0),
      makeOption('Opción 2', 1),
      makeOption('Opción 3', 2),
      makeOption('Opción 4', 3)
    ]
  };

  var path = [root];           // ruta actual (nodo raíz -> ... -> nodo cuyos "children" se muestran)
  var currentRotation = 0;     // grados acumulados de rotación del canvas
  var spinning = false;
  var spinTimeout = null;
  var lastResultWinnerId = null; // id de la opción ganadora mostrada (para sincronizar)

  // ---------- Referencias DOM ----------
  var canvas = document.getElementById('wheelCanvas');
  var ctx = canvas.getContext('2d');
  var spinBtn = document.getElementById('spinBtn');
  var respinBtn = document.getElementById('respinBtn');
  var homeBtn = document.getElementById('homeBtn');
  var wheelCrumbs = document.getElementById('wheelCrumbs');
  var editorCrumbs = document.getElementById('editorCrumbs');
  var optionsList = document.getElementById('optionsList');
  var addOptionBtn = document.getElementById('addOptionBtn');
  var depthHint = document.getElementById('depthHint');
  var resultPanel = document.getElementById('resultPanel');
  var resultEyebrow = document.getElementById('resultEyebrow');
  var resultName = document.getElementById('resultName');
  var resultActions = document.getElementById('resultActions');
  var editorTitle = document.getElementById('editorTitle');
  var editorSubtitle = document.getElementById('editorSubtitle');
  var confettiLayer = document.getElementById('confettiLayer');
  var appMain = document.getElementById('appMain');
  var levelSelect = document.getElementById('levelSelect');
  var playBtn = document.getElementById('playBtn');
  var editBtn = document.getElementById('editBtn');
  var playHint = document.getElementById('playHint');
  var wheelStage = document.querySelector('.wheel-stage');
  var wheelPanel = document.querySelector('.wheel-panel');
  var wheelControlsEl = document.querySelector('.wheel-controls');
  var appHeader = document.querySelector('.app-header');
  var appToolbar = document.querySelector('.app-toolbar');

  // Tamaño "lógico" en px CSS con el que dibujamos (independiente del
  // tamaño físico del canvas, que se multiplica por devicePixelRatio
  // para verse nítido en pantallas retina/celulares).
  var wheelSize = 640;

  function currentNode() {
    return path[path.length - 1];
  }

  function currentChildren() {
    return currentNode().children || [];
  }

  // ---------- Dibujo de la ruleta (canvas) ----------
  function drawWheel() {
    var children = currentChildren();
    var size = wheelSize;
    var cx = size / 2;
    var cy = size / 2;
    var radius = size / 2 - 6;

    ctx.clearRect(0, 0, size, size);

    if (children.length === 0) {
      ctx.fillStyle = '#fff8ea';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1836';
      ctx.font = '600 22px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Añade opciones →', cx, cy);
      return;
    }

    var n = children.length;
    var sliceAngle = (Math.PI * 2) / n;
    var startAngle = -Math.PI / 2; // slice 0 empieza arriba (12 en punto)

    for (var i = 0; i < n; i++) {
      var a0 = startAngle + i * sliceAngle;
      var a1 = a0 + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = children[i].color || nextColor(i);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.stroke();

      // Marca pequeña si esta opción tiene su propia sub-ruleta
      var hasSub = !!(children[i].children && children[i].children.length);

      // Texto centrado en el gajo: se ubica a mitad de radio y se
      // voltea 180° cuando cae del lado izquierdo, para que nunca
      // quede al revés sin importar el nombre que le pongas.
      var midAngle = a0 + sliceAngle / 2;
      var flip = Math.cos(midAngle) < 0;
      var textAngle = flip ? midAngle + Math.PI : midAngle;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(textAngle);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      var textColor = isDarkColor(children[i].color) ? '#fff8ea' : '#0b1836';
      ctx.fillStyle = textColor;
      ctx.font = '700 ' + Math.max(11, Math.min(20, 210 / n)) + 'px "Baloo 2", sans-serif';

      var label = truncateLabel(children[i].name || ('Opción ' + (i + 1)), n);
      var fullLabel = hasSub ? '🎡 ' + label : label;

      var textRadius = radius * 0.62;
      var xPos = flip ? -textRadius : textRadius;
      ctx.fillText(fullLabel, xPos, 0);

      ctx.restore();
    }

    // Círculo central decorativo
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8ea';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f0c14b';
    ctx.stroke();
  }

  function truncateLabel(text, n) {
    var maxChars = n <= 4 ? 16 : (n <= 6 ? 12 : (n <= 8 ? 9 : (n <= 10 ? 8 : 7)));
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 1) + '…';
  }

  function isDarkColor(hex) {
    if (!hex) return false;
    var c = hex.replace('#', '');
    var r = parseInt(c.substring(0, 2), 16);
    var g = parseInt(c.substring(2, 4), 16);
    var b = parseInt(c.substring(4, 6), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.55;
  }

  // ---------- Rotación / giro ----------
  function resetWheelTransform() {
    currentRotation = 0;
    canvas.style.transition = 'none';
    canvas.style.transform = 'rotate(0deg)';
    // Forzar reflow para que el próximo giro sí anime
    // eslint-disable-next-line no-unused-expressions
    canvas.offsetHeight;
    canvas.style.transition = '';
  }

  function hideResult() {
    resultPanel.classList.add('hidden');
    resultActions.innerHTML = '';
    lastResultWinnerId = null;
    if (window.RuletaSync && mode === 'play') window.RuletaSync.broadcastState();
  }

  function resetForCurrentWheel() {
    if (spinTimeout) { clearTimeout(spinTimeout); spinTimeout = null; }
    spinning = false;
    resetWheelTransform();
    hideResult();
    drawWheel();
    updateSpinButtonState();
    updatePlayState();
  }

  function updateSpinButtonState() {
    var n = currentChildren().length;
    spinBtn.disabled = mode !== 'play' || spinning || n < MIN_OPTIONS;
  }

  function spin() {
    var children = currentChildren();
    if (mode !== 'play' || spinning || children.length < MIN_OPTIONS) return;

    spinning = true;
    hideResult();
    updateSpinButtonState();

    var extraSpins = 5 + Math.floor(Math.random() * 3); // 5-7 vueltas completas
    var randomOffset = Math.random() * 360;
    currentRotation += extraSpins * 360 + randomOffset;

    canvas.style.transition = 'transform ' + (SPIN_DURATION_MS / 1000) + 's cubic-bezier(0.15,0.68,0.14,1)';
    canvas.style.transform = 'rotate(' + currentRotation + 'deg)';

    if (window.RuletaSync) window.RuletaSync.broadcastSpin(currentRotation, SPIN_DURATION_MS);

    spinTimeout = setTimeout(onSpinEnd, SPIN_DURATION_MS + 80);
  }

  function onSpinEnd() {
    spinning = false;
    updateSpinButtonState();

    var children = currentChildren();
    var n = children.length;
    var arc = 360 / n;
    var normalized = ((currentRotation % 360) + 360) % 360;
    var index = Math.floor(((360 - normalized) % 360) / arc);
    if (index < 0) index = 0;
    if (index >= n) index = n - 1;

    showResult(children[index]);
  }

  // ---------- Resultado ----------
  function showResult(winnerNode) {
    var hasSub = !!(winnerNode.children && winnerNode.children.length >= MIN_OPTIONS);
    lastResultWinnerId = winnerNode.id;

    resultEyebrow.textContent = 'Salió';
    resultName.textContent = winnerNode.name || 'Opción';
    resultActions.innerHTML = '';

    // Botón: girar de nuevo esta misma ruleta
    resultActions.appendChild(
      makeButton('↻ Girar otra vez', 'btn btn--ghost', function () {
        resetWheelTransform();
        hideResult();
        drawWheel();
        updateSpinButtonState();
      })
    );

    if (hasSub) {
      resultActions.appendChild(
        makeButton('🎡 Ir a la ruleta de "' + winnerNode.name + '"', 'btn btn--navy', function () {
          enterChild(winnerNode);
        })
      );
    } else {
      resultActions.appendChild(
        makeButton('🏠 Volver al inicio', 'btn btn--navy', function () {
          goHome();
        })
      );
      celebrateFinal();
    }

    resultPanel.classList.remove('hidden');
    if (window.RuletaSync && mode === 'play') window.RuletaSync.broadcastState();
  }

  function celebrateFinal() {
    resultEyebrow.textContent = '🎉 ¡Resultado final!';
    launchConfetti();
  }

  function makeButton(label, className, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- Navegación entre niveles ----------
  function enterChild(node) {
    if (mode === 'config' && path.length >= maxLevels) return;
    if (!node.children) {
      node.children = [makeOption('Opción 1', 0), makeOption('Opción 2', 1)];
    }
    path.push(node);
    afterNavigate();
  }

  function navigateToIndex(idx) {
    path = path.slice(0, idx + 1);
    afterNavigate();
  }

  function goHome() {
    path = [root];
    afterNavigate();
  }

  function afterNavigate() {
    resetForCurrentWheel();
    renderCrumbs();
    renderEditor();
    if (window.RuletaSync && mode === 'play') window.RuletaSync.broadcastState();
  }

  // ---------- Migas de pan ----------
  function renderCrumbs() {
    [wheelCrumbs, editorCrumbs].forEach(function (container) {
      container.innerHTML = '';
      path.forEach(function (node, idx) {
        if (idx > 0) {
          var sep = document.createElement('span');
          sep.className = 'crumb__sep';
          sep.textContent = '›';
          container.appendChild(sep);
        }
        var label = idx === 0 ? '🏠 Inicio' : node.name;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'crumb' + (idx === path.length - 1 ? ' is-current' : '');
        btn.textContent = label;
        btn.addEventListener('click', function () { navigateToIndex(idx); });
        container.appendChild(btn);
      });
    });
  }

  // ---------- Editor de opciones ----------
  function renderEditor() {
    var level = path.length; // ruleta 1..4
    var children = currentChildren();

    editorTitle.textContent = level === 1
      ? 'Opciones'
      : 'Opciones de "' + currentNode().name + '"';
    optionsList.innerHTML = '';

    children.forEach(function (node, index) {
      optionsList.appendChild(buildOptionRow(node, index, children.length, level));
    });

    addOptionBtn.disabled = children.length >= MAX_OPTIONS;

    if (level >= maxLevels) {
      depthHint.textContent = 'Nivel ' + level + ' de ' + maxLevels + ' · máximo de ruletas en cascada alcanzado.';
    } else {
      depthHint.textContent = 'Nivel ' + level + ' de ' + maxLevels + ' · usa 🎡 en una opción para darle su propia ruleta.';
    }

    updatePlayState();
  }

  function buildOptionRow(node, index, total, level) {
    var li = document.createElement('li');
    li.className = 'option-row';

    var swatch = document.createElement('span');
    swatch.className = 'option-row__swatch';
    swatch.style.background = node.color;
    li.appendChild(swatch);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'option-row__input';
    input.value = node.name;
    input.maxLength = 40;
    input.setAttribute('aria-label', 'Nombre de la opción ' + (index + 1));
    input.addEventListener('input', function () {
      node.name = input.value;
      resetForCurrentWheel();
    });
    li.appendChild(input);

    var subBtn = document.createElement('button');
    subBtn.type = 'button';
    subBtn.className = 'option-row__sub' + (node.children && node.children.length ? ' has-sub' : '');
    var canGoDeeper = level < maxLevels;
    subBtn.disabled = !canGoDeeper;
    subBtn.title = canGoDeeper
      ? (node.children && node.children.length ? 'Editar su sub-ruleta' : 'Crear sub-ruleta para esta opción')
      : 'Máximo ' + maxLevels + ' nivel(es) configurado(s) arriba';
    subBtn.textContent = '🎡';
    subBtn.addEventListener('click', function () {
      enterChild(node);
    });
    li.appendChild(subBtn);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'option-row__del';
    delBtn.title = 'Eliminar opción';
    delBtn.textContent = '✕';
    delBtn.disabled = total <= MIN_OPTIONS;
    delBtn.addEventListener('click', function () {
      var children = currentChildren();
      var i = children.indexOf(node);
      if (i > -1) children.splice(i, 1);
      resetForCurrentWheel();
      renderEditor();
    });
    li.appendChild(delBtn);

    return li;
  }

  function addOption() {
    var children = currentChildren();
    if (children.length >= MAX_OPTIONS) return;
    children.push(makeOption('Opción ' + (children.length + 1), children.length));
    resetForCurrentWheel();
    renderEditor();
  }

  // ---------- Validación de la configuración ----------
  function validateConfig() {
    function checkNode(node) {
      if (node.children) {
        if (node.children.length < MIN_OPTIONS) return false;
        for (var i = 0; i < node.children.length; i++) {
          var c = node.children[i];
          if (!c.name || !c.name.trim()) return false;
          if (!checkNode(c)) return false;
        }
      }
      return true;
    }
    return checkNode(root);
  }

  function updatePlayState() {
    if (mode !== 'config') return;
    var ok = validateConfig();
    playBtn.disabled = !ok;
    playHint.textContent = ok
      ? ''
      : 'Cada ruleta necesita al menos 2 opciones con nombre.';
  }

  // ---------- Cambio de modo: configuración ↔ juego ----------
  function enterPlayMode() {
    if (!validateConfig()) { updatePlayState(); return; }
    mode = 'play';
    path = [root];
    applyModeToUI();
    afterNavigate();
    // Se calcula tras el reflow para tener medidas reales del header/toolbar ya achicados.
    requestAnimationFrame(updatePlayLayout);
  }

  function enterConfigMode() {
    mode = 'config';
    wheelStage.style.width = '';
    wheelStage.style.height = '';
    applyModeToUI();
    resetForCurrentWheel();
    renderCrumbs();
    renderEditor();
    requestAnimationFrame(fitCanvasToFrame);
  }

  function applyModeToUI() {
    appMain.classList.toggle('mode-play', mode === 'play');
    appMain.classList.toggle('mode-config', mode === 'config');
    document.documentElement.classList.toggle('mode-play-lock', mode === 'play');
    document.getElementById('levelSelectGroup').style.display = mode === 'config' ? 'flex' : 'none';
    playBtn.style.display = mode === 'config' ? 'inline-flex' : 'none';
    editBtn.style.display = mode === 'play' ? 'inline-flex' : 'none';
    playHint.style.display = mode === 'config' ? 'inline' : 'none';
  }

  // ---------- Confeti ----------
  function launchConfetti() {
    var colors = ['#f0c14b', '#e8394a', '#2a4390', '#ffd76b', '#ffffff'];
    var count = 60;
    for (var i = 0; i < count; i++) {
      (function (i) {
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.background = colors[i % colors.length];
        piece.style.animationDuration = (2.4 + Math.random() * 1.8) + 's';
        piece.style.animationDelay = (Math.random() * 0.4) + 's';
        piece.style.transform = 'rotate(' + Math.floor(Math.random() * 360) + 'deg)';
        confettiLayer.appendChild(piece);
        setTimeout(function () {
          if (piece.parentNode) piece.parentNode.removeChild(piece);
        }, 5000);
      })(i);
    }
  }

  // ---------- Redimensionado responsive del canvas ----------
  function fitCanvasToFrame() {
    var frame = canvas.parentElement; // .wheel-frame
    var size = Math.min(frame.clientWidth, frame.clientHeight) || 560;
    var dpr = window.devicePixelRatio || 1;

    wheelSize = size; // usado por drawWheel() para todos los cálculos

    // El canvas físico se escala por dpr para verse nítido, pero el
    // contexto se reescala igual para que 1 unidad siga siendo 1px CSS.
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawWheel();
  }

  // Calcula el tamaño disponible en pantalla (sin generar scroll) y
  // dimensiona el escenario de la ruleta para modo juego.
function updatePlayLayout() {
    if (mode !== 'play') return;

    var vh = window.innerHeight;

    var headerH = appHeader.offsetHeight;
    var toolbarH = appToolbar.offsetHeight;
    var crumbsH = wheelCrumbs.offsetHeight;
    var controlsH = wheelControlsEl.offsetHeight;

    var panelStyle = window.getComputedStyle(wheelPanel);
    var panelPadding = parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom);

    var stageStyle = window.getComputedStyle(wheelStage);
    var stageMargin = parseFloat(stageStyle.marginTop) + parseFloat(stageStyle.marginBottom);

    var controlsStyle = window.getComputedStyle(wheelControlsEl);
    var controlsMargin = parseFloat(controlsStyle.marginTop) || 0;

    var safety = 12;
    var reserve = panelPadding + stageMargin + controlsMargin + safety;

    var availH = vh - headerH - toolbarH - crumbsH - controlsH - reserve;
    var availW = wheelPanel.clientWidth - 8;

    // Sin techo artificial: el único límite real es lo que entra en
    // pantalla (availH / availW), para que la ruleta se vea lo más
    // grande posible al proyectar.
    var stageSize = Math.max(200, Math.min(availH, availW));

    wheelStage.style.width = stageSize + 'px';
    wheelStage.style.height = stageSize + 'px';

    fitCanvasToFrame();
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (mode === 'play') {
        updatePlayLayout();
      } else {
        fitCanvasToFrame();
      }
    }, 120);
  });

  // ---------- Eventos ----------
  spinBtn.addEventListener('click', spin);
  respinBtn.addEventListener('click', function () {
    resetWheelTransform();
    hideResult();
    drawWheel();
    updateSpinButtonState();
  });
  homeBtn.addEventListener('click', goHome);
  addOptionBtn.addEventListener('click', addOption);

  levelSelect.addEventListener('change', function () {
    maxLevels = parseInt(levelSelect.value, 10) || 4;
    if (path.length > maxLevels) {
      path = path.slice(0, maxLevels);
      afterNavigate();
    } else {
      renderEditor();
    }
  });

  playBtn.addEventListener('click', enterPlayMode);
  editBtn.addEventListener('click', enterConfigMode);

  // ---------- Inicio ----------
  function init() {
    var viewerLoading = document.getElementById('viewerLoading');

    if (document.documentElement.classList.contains('is-viewer')) {
      mode = 'play';
      applyModeToUI();
      if (viewerLoading) viewerLoading.classList.add('is-active');
      return; // el resto lo dispara applyRemoteConfig() al recibir datos
    }

    applyModeToUI();
    fitCanvasToFrame();
    renderCrumbs();
    renderEditor();
    updateSpinButtonState();

    // Redibuja cuando la tipografía Baloo 2 termina de cargar, para que
    // las etiquetas de las opciones no se vean con la fuente de reserva.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        fitCanvasToFrame();
      });
    }
  }

  // ---------- Sincronización en vivo (usado por sync.js) ----------
  function findPath(node, ids) {
    var result = [node];
    var current = node;
    for (var i = 1; i < ids.length; i++) {
      var found = null;
      var kids = current.children || [];
      for (var j = 0; j < kids.length; j++) {
        if (kids[j].id === ids[i]) { found = kids[j]; break; }
      }
      if (!found) break;
      result.push(found);
      current = found;
    }
    return result;
  }

  var lastAppliedPathKey = null;

  function applyRemoteConfig(remoteRoot, pathIds, resultVisible, resultWinnerId) {
    root = remoteRoot;
    var newPath = findPath(root, pathIds && pathIds.length ? pathIds : ['root']);
    var pathKey = newPath.map(function (n) { return n.id; }).join('>');
    var pathChanged = pathKey !== lastAppliedPathKey;
    lastAppliedPathKey = pathKey;
    path = newPath;

    var viewerLoading = document.getElementById('viewerLoading');
    if (viewerLoading) viewerLoading.classList.remove('is-active');

    if (pathChanged) {
      resetWheelTransform();
      renderCrumbs();
      requestAnimationFrame(updatePlayLayout);
    }

    if (resultVisible) {
      var winner = null;
      var kids = currentChildren();
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].id === resultWinnerId) { winner = kids[i]; break; }
      }
      resultEyebrow.textContent = (winner && winner.children && winner.children.length) ? 'Salió' : '🎉 ¡Resultado final!';
      resultName.textContent = winner ? (winner.name || 'Opción') : '—';
      resultActions.innerHTML = '';
      resultPanel.classList.remove('hidden');
    } else {
      resultPanel.classList.add('hidden');
      resultActions.innerHTML = '';
    }
  }

  function playRemoteSpin(rotation, remainingMs) {
    resultPanel.classList.add('hidden');
    resultActions.innerHTML = '';

    if (remainingMs <= 30) {
      resetWheelTransform();
      currentRotation = rotation;
      canvas.style.transition = 'none';
      canvas.style.transform = 'rotate(' + rotation + 'deg)';
      return;
    }

    currentRotation = rotation;
    canvas.style.transition = 'transform ' + (remainingMs / 1000) + 's cubic-bezier(0.15,0.68,0.14,1)';
    canvas.style.transform = 'rotate(' + rotation + 'deg)';
  }

  window.RuletaApp = {
    getRoot: function () { return root; },
    getPathIds: function () { return path.map(function (n) { return n.id; }); },
    isResultVisible: function () { return !resultPanel.classList.contains('hidden'); },
    getResultWinnerId: function () { return lastResultWinnerId; },
    applyRemoteConfig: applyRemoteConfig,
    playRemoteSpin: playRemoteSpin
  };

  // ---------- Inicio ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();