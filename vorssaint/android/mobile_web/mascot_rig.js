'use strict';

/**
 * Vorssaint Authentic Companion Mascot Rig
 * 1:1 Implementation of macOS Swift NotchMascotView.swift & NotchMascotSupport.swift
 * 
 * Features:
 * - Styles: Minimal vs Robot
 * - Shapes: Ball, Egg, Squircle, Pill
 * - Palettes: Pearl, Lemon, Peach, Rose, Lilac, Sky, Mint
 * - Layers: Hopper, Squasher, Tilter, Visor, Antenna, Bulb, Shine, Eyes
 * - Physics: Squash & stretch, jump hop, head tilt, natural blinks (2.5-6s)
 * - Gaze Tracking: Eyes follow pointer with smooth spring damping
 * - Expressions: idle, celebrate (hop + crescent eyes ^ ^), love (heartbeat + floating hearts),
 *   sleepy (closed drooped eyes - - + floating z Z), groove (tempo bobbing),
 *   think (tilted inquiring gaze), surprised (wide pop), wink (playful wink), alert
 */

class VorssaintMascotRig {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' && typeof document !== 'undefined'
      ? document.getElementById(container)
      : container;
    this.size = options.size || 32;
    this.style = options.style || 'minimal'; // 'minimal' | 'robot'
    this.shape = options.shape || 'ball'; // 'ball' | 'egg' | 'squircle' | 'pill'
    this.palette = options.palette || 'pearl';
    this.idles = options.idles !== false;
    this.followsPointer = options.followsPointer !== false;

    // Mood & Motion state
    this.mood = 'idle';
    this.isBlinking = false;
    this.blinkTimer = null;
    this.gazeX = 0;
    this.gazeY = 0;
    this.targetGazeX = 0;
    this.targetGazeY = 0;
    this.animFrame = null;
    this.isPetting = false;
    this.petTimer = null;

    // Palettes map (light, shade) matching NotchMascotSupport.swift
    this.palettes = {
      pearl: { light: '#FCFAF5', shade: '#D6D9E6' },
      lemon: { light: '#FFF5A3', shade: '#F7D44D' },
      peach: { light: '#FFDBBD', shade: '#FAA380' },
      rose:  { light: '#FFCCDE', shade: '#F28AAD' },
      lilac: { light: '#E0D4FF', shade: '#B096F5' },
      sky:   { light: '#C4E6FF', shade: '#6EABF7' },
      mint:  { light: '#B8F7DB', shade: '#66D4A8' },
    };

    if (typeof document !== 'undefined') {
      this.initDOM();
      this.applyConfiguration();
      this.startBlinkLoop();
      this.startGazePhysics();
      this.bindEvents();
    }
  }

  initDOM() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.classList.add('vorssaint-mascot-root');

    this.root = document.createElement('div');
    this.root.className = 'mascot-root';
    this.root.style.width = `${this.size}px`;
    this.root.style.height = `${this.size}px`;

    // Hopper & Squasher physics layers
    this.hopper = document.createElement('div');
    this.hopper.className = 'mascot-hopper';

    this.squasher = document.createElement('div');
    this.squasher.className = 'mascot-squasher';

    this.tilter = document.createElement('div');
    this.tilter.className = 'mascot-tilter';

    // SVG graphics container for pixel-perfect curved vector rendering
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 100 100');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.className = 'mascot-svg';

    // Definitions: Gradients & Shadows
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Body Gradient
    this.gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    this.gradientId = 'mascot-grad-' + Math.random().toString(36).slice(2, 7);
    this.gradient.setAttribute('id', this.gradientId);
    this.gradient.setAttribute('x1', '0%');
    this.gradient.setAttribute('y1', '0%');
    this.gradient.setAttribute('x2', '0%');
    this.gradient.setAttribute('y2', '100%');

    this.stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    this.stop1.setAttribute('offset', '0%');
    this.stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    this.stop2.setAttribute('offset', '100%');
    this.gradient.appendChild(this.stop1);
    this.gradient.appendChild(this.stop2);
    defs.appendChild(this.gradient);

    // Glow filter for robot antenna bulb and visor eyes
    const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    this.glowFilterId = 'mascot-glow-' + Math.random().toString(36).slice(2, 7);
    glowFilter.setAttribute('id', this.glowFilterId);
    glowFilter.setAttribute('x', '-30%');
    glowFilter.setAttribute('y', '-30%');
    glowFilter.setAttribute('width', '160%');
    glowFilter.setAttribute('height', '160%');
    glowFilter.innerHTML = `
      <feGaussianBlur stdDeviation="3.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    `;
    defs.appendChild(glowFilter);
    this.svg.appendChild(defs);

    // Robot ears
    this.earsPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.earsPath.className = 'mascot-ears';
    this.earsPath.setAttribute('d', 'M 5 50 a 3.5 3.5 0 0 1 8 0 v 20 a 3.5 3.5 0 0 1 -8 0 Z M 87 50 a 3.5 3.5 0 0 1 8 0 v 20 a 3.5 3.5 0 0 1 -8 0 Z');
    this.svg.appendChild(this.earsPath);

    // Robot antenna stalk & bulb
    this.antennaGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.antennaGroup.className = 'mascot-antenna-group';
    this.antennaStalk = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.antennaStalk.setAttribute('x', '47.5');
    this.antennaStalk.setAttribute('y', '12');
    this.antennaStalk.setAttribute('width', '5');
    this.antennaStalk.setAttribute('height', '16');
    this.antennaStalk.setAttribute('rx', '2.5');

    this.antennaBulb = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.antennaBulb.setAttribute('cx', '50');
    this.antennaBulb.setAttribute('cy', '11');
    this.antennaBulb.setAttribute('r', '7');
    this.antennaBulb.setAttribute('filter', `url(#${this.glowFilterId})`);
    this.antennaBulb.className = 'mascot-bulb';

    this.antennaGroup.appendChild(this.antennaStalk);
    this.antennaGroup.appendChild(this.antennaBulb);
    this.svg.appendChild(this.antennaGroup);

    // Body Shape Path
    this.bodyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.bodyPath.className = 'mascot-body';
    this.bodyPath.setAttribute('fill', `url(#${this.gradientId})`);
    this.svg.appendChild(this.bodyPath);

    // Robot Visor Faceplate
    this.visor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.visor.className = 'mascot-visor';
    this.visor.setAttribute('x', '20');
    this.visor.setAttribute('y', '44');
    this.visor.setAttribute('width', '60');
    this.visor.setAttribute('height', '38');
    this.visor.setAttribute('rx', '15');
    this.visor.setAttribute('fill', '#141418');
    this.svg.appendChild(this.visor);

    // Minimal Specular Shine Highlight
    this.shine = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    this.shine.className = 'mascot-shine';
    this.shine.setAttribute('cx', '31');
    this.shine.setAttribute('cy', '29');
    this.shine.setAttribute('rx', '8.5');
    this.shine.setAttribute('ry', '5.5');
    this.shine.setAttribute('transform', 'rotate(-30 31 29)');
    this.shine.setAttribute('fill', '#ffffff');
    this.shine.setAttribute('opacity', '0.55');
    this.svg.appendChild(this.shine);

    // Eyes Face Layer
    this.faceGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.faceGroup.className = 'mascot-face-group';

    this.leftEye = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.leftEye.className = 'mascot-eye left';
    this.rightEye = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.rightEye.className = 'mascot-eye right';

    this.faceGroup.appendChild(this.leftEye);
    this.faceGroup.appendChild(this.rightEye);
    this.svg.appendChild(this.faceGroup);

    // Assembly
    this.tilter.appendChild(this.svg);
    this.squasher.appendChild(this.tilter);
    this.hopper.appendChild(this.squasher);
    this.root.appendChild(this.hopper);
    this.container.appendChild(this.root);

    // Overlay particles container (floating hearts or zZ)
    this.particles = document.createElement('div');
    this.particles.className = 'mascot-particles';
    this.root.appendChild(this.particles);
  }

  applyConfiguration() {
    if (!this.root) return;

    // Palette Colors
    const pal = this.palettes[this.palette] || this.palettes.pearl;
    this.stop1.setAttribute('stop-color', pal.light);
    this.stop2.setAttribute('stop-color', pal.shade);

    const isRobot = this.style === 'robot';

    // Show/hide robot vs minimal components
    if (this.earsPath) {
      this.earsPath.style.display = isRobot ? 'block' : 'none';
      this.earsPath.setAttribute('fill', pal.shade);
    }
    if (this.antennaGroup) {
      this.antennaGroup.style.display = isRobot ? 'block' : 'none';
      this.antennaStalk.setAttribute('fill', pal.shade);
      this.antennaBulb.setAttribute('fill', this.mood === 'sleepy' ? pal.shade : pal.light);
    }
    if (this.visor) {
      this.visor.style.display = isRobot ? 'block' : 'none';
    }
    if (this.shine) {
      this.shine.style.display = isRobot ? 'none' : 'block';
    }

    // Geometry Body Path (from NotchMascotGeometry in Swift)
    let bodyD = '';
    if (isRobot) {
      // Rounded robot head rect (0.12, 0.26, 0.76, 0.68)
      bodyD = 'M 32 26 h 36 a 20 20 0 0 1 20 20 v 28 a 20 20 0 0 1 -20 20 h -36 a 20 20 0 0 1 -20 -20 v -28 a 20 20 0 0 1 20 -20 Z';
    } else {
      switch (this.shape) {
        case 'egg':
          // Bezier Egg curve
          bodyD = 'M 50 10 C 71 10, 86 36, 86 60 C 86 80, 70 96, 50 96 C 30 96, 14 80, 14 60 C 14 36, 29 10, 50 10 Z';
          break;
        case 'squircle':
          // Superellipse squircle
          bodyD = 'M 50 15 C 80 15, 92 27, 92 57 C 92 87, 80 95, 50 95 C 20 95, 8 87, 8 57 C 8 27, 20 15, 50 15 Z';
          break;
        case 'pill':
          // Horizontal pill
          bodyD = 'M 35 28 h 30 a 30 30 0 0 1 30 30 a 30 30 0 0 1 -30 30 h -30 a 30 30 0 0 1 -30 -30 a 30 30 0 0 1 30 -30 Z';
          break;
        case 'ball':
        default:
          // Perfect circle ball
          bodyD = 'M 50 12 a 42 42 0 1 0 0.001 0 Z';
          break;
      }
    }
    this.bodyPath.setAttribute('d', bodyD);

    // Eye Fill & Colors
    const eyeFill = isRobot ? pal.light : '#121214';
    this.leftEye.setAttribute('fill', eyeFill);
    this.rightEye.setAttribute('fill', eyeFill);
    if (isRobot) {
      this.leftEye.setAttribute('filter', `url(#${this.glowFilterId})`);
      this.rightEye.setAttribute('filter', `url(#${this.glowFilterId})`);
    } else {
      this.leftEye.removeAttribute('filter');
      this.rightEye.removeAttribute('filter');
    }

    this.renderEyes();
  }

  // --- EYES & EXPRESSIONS (NotchMascotGeometry) ---
  renderEyes() {
    if (!this.leftEye || !this.rightEye) return;
    const isRobot = this.style === 'robot';

    // Base eye centers
    const cy = isRobot ? 63 : (this.shape === 'egg' ? 55 : (this.shape === 'pill' ? 57 : 50));
    const lx = 36;
    const rx = 64;

    let leftD = '';
    let rightD = '';

    if (this.isBlinking) {
      // Closed slit blink
      leftD = `M ${lx - 4} ${cy} h 8 v 1.2 h -8 Z`;
      rightD = `M ${rx - 4} ${cy} h 8 v 1.2 h -8 Z`;
    } else {
      switch (this.mood) {
        case 'celebrate':
        case 'happy':
          // Smiling crescent eyes (^ ^)
          leftD = `M ${lx - 5} ${cy + 3} Q ${lx} ${cy - 5} ${lx + 5} ${cy + 3} q -1 1.5 -2 1.5 Q ${lx} ${cy - 2} ${lx - 3} ${cy + 4.5} Z`;
          rightD = `M ${rx - 5} ${cy + 3} Q ${rx} ${cy - 5} ${rx + 5} ${cy + 3} q -1 1.5 -2 1.5 Q ${rx} ${cy - 2} ${rx - 3} ${cy + 4.5} Z`;
          break;
        case 'love':
          // Heart eyes
          leftD = `M ${lx} ${cy + 5} L ${lx - 5} ${cy} A 2.6 2.6 0 0 1 ${lx} ${cy - 3.5} A 2.6 2.6 0 0 1 ${lx + 5} ${cy} Z`;
          rightD = `M ${rx} ${cy + 5} L ${rx - 5} ${cy} A 2.6 2.6 0 0 1 ${rx} ${cy - 3.5} A 2.6 2.6 0 0 1 ${rx + 5} ${cy} Z`;
          break;
        case 'sleepy':
          // Drooping closed curved eyes (- -)
          leftD = `M ${lx - 5} ${cy - 1} Q ${lx} ${cy + 4} ${lx + 5} ${cy - 1} q -1 -1.5 -2 -1.5 Q ${lx} ${cy + 1.5} ${lx - 3} ${cy - 2.5} Z`;
          rightD = `M ${rx - 5} ${cy - 1} Q ${rx} ${cy + 4} ${rx + 5} ${cy - 1} q -1 -1.5 -2 -1.5 Q ${rx} ${cy + 1.5} ${rx - 3} ${cy - 2.5} Z`;
          break;
        case 'wink':
          // Left open, right winking crescent
          leftD = `M ${lx - 3.5} ${cy - 7} h 7 a 3.5 3.5 0 0 1 3.5 3.5 v 7 a 3.5 3.5 0 0 1 -3.5 3.5 h -7 a 3.5 3.5 0 0 1 -3.5 -3.5 v -7 a 3.5 3.5 0 0 1 3.5 -3.5 Z`;
          rightD = `M ${rx - 5} ${cy + 3} Q ${rx} ${cy - 5} ${rx + 5} ${cy + 3} q -1 1.5 -2 1.5 Q ${rx} ${cy - 2} ${rx - 3} ${cy + 4.5} Z`;
          break;
        case 'think':
          // Tilted squint
          leftD = `M ${lx - 4} ${cy - 3} h 8 a 2 2 0 0 1 2 2 v 4 a 2 2 0 0 1 -2 2 h -8 a 2 2 0 0 1 -2 -2 v -4 a 2 2 0 0 1 2 -2 Z`;
          rightD = `M ${rx - 3.5} ${cy - 7} h 7 a 3.5 3.5 0 0 1 3.5 3.5 v 7 a 3.5 3.5 0 0 1 -3.5 3.5 h -7 a 3.5 3.5 0 0 1 -3.5 -3.5 v -7 a 3.5 3.5 0 0 1 3.5 -3.5 Z`;
          break;
        case 'surprised':
        case 'alert':
          // Wide open round eyes
          leftD = `M ${lx} ${cy} m -5.5 0 a 5.5 5.5 0 1 0 11 0 a 5.5 5.5 0 1 0 -11 0 Z`;
          rightD = `M ${rx} ${cy} m -5.5 0 a 5.5 5.5 0 1 0 11 0 a 5.5 5.5 0 1 0 -11 0 Z`;
          break;
        case 'idle':
        default:
          // Attentive vertical pill eyes (3.5 x 7)
          leftD = `M ${lx - 3.5} ${cy - 7} h 7 a 3.5 3.5 0 0 1 3.5 3.5 v 7 a 3.5 3.5 0 0 1 -3.5 3.5 h -7 a 3.5 3.5 0 0 1 -3.5 -3.5 v -7 a 3.5 3.5 0 0 1 3.5 -3.5 Z`;
          rightD = `M ${rx - 3.5} ${cy - 7} h 7 a 3.5 3.5 0 0 1 3.5 3.5 v 7 a 3.5 3.5 0 0 1 -3.5 3.5 h -7 a 3.5 3.5 0 0 1 -3.5 -3.5 v -7 a 3.5 3.5 0 0 1 3.5 -3.5 Z`;
          break;
      }
    }

    this.leftEye.setAttribute('d', leftD);
    this.rightEye.setAttribute('d', rightD);
  }

  // --- BLINK LOOP (Swift Core Animation chaining) ---
  startBlinkLoop() {
    if (!this.idles) return;
    const scheduleNext = () => {
      const delay = 2200 + Math.random() * 3800; // 2.2s - 6.0s
      this.blinkTimer = setTimeout(() => {
        if (this.mood === 'idle' || this.mood === 'alert') {
          this.isBlinking = true;
          this.renderEyes();
          setTimeout(() => {
            this.isBlinking = false;
            this.renderEyes();
            scheduleNext();
          }, 140);
        } else {
          scheduleNext();
        }
      }, delay);
    };
    scheduleNext();
  }

  // --- GAZE SPRING INTERPOLATION ---
  startGazePhysics() {
    const update = () => {
      // Smooth lerp damping towards target gaze
      this.gazeX += (this.targetGazeX - this.gazeX) * 0.15;
      this.gazeY += (this.targetGazeY - this.gazeY) * 0.15;

      if (this.faceGroup) {
        this.faceGroup.style.transform = `translate(${this.gazeX.toFixed(2)}px, ${this.gazeY.toFixed(2)}px)`;
      }

      this.animFrame = requestAnimationFrame(update);
    };
    this.animFrame = requestAnimationFrame(update);
  }

  // --- INTERACTION & POINTER TRACKING ---
  bindEvents() {
    if (!this.root) return;

    // Pointer move gaze tracking
    window.addEventListener('mousemove', (e) => {
      if (!this.followsPointer || this.mood === 'sleepy') {
        this.targetGazeX = 0;
        this.targetGazeY = 0;
        return;
      }
      const rect = this.root.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / 80;
      const dy = (e.clientY - cy) / 80;
      this.targetGazeX = Math.max(-5, Math.min(5, dx));
      this.targetGazeY = Math.max(-3, Math.min(3, dy));
    });

    // Petting hover detection (1 second hold brings hearts)
    this.root.addEventListener('mouseenter', () => {
      if (this.mood === 'sleepy') {
        this.wakeUp();
      }
      this.petTimer = setTimeout(() => {
        this.pet();
      }, 950);
    });

    this.root.addEventListener('mouseleave', () => {
      clearTimeout(this.petTimer);
      this.targetGazeX = 0;
      this.targetGazeY = 0;
    });

    // Click / Tap triggers Hop
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hop();
    });
  }

  // --- MOTIONS & ACTIONS (1:1 with NotchMascotView.swift) ---

  hop() {
    if (!this.hopper || !this.squasher) return;
    this.setMood('celebrate');

    // Lift animation
    this.hopper.classList.remove('anim-hop');
    void this.hopper.offsetWidth; // trigger reflow
    this.hopper.classList.add('anim-hop');

    // Squash on impact
    this.squasher.classList.remove('anim-squash');
    void this.squasher.offsetWidth;
    this.squasher.classList.add('anim-squash');

    setTimeout(() => {
      this.setMood('idle');
      this.hopper.classList.remove('anim-hop');
      this.squasher.classList.remove('anim-squash');
    }, 700);
  }

  pet() {
    this.setMood('love');
    this.spawnParticles('💖');

    this.squasher.classList.remove('anim-heartbeat');
    void this.squasher.offsetWidth;
    this.squasher.classList.add('anim-heartbeat');

    setTimeout(() => {
      this.setMood('idle');
      this.squasher.classList.remove('anim-heartbeat');
    }, 1400);
  }

  groove() {
    this.setMood('happy');
    this.tilter.classList.remove('anim-groove');
    void this.tilter.offsetWidth;
    this.tilter.classList.add('anim-groove');

    setTimeout(() => {
      this.setMood('idle');
      this.tilter.classList.remove('anim-groove');
    }, 2200);
  }

  think() {
    this.setMood('think');
    this.tilter.style.transform = 'rotate(-8deg)';
    this.targetGazeX = 4;
    this.targetGazeY = -3;

    setTimeout(() => {
      this.tilter.style.transform = 'none';
      this.targetGazeX = 0;
      this.targetGazeY = 0;
      this.setMood('idle');
    }, 1800);
  }

  sleep() {
    this.setMood('sleepy');
    this.targetGazeX = 0;
    this.targetGazeY = 2;
    this.spawnParticles('z Z');
    if (this.antennaBulb) {
      const pal = this.palettes[this.palette] || this.palettes.pearl;
      this.antennaBulb.setAttribute('fill', pal.shade);
    }
  }

  wakeUp() {
    this.setMood('alert');
    this.hopper.classList.add('anim-hop');
    setTimeout(() => {
      this.hopper.classList.remove('anim-hop');
      this.setMood('idle');
      if (this.antennaBulb) {
        const pal = this.palettes[this.palette] || this.palettes.pearl;
        this.antennaBulb.setAttribute('fill', pal.light);
      }
    }, 550);
  }

  wink() {
    this.setMood('wink');
    this.tilter.style.transform = 'rotate(4deg)';
    setTimeout(() => {
      this.tilter.style.transform = 'none';
      this.setMood('idle');
    }, 900);
  }

  setMood(mood) {
    this.mood = mood;
    this.renderEyes();
  }

  spawnParticles(text) {
    if (!this.particles) return;
    const p = document.createElement('div');
    p.className = 'mascot-particle';
    p.textContent = text;
    this.particles.appendChild(p);
    setTimeout(() => {
      if (p.parentNode) p.parentNode.removeChild(p);
    }, 1200);
  }

  configure(opts = {}) {
    if (opts.style !== undefined) this.style = opts.style;
    if (opts.shape !== undefined) this.shape = opts.shape;
    if (opts.palette !== undefined) this.palette = opts.palette;
    if (opts.size !== undefined) {
      this.size = opts.size;
      if (this.root) {
        this.root.style.width = `${this.size}px`;
        this.root.style.height = `${this.size}px`;
      }
    }
    this.applyConfiguration();
  }

  destroy() {
    clearTimeout(this.blinkTimer);
    clearTimeout(this.petTimer);
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.container) this.container.innerHTML = '';
  }
}

// Export for Node/Electron and Browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VorssaintMascotRig };
}
if (typeof window !== 'undefined') {
  window.VorssaintMascotRig = VorssaintMascotRig;
}
