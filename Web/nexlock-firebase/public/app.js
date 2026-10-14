
// NexLock, mi app.js. La animacion y el control del front al backend de Firebase.
// Firebase Auth + Firestore directo
// PIN hasheado con SHA-256
// Rostro de referencia (JPEG 320x320) para la doble validación PIN + rostro.
//
// Modelo de datos (ver Electronica/ESP/INTEGRACION_ROSTRO.md):
//   users/{userId}   -> { name, pin(sha256), role, faceEnrolled, faceUpdatedAt, createdAt }
//   faces/{userId}   -> { image(base64 JPEG), mime, width, height, detectorScore, updatedAt, updatedBy }
//   logs/{logId}     -> { result, device_id, userId, userName, method, pinResult,
//                         faceResult, faceConfidence, timestamp }
//   devices/{devId}  -> { name, lastSeen, ip, rssi, fw, camStatus, camFw }   (heartbeat del ESP32)


import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, deleteDoc, doc, getDoc,
  query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { openFaceCapture, preloadFaceDetector } from './face.js';

// TU CONFIG DE FIREBASE 
const firebaseConfig = {
  apiKey:            "AIzaSyBLiRX-M-1dqJ7VlJ8LlGutS9fjVlr8H3g",
  authDomain:        "nexlock-24aed.firebaseapp.com",
  projectId:         "nexlock-24aed",
  storageBucket:     "nexlock-24aed.firebasestorage.app",
  messagingSenderId: "375522853727",
  appId:             "1:375522853727:web:39dfd23292fe591ef2acea",
};
// ──

const firebaseApp = initializeApp(firebaseConfig);
const db   = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

const logsCol    = collection(db, 'logs');
const usersCol   = collection(db, 'users');
const devicesCol = collection(db, 'devices');
const faceDoc    = id => doc(db, 'faces', id);

// ── SHA-256 
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helpers
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Escapa texto antes de meterlo en innerHTML (evita inyección de HTML con nombres de usuario)
function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function ago(ts) {
  if (!ts) return 'nunca';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60)    return `hace ${s} s`;
  if (s < 3600)  return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return fmt(ts);
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function setConnected(ok) {
  const cls = 'status-dot ' + (ok ? 'on' : 'off');
  const dot = $('#status-dot');
  if (dot) dot.className = cls;
  const mDot = $('#mobile-status-dot');
  if (mDot) mDot.className = cls;
  const txt = $('#status-text');
  if (txt) txt.textContent = ok ? 'Conectado' : 'Sin conexión';
}

// Reloj 
setInterval(() => {
  $('#clock').textContent = new Date().toLocaleString('es-AR', { hour12: false });
}, 1000);

// Listeners de Firestore activos (se cancelan al cerrar sesión)
let listeners = [];
function track(unsub) { listeners.push(unsub); return unsub; }
function stopListeners() {
  listeners.forEach(u => { try { u(); } catch {} });
  listeners = [];
  if (unsubLogs) { unsubLogs(); unsubLogs = null; }
}


// AUTH — pantalla de login

const REMEMBER_KEY = 'nexlock_remember_email';

function setLoginLoading(loading) {
  const btn = $('#btn-login');
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  btn.querySelector('.btn-login-text').textContent = loading ? 'Ingresando…' : 'Ingresar';
}

function showLoginError(msg) {
  const errEl = $('#login-error');
  const box   = document.querySelector('.login-box');
  errEl.textContent = msg;
  box.classList.remove('shake');
  void box.offsetWidth;
  box.classList.add('shake');
}

// Restaurar email guardado
const savedEmail = localStorage.getItem(REMEMBER_KEY);
if (savedEmail) {
  $('#login-email').value = savedEmail;
  $('#remember-email').checked = true;
}

// Mostrar / ocultar contraseña
$('#toggle-password').addEventListener('click', () => {
  const input  = $('#login-password');
  const toggle = $('#toggle-password');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  toggle.classList.toggle('visible', !visible);
  toggle.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  toggle.title = visible ? 'Mostrar contraseña' : 'Ocultar contraseña';
});

// Escucha cambios de sesión | muestra login o app según estado
onAuthStateChanged(auth, user => {
  stopListeners();
  if (user) {
    $('#login-screen').style.display  = 'none';
    $('#app-screen').style.display    = 'flex';
    $('#user-email').textContent      = user.email;
    initDashboard();
    initDevices();
    initUsers();
    preloadFaceDetector();
  } else {
    $('#login-screen').style.display  = 'flex';
    $('#app-screen').style.display    = 'none';
    setLoginLoading(false);
  }
});

// Formulario de login
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const errEl    = $('#login-error');

  errEl.textContent = '';
  setLoginLoading(true);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    if ($('#remember-email').checked) {
      localStorage.setItem(REMEMBER_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch (err) {
    showLoginError('Email o contraseña incorrectos.');
    setLoginLoading(false);
  }
});

// Cerrar sesión
async function doLogout() {
  try {
    setMenuOpen(false);
    await signOut(auth);
  } catch (err) {
    console.error('Error al cerrar sesión:', err);
    $('#login-screen').style.display = 'flex';
    $('#app-screen').style.display   = 'none';
  }
}
window.doLogout = doLogout;



// VERIFICACIÓN (PIN + ROSTRO) — cómo se muestra cada log

// Valores que escribe el ESP32 en logs.faceResult
const FACE_RESULTS = {
  match:        { txt: 'Rostro ✓',              cls: 'ok'   },
  no_match:     { txt: 'Rostro no coincide',    cls: 'fail' },
  no_face:      { txt: 'Sin rostro en cámara',  cls: 'fail' },
  not_enrolled: { txt: 'Rostro no registrado',  cls: 'warn' },
  timeout:      { txt: 'Cámara sin respuesta',  cls: 'warn' },
  error:        { txt: 'Error de verificación', cls: 'warn' },
};

function verificationChips(log) {
  // Logs viejos no traen pinResult: si hay userId, el PIN fue correcto
  const pinOk = log.pinResult ? log.pinResult === 'ok' : !!log.userId;
  const chips = [`<span class="chip ${pinOk ? 'ok' : 'fail'}">PIN ${pinOk ? '✓' : '✗'}</span>`];

  const f = FACE_RESULTS[log.faceResult];
  if (f) {
    const showConf = (log.faceResult === 'match' || log.faceResult === 'no_match')
      && typeof log.faceConfidence === 'number';
    chips.push(`<span class="chip ${f.cls}">${f.txt}${showConf ? ` · ${Math.round(log.faceConfidence)}%` : ''}</span>`);
  } else if (pinOk) {
    chips.push('<span class="chip muted">Rostro —</span>');
  }
  return chips.join('');
}

function logTitle(log) {
  if (log.userName) return esc(log.userName);
  return log.pinResult === 'ok' ? 'Usuario desconocido' : 'PIN incorrecto';
}


// STATS

async function loadStats() {
  try {
    const [all, ok, fail] = await Promise.all([
      getDocs(logsCol),
      getDocs(query(logsCol, where('result', '==', 'success'))),
      getDocs(query(logsCol, where('result', '==', 'fail'))),
    ]);
    const total = all.size;
    $('#s-total').textContent = total;
    $('#s-ok').textContent    = ok.size;
    $('#s-fail').textContent  = fail.size;
    $('#s-rate').textContent  = total > 0 ? Math.round((ok.size / total) * 100) + '%' : '—';
  } catch (e) { console.error('Stats error:', e); }
}


// DASHBOARD

function initDashboard() {
  const q = query(logsCol, orderBy('timestamp', 'desc'), limit(20));

  track(onSnapshot(q, snap => {
    setConnected(true);
    loadStats();

    const feedEl = $('#feed-list');
    if (snap.empty) {
      feedEl.innerHTML = `
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="14" stroke="currentColor" stroke-width="2"/>
            <path d="M18 12v6l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>Sin actividad todavía</p>
        </div>`;
      return;
    }

    $('#feed-count').textContent = `${snap.size} registros recientes`;
    feedEl.innerHTML = snap.docs.map(d => {
      const log  = d.data();
      const isOk = log.result === 'success';
      const icon = isOk
        ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
      return `
        <div class="feed-item">
          <div class="feed-icon ${isOk ? 'ok' : 'fail'}">${icon}</div>
          <div class="feed-info">
            <div class="feed-user">${logTitle(log)}</div>
            <div class="feed-meta">
              <span>${esc(log.device_id || 'door_1')}</span>
              ${verificationChips(log)}
            </div>
          </div>
          <span class="badge ${isOk ? 'ok' : 'fail'}">${isOk ? 'Permitido' : 'Denegado'}</span>
          <span class="feed-time">${fmt(log.timestamp)}</span>
        </div>`;
    }).join('');
  }, () => setConnected(false)));
}


// DISPOSITIVOS (heartbeat que escribe el ESP32 en devices/{id})

const ONLINE_MS = 3 * 60 * 1000; // se considera online si reportó en los últimos 3 min
let devicesCache = [];

const CAM_STATUS = {
  ok:          { txt: 'Cámara OK',            cls: 'ok'   },
  no_response: { txt: 'Cámara sin respuesta', cls: 'fail' },
  error:       { txt: 'Cámara con error',     cls: 'warn' },
};

function renderDevices() {
  const el = $('#devices-list');
  if (!devicesCache.length) {
    el.innerHTML = `<div class="empty-state"><p>Ningún dispositivo reportó todavía.<br>El ESP32 escribe su estado en <code>devices/&lt;DEVICE_ID&gt;</code>.</p></div>`;
    return;
  }
  el.innerHTML = devicesCache.map(({ id, data: dv }) => {
    const last   = dv.lastSeen?.toDate ? dv.lastSeen.toDate().getTime() : 0;
    const online = last && Date.now() - last < ONLINE_MS;
    const cam    = online ? CAM_STATUS[dv.camStatus] : null;
    return `
      <div class="device-item">
        <span class="status-dot ${online ? 'on' : 'off'}"></span>
        <div class="device-info">
          <div class="device-name">${esc(dv.name || id)} <span class="device-id">${esc(id)}</span></div>
          <div class="device-meta">
            ${online ? 'En línea' : 'Desconectado'} · ${ago(dv.lastSeen)}
            ${dv.ip ? ` · ${esc(dv.ip)}` : ''}
            ${typeof dv.rssi === 'number' ? ` · WiFi ${dv.rssi} dBm` : ''}
            ${dv.fw ? ` · fw ${esc(dv.fw)}` : ''}
          </div>
        </div>
        ${cam ? `<span class="chip ${cam.cls}">${cam.txt}</span>` : '<span class="chip muted">Cámara —</span>'}
      </div>`;
  }).join('');
}

function initDevices() {
  track(onSnapshot(devicesCol, snap => {
    devicesCache = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    renderDevices();
  }, err => {
    console.warn('Devices:', err.code);
    $('#devices-list').innerHTML = `<div class="empty-state"><p>No se pudo leer <code>devices</code>. ¿Desplegaste las nuevas reglas de Firestore?</p></div>`;
  }));
  // refresca los "hace X min" y el estado online/offline
  const t = setInterval(renderDevices, 30000);
  track(() => clearInterval(t));
}


// HISTORIAL

let unsubLogs = null;

function loadLogs(filter = 'all') {
  if (unsubLogs) unsubLogs();

  const q = filter === 'success'
    ? query(logsCol, where('result', '==', 'success'), orderBy('timestamp', 'desc'), limit(200))
    : filter === 'fail'
    ? query(logsCol, where('result', '==', 'fail'), orderBy('timestamp', 'desc'), limit(200))
    : query(logsCol, orderBy('timestamp', 'desc'), limit(200));

  unsubLogs = onSnapshot(q, snap => {
    const tbody = $('#logs-body');
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Sin registros</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const log  = d.data();
      const isOk = log.result === 'success';
      return `
        <tr>
          <td>${fmt(log.timestamp)}</td>
          <td>${esc(log.device_id || 'door_1')}</td>
          <td class="user-cell">${log.userName ? esc(log.userName) : '<span style="color:var(--text-3)">Desconocido</span>'}</td>
          <td><div class="chips">${verificationChips(log)}</div></td>
          <td><span class="badge ${isOk ? 'ok' : 'fail'}">${isOk ? '✓ Permitido' : '✗ Denegado'}</span></td>
        </tr>`;
    }).join('');
  }, err => console.error('Logs error:', err));
}


// USUARIOS

// Cache de miniaturas: userId -> { key, url }
const faceThumbs = new Map();

async function loadFaceThumb(userId, key) {
  const cached = faceThumbs.get(userId);
  if (cached && cached.key === key) return cached.url;
  try {
    const snap = await getDoc(faceDoc(userId));
    if (!snap.exists()) return null;
    const f = snap.data();
    const url = `data:${f.mime || 'image/jpeg'};base64,${f.image}`;
    faceThumbs.set(userId, { key, url });
    return url;
  } catch (e) {
    console.warn('Face thumb:', e.code || e);
    return null;
  }
}

function initUsers() {
  const q = query(usersCol, orderBy('createdAt', 'desc'));
  track(onSnapshot(q, snap => {
    const list  = $('#users-list');
    const count = $('#users-count');
    const withFace = snap.docs.filter(d => d.data().faceEnrolled).length;
    count.textContent = `${snap.size} usuario${snap.size !== 1 ? 's' : ''} · ${withFace} con rostro`;

    if (snap.empty) {
      list.innerHTML = `<div class="empty-state"><p>No hay usuarios registrados</p></div>`;
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const u = d.data();
      const hasFace = !!u.faceEnrolled;
      return `
        <div class="user-item" id="u-${d.id}">
          <div class="avatar ${hasFace ? 'has-face' : ''}" data-face-id="${hasFace ? d.id : ''}"
               data-face-key="${u.faceUpdatedAt?.toMillis?.() ?? ''}">${esc(initials(u.name))}</div>
          <div class="user-details">
            <div class="user-name">${esc(u.name)}</div>
            <div class="user-tags">
              <span class="user-role ${u.role === 'admin' ? 'admin' : 'user'}">${u.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
              <span class="chip ${hasFace ? 'ok' : 'warn'}">${hasFace ? 'PIN + Rostro' : 'Falta rostro'}</span>
            </div>
          </div>
          <button class="btn-ghost" data-action="face" data-id="${d.id}" data-name="${esc(u.name)}">
            ${hasFace ? 'Actualizar rostro' : 'Registrar rostro'}
          </button>
          <button class="btn-del" data-action="delete" data-id="${d.id}">Eliminar</button>
        </div>`;
    }).join('');

    // Miniaturas de rostro (carga perezosa desde faces/{id})
    list.querySelectorAll('.avatar[data-face-id]:not([data-face-id=""])').forEach(async el => {
      const url = await loadFaceThumb(el.dataset.faceId, el.dataset.faceKey);
      if (url && el.isConnected) el.innerHTML = `<img src="${url}" alt="">`;
    });
  }));
}

// Acciones de la lista de usuarios (delegación de eventos)
$('#users-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'delete') deleteUser(btn.dataset.id);
  if (btn.dataset.action === 'face')   enrollFace(btn.dataset.id, btn.dataset.name);
});

// Datos que se guardan en faces/{userId}
function faceDocData(face) {
  return {
    image:         face.base64,
    mime:          'image/jpeg',
    width:         face.width,
    height:        face.height,
    detectorScore: typeof face.score === 'number' ? Math.round(face.score * 1000) / 1000 : null,
    updatedAt:     serverTimestamp(),
    updatedBy:     auth.currentUser?.email || null,
  };
}


// ROSTRO DEL FORMULARIO DE ALTA

let pendingFace = null;

function renderPendingFace() {
  const thumb = $('#u-face-thumb');
  const hint  = $('#u-face-hint');
  if (pendingFace) {
    thumb.innerHTML = `<img src="${pendingFace.dataUrl}" alt="Rostro capturado">`;
    thumb.classList.add('has-face');
    hint.textContent = 'Rostro listo. Se guardará al crear el usuario.';
    hint.className = 'face-field-hint ok';
    $('#btn-face-capture').textContent = 'Volver a capturar';
    $('#btn-face-clear').hidden = false;
  } else {
    thumb.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="9" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    thumb.classList.remove('has-face');
    hint.textContent = 'Sin rostro: el usuario no podrá abrir la puerta hasta registrarlo.';
    hint.className = 'face-field-hint';
    $('#btn-face-capture').textContent = 'Capturar rostro';
    $('#btn-face-clear').hidden = true;
  }
}

$('#btn-face-capture').addEventListener('click', async () => {
  const name = $('#u-name').value.trim();
  const face = await openFaceCapture({ title: name ? `Rostro de ${name}` : 'Registrar rostro' });
  if (face) { pendingFace = face; renderPendingFace(); }
});

$('#btn-face-clear').addEventListener('click', () => { pendingFace = null; renderPendingFace(); });


// CREAR USUARIO

$('#btn-add').addEventListener('click', async () => {
  const name = $('#u-name').value.trim();
  const pin  = $('#u-pin').value.trim();
  const role = $('#u-role').value;
  const msg  = $('#form-msg');
  const btn  = $('#btn-add');

  if (!name) {
    msg.className = 'form-feedback err';
    msg.textContent = 'El nombre no puede estar vacío.';
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) {
    msg.className = 'form-feedback err';
    msg.textContent = 'El PIN debe tener entre 4 y 8 dígitos numéricos.';
    return;
  }
  if (!pendingFace && !confirm(
    'No capturaste el rostro.\n\nEl usuario se va a crear, pero no va a poder abrir la puerta ' +
    'hasta que le registres el rostro (validación doble PIN + rostro).\n\n¿Crear igual?')) {
    return;
  }

  btn.disabled = true;
  msg.className = 'form-feedback';
  msg.textContent = 'Guardando…';

  try {
    const pinHash = await sha256(pin);

    // El ESP32 identifica al usuario por el PIN → no puede haber dos usuarios con el mismo PIN
    const dup = await getDocs(query(usersCol, where('pin', '==', pinHash), limit(1)));
    if (!dup.empty) {
      msg.className = 'form-feedback err';
      msg.textContent = 'Ese PIN ya lo usa otro usuario. Elegí uno distinto.';
      return;
    }

    const userRef = doc(usersCol);           // genera el ID antes de escribir
    const batch   = writeBatch(db);
    batch.set(userRef, {
      name,
      pin:           pinHash,
      role,
      faceEnrolled:  !!pendingFace,
      faceUpdatedAt: pendingFace ? serverTimestamp() : null,
      createdAt:     serverTimestamp(),
    });
    if (pendingFace) batch.set(faceDoc(userRef.id), faceDocData(pendingFace));
    await batch.commit();

    msg.className = 'form-feedback ok';
    msg.textContent = `✓ Usuario "${name}" creado${pendingFace ? ' con rostro' : ' (sin rostro)'}.`;
    $('#u-name').value = '';
    $('#u-pin').value  = '';
    pendingFace = null;
    renderPendingFace();
  } catch (e) {
    msg.className = 'form-feedback err';
    msg.textContent = e.code === 'permission-denied'
      ? 'Sin permisos. Revisá que estén desplegadas las reglas de Firestore (firestore.rules).'
      : 'Error al crear el usuario.';
    console.error(e);
  } finally {
    btn.disabled = false;
  }
});


// REGISTRAR / ACTUALIZAR ROSTRO DE UN USUARIO EXISTENTE

async function enrollFace(id, name) {
  const face = await openFaceCapture({ title: `Rostro de ${name}` });
  if (!face) return;
  try {
    const batch = writeBatch(db);
    batch.set(faceDoc(id), faceDocData(face));
    batch.update(doc(db, 'users', id), { faceEnrolled: true, faceUpdatedAt: serverTimestamp() });
    await batch.commit();
    faceThumbs.delete(id);
  } catch (e) {
    console.error(e);
    alert(e.code === 'permission-denied'
      ? 'Sin permisos para guardar el rostro. ¿Desplegaste las nuevas reglas de Firestore?'
      : 'Error al guardar el rostro.');
  }
}


// ELIMINAR USUARIO

async function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
  try {
    // Borra el usuario y su rostro de referencia juntos
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', id));
    batch.delete(faceDoc(id));
    await batch.commit();
    faceThumbs.delete(id);
  } catch (e) {
    console.error(e);
    // Fallback: si las reglas nuevas no están desplegadas, al menos borrar el usuario
    try { await deleteDoc(doc(db, 'users', id)); }
    catch { alert('Error al eliminar el usuario.'); }
  }
}
window.deleteUser = deleteUser;


// MENÚ LATERAL RESPONSIVO (DRAWER EN CELULARES)
// Nota: Las funciones de apertura/cierre se definen de forma síncrona en index.html
// para estar disponibles inmediatamente. Aquí nos aseguramos de sincronizarlas.
function setMenuOpen(open) {
  if (typeof window.setMenuOpen === 'function') {
    window.setMenuOpen(open);
  } else {
    const sb = $('#sidebar');
    const bd = $('#sidebar-backdrop');
    if (sb) sb.classList.toggle('open', Boolean(open));
    if (bd) bd.classList.toggle('open', Boolean(open));
    document.body.classList.toggle('menu-open', Boolean(open));
  }
}

function openMobileMenu() {
  setMenuOpen(true);
}

function closeMobileMenu() {
  setMenuOpen(false);
}

function toggleMobileMenu() {
  const sb = $('#sidebar');
  const isOpen = sb ? sb.classList.contains('open') : false;
  setMenuOpen(!isOpen);
}

window.setMenuOpen = setMenuOpen;
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.toggleMobileMenu = toggleMobileMenu;


// NAVEGACIÓN

let activeFilter = 'all';

function switchView(view) {
  if (!view) return;
  $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`)?.classList.add('active');
  if (view === 'logs') loadLogs(activeFilter);
  setMenuOpen(false); // Cierra el menú al cambiar de sección en móviles
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchView = switchView;

$$('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(link.dataset.view);
  });
});

$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    loadLogs(activeFilter);
  });
});