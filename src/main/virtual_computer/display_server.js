'use strict';

const EventEmitter = require('events');

class VirtualDisplayServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.width = options.width || 1280;
    this.height = options.height || 800;
    this.fps = options.fps || 30;

    // Independent Virtual Cursor (Does NOT touch host Windows cursor)
    this.cursor = {
      x: Math.round(this.width / 2),
      y: Math.round(this.height / 2),
      state: 'idle', // 'idle' | 'pointer' | 'text' | 'clicking' | 'dragging'
      lastClickedAt: 0,
      visible: true,
    };

    this.activeWindowTitle = options.initialTitle || 'MAVE Virtual Desktop';
    this.activeWindowBounds = { x: 40, y: 40, width: this.width - 80, height: this.height - 80 };
    this.streaming = false;
    this.streamInterval = null;
    this.frameCount = 0;
    this.latestFrameBuffer = null;
    this.inputLog = [];

    // Initialize mock default canvas frame
    this._generateFrame();
  }

  startStreaming() {
    if (this.streaming) return;
    this.streaming = true;
    const intervalMs = Math.round(1000 / this.fps);
    this.streamInterval = setInterval(() => {
      this._generateFrame();
      this.emit('frame', this.getFramePayload());
    }, intervalMs);
    this.emit('streaming-started', { fps: this.fps, width: this.width, height: this.height });
  }

  stopStreaming() {
    if (!this.streaming) return;
    this.streaming = false;
    if (this.streamInterval) clearInterval(this.streamInterval);
    this.streamInterval = null;
    this.emit('streaming-stopped');
  }

  _generateFrame() {
    this.frameCount++;
    // Frame metadata payload representing virtual display rasterization
    this.latestFrameBuffer = {
      frameId: this.frameCount,
      timestamp: Date.now(),
      width: this.width,
      height: this.height,
      cursor: { ...this.cursor },
      activeWindow: {
        title: this.activeWindowTitle,
        bounds: this.activeWindowBounds,
      },
    };
  }

  getFramePayload() {
    return {
      ...this.latestFrameBuffer,
      cursor: { ...this.cursor },
    };
  }

  /**
   * Virtual mouse movement - Strictly within the virtual frame buffer.
   * Host physical cursor position is completely unaffected.
   */
  async moveCursor(targetX, targetY, options = {}) {
    const steps = options.steps || 5;
    const startX = this.cursor.x;
    const startY = this.cursor.y;
    const clampedX = Math.max(0, Math.min(this.width, Math.round(targetX)));
    const clampedY = Math.max(0, Math.min(this.height, Math.round(targetY)));

    for (let i = 1; i <= steps; i++) {
      this.cursor.x = Math.round(startX + ((clampedX - startX) * i) / steps);
      this.cursor.y = Math.round(startY + ((clampedY - startY) * i) / steps);
      this.emit('cursor-move', { x: this.cursor.x, y: this.cursor.y });
    }

    this._recordInput('move', { x: clampedX, y: clampedY });
    return { x: this.cursor.x, y: this.cursor.y };
  }

  /**
   * Virtual click - Dispatches mouse click event to guest window.
   */
  async click(x, y, button = 'left', count = 1) {
    if (x != null && y != null) {
      await this.moveCursor(x, y);
    }
    this.cursor.state = 'clicking';
    this.cursor.lastClickedAt = Date.now();

    const event = {
      type: 'click',
      x: this.cursor.x,
      y: this.cursor.y,
      button,
      count,
      timestamp: this.cursor.lastClickedAt,
    };

    this.emit('virtual-click', event);
    this._recordInput('click', event);

    setTimeout(() => {
      if (this.cursor.state === 'clicking') {
        this.cursor.state = 'idle';
      }
    }, 120);

    return { ok: true, ...event };
  }

  /**
   * Virtual drag from start coordinate to end coordinate.
   */
  async drag(startX, startY, endX, endY) {
    await this.moveCursor(startX, startY);
    this.cursor.state = 'dragging';
    this.emit('virtual-mouse-down', { x: startX, y: startY, button: 'left' });

    await this.moveCursor(endX, endY, { steps: 12 });

    this.cursor.state = 'idle';
    this.emit('virtual-mouse-up', { x: endX, y: endY, button: 'left' });
    this._recordInput('drag', { from: { x: startX, y: startY }, to: { x: endX, y: endY } });
    return { ok: true, start: { x: startX, y: startY }, end: { x: endX, y: endY } };
  }

  /**
   * Virtual text entry into guest window.
   */
  async type(text) {
    const str = String(text || '');
    this.cursor.state = 'text';
    this.emit('virtual-type', { text: str });
    this._recordInput('type', { textLength: str.length, preview: str.slice(0, 30) });

    setTimeout(() => {
      if (this.cursor.state === 'text') this.cursor.state = 'idle';
    }, 100);

    return { ok: true, charsTyped: str.length };
  }

  /**
   * Virtual keyboard key combination.
   */
  async key(combo) {
    const keyStr = String(combo || '').toLowerCase();
    this.emit('virtual-key', { combo: keyStr });
    this._recordInput('key', { combo: keyStr });
    return { ok: true, combo: keyStr };
  }

  /**
   * Virtual scroll.
   */
  async scroll(deltaX = 0, deltaY = 0) {
    this.emit('virtual-scroll', { deltaX, deltaY, x: this.cursor.x, y: this.cursor.y });
    this._recordInput('scroll', { deltaX, deltaY });
    return { ok: true, deltaX, deltaY };
  }

  /**
   * Capture virtual display screenshot.
   */
  async captureScreenshot() {
    this._generateFrame();
    return {
      width: this.width,
      height: this.height,
      cursor: { ...this.cursor },
      timestamp: Date.now(),
      frameId: this.frameCount,
      // Minimal 1x1 base64 transparent PNG stub for headless test verification
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };
  }

  _recordInput(action, details) {
    this.inputLog.push({ action, details, timestamp: Date.now() });
    if (this.inputLog.length > 100) this.inputLog.shift();
  }

  getInputLog() {
    return [...this.inputLog];
  }
}

module.exports = { VirtualDisplayServer };
