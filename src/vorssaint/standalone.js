'use strict';

/**
 * Vorssaint OS — Standalone Desktop Runner (macOS, Windows, Linux)
 * 100% Independent Process running the Authentic MenuPanel, Dynamic Island & Features Hub
 * Upstream: https://github.com/vorssaint/vorssaint-utils.git
 */

const { app, BrowserWindow, screen, Tray, Menu, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { getVorssaintManager } = require('../main/vorssaint/vorssaint_manager');

let islandWindow = null;
let hubWindow = null;
let menuPanelWindow = null;
let cleaningWindow = null;
let commandBarWindow = null;
let tray = null;

const RENDERER = path.join(__dirname, '..', 'renderer');
const vorssaintManager = getVorssaintManager();

function createIslandWindow() {
  if (islandWindow && !islandWindow.isDestroyed()) return islandWindow;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea: wa } = primaryDisplay;

  const W = 260;
  const H = 38;
  const x = Math.round(wa.x + (wa.width - W) / 2);
  const y = Math.max(0, wa.y);

  islandWindow = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    title: 'Vorssaint · Dynamic Island',
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  islandWindow.setAlwaysOnTop(true, 'screen-saver');
  islandWindow.loadFile(path.join(RENDERER, 'island.html'));

  islandWindow.once('ready-to-show', () => {
    islandWindow.showInactive();
  });

  islandWindow.on('closed', () => {
    islandWindow = null;
  });

  return islandWindow;
}

function resizeIsland(expanded) {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  const { workArea: wa } = screen.getPrimaryDisplay();
  const W = expanded ? 660 : 260;
  const H = expanded ? 380 : 38;
  const x = Math.round(wa.x + (wa.width - W) / 2);
  const y = Math.max(0, wa.y);
  islandWindow.setBounds({ x, y, width: W, height: H });
}

function openMenuPanelWindow() {
  if (menuPanelWindow && !menuPanelWindow.isDestroyed()) {
    if (menuPanelWindow.isVisible()) {
      menuPanelWindow.hide();
    } else {
      menuPanelWindow.show();
      menuPanelWindow.focus();
    }
    return menuPanelWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea: wa } = primaryDisplay;
  const W = 360;
  const H = 600;
  const x = Math.round(wa.x + wa.width - W - 16);
  const y = Math.round(wa.y + 8);

  menuPanelWindow = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: 'Vorssaint · Menu Panel',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  menuPanelWindow.loadFile(path.join(RENDERER, 'vorssaint_menu_panel.html'));
  menuPanelWindow.on('closed', () => {
    menuPanelWindow = null;
  });

  menuPanelWindow.on('blur', () => {
    if (menuPanelWindow && !menuPanelWindow.isDestroyed() && menuPanelWindow.isVisible()) {
      menuPanelWindow.hide();
    }
  });

  return menuPanelWindow;
}

function openHubWindow() {
  if (hubWindow && !hubWindow.isDestroyed()) {
    hubWindow.show();
    hubWindow.focus();
    return hubWindow;
  }

  hubWindow = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    title: 'Vorssaint · Features Hub',
    backgroundColor: '#09090b',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  hubWindow.loadFile(path.join(RENDERER, 'vorssaint_hub.html'));
  hubWindow.on('closed', () => {
    hubWindow = null;
  });

  return hubWindow;
}

function openCleaningWindow(seconds = 30) {
  if (cleaningWindow && !cleaningWindow.isDestroyed()) {
    cleaningWindow.destroy();
    cleaningWindow = null;
    return null;
  }
  const prim = screen.getPrimaryDisplay();
  const { bounds } = prim;
  cleaningWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreen: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  cleaningWindow.setAlwaysOnTop(true, 'screen-saver');
  cleaningWindow.loadFile(path.join(RENDERER, 'cleaning_mode.html'));
  cleaningWindow.on('closed', () => { cleaningWindow = null; });
  return cleaningWindow;
}

function openCommandBarWindow() {
  if (commandBarWindow && !commandBarWindow.isDestroyed()) {
    if (commandBarWindow.isVisible()) {
      commandBarWindow.hide();
    } else {
      commandBarWindow.show();
      commandBarWindow.focus();
    }
    return commandBarWindow;
  }
  const prim = screen.getPrimaryDisplay();
  const { workArea: wa } = prim;
  const W = 620;
  const H = 340;
  const x = Math.round(wa.x + (wa.width - W) / 2);
  const y = Math.round(wa.y + wa.height * 0.18);

  commandBarWindow = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    title: 'Vorssaint · Command Bar',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  commandBarWindow.loadFile(path.join(RENDERER, 'command_bar.html'));
  commandBarWindow.on('closed', () => { commandBarWindow = null; });
  commandBarWindow.on('blur', () => {
    if (commandBarWindow && !commandBarWindow.isDestroyed() && commandBarWindow.isVisible()) {
      commandBarWindow.hide();
    }
  });
  return commandBarWindow;
}

function createTray() {
  const iconPath = path.join(RENDERER, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Vorssaint — Menu Bar & Dynamic Island Utilities');

  // Left click toggles the MenuPanel popover
  tray.on('click', () => {
    openMenuPanelWindow();
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Vorssaint · macOS Suite', enabled: false },
    { type: 'separator' },
    {
      label: 'Open Menu Panel (Alt+V)',
      click: () => openMenuPanelWindow(),
    },
    {
      label: 'Command Bar (Alt+Space)',
      click: () => openCommandBarWindow(),
    },
    {
      label: 'Toggle Dynamic Island',
      click: () => {
        if (islandWindow && !islandWindow.isDestroyed()) {
          if (islandWindow.isVisible()) islandWindow.hide();
          else islandWindow.showInactive();
        } else {
          createIslandWindow();
        }
      },
    },
    {
      label: 'Keyboard Cleaning Lock',
      click: () => openCleaningWindow(30),
    },
    {
      label: 'Sleep Display',
      click: () => vorssaintManager.sleepDisplay(),
    },
    {
      label: 'Features Hub & Settings (Alt+Shift+H)...',
      click: () => openHubWindow(),
    },
    { type: 'separator' },
    {
      label: 'Keep Awake (1 hour)',
      click: () => {
        vorssaintManager.setKeepAwake('1h');
      },
    },
    {
      label: 'Turn Off Keep Awake',
      click: () => {
        vorssaintManager.setKeepAwake('off');
      },
    },
    { type: 'separator' },
    { label: 'Quit Vorssaint', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
}

// --- IPC Registration ---
ipcMain.handle('island:expand', () => {
  resizeIsland(true);
  return true;
});

ipcMain.handle('island:collapse', () => {
  resizeIsland(false);
  return true;
});

ipcMain.handle('island:toggle', () => {
  if (islandWindow && !islandWindow.isDestroyed()) {
    if (islandWindow.isVisible()) islandWindow.hide();
    else islandWindow.showInactive();
    return true;
  }
  createIslandWindow();
  return true;
});

ipcMain.handle('vorssaint:open-panel', () => {
  openMenuPanelWindow();
  return true;
});

ipcMain.handle('vorssaint:open-hub', () => {
  openHubWindow();
  return true;
});

ipcMain.handle('vorssaint:telemetry', () => {
  return vorssaintManager.getTelemetry();
});

ipcMain.handle('vorssaint:ports-get', () => {
  return vorssaintManager.getListeningPorts();
});

ipcMain.handle('vorssaint:port-kill', (event, portOrPid) => {
  return vorssaintManager.killPort(portOrPid);
});

ipcMain.handle('vorssaint:clipboard-history', (event, query) => {
  return vorssaintManager.getClipboardHistory(query);
});

ipcMain.handle('vorssaint:clipboard-copy', (event, id) => {
  return vorssaintManager.copyClipboardItem(id);
});

ipcMain.handle('vorssaint:clipboard-clear', () => {
  return vorssaintManager.clearClipboardHistory();
});

ipcMain.handle('vorssaint:scratchpad-get', () => {
  return vorssaintManager.getScratchpad();
});

ipcMain.handle('vorssaint:scratchpad-save', (event, content) => {
  return vorssaintManager.saveScratchpad(content);
});

ipcMain.handle('vorssaint:keep-awake-set', (event, mode) => {
  return vorssaintManager.setKeepAwake(mode);
});

ipcMain.handle('vorssaint:keep-awake-get', () => {
  return vorssaintManager.getKeepAwakeStatus();
});

ipcMain.handle('vorssaint:settings-get', () => {
  return vorssaintManager.getSettings();
});

ipcMain.handle('vorssaint:settings-update', (event, patch) => {
  const updated = vorssaintManager.updateSettings(patch);
  // Broadcast updated mascot config to all live windows
  [islandWindow, menuPanelWindow, hubWindow].forEach((w) => {
    if (w && !w.isDestroyed() && w.webContents) {
      w.webContents.send('vorssaint:mascot-config-changed', updated);
    }
  });
  return updated;
});

ipcMain.handle('vorssaint:mascot-moment', (event, moment) => {
  [islandWindow, menuPanelWindow, hubWindow].forEach((w) => {
    if (w && !w.isDestroyed() && w.webContents) {
      w.webContents.send('vorssaint:mascot-moment-triggered', moment);
    }
  });
  return true;
});

ipcMain.handle('vorssaint:snap-window', (event, action) => {
  const win = hubWindow || menuPanelWindow;
  return vorssaintManager.snapWindow(action, win);
});

ipcMain.handle('vorssaint:set-volume', (event, val) => {
  return vorssaintManager.setVolume(val);
});

ipcMain.handle('vorssaint:set-brightness', (event, val) => {
  return vorssaintManager.setBrightness(val);
});

ipcMain.handle('vorssaint:sleep-display', () => {
  return vorssaintManager.sleepDisplay();
});

ipcMain.handle('vorssaint:open-command-bar', () => {
  openCommandBarWindow();
  return true;
});

ipcMain.handle('vorssaint:open-cleaning', (event, seconds) => {
  openCleaningWindow(seconds);
  return vorssaintManager.toggleCleaningMode(seconds);
});

ipcMain.handle('vorssaint:cleaning-toggle', (event, seconds) => {
  openCleaningWindow(seconds);
  return vorssaintManager.toggleCleaningMode(seconds);
});

ipcMain.handle('vorssaint:app-volumes-get', () => {
  return vorssaintManager.getAppVolumes();
});

ipcMain.handle('vorssaint:app-volume-set', (event, { app: appName, volumePct }) => {
  return vorssaintManager.setAppVolume(appName, volumePct);
});

ipcMain.handle('vorssaint:quick-toggles-get', () => {
  return vorssaintManager.getQuickToggles();
});

ipcMain.handle('vorssaint:quick-toggle-set', (event, { id, val }) => {
  return vorssaintManager.setQuickToggle(id, val);
});

ipcMain.handle('vorssaint:clean-url', (event, urlText) => {
  return { cleaned: vorssaintManager.cleanUrl(urlText) };
});

ipcMain.handle('vorssaint:snippets-get', () => {
  return vorssaintManager.getSnippets();
});

ipcMain.handle('vorssaint:snippet-save', (event, { trigger, expansion, label }) => {
  return vorssaintManager.saveSnippet(trigger, expansion, label);
});

ipcMain.handle('vorssaint:snippet-delete', (event, id) => {
  return vorssaintManager.deleteSnippet(id);
});

ipcMain.handle('vorssaint:catalog-get', () => {
  return vorssaintManager.getFeatureCatalog();
});

ipcMain.handle('vorssaint:feature-toggle', (event, { featureId, enabled }) => {
  return vorssaintManager.toggleFeatureAvailability(featureId, enabled);
});

app.whenReady().then(() => {
  createIslandWindow();
  createTray();
  try {
    globalShortcut.register('Alt+V', () => openMenuPanelWindow());
    globalShortcut.register('Alt+Shift+H', () => openHubWindow());
    globalShortcut.register('Alt+Space', () => openCommandBarWindow());
  } catch {}
});

app.on('window-all-closed', (e) => {
  // Prevent quitting so Vorssaint stays resident in menu bar tray
  e.preventDefault();
});
