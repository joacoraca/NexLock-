// NexLock — face.js
// Captura del rostro de referencia desde la cámara del navegador, cámara nativa o foto.
//
// Optimizaciones de estabilidad móvil (prevención de apagado/cuelgue de Android):
// - En Android/móviles NUNCA usa delegado GPU en WebGL (evita cuelgues del driver GPU y reinicio de hardware).
// - Detección por video con rate-limiting (throttled a ~3 FPS) para no saturar CPU/GPU en pantallas de 90/120Hz.
// - Opción nativa de cámara del celular (capture="user"): usa la app de cámara del SO fuera del navegador,
//   eliminando al 100% el consumo excesivo de corriente y memoria.
// - Resolución de video reducida en móviles (640x480 en lugar de 720p/1080p).
// - Re-escalado seguro de fotos subidas (máx 1024px) para evitar picos de memoria (OOM).
// - Devuelve un JPEG cuadrado de 320x320 en base64 para Face++ en el ESP32-CAM.

const MP_VERSION = '0.10.14';
const MP_BUNDLE  = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM    = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL   = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

// Parámetros de la imagen de referencia (Face++ acepta 48..4096 px, máx 2 MB)
export const FACE_SIZE    = 320;   // px del recorte final (cuadrado)
export const FACE_QUALITY = 0.88;  // calidad JPEG
const CROP_MARGIN         = 2.0;   // el recorte es 2x el tamaño de la cara detectada

// Umbrales de calidad
const MIN_FACE_RATIO  = 0.20;  // ancho de la cara / ancho del video
const MAX_CENTER_OFF  = 0.22;  // desvío máximo del centro
const MIN_SCORE       = 0.70;  // confianza mínima del detector
const STABLE_MS       = 1000;  // tiempo sostenido antes del auto-disparo
const DETECT_INTERVAL_MS = 320; // intervalo mínimo entre detecciones (~3 FPS en vivo)

export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth <= 850);
}

// ── Carga segura del detector ──────────────────────────────────────────────
let detectorPromise = null;
let currentMode = 'VIDEO';

function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const isMobile = isMobileDevice();
      const { FaceDetector, FilesetResolver } = await import(MP_BUNDLE);
      const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
      const make = delegate => FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });

      // En móviles NUNCA usar GPU para compilar shaders WebGL (causa kernel panic/reboot en Adreno/Mali)
      if (isMobile) {
        return await make('CPU');
      }
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
                                                                return { ok: false, msg: 'Centrá tu cara en el recuadro', box, score };
  if (score < MIN_SCORE)                                        return { ok: false, msg: 'Mejorá la iluminación', box, score };
  return { ok: true, msg: '¡Perfecto! Mantené la posición…', box, score };
}

// Recorta un cuadrado alrededor de la cara y lo escala a FACE_SIZE
function cropFace(source, srcW, srcH, box) {
  let side, cx, cy;
  if (box) {
    side = Math.max(box.width, box.height) * CROP_MARGIN;
    cx   = box.originX + box.width / 2;
    cy   = box.originY + box.height / 2 - box.height * 0.08;
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

  // Brillo medio (0-255)
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
    const modal          = $('#face-modal');
    const video          = $('#face-video');
    const overlay        = $('#face-overlay');
    const stage          = $('#face-stage');
    const shot           = $('#face-shot');
    const status         = $('#face-status');
    const btnShoot       = $('#face-shoot');
    const btnRetry       = $('#face-retake');
    const btnOk          = $('#face-confirm');
    const btnClose       = $('#face-close');
    const btnFile        = $('#face-upload');
    const fileIn         = $('#face-file');
    const nativeCamIn    = $('#face-native-cam');
    const camSel         = $('#face-cam-select');
    const autoChk        = $('#face-auto');
    const mobilePrompt   = $('#face-mobile-prompt');
    const btnNative      = $('#face-btn-native');
    const btnLive        = $('#face-btn-live');
    const btnGallery     = $('#face-btn-gallery');

    $('#face-modal-title').textContent = title;

    const isMobile = isMobileDevice();
    let stream = null, rafId = 0, detector = null, result = null;
    let detectorLoading = false;
    let lastAnalysis = null, okSince = 0, closed = false;
    let lastDetectTime = 0;

    const setStatus = (msg, kind = '') => {
      status.textContent = msg;
      status.className = 'cam-status ' + kind;
    };

    function showPreview(face) {
      result = face;
      shot.src = face.dataUrl;
      stage.classList.add('captured');
      if (mobilePrompt) mobilePrompt.hidden = true;
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
      if (isMobile && !stream) {
        if (mobilePrompt) mobilePrompt.hidden = false;
        setStatus('Elegí una opción para capturar el rostro.');
      }
    }

    function stopStream() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      if (video) video.srcObject = null;
    }

    function close(value) {
      if (closed) return;
      closed = true;
      stopStream();
      modal.hidden = true;
      document.body.classList.remove('modal-open');
      btnShoot.onclick = btnRetry.onclick = btnOk.onclick = btnClose.onclick = null;
      btnFile.onclick = fileIn.onchange = camSel.onchange = modal.onclick = null;
      if (nativeCamIn) nativeCamIn.onchange = null;
      if (btnNative)   btnNative.onclick = null;
      if (btnLive)     btnLive.onclick = null;
      if (btnGallery)  btnGallery.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(value);
    }
    const onKey = e => { if (e.key === 'Escape') close(null); };

    // Dibuja el recuadro de la cara sobre el video
    function drawOverlay(a) {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return;
      if (overlay.width !== w)  overlay.width = w;
      if (overlay.height !== h) overlay.height = h;
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      if (!a?.box) return;
      ctx.lineWidth = Math.max(2, w / 200);
      ctx.strokeStyle = a.ok ? '#4ade80' : '#fbbf24';
      const { originX, originY, width, height } = a.box;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(originX, originY, width, height, 12);
      else ctx.rect(originX, originY, width, height);
      ctx.stroke();
    }

    // Bucle de video con límite de frecuencia (~3 FPS) para proteger la batería y GPU
    async function loop(now) {
      if (closed || !stream) return;
      if (!result && video.readyState >= 2) {
        if (detectorLoading) {
          setStatus('Cargando detector de rostros…');
          btnShoot.disabled = true;
        } else if (now - lastDetectTime >= DETECT_INTERVAL_MS) {
          lastDetectTime = now;
          let detections = null;
          if (detector) {
            try { detections = detector.detectForVideo(video, now).detections; }
            catch (e) { console.warn('[face] detect error', e); }
          }
          const a = analyze(detections, video.videoWidth, video.videoHeight);
          lastAnalysis = a;
          drawOverlay(a);
          setStatus(a.msg, a.ok ? 'ok' : 'warn');
          btnShoot.disabled = !a.ok;
          stage.classList.toggle('good', a.ok && !!detector);

          if (a.ok && detector && autoChk?.checked) {
            okSince = okSince || now;
            if (now - okSince > STABLE_MS) capture();
          } else {
            okSince = 0;
          }
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
      if (mobilePrompt) mobilePrompt.hidden = true;
      setStatus('Iniciando cámara…');
      try {
        // En móviles pedir resolución moderada (640x480) para no saturar memoria ni ISP
        const videoConstraints = deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: isMobile ? 640 : 1280 }, height: { ideal: isMobile ? 480 : 720 } }
          : { facingMode: 'user', width: { ideal: isMobile ? 640 : 1280 }, height: { ideal: isMobile ? 480 : 720 } };

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });
        video.srcObject = stream;
        await video.play();

        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        camSel.hidden = cams.length < 2;
        camSel.innerHTML = cams.map((c, i) =>
          `<option value="${c.deviceId}" ${c.deviceId === activeId ? 'selected' : ''}>${c.label || 'Cámara ' + (i + 1)}</option>`).join('');

        lastDetectTime = 0;
        rafId = requestAnimationFrame(loop);

        if (!detector && !detectorLoading) {
          detectorLoading = true;
          loadDetector().then(async d => {
            detector = d;
            if (d) await setMode(d, 'VIDEO');
            detectorLoading = false;
          });
        }
      } catch (err) {
        console.error('[face] getUserMedia', err);
        const msg = err.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Podés usar la cámara nativa o subir una foto.'
                  : err.name === 'NotFoundError'   ? 'No se encontró cámara. Podés subir una foto.'
                  : 'No se pudo abrir la cámara en vivo. Usá la opción "Cámara del celular" o subí una foto.';
        setStatus(msg, 'err');
        btnShoot.disabled = true;
        if (isMobile && mobilePrompt) mobilePrompt.hidden = false;
      }
    }

    // Procesa imagen desde archivo o cámara nativa
    async function fromFile(file) {
      if (!file) return;
      stopStream();
      setStatus('Procesando foto…');

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;

      try {
        await img.decode();
      } catch (e) {
        URL.revokeObjectURL(url);
        setStatus('No se pudo leer la imagen seleccionada.', 'err');
        return;
      }
      URL.revokeObjectURL(url);

      // Re-escalar a máx 1024px para evitar que fotos pesadas de cámaras de 12/48MP cuelguen el navegador
      const MAX_DIM = 1024;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      let processSource = img;

      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
        const sw = Math.round(w * scale);
        const sh = Math.round(h * scale);
        const sc = document.createElement('canvas');
        sc.width = sw;
        sc.height = sh;
        const sctx = sc.getContext('2d');
        sctx.drawImage(img, 0, 0, sw, sh);
        processSource = sc;
        w = sw;
        h = sh;
      }

      let box = null;
      if (!detector) {
        setStatus('Validando rostro…');
        detector = await loadDetector();
      }

      if (detector) {
        try {
          await setMode(detector, 'IMAGE');
          const dets = detector.detect(processSource).detections;
          const a = analyze(dets, w, h);
          if (!dets || !dets.length) {
            setStatus('No se detectó un rostro nítido en la foto. Podés repetirla o confirmarla.', 'warn');
          } else if (dets.length > 1) {
            setStatus('Se detectó más de un rostro en la foto. Procurá que haya solo una persona.', 'err');
            return;
          } else {
            box = a.box;
          }
        } catch (e) {
          console.warn('[face] Error analizando foto:', e);
        } finally {
          if (detector) await setMode(detector, 'VIDEO');
        }
      }

      showPreview(cropFace(processSource, w, h, box));
    }

    // Eventos principales
    btnShoot.onclick = capture;
    btnRetry.onclick = () => { resetPreview(); };
    btnOk.onclick    = () => close(result ? { ...result, score: lastAnalysis?.score ?? null } : null);
    btnClose.onclick = () => close(null);
    modal.onclick    = e => { if (e.target === modal) close(null); };

    btnFile.onclick  = () => fileIn.click();
    fileIn.onchange  = () => { fromFile(fileIn.files[0]); fileIn.value = ''; };

    if (nativeCamIn) {
      nativeCamIn.onchange = () => { fromFile(nativeCamIn.files[0]); nativeCamIn.value = ''; };
    }

    if (btnNative && nativeCamIn) {
      btnNative.onclick = () => nativeCamIn.click();
    }
    if (btnLive) {
      btnLive.onclick = () => startCamera();
    }
    if (btnGallery) {
      btnGallery.onclick = () => fileIn.click();
    }

    camSel.onchange  = () => startCamera(camSel.value);
    document.addEventListener('keydown', onKey);

    // Inicialización del modal
    resetPreview();
    modal.hidden = false;
    document.body.classList.add('modal-open');
    btnShoot.disabled = true;

    if (isMobile) {
      // En móviles/Android: MOSTRAR OPCIONES SEGURAS PRIMERO.
      // NO encender la cámara WebRTC automáticamente para no provocar el pico de corriente/GPU
      // que causa el reinicio instantáneo en el teléfono del usuario.
      if (mobilePrompt) mobilePrompt.hidden = false;
      setStatus('Elegí una opción para capturar el rostro.');
    } else {
      // En escritorio: abrir cámara web directamente
      if (mobilePrompt) mobilePrompt.hidden = true;
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Este navegador no permite usar la cámara. Podés subir una foto.', 'err');
      } else {
        startCamera();
      }
    }
  });
}

// Pre-carga del detector en segundo plano (solo en PCs de escritorio)
export function preloadFaceDetector() {
  if (isMobileDevice()) return;
  loadDetector();
}
