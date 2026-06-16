const channelList = document.getElementById('channel-list');
const addModal = document.getElementById('add-modal');
const channelInput = document.getElementById('channel-input');
const addError = document.getElementById('add-error');
const countdownEl = document.getElementById('countdown');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');
const pinBtn = document.getElementById('pin-btn');

let alwaysOnTop = true;

let channels = [];
let lastInfos = [];
const REFRESH_INTERVAL = 30; // seconds
let countdown = REFRESH_INTERVAL;
let isRefreshing = false;

// --- helpers -------------------------------------------------------------

function extractChannelId(raw) {
  raw = raw.trim();
  const urlMatch = raw.match(/chzzk\.naver\.com\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]+$/.test(raw)) return raw;
  return null;
}

function formatViewers(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '만';
  return n.toLocaleString();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// chzzk returns KST strings like "2024-11-20 15:04:05" with no timezone.
// Parse them as KST (+09:00) so elapsed time is correct in any locale.
function parseKst(dateStr) {
  if (!dateStr) return null;
  const iso = dateStr.replace(' ', 'T') + '+09:00';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function formatDurationFrom(ms) {
  if (ms == null) return '';
  let seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function formatAgo(ms) {
  if (ms == null) return '';
  let seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const days = Math.floor(h / 24);
  if (days > 0) return `${days}일 전`;
  if (h > 0) return `${h}시간 전`;
  if (m > 0) return `${m}분 전`;
  return '방금';
}

// Recompute the live-duration / ended-ago text for a single card from the
// timestamps stored on it. Called every second so the live timer ticks.
function refreshDurationText(card) {
  const durEl = card.querySelector('.channel-duration');
  if (!durEl) return;
  const isLive = card.dataset.live === '1';
  if (isLive) {
    const open = card.dataset.openDate ? Number(card.dataset.openDate) : null;
    durEl.textContent = open != null ? `🔴 ${formatDurationFrom(open)} 방송 중` : '';
  } else {
    const close = card.dataset.closeDate ? Number(card.dataset.closeDate) : null;
    durEl.textContent = close != null ? `${formatAgo(close)} 종료` : '';
  }
}

function refreshAllDurations() {
  document.querySelectorAll('.channel-card').forEach(refreshDurationText);
}

// --- rendering -----------------------------------------------------------

function renderChannels(infos) {
  lastInfos = infos;
  channelList.innerHTML = '';

  if (infos.length === 0) {
    channelList.innerHTML = `
      <div class="empty-state">
        <div>채널이 없습니다</div>
        <div class="hint">상단 + 버튼으로 채널을 추가하세요</div>
      </div>`;
    return;
  }

  for (const info of infos) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.draggable = true;
    card.dataset.channelId = info.channelId;

    const openMs = parseKst(info.openDate);
    const closeMs = parseKst(info.closeDate);
    card.dataset.live = info.isLive ? '1' : '0';
    if (openMs != null) card.dataset.openDate = String(openMs);
    if (closeMs != null) card.dataset.closeDate = String(closeMs);

    let avatarHtml;
    if (info.channelImageUrl) {
      avatarHtml = `<img class="channel-avatar" src="${info.channelImageUrl}" alt="" onerror="this.style.display='none'">`;
    } else {
      const initial = (info.channelName || info.channelId)[0].toUpperCase();
      avatarHtml = `<div class="channel-avatar-placeholder">${initial}</div>`;
    }

    if (info.error) {
      card.innerHTML = `
        ${avatarHtml}
        <div class="channel-info">
          <div class="channel-header">
            <span class="channel-name">${escapeHtml(info.channelId)}</span>
          </div>
          <div class="channel-error">불러오기 실패</div>
        </div>
        <button class="remove-btn" data-id="${escapeHtml(info.channelId)}">×</button>`;
    } else {
      const liveBadge = info.isLive ? '<span class="live-badge">LIVE</span>' : '';
      const title = info.isLive
        ? `<div class="channel-title">${escapeHtml(info.liveTitle)}</div>`
        : '<div class="channel-title" style="opacity:0.4">오프라인</div>';
      const meta = info.isLive
        ? `<div class="channel-meta">
            <span class="viewer-count">👥 ${formatViewers(info.concurrentUserCount)}</span>
            ${info.liveCategoryValue ? `<span>${escapeHtml(info.liveCategoryValue)}</span>` : ''}
           </div>`
        : '';

      card.innerHTML = `
        ${avatarHtml}
        <div class="channel-info">
          <div class="channel-header">
            <span class="channel-name">${escapeHtml(info.channelName)}</span>
            ${liveBadge}
          </div>
          ${title}
          ${meta}
          <div class="channel-duration ${info.isLive ? 'is-live' : ''}"></div>
        </div>
        <button class="remove-btn" data-id="${escapeHtml(info.channelId)}">×</button>`;
    }

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-btn')) return;
      window.chzzk.openChannel(info.channelId);
    });

    attachDragHandlers(card);
    channelList.appendChild(card);
    refreshDurationText(card);
  }

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeChannel(btn.dataset.id);
    });
  });
}

// --- drag-and-drop reordering -------------------------------------------

let dragSrcId = null;

function attachDragHandlers(card) {
  card.addEventListener('dragstart', (e) => {
    dragSrcId = card.dataset.channelId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.channel-card.drag-over')
      .forEach(c => c.classList.remove('drag-over'));
    dragSrcId = null;
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (card.dataset.channelId !== dragSrcId) card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    const targetId = card.dataset.channelId;
    if (!dragSrcId || dragSrcId === targetId) return;
    await reorderChannels(dragSrcId, targetId);
  });
}

async function reorderChannels(srcId, targetId) {
  const from = channels.indexOf(srcId);
  const to = channels.indexOf(targetId);
  if (from === -1 || to === -1) return;
  channels.splice(from, 1);
  channels.splice(to, 0, srcId);
  await window.chzzk.saveChannels(channels);
  // Reorder the already-fetched infos to match, then re-render without refetch.
  const byId = Object.fromEntries(lastInfos.map(i => [i.channelId, i]));
  renderChannels(channels.map(id => byId[id]).filter(Boolean));
}

// --- data + refresh loop -------------------------------------------------

async function loadAndRender() {
  if (channels.length === 0) {
    renderChannels([]);
    return;
  }
  const infos = await window.chzzk.fetchAllChannels(channels);
  // Keep render order aligned with the persisted channel order.
  const byId = Object.fromEntries(infos.map(i => [i.channelId, i]));
  renderChannels(channels.map(id => byId[id]).filter(Boolean));
}

async function refreshNow() {
  if (isRefreshing) return;
  isRefreshing = true;
  countdownEl.classList.add('refreshing');
  try {
    await loadAndRender();
  } finally {
    isRefreshing = false;
    countdownEl.classList.remove('refreshing');
    countdown = REFRESH_INTERVAL;
    updateCountdownDisplay();
  }
}

async function removeChannel(channelId) {
  channels = channels.filter(id => id !== channelId);
  await window.chzzk.saveChannels(channels);
  await loadAndRender();
}

function updateCountdownDisplay() {
  countdownEl.textContent = `${countdown}s`;
}

// One master 1-second tick drives both the live-duration timers and the
// auto-refresh countdown.
function startTick() {
  setInterval(() => {
    refreshAllDurations();
    countdown -= 1;
    if (countdown <= 0) {
      refreshNow();
    } else {
      updateCountdownDisplay();
    }
  }, 1000);
}

// --- add channel modal ---------------------------------------------------

document.getElementById('add-btn').addEventListener('click', () => {
  addError.classList.add('hidden');
  channelInput.value = '';
  addModal.classList.remove('hidden');
  setTimeout(() => channelInput.focus(), 50);
});

document.getElementById('add-cancel-btn').addEventListener('click', () => {
  addModal.classList.add('hidden');
});

async function confirmAdd() {
  const id = extractChannelId(channelInput.value);
  if (!id) {
    addError.textContent = '올바른 채널 ID 또는 URL을 입력하세요.';
    addError.classList.remove('hidden');
    return;
  }
  if (channels.includes(id)) {
    addError.textContent = '이미 추가된 채널입니다.';
    addError.classList.remove('hidden');
    return;
  }

  const confirmBtn = document.getElementById('add-confirm-btn');
  addError.classList.add('hidden');
  confirmBtn.textContent = '확인 중...';
  confirmBtn.disabled = true;

  const info = await window.chzzk.fetchChannelInfo(id);
  confirmBtn.textContent = '추가';
  confirmBtn.disabled = false;

  if (info.error) {
    addError.textContent = `채널을 찾을 수 없습니다: ${info.error}`;
    addError.classList.remove('hidden');
    return;
  }

  channels.push(id);
  await window.chzzk.saveChannels(channels);
  addModal.classList.add('hidden');
  await refreshNow();
}

document.getElementById('add-confirm-btn').addEventListener('click', confirmAdd);

channelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmAdd();
  if (e.key === 'Escape') addModal.classList.add('hidden');
});

// --- titlebar + opacity --------------------------------------------------

document.getElementById('refresh-btn').addEventListener('click', refreshNow);
document.getElementById('close-btn').addEventListener('click', () => window.chzzk.closeApp());
document.getElementById('minimize-btn').addEventListener('click', () => window.chzzk.minimizeApp());

opacitySlider.addEventListener('input', () => {
  const pct = Number(opacitySlider.value);
  opacityValue.textContent = `${pct}%`;
  window.chzzk.setOpacity(pct / 100);
});

function applyPinState() {
  pinBtn.classList.toggle('active', alwaysOnTop);
  pinBtn.title = alwaysOnTop ? '항상 위에 고정됨 (클릭하여 해제)' : '항상 위에 고정 안 됨 (클릭하여 고정)';
}

pinBtn.addEventListener('click', async () => {
  alwaysOnTop = await window.chzzk.setAlwaysOnTop(!alwaysOnTop);
  applyPinState();
});

// --- init ----------------------------------------------------------------

async function init() {
  const settings = await window.chzzk.getSettings();
  const pct = Math.round((settings.opacity ?? 1) * 100);
  opacitySlider.value = String(pct);
  opacityValue.textContent = `${pct}%`;

  alwaysOnTop = settings.alwaysOnTop ?? true;
  applyPinState();

  channels = await window.chzzk.getChannels();
  updateCountdownDisplay();
  await refreshNow();
  startTick();
}

init();
