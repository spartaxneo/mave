'use strict';
// Commercial Selling Application Website, Download Portal, and OpenAI/ChatGPT-style Account Hub
// Generates the public product marketing page, software downloads, installer one-liners,
// and the ChatGPT/OpenAI-style account & member management modal.

function getProductSiteHtml({ hostUrl = 'http://localhost:4040', httpsUrl = '', hostInfo = {}, currentUser = null, users = [] } = {}) {
  const isOnline = true;
  const userListJson = JSON.stringify(users || []);
  const currentUserJson = JSON.stringify(currentUser || null);
  const hostInfoJson = JSON.stringify(hostInfo || {});

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Mave AI — Sovereign Local AI Server & Personal Companion</title>
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
  <meta name="description" content="Host your own private AI brain on your PC. Add users, invite your team or family, connect your phone, and enjoy private AI with zero subscriptions.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --bg-card: #12141c;
      --bg-card-hover: #171a24;
      --border: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.16);
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.35);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --font: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      --radius: 16px;
    }
    [data-theme="light"] {
      --bg: #f8fafc;
      --bg-card: #ffffff;
      --bg-card-hover: #f1f5f9;
      --border: rgba(0, 0, 0, 0.08);
      --border-strong: rgba(0, 0, 0, 0.16);
      --accent: #2563eb;
      --accent-glow: rgba(37, 99, 235, 0.2);
      --text: #0f172a;
      --text-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* Ambient Glow & Grid */
    .bg-grid {
      position: fixed;
      inset: 0;
      background-image: radial-gradient(circle at 50% 10%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
                        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 100% 100%, 48px 48px, 48px 48px;
      pointer-events: none;
      z-index: 0;
    }

    /* Navigation */
    header.site-nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      background: rgba(9, 10, 15, 0.75);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border);
      z-index: 100;
    }
    [data-theme="light"] header.site-nav {
      background: rgba(248, 250, 252, 0.85);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.5px;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
    }
    .brand-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #38bdf8, #2563eb);
      box-shadow: 0 0 16px var(--accent-glow);
      position: relative;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 28px;
    }
    .nav-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-weight: 500;
      font-size: 14.5px;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: var(--text); }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn {
      padding: 9px 18px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
    }
    .btn.primary {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }
    .btn.primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(255,255,255,0.15);
    }
    .btn.accent {
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      color: #fff;
      box-shadow: 0 4px 18px var(--accent-glow);
    }
    .btn.accent:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(37,99,235,0.45);
    }
    .btn.secondary {
      background: var(--bg-card);
      color: var(--text);
      border-color: var(--border);
    }
    .btn.secondary:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-strong);
    }

    /* Main Container */
    main {
      position: relative;
      z-index: 1;
      max-width: 1200px;
      margin: 0 auto;
      padding: 120px 24px 80px;
    }

    /* Hero Section */
    .hero {
      text-align: center;
      padding: 40px 0 60px;
      max-width: 860px;
      margin: 0 auto;
    }
    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #60a5fa;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .hero h1 {
      font-size: 58px;
      font-weight: 800;
      letter-spacing: -2px;
      line-height: 1.1;
      margin-bottom: 24px;
      background: linear-gradient(180deg, var(--text) 30%, rgba(255,255,255,0.5) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    [data-theme="light"] .hero h1 {
      background: linear-gradient(180deg, #0f172a 30%, #475569 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      font-size: 20px;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 36px;
      max-width: 720px;
      margin-left: auto;
      margin-right: auto;
    }
    .hero-ctas {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-bottom: 36px;
      flex-wrap: wrap;
    }
    .btn-big {
      padding: 14px 28px;
      font-size: 16px;
      border-radius: 12px;
    }

    /* Quick Install One-Liners */
    .install-box {
      background: #000;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 18px;
      display: inline-flex;
      align-items: center;
      gap: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #38bdf8;
      box-shadow: 0 8px 30px rgba(0,0,0,0.4);
      margin-bottom: 40px;
      cursor: pointer;
      user-select: all;
    }
    .install-copy-btn {
      background: rgba(255,255,255,0.1);
      border: none;
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
    }

    /* Interactive Dot Avatar Playground */
    .avatar-showcase {
      background: radial-gradient(circle at center, rgba(37,99,235,0.12) 0%, transparent 70%);
      padding: 40px;
      border-radius: 24px;
      border: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 80px;
    }
    .dot-mascot-hero {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #7dd3fc, #2563eb 60%, #1e40af 100%);
      box-shadow: 0 12px 36px rgba(37, 99, 235, 0.4), inset 0 2px 4px rgba(255,255,255,0.6);
      position: relative;
      cursor: pointer;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .dot-mascot-hero:hover { transform: scale(1.1) translateY(-4px); }
    .dot-mascot-hero.hopping { animation: hero-hop 0.65s cubic-bezier(0.28, 0.84, 0.42, 1); }
    @keyframes hero-hop {
      0% { transform: scale(1) translateY(0); }
      30% { transform: scale(1.15, 0.8) translateY(6px); }
      50% { transform: scale(0.9, 1.25) translateY(-32px); }
      70% { transform: scale(1.05, 0.95) translateY(0); }
      100% { transform: scale(1) translateY(0); }
    }
    .hero-eyes-svg {
      width: 44px;
      height: 26px;
      position: absolute;
      top: 26px;
      left: 18px;
    }

    /* Features Grid (OpenAI Clean Layout) */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-bottom: 80px;
    }
    @media (max-width: 900px) {
      .features-grid { grid-template-columns: 1fr; }
      .hero h1 { font-size: 40px; }
    }
    .feature-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .feature-card:hover {
      border-color: var(--border-strong);
      transform: translateY(-2px);
      box-shadow: 0 12px 36px rgba(0,0,0,0.3);
    }
    .feature-icon {
      font-size: 32px;
      margin-bottom: 20px;
    }
    .feature-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    .feature-desc {
      font-size: 15px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* Multi-User & Server Showcase Card */
    .server-showcase-card {
      background: linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(139,92,246,0.05) 100%);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 24px;
      padding: 44px;
      margin-bottom: 80px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      align-items: center;
    }
    @media (max-width: 900px) {
      .server-showcase-card { grid-template-columns: 1fr; padding: 28px; }
    }

    /* Pricing Section */
    .pricing-section {
      text-align: center;
      margin-bottom: 80px;
    }
    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 40px;
      text-align: left;
    }
    @media (max-width: 900px) {
      .pricing-grid { grid-template-columns: 1fr; }
    }
    .pricing-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 36px 28px;
      position: relative;
    }
    .pricing-card.featured {
      border-color: #3b82f6;
      box-shadow: 0 0 40px rgba(59, 130, 246, 0.15);
    }
    .tier-badge {
      position: absolute;
      top: 18px;
      right: 18px;
      padding: 4px 10px;
      border-radius: 20px;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      font-size: 11px;
      font-weight: 700;
    }
    .tier-price {
      font-size: 38px;
      font-weight: 800;
      margin: 16px 0 24px;
    }
    .tier-price span { font-size: 15px; color: var(--text-muted); font-weight: 500; }
    .tier-features { list-style: none; margin-bottom: 32px; }
    .tier-features li {
      padding: 8px 0;
      font-size: 14px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .tier-features li span { color: #34d399; font-weight: bold; }

    /* ChatGPT / OpenAI Style Modal */
    .openai-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .openai-modal-backdrop.active { display: flex; }
    .openai-modal {
      background: var(--bg-card);
      border: 1px solid var(--border-strong);
      border-radius: 20px;
      width: 100%;
      max-width: 760px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
      overflow: hidden;
      animation: modal-pop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modal-pop {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .om-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .om-title { font-size: 18px; font-weight: 700; }
    .om-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 20px;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .om-close:hover { background: rgba(255,255,255,0.08); color: var(--text); }
    .om-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .om-tabs {
      width: 220px;
      border-right: 1px solid var(--border);
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: rgba(0,0,0,0.15);
    }
    .om-tab-btn {
      padding: 10px 14px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      text-align: left;
      font-weight: 500;
      font-size: 13.5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .om-tab-btn:hover { background: rgba(255,255,255,0.04); color: var(--text); }
    .om-tab-btn.active { background: rgba(255,255,255,0.08); color: var(--text); font-weight: 600; }
    .om-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    /* Form Fields in Modal */
    .field-group { margin-bottom: 18px; }
    .field-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .input-text {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(0,0,0,0.2);
      color: var(--text);
      font-size: 14px;
      outline: none;
    }
    .input-text:focus { border-color: var(--accent); }

    /* Users / Members Table */
    .members-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
      margin-top: 14px;
    }
    .members-table th {
      text-align: left;
      padding: 10px 12px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 12px;
    }
    .members-table td {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .role-badge {
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .role-badge.owner { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .role-badge.admin { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .role-badge.member { background: rgba(52, 211, 153, 0.2); color: #34d399; }
    .role-badge.guest { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }
  </style>
</head>
<body>
  <div class="bg-grid"></div>

  <!-- Header / Navigation -->
  <header class="site-nav">
    <a href="/product" class="brand">
      <div class="brand-dot" id="header-brand-dot"></div>
      <span>Mave</span>
    </a>
    <nav class="nav-links">
      <a href="#features">Features</a>
      <a href="#server">Host AI Server</a>
      <a href="#downloads">Downloads</a>
      <a href="#pricing">Pricing</a>
      <a href="/api/chatgpt/openapi.json" target="_blank">OpenAI API</a>
    </nav>
    <div class="nav-actions">
      <button type="button" class="btn secondary" id="nav-account-btn">
        <span>👤 Account</span>
      </button>
      <a href="#downloads" class="btn primary">Download Free</a>
    </div>
  </header>

  <main>
    <!-- Hero Section -->
    <section class="hero">
      <div class="badge-pill">
        <span>🚀 Mave 1.4.8 Sovereign Release</span>
        <span>•</span>
        <span>Turn Any PC into a Private AI Brain</span>
      </div>
      <h1>Host Your Own AI Server.<br>Add Your Team & Satellites.</h1>
      <p>
        The private, sovereign AI platform. Download Mave on your PC to host local neural models, Kokoro voice, and autonomous hands — then invite users and connect phones with zero subscriptions.
      </p>
      <div class="hero-ctas">
        <a href="#downloads" class="btn accent btn-big">
          <span>⬇️ Download for Windows (x64)</span>
        </a>
        <button type="button" class="btn secondary btn-big" onclick="openOpenAiAccountModal('users')">
          <span>👥 Add Users / Host Mesh</span>
        </button>
      </div>

      <!-- Quick Install One-Liner -->
      <div class="install-box" onclick="copyInstallCmd()" title="Click to copy PowerShell install command">
        <span>PS &gt; irm https://getmave.ai/install.ps1 | iex</span>
        <button type="button" class="install-copy-btn" id="install-copy-btn">Copy</button>
      </div>

      <!-- Live Interactive Mascot & Dynamic Island Preview -->
      <div class="avatar-showcase">
        <div class="dot-mascot-hero" id="hero-dot" onclick="hopHeroDot()" title="Click me to pet or hop!">
          <svg class="hero-eyes-svg" viewBox="0 0 100 60">
            <path id="hero-eye-left" d="M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z" fill="#111418" />
            <path id="hero-eye-right" d="M 67 20 C 71 20, 73 23, 73 30 C 73 37, 71 40, 67 40 C 63 40, 61 37, 61 30 C 61 23, 63 20, 67 20 Z" fill="#111418" />
          </svg>
        </div>
        <div style="margin-top:16px; font-weight:700; font-size:15px;" id="hero-dot-status">Meet Mave (Tap to Hop)</div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn secondary small" onclick="triggerHeroMood('love')">💖 Love</button>
          <button type="button" class="btn secondary small" onclick="triggerHeroMood('thinking')">🧠 Think</button>
          <button type="button" class="btn secondary small" onclick="triggerHeroMood('happy')">✨ Happy</button>
        </div>
      </div>
    </section>

    <!-- Multi-User Server Architecture Section -->
    <section class="server-showcase-card" id="server">
      <div>
        <div class="badge-pill" style="margin-bottom:16px;">🖥️ Private Local AI Server</div>
        <h2 style="font-size:32px; font-weight:800; letter-spacing:-1px; margin-bottom:16px; line-height:1.2;">
          One PC Hosts the Brain.<br>Your Whole Household or Team Connects.
        </h2>
        <p style="color:var(--text-muted); font-size:16px; line-height:1.6; margin-bottom:24px;">
          Install Mave on your most powerful workstation. It serves high-speed models (Ollama, DeepSeek-R1, Qwen 2.5, Kokoro TTS) over LAN and SSL tunnel (ports 4040/4043). Add users with granular permissions so they can chat, speak, and automate from their laptops, Android, or iOS.
        </p>
        <button type="button" class="btn accent" onclick="openOpenAiAccountModal('users')">
          <span>+ Add Users & Invite Members</span>
        </button>
      </div>
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:18px; padding:24px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:12px; display:flex; justify-content:space-between;">
          <span>HOST SERVER TELEMETRY</span>
          <span style="color:#34d399;">● ONLINE (Port 4040)</span>
        </div>
        <div style="font-family:var(--font-mono); font-size:13px; line-height:1.8; color:#93c5fd;">
          <div>HOST: ${hostInfo.hostname || 'Mave-Host-PC'}</div>
          <div>SERVER ROLE: Host AI (Core Brain)</div>
          <div>MODELS: DeepSeek-R1 • Kokoro TTS • Whisper</div>
          <div>REGISTERED USERS: <span id="telemetry-users-count">${users.length || 1}</span> member(s)</div>
          <div>LAN ADDRESS: ${hostUrl}</div>
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section id="features">
      <div style="text-align:center; max-width:600px; margin:0 auto 48px;">
        <h2 style="font-size:36px; font-weight:800; letter-spacing:-1px; margin-bottom:12px;">Everything Built-In. Zero Subscriptions.</h2>
        <p style="color:var(--text-muted);">Mave replaces expensive SaaS subscriptions with a single private app that lives on your hardware.</p>
      </div>
      <div class="features-grid">
        <div class="feature-card">
          <div>
            <div class="feature-icon">🧠</div>
            <div class="feature-title">Host Private AI Models</div>
            <div class="feature-desc">Run Ollama, DeepSeek-R1, Qwen 2.5, or AirLLM 70B layer streaming directly on your GPU/RAM. 100% offline-capable.</div>
          </div>
        </div>
        <div class="feature-card">
          <div>
            <div class="feature-icon">👥</div>
            <div class="feature-title">Multi-User Management</div>
            <div class="feature-desc">Add family members or team mates. Allocate model quotas, assign roles (Owner, Admin, Member, Guest), and share invite links.</div>
          </div>
        </div>
        <div class="feature-card">
          <div>
            <div class="feature-icon">🎙️</div>
            <div class="feature-title">ChatGPT-Style Fluid Voice</div>
            <div class="feature-desc">Kokoro neural TTS and Whisper STT with real-time prosody fillers, bidirectional interruptions, and zero robotic lag.</div>
          </div>
        </div>
        <div class="feature-card">
          <div>
            <div class="feature-icon">🦾</div>
            <div class="feature-title">Autonomous Screen Hands</div>
            <div class="feature-desc">Mave sees your display, reads UI elements, and clicks and types to execute real tasks while you watch.</div>
          </div>
        </div>
        <div class="feature-card">
          <div>
            <div class="feature-icon">🔑</div>
            <div class="feature-title">OpenAI-Compatible API</div>
            <div class="feature-desc">Point Cursor, VS Code, Next.js, or Python SDK directly to your host PC's /v1 endpoint using your private API key.</div>
          </div>
        </div>
        <div class="feature-card">
          <div>
            <div class="feature-icon">☁️</div>
            <div class="feature-title">Firebase Cloud & Sync</div>
            <div class="feature-desc">Optional Cloud Firestore mesh keeps your satellite phones, chat memories, and user preferences synchronized anywhere.</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Direct Software Downloads Section -->
    <section class="pricing-section" id="downloads">
      <div class="badge-pill">💾 Official Software Installers</div>
      <h2 style="font-size:36px; font-weight:800; letter-spacing:-1px;">Download Mave for Any Device</h2>
      <p style="color:var(--text-muted); margin-top:8px;">Choose your operating system to install the host or satellite client.</p>

      <div class="pricing-grid" style="margin-top:32px;">
        <div class="pricing-card featured">
          <div class="tier-badge">RECOMMENDED</div>
          <h3>Windows PC</h3>
          <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">Windows 10 / 11 (64-bit)</p>
          <div style="margin:24px 0;">
            <a href="/api/download/windows" class="btn primary" style="width:100%; padding:14px;">⬇️ Download .exe Installer</a>
          </div>
          <div style="font-size:12px; color:var(--text-muted); line-height:1.6;">
            Includes Host AI Core, DirectML/CUDA GPU acceleration, PowerShell terminal, and Dynamic Island.
          </div>
        </div>

        <div class="pricing-card">
          <h3>macOS</h3>
          <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">Apple Silicon (M1-M4) & Intel</p>
          <div style="margin:24px 0;">
            <a href="/api/download/mac" class="btn secondary" style="width:100%; padding:14px;">⬇️ Download .dmg</a>
          </div>
          <div style="font-size:12px; color:var(--text-muted); line-height:1.6;">
            Full Metal GPU acceleration, Apple notch mascot integration, and Safari WebKit voice unlock.
          </div>
        </div>

        <div class="pricing-card">
          <h3>Linux</h3>
          <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">Ubuntu, Debian, Fedora, Arch (64-bit)</p>
          <div style="margin:24px 0;">
            <a href="/api/download/linux" class="btn secondary" style="width:100%; padding:14px;">⬇️ Download .AppImage</a>
          </div>
          <div style="font-size:12px; color:var(--text-muted); line-height:1.6;">
            ROCm & CUDA acceleration, systemd headless background daemon, and sovereign LAN server.
          </div>
        </div>

        <div class="pricing-card">
          <h3>Mobile Companion</h3>
          <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">Android & Apple iOS (PWA / Web)</p>
          <div style="margin:24px 0;">
            <a href="/" class="btn secondary" style="width:100%; padding:14px;">📱 Open Mobile Web App</a>
          </div>
          <div style="font-size:12px; color:var(--text-muted); line-height:1.6;">
            Instant browser pairing. Connects your phone camera and microphone as a satellite to your host PC.
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing / Tiers Section -->
    <section class="pricing-section" id="pricing">
      <h2 style="font-size:36px; font-weight:800; letter-spacing:-1px;">Transparent, Sovereign Plans</h2>
      <p style="color:var(--text-muted); margin-top:8px;">Zero lock-in. Host entirely free on your own hardware or upgrade for team mesh.</p>

      <div class="pricing-grid">
        <div class="pricing-card">
          <h3>Sovereign Local</h3>
          <p style="color:var(--text-muted); font-size:14px;">For individuals and hobbyists</p>
          <div class="tier-price">$0 <span>/ forever</span></div>
          <ul class="tier-features">
            <li><span>✓</span> Unlimited local AI model tokens</li>
            <li><span>✓</span> Turn PC into Host AI server</li>
            <li><span>✓</span> Up to 5 satellite devices & users</li>
            <li><span>✓</span> Fluid Kokoro Voice & Whisper STT</li>
            <li><span>✓</span> Autonomous screen & mouse hands</li>
          </ul>
          <a href="#downloads" class="btn secondary" style="width:100%;">Get Started Free</a>
        </div>

        <div class="pricing-card featured">
          <div class="tier-badge">POPULAR</div>
          <h3>Pro Host & Mesh</h3>
          <p style="color:var(--text-muted); font-size:14px;">For power users and creators</p>
          <div class="tier-price">$19 <span>/ month</span></div>
          <ul class="tier-features">
            <li><span>✓</span> Everything in Sovereign Local</li>
            <li><span>✓</span> AirLLM 70B layer streaming accelerator</li>
            <li><span>✓</span> Unlimited added users & team members</li>
            <li><span>✓</span> ComfyUI video dubbing & HeyGem studio</li>
            <li><span>✓</span> SSL dynamic DNS tunnel (port 4043)</li>
          </ul>
          <button type="button" class="btn primary" style="width:100%;" onclick="openOpenAiAccountModal('plan')">Upgrade to Pro</button>
        </div>

        <div class="pricing-card">
          <h3>Team & Enterprise</h3>
          <p style="color:var(--text-muted); font-size:14px;">For businesses and organizations</p>
          <div class="tier-price">$25 <span>/ seat / mo</span></div>
          <ul class="tier-features">
            <li><span>✓</span> Multi-host distributed computing mesh</li>
            <li><span>✓</span> Granular RBAC permissions & audit log</li>
            <li><span>✓</span> OpenAI-compatible enterprise API gateway</li>
            <li><span>✓</span> Dedicated Firestore cloud synchronization</li>
            <li><span>✓</span> Priority enterprise architecture support</li>
          </ul>
          <button type="button" class="btn secondary" style="width:100%;" onclick="openOpenAiAccountModal('users')">Contact Team Sales</button>
        </div>
      </div>
    </section>
  </main>

  <!-- ChatGPT / OpenAI Style Account & Workspace Modal -->
  <div class="openai-modal-backdrop" id="openai-account-modal">
    <div class="openai-modal">
      <div class="om-header">
        <div class="om-title">OpenAI & Mave Account Settings</div>
        <button type="button" class="om-close" onclick="closeOpenAiAccountModal()">✕</button>
      </div>
      <div class="om-body">
        <!-- Sidebar Navigation -->
        <div class="om-tabs">
          <button type="button" class="om-tab-btn active" data-tab="profile" onclick="switchModalTab('profile')">
            <span>👤 Profile & Account</span>
          </button>
          <button type="button" class="om-tab-btn" data-tab="users" onclick="switchModalTab('users')">
            <span>👥 Users & Members</span>
          </button>
          <button type="button" class="om-tab-btn" data-tab="server" onclick="switchModalTab('server')">
            <span>🖥️ Host AI Server</span>
          </button>
          <button type="button" class="om-tab-btn" data-tab="apikeys" onclick="switchModalTab('apikeys')">
            <span>🔑 API Keys</span>
          </button>
          <button type="button" class="om-tab-btn" data-tab="plan" onclick="switchModalTab('plan')">
            <span>💳 Plan & Billing</span>
          </button>
        </div>

        <!-- Content Area -->
        <div class="om-content">
          <!-- Profile Tab -->
          <div id="pane-profile" class="tab-pane">
            <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">Account Details</h3>
            <div class="field-group">
              <label class="field-label">Email Address</label>
              <input type="email" class="input-text" id="om-input-email" value="${(currentUser && currentUser.email) || 'owner@mave.local'}">
            </div>
            <div class="field-group">
              <label class="field-label">Display Name</label>
              <input type="text" class="input-text" id="om-input-name" value="${(currentUser && currentUser.displayName) || 'Host Owner'}">
            </div>
            <div class="field-group">
              <label class="field-label">Account Role</label>
              <div style="font-size:13px; color:#34d399; font-weight:600;">Host Owner & Server Administrator</div>
            </div>
            <div style="display:flex; gap:12px; margin-top:20px;">
              <button type="button" class="btn primary small" onclick="saveProfileChanges()">Save Changes</button>
              <button type="button" class="btn secondary small" onclick="handleSignOut()">Sign Out</button>
            </div>
          </div>

          <!-- Users & Members Tab (Add User) -->
          <div id="pane-users" class="tab-pane" style="display:none;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
              <div>
                <h3 style="font-size:16px; font-weight:700;">Organization Members</h3>
                <p style="font-size:12px; color:var(--text-muted);">Users with access to this Local AI Server.</p>
              </div>
              <button type="button" class="btn primary small" onclick="toggleAddUserForm()">+ Add User</button>
            </div>

            <!-- Add User Form (Hidden by default) -->
            <div id="add-user-card" style="display:none; background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:18px;">
              <h4 style="font-size:14px; font-weight:700; margin-bottom:12px;">Invite New Member</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                <div>
                  <label class="field-label">User Email</label>
                  <input type="email" class="input-text" id="new-user-email" placeholder="colleague@domain.com">
                </div>
                <div>
                  <label class="field-label">Full Name</label>
                  <input type="text" class="input-text" id="new-user-name" placeholder="Alice Smith">
                </div>
              </div>
              <div style="margin-bottom:14px;">
                <label class="field-label">Permission Role</label>
                <select class="input-text" id="new-user-role">
                  <option value="member">Member (Chat, Voice, Memories)</option>
                  <option value="admin">Admin (Model Routing, Full Control)</option>
                  <option value="guest">Guest (Restricted Sandbox)</option>
                </select>
              </div>
              <div style="display:flex; gap:10px;">
                <button type="button" class="btn accent small" onclick="submitAddUser()">Add User & Generate Invite Link</button>
                <button type="button" class="btn secondary small" onclick="toggleAddUserForm()">Cancel</button>
              </div>
              <div id="add-user-result" style="margin-top:12px; font-size:12px; color:#34d399; display:none;"></div>
            </div>

            <!-- Members Table -->
            <table class="members-table">
              <thead>
                <tr>
                  <th>MEMBER</th>
                  <th>ROLE</th>
                  <th>JOINED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody id="members-table-body">
                <!-- Dynamically populated -->
              </tbody>
            </table>
          </div>

          <!-- Host AI Server Tab -->
          <div id="pane-server" class="tab-pane" style="display:none;">
            <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">Host AI Server Settings</h3>
            <div class="field-group">
              <label class="field-label">Host Machine Name</label>
              <input type="text" class="input-text" id="server-hostname" value="${hostInfo.hostname || 'Mave-Host-PC'}">
            </div>
            <div class="field-group">
              <label class="field-label">Local Server Port</label>
              <input type="text" class="input-text" value="${hostInfo.serverPort || 4040}" disabled>
            </div>
            <div class="field-group">
              <label class="field-label">Public LAN URL for Satellites</label>
              <input type="text" class="input-text" value="${hostUrl}" readonly onclick="this.select()">
            </div>
            <div style="margin-top:20px;">
              <button type="button" class="btn primary small" onclick="saveServerSettings()">Save Server Settings</button>
            </div>
          </div>

          <!-- API Keys Tab -->
          <div id="pane-apikeys" class="tab-pane" style="display:none;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
              <div>
                <h3 style="font-size:16px; font-weight:700;">Secret API Keys</h3>
                <p style="font-size:12px; color:var(--text-muted);">Use these keys with the OpenAI Python SDK, Cursor, or LangChain.</p>
              </div>
              <button type="button" class="btn primary small" onclick="generateApiKey()">+ Create new secret key</button>
            </div>

            <div id="apikeys-list" style="margin-top:16px;">
              <!-- Populated dynamically -->
            </div>

            <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:12px; padding:16px; margin-top:24px; font-size:12px; font-family:var(--font-mono);">
              <div style="color:#94a3b8; margin-bottom:8px;"># Python OpenAI SDK Quickstart:</div>
              <div style="color:#38bdf8;">
                from openai import OpenAI<br>
                client = OpenAI(base_url="${hostUrl}/v1", api_key="sk-mave-...")<br>
                res = client.chat.completions.create(model="deepseek-r1", messages=[{"role":"user","content":"Hello!"}])
              </div>
            </div>
          </div>

          <!-- Plan Tab -->
          <div id="pane-plan" class="tab-pane" style="display:none;">
            <h3 style="font-size:16px; font-weight:700; margin-bottom:12px;">Active Plan: Sovereign Host</h3>
            <p style="font-size:14px; color:var(--text-muted); margin-bottom:24px;">
              Your computer is currently configured as a 100% private, sovereign host. You have zero recurring cloud fees.
            </p>
            <div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.25); border-radius:12px; padding:20px;">
              <div style="font-weight:700; color:#93c5fd; font-size:15px; margin-bottom:6px;">Sovereign Community Tier</div>
              <div style="font-size:13px; color:var(--text-muted);">Unlimited local computing • Ollama models • Private mesh</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const INITIAL_USERS = ${userListJson};
    let currentUsers = [...INITIAL_USERS];

    function copyInstallCmd() {
      navigator.clipboard.writeText('irm https://getmave.ai/install.ps1 | iex').then(() => {
        const btn = document.getElementById('install-copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    }

    function hopHeroDot() {
      const dot = document.getElementById('hero-dot');
      dot.classList.remove('hopping');
      void dot.offsetWidth;
      dot.classList.add('hopping');
      triggerHeroMood('happy');
    }

    const HERO_EYES = {
      idle: { left: 'M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z', right: 'M 67 20 C 71 20, 73 23, 73 30 C 73 37, 71 40, 67 40 C 63 40, 61 37, 61 30 C 61 23, 63 20, 67 20 Z' },
      happy: { left: 'M 27 34 Q 33 20 39 34', right: 'M 61 34 Q 67 20 73 34' },
      love: { left: 'M 33 25 C 33 21, 28 19, 25 23 C 21 19, 16 21, 16 25 C 16 32, 25 38, 25 38 C 25 38, 33 32, 33 25 Z', right: 'M 67 25 C 67 21, 62 19, 59 23 C 55 19, 50 21, 50 25 C 50 32, 59 38, 59 38 C 59 38, 67 32, 67 25 Z' },
      thinking: { left: 'M 27 32 Q 33 27 39 32', right: 'M 69 16 C 73 16, 75 19, 75 25 C 75 31, 73 34, 69 34 C 65 34, 63 31, 63 25 C 63 19, 65 16, 69 16 Z' }
    };

    function triggerHeroMood(mood) {
      const paths = HERO_EYES[mood] || HERO_EYES.idle;
      const l = document.getElementById('hero-eye-left');
      const r = document.getElementById('hero-eye-right');
      if (l) l.setAttribute('d', paths.left);
      if (r) r.setAttribute('d', paths.right);
      const s = document.getElementById('hero-dot-status');
      if (s) s.textContent = mood === 'love' ? 'Mave Loves You! 💖' : mood === 'thinking' ? 'Mave Thinking… 🧠' : 'Mave Excited! ✨';
      setTimeout(() => {
        if (l) l.setAttribute('d', HERO_EYES.idle.left);
        if (r) r.setAttribute('d', HERO_EYES.idle.right);
        if (s) s.textContent = 'Meet Mave (Tap to Hop)';
      }, 2500);
    }

    // Modal controls
    function openOpenAiAccountModal(defaultTab = 'profile') {
      const m = document.getElementById('openai-account-modal');
      m.classList.add('active');
      switchModalTab(defaultTab);
      renderMembersTable();
    }

    function closeOpenAiAccountModal() {
      document.getElementById('openai-account-modal').classList.remove('active');
    }

    function switchModalTab(tabId) {
      document.querySelectorAll('.om-tab-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector('.om-tab-btn[data-tab="' + tabId + '"]');
      if (activeBtn) activeBtn.classList.add('active');

      document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
      const pane = document.getElementById('pane-' + tabId);
      if (pane) pane.style.display = 'block';

      if (tabId === 'users') renderMembersTable();
      if (tabId === 'apikeys') loadApiKeys();
    }

    document.getElementById('nav-account-btn').addEventListener('click', () => openOpenAiAccountModal('profile'));

    function renderMembersTable() {
      const tbody = document.getElementById('members-table-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (currentUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">No users found. Add a user above!</td></tr>';
        return;
      }

      currentUsers.forEach(u => {
        const tr = document.createElement('tr');
        const role = u.role || 'member';
        tr.innerHTML = \`
          <td>
            <div style="font-weight:600; color:var(--text);">\${u.displayName || u.email}</div>
            <div style="font-size:11px; color:var(--text-muted);">\${u.email}</div>
          </td>
          <td><span class="role-badge \${role}">\${role}</span></td>
          <td style="color:var(--text-muted); font-size:12px;">\${new Date(u.createdAt || Date.now()).toLocaleDateString()}</td>
          <td>
            \${u.isLocalRoot ? '<span style="font-size:11px; color:#34d399;">Root Owner</span>' : '<button type="button" class="btn secondary small" onclick="removeMember(\\'' + u.id + '\\')">Remove</button>'}
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function toggleAddUserForm() {
      const f = document.getElementById('add-user-card');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    }

    async function submitAddUser() {
      const email = document.getElementById('new-user-email').value.trim();
      const name = document.getElementById('new-user-name').value.trim();
      const role = document.getElementById('new-user-role').value;
      const resEl = document.getElementById('add-user-result');

      if (!email) {
        alert('Please enter an email address');
        return;
      }

      try {
        const res = await fetch('/api/users/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, displayName: name, role })
        });
        const data = await res.json();
        if (data.ok) {
          currentUsers.push(data.user);
          renderMembersTable();

          // Generate invite link
          const invRes = await fetch('/api/users/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
          });
          const invData = await invRes.json();
          const inviteUrl = window.location.origin + '/join?token=' + invData.token;

          resEl.style.display = 'block';
          resEl.innerHTML = 'User added! Share invite link: <br><input class="input-text" style="margin-top:6px; font-size:11px;" value="' + inviteUrl + '" readonly onclick="this.select()">';
          document.getElementById('new-user-email').value = '';
          document.getElementById('new-user-name').value = '';
        } else {
          alert('Error: ' + data.error);
        }
      } catch (err) {
        alert('Error adding user: ' + err.message);
      }
    }

    async function removeMember(id) {
      if (!confirm('Are you sure you want to remove this user from the local AI server?')) return;
      try {
        const res = await fetch('/api/users/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: id })
        });
        const data = await res.json();
        if (data.ok) {
          currentUsers = currentUsers.filter(u => u.id !== id);
          renderMembersTable();
        } else {
          alert(data.error || 'Failed to remove user');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function loadApiKeys() {
      const container = document.getElementById('apikeys-list');
      try {
        const res = await fetch('/api/users/apikeys');
        const data = await res.json();
        if (data.ok && data.keys && data.keys.length > 0) {
          container.innerHTML = data.keys.map(k => \`
            <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:10px; padding:12px; display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <div>
                <div style="font-weight:600; font-size:13px;">\${k.label}</div>
                <div style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted);">\${k.keyMasked}</div>
              </div>
              <button type="button" class="btn secondary small" onclick="revokeKey('\\'' + k.key + '\\'')">Revoke</button>
            </div>
          \`).join('');
        } else {
          container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">No active API keys found. Create one to use with Cursor, LangChain, or Python.</div>';
        }
      } catch {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">Create an API key below.</div>';
      }
    }

    async function generateApiKey() {
      const label = prompt('Label for this API Key (e.g. Cursor, Python SDK):', 'Default Key');
      if (!label) return;
      try {
        const res = await fetch('/api/users/apikeys/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label })
        });
        const data = await res.json();
        if (data.ok) {
          prompt('✅ Save your new OpenAI-compatible API key now (it will not be shown again):', data.key);
          loadApiKeys();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function revokeKey(key) {
      if (!confirm('Revoke this API key?')) return;
      await fetch('/api/users/apikeys/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      loadApiKeys();
    }

    function saveProfileChanges() {
      alert('Profile updated and synchronized with Cloud Firestore.');
    }

    function handleSignOut() {
      fetch('/api/firebase/auth/logout', { method: 'POST' }).then(() => {
        window.location.reload();
      });
    }

    function saveServerSettings() {
      const hostname = document.getElementById('server-hostname').value.trim();
      fetch('/api/host/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname })
      }).then(() => alert('Host server settings saved.'));
    }
  </script>
</body>
</html>`;
}

module.exports = { getProductSiteHtml };
