'use strict';

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

const ICON_DIR = path.join(__dirname, '..', 'renderer', 'assets');

function createTray({ windows, settings, controller, agent }) {
  let image = nativeImage.createFromPath(path.join(ICON_DIR, 'tray.png'));
  if (process.platform === 'win32') {
    const appIcon = nativeImage.createFromPath(path.join(ICON_DIR, 'icon.png'));
    if (!appIcon.isEmpty()) image = appIcon.resize({ width: 24, height: 24 });
  } else {
    const hiDpi = nativeImage.createFromPath(path.join(ICON_DIR, 'tray@2x.png'));
    if (!hiDpi.isEmpty()) image.addRepresentation({ scaleFactor: 2, buffer: hiDpi.toPNG() });
  }
  const tray = new Tray(image);
  const name = settings.get('assistantName') || 'Mave';
  tray.setToolTip(`Vorssaint & ${name} · Ready`);

  // Left click toggles the Vorssaint Menu Panel (macOS & Windows parity)
  tray.on('click', (event, bounds) => {
    if (windows.openVorssaintMenuPanel) {
      windows.openVorssaintMenuPanel(bounds);
    } else {
      windows.openMain('home');
    }
  });

  tray.on('double-click', () => {
    windows.openMain('home');
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Vorssaint OS Toolkit', enabled: false },
      { label: 'Open Vorssaint Menu Panel', click: (menuItem, browserWindow, event) => {
        windows.openVorssaintMenuPanel();
      }},
      { label: 'Vorssaint Companion Hub & Settings…', click: () => {
        if (windows.openVorssaintHub) windows.openVorssaintHub();
      }},
      { label: 'Toggle Dynamic Island', click: () => {
        if (windows.toggleIsland) windows.toggleIsland();
      }},
      { label: 'Command Bar (Alt+Space)', click: () => {
        if (windows.openCommandBarWindow) windows.openCommandBarWindow();
      }},
      { type: 'separator' },
      { label: `Open ${name} (ChatGPT & Codex)`, click: () => windows.openMain('home') },
      { label: 'Select an Area to Ask About', click: () => controller.startPanelSelection() },
      { label: `${name} Settings…`, click: () => windows.openSettings() },
      { label: `${name} Terminal`, click: () => windows.openTerminal() },
      { type: 'separator' },
      { label: 'Keep Awake (1 hour)', click: () => {
        try {
          const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
          getVorssaintManager({ windows, settings }).setKeepAwake('1h');
        } catch {}
      }},
      { label: 'Keyboard Cleaning Mode (30s lock)', click: () => {
        try {
          if (windows.openCleaningModeWindow) windows.openCleaningModeWindow(30);
          const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
          getVorssaintManager({ windows, settings }).toggleCleaningMode(30);
        } catch {}
      }},
      { label: 'Sleep Display', click: () => {
        try {
          const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
          getVorssaintManager({ windows, settings }).sleepDisplay();
        } catch {}
      }},
      { type: 'separator' },
      { label: `Show ${name} Next to Cursor`, type: 'checkbox', checked: settings.get('showBuddy'), click: (item) => settings.update({ showBuddy: item.checked }) },
      { label: `Answer to “Hey ${name}”`, type: 'checkbox', checked: settings.get('wakeWord'), click: (item) => settings.update({ wakeWord: item.checked }) },
      { label: 'Speak Replies', type: 'checkbox', checked: settings.get('speakResponses'), click: (item) => settings.update({ speakResponses: item.checked }) },
      { label: 'New Conversation', enabled: !agent.running, click: () => agent.reset() },
      { type: 'separator' },
      { label: `Quit Vorssaint & ${name}`, click: () => app.quit() },
    ]));
  });
  windows.tray = tray;
  return tray;
}

module.exports = { createTray };
