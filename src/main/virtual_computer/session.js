'use strict';

const EventEmitter = require('events');
const { VirtualMachineManager } = require('./vm_manager');
const { VirtualDisplayServer } = require('./display_server');
const { VirtualBrowserController } = require('./browser_controller');
const { VirtualDesktopController } = require('./desktop_controller');
const { ExecutionTargetRouter, ENVIRONMENTS } = require('./router');
const { VirtualScreenTarget } = require('./screen_target');

class VirtualComputerSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || `vcs_${Date.now()}`;
    this.logger = options.logger || console;

    // Subsystems
    this.vmManager = new VirtualMachineManager(options);
    this.displayServer = new VirtualDisplayServer(options);
    this.browserController = new VirtualBrowserController({
      ...options,
      displayServer: this.displayServer,
    });
    this.desktopController = new VirtualDesktopController(options);
    this.targetRouter = new ExecutionTargetRouter(options);
    this.screenTarget = new VirtualScreenTarget(this);

    // Active Task State
    this.activeTask = null;
    this.currentStep = 'Ready';
    this.currentEnvironment = ENVIRONMENTS.VIRTUAL_BROWSER;
    this.inManualTakeover = false;
    this.taskHistory = [];

    this._bindSubsystemEvents();
  }

  _bindSubsystemEvents() {
    this.displayServer.on('frame', (frame) => {
      this.emit('display-frame', frame);
    });

    this.vmManager.on('resource-update', (metrics) => {
      this.emit('resource-update', metrics);
    });
  }

  async init() {
    await this.vmManager.detectHostCapabilities();
    await this.vmManager.start(this.sessionId);
    this.displayServer.startStreaming();
    this.emit('session-ready', { sessionId: this.sessionId, backend: this.vmManager.backend });
    return this;
  }

  /**
   * Set the active task being performed by MAVE in its virtual computer.
   */
  setActiveTask(taskName, environment = null) {
    this.activeTask = String(taskName || 'Autonomous Task');
    this.currentStep = 'Starting task...';
    if (environment) {
      this.currentEnvironment = environment;
    } else {
      const resolved = this.targetRouter.resolveTarget(this.activeTask);
      this.currentEnvironment = resolved.environment;
    }
    this.emit('task-updated', {
      task: this.activeTask,
      step: this.currentStep,
      environment: this.currentEnvironment,
    });
  }

  updateProgress(stepDescription) {
    this.currentStep = String(stepDescription || '');
    this.taskHistory.push({ step: this.currentStep, timestamp: Date.now() });
    if (this.taskHistory.length > 50) this.taskHistory.shift();
    this.emit('task-progress', { task: this.activeTask, step: this.currentStep });
  }

  /**
   * Primary Action Dispatcher: Routes action calls to guest controllers.
   * Completely isolated from host mouse, keyboard, and screen!
   */
  async executeGuestAction(actionName, input = {}) {
    if (this.inManualTakeover) {
      throw new Error('Action paused: Virtual Computer is currently in Manual Takeover mode.');
    }

    const act = String(actionName || '').toLowerCase().trim();

    switch (act) {
      case 'screenshot':
      case 'zoom':
        return await this.displayServer.captureScreenshot();

      case 'open_url':
        this.updateProgress(`Navigating to ${input.url}...`);
        return await this.browserController.goto(input.url);

      case 'click':
      case 'left_click':
      case 'click_element':
        this.updateProgress('Clicking element...');
        return await this.browserController.click(input.coordinate || input.selector || input.id);

      case 'type':
      case 'type_into':
        this.updateProgress('Typing text into field...');
        return await this.browserController.type(input.selector || input.id, input.text);

      case 'scroll':
      case 'scroll_screen':
        this.updateProgress(`Scrolling ${input.scroll_direction || input.direction || 'down'}...`);
        return await this.browserController.scroll(input.scroll_direction || input.direction, input.scroll_amount || input.amount);

      case 'read_screen':
        return await this.browserController.getAccessibilityTree();

      case 'run_command':
      case 'terminal_command':
        this.updateProgress(`Running terminal command: ${String(input.command || '').slice(0, 40)}...`);
        return await this.desktopController.runTerminalCommand(input.command, input);

      case 'write_file':
        this.updateProgress(`Writing file ${input.path}...`);
        return await this.desktopController.writeGuestFile(input.path, input.content);

      case 'read_file':
        this.updateProgress(`Reading file ${input.path}...`);
        return await this.desktopController.readGuestFile(input.path);

      case 'list_directory':
        return await this.desktopController.listGuestFiles(input.path);

      case 'export_file':
        this.updateProgress(`Exporting ${input.guestPath} to host...`);
        return await this.desktopController.exportFileToHost(input.guestPath, input.hostPath);

      default:
        throw new Error(`Unsupported guest action: ${actionName}`);
    }
  }

  /**
   * Manual Takeover Protocol:
   * The user clicks "Take Control" on the Virtual Computer viewer.
   * Autonomous agent input is paused; user can interact with the virtual computer directly.
   */
  startTakeover() {
    this.inManualTakeover = true;
    this.emit('takeover-changed', { inTakeover: true });
    return { ok: true, inTakeover: true };
  }

  stopTakeover() {
    this.inManualTakeover = false;
    this.emit('takeover-changed', { inTakeover: false });
    return { ok: true, inTakeover: false };
  }

  /**
   * Dispatch synthetic user input from the UI viewer canvas directly to the guest display server.
   */
  async dispatchUserInput(event) {
    if (!this.displayServer) return { ok: false };
    const { type, x, y, button, text, deltaX, deltaY, combo } = event || {};

    if (type === 'move' && x != null && y != null) {
      return await this.displayServer.moveCursor(x, y, { steps: 1 });
    }
    if (type === 'click' && x != null && y != null) {
      return await this.displayServer.click(x, y, button || 'left');
    }
    if (type === 'type' && text) {
      return await this.displayServer.type(text);
    }
    if (type === 'scroll') {
      return await this.displayServer.scroll(deltaX || 0, deltaY || 0);
    }
    if (type === 'key' && combo) {
      return await this.displayServer.key(combo);
    }
    return { ok: true };
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      activeTask: this.activeTask,
      currentStep: this.currentStep,
      environment: this.currentEnvironment,
      inManualTakeover: this.inManualTakeover,
      vmStatus: this.vmManager.getStatus(),
      activeTab: this.browserController.getActiveTab(),
      tabsCount: this.browserController.tabs.size,
      cursor: this.displayServer.cursor,
    };
  }

  getScreenTarget() {
    return this.screenTarget;
  }

  async close() {
    this.displayServer.stopStreaming();
    await this.vmManager.stop();
    this.emit('session-closed', { sessionId: this.sessionId });
  }
}

let activeSessionInstance = null;

function getVirtualComputerSession(options = {}) {
  if (!activeSessionInstance) {
    activeSessionInstance = new VirtualComputerSession(options);
  }
  return activeSessionInstance;
}

module.exports = {
  VirtualComputerSession,
  getVirtualComputerSession,
  ENVIRONMENTS,
};
