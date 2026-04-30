/**
 * app.js — NexLock Dashboard (Vanilla JS)
 */

const API = '/api';
let currentFilter = '';
let lastFeedId = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ── Helpers ──────────────────────────────────────────

function fmtDate(d) {
  return new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const REASON_MAP = {
  ok: 'PIN correcto', invalid_pin: 'PIN inválido',
  low_light: 'Luz insuficiente', face_required: 'Requiere rostro',
};

function reasonText(r) { return REASON_MAP[r] || r; }

function resultBadge(result, reason) {
  if (result === 'success') return '<span class="badge badge-ok">✓ OK</span>';
  if (reason === 'low_light') return '<span class="badge badge-warn">Luz baja</span>';
  return '<span class="badge badge-fail">Denegado</span>';
}

function lightCell(lvl) {
  return lvl === 'low'
    ? '<span class="light-icon" title="Luz baja">🌙</span>'
    : '<span class="light-icon" title="Luz normal">☀️</span>';
}

function imgBtn(log) {
  if (!log.image_path) return '<button class="btn-img" disabled>—</button>';
  return `<button class="btn-img" onclick="openModal('${log._id}')">Ver foto</button>`;
}

// ── Reloj ─────────────────────────────────────────────

function startClock() {
  function tick() {
    const now = new Date();
    $('#header-time').textContent =
      now.toLocaleDateString('es-AR') + ' · ' + now.toLocaleTimeString('es-AR', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ── Estado de conexión ────────────────────────────────

function setOnline(ok) {
  const dot = $('#status-dot');
  const lbl = $('#status-label');
  dot.className = 'status-dot ' + (ok ? 'online' : 'offline');
  lbl.textContent = ok ? 'En línea' : 'Sin conexión';
}

// ── Stats ─────────────────────────────────────────────

async function loadStats() {
  try {
    const r = await fetch(`${API}/stats`);
    const d = await r.json();
    $('#stat-total-val').textContent = d.total   ?? '—';
    $('#stat-ok-val').textContent    = d.success ?? '—';
    $('#stat-fail-val').textContent  = d.fail    ?? '—';
    $('#stat-light-val').textContent = d.lowLight ?? '—';
    setOnline(true);
  } catch { setOnline(false); }
}

// ── Live feed ─────────────────────────────────────────

async function loadFeed() {
  try {
    const r = await fetch(`${API}/logs?limit=20`);
    const logs = await r.json();
    const feed = $('#live-feed');

    if (!logs.length) {
      feed.innerHTML = '<p class="empty-msg">Sin eventos aún</p>';
      return;
    }

    // Evitar re-render innecesario
    if (lastFeedId === logs[0]?._id) return;
    lastFeedId = logs[0]?._id;

    feed.innerHTML = logs.map(log => `
      <div class="feed-row ${log.result}">
        <span class="feed-time">${fmtDate(log.timestamp)}</span>
        <span class="feed-device">${log.device_id || '—'}</span>
        <span class="feed-user">${log.user?.name || '<span style="color:var(--gray-500)">Desconocido</span>'}</span>
        <span class="feed-reason">${reasonText(log.reason)}</span>
        ${resultBadge(log.result, log.reason)}
      </div>
    `).join('');

    loadStats();
    setOnline(true);
  } catch { setOnline(false); }
}

// ── Historial ─────────────────────────────────────────

async function loadLogs(filter = '') {
  const url = filter
    ? `${API}/logs?filter=${filter}&limit=200`
    : `${API}/logs?limit=200`;

  try {
    const r = await fetch(url);
    const logs = await r.json();
    const tbody = $('#logs-tbody');

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Sin registros</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td style="font-family:var(--mono);font-size:12px;color:var(--gray-500)">${fmtDate(log.timestamp)}</td>
        <td style="font-weight:500;color:var(--blue-500)">${log.device_id || '—'}</td>
        <td>${log.user?.name || '<span style="color:var(--gray-500)">—</span>'}</td>
        <td>${resultBadge(log.result, log.reason)}</td>
        <td style="font-size:12px;color:var(--gray-500)">${reasonText(log.reason)}</td>
        <td>${lightCell(log.light_level)}</td>
        <td>${imgBtn(log)}</td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

// ── Modal ─────────────────────────────────────────────

async function openModal(logId) {
  try {
    const r = await fetch(`${API}/logs/${logId}`);
    const log = await r.json();

    $('#modal-title').textContent = `Captura · ${fmtDate(log.timestamp)}`;
    const img = $('#modal-img');
    img.src = log.image_path || '';
    img.style.display = log.image_path ? 'block' : 'none';

    $('#modal-meta').innerHTML = [
      ['Dispositivo', log.device_id || '—'],
      ['Usuario',     log.user?.name || 'Desconocido'],
      ['Resultado',   log.result === 'success' ? '✓ Acceso permitido' : '✗ Denegado'],
      ['Razón',       reasonText(log.reason)],
      ['Condición',   log.light_level === 'low' ? '🌙 Luz baja' : '☀️ Normal'],
    ].map(([k, v]) => `
      <div class="meta-row">
        <span class="meta-key">${k}</span>
        <span class="meta-val">${v}</span>
      </div>
    `).join('');

    $('#modal').style.display = 'flex';
  } catch (e) { console.error(e); }
}

window.openModal = openModal;

$('#modal-close').addEventListener('click', () => { $('#modal').style.display = 'none'; });
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) $('#modal').style.display = 'none'; });

// ── Usuarios ──────────────────────────────────────────

async function loadUsers() {
  try {
    const r = await fetch(`${API}/users`);
    const users = await r.json();
    const list = $('#users-list');

    if (!users.length) {
      list.innerHTML = '<p class="empty-msg">Sin usuarios registrados</p>';
      return;
    }

    list.innerHTML = users.map(u => `
      <div class="user-row" id="usr-${u._id}">
        <div class="user-avatar">${initials(u.name)}</div>
        <div class="user-info">
          <p class="user-name">${u.name}</p>
          <p class="user-meta">
            <span class="badge ${u.role === 'admin' ? 'badge-blue' : ''}" style="font-size:10px;padding:1px 7px">${u.role}</span>
            &nbsp;··· ${u._id.slice(-6)}
          </p>
        </div>
        <button class="btn-del" onclick="deleteUser('${u._id}')">Eliminar</button>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  try {
    const r = await fetch(`${API}/users/${id}`, { method: 'DELETE' });
    if (r.ok) document.getElementById(`usr-${id}`)?.remove();
    else alert('Error al eliminar');
  } catch (e) { console.error(e); }
}
window.deleteUser = deleteUser;

$('#btn-create-user').addEventListener('click', async () => {
  const name = $('#user-name').value.trim();
  const pin  = $('#user-pin').value.trim();
  const role = $('#user-role').value;
  const msg  = $('#form-msg');

  if (!name || !pin) {
    msg.className = 'form-msg err';
    msg.textContent = 'Nombre y PIN son requeridos';
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) {
    msg.className = 'form-msg err';
    msg.textContent = 'El PIN debe ser 4–8 dígitos numéricos';
    return;
  }

  try {
    const r = await fetch(`${API}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin, role }),
    });

    if (r.ok) {
      msg.className = 'form-msg ok';
      msg.textContent = `Usuario "${name}" creado correctamente`;
      $('#user-name').value = '';
      $('#user-pin').value  = '';
      loadUsers();
    } else {
      const e = await r.json();
      msg.className = 'form-msg err';
      msg.textContent = e.error || 'Error al crear usuario';
    }
  } catch {
    msg.className = 'form-msg err';
    msg.textContent = 'Error de conexión';
  }
});

// ── Navegación ────────────────────────────────────────

$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');
    if (view === 'logs')  loadLogs(currentFilter);
    if (view === 'users') loadUsers();
  });
});

$$('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    loadLogs(currentFilter);
  });
});

// ── Init ──────────────────────────────────────────────

startClock();
loadStats();
loadFeed();
setInterval(loadFeed, 5000);
