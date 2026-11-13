'use strict';

/**
 * MAVE Wabi-Grade Sovereign Optical Glass & Tactile Swarm Engine
 * 
 * Recreates the exact UI, fluid motion, optical refraction and flow:
 * 1. Warm cashmere/oatmeal aesthetic (#F8F3ED) & editorial serif typography
 * 2. Bottom translucent convex glass dome with "SWIPE UP TO ENTER"
 * 3. 1:1 tactile drag gesture: dome morphs into floating optical glass lens
 * 4. Convex optical text refraction: magnifies and warps "Meet MAVE." through glass
 * 5. Prismatic chromatic dispersion fringe (red, green, blue spectral aberration)
 * 6. Swarm fountain eruption: colorful floating AI marbles fountaining into Dynamic Island
 * 7. Luxury pill auth controls (Continue with Google / Continue with Apple / Email)
 * 8. Seamless calibration state holding MAVE's 25-yr sovereign conductor brain (Phi-4-mini 3.8B)
 */

const MARBLE_PALETTES = [
  { icon: '🧠', name: 'MAVE Conductor', grad: ['#ffffff', '#e2e8f0', '#cbd5e1'], rim: 'rgba(255,255,255,0.95)' },
  { icon: '💻', name: 'Specialist Coder', grad: ['#7dd3fc', '#0284c7', '#0369a1'], rim: 'rgba(56,189,248,0.9)' },
  { icon: '📐', name: 'Reasoning Engine', grad: ['#e9d5ff', '#9333ea', '#6b21a8'], rim: 'rgba(192,132,252,0.9)' },
  { icon: '🔍', name: 'Deep Research', grad: ['#fef08a', '#d97706', '#b45309'], rim: 'rgba(251,191,36,0.9)' },
  { icon: '👁️', name: 'Vision & Screen', grad: ['#fbcfe8', '#db2777', '#9d174d'], rim: 'rgba(244,114,182,0.9)' },
  { icon: '💾', name: 'Private Vault', grad: ['#a7f3d0', '#059669', '#065f46'], rim: 'rgba(52,211,153,0.9)' },
  { icon: '⚡', name: 'Mesh Cluster', grad: ['#c7d2fe', '#4f46e5', '#3730a3'], rim: 'rgba(129,140,248,0.9)' },
  { icon: '🔥', name: 'Fast Compute', grad: ['#fed7aa', '#ea580c', '#9a3412'], rim: 'rgba(251,146,60,0.9)' },
  { icon: '🍄', name: 'Creative Flow', grad: ['#fecdd3', '#e11d48', '#881337'], rim: 'rgba(251,113,133,0.9)' },
  { icon: '🐸', name: 'Autonomous Agent', grad: ['#bbf7d0', '#16a34a', '#14532d'], rim: 'rgba(74,222,128,0.9)' },
  { icon: '🍩', name: 'Memory Consolidation', grad: ['#fde68a', '#ca8a04', '#713f12'], rim: 'rgba(250,204,21,0.9)' },
  { icon: '💎', name: 'Privacy Sentinel', grad: ['#99f6e4', '#0d9488', '#115e59'], rim: 'rgba(45,212,191,0.9)' },
  { icon: '🚀', name: 'Task Executor', grad: ['#ddd6fe', '#7c3aed', '#4c1d95'], rim: 'rgba(167,139,250,0.9)' },
  { icon: '🪐', name: 'World Model', grad: ['#bae6fd', '#0284c7', '#075985'], rim: 'rgba(56,189,248,0.9)' },
];

const SPECIALIST_SWARM_ROSTER = [
  {
    id: 'phi-4-mini',
    role: 'conductor',
    name: 'MAVE Conductor',
    model: 'Phi-4-mini 3.8B',
    desc: '25-year-old sovereign conductor: screen triage, tools, and specialist dispatcher.',
    icon: '🧠',
    palette: {
      core: '#ffffff',
      gradient: ['#ffffff', '#e2e8f0', '#cbd5e1'],
      rim: 'rgba(255, 255, 255, 0.95)',
      halo: 'rgba(226, 232, 240, 0.55)',
      tag: 'Core Sovereign',
    },
    radius: 34,
    vram: '4.2 GB',
    cloudGated: false,
  },
  {
    id: 'qwen-coder',
    role: 'coding',
    name: 'Specialist Coder',
    model: 'Qwen 2.5-Coder 7B',
    desc: 'High-speed code synthesis, terminal operations, and automated test fixes.',
    icon: '💻',
    palette: {
      core: '#38bdf8',
      gradient: ['#7dd3fc', '#0284c7', '#0369a1'],
      rim: 'rgba(56, 189, 248, 0.9)',
      halo: 'rgba(14, 165, 233, 0.45)',
      tag: 'Code & Sandboxes',
    },
    radius: 27,
    vram: '4.5 GB',
    cloudGated: false,
  },
  {
    id: 'deepseek-r1',
    role: 'reasoning',
    name: 'Specialist Reasoning',
    model: 'DeepSeek-R1-Distill',
    desc: 'Exhaustive step-by-step logic, mathematical proofs, and architectural audits.',
    icon: '📐',
    palette: {
      core: '#c084fc',
      gradient: ['#e9d5ff', '#9333ea', '#6b21a8'],
      rim: 'rgba(192, 132, 252, 0.9)',
      halo: 'rgba(147, 51, 234, 0.45)',
      tag: 'Logic & Proofs',
    },
    radius: 27,
    vram: '5.1 GB',
    cloudGated: false,
  },
  {
    id: 'chatgpt-research',
    role: 'research',
    name: 'Deep Research Engine',
    model: 'ChatGPT Deep Research',
    desc: 'Multi-source citation synthesis, cross-web investigations, and whitepapers.',
    icon: '🔍',
    palette: {
      core: '#fbbf24',
      gradient: ['#fef08a', '#d97706', '#b45309'],
      rim: 'rgba(251, 191, 36, 0.9)',
      halo: 'rgba(217, 119, 6, 0.45)',
      tag: 'Deep Synthesis',
    },
    radius: 25,
    vram: 'Cloud / API',
    cloudGated: true,
  },
  {
    id: 'qwen-vl',
    role: 'vision',
    name: 'Vision & Screen Agent',
    model: 'Qwen 2.5-VL 7B',
    desc: 'Pixel-level UI inspection, OCR, diagram comprehension, and visual triage.',
    icon: '👁️',
    palette: {
      core: '#f472b6',
      gradient: ['#fbcfe8', '#db2777', '#9d174d'],
      rim: 'rgba(244, 114, 182, 0.9)',
      halo: 'rgba(219, 39, 119, 0.45)',
      tag: 'Screen & Vision',
    },
    radius: 25,
    vram: '4.8 GB',
    cloudGated: false,
  },
  {
    id: 'personal-nas',
    role: 'vault',
    name: 'Personal NAS & Drive',
    model: 'Sovereign Encrypted Vault',
    desc: 'Local file indexing, private photo vault, and cross-device synced drives.',
    icon: '💾',
    palette: {
      core: '#34d399',
      gradient: ['#a7f3d0', '#059669', '#065f46'],
      rim: 'rgba(52, 211, 153, 0.9)',
      halo: 'rgba(16, 185, 129, 0.45)',
      tag: 'Private Vault',
    },
    radius: 23,
    vram: '0.2 GB',
    cloudGated: false,
  },
  {
    id: 'mesh-cluster',
    role: 'cluster',
    name: 'Distributed Mesh Node',
    model: 'Exo GPU P2P Cluster',
    desc: 'Zero-config peer-to-peer compute pool aggregating idle GPUs across devices.',
    icon: '⚡',
    palette: {
      core: '#818cf8',
      gradient: ['#c7d2fe', '#4f46e5', '#3730a3'],
      rim: 'rgba(129, 140, 248, 0.9)',
      halo: 'rgba(79, 70, 229, 0.45)',
      tag: 'P2P Cluster',
    },
    radius: 23,
    vram: 'Mesh Shared',
    cloudGated: false,
  },
];

class MaveOpticGlassRig {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' && typeof document !== 'undefined'
      ? document.getElementById(container)
      : container;

    this.options = {
      mode: options.mode || 'wabi_intro', // 'wabi_intro' | 'calibrating'
      size: options.size || 240,
      aspect: options.aspect || 1.25,
      interactive: options.interactive !== false,
      modelName: options.modelName || 'Phi-4-mini 3.8B',
      onUnlock: options.onUnlock || null,
      onEject: options.onEject || null,
      onCollapse: options.onCollapse || null,
      onSelectNode: options.onSelectNode || null,
      ...options,
    };

    this.width = this.options.size;
    this.height = Math.round(this.options.size * this.options.aspect);
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    // Lens & Dome Geometry
    this.lensRadius = Math.round(this.width * 0.38); // ~91px
    this.domeWidth = Math.round(this.width * 0.92);  // ~220px
    this.domeHeight = Math.round(this.height * 0.28); // ~84px

    this.basePos = { x: this.width / 2, y: this.height - 20 };
    this.lensPos = { x: this.basePos.x, y: this.basePos.y };
    this.lensVelocity = { x: 0, y: 0 };
    this.lensScale = 1.0;
    this.targetScale = 1.0;

    // Gesture & Transition Tracking
    this.dragProgress = 0.0; // 0.0 (resting dome) -> 1.0 (unlocked / floating sphere)
    this.targetProgress = 0.0;
    this.isPressed = false;
    this.isDragging = false;
    this.dragStartY = 0;
    this.dragStartX = 0;
    this.pointerPos = { x: 0, y: 0 };
    this.lastPointerPos = { x: 0, y: 0 };
    this.pointerVelocity = { x: 0, y: 0 };
    this.lastPointerTime = 0;
    this.isUnlocked = false;

    // Swarm Fountain & Marbles
    this.isSwarmEjected = false;
    this.shockwaveRadius = 0;
    this.shockwaveAlpha = 0;
    this.marbles = [];
    this.nodes = [];
    this._initSwarm();

    // DOM & Canvas
    this.canvas = null;
    this.ctx = null;
    this.animId = null;
    this.lastFrameTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.idleTime = 0;

    this._boundOnPointerDown = this._onPointerDown.bind(this);
    this._boundOnPointerMove = this._onPointerMove.bind(this);
    this._boundOnPointerUp = this._onPointerUp.bind(this);
    this._boundOnPointerCancel = this._onPointerUp.bind(this);

    if (this.container && typeof document !== 'undefined') {
      this._buildDOM();
      this._bindEvents();
      this.start();
    }
  }

  _initSwarm() {
    // 1. Specialist Roster Nodes (for calibration mode)
    this.nodes = SPECIALIST_SWARM_ROSTER.map((item, idx) => {
      let targetX = this.basePos.x;
      let targetY = this.height * 0.42;

      if (item.role === 'conductor') {
        targetX = this.basePos.x;
        targetY = this.basePos.y - 10;
      } else {
        const satelliteIdx = idx - 1;
        const totalSatellites = SPECIALIST_SWARM_ROSTER.length - 1;
        const angle = -Math.PI / 2 + (satelliteIdx * (2 * Math.PI / totalSatellites));
        targetX = this.basePos.x + Math.cos(angle) * (this.width * 0.36);
        targetY = (this.height * 0.42) + Math.sin(angle) * (this.height * 0.22);
      }

      return {
        ...item,
        pos: { x: this.basePos.x, y: this.basePos.y },
        prev: { x: this.basePos.x, y: this.basePos.y },
        acc: { x: 0, y: 0 },
        target: { x: targetX, y: targetY },
        currentRadius: item.radius,
        alpha: 0,
        scale: 0.1,
      };
    });

    // 2. Fountain Marbles (for Wabi swipe-up eruption)
    this.marbles = MARBLE_PALETTES.map((p, i) => {
      return {
        ...p,
        pos: { x: this.width / 2, y: this.height - 80 },
        prev: { x: this.width / 2, y: this.height - 80 },
        vel: { x: 0, y: 0 },
        radius: 17 + (i % 5) * 2.5,
        targetY: 60 + (i % 4) * 32,
        targetX: (this.width * 0.15) + ((i * 47) % Math.round(this.width * 0.70)),
        active: false,
        alpha: 0,
        scale: 0.1,
      };
    });
  }

  _buildDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('wabi-rig-host');

    const wrapper = document.createElement('div');
    wrapper.className = 'wabi-canvas-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = `${this.width}px`;
    wrapper.style.height = `${this.height}px`;
    wrapper.style.margin = '0 auto';
    wrapper.style.userSelect = 'none';
    wrapper.style.touchAction = 'none';
    wrapper.style.cursor = 'grab';

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wabi-optic-canvas';
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) {
      this.ctx.scale(this.dpr, this.dpr);
    }

    wrapper.appendChild(this.canvas);
    this.container.appendChild(wrapper);
    this.wrapper = wrapper;
  }

  _bindEvents() {
    if (!this.canvas || !this.options.interactive) return;

    this.canvas.addEventListener('pointerdown', this._boundOnPointerDown, { passive: false });
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', this._boundOnPointerMove, { passive: false });
      window.addEventListener('pointerup', this._boundOnPointerUp, { passive: false });
      window.addEventListener('pointercancel', this._boundOnPointerCancel, { passive: false });
    }
  }

  _getCanvasCoords(e) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  _onPointerDown(e) {
    if (!this.options.interactive) return;
    e.preventDefault();

    const coords = this._getCanvasCoords(e);
    this.dragStartX = coords.x;
    this.dragStartY = coords.y;
    this.pointerPos = { ...coords };
    this.lastPointerPos = { ...coords };
    this.lastPointerTime = performance.now();
    this.pointerVelocity = { x: 0, y: 0 };

    // Zero-latency response: Compress scale by 0.97
    this.isPressed = true;
    this.isDragging = true;
    this.targetScale = 0.97;
    if (this.wrapper) this.wrapper.style.cursor = 'grabbing';

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(10); } catch {}
    }
  }

  _onPointerMove(e) {
    if (!this.options.interactive) return;

    const coords = this._getCanvasCoords(e);
    const now = performance.now();
    const dt = Math.max(1, now - this.lastPointerTime);

    this.pointerVelocity = {
      x: (coords.x - this.lastPointerPos.x) / (dt / 1000),
      y: (coords.y - this.lastPointerPos.y) / (dt / 1000),
    };

    this.lastPointerPos = { ...this.pointerPos };
    this.pointerPos = { ...coords };
    this.lastPointerTime = now;

    if (this.isDragging) {
      e.preventDefault();

      if (this.options.mode === 'wabi_intro') {
        // Compute upward drag progress (0 to 1)
        const upwardDy = this.dragStartY - this.pointerPos.y;
        const dragDist = Math.max(0, upwardDy);
        const maxDrag = this.height * 0.45;
        this.targetProgress = Math.min(1.0, dragDist / maxDrag);

        // Threshold check to trigger unlock / fountain
        if (this.targetProgress >= 0.52 && !this.isUnlocked) {
          this.triggerUnlock();
        }
      } else {
        // Calibration drag
        const dx = this.pointerPos.x - this.dragStartX;
        const dy = this.pointerPos.y - this.dragStartY;
        this.lensPos.x = this.basePos.x + dx * 0.85;
        this.lensPos.y = (this.height * 0.42) + dy * 0.85;
      }
    }
  }

  _onPointerUp(e) {
    if (!this.isDragging && !this.isPressed) return;

    this.isPressed = false;
    this.isDragging = false;
    this.targetScale = 1.0;
    if (this.wrapper) this.wrapper.style.cursor = 'grab';

    if (this.options.mode === 'wabi_intro') {
      const flingUp = this.pointerVelocity.y < -260;
      if ((this.dragProgress >= 0.40 || flingUp) && !this.isUnlocked) {
        this.triggerUnlock();
      } else if (!this.isUnlocked) {
        // Rebound back down to resting dome
        this.targetProgress = 0.0;
      }
    }
  }

  triggerUnlock() {
    if (this.isUnlocked) return;
    this.isUnlocked = true;
    this.targetProgress = 1.0;
    this.shockwaveRadius = this.lensRadius * 0.6;
    this.shockwaveAlpha = 0.95;

    // Erupt marble fountain upward
    this.marbles.forEach((m, idx) => {
      m.active = true;
      m.alpha = 1.0;
      m.scale = 0.2;
      m.pos.x = this.width / 2 + (Math.random() - 0.5) * 40;
      m.pos.y = this.height * 0.55;

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const speed = 280 + Math.random() * 260;
      m.vel.x = Math.cos(angle) * speed;
      m.vel.y = Math.sin(angle) * speed;
    });

    if (typeof this.options.onUnlock === 'function') {
      this.options.onUnlock();
    }
  }

  ejectSwarm() {
    this.isSwarmEjected = true;
    this.triggerUnlock();
    this.nodes.forEach((n) => {
      n.alpha = 1;
      n.scale = 0.5;
    });
    if (typeof this.options.onEject === 'function') {
      this.options.onEject(this.nodes);
    }
  }

  collapseSwarm() {
    this.isSwarmEjected = false;
    this.resetToIntro();
    this.nodes.forEach((n) => {
      n.target.x = this.basePos.x;
      n.target.y = this.basePos.y;
    });
    if (typeof this.options.onCollapse === 'function') {
      this.options.onCollapse();
    }
  }

  resetToIntro() {
    this.isUnlocked = false;
    this.targetProgress = 0.0;
    this.marbles.forEach((m) => {
      m.active = false;
      m.alpha = 0;
    });
  }

  start() {
    if (this.animId) return;
    const loop = (time) => {
      this._updatePhysics(time);
      this._renderFrame(time);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  destroy() {
    this.stop();
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this._boundOnPointerDown);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this._boundOnPointerMove);
      window.removeEventListener('pointerup', this._boundOnPointerUp);
      window.removeEventListener('pointercancel', this._boundOnPointerCancel);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  // --- Physics & Interpolation ---
  _updatePhysics(time) {
    const elapsed = (time - this.lastFrameTime) / 1000;
    const dt = (elapsed > 0 && elapsed <= 0.1) ? Math.min(0.033, elapsed) : 0.016;
    this.lastFrameTime = time;
    this.idleTime += dt;

    // Smooth drag progress interpolation
    this.dragProgress += (this.targetProgress - this.dragProgress) * 0.16;
    this.lensScale += (this.targetScale - this.lensScale) * 0.25;

    // Compute lens position based on drag progress
    const restingY = this.height + 40;
    const activeY = this.height * 0.52;
    const currentCenterY = restingY - (restingY - activeY) * this.dragProgress;
    this.lensPos.x = this.width / 2;
    this.lensPos.y = currentCenterY;

    // Shockwave decay
    if (this.shockwaveAlpha > 0.01) {
      this.shockwaveRadius += 180 * dt;
      this.shockwaveAlpha *= 0.90;
    } else {
      this.shockwaveAlpha = 0;
    }

    // Marble Fountain Physics (2D Ballistics + Top Gathering)
    if (this.isUnlocked) {
      const gravity = 420; // gentle gravity
      this.marbles.forEach((m) => {
        if (!m.active) return;

        // Smooth scale expansion
        if (m.scale < 1.0) m.scale += (1.0 - m.scale) * 0.18;

        // Move
        m.pos.x += m.vel.x * dt;
        m.pos.y += m.vel.y * dt;
        m.vel.y += gravity * dt;

        // Air damping
        m.vel.x *= 0.98;
        m.vel.y *= 0.98;

        // Wall collisions
        const r = m.radius;
        if (m.pos.x < r + 10) {
          m.pos.x = r + 10;
          m.vel.x = Math.abs(m.vel.x) * 0.65;
        } else if (m.pos.x > this.width - r - 10) {
          m.pos.x = this.width - r - 10;
          m.vel.x = -Math.abs(m.vel.x) * 0.65;
        }

        // Top window boundary collision
        if (m.pos.y < r + 16) {
          m.pos.y = r + 16;
          m.vel.y = Math.abs(m.vel.y) * 0.60;
        }

        // Float / settle in top cluster
        const targetPull = (m.targetY - m.pos.y) * 4.5;
        m.vel.y += targetPull * dt;
        const targetPullX = (m.targetX - m.pos.x) * 2.0;
        m.vel.x += targetPullX * dt;
      });

      // Inter-marble elastic collision
      for (let i = 0; i < this.marbles.length; i++) {
        for (let j = i + 1; j < this.marbles.length; j++) {
          const a = this.marbles[i];
          const b = this.marbles[j];
          if (!a.active || !b.active) continue;

          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 3;

          if (dist < minDist) {
            const overlap = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;
            a.pos.x -= nx * overlap;
            a.pos.y -= ny * overlap;
            b.pos.x += nx * overlap;
            b.pos.y += ny * overlap;
          }
        }
      }
    }
  }

  // --- Rendering ---
  _renderFrame(time) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Warm Cashmere Canvas Fill (#F8F3ED)
    ctx.fillStyle = '#F8F3ED';
    ctx.fillRect(0, 0, this.width, this.height);

    // Top Dynamic Island Notch Pill
    this._renderDynamicIsland(ctx);

    if (this.options.mode === 'wabi_intro') {
      this._renderWabiIntroScene(ctx, time);
    } else {
      this._renderCalibrationScene(ctx, time);
    }
  }

  _renderDynamicIsland(ctx) {
    const pillW = 126;
    const pillH = 32;
    const pillX = (this.width - pillW) / 2;
    const pillY = 14;

    ctx.save();
    // Pill background
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 999);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Camera dot on right
    ctx.beginPath();
    ctx.arc(pillX + pillW - 20, pillY + pillH / 2, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // Speaker slit
    ctx.beginPath();
    ctx.roundRect(pillX + 22, pillY + pillH / 2 - 1.5, 34, 3, 999);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.restore();
  }

  _renderWabiIntroScene(ctx, time) {
    const P = this.dragProgress;

    // 1. Background Typography (Editorial Serif)
    this._renderTypography(ctx, P);

    // 2. Shockwave on unlock
    if (this.shockwaveAlpha > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.lensPos.x, this.lensPos.y, this.shockwaveRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(147, 197, 253, ${this.shockwaveAlpha})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Floating Marbles (Fountain)
    if (this.isUnlocked) {
      this.marbles.forEach((m) => {
        if (m.active) this._renderMarble(ctx, m);
      });
    }

    // 4. Optical Convex Glass Dome / Sphere
    this._renderWabiGlassLens(ctx, P, time);
  }

  _renderTypography(ctx, P) {
    ctx.save();
    ctx.textAlign = 'center';

    // State 1: "A new era of software is here." (Fades out with P)
    const alphaA = Math.max(0, 1.0 - P * 2.2);
    if (alphaA > 0.01) {
      ctx.fillStyle = `rgba(42, 38, 35, ${alphaA})`;
      ctx.font = '400 32px "New York", "Didot", "Cormorant Garamond", "Playfair Display", Georgia, serif';
      ctx.letterSpacing = '-0.02em';
      const textY = this.height * 0.44 - (P * 40);
      ctx.fillText('A new era of', this.width / 2, textY);
      ctx.fillText('software is here.', this.width / 2, textY + 38);
    }

    // State 2: "Meet MAVE. The first personal software platform." (Fades in with P)
    const alphaB = Math.min(1.0, Math.max(0, (P - 0.22) * 1.8));
    if (alphaB > 0.01) {
      ctx.fillStyle = `rgba(42, 38, 35, ${alphaB})`;
      const textY = this.height * 0.50;

      // "Meet" Roman serif, "MAVE." Italic serif
      ctx.font = '400 34px "New York", "Didot", "Cormorant Garamond", "Playfair Display", Georgia, serif';
      ctx.fillText('Meet MAVE.', this.width / 2, textY);

      // Subtitle
      ctx.font = '400 14.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = `rgba(120, 113, 108, ${alphaB})`;
      ctx.fillText('The first personal software platform.', this.width / 2, textY + 32);
    }

    ctx.restore();
  }

  _renderWabiGlassLens(ctx, P, time) {
    ctx.save();

    // Dome interpolation:
    // P=0: Wide bottom dome (Rx ~ 180, Ry ~ 110, Center Y = H + 25)
    // P=1: Floating circular sphere (R ~ 72, Center Y = H * 0.52)
    const cx = this.lensPos.x;
    const cy = this.lensPos.y;

    const rx = this.domeWidth * 0.5 * (1.0 - P) + this.lensRadius * P;
    const ry = this.domeHeight * 0.55 * (1.0 - P) + this.lensRadius * P;
    const effectiveR = Math.max(rx, ry);

    // 1. Soft Ambient Ground Shadow
    const shadowGrad = ctx.createRadialGradient(cx, cy + ry * 0.85, ry * 0.2, cx, cy + ry * 0.85, rx * 1.15);
    shadowGrad.addColorStop(0, 'rgba(42, 38, 35, 0.16)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.85, rx * 1.05, ry * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Optical Magnification of Underneath Text
    // Clip to the glass lens boundary
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    // Fill with translucent glass body
    const glassFill = ctx.createRadialGradient(
      cx - rx * 0.25, cy - ry * 0.30, 20,
      cx, cy, effectiveR
    );
    glassFill.addColorStop(0.0, 'rgba(255, 255, 255, 0.82)');
    glassFill.addColorStop(0.5, 'rgba(248, 243, 237, 0.65)');
    glassFill.addColorStop(0.85, 'rgba(235, 227, 218, 0.50)');
    glassFill.addColorStop(1.0, 'rgba(215, 204, 192, 0.62)');
    ctx.fillStyle = glassFill;
    ctx.fill();

    // Draw Optical Refraction of the text "Meet MAVE." through the glass lens
    if (P > 0.15) {
      const textY = this.height * 0.50;
      const distToText = Math.abs(cy - textY);

      if (distToText < ry * 1.4) {
        ctx.save();
        // Convex magnification transform centered at the lens
        ctx.translate(cx, cy);
        ctx.scale(1.36, 1.36); // 1.36x optical zoom
        ctx.translate(-cx, -cy);

        // Chromatic aberration split (Red +3px, Blue -3px)
        // Red channel
        ctx.font = '400 34px "New York", "Didot", "Cormorant Garamond", "Playfair Display", Georgia, serif';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.65)';
        ctx.textAlign = 'center';
        ctx.fillText('Meet MAVE.', cx + 3, textY);

        // Blue channel
        ctx.fillStyle = 'rgba(59, 130, 246, 0.65)';
        ctx.fillText('Meet MAVE.', cx - 3, textY);

        // Core Refracted Lettering
        ctx.fillStyle = 'rgba(42, 38, 35, 0.95)';
        ctx.fillText('Meet MAVE.', cx, textY);

        ctx.font = '400 14.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = 'rgba(120, 113, 108, 0.90)';
        ctx.fillText('The first personal software platform.', cx, textY + 32);

        ctx.restore();
      }
    }

    // Inside-dome label: "SWIPE UP TO ENTER" (when resting at bottom, P < 0.3)
    if (P < 0.35) {
      const swipeAlpha = Math.max(0, 1.0 - P * 3.5);
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.letterSpacing = '0.22em';
      ctx.fillStyle = `rgba(42, 38, 35, ${swipeAlpha * 0.45})`;
      ctx.textAlign = 'center';
      ctx.fillText('SWIPE UP TO ENTER', cx, cy - ry * 0.32);
    }

    ctx.restore();

    // 3. Prismatic Rainbow Dispersion Rim (Chromatic aberration around perimeter)
    const rainbowGrad = ctx.createConicGradient(time * 0.0006, cx, cy);
    rainbowGrad.addColorStop(0.00, 'rgba(255, 107, 107, 0.85)');
    rainbowGrad.addColorStop(0.25, 'rgba(254, 211, 48, 0.80)');
    rainbowGrad.addColorStop(0.50, 'rgba(38, 222, 129, 0.85)');
    rainbowGrad.addColorStop(0.75, 'rgba(56, 189, 248, 0.90)');
    rainbowGrad.addColorStop(1.00, 'rgba(192, 132, 252, 0.85)');

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rainbowGrad;
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // 4. Hairline Crisp Glass Border
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 5. Specular Gloss Curve (Top left glare)
    const glareX = cx - rx * 0.34;
    const glareY = cy - ry * 0.36;
    const glareGrad = ctx.createRadialGradient(glareX, glareY, 2, glareX, glareY, rx * 0.46);
    glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glareGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.50)');
    glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(glareX, glareY, rx * 0.42, ry * 0.24, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = glareGrad;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  _renderMarble(ctx, m) {
    ctx.save();
    const cx = m.pos.x;
    const cy = m.pos.y;
    const r = m.radius * m.scale;

    // Outer Halo
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.4);
    halo.addColorStop(0, m.rim);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Base Sphere Gradient
    const grad = ctx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.3, r * 0.1,
      cx, cy, r
    );
    grad.addColorStop(0, m.grad[0]);
    grad.addColorStop(0.55, m.grad[1]);
    grad.addColorStop(1, m.grad[2]);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Rim
    ctx.strokeStyle = m.rim;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Specular Glare
    const glareX = cx - r * 0.32;
    const glareY = cy - r * 0.35;
    const glare = ctx.createRadialGradient(glareX, glareY, 1, glareX, glareY, r * 0.5);
    glare.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glare;
    ctx.beginPath();
    ctx.ellipse(glareX, glareY, r * 0.4, r * 0.22, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Icon
    ctx.font = `${Math.round(r * 0.75)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.icon, cx, cy + 1);

    ctx.restore();
  }

  _renderCalibrationScene(ctx, time) {
    const cx = this.width / 2;
    const cy = this.height * 0.42;
    const R = this.lensRadius;

    // Atmospheric breathing
    const breathe = Math.sin(time * 0.002) * 2;
    const effectiveR = R + breathe;

    // 1. Orbiting Specialist Satellite Marbles
    const totalSatellites = SPECIALIST_SWARM_ROSTER.length - 1;
    SPECIALIST_SWARM_ROSTER.slice(1).forEach((item, idx) => {
      const angle = -Math.PI / 2 + (idx * (2 * Math.PI / totalSatellites)) + (time * 0.0003);
      const radX = this.width * 0.38;
      const radY = this.height * 0.24;
      const mx = cx + Math.cos(angle) * radX;
      const my = cy + Math.sin(angle) * radY;

      // Tether line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(mx, my);
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Render satellite marble
      this._renderMarble(ctx, {
        pos: { x: mx, y: my },
        radius: item.radius,
        scale: 1.0,
        grad: item.palette.gradient,
        rim: item.palette.rim,
        icon: item.icon,
      });
    });

    // 2. Central Sovereign Conductor Lens (Phi-4-mini 3.8B)
    this._renderCentralConductorLens(ctx, cx, cy, effectiveR, time);
  }

  _renderCentralConductorLens(ctx, cx, cy, R, time) {
    ctx.save();

    // Depth Shadow
    const shadow = ctx.createRadialGradient(cx, cy + R * 0.85, R * 0.2, cx, cy + R * 0.85, R * 1.15);
    shadow.addColorStop(0, 'rgba(42, 38, 35, 0.18)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.85, R * 1.05, R * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rainbow outer dispersion
    const rainbowGrad = ctx.createConicGradient(time * 0.0008, cx, cy);
    rainbowGrad.addColorStop(0.00, 'rgba(255, 107, 107, 0.85)');
    rainbowGrad.addColorStop(0.25, 'rgba(254, 211, 48, 0.80)');
    rainbowGrad.addColorStop(0.50, 'rgba(38, 222, 129, 0.85)');
    rainbowGrad.addColorStop(0.75, 'rgba(56, 189, 248, 0.90)');
    rainbowGrad.addColorStop(1.00, 'rgba(192, 132, 252, 0.85)');

    ctx.beginPath();
    ctx.arc(cx, cy, R + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = rainbowGrad;
    ctx.lineWidth = 3.0;
    ctx.stroke();

    // Convex Optical Glass Volume
    const glass = ctx.createRadialGradient(
      cx - R * 0.28, cy - R * 0.32, R * 0.08,
      cx, cy, R
    );
    glass.addColorStop(0.00, 'rgba(255, 255, 255, 0.98)');
    glass.addColorStop(0.35, 'rgba(248, 243, 237, 0.92)');
    glass.addColorStop(0.70, 'rgba(235, 227, 218, 0.85)');
    glass.addColorStop(1.00, 'rgba(203, 213, 225, 0.92)');

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = glass;
    ctx.fill();

    // Hairline border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Top-left Glare
    const glareX = cx - R * 0.32;
    const glareY = cy - R * 0.36;
    const glare = ctx.createRadialGradient(glareX, glareY, 2, glareX, glareY, R * 0.48);
    glare.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    glare.addColorStop(0.5, 'rgba(255, 255, 255, 0.55)');
    glare.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.ellipse(glareX, glareY, R * 0.44, R * 0.26, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = glare;
    ctx.fill();

    // Conductor Glyph
    ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧠', cx, cy + 1);

    ctx.restore();
  }
}

// Universal Module Export (Browser + Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MaveOpticGlassRig, SPECIALIST_SWARM_ROSTER, MARBLE_PALETTES };
}
if (typeof window !== 'undefined') {
  window.MaveOpticGlassRig = MaveOpticGlassRig;
  window.SPECIALIST_SWARM_ROSTER = SPECIALIST_SWARM_ROSTER;
  window.MARBLE_PALETTES = MARBLE_PALETTES;
}
