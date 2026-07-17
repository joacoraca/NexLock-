
// NexLock, mi app.js. La animacion y el control del front al backend de Firebase.
// Firebase Auth + Firestore directo
// PIN hasheado con SHA-256


import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

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

const logsCol  = collection(db, 'logs');
const usersCol = collection(db, 'users');

// ── SHA-256 
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helpers
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function fmt(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function setConnected(ok) {
  $('#status-dot').className = 'status-dot ' + (ok ? 'on' : 'off');
  $('#status-text').textContent = ok ? 'Conectado' : 'Sin conexión';
}

// Reloj 
setInterval(() => {
  $('#clock').textContent = new Date().toLocaleString('es-AR', { hour12: false });
}, 1000);


// AUTH — pantalla de login


// Escucha cambios de sesión | muestra login o app según estado
onAuthStateChanged(auth, user => {
  if (user) {
    // Logeado: mostrar app, ocultar login
    $('#login-screen').style.display  = 'none';
    $('#app-screen').style.display    = 'flex';
    $('#user-email').textContent      = user.email;
    initDashboard();
    initUsers();
  } else {
    // No logeado: mostrar login, ocultar app
    $('#login-screen').style.display  = 'flex';
    $('#app-screen').style.display    = 'none';
  }
});

// Formulario de login
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const errEl    = $('#login-error');

  errEl.textContent = '';
  $('#btn-login').textContent = 'Ingresando…';
  $('#btn-login').disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged se encarga del resto
  } catch (err) {
    errEl.textContent = 'Email o contraseña incorrectos.';
    $('#btn-login').textContent = 'Ingresar';
    $('#btn-login').disabled = false;
  }
});

// Cerrar sesión
$('#btn-logout').addEventListener('click', async () => {
  await signOut(auth);
});


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

  onSnapshot(q, snap => {
    setConnected(true);
    loadStats();

    const feedEl = $('#feed-list');
    if (snap.empty) {
      feedEl.innerHTML = `
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="14" stroke="#CBD5E1" stroke-width="2"/>
            <path d="M18 12v6l4 4" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/>
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
            <div class="feed-user">${log.userName || 'PIN incorrecto'}</div>
            <div class="feed-meta">${log.device_id || 'door_1'}</div>
          </div>
          <span class="badge ${isOk ? 'ok' : 'fail'}">${isOk ? 'Permitido' : 'Denegado'}</span>
          <span class="feed-time">${fmt(log.timestamp)}</span>
        </div>`;
    }).join('');
  }, () => setConnected(false));
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
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Sin registros</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const log  = d.data();
      const isOk = log.result === 'success';
      return `
        <tr>
          <td>${fmt(log.timestamp)}</td>
          <td>${log.device_id || 'door_1'}</td>
          <td class="user-cell">${log.userName || '<span style="color:var(--text-3)">Desconocido</span>'}</td>
          <td><span class="badge ${isOk ? 'ok' : 'fail'}">${isOk ? '✓ Permitido' : '✗ Denegado'}</span></td>
        </tr>`;
    }).join('');
  });
}


// USUARIOS

function initUsers() {
  const q = query(usersCol, orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    const list  = $('#users-list');
    const count = $('#users-count');
    count.textContent = `${snap.size} usuario${snap.size !== 1 ? 's' : ''}`;

    if (snap.empty) {
      list.innerHTML = `<div class="empty-state"><p>No hay usuarios registrados</p></div>`;
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const u = d.data();
      return `
        <div class="user-item" id="u-${d.id}">
          <div class="avatar">${initials(u.name)}</div>
          <div class="user-details">
            <div class="user-name">${u.name}</div>
            <span class="user-role ${u.role}">${u.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
          </div>
          <button class="btn-del" onclick="deleteUser('${d.id}')">Eliminar</button>
        </div>`;
    }).join('');
  });
}


// CREAR USUARIO

$('#btn-add').addEventListener('click', async () => {
  const name = $('#u-name').value.trim();
  const pin  = $('#u-pin').value.trim();
  const role = $('#u-role').value;
  const msg  = $('#form-msg');

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

  try {
    const pinHash = await sha256(pin);
    await addDoc(usersCol, {
      name,
      pin:       pinHash,
      role,
      createdAt: serverTimestamp(),
    });
    msg.className = 'form-feedback ok';
    msg.textContent = `✓ Usuario "${name}" creado correctamente.`;
    $('#u-name').value = '';
    $('#u-pin').value  = '';
  } catch (e) {
    msg.className = 'form-feedback err';
    msg.textContent = 'Error al crear el usuario.';
    console.error(e);
  }
});


// ELIMINAR USUARIO

async function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
  try {
    await deleteDoc(doc(db, 'users', id));
  } catch {
    alert('Error al eliminar el usuario.');
  }
}
window.deleteUser = deleteUser;


// NAVEGACIÓN

let activeFilter = 'all';

$$('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    const view = link.dataset.view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');
    if (view === 'logs') loadLogs(activeFilter);
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