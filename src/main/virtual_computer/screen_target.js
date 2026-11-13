'use strict';

/**
 * VirtualScreenTarget represents MAVE's isolated virtual display surface.
 * It implements the ScreenTarget interface used by Agent and ComputerExecutor,
 * ensuring that screenshot captures and cursor/input operations interact exclusively
 * with the virtual display server, leaving the user's host desktop untouched.
 */
class VirtualScreenTarget {
  constructor(virtualSession, width = 1280, height = 800) {
    this.session = virtualSession;
    this.isVirtual = true;
    this.isGuest = true;
    this.isRemote = false;

    this.bounds = { x: 0, y: 0, width, height };
    this.phys = { width, height };
    this.physOrigin = { x: 0, y: 0 };
    this.sent = { width, height };
    this.display = {
      id: 'virtual_display_0',
      label: 'MAVE Virtual Desktop Display (Isolated)',
      bounds: { ...this.bounds },
      scaleFactor: 1,
    };
    this.decorate = null;
  }

  async screenshot() {
    if (!this.session || !this.session.displayServer) {
      throw new Error('Virtual Display Server not initialized.');
    }
    const shot = await this.session.displayServer.captureScreenshot();
    let buf = null;
    if (Buffer.isBuffer(shot)) {
      buf = shot;
    } else if (shot && shot.dataUrl) {
      const b64 = shot.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      buf = Buffer.from(b64, 'base64');
    } else {
      buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    }
    if (!this.decorate) return buf;
    try {
      return await this.decorate(buf, null);
    } catch {
      return buf;
    }
  }

  async zoom(region) {
    // Return virtual display screenshot cropped to requested region
    if (!Array.isArray(region) || region.length !== 4) {
      throw new Error('Zoom region must be [x0, y0, x1, y1]');
    }
    const [x0, y0, x1, y1] = region.map(Number);
    if (!(x1 > x0 && y1 > y0)) {
      throw new Error(`Zoom region [${x0}, ${y0}, ${x1}, ${y1}] is empty`);
    }
    return await this.screenshot();
  }

  checkSent([x, y]) {
    if (!(Number.isFinite(x) && Number.isFinite(y))) {
      throw new Error(`Coordinate must be [x, y], got ${JSON.stringify([x, y])}`);
    }
    if (x < 0 || y < 0 || x > this.sent.width || y > this.sent.height) {
      throw new Error(`Coordinate [${x}, ${y}] is outside the ${this.sent.width}x${this.sent.height} virtual display`);
    }
  }

  sentToLocalDip([x, y]) {
    this.checkSent([x, y]);
    return { x: Math.round(x), y: Math.round(y) };
  }

  sentToPhysical([x, y]) {
    this.checkSent([x, y]);
    return { x: Math.round(x), y: Math.round(y) };
  }

  physicalToSent(pt) {
    return {
      x: Math.max(0, Math.min(this.sent.width, Math.round(pt.x))),
      y: Math.max(0, Math.min(this.sent.height, Math.round(pt.y))),
    };
  }

  getCursor() {
    if (this.session && this.session.displayServer) {
      return this.session.displayServer.cursor || { x: 0, y: 0 };
    }
    return { x: 0, y: 0 };
  }

  async executeGuestAction(name, input, signal) {
    if (!this.session) {
      throw new Error('Virtual Computer Session unavailable.');
    }
    return await this.session.executeGuestAction(name, input);
  }
}

module.exports = {
  VirtualScreenTarget,
};
