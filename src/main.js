const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const CHANNELS_PATH = path.join(app.getPath('userData'), 'channels.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = { opacity: 1, alwaysOnTop: true };

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

function loadChannels() {
  const data = loadJson(CHANNELS_PATH, []);
  return Array.isArray(data) ? data : [];
}

function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...loadJson(SETTINGS_PATH, {}) };
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchChannelInfo(channelId) {
  try {
    const [channelRes, detailRes] = await Promise.all([
      httpsGet(`https://api.chzzk.naver.com/service/v1/channels/${channelId}`),
      httpsGet(`https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`),
    ]);

    const ch = channelRes?.content ?? {};
    const detail = detailRes?.content ?? {};
    // live-detail nests a channel object that is populated even when the
    // top-level channels endpoint is sparse.
    const detailCh = detail.channel ?? {};

    const isLive = detail.status === 'OPEN';

    return {
      channelId,
      channelName: ch.channelName ?? detailCh.channelName ?? channelId,
      channelImageUrl: ch.channelImageUrl ?? detailCh.channelImageUrl ?? null,
      followerCount: ch.followerCount ?? 0,
      isLive,
      liveTitle: detail.liveTitle ?? '',
      concurrentUserCount: detail.concurrentUserCount ?? 0,
      categoryType: detail.categoryType ?? '',
      liveCategoryValue: detail.liveCategoryValue ?? '',
      // KST date strings like "2024-11-20 15:04:05" (or null).
      openDate: detail.openDate ?? null,
      closeDate: detail.closeDate ?? null,
    };
  } catch (err) {
    return { channelId, error: err.message };
  }
}

let win;

function createWindow() {
  const settings = loadSettings();

  win = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 300,
    minHeight: 200,
    alwaysOnTop: settings.alwaysOnTop,
    frame: false,
    transparent: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.setOpacity(settings.opacity);
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-channels', () => loadChannels());

ipcMain.handle('save-channels', (_e, channels) => {
  saveJson(CHANNELS_PATH, channels);
});

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('set-opacity', (_e, opacity) => {
  const clamped = Math.min(1, Math.max(0.2, Number(opacity) || 1));
  const settings = loadSettings();
  settings.opacity = clamped;
  saveJson(SETTINGS_PATH, settings);
  if (win) win.setOpacity(clamped);
});

ipcMain.handle('set-always-on-top', (_e, value) => {
  const enabled = Boolean(value);
  const settings = loadSettings();
  settings.alwaysOnTop = enabled;
  saveJson(SETTINGS_PATH, settings);
  if (win) win.setAlwaysOnTop(enabled);
  return enabled;
});

ipcMain.handle('fetch-channel-info', async (_e, channelId) => {
  return fetchChannelInfo(channelId);
});

ipcMain.handle('fetch-all-channels', async (_e, channelIds) => {
  return Promise.all(channelIds.map(fetchChannelInfo));
});

ipcMain.handle('open-channel', (_e, channelId) => {
  shell.openExternal(`https://chzzk.naver.com/${channelId}`);
});

ipcMain.on('close-app', () => app.quit());
ipcMain.on('minimize-app', () => win.minimize());
