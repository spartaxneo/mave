'use strict';
// Creates and tracks every window. Knows nothing about tasks or voice.

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(RENDERER, 'assets', 'icon.png');

function webPreferences(extra = {}) {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    ...extra,
  };
}

/** Hide a window from screen capture so Claude never sees Bigfoot's own UI in screenshots. */
function protect(win) {
  // On Windows, setContentProtection(true) on transparent/layered windows triggers a DWM bug
  // that renders the window completely invisible to the user. On Windows, windows.hidePanel()
  // already hides Bigfoot's UI whenever the agent interacts with the screen.
  if (process.platform === 'win32') return;
  if (process.env.BIGFOOT_ALLOW_CAPTURE !== '1') win.setContentProtection(true);
}

function send(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

class WindowManager {
  constructor({ settings, onEngineClosed, onQuit } = {}) {
    this.settingsStore = settings || null;
    this.overlays = new Map(); // displayId -> BrowserWindow
    this.main = null;
    this.mainPage = null;
    this.approval = null;
    this.engine = null;
    this.tray = null;
    this.toolTray = null;
    this.quitting = false;
    this.onEngineClosed = onEngineClosed;
    this.onQuit = onQuit || null;
    this.approvalQueue = Promise.resolve();
    this.cancelApproval = null;
    this.petWindow = null;
    this.islandWindow = null;
    this.vorssaintHubWindow = null;
    this.vorssaintMenuPanelWindow = null;
    this.vorssaintCleaningWindow = null;
    this.vorssaintCommandBarWindow = null;
  }

  send(win, channel, payload) { send(win, channel, payload); }
  broadcast(channel, payload) { for (const w of this.overlays.values()) send(w, channel, payload); }
  sendToAll(channel, payload) {
    if (this.main && !this.main.isDestroyed()) send(this.main, channel, payload);
    if (this.panel && !this.panel.isDestroyed()) send(this.panel, channel, payload);
    this.broadcast(channel, payload);
  }
  overlayFor(displayId) { return this.overlays.get(displayId); }
  displayIdOf(webContents) {
    for (const [id, w] of this.overlays) if (!w.isDestroyed() && w.webContents === webContents) return id;
    return null;
  }

  // overlays (one per display)
  syncOverlays() {
    const displays = screen.getAllDisplays();
    const ids = new Set(displays.map((d) => d.id));
    for (const [id, win] of this.overlays) {
      if (!ids.has(id)) { if (!win.isDestroyed()) win.destroy(); this.overlays.delete(id); }
    }
    for (const d of displays) {
      const existing = this.overlays.get(d.id);
      if (existing && !existing.isDestroyed()) {
        existing.setBounds(d.bounds);
        continue;
      }
      const win = new BrowserWindow({
        ...d.bounds,
        transparent: true, frame: false, resizable: false, movable: false, focusable: false,
        skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true, fullscreenable: false,
        backgroundColor: '#00000000',
        webPreferences: webPreferences({ backgroundThrottling: false }),
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setIgnoreMouseEvents(true);
      protect(win); // the buddy and drawings never show up in Claude's screenshots
      win.setVisibleOnAllWorkspaces(true);
      win.loadFile(path.join(RENDERER, 'overlay.html'), { query: { displayId: String(d.id) } });
      win.once('ready-to-show', () => { win.showInactive(); win.setBounds(d.bounds); });
      this.overlays.set(d.id, win);
    }
  }

  /** Put the overlays back on top of everything, so a drag over the screen lands on them. */
  raiseOverlays() {
    for (const w of this.overlays.values()) {
      if (w.isDestroyed()) continue;
      w.setAlwaysOnTop(true, 'screen-saver');
      w.moveTop();
    }
    if (this.islandWindow && !this.islandWindow.isDestroyed() && this.islandWindow.isVisible()) {
      this.islandWindow.setAlwaysOnTop(true, 'screen-saver');
      this.islandWindow.moveTop();
    }
  }

  setOverlaysInteractive(on, displayId = null) {
    for (const [id, w] of this.overlays) {
      if (!w.isDestroyed() && (displayId == null || id === displayId)) w.setIgnoreMouseEvents(!on);
    }
  }

  /** While the AI gets ready the tray's tools are greyed out (null: ready). */
  setToolsBlocked(why) {
    if (why === this.toolsBlocked) return;
    this.toolsBlocked = why;
    if (this.toolTray && !this.toolTray.isDestroyed()) send(this.toolTray, 'tools-blocked', why);
  }

  /** Clicks pass through to the apps below but hover still reaches the page (for the ink toolbar). */
  setOverlayPassthrough(displayId, on) {
    const w = this.overlays.get(displayId);
    if (w && !w.isDestroyed()) w.setIgnoreMouseEvents(on, on ? { forward: true } : undefined);
  }

  /** Ink modes take the keyboard (undo, tool shortcuts) while they're open. */
  setOverlayFocus(displayId, on) {
    const w = this.overlays.get(displayId);
    if (!w || w.isDestroyed()) return;
    w.setFocusable(on);
    if (!on) { w.blur(); return; }
    w.focus();
    // Windows won't hand the keyboard to a background app on request; the input helper can.
    if (!w.isFocused() && this.activate) {
      const handle = w.getNativeWindowHandle();
      const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
      this.activate(hwnd.toString()).then(() => { if (!w.isDestroyed()) w.webContents.focus(); }).catch(() => {});
    }
  }

  // tool tray (double-click the desktop)
  showToolTray({ x, y }) {
    const W = 250;
    const H = 88;
    const { workArea: wa } = screen.getDisplayNearestPoint({ x, y });
    const bounds = {
      x: Math.round(Math.max(wa.x + 4, Math.min(x - W / 2, wa.x + wa.width - W - 4))),
      y: Math.round(Math.max(wa.y + 4, Math.min(y - H + 2, wa.y + wa.height - H - 4))),
      width: W, height: H,
    };
    if (!this.toolTray || this.toolTray.isDestroyed()) {
      const win = new BrowserWindow({
        ...bounds, frame: false, transparent: true, resizable: false, movable: false, show: false,
        skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, minimizable: false, maximizable: false,
        hasShadow: false, backgroundColor: '#00000000', webPreferences: webPreferences(),
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      protect(win);
      win.loadFile(path.join(RENDERER, 'toolbar.html'));
      win.on('blur', () => this.hideToolTray());
      this.toolTray = win;
    }
    const win = this.toolTray;
    win.setBounds(bounds);
    const reveal = () => {
      if (win.isDestroyed()) return;
      send(win, 'voice-mode', Boolean(this.voiceMode));
      send(win, 'tools-blocked', this.toolsBlocked || null);
      send(win, 'toolbar:show');
      win.show();
      win.focus();
    };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal);
    else reveal();
  }

  hideToolTray() {
    if (this.toolTray && !this.toolTray.isDestroyed() && this.toolTray.isVisible()) this.toolTray.hide();
  }

  // audio engine (hidden)
  createEngine() {
    this.engine = new BrowserWindow({
      show: false, width: 200, height: 200, skipTaskbar: true,
      webPreferences: webPreferences({ backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }),
    });
    this.engine.loadFile(path.join(RENDERER, 'engine.html'));
    this.engine.on('closed', () => {
      this.engine = null;
      if (!this.quitting) setTimeout(() => this.createEngine(), 500);
      if (this.onEngineClosed) this.onEngineClosed();
    });
  }

  // the main window
  // Bigfoot has one window. It shows onboarding on first run, then Home, Settings, and the Terminal.
  get onApp() { return this.main && !this.main.isDestroyed() && this.mainPage === 'app'; }
  get panel() { return this.onApp ? this.main : null; }
  get settings() { return this.onApp ? this.main : null; }
  get terminal() { return this.onApp ? this.main : null; }
  get onboarding() { return this.main && !this.main.isDestroyed() && this.mainPage === 'onboarding' ? this.main : null; }

  createMain() {
    const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const width = Math.min(960, wa.width - 40);
    const height = Math.min(680, wa.height - 40);
    this.main = new BrowserWindow({
      width, height, minWidth: 560, minHeight: 480, center: true, show: false,
      frame: true,
      autoHideMenuBar: true,
      transparent: false,
      resizable: true, fullscreenable: true, maximizable: true,
      backgroundColor: '#101211', title: 'Mave',
      icon: ICON, webPreferences: webPreferences(),
    });
    protect(this.main); // Bigfoot's own window never appears in the screenshots it sends
    this.mainPage = null;
    this.main.on('close', (e) => {
      if (this.quitting) return;
      if (this.settingsStore && this.settingsStore.get('minimizeToTrayOnClose')) {
        e.preventDefault();
        this.main.hide();
      } else {
        // User closed Mave -> quit completely and cleanly shut down
        this.quitting = true;
        try {
          if (typeof this.onQuit === 'function') this.onQuit();
        } catch {}
        app.quit();
      }
    });
    this.main.on('closed', () => { this.main = null; this.mainPage = null; });
  }

  destroyAll() {
    this.quitting = true;
    if (this.tray) {
      try { this.tray.destroy(); this.tray = null; } catch {}
    }
    if (this.islandWindow && !this.islandWindow.isDestroyed()) {
      try { this.islandWindow.destroy(); this.islandWindow = null; } catch {}
    }
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      try { this.petWindow.destroy(); this.petWindow = null; } catch {}
    }
    if (this.vorssaintHubWindow && !this.vorssaintHubWindow.isDestroyed()) {
      try { this.vorssaintHubWindow.destroy(); this.vorssaintHubWindow = null; } catch {}
    }
    if (this.vorssaintMenuPanelWindow && !this.vorssaintMenuPanelWindow.isDestroyed()) {
      try { this.vorssaintMenuPanelWindow.destroy(); this.vorssaintMenuPanelWindow = null; } catch {}
    }
    if (this.vorssaintCleaningWindow && !this.vorssaintCleaningWindow.isDestroyed()) {
      try { this.vorssaintCleaningWindow.destroy(); this.vorssaintCleaningWindow = null; } catch {}
    }
    if (this.vorssaintCommandBarWindow && !this.vorssaintCommandBarWindow.isDestroyed()) {
      try { this.vorssaintCommandBarWindow.destroy(); this.vorssaintCommandBarWindow = null; } catch {}
    }
    for (const [, win] of this.overlays) {
      if (win && !win.isDestroyed()) {
        try { win.destroy(); } catch {}
      }
    }
    this.overlays.clear();
    if (this.engine && !this.engine.isDestroyed()) {
      try { this.engine.destroy(); this.engine = null; } catch {}
    }
    if (this.main && !this.main.isDestroyed()) {
      try { this.main.destroy(); this.main = null; } catch {}
    }
  }

  /** Show the main window at a page: 'onboarding', 'home', 'terminal', or a settings section. */
  openMain(route = 'home') {
    console.log(`[windows] openMain called with route: "${route}"`);
    if (!this.main || this.main.isDestroyed()) this.createMain();
    const win = this.main;
    const firstShow = !win.isVisible();
    console.log(`[windows] main window ID: ${win.id}, firstShow: ${firstShow}, isLoading: ${win.webContents.isLoading()}`);
    if (route === 'onboarding') {
      if (this.mainPage !== 'onboarding') {
        this.mainPage = 'onboarding';
        win.loadFile(path.join(RENDERER, 'onboarding.html'));
      }
    } else if (this.mainPage !== 'app') {
      this.mainPage = 'app';
      win.loadFile(path.join(RENDERER, 'app.html'), { query: { section: route } });
    } else {
      send(win, 'settings', { section: route });
    }
    const reveal = () => {
      console.log('[windows] reveal() invoked for main window');
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    };
    win.webContents.on('did-fail-load', (e, code, desc) => console.error('[windows] main did-fail-load:', code, desc));
    win.webContents.on('console-message', (e, level, message, line, sourceId) => {
      if (level >= 2) console.log(`[renderer error] ${message} (${sourceId}:${line})`);
    });
    win.once('ready-to-show', reveal);
    win.webContents.once('did-finish-load', reveal);
    reveal();
    return win;
  }

  toggleMain(route = 'home') {
    if (this.main && !this.main.isDestroyed() && this.main.isVisible() && !this.main.isMinimized()) {
      this.main.hide();
      return false;
    }
    this.openMain(route);
    return true;
  }

  showPanel() { this.openMain('home'); }
  openSettings(section) { this.openMain(section || 'assistant'); }
  openOnboarding() { this.openMain('onboarding'); }
  openTerminal() { this.openMain('terminal'); }

  /** Get out of the way while Bigfoot works on the screen. */
  /** The chat is open and in view: replies show there, not also next to the cursor. */
  chatInView() {
    const w = this.panel;
    return Boolean(w && !w.isDestroyed() && w.isVisible() && !w.isMinimized());
  }

  hidePanel() {
    if (this.main && !this.main.isDestroyed() && this.main.isVisible() && !this.main.isMinimized()) this.main.minimize();
  }

  resizePanel() { /* the main window is sized by the user */ }

  // approval alerts (one at a time)
  /** Resolves true when the user allows. */
  askApproval(req, { onShow } = {}) {
    const run = () => new Promise((resolve) => {
      const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const W = 360;
      const H = req.detail ? 318 : 238;
      const win = new BrowserWindow({
        width: W, height: H, x: Math.round(wa.x + (wa.width - W) / 2), y: wa.y + 64,
        frame: false, transparent: true, resizable: false, alwaysOnTop: true, show: false,
        fullscreenable: false, minimizable: false, maximizable: false, backgroundColor: '#00000000', title: 'Permission',
        icon: ICON, webPreferences: webPreferences(),
      });
      this.approval = win;
      win.setAlwaysOnTop(true, 'screen-saver');
      protect(win);
      win.loadFile(path.join(RENDERER, 'approval.html'));

      let settled = false;
      const finish = (answer) => {
        if (settled) return;
        settled = true;
        ipcMain.removeHandler('approval:answer');
        this.approval = null;
        this.cancelApproval = null;
        if (!win.isDestroyed()) win.destroy();
        resolve(Boolean(answer));
      };
      ipcMain.removeHandler('approval:answer');
      ipcMain.handle('approval:answer', (_e, answer) => finish(answer));
      win.webContents.once('did-finish-load', () => {
        send(win, 'approval:show', req);
        win.show();
        win.focus();
        if (onShow) onShow(win);
      });
      win.on('focus', () => win.flashFrame(false));
      win.on('closed', () => finish(false));
      this.cancelApproval = () => finish(false);
    });
    this.approvalQueue = this.approvalQueue.then(run, run);
    return this.approvalQueue;
  }

  broadcastSettings(view) {
    send(this.main, 'settings', view);
    this.broadcast('settings', view);
  }

  // Desktop Pet Companion (Codex Pets)
  createPetWindow(size = 'normal') {
    if (this.petWindow && !this.petWindow.isDestroyed()) return this.petWindow;
    const { workArea: wa } = screen.getPrimaryDisplay();
    let W = 160;
    let H = 160;
    if (size === 'compact') { W = 130; H = 130; }
    else if (size === 'large') { W = 190; H = 190; }
    const win = new BrowserWindow({
      width: W, height: H, x: wa.x + wa.width - W - 20, y: wa.y + wa.height - H - 20,
      frame: false, transparent: true, resizable: false, alwaysOnTop: true, show: false,
      skipTaskbar: true, fullscreenable: false, minimizable: false, maximizable: false,
      backgroundColor: '#00000000', title: 'Mave Pet Companion',
      hasShadow: false,
      webPreferences: webPreferences(),
    });
    protect(win); // Never appears in screenshots captured by vision agent
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(path.join(RENDERER, 'pet.html'));
    this.petWindow = win;
    win.on('closed', () => { this.petWindow = null; });
    return win;
  }

  showPet(size = 'normal') {
    const win = this.createPetWindow(size);
    win.showInactive();
  }

  hidePet() {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.hide();
    }
  }

  togglePet() {
    if (this.petWindow && !this.petWindow.isDestroyed() && this.petWindow.isVisible()) {
      this.hidePet();
      return false;
    }
    this.showPet();
    return true;
  }

  updatePetState(state, speechBubble = null, species = null, taskMode = null) {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      send(this.petWindow, 'pet:state', { state, speechBubble, species, taskMode });
    }
  }

  updatePetConfig(config) {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      if (config.size) {
        let W = 160, H = 160;
        if (config.size === 'compact') { W = 130; H = 130; }
        else if (config.size === 'large') { W = 190; H = 190; }
        this.petWindow.setSize(W, H);
      }
      send(this.petWindow, 'pet:config', config);
    }
  }

  // Standalone Device Extension Dynamic Island (Vorssaint macOS-style)
  createIslandWindow() {
    if (this.islandWindow && !this.islandWindow.isDestroyed()) return this.islandWindow;
    const { workArea: wa } = screen.getPrimaryDisplay();
    const W = 260;
    const H = 38;
    const x = Math.round(wa.x + (wa.width - W) / 2);
    const y = Math.max(0, wa.y);
    const win = new BrowserWindow({
      width: W, height: H, x, y,
      frame: false, transparent: true, resizable: true, alwaysOnTop: true, show: false,
      minWidth: 200, minHeight: 32,
      skipTaskbar: true, fullscreenable: false, minimizable: false, maximizable: false,
      backgroundColor: '#00000000', title: 'Vorssaint · Dynamic Island',
      hasShadow: false,
      webPreferences: webPreferences(),
    });
    protect(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(path.join(RENDERER, 'island.html'));
    this.islandWindow = win;
    win.on('blur', () => {
      if (!this.quitting && !win.isDestroyed()) {
        send(win, 'island:blur');
      }
    });
    win.on('closed', () => { this.islandWindow = null; });
    return win;
  }

  showIsland() {
    const win = this.createIslandWindow();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
    win.moveTop();
  }

  hideIsland() {
    if (this.islandWindow && !this.islandWindow.isDestroyed()) {
      this.islandWindow.hide();
    }
  }

  toggleIsland() {
    if (this.islandWindow && !this.islandWindow.isDestroyed() && this.islandWindow.isVisible()) {
      this.hideIsland();
      return false;
    }
    this.showIsland();
    return true;
  }

  resizeIsland(expanded) {
    if (!this.islandWindow || this.islandWindow.isDestroyed()) return;
    const { workArea: wa } = screen.getPrimaryDisplay();
    const W = expanded ? 620 : 260;
    const H = expanded ? 340 : 38;
    const x = Math.round(wa.x + (wa.width - W) / 2);
    const y = Math.max(0, wa.y);
    this.islandWindow.setResizable(true);
    this.islandWindow.setMinimumSize(200, 32);
    this.islandWindow.setBounds({ x, y, width: W, height: H });
    this.islandWindow.setAlwaysOnTop(true, 'screen-saver');
    this.islandWindow.moveTop();
    if (expanded) {
      this.islandWindow.show();
      this.islandWindow.focus();
    }
  }

  updateIsland(payload) {
    if (this.islandWindow && !this.islandWindow.isDestroyed()) {
      send(this.islandWindow, 'island:update', payload);
    }
  }

  openVorssaintHub() {
    if (this.vorssaintHubWindow && !this.vorssaintHubWindow.isDestroyed()) {
      this.vorssaintHubWindow.show();
      this.vorssaintHubWindow.focus();
      return this.vorssaintHubWindow;
    }
    const win = new BrowserWindow({
      width: 840, height: 620,
      minWidth: 700, minHeight: 500,
      title: 'Vorssaint · Features Hub',
      backgroundColor: '#09090b',
      frame: true,
      webPreferences: webPreferences(),
    });
    win.loadFile(path.join(RENDERER, 'vorssaint_hub.html'));
    this.vorssaintHubWindow = win;
    win.on('closed', () => { this.vorssaintHubWindow = null; });
    return win;
  }

  openVorssaintMenuPanel(trayBounds = null) {
    if (this.vorssaintMenuPanelWindow && !this.vorssaintMenuPanelWindow.isDestroyed()) {
      if (this.vorssaintMenuPanelWindow.isVisible()) {
        this.vorssaintMenuPanelWindow.hide();
      } else {
        if (trayBounds) {
          const W = 360;
          const H = 600;
          const primaryDisplay = screen.getPrimaryDisplay();
          const { workArea: wa } = primaryDisplay;
          let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (W / 2));
          let y = trayBounds.y > (wa.height / 2) ? Math.round(trayBounds.y - H - 8) : Math.round(trayBounds.y + trayBounds.height + 8);
          x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - W - 8));
          y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - H - 8));
          this.vorssaintMenuPanelWindow.setBounds({ x, y, width: W, height: H });
        }
        this.vorssaintMenuPanelWindow.show();
        this.vorssaintMenuPanelWindow.focus();
      }
      return this.vorssaintMenuPanelWindow;
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea: wa } = primaryDisplay;
    const W = 360;
    const H = 600;
    let x = Math.round(wa.x + wa.width - W - 20);
    let y = Math.round(wa.y + 10);
    if (trayBounds) {
      x = Math.round(trayBounds.x + (trayBounds.width / 2) - (W / 2));
      y = trayBounds.y > (wa.height / 2) ? Math.round(trayBounds.y - H - 8) : Math.round(trayBounds.y + trayBounds.height + 8);
      x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - W - 8));
      y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - H - 8));
    }

    const win = new BrowserWindow({
      width: W,
      height: H,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: 'Vorssaint · Menu Panel',
      backgroundColor: '#00000000',
      webPreferences: webPreferences(),
    });
    protect(win);
    win.loadFile(path.join(RENDERER, 'vorssaint_menu_panel.html'));
    this.vorssaintMenuPanelWindow = win;
    win.on('closed', () => { this.vorssaintMenuPanelWindow = null; });
    win.on('blur', () => {
      if (win && !win.isDestroyed() && win.isVisible()) {
        win.hide();
      }
    });
    return win;
  }

  openCleaningModeWindow(seconds = 30) {
    if (this.vorssaintCleaningWindow && !this.vorssaintCleaningWindow.isDestroyed()) {
      this.vorssaintCleaningWindow.destroy();
      this.vorssaintCleaningWindow = null;
      return null;
    }
    const prim = screen.getPrimaryDisplay();
    const { bounds } = prim;
    const win = new BrowserWindow({
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
      webPreferences: webPreferences(),
    });
    protect(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(path.join(RENDERER, 'cleaning_mode.html'));
    this.vorssaintCleaningWindow = win;
    win.on('closed', () => { this.vorssaintCleaningWindow = null; });
    return win;
  }

  openCommandBarWindow() {
    if (this.vorssaintCommandBarWindow && !this.vorssaintCommandBarWindow.isDestroyed()) {
      if (this.vorssaintCommandBarWindow.isVisible()) {
        this.vorssaintCommandBarWindow.hide();
      } else {
        this.vorssaintCommandBarWindow.show();
        this.vorssaintCommandBarWindow.focus();
      }
      return this.vorssaintCommandBarWindow;
    }
    const prim = screen.getPrimaryDisplay();
    const { workArea: wa } = prim;
    const W = 620;
    const H = 340;
    const x = Math.round(wa.x + (wa.width - W) / 2);
    const y = Math.round(wa.y + wa.height * 0.18);

    const win = new BrowserWindow({
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
      webPreferences: webPreferences(),
    });
    protect(win);
    win.loadFile(path.join(RENDERER, 'command_bar.html'));
    this.vorssaintCommandBarWindow = win;
    win.on('closed', () => { this.vorssaintCommandBarWindow = null; });
    win.on('blur', () => {
      if (win && !win.isDestroyed() && win.isVisible()) {
        win.hide();
      }
    });
    return win;
  }
}


module.exports = { WindowManager, send };
