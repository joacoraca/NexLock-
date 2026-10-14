// NexLock — face.js
// Captura del rostro de referencia desde la cámara del navegador (o desde una foto).
//
// - Usa MediaPipe Face Detector (corre 100% en el navegador) para validar en vivo
//   que haya UN solo rostro, centrado, cerca y bien iluminado.
// - Devuelve un JPEG cuadrado de 320x320 recortado alrededor de la cara, en base64.
//   Ese JPEG es la "foto de referencia" que el ESP32-CAM compara contra Face++.
// - Si MediaPipe no carga (sin internet al CDN, navegador viejo), igual deja capturar
//   pero sin la validación automática.
//
// Uso:  const face = await openFaceCapture({ title: 'Registrar rostro de Juan' });
//       if (face) -> { base64, dataUrl, width, height, score, brightness }

const MP_VERSION = '0.10.14';
const MP_BUNDLE  = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM    = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL   = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

// Parámetros de la imagen de referencia (Face++ acepta 48..4096 px, máx 2 MB)
export const FACE_SIZE    = 320;   // px del recorte final (cuadrado)
export const FACE_QUALITY = 0.88;  // calidad JPEG
const CROP_MARGIN         = 2.0;   // el recorte es 2x el tamaño de la cara detectada

// Umbrales de calidad para habilitar la captura
const MIN_FACE_RATIO  = 0.22;  // ancho de la cara / ancho del video
const MAX_CENTER_OFF  = 0.18;  // desvío máximo del centro (proporción del frame)
const MIN_SCORE       = 0.75;  // confianza mínima del detector
const STABLE_MS       = 1200;  // tiempo "OK" sostenido antes del auto-disparo

// ── Carga perezosa del detector ──────────────────────────────────────────────
let detectorPromise = null;
let currentMode = 'VIDEO';

function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import(MP_BUNDLE);
      const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
      const make = delegate => FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
      try { return await make('GPU'); }
      catch { return await make('CPU'); }
    })().catch(err => {
      console.warn('[face] No se pudo cargar MediaPipe, captura sin validación:', err);
      detectorPromise = null;
      return null;
    });
  }
  return detectorPromise;
}

async function setMode(detector, mode) {
  if (detector && currentMode !== mode) {
    await detector.setOptions({ runningMode: mode });
    currentMode = mode;
  }
}

// ── Análisis de calidad ──────────────────────────────────────────────────────
function analyze(detections, srcW, srcH) {
  if (!detections) return { ok: true, msg: 'Validación automática no disponible. Centrá tu cara y capturá.', box: null };
  if (detections.length === 0) return { ok: false, msg: 'No se detecta ningún rostro', box: null };
  if (detections.length > 1)   return { ok: false, msg: 'Hay más de un rostro en cámara', box: null };

  const d     = detections[0];
  const box   = d.boundingBox;
  const score = d.categories?.[0]?.score ?? 1;
  const cx    = (box.originX + box.width / 2)  / srcW;
  const cy    = (box.originY + box.height / 2) / srcH;
  const ratio = box.width / srcW;

  if (ratio < MIN_FACE_RATIO)                                   return { ok: false, msg: 'Acercate un poco más', box, score };
  if (Math.abs(cx - .5) > MAX_CENTER_OFF || Math.abs(cy - .5) > MAX_CENTER_OFF)
                                                                return { ok: false, msg: 'Centrá tu cara en el óvalo', box, score };
  if (score < MIN_SCORE)                                        return { ok: false, msg: 'Mejorá la iluminación', box, score };
  return { ok: true, msg: '¡Perfecto! Mantené la posición…', box, score };
}

// Recorta un cuadrado alrededor de la cara y lo escala a FACE_SIZE
function cropFace(source, srcW, srcH, box) {
  let side, cx, cy;
  if (box) {
    side = Math.max(box.width, box.height) * CROP_MARGIN;
    cx   = box.originX + box.width / 2;
    cy   = box.originY + box.height / 2 - box.height * 0.08; // un poco hacia arriba (frente/pelo)
  } else {
    side = Math.min(srcW, srcH) * 0.8;
    cx   = srcW / 2;
    cy   = srcH / 2;
  }
  side = Math.min(side, srcW, srcH);
  const sx = Math.max(0, Math.min(srcW - side, cx - side / 2));
  const sy = Math.max(0, Math.min(srcH - side, cy - side / 2));

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FACE_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, side, side, 0, 0, FACE_SIZE, FACE_SIZE);

  // Brillo medio (0-255) para avisar si la foto quedó muy oscura/clara
  const px = ctx.getImageData(0, 0, FACE_SIZE, FACE_SIZE).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 16) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const brightness = Math.round(sum / (px.length / 16));

  const dataUrl = canvas.toDataURL('image/jpeg', FACE_QUALITY);
  return {
    dataUrl,
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    width: FACE_SIZE,
    height: FACE_SIZE,
    brightness,
  };
}

// ── Modal ────────────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);

export function openFaceCapture({ title = 'Registrar rostro' } = {}) {
  return new Promise(resolve => {
    const modal    = $('#face-modal');
    const video    = $('#face-video');
    const overlay  = $('#face-overlay');
    const stage    = $('#face-stage');
    const shot     = $('#face-shot');
    const status   = $('#face-status');
    const btnShoot = $('#face-shoot');
    const btnRetry = $('#face-retake');
    const btnOk    = $('#face-confirm');
    const btnClose = $('#face-close');
    const btnFile  = $('#face-upload');
    const fileIn   = $('#face-file');
    const camSel   = $('#face-cam-select');
    const autoChk  = $('#face-auto');

    $('#face-modal-title').textContent = title;

    let stream = null, rafId = 0, detector = null, result = null;
    let detectorLoading = true;
    let lastAnalysis = null, okSince = 0, closed = false;

    const setStatus = (msg, kind = '') => {
      status.textContent = msg;
      status.className = 'cam-status ' + kind;
    };

    function showPreview(face) {
      result = face;
      shot.src = face.dataUrl;
      stage.classList.add('captured');
      btnShoot.hidden = true;
      btnRetry.hidden = false;
      btnOk.hidden    = false;
      const warn = face.brightness < 60 ? ' (la foto quedó oscura, considerá repetirla)'
                 : face.brightness > 210 ? ' (la foto quedó muy clara, considerá repetirla)' : '';
      setStatus('Revisá la foto. Si se ve bien, confirmala.' + warn, warn ? 'warn' : 'ok');
    }

    function resetPreview() {
      result = null;
      stage.classList.remove('captured');
      btnShoot.hidden = false;
      btnRetry.hidden = true;
      btnOk.hidden    = true;
      okSince = 0;
    }

    function stopStream() {
      cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    function close(value) {
      if (closed) return;
      closed = true;
      stopStream();
      modal.hidden = true;
      document.body.classList.remove('modal-open');
      btnShoot.onclick = btnRetry.onclick = btnOk.onclick = btnClose.onclick = null;
      btnFile.onclick = fileIn.onchange = camSel.onchange = modal.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(value);
    }
    const onKey = e => { if (e.key === 'Escape') close(null); };

    // Dibuja el recuadro de la cara sobre el video
    function drawOverlay(a) {
      const w = video.videoWidth, h = video.videoHeight;
      if (overlay.width !== w)  overlay.width = w;
      if (overlay.height !== h) overlay.height = h;
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      if (!a?.box) return;
      ctx.lineWidth = Math.max(2, w / 200);
      ctx.strokeStyle = a.ok ? '#4ade80' : '#fbbf24';
      const { originX, originY, width, height } = a.box;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(originX, originY, width, height, 12) : ctx.rect(originX, originY, width, height);
      ctx.stroke();
    }

    async function loop() {
      if (closed || !stream) return;
      if (!result && video.readyState >= 2 && detectorLoading) {
        setStatus('Cargando detector de rostros…');
        btnShoot.disabled = true;
      } else if (!result && video.readyState >= 2) {
        let detections = null;
        if (detector) {
          try { detections = detector.detectForVideo(video, performance.now()).detections; }
          catch (e) { console.warn('[face] detect error', e); }
        }
        const a = analyze(detections, video.videoWidth, video.videoHeight);
        lastAnalysis = a;
        drawOverlay(a);
        setStatus(a.msg, a.ok ? 'ok' : 'warn');
        btnShoot.disabled = !a.ok;
        stage.classList.toggle('good', a.ok && !!detector);

        if (a.ok && detector && autoChk.checked) {
          okSince = okSince || performance.now();
          if (performance.now() - okSince > STABLE_MS) capture();
        } else {
          okSince = 0;
        }
      }
      rafId = requestAnimationFrame(loop);
    }

    function capture() {
      if (!video.videoWidth) return;
      okSince = 0;
      const box = detector ? lastAnalysis?.box : null;
      showPreview(cropFace(video, video.videoWidth, video.videoHeight, box));
    }

    async function startCamera(deviceId) {
      stopStream();
      setStatus('Iniciando cámara…');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        video.srcObject = stream;
        await video.play();

        // Lista de cámaras (los labels solo aparecen después de dar permiso)
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        camSel.hidden = cams.length < 2;
        camSel.innerHTML = cams.map((c, i) =>
          `<option value="${c.deviceId}" ${c.deviceId === activeId ? 'selected' : ''}>${c.label || 'Cámara ' + (i + 1)}</option>`).join('');

        rafId = requestAnimationFrame(loop);
      } catch (err) {
        console.error('[face] getUserMedia', err);
        const msg = err.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Habilitalo en el navegador o subí una foto.'
                  : err.name === 'NotFoundError'   ? 'No se encontró ninguna cámara. Podés subir una foto.'
                  : 'No se pudo abrir la cámara. Podés subir una foto.';
        setStatus(msg, 'err');
        btnShoot.disabled = true;
      }
    }

    // Subir foto desde archivo (útil si la PC no tiene cámara)
    async function fromFile(file) {
      if (!file) return;
      const img = new Image();
      img.src = URL.createObjectURL(file);
      try { await img.decode(); } catch { setStatus('No se pudo leer la imagen.', 'err'); return; }
      const w = img.naturalWidth, h = img.naturalHeight;
      let box = null;
      if (detector) {
        try {
          await setMode(detector, 'IMAGE');
          const dets = detector.detect(img).detections;
          const a = analyze(dets, w, h);
          if (!dets.length)    { setStatus('No se detectó ningún rostro en la foto.', 'err'); return; }
          if (dets.length > 1) { setStatus('La foto tiene más de un rostro.', 'err'); return; }
          box = a.box;
        } finally {
          await setMode(detector, 'VIDEO');
        }
      }
      URL.revokeObjectURL(img.src);
      showPreview(cropFace(img, w, h, box));
    }

    // Eventos
    btnShoot.onclick = capture;
    btnRetry.onclick = () => { resetPreview(); };
    btnOk.onclick    = () => close(result ? { ...result, score: lastAnalysis?.score ?? null } : null);
    btnClose.onclick = () => close(null);
    modal.onclick    = e => { if (e.target === modal) close(null); };
    btnFile.onclick  = () => fileIn.click();
    fileIn.onchange  = () => { fromFile(fileIn.files[0]); fileIn.value = ''; };
    camSel.onchange  = () => startCamera(camSel.value);
    document.addEventListener('keydown', onKey);

    // Abrir
    resetPreview();
    modal.hidden = false;
    document.body.classList.add('modal-open');
    btnShoot.disabled = true;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Este navegador no permite usar la cámara (se necesita HTTPS). Podés subir una foto.', 'err');
    } else {
      startCamera();
    }

    loadDetector().then(async d => {
      detector = d;
      if (d) await setMode(d, 'VIDEO');
      detectorLoading = false;
    });
  });
}

// Pre-carga del detector en segundo plano (para que el modal abra rápido)
export function preloadFaceDetector() { loadDetector(); }
