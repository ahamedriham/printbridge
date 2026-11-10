'use strict';
const { app, Tray, Menu, nativeImage, dialog, shell, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const config = require('./core/config');
const log = require('./core/log');
const server = require('./server/server');
const printers = require('./printing/printers');
const PKG = require('../package.json');

const APP_NAME = PKG.productName || 'PrintBridge';
let tray = null;
let settingsWin = null;

// Only one instance may own the ports.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(boot).catch((e) => {
    console.error(e);
    app.quit();
  });
}

async function boot() {
  const cfg = config.load();
  log.init(cfg.logLevel);
  log.info(`${APP_NAME} ${PKG.version} starting (${process.platform})`);

  // Keep running when all windows are closed; we live in the tray.
  app.on('window-all-closed', () => {});

  if (cfg.autoLaunch && app.isPackaged) {
    try {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    } catch (e) {
      log.warn('autoLaunch failed', e);
    }
  }

  createTray();
  wireIpc();

  server.setPromptHandler(promptOrigin);
  server.on('status', updateTray);
  try {
    await server.start();
  } catch (e) {
    log.error('Server failed to start', e);
    dialog.showErrorBox(APP_NAME, `Could not start: ${e.message}\n\nIs another copy of ${APP_NAME} (or QZ Tray) already using port ${cfg.wsPort}/${cfg.wssPort}?`);
  }
  updateTray();
}

function iconPath() {
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, '..', 'assets', name);
}

function createTray() {
  let img = nativeImage.createFromPath(iconPath());
  if (process.platform !== 'win32') img = img.resize({ width: 22, height: 22 });
  tray = new Tray(img);
  tray.setToolTip(APP_NAME);
  tray.on('double-click', openSettings);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const cfg = config.get();
  const st = server.status();
  const menu = Menu.buildFromTemplate([
    { label: `${APP_NAME} ${PKG.version}`, enabled: false },
    { label: st.running ? `Listening: ws://localhost:${cfg.wsPort}${cfg.enableWss ? `  wss://localhost:${cfg.wssPort}` : ''}` : 'Not running', enabled: false },
    { label: `Connected clients: ${st.clients}`, enabled: false },
    { type: 'separator' },
    { label: 'Allowed sites / Settings…', click: openSettings },
    { label: 'Test print…', click: testPrint },
    { label: 'Open log', click: () => shell.openPath(log.path()) },
    { label: 'Open config folder', click: () => shell.openPath(path.dirname(config.configPath())) },
    { type: 'separator' },
    {
      label: 'Start with system',
      type: 'checkbox',
      checked: !!cfg.autoLaunch,
      click: (item) => {
        config.set({ autoLaunch: item.checked });
        if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
      },
    },
    { label: 'Restart server', click: async () => { await server.stop(); await server.start(); updateTray(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { server.stop(); app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// Ask the user whether an unknown origin may use the bridge. Mirrors the QZ
// Tray dialog but keyed on the page origin instead of a signed certificate.
async function promptOrigin(origin) {
  const r = await dialog.showMessageBox({
    type: 'question',
    title: `${APP_NAME} – Allow website?`,
    message: `${origin} wants to access your printers and devices.`,
    detail: 'Only allow sites you trust. An allowed site can print silently without asking again.',
    buttons: ['Allow once', 'Allow always', 'Block once', 'Block always'],
    defaultId: 1,
    cancelId: 2,
    noLink: true,
  });
  switch (r.response) {
    case 0: return 'allow';
    case 1: config.allowOrigin(origin); return 'allow';
    case 3: config.blockOrigin(origin); return 'deny';
    default: return 'deny';
  }
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 520,
    title: `${APP_NAME} settings`,
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'ui', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function wireIpc() {
  ipcMain.handle('config:get', () => ({ ...config.get(), status: server.status(), logPath: log.path(), version: PKG.version, appName: APP_NAME }));
  ipcMain.handle('config:set', (_e, patch) => { config.set(patch); updateTray(); return config.get(); });
  ipcMain.handle('origin:remove', (_e, o) => { config.removeOrigin(o); updateTray(); return config.get(); });
  ipcMain.handle('origin:allow', (_e, o) => { config.allowOrigin(o); updateTray(); return config.get(); });
  ipcMain.handle('origin:block', (_e, o) => { config.blockOrigin(o); updateTray(); return config.get(); });
  ipcMain.handle('printers:list', () => printers.list());
  ipcMain.handle('server:restart', async () => { await server.stop(); await server.start(); updateTray(); return server.status(); });
  ipcMain.handle('test:print', (_e, printer) => testPrintTo(printer));
}

async function testPrint() {
  const list = await printers.list();
  if (!list.length) { dialog.showErrorBox(APP_NAME, 'No printers found.'); return; }
  const r = await dialog.showMessageBox({
    type: 'question', title: 'Test print', message: 'Print a test page to which printer?',
    buttons: [...list.map((p) => p.name), 'Cancel'], cancelId: list.length, noLink: true,
  });
  if (r.response < list.length) await testPrintTo(list[r.response].name);
}

async function testPrintTo(printer) {
  const pixel = require('./printing/pixel');
  try {
    await pixel.printHtml({ printer }, `<h2 style="font-family:sans-serif">${APP_NAME} test page</h2><p>${new Date().toLocaleString()}<br>Printer: ${printer}</p>`);
    new Notification({ title: APP_NAME, body: `Test page sent to ${printer}` }).show();
  } catch (e) {
    dialog.showErrorBox(APP_NAME, `Test print failed: ${e.message}`);
  }
}
