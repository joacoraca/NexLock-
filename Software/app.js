/* ══════════════════════════════════════════
   NexLock — app.js
   ══════════════════════════════════════════ */

const API = '/api';
let activeFilter = '';

// ── Helpers ───────────────────────────────
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function fmt(dateStr) {
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

// ── Reloj ─────────────────────────────────
function startClock() {
  const el = $('#clock');
  setInterval(() => {
    el.textContent = new Date().toLocaleString('es-AR', { hour12: false });
  }, 1000);
}

// ── Conexión ──────────────────────────────
function setConnected(ok) {
  const dot = $('#status-dot');
  const txt = $('#status-text');
  dot.className = 'status-dot ' + (ok ? 'on' : 'off');
  txt.textContent = ok ? 'Conectado' : 'Sin conexión';
}

// ── Stats ─────────────────────────────────
async function loadStats() {
  try {
    const d = await fetch(`${API}/stats`).then(r => r.json());
    $('#s-total').textContent = d.total ?? '—';
    $('#s-ok').textContent    = d.success ?? '—';
    $('#s-fail').textContent  = d.fail ?? '—';

    const rate = d.total > 0
      ? Math.round((d.success / d.total) * 100) + '%'
      : '—';
    $('#s-rate').textContent = rate;

    setConnected(true);
  } catch {
    setConnected(false);
  }
}

// ── Feed (dashboard) ──────────────────────
let lastId = null;

async function loadFeed() {
  try {
    const logs = await fetch(`${API}/logs?limit=15`).then(r => r.json());
    const container = $('#feed-list');

    if (!logs.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="14" stroke="#CBD5E1" stroke-width="2"/>
            <path d="M18 12v6l4 4" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>Sin actividad todavía</p>
        </div>`;
      return;
    }

    // Evitar re-render si no hay datos nuevos
    if (lastId === logs[0]._id) return;
    lastId = logs[0]._id;

    container.innerHTML = logs.map(log => {
      const ok    = log.result === 'success';
      const user  = log.user?.name || 'PIN incorrecto';
      const icon  = ok
        ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

      return `
        <div class="feed-item">
          <div class="feed-icon ${ok ? 'ok' : 'fail'}">${icon}</div>
          <div class="feed-info">
            <div class="feed-user">${user}</div>
            <div class="feed-meta">${log.device_id || 'door_1'}</div>
          </div>
          <span class="badge ${ok ? 'ok' : 'fail'}">${ok ? 'Permitido' : 'Denegado'}</span>
          <span class="feed-time">${fmt(log.timestamp)}</span>
        </div>`;
    }).join('');

    $('#feed-count').textContent = `${logs.length} registros`;
    loadStats();
    setConnected(true);
  } catch {
    setConnected(false);
  }
}

// ── Historial ─────────────────────────────
async function loadLogs(filter = '') {
  const url = filter
    ? `${API}/logs?filter=${filter}&limit=200`
    : `${API}/logs?limit=200`;

  try {
    const logs = await fetch(url).then(r => r.json());
    const tbody = $('#logs-body');

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Sin registros</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const ok = log.result === 'success';
      return `
        <tr>
          <td>${fmt(log.timestamp)}</td>
          <td>${log.device_id || 'door_1'}</td>
          <td class="user-cell">${log.user?.name || '<span style="color:var(--text-3)">Desconocido</span>'}</td>
          <td><span class="badge ${ok ? 'ok' : 'fail'}">${ok ? '✓ Permitido' : '✗ Denegado'}</span></td>
        </tr>`;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}

// ── Usuarios ──────────────────────────────
async function loadUsers() {
  try {
    const users = await fetch(`${API}/users`).then(r => r.json());
    const list  = $('#users-list');
    const count = $('#users-count');

    count.textContent = `${users.length} usuario${users.length !== 1 ? 's' : ''}`;

    if (!users.length) {
      list.innerHTML = `<div class="empty-state"><p>No hay usuarios registrados</p></div>`;
      return;
    }

    list.innerHTML = users.map(u => `
      <div class="user-item" id="u-${u._id}">
        <div class="avatar">${initials(u.name)}</div>
        <div class="user-details">
          <div class="user-name">${u.name}</div>
          <span class="user-role ${u.role}">${u.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
        </div>
        <button class="btn-del" onclick="deleteUser('${u._id}')">Eliminar</button>
      </div>`).join('');
  } catch (e) {
    console.error(e);
  }
}

async function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
  try {
    const r = await fetch(`${API}/users/${id}`, { method: 'DELETE' });
    if (r.ok) {
      document.getElementById(`u-${id}`)?.remove();
      loadUsers(); // refrescar contador
    } else {
      alert('No se pudo eliminar el usuario.');
    }
  } catch { alert('Error de conexión.'); }
}
window.deleteUser = deleteUser;

// ── Crear usuario ─────────────────────────
$('#btn-add').addEventListener('click', async () => {
  const name = $('#u-name').value.trim();
  const pin  = $('#u-pin').value.trim();
  const role = $('#u-role').value;
  const msg  = $('#form-msg');

  // Validaciones en el cliente
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
    const r = await fetch(`${API}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin, role }),
    });

    if (r.ok) {
      msg.className = 'form-feedback ok';
      msg.textContent = `✓ Usuario "${name}" creado correctamente.`;
      $('#u-name').value = '';
      $('#u-pin').value  = '';
      loadUsers();
    } else {
      const e = await r.json();
      msg.className = 'form-feedback err';
      msg.textContent = e.error || 'No se pudo crear el usuario.';
    }
  } catch {
    msg.className = 'form-feedback err';
    msg.textContent = 'Error de conexión con el servidor.';
  }
});

// ── Navegación ────────────────────────────
$$('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    const view = link.dataset.view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');

    if (view === 'logs')  loadLogs(activeFilter);
    if (view === 'users') loadUsers();
  });
});

// Filtros de historial
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    loadLogs(activeFilter);
  });
});

// ── Init ──────────────────────────────────
startClock();
loadStats();
loadFeed();
setInterval(loadFeed, 5000); // auto-refresh cada 5 segundos
