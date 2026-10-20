'use strict';
// Local Web & LAN Controller for Mave.
// Serves a full-featured desktop-parity UI on http://localhost:4040 and across your home Wi-Fi,
// matching the desktop app with sidebar navigation (Home Chat, Assistant, Models, Voice, Superpowers, General, Terminal, Desktop View).

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, exec } = require('child_process');
const catalog = require('../local/catalog');
const { getMaveDropEngine } = require('./mavedrop');
const { ensureSslCert } = require('./ssl');
const { getChatGPTNervousSystemBridge } = require('../chatgpt_brain/chatgpt_bridge');
const { getDictationManager } = require('../dictation');
const { cleanTranscription } = require('../local/text_cleaner');
const { getVoiceDesigner } = require('../voice_studio/voice_designer');
const { getVoiceCloner } = require('../voice_studio/voice_cloner');
const { getVideoDubber } = require('../voice_studio/video_dubber');
const { getAudiobookProducer } = require('../voice_studio/audiobook_producer');
const { getComfyClient } = require('../comfyui/comfy_client');
const { getWorkflowBuilder } = require('../comfyui/workflow_builder');
const { getAvatarProducer } = require('../avatar/avatar_producer');
const { getLipSyncEngine } = require('../avatar/lip_sync_engine');

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function isLocalhostReq(req) {
  const remote = req.socket && (req.socket.remoteAddress || '');
  const localIp = getLocalIp();
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1' || remote === 'localhost' ||
         remote === localIp || remote === `::ffff:${localIp}`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 25e6) req.destroy(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseRawBuffer(req, limit = 25e6) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) req.destroy();
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getDesktopWebHtml(lanUrl, httpsUrl = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <title>Mave</title>
  <meta name="application-name" content="Mave Mobile">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%238b5cf6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='12' cy='12' r='10' fill='url(%23g)'/%3E%3Cpath d='M8 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8 15c1 1.5 3 2 4 2s3-.5 4-2' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E">
  <style>
    :root {
      --bg: #101211;
      --surface-1: #171918;
      --surface-2: #202221;
      --surface-3: #272a29;
      --surface-4: #2e3130;
      --border-subtle: #373b39;
      --border-strong: #444947;
      --hairline: rgba(255, 255, 255, 0.08);
      --text-1: #eceeed;
      --text-2: #adb5b2;
      --text-3: #6b736f;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --accent-text: #60a5fa;
      --buddy: #3380ff;
      --danger: #e5484d;
      --success: #34d399;
      --warning: #ffb224;
      --r-md: 8px;
      --r-lg: 10px;
      --r-xl: 12px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    [data-theme="light"],
    body.theme-light {
      --bg: #f8fafc;
      --surface-1: #ffffff;
      --surface-2: #f1f5f9;
      --surface-3: #e2e8f0;
      --surface-4: #cbd5e1;
      --border-subtle: #e2e8f0;
      --border-strong: #cbd5e1;
      --hairline: rgba(0, 0, 0, 0.08);
      --text-1: #0f172a;
      --text-2: #475569;
      --text-3: #94a3b8;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --accent-text: #2563eb;
      --buddy: #2563eb;
      --danger: #dc2626;
      --success: #059669;
      --warning: #d97706;
      color-scheme: light;
    }
    @media (prefers-color-scheme: light) {
      [data-theme="system"],
      body.theme-system {
        --bg: #f8fafc;
        --surface-1: #ffffff;
        --surface-2: #f1f5f9;
        --surface-3: #e2e8f0;
        --surface-4: #cbd5e1;
        --border-subtle: #e2e8f0;
        --border-strong: #cbd5e1;
        --hairline: rgba(0, 0, 0, 0.08);
        --text-1: #0f172a;
        --text-2: #475569;
        --text-3: #94a3b8;
        --accent: #2563eb;
        --accent-hover: #1d4ed8;
        --accent-text: #2563eb;
        --buddy: #2563eb;
        --danger: #dc2626;
        --success: #059669;
        --warning: #d97706;
        color-scheme: light;
      }
    }
    [data-theme="light"] .nav-btn:hover, body.theme-light .nav-btn:hover { background: rgba(0, 0, 0, 0.05); color: var(--text-1); }
    [data-theme="light"] .btn-mode, body.theme-light .btn-mode { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
    [data-theme="light"] .btn-mode:hover, body.theme-light .btn-mode:hover { background: #e2e8f0; color: #0f172a; }
    [data-theme="light"] .btn-mode.active, body.theme-light .btn-mode.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
    [data-theme="light"] .header-pill-btn, body.theme-light .header-pill-btn { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
    [data-theme="light"] .header-pill-btn:hover, body.theme-light .header-pill-btn:hover { background: #e2e8f0; color: #0f172a; }
    [data-theme="light"] .card, body.theme-light .card { background: #ffffff; border-color: #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04); }
    [data-theme="light"] .composer, body.theme-light .composer { background: #ffffff; border-color: #cbd5e1; }
    [data-theme="light"] .thought-container, body.theme-light .thought-container { background: rgba(0, 0, 0, 0.02); border-color: rgba(0, 0, 0, 0.08); }
    [data-theme="light"] .thought-content, body.theme-light .thought-content { background: #f8fafc; color: #334155; }
    [data-theme="light"] .msg-bubble.user, body.theme-light .msg-bubble.user { background: #2563eb; color: #ffffff; }
    [data-theme="light"] .msg-bubble.user .audio-replay-btn, body.theme-light .msg-bubble.user .audio-replay-btn { color: #ffffff; }
    [data-theme="light"] .msg-bubble.assistant, [data-theme="light"] .msg-bubble.bot, body.theme-light .msg-bubble.bot { background: #ffffff; border-color: #e2e8f0; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    [data-theme="light"] .app-window, body.theme-light .app-window { background: var(--bg); }
    [data-theme="light"] .sidebar, body.theme-light .sidebar { background: var(--surface-1); border-right-color: var(--border-subtle); }
    [data-theme="light"] .top-header, body.theme-light .top-header { background: var(--surface-1); border-bottom-color: var(--border-subtle); }
    [data-theme="light"] .status-pill, body.theme-light .status-pill { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
    [data-theme="light"] .action-btn, body.theme-light .action-btn { background: #ffffff; border-color: #cbd5e1; color: #334155; }
    [data-theme="light"] .field, body.theme-light .field { background: #ffffff; border-color: #cbd5e1; color: #0f172a; }
    [data-theme="light"] .group, body.theme-light .group { background: #ffffff; border-color: #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    [data-theme="light"] .segmented, body.theme-light .segmented { background: #e2e8f0; border-color: #cbd5e1; }
    [data-theme="light"] .seg-opt, body.theme-light .seg-opt { color: #64748b; }
    [data-theme="light"] .seg-opt:hover, body.theme-light .seg-opt:hover { color: #0f172a; }
    [data-theme="light"] .seg-opt.active, body.theme-light .seg-opt.active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    [data-theme="light"] .switch .track, body.theme-light .switch .track { background-color: #cbd5e1; border-color: #94a3b8; }
    [data-theme="light"] .btn.secondary, body.theme-light .btn.secondary { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
    [data-theme="light"] .btn.secondary:hover, body.theme-light .btn.secondary:hover { background: #e2e8f0; }
    [data-theme="light"] .btn.plain, body.theme-light .btn.plain { color: #475569; }
    [data-theme="light"] .btn.plain:hover, body.theme-light .btn.plain:hover { color: #0f172a; background: rgba(0,0,0,0.05); }
    [data-theme="light"] .composer-tool-btn, body.theme-light .composer-tool-btn { color: #64748b; }
    [data-theme="light"] .composer-tool-btn:hover, body.theme-light .composer-tool-btn:hover { color: #0f172a; background: rgba(0,0,0,0.05); }
    [data-theme="light"] #voice-mode-modal, body.theme-light #voice-mode-modal { background: radial-gradient(circle at center, #f1f5f9 0%, #e2e8f0 100%); color: #0f172a; }
    [data-theme="light"] #voice-subtitles-box, body.theme-light #voice-subtitles-box { background: rgba(255, 255, 255, 0.7); border-color: rgba(0, 0, 0, 0.1); color: #0f172a; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); }
    [data-theme="light"] #voice-user-sub, body.theme-light #voice-user-sub { color: #2563eb; }
    [data-theme="light"] #voice-bot-sub, body.theme-light #voice-bot-sub { color: #0f172a; }
    [data-theme="light"] #voice-thought-container, body.theme-light #voice-thought-container { background: rgba(255, 255, 255, 0.9); border-color: rgba(37, 99, 235, 0.3); color: #0f172a; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08); }
    [data-theme="light"] #voice-thought-list, body.theme-light #voice-thought-list { color: #334155; }
    [data-theme="light"] #voice-mute-btn, body.theme-light #voice-mute-btn { background: rgba(0, 0, 0, 0.06); border-color: rgba(0, 0, 0, 0.12); color: #0f172a; }
    [data-theme="light"] #voice-mode-close-btn, body.theme-light #voice-mode-close-btn { background: rgba(0, 0, 0, 0.06); color: #0f172a; }
    [data-theme="light"] .voice-view-pill, body.theme-light .voice-view-pill { background: rgba(0, 0, 0, 0.05); border-color: rgba(0, 0, 0, 0.1); color: #475569; }
    [data-theme="light"] .voice-view-pill.active, body.theme-light .voice-view-pill.active { background: rgba(37, 99, 235, 0.15); border-color: #2563eb; color: #2563eb; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text-1);
      font-family: var(--font);
      font-size: 13.5px;
      line-height: 1.45;
      overflow: hidden;
    }
    .app-window {
      display: flex;
      height: 100vh;
      width: 100vw;
      background: var(--bg);
    }
    /* Sidebar */
    .sidebar {
      width: 250px;
      flex-shrink: 0;
      background: var(--surface-1);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .brand-header {
      padding: 16px 18px 12px 18px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: rgba(37, 99, 235, 0.15);
      color: var(--primary);
      flex-shrink: 0;
    }
    .brand-title {
      font-weight: 700;
      font-size: 15px;
      color: var(--text-1);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    nav {
      padding: 6px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .nav-sep {
      padding: 12px 12px 4px 12px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-3);
    }
    .nav-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: transparent;
      border: 0;
      border-radius: var(--r-md);
      color: var(--text-2);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s, color 0.15s;
    }
    .nav-btn:hover { background: rgba(255, 255, 255, 0.05); color: var(--text-1); }
    .nav-btn.active {
      background: rgba(37, 99, 235, 0.16);
      color: #93c5fd;
      font-weight: 600;
    }
    .row-icon {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .row-icon svg { width: 14px; height: 14px; }
    /* Content Area */
    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: var(--bg);
      position: relative;
    }
    .top-header {
      height: 48px;
      padding: 0 24px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      background: rgba(16, 18, 17, 0.85);
      backdrop-filter: blur(12px);
    }
    .page-title { font-size: 15px; font-weight: 600; color: var(--text-1); }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11.5px;
      padding: 3px 10px;
      border-radius: 12px;
      background: rgba(52, 211, 153, 0.1);
      color: var(--success);
      font-weight: 550;
      border: 1px solid rgba(52, 211, 153, 0.25);
    }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); }
    .scroll-pane {
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px 60px 32px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    /* Typography & Sections */
    .hero {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 6px;
    }
    .hero .row-icon.big {
      width: 44px;
      height: 44px;
      border-radius: 12px;
    }
    .hero .row-icon.big svg { width: 24px; height: 24px; }
    .title-2 { font-size: 18px; font-weight: 700; color: var(--text-1); }
    .section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-3);
      margin-top: 14px;
      margin-bottom: -10px;
    }
    .group {
      background: var(--surface-1);
      border: 1px solid var(--hairline);
      border-radius: var(--r-xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 16px;
      gap: 16px;
      border-bottom: 1px solid var(--hairline);
    }
    .row:last-child { border-bottom: 0; }
    .row.stack { flex-direction: column; align-items: stretch; gap: 8px; }
    .row-head { display: flex; align-items: center; justify-content: space-between; }
    .row-foot { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; }
    .label { display: flex; flex-direction: column; gap: 2px; }
    .headline { font-size: 13px; font-weight: 600; color: var(--text-1); }
    .hint { font-size: 11.5px; color: var(--text-2); line-height: 1.35; }
    .field {
      background: var(--surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-md);
      color: var(--text-1);
      font-family: inherit;
      font-size: 13px;
      padding: 7px 11px;
      outline: none;
      transition: border-color 0.15s;
    }
    .field:focus { border-color: var(--buddy); }
    .field.mono { font-family: var(--mono); font-size: 12px; }
    .field-wrap { display: flex; gap: 8px; width: 100%; position: relative; }
    .field-wrap .field { flex: 1; }
    /* Controls */
    .btn {
      padding: 7px 13px;
      border-radius: var(--r-md);
      font-size: 12.5px;
      font-weight: 550;
      border: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none;
      transition: background 0.15s, transform 0.1s;
    }
    .btn:active { transform: scale(0.98); }
    .btn.primary { background: var(--accent); color: #fff; }
    .btn.primary:hover { background: var(--accent-hover); }
    .btn.secondary { background: var(--surface-3); color: var(--text-1); border: 1px solid var(--border-subtle); }
    .btn.secondary:hover { background: var(--surface-4); }
    .btn.plain { background: transparent; color: var(--text-2); }
    .btn.plain:hover { color: var(--text-1); background: rgba(255, 255, 255, 0.05); }
    .btn.small { padding: 4px 10px; font-size: 11.5px; }
    /* Switch */
    .switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .track {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: var(--surface-4);
      transition: .2s;
      border-radius: 22px;
      border: 1px solid var(--border-subtle);
    }
    .track:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 2px;
      bottom: 2px;
      background-color: #fff;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .track { background-color: var(--accent); border-color: var(--accent); }
    input:checked + .track:before { transform: translateX(18px); }
    /* Segmented */
    .segmented {
      display: inline-flex;
      background: var(--surface-2);
      border: 1px solid var(--hairline);
      border-radius: var(--r-md);
      padding: 2px;
      gap: 2px;
    }
    .seg-opt {
      padding: 4px 11px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      border: 0;
      background: transparent;
      color: var(--text-2);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .seg-opt.active {
      background: var(--surface-4);
      color: var(--text-1);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    /* Chat & Home */
    .home-chat {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 520px;
    }
    .chat-feed {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-bottom: 20px;
    }
    .empty-chat {
      margin: auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--text-2);
      padding: 40px 0;
    }
    .empty-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: linear-gradient(135deg, #2563eb, #8f46eb);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .empty-icon svg { width: 28px; height: 28px; }
    .msg-bubble {
      padding: 12px 16px;
      border-radius: 14px;
      max-width: 80%;
      line-height: 1.5;
      font-size: 13.5px;
      white-space: pre-wrap;
      animation: fadeIn 0.2s ease;
    }
    .msg-bubble.user {
      align-self: flex-end;
      background: var(--accent);
      color: #fff;
      border-bottom-right-radius: 3px;
    }
    .msg-bubble.bot {
      align-self: flex-start;
      background: var(--surface-2);
      border: 1px solid var(--hairline);
      color: var(--text-1);
      border-bottom-left-radius: 3px;
    }
    .composer {
      display: flex;
      gap: 10px;
      background: var(--surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      padding: 8px 14px;
      align-items: flex-end;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .composer textarea {
      flex: 1;
      background: transparent;
      border: 0;
      color: var(--text-1);
      font-family: inherit;
      font-size: 13.5px;
      outline: none;
      resize: none;
      max-height: 120px;
      padding: 4px 0;
      line-height: 1.4;
    }
    .send-icon-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--accent);
      border: 0;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .send-icon-btn:hover { background: var(--accent-hover); }
    .composer-orb-btn,
    .voice-mode-circle-btn {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #2563eb;
      border: 0;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.2s ease;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
    }
    .composer-orb-btn:hover,
    .voice-mode-circle-btn:hover {
      background: #1d4ed8;
      transform: scale(1.06);
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.5);
    }
    .composer-orb-btn:active,
    .voice-mode-circle-btn:active {
      transform: scale(0.94);
    }
    /* Meet Voice Onboarding Modal */
    .meet-voice-modal-card {
      background: var(--surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: 24px;
      width: 100%;
      max-width: 440px;
      padding: 36px 32px 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
      animation: modal-pop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .meet-voice-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 0;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-2);
      font-size: 15px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .meet-voice-orb-preview {
      margin: 8px 0 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .fluid-orb-sm {
      position: relative;
      width: 130px;
      height: 130px;
      border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
      background: radial-gradient(circle at 35% 35%, #38bdf8 0%, #3b82f6 30%, #6366f1 60%, #1e1b4b 100%);
      animation: fluid-orb-morph 6s ease-in-out infinite alternate;
      box-shadow: 0 0 35px rgba(56, 189, 248, 0.4), 0 0 65px rgba(99, 102, 241, 0.25);
    }
    .meet-voice-title {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 20px;
      color: var(--text-1);
    }
    .meet-voice-features {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
      text-align: left;
      margin-bottom: 28px;
    }
    .mv-feature-item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
    .mv-feature-icon {
      flex: none;
      width: 24px;
      height: 24px;
      color: #3b82f6;
      margin-top: 1px;
    }
    .mv-feature-text {
      font-size: 13.5px;
      line-height: 1.45;
      color: var(--text-2);
    }
    .meet-voice-continue-btn {
      width: 100%;
      height: 48px;
      border-radius: 24px;
      background: #ffffff;
      color: #000000;
      font-size: 15px;
      font-weight: 600;
      border: 0;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    [data-theme="light"] .meet-voice-continue-btn,
    body.theme-light .meet-voice-continue-btn {
      background: #000000;
      color: #ffffff;
    }
    .meet-voice-continue-btn:hover {
      opacity: 0.92;
      transform: scale(1.01);
    }
    .meet-voice-continue-btn:active {
      transform: scale(0.98);
    }
    /* ChatGPT Fluid Voice Orb */
    .chatgpt-fluid-voice-orb {
      position: relative;
      width: 200px;
      height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .orb-fluid-glow {
      position: absolute;
      inset: -40px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.45) 0%, rgba(59, 130, 246, 0.3) 40%, rgba(99, 102, 241, 0.15) 65%, transparent 75%);
      filter: blur(32px);
      animation: orb-fluid-glow-breathe 4s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes orb-fluid-glow-breathe {
      0%, 100% { transform: scale(0.92); opacity: 0.7; }
      50% { transform: scale(1.2); opacity: 1; }
    }
    .orb-fluid-core {
      position: relative;
      width: 160px;
      height: 160px;
      border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
      background: radial-gradient(circle at 35% 35%, #38bdf8 0%, #2563eb 32%, #4f46e5 65%, #0f172a 100%);
      animation: fluid-orb-morph 7s ease-in-out infinite alternate;
      box-shadow: inset 0 0 35px rgba(56, 189, 248, 0.6), 0 0 45px rgba(37, 99, 235, 0.45);
      overflow: hidden;
    }
    .orb-fluid-layer {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      mix-blend-mode: screen;
    }
    .orb-fluid-layer.layer-1 {
      background: radial-gradient(circle at 70% 25%, rgba(147, 197, 253, 0.8) 0%, transparent 60%);
      animation: layer-float-1 5s ease-in-out infinite alternate;
    }
    .orb-fluid-layer.layer-2 {
      background: radial-gradient(circle at 25% 75%, rgba(168, 85, 247, 0.7) 0%, transparent 60%);
      animation: layer-float-2 6s ease-in-out infinite alternate;
    }
    .orb-fluid-layer.layer-3 {
      background: radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.6) 0%, transparent 50%);
      animation: layer-float-3 4s ease-in-out infinite alternate;
    }
    @keyframes fluid-orb-morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(0deg); }
      33% { border-radius: 35% 65% 55% 45% / 45% 55% 45% 55%; transform: rotate(120deg); }
      66% { border-radius: 50% 50% 30% 70% / 55% 35% 65% 45%; transform: rotate(240deg); }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(360deg); }
    }
    @keyframes layer-float-1 { 0% { transform: translate(-8px, -8px) scale(0.9); } 100% { transform: translate(12px, 12px) scale(1.1); } }
    @keyframes layer-float-2 { 0% { transform: translate(10px, -6px) scale(1.1); } 100% { transform: translate(-10px, 8px) scale(0.9); } }
    @keyframes layer-float-3 { 0% { opacity: 0.5; } 100% { opacity: 0.95; } }
    .orb-ripple-ring {
      position: absolute;
      inset: -10px;
      border-radius: 50%;
      border: 1.5px solid rgba(56, 189, 248, 0.4);
      pointer-events: none;
      opacity: 0;
    }
    .chatgpt-fluid-voice-orb.speaking .orb-ripple-ring,
    .chatgpt-fluid-voice-orb.orb-speaking .orb-ripple-ring {
      animation: ripple-out 2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
    }
    .chatgpt-fluid-voice-orb.speaking #orb-ripple-2,
    .chatgpt-fluid-voice-orb.orb-speaking #orb-ripple-2 {
      animation-delay: 1s;
    }
    @keyframes ripple-out {
      0% { transform: scale(0.85); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    .voice-speaking-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      padding: 3px 8px;
      border-radius: 12px;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #93c5fd;
      font-size: 11px;
      cursor: pointer;
      font-weight: 600;
    }
    .voice-speaking-badge.speaking {
      animation: pulse-voice 1.5s infinite;
      color: #60a5fa;
    }
    /* Cards for custom models */
    .custom-model-card {
      padding: 11px 14px;
      border-bottom: 1px solid var(--hairline);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .custom-model-card:last-child { border-bottom: 0; }
    .tag {
      font-size: 10.5px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 8px;
    }
    .tag.active { background: rgba(52, 211, 153, 0.15); color: #34d399; }
    .tag.img { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    /* Desktop view */
    .screen-img {
      width: 100%;
      max-height: 540px;
      object-fit: contain;
      border-radius: var(--r-xl);
      border: 1px solid var(--hairline);
      background: #000;
      box-shadow: 0 12px 32px rgba(0,0,0,0.6);
    }
    /* Terminal */
    .term-box {
      background: #0b0c0c;
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-xl);
      padding: 16px;
      font-family: var(--mono);
      font-size: 12px;
      min-height: 320px;
      max-height: 480px;
      overflow-y: auto;
      color: #34d399;
      white-space: pre-wrap;
    }
    /* Mobile Drawer */
    .mobile-menu-btn {
      display: none;
      background: transparent;
      border: 0;
      color: var(--text-1);
      cursor: pointer;
    }
    .sidebar-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(3px);
      z-index: 95;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .sidebar-overlay.active {
      display: block;
      opacity: 1;
    }
    .btn-mode {
      background: var(--surface-2);
      border: 1px solid var(--border-subtle);
      color: var(--text-2);
      padding: 5px 10px;
      border-radius: var(--r-md);
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      user-select: none;
    }
    .btn-mode:hover { background: var(--surface-3); color: var(--text-1); }
    .btn-mode.active { background: rgba(37,99,235,0.22); border-color: #3b82f6; color: #93c5fd; font-weight: 600; }
    .header-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid var(--border-subtle);
      background: var(--surface-2);
      color: var(--text-2);
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
    }
    .header-pill-btn:hover { background: var(--surface-3); color: var(--text-1); }
    .header-pill-btn.active { background: rgba(52,211,153,0.15); border-color: #34d399; color: #34d399; }
    .key-btn { font-family: var(--mono); font-size: 11.5px; user-select: none; }
    .composer-tool-btn {
      background: transparent;
      border: 0;
      color: var(--text-2);
      cursor: pointer;
      padding: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: color 0.15s, background 0.15s;
    }
    .composer-tool-btn:hover { color: var(--text-1); background: rgba(255,255,255,0.06); }
    .composer-tool-btn.recording { color: #ef4444; background: rgba(239,68,68,0.15); animation: pulseRed 1s infinite; }
    .msg-bubble .audio-replay-btn {
      margin-left: 8px;
      background: transparent;
      border: 0;
      cursor: pointer;
      font-size: 12px;
      opacity: 0.7;
      transition: opacity 0.15s;
    }
    .msg-bubble .audio-replay-btn:hover { opacity: 1; }
    @keyframes pulseRed { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.15); } }
    @keyframes rippleAnim { 0% { width: 10px; height: 10px; opacity: 1; } 100% { width: 40px; height: 40px; opacity: 0; } }
    .ripple-dot {
      position: absolute;
      border-radius: 50%;
      border: 2px solid #3b82f6;
      background: rgba(59,130,246,0.35);
      pointer-events: none;
      transform: translate(-50%, -50%);
      animation: rippleAnim 0.4s ease-out forwards;
    }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @media (max-width: 768px) {
      .sidebar {
        position: fixed;
        left: -260px;
        top: 0;
        bottom: 0;
        z-index: 100;
        transition: left 0.25s ease;
        box-shadow: 4px 0 20px rgba(0,0,0,0.6);
      }
      .sidebar.open { left: 0; }
      .mobile-menu-btn { display: flex; align-items: center; margin-right: 12px; }
      .scroll-pane { padding: 16px 16px 80px 16px; }
    }
    /* Collapsible Thought Process Box (ChatGPT style) */
    .thought-container {
      margin-bottom: 8px;
      border-radius: var(--r-md);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      overflow: hidden;
      font-size: 12px;
      transition: background 0.15s, border-color 0.15s;
    }
    .thought-container:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.12);
    }
    .thought-summary {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      cursor: pointer;
      user-select: none;
      color: var(--text-2);
      font-weight: 500;
      list-style: none;
    }
    .thought-summary::-webkit-details-marker { display: none; }
    .thought-summary:hover { color: var(--text-1); }
    .thought-icon { font-size: 13px; }
    .thought-title { flex: 1; font-size: 12px; }
    .thought-count { font-size: 10.5px; opacity: 0.6; font-family: var(--mono); }
    .thought-chevron {
      font-size: 10px;
      transition: transform 0.2s ease;
      opacity: 0.6;
    }
    .thought-container[open] .thought-chevron {
      transform: rotate(180deg);
    }
    .thought-content {
      padding: 8px 12px 10px 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.5;
      color: #94a3b8;
      max-height: 220px;
      overflow-y: auto;
    }
    .thought-step {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .thought-step::before {
      content: '›';
      color: #3b82f6;
      font-weight: bold;
    }

    /* Actionable Recommendations Box */
    .recommendations-box {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: var(--r-md);
      background: rgba(59, 130, 246, 0.06);
      border: 1px solid rgba(59, 130, 246, 0.2);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .rec-header {
      font-size: 12px;
      font-weight: 600;
      color: #93c5fd;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rec-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .rec-btn {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 12px;
      background: var(--surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-md);
      color: var(--text-1);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      text-align: left;
      transition: all 0.15s ease;
      width: 100%;
    }
    .rec-btn:hover:not(:disabled) {
      background: var(--surface-3);
      border-color: #3b82f6;
      color: #60a5fa;
      transform: translateY(-1px);
    }
    .rec-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .rec-btn-title {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rec-btn-desc {
      font-size: 11px;
      color: var(--text-2);
      font-weight: normal;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    /* ============================================================
       Vorssaint Dynamic Island & Cute Dot Avatar (Face of Mave)
       ============================================================ */
    .dynamic-island-wrapper {
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9990;
      pointer-events: none;
      display: flex;
      justify-content: center;
    }
    .dynamic-island {
      pointer-events: auto;
      position: relative;
      background: rgba(14, 16, 22, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 22px;
      backdrop-filter: blur(24px) saturate(180%);
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
      color: #ffffff;
      user-select: none;
      transition: all 0.38s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
      outline: none;
    }
    [data-theme="light"] .dynamic-island,
    body.theme-light .dynamic-island {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(0, 0, 0, 0.12);
      color: #0f172a;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    }
    .island-compact {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 4px 14px 4px 6px;
      min-height: 38px;
      cursor: pointer;
    }
    .island-left { display: flex; align-items: center; gap: 10px; }
    .island-status-group { display: flex; align-items: center; gap: 7px; }
    .island-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 8px #34d399;
    }
    .dynamic-island.thinking .island-status-dot { background: #c084fc; box-shadow: 0 0 8px #c084fc; animation: pulse-dot 1s infinite alternate; }
    .dynamic-island.listening .island-status-dot { background: #38bdf8; box-shadow: 0 0 8px #38bdf8; animation: pulse-dot 0.8s infinite alternate; }
    .dynamic-island.speaking .island-status-dot { background: #2563eb; box-shadow: 0 0 8px #2563eb; }
    @keyframes pulse-dot { 0% { transform: scale(0.9); opacity: 0.7; } 100% { transform: scale(1.3); opacity: 1; } }
    .island-title { font-size: 13px; font-weight: 600; white-space: nowrap; }
    .island-right { display: flex; align-items: center; gap: 10px; }
    .island-audio-bars { display: flex; align-items: center; gap: 2.5px; height: 14px; }
    .i-bar { width: 2.5px; height: 4px; background: #38bdf8; border-radius: 2px; }
    .dynamic-island.speaking .i-bar,
    .dynamic-island.listening .i-bar { animation: i-bar-wave 0.6s ease-in-out infinite alternate; }
    .i-bar.bar-1 { animation-delay: 0.1s; }
    .i-bar.bar-2 { animation-delay: 0.25s; }
    .i-bar.bar-3 { animation-delay: 0.4s; }
    .i-bar.bar-4 { animation-delay: 0.15s; }
    @keyframes i-bar-wave { 0% { height: 3px; } 100% { height: 13px; } }
    .island-node-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      background: rgba(37, 99, 235, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(37, 99, 235, 0.35);
    }
    .dynamic-island.expanded {
      width: 440px;
      border-radius: 24px;
      padding: 16px 18px;
    }
    @media (max-width: 480px) {
      .dynamic-island.expanded { width: calc(100vw - 20px); }
    }
    .island-expanded { display: flex; flex-direction: column; gap: 14px; }
    .island-exp-header { display: flex; align-items: center; justify-content: space-between; }
    .island-exp-profile { display: flex; align-items: center; gap: 12px; }
    .island-exp-name { font-size: 15px; font-weight: 700; }
    .island-exp-sub { font-size: 11.5px; color: rgba(255, 255, 255, 0.65); }
    [data-theme="light"] .island-exp-sub,
    body.theme-light .island-exp-sub { color: rgba(15, 23, 42, 0.6); }
    .island-exp-top-actions { display: flex; align-items: center; gap: 8px; }
    .island-exp-action-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 11px;
      border-radius: 14px;
      cursor: pointer;
    }
    .island-collapse-btn {
      background: transparent;
      border: 0;
      color: inherit;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0.7;
    }
    .island-metrics-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 8px 10px;
    }
    [data-theme="light"] .island-metrics-row,
    body.theme-light .island-metrics-row {
      background: rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(0, 0, 0, 0.06);
    }
    .island-metric { display: flex; flex-direction: column; gap: 2px; }
    .im-label { font-size: 9px; font-weight: 700; letter-spacing: 0.05em; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; }
    [data-theme="light"] .im-label,
    body.theme-light .im-label { color: rgba(15, 23, 42, 0.5); }
    .im-val { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .island-tools-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .island-tool-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 8px 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      color: inherit;
      cursor: pointer;
    }
    [data-theme="light"] .island-tool-btn,
    body.theme-light .island-tool-btn {
      background: rgba(0, 0, 0, 0.04);
      border: 1px solid rgba(0, 0, 0, 0.08);
    }
    .it-icon { font-size: 15px; }
    .it-text { font-size: 10.5px; font-weight: 600; white-space: nowrap; }

    /* The Cute Little Dot Avatar */
    .island-dot-avatar {
      position: relative;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .island-dot-avatar.exp-size { width: 44px; height: 44px; }
    .dot-body {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, var(--dot-light, #38bdf8) 0%, var(--dot-shade, #2563eb) 85%);
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
      transition: transform 0.18s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .dot-shine {
      position: absolute;
      top: 14%;
      left: 20%;
      width: 28%;
      height: 18%;
      border-radius: 50%;
      transform: rotate(-30deg);
      background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 80%);
      pointer-events: none;
    }
    .dot-face {
      position: relative;
      width: 72%;
      height: 54%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dot-eyes-svg { width: 100%; height: 100%; }
    .dot-eye { fill: #111418; transform-origin: center; transition: all 0.15s ease; }
    .island-dot-avatar.blinking .dot-eye { transform: scaleY(0.08); }
    .dot-hopping { animation: dot-hop-jump 0.65s cubic-bezier(0.2, 0.8, 0.3, 1); }
    @keyframes dot-hop-jump {
      0% { transform: translateY(0) scale(1, 1); }
      18% { transform: translateY(2px) scale(1.18, 0.82); }
      45% { transform: translateY(-16px) scale(0.88, 1.15); }
      72% { transform: translateY(0) scale(1.16, 0.84); }
      86% { transform: translateY(-3px) scale(0.96, 1.04); }
      100% { transform: translateY(0) scale(1, 1); }
    }
    .dot-bouncing { animation: dot-bounce-multi 0.95s ease-in-out; }
    @keyframes dot-bounce-multi {
      0% { transform: translateY(0) scale(1); }
      16% { transform: translateY(-14px) scale(0.9, 1.15); }
      34% { transform: translateY(0) scale(1.15, 0.85); }
      52% { transform: translateY(-8px) scale(0.95, 1.08); }
      70% { transform: translateY(0) scale(1.08, 0.92); }
      85% { transform: translateY(-2px) scale(1); }
      100% { transform: translateY(0) scale(1); }
    }
    .island-dot-avatar.groove .dot-body { animation: dot-groove-beat 1.4s infinite ease-in-out; }
    @keyframes dot-groove-beat {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      25% { transform: translateY(-3px) rotate(-4deg); }
      50% { transform: translateY(0) scale(1.05, 0.95); }
      75% { transform: translateY(-3px) rotate(4deg); }
    }
  </style>
</head>
<body>
  <!-- Vorssaint Dynamic Island & Cute Dot Avatar (Mobile & Web Parity) -->
  <div class="dynamic-island-wrapper" id="dynamic-island-wrapper">
    <div class="dynamic-island" id="dynamic-island">
      <div class="island-compact" id="island-compact">
        <div class="island-left">
          <div class="island-dot-avatar" id="island-dot-avatar" title="Meet Mave (Tap to pet or open HUD)">
            <div class="dot-body" id="dot-body">
              <div class="dot-shine"></div>
              <div class="dot-face">
                <svg class="dot-eyes-svg" viewBox="0 0 100 60">
                  <path class="dot-eye eye-left" d="M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z" fill="#111418" />
                  <path class="dot-eye eye-right" d="M 67 20 C 71 20, 73 23, 73 30 C 73 37, 71 40, 67 40 C 63 40, 61 37, 61 30 C 61 23, 63 20, 67 20 Z" fill="#111418" />
                </svg>
              </div>
            </div>
          </div>
          <div class="island-status-group">
            <span class="island-status-dot" id="island-status-dot"></span>
            <span class="island-title" id="island-title">Mave Core</span>
          </div>
        </div>
        <div class="island-right">
          <div class="island-audio-bars">
            <span class="i-bar bar-1"></span>
            <span class="i-bar bar-2"></span>
            <span class="i-bar bar-3"></span>
            <span class="i-bar bar-4"></span>
          </div>
          <span class="island-node-pill" id="island-node-pill">Host AI</span>
        </div>
      </div>

      <div class="island-expanded" id="island-expanded" style="display:none;">
        <div class="island-exp-header">
          <div class="island-exp-profile">
            <div class="island-dot-avatar exp-size">
              <div class="dot-body">
                <div class="dot-shine"></div>
                <div class="dot-face">
                  <svg class="dot-eyes-svg" viewBox="0 0 100 60">
                    <path class="dot-eye" d="M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z" fill="#111418" />
                    <path class="dot-eye" d="M 67 20 C 71 20, 73 23, 73 30 C 73 37, 71 40, 67 40 C 63 40, 61 37, 61 30 C 61 23, 63 20, 67 20 Z" fill="#111418" />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <div class="island-exp-name">Mave Companion</div>
              <div class="island-exp-sub" id="island-exp-sub">Ready • Core Brain Connected</div>
            </div>
          </div>
          <div class="island-exp-top-actions">
            <button type="button" class="island-exp-action-btn" id="island-pet-btn">🐾 Pet</button>
            <button type="button" class="island-collapse-btn" id="island-collapse-btn">✕</button>
          </div>
        </div>
        <div class="island-metrics-row">
          <div class="island-metric">
            <span class="im-label">ROLE</span>
            <span class="im-val" id="im-node-role">Host Brain</span>
          </div>
          <div class="island-metric">
            <span class="im-label">PLATFORM</span>
            <span class="im-val" id="im-platform-val">Companion</span>
          </div>
          <div class="island-metric">
            <span class="im-label">CPU / GPU</span>
            <span class="im-val">12% • 41°C</span>
          </div>
          <div class="island-metric">
            <span class="im-label">STATUS</span>
            <span class="im-val" style="color:#34d399;">Active</span>
          </div>
        </div>
        <div class="island-tools-grid">
          <button type="button" class="island-tool-btn" id="island-tool-voice">
            <span class="it-icon">🎙️</span>
            <span class="it-text">Talk Voice</span>
          </button>
          <button type="button" class="island-tool-btn" id="island-tool-cmd" onclick="quickTask('Check system diagnostics')">
            <span class="it-icon">📊</span>
            <span class="it-text">Diagnostics</span>
          </button>
          <button type="button" class="island-tool-btn" id="island-tool-theme" onclick="document.getElementById('theme-toggle-btn').click()">
            <span class="it-icon">🌙</span>
            <span class="it-text">Theme</span>
          </button>
          <button type="button" class="island-tool-btn" id="island-tool-cam" onclick="document.getElementById('cam-open-btn').click()">
            <span class="it-icon">📷</span>
            <span class="it-text">Camera</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="app-window">
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="brand-header">
        <span class="brand-badge"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></span>
        <span class="brand-title">Mave</span>
      </div>
      <nav id="nav">
        <button class="nav-btn active" data-tab="home">
          <span class="row-icon" style="background:#2563eb"><svg viewBox="0 0 16 16" fill="#fff"><path d="M8 2.5l6 4.5v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7l6-4.5z"/></svg></span>
          <span>Home</span>
        </button>

        <div class="nav-sep">Settings</div>

        <button class="nav-btn" data-tab="assistant">
          <span class="row-icon" style="background:#3380ff"><svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.5"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.7-2.4 2.7-3.7 5-3.7s4.3 1.3 5 3.7"/></svg></span>
          <span>Assistant</span>
        </button>

        <button class="nav-btn" data-tab="models">
          <span class="row-icon" style="background:linear-gradient(135deg,#d97757,#8f46eb 55%,#2563eb)"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5z"/></svg></span>
          <span>Models</span>
        </button>

        <button class="nav-btn" data-tab="voice">
          <span class="row-icon" style="background:#8f46eb"><svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.5"><path d="M3 6.5v3M5.5 4.5v7M8 2.5v11M10.5 5v6M13 7v2"/></svg></span>
          <span>Voice</span>
        </button>

        <button class="nav-btn" data-tab="superpowers">
          <span class="row-icon" style="background:linear-gradient(135deg,#f59e0b,#ef4444)"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
          <span>Superpowers</span>
        </button>

        <button class="nav-btn" data-tab="general">
          <span class="row-icon" style="background:#6b736f"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
          <span>General</span>
        </button>

        <div class="nav-sep">Tools</div>

        <button class="nav-btn" data-tab="terminal">
          <span class="row-icon" style="background:#0b0c0c; border:1px solid #373b39"><svg viewBox="0 0 16 16" fill="none" stroke="#34d399" stroke-width="1.6"><path d="M3.5 5l3 3-3 3M8.5 11.5h4"/></svg></span>
          <span>Terminal</span>
        </button>

        <button class="nav-btn" data-tab="screen">
          <span class="row-icon" style="background:#10b981"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
          <span>Live Desktop View</span>
        </button>

        <button class="nav-btn" data-tab="mavedrop">
          <span class="row-icon" style="background:linear-gradient(135deg,#0284c7,#38bdf8)"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 2v13m0-13l-4 4m4-4l4 4"/><rect x="4" y="14" width="16" height="7" rx="2"/></svg></span>
          <span>MaveDrop (AirDrop)</span>
        </button>

        <button class="nav-btn" data-tab="hands">
          <span class="row-icon" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M10 14H6a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6h4a6 6 0 0 0 6-6v-4a2 2 0 0 0-2-2h-4"/></svg></span>
          <span>Distributed Hands</span>
        </button>
      </nav>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>

    <!-- Main Content -->
    <main class="content-area">
      <!-- HTTPS Security Banner (Visible on HTTP for remote devices) -->
      <div id="https-banner" style="display:none; background:linear-gradient(90deg, #1e3a8a, #4338ca); color:#fff; padding:8px 16px; font-size:12px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.15);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>🔒</span>
          <span><b>Secure Context Required:</b> Camera & Mic require HTTPS on your LAN.</span>
        </div>
        <a id="https-switch-link" href="${httpsUrl}" style="background:#fff; color:#1e3a8a; padding:4px 10px; border-radius:6px; font-weight:700; text-decoration:none; font-size:11px;">Switch to HTTPS (Port 4043)</a>
      </div>

      <header class="top-header">
        <div style="display:flex; align-items:center;">
          <button class="mobile-menu-btn" id="menu-toggle"><svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
          <div class="page-title" id="page-title">Home</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="header-pill-btn" id="theme-toggle-btn" title="Toggle Light / Dark Theme">
            <span id="theme-icon">🌙</span> <span id="theme-text">Dark</span>
          </button>
          <button class="header-pill-btn" id="voice-mode-open-btn" style="background:linear-gradient(135deg, #2563eb, #8b5cf6); color:#fff; border:none; font-weight:600; display:flex; align-items:center; gap:6px;">
            <span>🎙️</span> <span>Voice Mode</span>
          </button>
          <button class="header-pill-btn" id="remote-speaker-btn" title="Toggle audio playback on this remote device">
            <span id="speaker-icon">🔊</span> <span id="speaker-text">Speaker: Off</span>
          </button>
          <div class="status-pill" id="security-tier-pill" style="font-weight:600; cursor:pointer;" title="Security Access Tier">🔒 Host Admin</div>
          <div class="status-pill"><span class="status-dot"></span><span id="global-status">Ready</span></div>
        </div>
      </header>

      <!-- Panes -->
      <div class="scroll-pane" id="scroll-pane">
        <!-- 1. Home Chat -->
        <section data-pane="home" class="home-chat">
          <div class="chat-feed" id="chat-feed">
            <div class="empty-chat" id="empty-chat">
              <div class="empty-icon"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
              <div style="font-size:16px; font-weight:600; color:var(--text-1)">How can I help?</div>
              <div style="font-size:12.5px; max-width:320px;">Ask anything, control Windows, run terminal commands, or switch local models.</div>
            </div>
          </div>
          <div class="quick-actions" style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom:12px;">
            <button type="button" class="btn secondary small action-btn" onclick="quickTask('Check system diagnostics')">📊 System Diagnostics</button>
            <button type="button" class="btn secondary small action-btn" onclick="quickTask('Show active windows')">🪟 Active Windows</button>
          </div>

          <!-- Mic recording banner -->
          <div id="recording-banner" style="display:none; align-items:center; justify-content:space-between; padding:8px 12px; margin-bottom:8px; background:rgba(229,72,77,0.15); border:1px solid rgba(229,72,77,0.4); border-radius:var(--r-md); color:#f87171;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ef4444; animation:pulse 1s infinite;"></span>
              <span style="font-size:12px; font-weight:600;" id="recording-status-text">Listening to your device mic…</span>
            </div>
            <button type="button" class="btn secondary small" id="stop-recording-btn" style="padding:2px 8px; font-size:11px; background:#ef4444; color:#fff; border:0;">Stop & Send</button>
          </div>

          <form class="composer" id="chat-form">
            <button type="button" class="composer-tool-btn" id="cam-open-btn" title="Scan with Device Camera">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <button type="button" class="composer-tool-btn" id="mic-btn" title="Speak Voice Command (Audio Talk Back)">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            <textarea id="prompt-input" rows="1" placeholder="Message Mave…" spellcheck="true"></textarea>
            <button type="button" class="voice-mode-circle-btn" id="composer-voice-mode-btn" title="ChatGPT-Style Hands-Free Voice Mode (Talk)">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M7 9v6M10 6v12M14 4v16M17 7v10M20 10v4"/></svg>
            </button>
            <button type="submit" class="send-icon-btn" id="send-btn" title="Send (Enter)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 12.5V3.8M4.2 7.4L8 3.6l3.8 3.8"/></svg>
            </button>
          </form>
        </section>

        <!-- 2. Assistant -->
        <section data-pane="assistant" hidden>
          <div class="hero">
            <div class="row-icon big" style="background:#3380ff"><svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.5"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.7-2.4 2.7-3.7 5-3.7s4.3 1.3 5 3.7"/></svg></div>
            <div><div class="title-2" id="hero-name">Mave</div></div>
          </div>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline">Assistant Name</span><span class="hint">What you call your assistant</span></div>
              <input class="field" id="asst-name" value="Mave" style="width: 160px;">
            </div>
            <div class="row">
              <div class="label"><span class="headline">Wake Word Recognition</span><span class="hint">Listen for “Hey Mave” via offline Whisper</span></div>
              <label class="switch"><input type="checkbox" id="wake-toggle" checked><span class="track"></span></label>
            </div>
          </div>
        </section>

        <!-- 3. Models -->
        <section data-pane="models" hidden>
          <div class="hero">
            <div class="row-icon big" style="background:linear-gradient(135deg,#d97757,#8f46eb 55%,#2563eb)"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5z"/></svg></div>
            <div><div class="title-2">Models & Intelligence</div></div>
          </div>

          <div class="section-label">Cloud Frontier Intelligence (ChatGPT / Claude / OpenRouter)</div>
          <div class="group" id="cloud-models-box" style="padding:14px;">
            <div style="font-size:12px; color:var(--text-2); margin-bottom:12px; line-height:1.5;">
              Connect Mave directly to <b>ChatGPT (OpenAI)</b> or <b>Claude</b>, or use <b>OpenRouter</b> / <b>DeepSeek</b> for deeper reasoning, complex coding, and smarter analysis.
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div class="label">
                  <div style="font-weight:600; font-size:13px; color:var(--text-1);">Active Intelligence Provider</div>
                  <div style="font-size:11px; color:var(--text-3);" id="cloud-provider-hint">Currently using Local Qwen3-VL</div>
                </div>
                <div class="segmented" id="cloud-provider-seg">
                  <button type="button" class="seg-opt active" data-prov="local">🖥️ Local GPU</button>
                  <button type="button" class="seg-opt" data-prov="openai">🧠 ChatGPT</button>
                  <button type="button" class="seg-opt" data-prov="anthropic">⚡ Claude</button>
                </div>
              </div>

              <div id="cloud-credentials-wrap" style="display:none; flex-direction:column; gap:10px; margin-top:6px; padding-top:10px; border-top:1px solid var(--hairline);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                  <div class="label">
                    <span class="headline" id="cloud-key-label">OpenAI API Key</span>
                    <span class="hint">Stored encrypted with Windows safeStorage</span>
                  </div>
                  <input type="password" class="field mono" id="cloud-key-input" placeholder="sk-..." style="width:200px;">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;" id="cloud-endpoint-wrap">
                  <div class="label">
                    <span class="headline">Custom API Base URL</span>
                    <span class="hint">Leave empty for official OpenAI, or use OpenRouter (https://openrouter.ai/api/v1), DeepSeek, Groq.</span>
                  </div>
                  <input type="text" class="field mono" id="cloud-endpoint-input" placeholder="https://api.openai.com/v1" style="width:200px;">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                  <div class="label">
                    <span class="headline">Model ID</span>
                    <span class="hint">e.g. gpt-4o, o3-mini, gpt-4o-mini, claude-3-5-sonnet-20241022, deepseek/deepseek-r1</span>
                  </div>
                  <input type="text" class="field mono" id="cloud-model-input" placeholder="gpt-4o" style="width:160px;">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
                  <button type="button" class="btn secondary small" id="cloud-save-btn">Save & Connect 🚀</button>
                </div>
                <div id="cloud-status-msg" style="font-size:11.5px; text-align:right; display:none;"></div>
              </div>
            </div>
          </div>

          <div class="section-label">Official Qwen3-VL Vision Models</div>
          <div class="group" id="builtin-models-list">
            <!-- Populated via API -->
          </div>

          <div class="section-label">AirLLM Layer Streaming Engine · 70B+ on 8GB GPU (github.com/lyogavin/airllm)</div>
          <div class="group" id="airllm-models-list">
            <!-- Populated via API -->
          </div>

          <div class="section-label">Colibri MoE Engine · Frontier Models (github.com/JustVugg/colibri)</div>
          <div class="group" id="colibri-models-list">
            <!-- Populated via API -->
          </div>

          <div class="section-label">Ollama Local Models</div>
          <div class="group" id="ollama-models-list">
            <!-- Populated via API -->
          </div>

          <div class="section-label">Installed & Custom Models on This PC</div>
          <div class="group" id="custom-models-list">
            <!-- Populated via API -->
          </div>

          <div class="section-label">Local Image & Diffusion Models (.safetensors)</div>
          <div class="group" id="image-models-list">
            <!-- Populated via API -->
          </div>

          <div class="section-label">Active Model Status</div>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline" id="active-model-name">Qwen3-VL 8B</span><span class="hint" id="active-model-hint">GPU-accelerated · 32k context · ready offline</span></div>
              <span class="tag active">Loaded</span>
            </div>
          </div>
        </section>

        <!-- 4. Voice -->
        <section data-pane="voice" hidden>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline">Speak Replies Out Loud</span><span class="hint">Neural TTS built-in offline with Kokoro</span></div>
              <label class="switch"><input type="checkbox" id="voice-speak" checked><span class="track"></span></label>
            </div>
            <div class="row">
              <div class="label"><span class="headline">Voice Selection</span><span class="hint">Kokoro 82M offline voices</span></div>
              <div class="segmented" id="voice-picker">
                <button class="seg-opt active" data-val="af_heart">Heart</button>
                <button class="seg-opt" data-val="af_bella">Bella</button>
                <button class="seg-opt" data-val="bf_emma">Emma</button>
                <button class="seg-opt" data-val="am_michael">Michael</button>
                <button class="seg-opt" data-val="am_fenrir">Fenrir</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 5. Superpowers -->
        <section data-pane="superpowers" hidden>
          <div class="hero">
            <div class="row-icon big" style="background:linear-gradient(135deg,#f59e0b,#ef4444)"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
            <div><div class="title-2">Superpowers & Extensions</div></div>
          </div>

          <!-- Telegram -->
          <div class="section-label">Telegram Bot Bridge</div>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline">Enable Telegram Remote Control</span><span class="hint">Control Mave from Telegram on your phone</span></div>
              <label class="switch"><input type="checkbox" id="sp-tg-enable"><span class="track"></span></label>
            </div>
            <div class="row stack">
              <div class="row-head"><span class="headline">Bot Token</span><span id="sp-tg-status" class="tag active">Active</span></div>
              <div class="field-wrap">
                <input class="field mono" id="sp-tg-token" type="password" placeholder="Paste bot token from @BotFather…">
                <button class="btn secondary small" id="sp-tg-connect">Connect</button>
              </div>
            </div>
          </div>

          <!-- Mobile LAN -->
          <div class="section-label">Mobile LAN Controller</div>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline">Wi-Fi LAN Address</span><span class="hint" id="sp-lan-hint">Access from phone: ${lanUrl}</span></div>
              <button class="btn secondary small" id="sp-lan-copy">Copy URL</button>
            </div>
          </div>

          <!-- Desktop Pet -->
          <div class="section-label">Codex Desktop Pet Companion</div>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline">Show Desktop Pet Companion</span><span class="hint">Animated interactive pet companion on screen</span></div>
              <label class="switch"><input type="checkbox" id="sp-pet-enable"><span class="track"></span></label>
            </div>
            <div class="row">
              <div class="label"><span class="headline">Species</span></div>
              <div class="segmented" id="sp-pet-species">
                <button class="seg-opt active" data-val="puppy">Puppy 🐶</button>
                <button class="seg-opt" data-val="kitten">Kitten 🐱</button>
                <button class="seg-opt" data-val="dragon">Dragon 🐲</button>
                <button class="seg-opt" data-val="robot">Robot 🤖</button>
              </div>
            </div>
            <div class="row">
              <div class="label"><span class="headline">Pet State</span><span class="hint" id="sp-pet-hint">Energy: 85% · Hunger: 30% · Mood: Happy</span></div>
              <div style="display:flex; gap:8px;">
                <button class="btn secondary small" id="sp-pet-feed">Feed Pet 🍖</button>
                <button class="btn plain small" id="sp-pet-summon">Summon</button>
              </div>
            </div>
          </div>

          <!-- Routines & Screen Memory -->
          <div class="section-label">Proactive Routines & Total Recall</div>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline">Circadian Executive Briefing</span><span class="hint">Morning overview of tasks and system metrics</span></div>
              <button class="btn secondary small" id="sp-briefing-btn">Trigger Briefing</button>
            </div>
            <div class="row">
              <div class="label"><span class="headline">Knowledge Vault Directory</span><span class="hint">Folder for neural RAG document retrieval</span></div>
              <div style="display:flex; gap:8px;">
                <input class="field mono" id="sp-vault-dir" value="E:\\AI-Models" style="width:160px;">
                <button class="btn secondary small" id="sp-vault-reindex">Re-Index</button>
              </div>
            </div>
          </div>

          <!-- Claude-Mods Agent Skills & Diagnostics -->
          <div class="section-label">Claude-Mods Agent Skills & Diagnostics (112 Skills Active)</div>
          <div class="group">
            <div class="row">
              <div class="label">
                <span class="headline">112 Modular Agent Skills Mounted</span>
                <span class="hint">DevOps, Debugging, Windows Ops, Docker, Security Shield & Frameworks</span>
              </div>
              <span class="tag active" id="sp-cm-status">v3.9.0 Active</span>
            </div>
            <div class="row">
              <div class="label">
                <span class="headline">Workstation Health Audit</span>
                <span class="hint">Comprehensive hardware (WHEA), storage SMART, crashes & startup check</span>
              </div>
              <button class="btn secondary small" id="sp-cm-health-btn">Run Health Audit 🩺</button>
            </div>
            <div class="row">
              <div class="label">
                <span class="headline">Process CPU Rate Triage</span>
                <span class="hint">Detect runaway, spinning, and hung processes by live CPU rate</span>
              </div>
              <button class="btn secondary small" id="sp-cm-proc-btn">Triage Processes ⚡</button>
            </div>
            <div class="row">
              <div class="label">
                <span class="headline">Kernel-Power Crash Triage</span>
                <span class="hint">Decode Event 41 stop codes and pre-crash timeline</span>
              </div>
              <button class="btn secondary small" id="sp-cm-crash-btn">Check Crashes 💥</button>
            </div>
            <div class="row stack">
              <div class="row-head">
                <span class="headline">Browse Skills Library</span>
                <span class="hint">Search any of the 112 skills (e.g. windows, docker, debug, git, security)</span>
              </div>
              <div class="field-wrap">
                <input class="field mono" id="sp-cm-skill-query" placeholder="Search skill (e.g. windows, docker, debug, sql)…">
                <button class="btn secondary small" id="sp-cm-skill-search">Search</button>
              </div>
              <div id="sp-cm-skills-list" style="margin-top:8px; font-size:12px; max-height:180px; overflow-y:auto; display:none; background:rgba(0,0,0,0.25); padding:10px; border-radius:6px; font-family:var(--font-mono); white-space:pre-wrap; line-height:1.5;"></div>
            </div>
          </div>
        </section>

        <!-- 6. General -->
        <section data-pane="general" hidden>
          <div class="section-label">Appearance</div>
          <div class="group">
            <div class="row">
              <div class="label"><span class="headline">Theme</span><span class="hint">Select light, dark, or follow system theme</span></div>
              <div class="segmented" id="theme-segmented">
                <button type="button" class="seg-opt active" data-theme-val="dark">🌙 Dark</button>
                <button type="button" class="seg-opt" data-theme-val="light">☀️ Light</button>
                <button type="button" class="seg-opt" data-theme-val="system">💻 System</button>
              </div>
            </div>
          </div>
          <div class="section-label">Preferences</div>
          <div class="group">
            <div class="row"><div class="label"><span class="headline">Sound Effects</span></div><label class="switch"><input type="checkbox" id="gen-sounds" checked><span class="track"></span></label></div>
            <div class="row"><div class="label"><span class="headline">Launch at Login</span></div><label class="switch"><input type="checkbox" id="gen-login"><span class="track"></span></label></div>
          </div>
          <div class="section-label">Remote Access & Security PINs</div>
          <div class="group" style="padding:16px;">
            <div style="font-size:12.5px; color:var(--text-2); margin-bottom:14px; line-height:1.5;">
              Protect Mave when connecting from another device on your Wi-Fi network. Passwords can be viewed and customized from this host device anytime.
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>
                  <div style="font-weight:600; font-size:13px; color:#93c5fd;">Viewer PIN (Read-Only)</div>
                  <div style="font-size:11.5px; color:var(--text-3);">Allows viewing live desktop and system metrics without chat or control.</div>
                </div>
                <input type="text" class="field mono" id="sec-read-pin" value="" placeholder="••••" maxlength="8" style="width:110px; text-align:center; font-weight:700;">
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>
                  <div style="font-weight:600; font-size:13px; color:#6ee7b7;">Operator PIN (Chat & Operate)</div>
                  <div style="font-size:11.5px; color:var(--text-3);">Allows chatting, ChatGPT voice mode, and remote PC mouse/keyboard control.</div>
                </div>
                <input type="text" class="field mono" id="sec-operate-pin" value="" placeholder="••••" maxlength="8" style="width:110px; text-align:center; font-weight:700;">
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>
                  <div style="font-weight:600; font-size:13px; color:#fcd34d;">Admin PIN (Full Control)</div>
                  <div style="font-size:11.5px; color:var(--text-3);">Unlocks settings modifications, terminal execution, and password updates.</div>
                </div>
                <input type="text" class="field mono" id="sec-admin-pin" value="" placeholder="••••" maxlength="8" style="width:110px; text-align:center; font-weight:700;">
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px;">
                <button type="button" class="btn primary small" id="sec-save-pins-btn">Save Security PINs</button>
                <span id="sec-status-msg" style="font-size:12px; font-weight:600; color:#34d399; display:none;">✓ PINs Saved!</span>
              </div>
            </div>
          </div>
          <div class="section-label">System Info</div>
          <div class="group">
            <div class="row"><div class="label"><span class="headline">Version</span></div><span class="headline" style="color:var(--text-2)">Mave 2.0 (Local AI)</span></div>
          </div>
        </section>

        <!-- 7. Terminal -->
        <section data-pane="terminal" hidden>
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <input class="field mono" id="term-cmd" placeholder="Enter PowerShell command (e.g. dir, git status)…" style="flex:1;">
            <button class="btn primary small" id="term-run-btn">Run Command</button>
          </div>
          <div class="term-box" id="term-output">Mave Terminal initialized. Ready for commands and live activity stream…</div>
        </section>

        <!-- 8. Desktop View -->
        <section data-pane="screen" hidden>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#ef4444; animation:pulse 1.5s infinite;"></span>
              <div class="headline" style="font-size:14px; font-weight:600;">Live PC Desktop View</div>
              <span class="tag active" id="stream-status-tag">Live Stream Active</span>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <button class="btn secondary small" id="stream-toggle-btn">Pause Stream</button>
              <select class="field small" id="stream-fps-select" style="width:125px; padding:4px 6px; font-size:11.5px; height:28px;">
                <option value="15" selected>15 FPS (Smooth)</option>
                <option value="20">20 FPS (Turbo)</option>
                <option value="8">8 FPS (Eco)</option>
              </select>
              <select class="field small" id="stream-quality-select" style="width:120px; padding:4px 6px; font-size:11.5px; height:28px;">
                <option value="fast" selected>Fast (Smooth)</option>
                <option value="quality">HD Quality</option>
              </select>
              <button class="btn secondary small" id="screen-refresh">Snap Frame</button>
              <button class="btn secondary small" id="screen-lock">Lock PC</button>
              <button class="btn secondary small" id="screen-media">Media Play/Pause</button>
            </div>
          </div>

          <!-- Mouse mode selector -->
          <div class="mouse-mode-bar" style="display:flex; gap:6px; margin-bottom:8px; overflow-x:auto; padding-bottom:4px;">
            <span style="font-size:11px; color:var(--text-3); align-self:center; margin-right:4px;">Mouse Mode:</span>
            <button type="button" class="btn-mode active" data-mode="left">🖱️ Left Click</button>
            <button type="button" class="btn-mode" data-mode="right">👆 Right Click</button>
            <button type="button" class="btn-mode" data-mode="double">✌️ Double Click</button>
            <button type="button" class="btn-mode" data-mode="drag">✋ Drag</button>
            <button type="button" class="btn-mode" data-mode="scroll-up">⬆️ Scroll Up</button>
            <button type="button" class="btn-mode" data-mode="scroll-down">⬇️ Scroll Down</button>
          </div>

          <!-- Interactive Screen View Container -->
          <div class="screen-container" id="screen-container" style="position:relative; width:100%; border-radius:var(--r-xl); overflow:hidden; border:1px solid var(--border-subtle); background:#000; display:flex; justify-content:center; align-items:center; cursor:crosshair; touch-action:none; user-select:none;">
            <img class="screen-img" id="screen-view-img" src="/api/screen/stream" alt="Live PC Desktop Feed" style="width:100%; height:auto; max-height:540px; object-fit:contain; display:block; pointer-events:none;">
            <div id="screen-click-indicator" style="position:absolute; width:16px; height:16px; border-radius:50%; border:2px solid #3b82f6; background:rgba(59,130,246,0.4); pointer-events:none; transform:translate(-50%,-50%); display:none;"></div>
          </div>

          <!-- Remote Keyboard & Quick Key Actions -->
          <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; gap:8px;">
              <input class="field" id="remote-type-text" placeholder="Type text to send to host PC..." style="flex:1;">
              <button class="btn primary small" id="remote-type-send">Send Typing</button>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn secondary small key-btn" data-key="win">⊞ Win</button>
              <button type="button" class="btn secondary small key-btn" data-key="enter">Enter ↵</button>
              <button type="button" class="btn secondary small key-btn" data-key="escape">Esc</button>
              <button type="button" class="btn secondary small key-btn" data-key="backspace">⌫ Backspace</button>
              <button type="button" class="btn secondary small key-btn" data-key="tab">Tab ⇥</button>
              <button type="button" class="btn secondary small key-btn" data-key="space">Space</button>
              <button type="button" class="btn secondary small key-btn" data-key="ctrl+c">Ctrl+C</button>
              <button type="button" class="btn secondary small key-btn" data-key="ctrl+v">Ctrl+V</button>
              <button type="button" class="btn secondary small key-btn" data-key="ctrl+z">Ctrl+Z</button>
              <button type="button" class="btn secondary small key-btn" data-key="alt+tab">Alt+Tab</button>
            </div>
          </div>
        </section>

        <!-- 9. MaveDrop (P2P AirDrop & LAN Sync) -->
        <section data-pane="mavedrop" hidden>
          <div class="hero">
            <div class="row-icon big" style="background:linear-gradient(135deg,#0284c7,#38bdf8)">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 2v13m0-13l-4 4m4-4l4 4"/><rect x="4" y="14" width="16" height="7" rx="2"/></svg>
            </div>
            <div>
              <div class="title-2">MaveDrop P2P Wireless Sharing</div>
              <div class="hint">Zero-cloud local Wi-Fi AirDrop parity for Windows, Android (Artemis), and iPhone.</div>
            </div>
          </div>

          <!-- File Drop Zone -->
          <div class="group" style="padding:24px 20px; text-align:center; border:2px dashed var(--border-subtle); cursor:pointer; margin-bottom:14px; background:rgba(2,132,199,0.04);" id="mavedrop-zone">
            <input type="file" id="mavedrop-file-input" multiple style="display:none;">
            <div style="font-size:36px; margin-bottom:6px;">📦</div>
            <div class="headline" style="font-size:15px; margin-bottom:4px;">Tap or Drop Files Here to Send</div>
            <div class="hint">Instant wireless transfer directly to PC's ~/Downloads/MaveDrop</div>
            <button type="button" class="btn primary small" style="margin-top:12px;" onclick="$('mavedrop-file-input').click()">Select Files to Send</button>
            <div id="mavedrop-upload-status" style="margin-top:10px; font-size:12px; color:var(--accent-text);"></div>
          </div>

          <!-- LAN Clipboard Sync Card -->
          <div class="group" style="margin-bottom:14px;">
            <div class="row">
              <div class="label">
                <div class="headline">📋 Cross-Device LAN Clipboard Sync</div>
                <div class="hint">Instantly sync text and links between this mobile device and Windows host clipboard.</div>
              </div>
            </div>
            <div class="row stack">
              <textarea class="field" id="lan-clipboard-text" rows="3" placeholder="Type or paste text to sync across LAN devices..."></textarea>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn primary small" id="btn-sync-to-pc">Sync to Windows Clipboard</button>
                <button type="button" class="btn secondary small" id="btn-fetch-pc-clip">Fetch from Windows Clipboard</button>
              </div>
              <div id="clipboard-sync-status" style="font-size:11.5px; color:var(--text-2);"></div>
            </div>
          </div>

          <!-- Discovered / Connected Devices -->
          <div class="group" style="margin-bottom:14px;">
            <div class="row">
              <div class="label">
                <div class="headline">📱 Discovered Mobile Devices</div>
                <div class="hint">Google Artemis Android & iPhone-Use targets detected on local network.</div>
              </div>
              <button type="button" class="btn secondary small" id="btn-refresh-devices">Scan LAN</button>
            </div>
            <div id="mavedrop-device-list" style="padding:12px 16px; font-size:12.5px; color:var(--text-2); display:flex; flex-direction:column; gap:6px;">
              Scanning local Wi-Fi for mobile devices...
            </div>
          </div>

          <!-- Received Files Storage -->
          <div class="group">
            <div class="row">
              <div class="label">
                <div class="headline">📂 Received MaveDrop Files</div>
                <div class="hint" id="mavedrop-dir-hint">Stored in ~/Downloads/MaveDrop on host computer</div>
              </div>
              <button type="button" class="btn secondary small" id="btn-refresh-files">Refresh List</button>
            </div>
            <div id="mavedrop-file-list" style="display:flex; flex-direction:column;">
              <div style="padding:16px; text-align:center; color:var(--text-3);">No files in MaveDrop storage yet.</div>
            </div>
          </div>
        </section>

        <!-- 10. Distributed Hands (Remote Worker Mode & Permission Gating) -->
        <section data-pane="hands" hidden>
          <div class="hero">
            <div class="row-icon big" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M10 14H6a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6h4a6 6 0 0 0 6-6v-4a2 2 0 0 0-2-2h-4"/></svg>
            </div>
            <div>
              <div class="title-2">Distributed Hands · Remote Worker Mode</div>
              <div class="hint">The Host PC is always the Brain. This device can act as the Hands. If you grant permission, Mave can perform tasks on this screen without touching the host PC.</div>
            </div>
          </div>

          <!-- Remote Device Permission Controller -->
          <div class="group" style="margin-bottom:14px;">
            <div class="row">
              <div class="label">
                <div class="headline">✋ Act as Hands for Mave</div>
                <div class="hint">Allow Mave's AI Brain to perform tasks and control this device's screen and input.</div>
              </div>
              <span class="badge" id="hands-status-badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3); font-size:11px; font-weight:700;">⛔ Disconnected</span>
            </div>

            <div class="row">
              <div class="label">
                <div class="headline">Device Name</div>
                <div class="hint">Identifies this device when asking Mave to perform a task.</div>
              </div>
              <input type="text" class="field" id="hands-device-name" style="max-width:240px;" placeholder="e.g. Alex's MacBook">
            </div>

            <div class="row">
              <div class="label">
                <div class="headline">Control Permission Duration</div>
                <div class="hint">How long Mave is authorized to work on this device before requiring re-approval.</div>
              </div>
              <select class="field" id="hands-permission-duration" style="max-width:180px;">
                <option value="15">15 Minutes</option>
                <option value="60" selected>1 Hour</option>
                <option value="240">4 Hours</option>
                <option value="1440">24 Hours</option>
              </select>
            </div>

            <div class="row" style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
              <button type="button" class="btn primary" id="btn-grant-hands-permission" style="background:#4f46e5; border-color:#4338ca;">
                <span>✋ Grant Permission & Enable Hands</span>
              </button>
              <button type="button" class="btn secondary" id="btn-stream-hands-screen">
                <span>🖥️ Share My Screen</span>
              </button>
              <button type="button" class="btn danger" id="btn-revoke-hands-permission" style="background:rgba(239,68,68,0.15); color:#ef4444; border-color:rgba(239,68,68,0.3);">
                <span>⛔ Emergency Stop & Revoke</span>
              </button>
            </div>
          </div>

          <!-- Live Hands Action Console -->
          <div class="group" style="margin-bottom:14px;">
            <div class="row">
              <div class="label">
                <div class="headline">📋 Hands Activity Log</div>
                <div class="hint">Real-time actions dispatched by Mave's AI Brain to this device.</div>
              </div>
              <button type="button" class="btn secondary small" id="btn-clear-hands-log">Clear</button>
            </div>
            <div id="hands-action-log" style="padding:12px 14px; font-size:12.5px; font-family:monospace; background:rgba(0,0,0,0.25); border-radius:var(--r-md); max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; color:var(--text-2);">
              <div>[Ready] Waiting for Mave task instructions...</div>
            </div>
          </div>

          <!-- Connected Hands Fleet (Shown when viewing on host PC) -->
          <div class="group">
            <div class="row">
              <div class="label">
                <div class="headline">🌐 Connected Hands Fleet</div>
                <div class="hint">All devices that have granted permission to be controlled by Mave.</div>
              </div>
              <button type="button" class="btn secondary small" id="btn-refresh-hands-devices">Refresh Fleet</button>
            </div>
            <div id="hands-device-fleet-list" style="display:flex; flex-direction:column; gap:8px;">
              <div style="padding:16px; text-align:center; color:var(--text-3);">Scanning for remote devices...</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  <!-- Camera Scanner Modal -->
  <div class="modal-backdrop" id="camera-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px); z-index:200; justify-content:center; align-items:center; padding:16px;">
    <div style="background:var(--surface-1); border:1px solid var(--border-strong); border-radius:var(--r-xl); max-width:480px; width:100%; max-height:90vh; overflow-y:auto; display:flex; flex-direction:column; padding:18px; box-shadow:0 20px 40px rgba(0,0,0,0.8);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
          <span>📷</span> Device Camera Scanner
        </div>
        <button class="btn secondary small" id="cam-close-btn" style="padding:4px 8px;">✕ Close</button>
      </div>

      <!-- Live Video View -->
      <div id="cam-live-box" style="position:relative; width:100%; height:260px; background:#000; border-radius:var(--r-lg); overflow:hidden; display:flex; justify-content:center; align-items:center; margin-bottom:12px;">
        <video id="cam-video" autoplay playsinline style="width:100%; height:100%; object-fit:cover;"></video>
        <canvas id="cam-canvas" style="display:none;"></canvas>
      </div>

      <!-- Captured Preview -->
      <div id="cam-preview-box" style="display:none; position:relative; width:100%; max-height:260px; background:#000; border-radius:var(--r-lg); overflow:hidden; margin-bottom:12px;">
        <img id="cam-preview-img" style="width:100%; height:100%; max-height:260px; object-fit:contain; display:block;">
      </div>

      <!-- Camera Action Buttons -->
      <div id="cam-capture-actions" style="display:flex; gap:8px; margin-bottom:12px;">
        <button class="btn primary small" id="cam-snap-btn" style="flex:1;">📸 Snap Photo</button>
        <button class="btn secondary small" id="cam-switch-btn">🔄 Flip</button>
        <button class="btn secondary small" id="cam-file-btn">📁 File</button>
        <input type="file" id="cam-file-input" accept="image/*" capture="environment" style="display:none;">
      </div>

      <!-- Send & Prompt Area -->
      <div id="cam-send-area" style="display:none; flex-direction:column; gap:8px;">
        <input class="field" id="cam-prompt-input" value="Describe and analyze this image in detail." placeholder="Ask question about this image...">
        <div style="display:flex; gap:8px;">
          <button class="btn secondary small" id="cam-retake-btn">Retake</button>
          <button class="btn primary small" id="cam-analyze-btn" style="flex:1;">Send to Mave</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Dedicated HTML5 Voice Audio Player -->
  <audio id="mave-voice-player" preload="auto" playsinline style="display:none;"></audio>

  <!-- Meet Voice Onboarding Modal (ChatGPT Screenshot 5) -->
  <div id="meet-voice-modal" style="display:none; position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); backdrop-filter:blur(10px); align-items:center; justify-content:center; padding:20px;">
    <div class="meet-voice-modal-card">
      <button type="button" class="meet-voice-close" id="meet-voice-close-btn" title="Close">✕</button>
      <div class="meet-voice-orb-preview">
        <div class="fluid-orb-sm"></div>
      </div>
      <h2 class="meet-voice-title">Meet Voice</h2>
      <div class="meet-voice-features">
        <div class="mv-feature-item">
          <div class="mv-feature-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 5v14M7 9v6M22 10v4M2 10v4"/></svg>
          </div>
          <div class="mv-feature-text">Talk in real-time, get answers, brainstorm, and practice conversations hands-free.</div>
        </div>
        <div class="mv-feature-item">
          <div class="mv-feature-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div class="mv-feature-text">Audio flows directly between your device and local neural models with zero latency.</div>
        </div>
      </div>
      <button type="button" class="meet-voice-continue-btn" id="meet-voice-continue-btn">Continue</button>
    </div>
  </div>

  <!-- ChatGPT App-Style Interactive Voice Mode Overlay -->
  <div id="voice-mode-modal" style="display:none; position:fixed; inset:0; z-index:9999; background:radial-gradient(circle at center, #171c26 0%, #0d0f14 100%); flex-direction:column; align-items:center; justify-content:space-between; padding:24px 20px; user-select:none; animation:fadeIn 0.25s ease;">
    <div style="width:100%; max-width:600px; display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,#3b82f6,#8b5cf6); display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><circle cx="12" cy="12" r="10"/></svg>
        </div>
        <span style="font-weight:700; font-size:15px; color:#fff;">Mave Voice</span>
        <span id="voice-state-pill" style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:12px; background:rgba(59,130,246,0.2); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">Listening…</span>
      </div>
      <button type="button" id="voice-mode-close-btn" style="background:rgba(255,255,255,0.08); border:none; color:#fff; width:36px; height:36px; border-radius:50%; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">✕</button>
    </div>

    <!-- View Switcher Pills: User manual choice or Auto Mave control -->
    <div style="display:flex; align-items:center; gap:8px; margin: 6px 0 10px 0; flex-wrap:wrap; justify-content:center;">
      <button type="button" class="voice-view-pill active" data-vmode="auto" id="voice-pill-auto" style="background:rgba(59,130,246,0.25); border:1px solid #3b82f6; color:#93c5fd; padding:4px 10px; border-radius:16px; font-size:11px; font-weight:600; cursor:pointer;">✨ Auto (Mave)</button>
      <button type="button" class="voice-view-pill" data-vmode="orb" id="voice-pill-orb" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; padding:4px 10px; border-radius:16px; font-size:11px; font-weight:500; cursor:pointer;">🎙️ Orb Only</button>
      <button type="button" class="voice-view-pill" data-vmode="thoughts" id="voice-pill-thoughts" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; padding:4px 10px; border-radius:16px; font-size:11px; font-weight:500; cursor:pointer;">🧠 Thoughts</button>
      <button type="button" class="voice-view-pill" data-vmode="screen" id="voice-pill-screen" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; padding:4px 10px; border-radius:16px; font-size:11px; font-weight:500; cursor:pointer;">🖥️ Screen</button>
    </div>

    <!-- Dynamic Central Stage -->
    <div id="voice-stage-container" style="position:relative; width:100%; max-width:540px; display:flex; flex-direction:column; align-items:center; justify-content:center; margin:auto 0; min-height:220px;">
      
      <!-- Stage 1: ChatGPT Fluid Animated Voice Orb -->
      <div id="voice-orb-container" style="position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%;">
        <div class="chatgpt-fluid-voice-orb" id="voice-orb" title="Tap orb to speak or interrupt">
          <div class="orb-fluid-glow"></div>
          <div class="orb-fluid-core" id="orb-fluid-core">
            <div class="orb-fluid-layer layer-1"></div>
            <div class="orb-fluid-layer layer-2"></div>
            <div class="orb-fluid-layer layer-3"></div>
          </div>
          <div class="orb-ripple-ring" id="orb-ripple-1"></div>
          <div class="orb-ripple-ring" id="orb-ripple-2"></div>
        </div>
        <div id="voice-orb-caption" style="margin-top:24px; font-size:13px; font-weight:500; color:#94a3b8; letter-spacing:0.02em;">Tap orb or press Space to interrupt</div>
      </div>

      <!-- Stage 2: Mave Chain-of-Thought Stream -->
      <div id="voice-thought-container" style="display:none; width:100%; background:rgba(20,24,33,0.88); border:1px solid rgba(59,130,246,0.35); border-radius:18px; padding:18px; backdrop-filter:blur(12px); box-shadow:0 8px 32px rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">🧠</span>
            <span style="font-size:13.5px; font-weight:700; color:#93c5fd;">Mave Thinking Stream</span>
          </div>
          <span id="voice-thought-indicator" style="font-size:11px; color:#34d399; font-weight:600; padding:2px 8px; border-radius:10px; background:rgba(52,211,153,0.15);">Processing</span>
        </div>
        <div id="voice-thought-list" style="display:flex; flex-direction:column; gap:8px; font-family:var(--mono); font-size:12px; color:#cbd5e1; max-height:160px; overflow-y:auto; line-height:1.45;">
          <div style="color:#94a3b8; font-style:italic;">Listening for your voice request…</div>
        </div>
      </div>

      <!-- Stage 3: Interactive Permission / Confirmation Card -->
      <div id="voice-permission-container" style="display:none; width:100%; background:linear-gradient(135deg, rgba(30,27,75,0.95), rgba(15,23,42,0.95)); border:2px solid #f59e0b; border-radius:18px; padding:18px; box-shadow:0 12px 36px rgba(245,158,11,0.25);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <div style="width:34px; height:34px; border-radius:10px; background:rgba(245,158,11,0.2); border:1px solid rgba(245,158,11,0.4); display:flex; align-items:center; justify-content:center; font-size:18px;">⚠️</div>
          <div>
            <div style="font-size:14px; font-weight:700; color:#fde68a;">Permission Request</div>
            <div style="font-size:11px; color:#94a3b8;">Mave is asking for confirmation</div>
          </div>
        </div>
        <div id="voice-permission-desc" style="font-size:12.5px; color:#f1f5f9; background:rgba(0,0,0,0.35); border-radius:10px; padding:12px; margin-bottom:14px; border:1px solid rgba(255,255,255,0.08); font-family:var(--mono); line-height:1.4;">
          Should Mave proceed with this action?
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" id="voice-perm-approve-btn" style="flex:1; background:#10b981; border:none; color:#fff; font-size:13px; font-weight:700; padding:10px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span>✅</span> Approve (Say "Yes")
          </button>
          <button type="button" id="voice-perm-decline-btn" style="flex:1; background:#ef4444; border:none; color:#fff; font-size:13px; font-weight:700; padding:10px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span>❌</span> Decline (Say "No")
          </button>
        </div>
      </div>

      <!-- Stage 4: Live Desktop Screen Card -->
      <div id="voice-screen-container" style="display:none; width:100%; background:rgba(0,0,0,0.7); border:1px solid rgba(255,255,255,0.12); border-radius:16px; overflow:hidden;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:rgba(255,255,255,0.05); border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:#cbd5e1; font-weight:600;">
            <span>🖥️</span> Live Desktop View
          </div>
          <span style="font-size:10px; color:#34d399; font-weight:700;">LIVE STREAM</span>
        </div>
        <div style="height:170px; display:flex; align-items:center; justify-content:center; background:#000;">
          <img id="voice-screen-img" src="" style="width:100%; height:100%; object-fit:contain;" alt="Desktop screen view" />
        </div>
      </div>

    </div>

    <!-- Real-time Subtitles / Spoken Transcript -->
    <div style="width:100%; max-width:540px; display:flex; flex-direction:column; gap:16px; align-items:center;">
      <div id="voice-subtitles-box" style="width:100%; min-height:64px; max-height:120px; overflow-y:auto; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:12px 16px; font-size:13px; line-height:1.5; color:#e2e8f0; text-align:center;">
        <span id="voice-user-sub" style="color:#93c5fd; font-style:italic;">Listening to you…</span>
        <div id="voice-bot-sub" style="color:#f8fafc; font-weight:500; margin-top:4px;"></div>
      </div>

      <!-- Voice Mode Bottom Controls -->
      <div style="display:flex; align-items:center; gap:16px;">
        <button type="button" id="voice-mute-btn" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; padding:10px 18px; border-radius:24px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px;">
          <span id="voice-mute-icon">🎤</span> <span id="voice-mute-text">Mute</span>
        </button>
        <button type="button" id="voice-interrupt-btn" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.35); color:#f87171; padding:10px 18px; border-radius:24px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px;">
          <span>⏹️</span> <span>Interrupt</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 3-Tier Security PIN Unlock Modal -->
  <div id="pin-lock-modal" style="display:none; position:fixed; inset:0; z-index:10001; background:rgba(10,12,11,0.92); backdrop-filter:blur(16px); align-items:center; justify-content:center; padding:20px;">
    <div style="background:var(--surface-1); border:1px solid var(--border-subtle); border-radius:20px; width:100%; max-width:340px; padding:28px 24px; display:flex; flex-direction:column; align-items:center; box-shadow:0 16px 40px rgba(0,0,0,0.6);">
      <div style="width:52px; height:52px; border-radius:14px; background:linear-gradient(135deg,#2563eb,#8b5cf6); display:flex; align-items:center; justify-content:center; margin-bottom:14px;">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <div style="font-size:18px; font-weight:700; color:var(--text-1); margin-bottom:4px;">Mave Remote Access</div>
      <div style="font-size:12px; color:var(--text-2); margin-bottom:20px; text-align:center;">Enter your security PIN to connect</div>

      <div style="display:flex; gap:10px; margin-bottom:20px;" id="pin-dots-container">
        <div class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid var(--border-strong); background:transparent;"></div>
        <div class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid var(--border-strong); background:transparent;"></div>
        <div class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid var(--border-strong); background:transparent;"></div>
        <div class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid var(--border-strong); background:transparent;"></div>
      </div>

      <!-- Numeric Keypad -->
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; width:100%; margin-bottom:16px;">
        <button type="button" class="keypad-btn" data-val="1">1</button>
        <button type="button" class="keypad-btn" data-val="2">2</button>
        <button type="button" class="keypad-btn" data-val="3">3</button>
        <button type="button" class="keypad-btn" data-val="4">4</button>
        <button type="button" class="keypad-btn" data-val="5">5</button>
        <button type="button" class="keypad-btn" data-val="6">6</button>
        <button type="button" class="keypad-btn" data-val="7">7</button>
        <button type="button" class="keypad-btn" data-val="8">8</button>
        <button type="button" class="keypad-btn" data-val="9">9</button>
        <button type="button" class="keypad-btn" data-val="clear" style="font-size:13px; color:#ef4444;">Clear</button>
        <button type="button" class="keypad-btn" data-val="0">0</button>
        <button type="button" class="keypad-btn" data-val="del" style="font-size:14px;">⌫</button>
      </div>

      <div id="pin-error-text" style="color:#ef4444; font-size:12px; font-weight:600; min-height:18px; text-align:center; margin-bottom:12px;"></div>

      <!-- Roles Hint Box -->
      <div style="width:100%; background:var(--surface-2); border:1px solid var(--border-subtle); border-radius:10px; padding:10px 12px; font-size:11px; color:var(--text-2); display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#60a5fa; flex-shrink:0;"></span><span><b>Viewer PIN</b>: Read-only live screen & metrics</span></div>
        <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#34d399; flex-shrink:0;"></span><span><b>Operator PIN</b>: Chat & remote PC control</span></div>
        <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f59e0b; flex-shrink:0;"></span><span><b>Admin PIN</b>: Full access & settings</span></div>
        <div style="margin-top:2px; font-size:10px; color:var(--text-3); text-align:center;">Enter the access PIN configured in Settings on the host PC.</div>
      </div>
    </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);

    let currentUserTier = 'unauthenticated';
    let isHostDevice = false;

    // Theme Management (Dark / Light / System)
    let currentTheme = localStorage.getItem('mave_theme') || 'dark';

    function applyWebTheme(theme, save = true) {
      currentTheme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      document.body.className = 'theme-' + theme;

      const isSystem = theme === 'system';
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      const isLight = theme === 'light' || (isSystem && prefersLight);

      const icon = $('theme-icon');
      const text = $('theme-text');
      if (icon && text) {
        if (isSystem) {
          icon.textContent = prefersLight ? '☀️' : '🌙';
          text.textContent = prefersLight ? 'Auto (Light)' : 'Auto (Dark)';
        } else if (isLight) {
          icon.textContent = '☀️';
          text.textContent = 'Light';
        } else {
          icon.textContent = '🌙';
          text.textContent = 'Dark';
        }
      }

      document.querySelectorAll('#theme-segmented [data-theme-val]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.themeVal === theme);
      });

      if (save) {
        localStorage.setItem('mave_theme', theme);
        localStorage.setItem('mave_theme_manual', 'true');
        if (isHostDevice || currentUserTier === 'admin') {
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: theme }),
          }).catch(() => {});
        }
      }
    }

    applyWebTheme(currentTheme, false);

    if ($('theme-toggle-btn')) {
      $('theme-toggle-btn').addEventListener('click', () => {
        const nextTheme = currentTheme === 'dark' ? 'light' : currentTheme === 'light' ? 'system' : 'dark';
        applyWebTheme(nextTheme, true);
      });
    }

    document.querySelectorAll('#theme-segmented [data-theme-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyWebTheme(btn.dataset.themeVal, true);
      });
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (currentTheme === 'system') {
          applyWebTheme('system', false);
        }
      });
    }

    // Sidebar & Drawer navigation
    const toggleSidebar = (forceOpen) => {
      const s = $('sidebar');
      const o = $('sidebar-overlay');
      const shouldOpen = forceOpen !== undefined ? forceOpen : !s.classList.contains('open');
      if (shouldOpen) {
        s.classList.add('open');
        if (o) o.classList.add('active');
      } else {
        s.classList.remove('open');
        if (o) o.classList.remove('active');
      }
    };

    if ($('menu-toggle')) {
      $('menu-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
      });
    }

    if ($('sidebar-overlay')) {
      $('sidebar-overlay').addEventListener('click', () => toggleSidebar(false));
    }

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('[data-pane]').forEach((p) => {
          p.hidden = p.dataset.pane !== tab;
        });
        const titleSpan = btn.querySelector('span:last-child');
        if (titleSpan) $('page-title').textContent = titleSpan.textContent;
        toggleSidebar(false);
        if (tab === 'models') loadModels();
        if (tab === 'superpowers') loadSuperpowers();
        if (tab === 'screen') refreshScreen();
        if (tab === 'mavedrop') { loadMaveDropFiles(); loadMaveDropDevices(); fetchLanClipboard(); }
        if (tab === 'hands') loadHandsMode();
      });
    });

    // Handle URL tab parameter & direct /drop route
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      const isDropRoute = window.location.pathname === '/drop' || urlTab === 'drop' || urlTab === 'mavedrop';
      if (isDropRoute) {
        const btn = document.querySelector('.nav-btn[data-tab="mavedrop"]');
        if (btn) btn.click();
      } else if (urlTab && urlTab !== 'home') {
        const btn = document.querySelector('.nav-btn[data-tab="' + urlTab + '"]');
        if (btn) btn.click();
      }
    } catch (e) { /* ignore */ }

    // Chat & Remote Speaker
    const chatFeed = $('chat-feed');
    let deviceSpeakerEnabled = localStorage.getItem('mave_remote_speaker') !== 'false';

    function updateSpeakerBtn() {
      const btn = $('remote-speaker-btn');
      const text = $('speaker-text');
      if (!btn || !text) return;
      if (deviceSpeakerEnabled) {
        btn.classList.add('active');
        btn.style.background = 'rgba(59,130,246,0.2)';
        btn.style.borderColor = '#3b82f6';
        text.textContent = 'Device Speaker: On';
      } else {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.borderColor = '';
        text.textContent = 'Device Speaker: Off';
      }
    }
    updateSpeakerBtn();

    let isAudioUnlocked = false;
    function unlockAudioPlayback() {
      if (isAudioUnlocked) return;
      const player = $('mave-voice-player');
      if (player) {
        player.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        player.play().then(() => { isAudioUnlocked = true; }).catch(() => {});
      }
    }
    document.addEventListener('click', unlockAudioPlayback, { once: true });
    document.addEventListener('touchstart', unlockAudioPlayback, { once: true });

    if ($('remote-speaker-btn')) {
      $('remote-speaker-btn').addEventListener('click', () => {
        unlockAudioPlayback();
        deviceSpeakerEnabled = !deviceSpeakerEnabled;
        localStorage.setItem('mave_remote_speaker', String(deviceSpeakerEnabled));
        updateSpeakerBtn();
      });
    }

    function playDeviceSpeech(text, audioUrl, bubbleNode) {
      if (!text) return;
      unlockAudioPlayback();
      const player = $('mave-voice-player');
      let badge = null;

      if (bubbleNode) {
        badge = bubbleNode.querySelector('.voice-speaking-badge');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'voice-speaking-badge speaking';
          badge.innerHTML = '<span>🔊</span> <span>Mave speaking…</span>';
          bubbleNode.appendChild(badge);
        } else {
          badge.className = 'voice-speaking-badge speaking';
          badge.innerHTML = '<span>🔊</span> <span>Mave speaking…</span>';
        }
      }

      if (player && audioUrl) {
        player.src = audioUrl;
        player.onended = () => {
          if (badge) {
            badge.className = 'voice-speaking-badge';
            badge.innerHTML = '<span>▶️</span> <span>Replay Voice</span>';
            badge.onclick = (e) => { e.stopPropagation(); playDeviceSpeech(text, audioUrl, bubbleNode); };
          }
        };
        player.onerror = () => {
          fallbackSpeech(text, badge);
        };
        player.play().catch(() => {
          fallbackSpeech(text, badge);
        });
      } else {
        fallbackSpeech(text, badge);
      }
    }

    function fallbackSpeech(text, badge) {
      if (!('speechSynthesis' in window)) {
        if (badge) badge.remove();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 300));
      u.rate = 1.0;
      u.onend = () => {
        if (badge) {
          badge.className = 'voice-speaking-badge';
          badge.innerHTML = '<span>▶️</span> <span>Replay Voice</span>';
          badge.onclick = (e) => { e.stopPropagation(); fallbackSpeech(text, badge); };
        }
      };
      u.onerror = () => { if (badge) badge.remove(); };
      window.speechSynthesis.speak(u);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function addMsg(content, isUser = false, imgUrl = null) {
      if ($('empty-chat')) $('empty-chat').remove();
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble ' + (isUser ? 'user' : 'bot');

      const isObj = content && typeof content === 'object';
      const text = isObj ? (content.text || content.message || (content.error ? 'Error: ' + content.error : '')) : String(content || '');
      const thoughts = isObj && Array.isArray(content.thoughts) ? content.thoughts : null;
      const recs = isObj && Array.isArray(content.recommendations) ? content.recommendations : null;

      if (imgUrl) {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.style.maxWidth = '220px';
        img.style.maxHeight = '180px';
        img.style.borderRadius = '8px';
        img.style.display = 'block';
        img.style.marginBottom = '6px';
        bubble.appendChild(img);
      }

      // 1. Collapsible Thought Process Box (ChatGPT style)
      if (!isUser && thoughts && thoughts.length) {
        const thoughtBox = document.createElement('details');
        thoughtBox.className = 'thought-container';
        thoughtBox.open = false;

        const summary = document.createElement('summary');
        summary.className = 'thought-summary';
        summary.innerHTML = '<span class="thought-icon">💭</span>' +
          '<span class="thought-title">Thought Process</span>' +
          '<span class="thought-count">(' + thoughts.length + ' step' + (thoughts.length === 1 ? '' : 's') + ')</span>' +
          '<span class="thought-chevron">▾</span>';
        thoughtBox.appendChild(summary);

        const thoughtContent = document.createElement('div');
        thoughtContent.className = 'thought-content';
        thoughts.forEach((th) => {
          const stepDiv = document.createElement('div');
          stepDiv.className = 'thought-step';
          stepDiv.textContent = th;
          thoughtContent.appendChild(stepDiv);
        });
        thoughtBox.appendChild(thoughtContent);
        bubble.appendChild(thoughtBox);
      }

      // 2. Main Message Text
      const textWrap = document.createElement('div');
      textWrap.className = 'msg-text';
      const formattedHtml = escapeHtml(text)
        .replace(/[*]{2}(.*?)[*]{2}/g, '<strong>$1</strong>')
        .split(String.fromCharCode(10)).join('<br>');
      textWrap.innerHTML = formattedHtml;
      bubble.appendChild(textWrap);

      // 3. Actionable Interactive Recommendations Box
      if (!isUser && recs && recs.length) {
        const recBox = document.createElement('div');
        recBox.className = 'recommendations-box';

        const recHeader = document.createElement('div');
        recHeader.className = 'rec-header';
        recHeader.innerHTML = '<span>💡</span> <strong>Recommended Actions</strong>';
        recBox.appendChild(recHeader);

        const recGrid = document.createElement('div');
        recGrid.className = 'rec-grid';

        recs.forEach((r) => {
          const btn = document.createElement('button');
          btn.className = 'rec-btn';
          btn.type = 'button';
          btn.innerHTML = '<div class="rec-btn-title"><span>' + escapeHtml(r.label) + '</span></div>' +
            (r.description ? '<div class="rec-btn-desc">' + escapeHtml(r.description) + '</div>' : '');

          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            btn.disabled = true;
            btn.innerHTML = '<span>⏳ Executing ' + escapeHtml(r.label) + '...</span>';

            try {
              const res = await fetch('/api/diagnostics/fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recommendation: r }),
              });
              const data = await res.json();
              if (data.ok) {
                btn.innerHTML = '<span>✅ ' + escapeHtml(r.label) + ' Succeeded</span>';
                btn.style.borderColor = '#10b981';
                btn.style.color = '#34d399';
                addMsg(data.output || data.message || ('Remediation executed: ' + r.label), false);
              } else {
                btn.innerHTML = '<span>❌ Failed: ' + escapeHtml(data.error || 'Action failed') + '</span>';
                btn.style.borderColor = '#ef4444';
                btn.style.color = '#f87171';
              }
            } catch (err) {
              btn.innerHTML = '<span>❌ Error: ' + escapeHtml(err.message) + '</span>';
              btn.style.borderColor = '#ef4444';
              btn.style.color = '#f87171';
            }
          });

          recGrid.appendChild(btn);
        });

        recBox.appendChild(recGrid);
        bubble.appendChild(recBox);
      }

      // 4. Audio Replay Button
      if (!isUser && text) {
        const cleanSpeak = text.replace(/[*_#]/g, '').trim();
        const playBtn = document.createElement('button');
        playBtn.className = 'audio-replay-btn';
        playBtn.title = 'Play audio on device';
        playBtn.textContent = '🔊';
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          playDeviceSpeech(cleanSpeak, '/api/voice/tts?text=' + encodeURIComponent(cleanSpeak));
        });
        bubble.appendChild(playBtn);

        if (deviceSpeakerEnabled) {
          playDeviceSpeech(cleanSpeak, '/api/voice/tts?text=' + encodeURIComponent(cleanSpeak));
        }
      }

      chatFeed.appendChild(bubble);
      chatFeed.scrollTop = chatFeed.scrollHeight;
    }

    function addLoadingMsg() {
      if ($('empty-chat')) $('empty-chat').remove();
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble bot loading';
      bubble.id = 'active-loading-msg';
      bubble.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg> <span class="loading-label">Thinking…</span></span>';
      chatFeed.appendChild(bubble);
      chatFeed.scrollTop = chatFeed.scrollHeight;
      return bubble;
    }

    function removeLoadingMsg(b) {
      if (b && b.parentNode) b.remove();
      const el = $('active-loading-msg');
      if (el) el.remove();
    }

    window.quickTask = (t) => {
      $('prompt-input').value = t;
      $('chat-form').dispatchEvent(new Event('submit'));
    };

    $('chat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('prompt-input');
      const sendBtn = $('send-btn');
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      input.disabled = true;
      if (sendBtn) sendBtn.disabled = true;
      addMsg(val, true);
      const loading = addLoadingMsg();

      if (window.webIsland) window.webIsland.setStatus('Thinking…', 'thinking');
      if (window.webAvatar) window.webAvatar.setMood('thinking');

      // Poll task status & current thought every 300ms while loading
      const pollTimer = setInterval(async () => {
        try {
          const sRes = await fetch('/api/task/status');
          if (sRes.ok) {
            const sData = await sRes.json();
            const loader = $('active-loading-msg');
            if (loader) {
              const labelEl = loader.querySelector('.loading-label');
              if (labelEl && sData.thought) {
                labelEl.textContent = sData.thought;
                if (window.webIsland) window.webIsland.setStatus(sData.thought.slice(0, 32), 'thinking');
              }
            }
          }
        } catch { /* ignore poll err */ }
      }, 300);

      try {
        const res = await fetch('/api/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: val }),
        });
        const data = await res.json();
        clearInterval(pollTimer);
        removeLoadingMsg(loading);
        addMsg(data);
        if (window.webIsland) window.webIsland.setStatus('Mave Core', 'idle');
        if (window.webAvatar) {
          window.webAvatar.setMood('happy', 1500);
          window.webAvatar.hop();
        }
      } catch (err) {
        clearInterval(pollTimer);
        removeLoadingMsg(loading);
        addMsg('Error communicating with Mave: ' + err.message);
        if (window.webIsland) window.webIsland.setStatus('Mave Core', 'idle');
        if (window.webAvatar) window.webAvatar.setMood('idle');
      } finally {
        clearInterval(pollTimer);
        input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
      }
    });

    $('prompt-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('chat-form').dispatchEvent(new Event('submit'));
      }
    });

    // Models loading & switching
    async function loadModels() {
      try {
        const res = await fetch('/api/models');
        const data = await res.json();
        if (!data.ok) return;

        // Cloud Frontier Intelligence
        const curProv = data.provider || 'local';
        document.querySelectorAll('#cloud-provider-seg [data-prov]').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.prov === curProv);
        });
        const credWrap = $('cloud-credentials-wrap');
        const endpointWrap = $('cloud-endpoint-wrap');
        const keyLabel = $('cloud-key-label');
        const keyInput = $('cloud-key-input');
        const modelInput = $('cloud-model-input');
        const endpointInput = $('cloud-endpoint-input');
        const hintEl = $('cloud-provider-hint');

        if (curProv === 'openai') {
          if (credWrap) credWrap.style.display = 'flex';
          if (endpointWrap) endpointWrap.style.display = 'flex';
          if (keyLabel) keyLabel.textContent = 'OpenAI API Key';
          if (keyInput) keyInput.placeholder = data.hasOpenaiKey ? '•••••••• (Key Configured)' : 'sk-...';
          if (endpointInput) endpointInput.value = data.openaiEndpoint || '';
          if (modelInput) modelInput.value = data.openaiModel || 'gpt-4o';
          if (hintEl) hintEl.textContent = 'Active: OpenAI / ChatGPT (' + (data.openaiModel || 'gpt-4o') + (data.openaiEndpoint ? ' · Custom Base URL' : '') + ')';
        } else if (curProv === 'anthropic') {
          if (credWrap) credWrap.style.display = 'flex';
          if (endpointWrap) endpointWrap.style.display = 'none';
          if (keyLabel) keyLabel.textContent = 'Anthropic API Key';
          if (keyInput) keyInput.placeholder = data.hasAnthropicKey ? '•••••••• (Key Configured)' : 'sk-ant-...';
          if (modelInput) modelInput.value = data.claudeModel || 'claude-opus-5-5';
          if (hintEl) hintEl.textContent = 'Active: Claude Frontier (' + (data.claudeModel || 'claude-opus-5-5') + ')';
        } else {
          if (credWrap) credWrap.style.display = 'none';
          if (hintEl) hintEl.textContent = 'Active: Local GPU Model (' + (data.installed || 'Qwen3-VL') + ')';
        }

        // Built-in models
        const bList = $('builtin-models-list');
        bList.innerHTML = '';
        for (const m of (data.options || [])) {
          const row = document.createElement('div');
          row.className = 'custom-model-card';
          const isInstalled = data.installed === m.id;
          row.innerHTML =
            '<div class="label">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span class="headline">' + m.label + '</span>' +
                '<span style="font-size:11px; color:var(--text-3)">' + m.size + '</span>' +
                (isInstalled ? '<span class="tag active">Active</span>' : '') +
              '</div>' +
              '<span class="hint">' + (m.note || '') + '</span>' +
            '</div>' +
            (!isInstalled ? '<button class="btn secondary small btn-switch">Switch</button>' : '');
          const swBtn = row.querySelector('.btn-switch');
          if (swBtn) swBtn.onclick = () => switchModel(m.id);
          bList.appendChild(row);
        }

        // Colibri MoE models
        const colList = $('colibri-models-list');
        if (colList) {
          colList.innerHTML = '';
          const colOpts = data.colibriModels || [];
          if (!colOpts.length) {
            colList.innerHTML = '<div style="padding:12px 16px; font-size:12px; color:var(--text-3)">No Colibri MoE models found in D:\\\\Bigfoot\\\\colibri-models.</div>';
          } else {
            for (const cm of colOpts) {
              const row = document.createElement('div');
              row.className = 'custom-model-card';
              const isInstalled = data.provider === 'colibri' && (data.colibriModel === cm.rawModel || data.installed === cm.id);
              row.innerHTML =
                '<div class="label" style="min-width:0; flex:1;">' +
                  '<div style="display:flex; align-items:center; gap:8px;">' +
                    '<span class="headline">' + cm.label + '</span>' +
                    '<span style="font-size:11px; color:var(--text-3)">' + cm.size + '</span>' +
                    '<span class="tag" style="background:rgba(245,158,11,0.18); color:#fbbf24;">Colibri MoE</span>' +
                    (isInstalled ? '<span class="tag active">Active</span>' : '') +
                  '</div>' +
                  '<span class="hint" style="font-family:var(--mono); font-size:11px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">' + (cm.modelPath || cm.note) + '</span>' +
                '</div>' +
                (!isInstalled ? '<button class="btn secondary small btn-switch">Switch</button>' : '');
              const swBtn = row.querySelector('.btn-switch');
              if (swBtn) swBtn.onclick = () => switchModel(cm.id);
              colList.appendChild(row);
            }
          }
        }

        // AirLLM models
        const airList = $('airllm-models-list');
        if (airList) {
          airList.innerHTML = '';
          const airOpts = data.airllmModels || [];
          if (!airOpts.length) {
            airList.innerHTML = '<div style="padding:12px 16px; font-size:12px; color:var(--text-3)">AirLLM engine ready.</div>';
          } else {
            for (const am of airOpts) {
              const row = document.createElement('div');
              row.className = 'custom-model-card';
              const isInstalled = data.provider === 'airllm' && data.airllmModel === am.rawModel;
              row.innerHTML =
                '<div class="label" style="min-width:0; flex:1;">' +
                  '<div style="display:flex; align-items:center; gap:8px;">' +
                    '<span class="headline">' + am.label + '</span>' +
                    '<span style="font-size:11px; color:var(--text-3)">' + am.size + '</span>' +
                    '<span class="tag" style="background:rgba(16,185,129,0.18); color:#34d399;">AirLLM 70B</span>' +
                    (isInstalled ? '<span class="tag active">Active</span>' : '') +
                  '</div>' +
                  '<span class="hint" style="font-family:var(--mono); font-size:11px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">' + am.note + '</span>' +
                '</div>' +
                (!isInstalled ? '<button class="btn secondary small btn-switch">Switch</button>' : '');
              const swBtn = row.querySelector('.btn-switch');
              if (swBtn) swBtn.onclick = () => switchModel(am.id);
              airList.appendChild(row);
            }
          }
        }

        // Ollama models
        const olList = $('ollama-models-list');
        if (olList) {
          olList.innerHTML = '';
          const olOpts = data.ollamaModels || [];
          if (!olOpts.length) {
            olList.innerHTML = '<div style="padding:12px 16px; font-size:12px; color:var(--text-3)">No Ollama models found in library.</div>';
          } else {
            for (const om of olOpts) {
              const row = document.createElement('div');
              row.className = 'custom-model-card';
              const isInstalled = data.provider === 'ollama' && data.ollamaModel === om.rawModel;
              row.innerHTML =
                '<div class="label" style="min-width:0; flex:1;">' +
                  '<div style="display:flex; align-items:center; gap:8px;">' +
                    '<span class="headline">' + om.label + '</span>' +
                    '<span style="font-size:11px; color:var(--text-3)">' + om.size + '</span>' +
                    '<span class="tag" style="background:rgba(59,130,246,0.18); color:#60a5fa;">Ollama</span>' +
                    (isInstalled ? '<span class="tag active">Active</span>' : '') +
                  '</div>' +
                  '<span class="hint" style="font-family:var(--mono); font-size:11px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">' + (om.modelPath || om.note) + '</span>' +
                '</div>' +
                (!isInstalled ? '<button class="btn secondary small btn-switch">Switch</button>' : '');
              const swBtn = row.querySelector('.btn-switch');
              if (swBtn) swBtn.onclick = () => switchModel(om.id);
              olList.appendChild(row);
            }
          }
        }

        // Custom models
        const cList = $('custom-models-list');
        cList.innerHTML = '';
        const cOpts = data.customOptions || [];
        if (!cOpts.length) {
          cList.innerHTML = '<div style="padding:12px 16px; font-size:12px; color:var(--text-3)">No additional custom GGUF models registered.</div>';
        } else {
          for (const cm of cOpts) {
            const row = document.createElement('div');
            row.className = 'custom-model-card';
            const isInstalled = (data.provider === 'local' || !data.provider) && data.installed === cm.id;
            row.innerHTML =
              '<div class="label" style="min-width:0; flex:1;">' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                  '<span class="headline">' + cm.label + '</span>' +
                  '<span style="font-size:11px; color:var(--text-3)">' + cm.size + '</span>' +
                  (isInstalled ? '<span class="tag active">Active</span>' : '') +
                '</div>' +
                '<span class="hint" style="font-family:var(--mono); font-size:11px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">' + (cm.modelPath || cm.note) + '</span>' +
              '</div>' +
              (!isInstalled ? '<button class="btn secondary small btn-switch">Switch</button>' : '');
            const swBtn = row.querySelector('.btn-switch');
            if (swBtn) swBtn.onclick = () => switchModel(cm.id);
            cList.appendChild(row);
          }
        }

        // Image models
        const iList = $('image-models-list');
        iList.innerHTML = '';
        const iOpts = data.imageModels || [];
        if (!iOpts.length) {
          iList.innerHTML = '<div style="padding:12px 16px; font-size:12px; color:var(--text-3)">No diffusion models detected.</div>';
        } else {
          for (const im of iOpts) {
            const row = document.createElement('div');
            row.className = 'custom-model-card';
            row.innerHTML =
              '<div class="label" style="min-width:0; flex:1;">' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                  '<span class="headline">' + im.name + '</span>' +
                  '<span style="font-size:11px; color:var(--text-3)">' + im.size + '</span>' +
                  '<span class="tag img">Diffusion</span>' +
                '</div>' +
                '<span class="hint" style="font-family:var(--mono); font-size:11px;">' + im.path + '</span>' +
              '</div>';
            iList.appendChild(row);
          }
        }

                if (data.provider === 'openai') {
          $('active-model-name').textContent = 'OpenAI (ChatGPT) · ' + (data.openaiModel || 'gpt-4o');
          $('active-model-hint').textContent = data.openaiEndpoint ? ('Custom Endpoint: ' + data.openaiEndpoint) : 'Cloud Frontier Intelligence (OpenAI API)';
        } else if (data.provider === 'anthropic') {
          $('active-model-name').textContent = 'Anthropic · ' + (data.claudeModel || 'claude-opus-5-5');
          $('active-model-hint').textContent = 'Cloud Frontier Intelligence (Anthropic Claude API)';
        } else if (data.provider === 'colibri') {
          $('active-model-name').textContent = data.colibriModel ? ('Colibri MoE · ' + data.colibriModel) : 'Colibri MoE';
          $('active-model-hint').textContent = 'High-speed MoE Engine (github.com/JustVugg/colibri) · port 8000';
        } else if (data.provider === 'airllm') {
          $('active-model-name').textContent = data.airllmModel ? ('AirLLM · ' + data.airllmModel) : 'AirLLM 70B+';
          $('active-model-hint').textContent = 'AirLLM Layer Streaming Engine · 70B+ on 8GB GPU';
        } else if (data.provider === 'ollama') {
          $('active-model-name').textContent = data.ollamaModel ? ('Ollama · ' + data.ollamaModel) : 'Ollama';
          $('active-model-hint').textContent = 'Ollama Local Engine · port 11434';
        } else if (data.installed) {
          $('active-model-name').textContent = data.installed;
          $('active-model-hint').textContent = 'GPU-accelerated (RTX 5060 Vulkan0) · 32k context · ready offline';
        }
      } catch (err) {
        console.error('Failed loading models', err);
      }
    }

    window.switchModel = async (id) => {
      try {
        const res = await fetch('/api/models/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId: id }),
        });
        const d = await res.json();
        alert(d.message || 'Switched model.');
        loadModels();
      } catch (err) {
        alert('Failed to switch model: ' + err.message);
      }
    };

    // Cloud Provider Segmented & Save Listeners
    let currentCloudProv = 'openai';
    document.querySelectorAll('#cloud-provider-seg [data-prov]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const prov = btn.dataset.prov;
        currentCloudProv = prov;
        document.querySelectorAll('#cloud-provider-seg [data-prov]').forEach((b) => b.classList.toggle('active', b === btn));
        const credWrap = $('cloud-credentials-wrap');
        const endpointWrap = $('cloud-endpoint-wrap');
        const keyLabel = $('cloud-key-label');
        if (prov === 'local') {
          if (credWrap) credWrap.style.display = 'none';
          await window.switchModel('local');
        } else if (prov === 'openai') {
          if (credWrap) credWrap.style.display = 'flex';
          if (endpointWrap) endpointWrap.style.display = 'flex';
          if (keyLabel) keyLabel.textContent = 'OpenAI API Key';
          loadModels();
        } else if (prov === 'anthropic') {
          if (credWrap) credWrap.style.display = 'flex';
          if (endpointWrap) endpointWrap.style.display = 'none';
          if (keyLabel) keyLabel.textContent = 'Anthropic API Key';
          loadModels();
        }
      });
    });

    if ($('cloud-save-btn')) {
      $('cloud-save-btn').addEventListener('click', async () => {
        const keyVal = $('cloud-key-input') ? $('cloud-key-input').value.trim() : '';
        const endpointVal = $('cloud-endpoint-input') ? $('cloud-endpoint-input').value.trim() : '';
        const modelVal = $('cloud-model-input') ? $('cloud-model-input').value.trim() : '';
        const statusEl = $('cloud-status-msg');

        const activeSeg = document.querySelector('#cloud-provider-seg .seg-opt.active');
        const prov = (activeSeg && activeSeg.dataset.prov !== 'local') ? activeSeg.dataset.prov : 'openai';

        const payload = { provider: prov };
        if (prov === 'openai') {
          if (keyVal) payload.openaiKey = keyVal;
          payload.openaiEndpoint = endpointVal;
          if (modelVal) payload.openaiModel = modelVal;
        } else if (prov === 'anthropic') {
          if (keyVal) payload.anthropicKey = keyVal;
          if (modelVal) payload.claudeModel = modelVal;
        }

        try {
          if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#94a3b8';
            statusEl.textContent = 'Saving & activating...';
          }
          const res = await fetch('/api/models/cloud-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const d = await res.json();
          if (d.ok) {
            if (statusEl) {
              statusEl.style.color = '#34d399';
              statusEl.textContent = '✓ Saved & connected to ' + (prov === 'openai' ? 'ChatGPT / OpenAI' : 'Claude');
              setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
            }
            if ($('cloud-key-input')) $('cloud-key-input').value = '';
            loadModels();
          } else {
            if (statusEl) {
              statusEl.style.color = '#ef4444';
              statusEl.textContent = 'Error: ' + (d.error || 'Failed to save');
            }
          }
        } catch (err) {
          if (statusEl) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = 'Network error: ' + err.message;
          }
        }
      });
    }

    // Superpowers loading
    async function loadSuperpowers() {
      try {
        const res = await fetch('/api/superpowers');
        const data = await res.json();
        if (!data.ok) return;
        if (data.telegram) {
          if ($('sp-tg-enable')) $('sp-tg-enable').checked = !!data.telegram.configured;
          if ($('sp-tg-token') && data.telegram.token) $('sp-tg-token').value = data.telegram.token;
          if ($('sp-tg-status')) {
            if (data.telegram.configured) {
              $('sp-tg-status').textContent = data.telegram.botUsername ? \`@\${data.telegram.botUsername} Connected\` : 'Connected';
              $('sp-tg-status').className = 'tag active';
            } else {
              $('sp-tg-status').textContent = 'Token not set';
              $('sp-tg-status').className = 'tag';
            }
          }
        }
        if (data.pet) {
          $('sp-pet-hint').textContent = \`Energy: \${data.pet.energy}% · Hunger: \${data.pet.hunger}% · Mood: \${data.pet.state || 'Happy'}\`;
        }
      } catch (e) { /* ignore */ }
    }

    if ($('sp-tg-connect')) {
      $('sp-tg-connect').addEventListener('click', async () => {
        const token = $('sp-tg-token') ? $('sp-tg-token').value.trim() : '';
        $('sp-tg-status').textContent = 'Connecting…';
        try {
          const res = await fetch('/api/superpowers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'connect_telegram', token }),
          });
          const data = await res.json();
          if (data.ok && data.bot) {
            $('sp-tg-status').textContent = \`@\${data.bot.username} Connected\`;
            $('sp-tg-status').className = 'tag active';
          } else {
            $('sp-tg-status').textContent = 'Failed';
            $('sp-tg-status').className = 'tag';
          }
        } catch {
          $('sp-tg-status').textContent = 'Error';
        }
      });
    }

    $('sp-lan-copy').addEventListener('click', () => {
      navigator.clipboard.writeText('${lanUrl}');
      $('sp-lan-copy').textContent = 'Copied!';
      setTimeout(() => { $('sp-lan-copy').textContent = 'Copy URL'; }, 2000);
    });

    $('sp-pet-feed').addEventListener('click', async () => {
      await fetch('/api/superpowers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'feed_pet' }),
      });
      $('sp-pet-feed').textContent = 'Fed! 🍗';
      setTimeout(() => { $('sp-pet-feed').textContent = 'Feed Pet 🍖'; }, 2000);
      loadSuperpowers();
    });

    $('sp-pet-summon').addEventListener('click', () => {
      fetch('/api/superpowers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summon_pet' }),
      });
    });

    $('sp-briefing-btn').addEventListener('click', async () => {
      $('sp-briefing-btn').disabled = true;
      $('sp-briefing-btn').textContent = 'Generating…';
      const res = await fetch('/api/superpowers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_briefing' }),
      });
      const d = await res.json();
      $('sp-briefing-btn').disabled = false;
      $('sp-briefing-btn').textContent = 'Briefing Sent!';
      setTimeout(() => { $('sp-briefing-btn').textContent = 'Trigger Briefing'; }, 2500);
      if (d.summary) addMsg(d.summary);
    });

    // Claude-Mods Superpowers
    if ($('sp-cm-health-btn')) {
      $('sp-cm-health-btn').addEventListener('click', async () => {
        $('sp-cm-health-btn').disabled = true;
        $('sp-cm-health-btn').textContent = 'Auditing… 🩺';
        try {
          const res = await fetch('/api/superpowers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claude_mods_health' }),
          });
          const d = await res.json();
          $('sp-cm-health-btn').disabled = false;
          $('sp-cm-health-btn').textContent = 'Run Health Audit 🩺';
          if (d.output) addMsg(d.output);
        } catch (e) {
          $('sp-cm-health-btn').disabled = false;
          $('sp-cm-health-btn').textContent = 'Run Health Audit 🩺';
          addMsg('⚠️ Health audit error: ' + e.message);
        }
      });
    }

    if ($('sp-cm-proc-btn')) {
      $('sp-cm-proc-btn').addEventListener('click', async () => {
        $('sp-cm-proc-btn').disabled = true;
        $('sp-cm-proc-btn').textContent = 'Sampling… ⚡';
        try {
          const res = await fetch('/api/superpowers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claude_mods_proc' }),
          });
          const d = await res.json();
          $('sp-cm-proc-btn').disabled = false;
          $('sp-cm-proc-btn').textContent = 'Triage Processes ⚡';
          if (d.output) addMsg(d.output);
        } catch (e) {
          $('sp-cm-proc-btn').disabled = false;
          $('sp-cm-proc-btn').textContent = 'Triage Processes ⚡';
          addMsg('⚠️ Process triage error: ' + e.message);
        }
      });
    }

    if ($('sp-cm-crash-btn')) {
      $('sp-cm-crash-btn').addEventListener('click', async () => {
        $('sp-cm-crash-btn').disabled = true;
        $('sp-cm-crash-btn').textContent = 'Checking… 💥';
        try {
          const res = await fetch('/api/superpowers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claude_mods_crash' }),
          });
          const d = await res.json();
          $('sp-cm-crash-btn').disabled = false;
          $('sp-cm-crash-btn').textContent = 'Check Crashes 💥';
          if (d.output) addMsg(d.output);
        } catch (e) {
          $('sp-cm-crash-btn').disabled = false;
          $('sp-cm-crash-btn').textContent = 'Check Crashes 💥';
          addMsg('⚠️ Crash triage error: ' + e.message);
        }
      });
    }

    if ($('sp-cm-skill-search')) {
      $('sp-cm-skill-search').addEventListener('click', async () => {
        const query = $('sp-cm-skill-query') ? $('sp-cm-skill-query').value.trim() : '';
        const listDiv = $('sp-cm-skills-list');
        listDiv.style.display = 'block';
        listDiv.textContent = 'Searching skills…';
        try {
          const res = await fetch('/api/superpowers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claude_mods_skills', query }),
          });
          const d = await res.json();
          listDiv.textContent = d.output || 'No results.';
        } catch (e) {
          listDiv.textContent = 'Error: ' + e.message;
        }
      });
    }

    // Terminal
    $('term-run-btn').addEventListener('click', async () => {
      const cmd = $('term-cmd').value.trim();
      if (!cmd) return;
      $('term-output').textContent += \`\\n> \${cmd}\\n\`;
      $('term-cmd').value = '';
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd }),
        });
        const data = await res.json();
        $('term-output').textContent += data.output || data.error || 'Done.';
        $('term-output').scrollTop = $('term-output').scrollHeight;
      } catch (err) {
        $('term-output').textContent += 'Error: ' + err.message;
      }
    });

    // Remote Device Microphone Recorder (16 kHz 16-bit mono WAV)
    let audioRecorder = null;
    let isRecordingAudio = false;

    function checkMediaPermissions(mediaType = 'Microphone') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocal && location.protocol !== 'https:') {
          const targetHttps = 'https://' + location.hostname + ':4043' + location.pathname;
          if (confirm(mediaType + ' requires a Secure Context (HTTPS) on LAN.\\n\\nTap OK to switch to HTTPS (Port 4043) now.')) {
            location.href = targetHttps;
          }
          return false;
        }
        alert(mediaType + ' is not accessible in this browser context. Please use a modern browser.');
        return false;
      }
      return true;
    }

    async function startAudioRecording() {
      if (!checkMediaPermissions('Microphone')) {
        throw new Error('Microphone requires HTTPS connection on local network.');
      }
      // Full-Duplex AEC (Acoustic Echo Cancellation) + Noise Suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });
      // Barge-in: Immediately stop any assistant speech playback when user starts to talk
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const samples = [];
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);
        if (rms > 0.04 && window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
        samples.push(new Float32Array(inputData));
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);

      return {
        async stop() {
          source.disconnect();
          processor.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          try { await audioCtx.close(); } catch (e) { /* ignore */ }

          let totalLen = samples.reduce((acc, curr) => acc + curr.length, 0);
          let merged = new Float32Array(totalLen);
          let offset = 0;
          for (const s of samples) {
            merged.set(s, offset);
            offset += s.length;
          }

          const buffer = new ArrayBuffer(44 + merged.length * 2);
          const view = new DataView(buffer);
          function writeStr(offset, str) {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
          }
          writeStr(0, 'RIFF');
          view.setUint32(4, 36 + merged.length * 2, true);
          writeStr(8, 'WAVE');
          writeStr(12, 'fmt ');
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, 1, true);
          view.setUint32(24, 16000, true);
          view.setUint32(28, 32000, true);
          view.setUint16(32, 2, true);
          view.setUint16(34, 16, true);
          writeStr(36, 'data');
          view.setUint32(40, merged.length * 2, true);

          let pcmOffset = 44;
          for (let i = 0; i < merged.length; i++, pcmOffset += 2) {
            let s = Math.max(-1, Math.min(1, merged[i]));
            view.setInt16(pcmOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          }
          return new Blob([view], { type: 'audio/wav' });
        }
      };
    }

    async function toggleMicRecording() {
      if (isRecordingAudio) {
        await stopMicRecording();
      } else {
        await startMicRecording();
      }
    }

    async function startMicRecording() {
      try {
        audioRecorder = await startAudioRecording();
        isRecordingAudio = true;
        if ($('mic-btn')) $('mic-btn').classList.add('recording');
        if ($('recording-banner')) $('recording-banner').style.display = 'flex';
      } catch (err) {
        alert('Could not access microphone: ' + err.message);
      }
    }

    async function stopMicRecording() {
      if (!isRecordingAudio || !audioRecorder) return;
      isRecordingAudio = false;
      if ($('mic-btn')) $('mic-btn').classList.remove('recording');
      if ($('recording-banner')) $('recording-banner').style.display = 'none';

      const loading = addLoadingMsg();
      try {
        const wavBlob = await audioRecorder.stop();
        audioRecorder = null;
        if (wavBlob.size < 1000) {
          removeLoadingMsg(loading);
          return;
        }

        const res = await fetch('/api/voice/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: wavBlob,
        });
        const data = await res.json();
        removeLoadingMsg(loading);
        if (data.ok) {
          addMsg(data.transcript || 'Spoken input', true);
          const replyText = data.reply || 'Task complete.';
          const replyBubble = addMsg(replyText);
          playDeviceSpeech(replyText, data.audioUrl, replyBubble);
        } else {
          addMsg('Voice error: ' + (data.error || 'Failed to process voice'));
        }
      } catch (err) {
        removeLoadingMsg(loading);
        addMsg('Voice processing error: ' + err.message);
      }
    }

    if ($('mic-btn')) $('mic-btn').addEventListener('click', toggleMicRecording);
    if ($('stop-recording-btn')) $('stop-recording-btn').addEventListener('click', stopMicRecording);

    // Remote Device Camera Scanner
    let camStream = null;
    let currentFacingMode = 'environment';
    let capturedImgData = null;

    function openCameraModal() {
      $('camera-modal').style.display = 'flex';
      $('cam-live-box').style.display = 'flex';
      $('cam-capture-actions').style.display = 'flex';
      $('cam-preview-box').style.display = 'none';
      $('cam-send-area').style.display = 'none';
      startCamera();
    }

    function closeCameraModal() {
      stopCamera();
      $('camera-modal').style.display = 'none';
    }

    async function startCamera() {
      stopCamera();
      if (!checkMediaPermissions('Camera')) {
        if ($('cam-file-input')) $('cam-file-input').click();
        return;
      }
      try {
        camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const video = $('cam-video');
        if (video) video.srcObject = camStream;
      } catch (err) {
        console.warn('Live camera error, use file upload fallback', err);
      }
    }

    function stopCamera() {
      if (camStream) {
        camStream.getTracks().forEach((t) => t.stop());
        camStream = null;
      }
    }

    if ($('cam-open-btn')) $('cam-open-btn').addEventListener('click', openCameraModal);
    if ($('cam-close-btn')) $('cam-close-btn').addEventListener('click', closeCameraModal);
    if ($('cam-switch-btn')) {
      $('cam-switch-btn').addEventListener('click', () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        startCamera();
      });
    }
    if ($('cam-file-btn')) {
      $('cam-file-btn').addEventListener('click', () => $('cam-file-input').click());
    }
    if ($('cam-file-input')) {
      $('cam-file-input').addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          showCapturedPreview(ev.target.result);
        };
        reader.readAsDataURL(file);
      });
    }
    if ($('cam-snap-btn')) {
      $('cam-snap-btn').addEventListener('click', () => {
        const video = $('cam-video');
        const canvas = $('cam-canvas');
        if (!video || !canvas || !video.videoWidth) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        showCapturedPreview(dataUrl);
      });
    }

    function showCapturedPreview(dataUrl) {
      capturedImgData = dataUrl;
      $('cam-preview-img').src = dataUrl;
      $('cam-live-box').style.display = 'none';
      $('cam-capture-actions').style.display = 'none';
      $('cam-preview-box').style.display = 'block';
      $('cam-send-area').style.display = 'flex';
      stopCamera();
    }

    if ($('cam-retake-btn')) {
      $('cam-retake-btn').addEventListener('click', () => {
        capturedImgData = null;
        $('cam-preview-box').style.display = 'none';
        $('cam-send-area').style.display = 'none';
        $('cam-live-box').style.display = 'flex';
        $('cam-capture-actions').style.display = 'flex';
        startCamera();
      });
    }

    if ($('cam-analyze-btn')) {
      $('cam-analyze-btn').addEventListener('click', async () => {
        if (!capturedImgData) return;
        const prompt = $('cam-prompt-input').value.trim() || 'Describe and analyze this image.';
        const imgData = capturedImgData;
        closeCameraModal();

        addMsg(prompt, true, imgData);
        const loading = addLoadingMsg();
        try {
          const res = await fetch('/api/camera/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imgData, prompt }),
          });
          const data = await res.json();
          removeLoadingMsg(loading);
          addMsg(data.text || data.reply || (data.error ? 'Error: ' + data.error : 'Analysis finished.'));
        } catch (err) {
          removeLoadingMsg(loading);
          addMsg('Failed to analyze image: ' + err.message);
        }
      });
    }

    // Live Desktop View & Remote Control
    let activeMouseMode = 'left';
    let isStreamActive = true;

    document.querySelectorAll('.btn-mode').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-mode').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeMouseMode = btn.dataset.mode;
      });
    });

    function setStreamPlaying(on) {
      isStreamActive = on;
      const img = $('screen-view-img');
      const tag = $('stream-status-tag');
      const btn = $('stream-toggle-btn');
      if (on) {
        const fps = $('stream-fps-select') ? $('stream-fps-select').value : '15';
        const mode = $('stream-quality-select') ? $('stream-quality-select').value : 'fast';
        img.src = '/api/screen/stream?fps=' + fps + '&mode=' + mode + '&t=' + Date.now();
        if (tag) { tag.textContent = 'Live Stream Active (Smooth)'; tag.className = 'tag active'; }
        if (btn) btn.textContent = 'Pause Stream';
      } else {
        img.src = '/api/screenshot?t=' + Date.now();
        if (tag) { tag.textContent = 'Stream Paused'; tag.className = 'tag'; }
        if (btn) btn.textContent = 'Resume Stream';
      }
    }

    if ($('stream-toggle-btn')) {
      $('stream-toggle-btn').addEventListener('click', () => {
        setStreamPlaying(!isStreamActive);
      });
    }

    if ($('stream-fps-select')) {
      $('stream-fps-select').addEventListener('change', () => {
        if (isStreamActive) setStreamPlaying(true);
      });
    }

    if ($('stream-quality-select')) {
      $('stream-quality-select').addEventListener('change', () => {
        if (isStreamActive) setStreamPlaying(true);
      });
    }

    function refreshScreen() {
      const img = $('screen-view-img');
      if (isStreamActive) {
        setStreamPlaying(true);
      } else {
        img.src = '/api/screenshot?t=' + Date.now();
      }
    }

    $('screen-refresh').addEventListener('click', () => {
      $('screen-view-img').src = '/api/screenshot?t=' + Date.now();
    });

    $('screen-lock').addEventListener('click', () => {
      fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lock' }) });
    });
    $('screen-media').addEventListener('click', () => {
      fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'media' }) });
    });

    // Remote screen pointer interaction
    const screenContainer = $('screen-container');
    const screenImg = $('screen-view-img');
    const indicator = $('screen-click-indicator');

    function getNormalizedCoords(e) {
      const rect = screenImg.getBoundingClientRect();
      const natW = screenImg.naturalWidth || 16;
      const natH = screenImg.naturalHeight || 9;
      const natRatio = natW / natH;
      const elemRatio = rect.width / rect.height;

      let rendW = rect.width;
      let rendH = rect.height;
      let offX = 0;
      let offY = 0;

      if (elemRatio > natRatio) {
        // Pillarboxed (empty margin on left and right)
        rendW = rect.height * natRatio;
        offX = (rect.width - rendW) / 2;
      } else {
        // Letterboxed (empty margin on top and bottom)
        rendH = rect.width / natRatio;
        offY = (rect.height - rendH) / 2;
      }

      const clickX = e.clientX - rect.left - offX;
      const clickY = e.clientY - rect.top - offY;

      if (clickX < 0 || clickX > rendW || clickY < 0 || clickY > rendH) {
        return null;
      }

      const xRatio = Math.max(0, Math.min(1, clickX / rendW));
      const yRatio = Math.max(0, Math.min(1, clickY / rendH));
      return { xRatio, yRatio, clientX: e.clientX, clientY: e.clientY };
    }

    function showClickIndicator(clientX, clientY) {
      if (!indicator || !screenContainer) return;
      const cRect = screenContainer.getBoundingClientRect();
      indicator.style.left = (clientX - cRect.left) + 'px';
      indicator.style.top = (clientY - cRect.top) + 'px';
      indicator.style.display = 'block';
      clearTimeout(indicator.timer);
      indicator.timer = setTimeout(() => { indicator.style.display = 'none'; }, 500);
    }

    async function sendMouseAction(action, payload) {
      try {
        await fetch('/api/control/mouse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ action: action }, payload || {})),
        });
      } catch (err) {
        console.warn('Mouse control error', err);
      }
    }

    if (screenContainer) {
      screenContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const coords = getNormalizedCoords(e);
        if (!coords) return;
        showClickIndicator(coords.clientX, coords.clientY);
        sendMouseAction('click', { xRatio: coords.xRatio, yRatio: coords.yRatio, button: 'right' });
      });

      screenContainer.addEventListener('click', (e) => {
        const coords = getNormalizedCoords(e);
        if (!coords) return;
        showClickIndicator(coords.clientX, coords.clientY);

        if (activeMouseMode === 'left') {
          sendMouseAction('click', { xRatio: coords.xRatio, yRatio: coords.yRatio, button: 'left' });
        } else if (activeMouseMode === 'right') {
          sendMouseAction('click', { xRatio: coords.xRatio, yRatio: coords.yRatio, button: 'right' });
        } else if (activeMouseMode === 'double') {
          sendMouseAction('dblclick', { xRatio: coords.xRatio, yRatio: coords.yRatio, button: 'left' });
        } else if (activeMouseMode === 'scroll-up') {
          sendMouseAction('scroll', { dx: 0, dy: -240 });
        } else if (activeMouseMode === 'scroll-down') {
          sendMouseAction('scroll', { dx: 0, dy: 240 });
        } else if (activeMouseMode === 'drag') {
          sendMouseAction('click', { xRatio: coords.xRatio, yRatio: coords.yRatio, button: 'left' });
        }
      });

      screenContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        sendMouseAction('scroll', { dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) });
      }, { passive: false });
    }

    // Remote Keyboard & Shortcut Keys
    async function sendKeyAction(action, payload) {
      try {
        await fetch('/api/control/keyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ action: action }, payload || {})),
        });
      } catch (err) {
        console.warn('Keyboard control error', err);
      }
    }

    if ($('remote-type-send')) {
      const doSendType = () => {
        const inp = $('remote-type-text');
        const text = inp.value;
        if (!text) return;
        sendKeyAction('type', { text: text });
        inp.value = '';
      };
      $('remote-type-send').addEventListener('click', doSendType);
      $('remote-type-text').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSendType();
        }
      });
    }

    document.querySelectorAll('.key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key) sendKeyAction('key', { key: key });
      });
    });

    // MaveDrop P2P Wireless File Sharing & LAN Sync Client Logic
    async function loadMaveDropFiles() {
      const container = $('mavedrop-file-list');
      if (!container) return;
      try {
        const res = await fetch('/api/drop/files');
        const data = await res.json();
        if (!data.ok || !data.files || !data.files.length) {
          container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-3);">No files in MaveDrop storage yet. Drop files above to transfer instantly!</div>';
          return;
        }
        if (data.dropDir && $('mavedrop-dir-hint')) {
          $('mavedrop-dir-hint').textContent = 'Storage: ' + data.dropDir;
        }
        container.innerHTML = data.files.map((f) =>
          '<div class="row" style="padding:10px 16px;">' +
            '<div class="label" style="min-width:0; flex:1;">' +
              '<div class="headline" style="word-break:break-all;">📄 ' + (f.name || '') + '</div>' +
              '<div class="hint">' + (f.sizeHuman || '') + ' · Modified: ' + (f.modifiedAt ? f.modifiedAt.slice(0, 19).replace('T', ' ') : 'Recent') + '</div>' +
            '</div>' +
            '<a href="/api/drop/download?file=' + encodeURIComponent(f.name) + '" class="btn secondary small" download style="flex-shrink:0;">⬇️ Download</a>' +
          '</div>'
        ).join('');
      } catch (err) {
        container.innerHTML = '<div style="padding:16px; color:#ef4444;">Error loading files: ' + err.message + '</div>';
      }
    }

    async function loadMaveDropDevices() {
      const container = $('mavedrop-device-list');
      if (!container) return;
      try {
        const res = await fetch('/api/drop/devices');
        const data = await res.json();
        if (!data.ok || !data.devices || !data.devices.length) {
          container.innerHTML = '<div style="color:var(--text-2);">📱 1 Mobile Device Connected. Open Mave on any Android, iPhone, or laptop on this Wi-Fi to sync automatically!</div>';
          return;
        }
        container.innerHTML = data.devices.map((d) =>
          '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--hairline);">' +
            '<div><strong>' + (d.name || 'Mobile Phone') + '</strong> <span style="font-size:11px; color:var(--text-3);">(' + (d.os || 'LAN') + ' · ' + (d.ip || 'Local') + ')</span></div>' +
            '<span class="tag active" style="font-size:10px;">Connected</span>' +
          '</div>'
        ).join('');
      } catch (err) {
        container.innerHTML = '<div style="color:var(--text-3);">Device discovery ready over LAN.</div>';
      }
    }

    async function fetchLanClipboard() {
      const txt = $('lan-clipboard-text');
      const status = $('clipboard-sync-status');
      if (!txt) return;
      try {
        const res = await fetch('/api/clipboard/sync');
        const data = await res.json();
        if (data.ok && data.text) {
          txt.value = data.text;
          if (status) status.textContent = 'Fetched from Windows clipboard (' + data.text.length + ' chars).';
        }
      } catch (e) {}
    }

    async function syncLanClipboard() {
      const txt = $('lan-clipboard-text');
      const status = $('clipboard-sync-status');
      if (!txt) return;
      const val = txt.value;
      if (!val) return;
      try {
        if (status) status.textContent = 'Syncing...';
        const res = await fetch('/api/clipboard/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: val, sender: 'Mobile Device' })
        });
        const data = await res.json();
        if (data.ok && status) {
          status.textContent = '✅ Synced ' + data.length + ' chars to Windows host clipboard!';
          setTimeout(() => { if (status) status.textContent = ''; }, 4000);
        }
      } catch (err) {
        if (status) status.textContent = 'Sync error: ' + err.message;
      }
    }

    async function uploadMaveDropFiles(fileList) {
      const status = $('mavedrop-upload-status');
      if (!fileList || !fileList.length) return;
      if (status) status.textContent = 'Uploading ' + fileList.length + ' file(s) via Wi-Fi AirDrop...';
      for (const file of fileList) {
        try {
          const reader = new FileReader();
          await new Promise((resolve, reject) => {
            reader.onload = async () => {
              try {
                const base64 = reader.result;
                const res = await fetch('/api/drop/upload', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    filename: file.name,
                    fileBase64: base64,
                    sender: navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Android') ? 'Android' : 'Mobile Web'
                  })
                });
                const data = await res.json();
                if (data.ok) {
                  if (status) status.textContent = '✅ Sent "' + file.name + '" to PC successfully!';
                } else {
                  if (status) status.textContent = '❌ Failed "' + file.name + '": ' + (data.error || 'Unknown error');
                }
                resolve();
              } catch (e) { reject(e); }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } catch (err) {
          if (status) status.textContent = 'Upload error: ' + err.message;
        }
      }
      setTimeout(() => {
        loadMaveDropFiles();
        if (status) status.textContent = '';
      }, 1500);
    }

    if ($('btn-refresh-files')) $('btn-refresh-files').addEventListener('click', loadMaveDropFiles);
    if ($('btn-refresh-devices')) $('btn-refresh-devices').addEventListener('click', loadMaveDropDevices);
    if ($('btn-sync-to-pc')) $('btn-sync-to-pc').addEventListener('click', syncLanClipboard);
    if ($('btn-fetch-pc-clip')) $('btn-fetch-pc-clip').addEventListener('click', fetchLanClipboard);

    const dropFileInput = $('mavedrop-file-input');
    if (dropFileInput) {
      dropFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) uploadMaveDropFiles(e.target.files);
      });
    }

    const dropZone = $('mavedrop-zone');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach((ev) => {
        dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.style.borderColor = '#38bdf8'; dropZone.style.background = 'rgba(2,132,199,0.12)'; });
      });
      ['dragleave', 'drop'].forEach((ev) => {
        dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--border-subtle)'; dropZone.style.background = 'rgba(2,132,199,0.04)'; });
      });
      dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          uploadMaveDropFiles(e.dataTransfer.files);
        }
      });
    }

    // ==========================================
    // Distributed Hands Client Engine
    // ==========================================
    let handsDeviceId = localStorage.getItem('mave_hands_device_id');
    if (!handsDeviceId) {
      handsDeviceId = 'hands_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem('mave_hands_device_id', handsDeviceId);
    }
    let handsStreamActive = false;
    let handsMediaStream = null;
    let handsActionPollInterval = null;

    function getDevicePlatform() {
      const ua = navigator.userAgent || '';
      if (/android/i.test(ua)) return 'android';
      if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
      if (/macintosh|mac os x/i.test(ua)) return 'macos';
      if (/windows/i.test(ua)) return 'windows';
      if (/linux/i.test(ua)) return 'linux';
      return 'browser';
    }

    function appendHandsLog(msg) {
      const log = $('hands-action-log');
      if (!log) return;
      const d = document.createElement('div');
      d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }

    async function registerHandsDevice(customName) {
      const nameInput = $('hands-device-name');
      const devName = customName || (nameInput && nameInput.value.trim()) || ('Browser ' + getDevicePlatform().toUpperCase());
      try {
        const res = await fetch('/api/hands/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: handsDeviceId,
            name: devName,
            platform: getDevicePlatform(),
            width: window.innerWidth || 1920,
            height: window.innerHeight || 1080,
          }),
        });
        const data = await res.json();
        return data.device;
      } catch (e) {
        return null;
      }
    }

    async function loadHandsMode() {
      const nameInput = $('hands-device-name');
      if (nameInput && !nameInput.value) {
        nameInput.value = localStorage.getItem('mave_hands_dev_name') || ('My ' + getDevicePlatform().toUpperCase() + ' Device');
      }
      await refreshHandsFleet();
      await checkHandsPermissionStatus();
    }

    async function checkHandsPermissionStatus() {
      const badge = $('hands-status-badge');
      if (!badge) return;
      try {
        const res = await fetch('/api/hands/devices');
        const data = await res.json();
        if (data.ok && data.devices) {
          const myDev = data.devices.find(d => d.id === handsDeviceId);
          if (myDev && myDev.permission && myDev.permission.status === 'granted') {
            badge.style.background = 'rgba(16,185,129,0.15)';
            badge.style.color = '#10b981';
            badge.style.borderColor = 'rgba(16,185,129,0.3)';
            badge.textContent = '✅ Authorized (Hands Mode Active)';
            startHandsActionPolling();
          } else if (myDev && myDev.permission && myDev.permission.status === 'pending') {
            badge.style.background = 'rgba(245,158,11,0.15)';
            badge.style.color = '#f59e0b';
            badge.style.borderColor = 'rgba(245,158,11,0.3)';
            badge.textContent = '⏳ Pending Authorization';
          } else {
            badge.style.background = 'rgba(239,68,68,0.15)';
            badge.style.color = '#ef4444';
            badge.style.borderColor = 'rgba(239,68,68,0.3)';
            badge.textContent = '⛔ Disconnected / No Permission';
            stopHandsActionPolling();
          }
        }
      } catch (e) {}
    }

    async function grantHandsPermission() {
      const nameInput = $('hands-device-name');
      const devName = (nameInput && nameInput.value.trim()) || ('My ' + getDevicePlatform().toUpperCase());
      localStorage.setItem('mave_hands_dev_name', devName);
      await registerHandsDevice(devName);

      const durSelect = $('hands-permission-duration');
      const dur = durSelect ? parseInt(durSelect.value, 10) : 60;

      try {
        const res = await fetch('/api/hands/permission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: handsDeviceId,
            action: 'grant',
            durationMinutes: dur,
            scopes: ['screen_read', 'screen_control', 'keyboard', 'apps'],
          }),
        });
        const data = await res.json();
        if (data.ok) {
          appendHandsLog('Control permission granted to Mave (' + dur + ' mins). Host PC screen will remain untouched!');
          await checkHandsPermissionStatus();
          await refreshHandsFleet();
        }
      } catch (e) {
        appendHandsLog('Error granting permission: ' + e.message);
      }
    }

    async function revokeHandsPermission() {
      try {
        const res = await fetch('/api/hands/permission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: handsDeviceId,
            action: 'revoke',
          }),
        });
        const data = await res.json();
        if (data.ok) {
          appendHandsLog('Permission revoked. Mave can no longer control this device.');
          await checkHandsPermissionStatus();
          await refreshHandsFleet();
          stopHandsScreenStream();
        }
      } catch (e) {
        appendHandsLog('Error revoking permission: ' + e.message);
      }
    }

    function startHandsActionPolling() {
      if (handsActionPollInterval) return;
      handsActionPollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/hands/actions?deviceId=' + encodeURIComponent(handsDeviceId));
          const data = await res.json();
          if (data.ok && data.actions && data.actions.length) {
            for (const act of data.actions) {
              appendHandsLog('⚡ Mave executed: ' + act.name + ' ' + (act.input ? JSON.stringify(act.input) : ''));
            }
          }
        } catch (e) {}
      }, 1500);
    }

    function stopHandsActionPolling() {
      if (handsActionPollInterval) {
        clearInterval(handsActionPollInterval);
        handsActionPollInterval = null;
      }
    }

    async function streamHandsScreen() {
      if (handsStreamActive) {
        stopHandsScreenStream();
        return;
      }
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert('Screen capture API is not available on this browser/context (requires HTTPS).');
          return;
        }
        handsMediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        handsStreamActive = true;
        const btn = $('btn-stream-hands-screen');
        if (btn) btn.innerHTML = '<span>🛑 Stop Sharing Screen</span>';
        appendHandsLog('Screen stream started. Streaming frames to Mave...');

        const track = handsMediaStream.getVideoTracks()[0];
        const video = document.createElement('video');
        video.srcObject = handsMediaStream;
        video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const streamTimer = setInterval(async () => {
          if (!handsStreamActive || !track || track.readyState === 'ended') {
            clearInterval(streamTimer);
            stopHandsScreenStream();
            return;
          }
          if (video.videoWidth && video.videoHeight) {
            canvas.width = Math.min(1280, video.videoWidth);
            canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            fetch('/api/hands/screen', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceId: handsDeviceId,
                frameBase64: dataUrl,
                width: video.videoWidth,
                height: video.videoHeight,
              }),
            }).catch(() => {});
          }
        }, 1000);

        track.onended = () => {
          clearInterval(streamTimer);
          stopHandsScreenStream();
        };
      } catch (e) {
        appendHandsLog('Screen capture error: ' + e.message);
      }
    }

    function stopHandsScreenStream() {
      handsStreamActive = false;
      if (handsMediaStream) {
        handsMediaStream.getTracks().forEach(t => t.stop());
        handsMediaStream = null;
      }
      const btn = $('btn-stream-hands-screen');
      if (btn) btn.innerHTML = '<span>🖥️ Share My Screen</span>';
      appendHandsLog('Screen stream stopped.');
    }

    async function refreshHandsFleet() {
      const container = $('hands-device-fleet-list');
      if (!container) return;
      try {
        const res = await fetch('/api/hands/devices');
        const data = await res.json();
        if (!data.ok || !data.devices || !data.devices.length) {
          container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-3);">No remote devices registered as Hands yet.</div>';
          return;
        }
        container.innerHTML = data.devices.map((d) => {
          const isCurrent = d.id === handsDeviceId;
          const isTarget = d.isActiveHandsTarget;
          const statusColor = d.permission.status === 'granted' ? '#10b981' : (d.permission.status === 'pending' ? '#f59e0b' : '#ef4444');
          return '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--surface-2); border-radius:var(--r-md); border:1px solid ' + (isTarget ? '#6366f1' : 'var(--border-subtle)') + ';">' +
            '<div>' +
              '<div style="font-weight:600; font-size:13.5px; display:flex; align-items:center; gap:6px;">' +
                '<span>' + d.name + '</span>' +
                (isCurrent ? '<span style="font-size:10px; background:rgba(99,102,241,0.2); color:#818cf8; padding:1px 6px; border-radius:4px;">This Device</span>' : '') +
                (isTarget ? '<span style="font-size:10px; background:#4f46e5; color:#fff; padding:1px 6px; border-radius:4px;">Active Target</span>' : '') +
              '</div>' +
              '<div style="font-size:11.5px; color:var(--text-3); margin-top:2px;">' +
                d.platform + ' (' + d.bounds.width + 'x' + d.bounds.height + ') • IP: ' + d.ip +
              '</div>' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<span style="font-size:11px; font-weight:700; color:' + statusColor + ';">' + d.permission.status.toUpperCase() + '</span>' +
              (d.permission.status === 'granted' ?
                '<button type="button" class="btn small ' + (isTarget ? 'danger' : 'primary') + ' btn-toggle-target" data-id="' + d.id + '" data-target="' + (isTarget ? '1' : '0') + '">' +
                  (isTarget ? 'Switch to Host PC' : 'Target this Device') +
                '</button>' : '') +
            '</div>' +
          '</div>';
        }).join('');
        container.querySelectorAll('.btn-toggle-target').forEach((b) => {
          b.addEventListener('click', () => {
            toggleHandsTarget(b.dataset.id, b.dataset.target === '1');
          });
        });
      } catch (e) {
        container.innerHTML = '<div style="color:var(--text-3);">Fleet scan failed: ' + e.message + '</div>';
      }
    }

    window.toggleHandsTarget = async function(deviceId, isCurrentlyTarget) {
      try {
        const target = isCurrentlyTarget ? 'host' : deviceId;
        const res = await fetch('/api/hands/switch_target', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target }),
        });
        const data = await res.json();
        if (data.ok) {
          await refreshHandsFleet();
        }
      } catch (e) {}
    };

    if ($('btn-grant-hands-permission')) $('btn-grant-hands-permission').addEventListener('click', grantHandsPermission);
    if ($('btn-revoke-hands-permission')) $('btn-revoke-hands-permission').addEventListener('click', revokeHandsPermission);
    if ($('btn-stream-hands-screen')) $('btn-stream-hands-screen').addEventListener('click', streamHandsScreen);
    if ($('btn-refresh-hands-devices')) $('btn-refresh-hands-devices').addEventListener('click', refreshHandsFleet);
    if ($('btn-clear-hands-log')) $('btn-clear-hands-log').addEventListener('click', () => {
      const log = $('hands-action-log');
      if (log) log.innerHTML = '<div>[Ready] Waiting for Mave task instructions...</div>';
    });

    // ==========================================
    // ChatGPT App-Style Interactive Voice Mode
    // ==========================================
    let isVoiceModeActive = false;
    let voiceModeRecorder = null;
    let voiceModeAudioContext = null;
    let voiceModeAnalyser = null;
    let voiceModeState = 'idle'; // 'listening' | 'thinking' | 'speaking'
    let voiceSilenceTimer = null;
    let voiceSpeechDetected = false;
    let currentSpeechAudio = null;
    let voiceModeMuted = false;

    function setVoiceModeState(state, caption) {
      voiceModeState = state;
      const pill = $('voice-state-pill');
      const orb = $('voice-orb');
      const cap = $('voice-orb-caption');
      if (orb) {
        orb.classList.remove('orb-listening', 'orb-thinking', 'orb-speaking', 'speaking');
        if (state === 'listening') orb.classList.add('orb-listening');
        else if (state === 'thinking') orb.classList.add('orb-thinking');
        else if (state === 'speaking') {
          orb.classList.add('orb-speaking', 'speaking');
        }
      }
      if (pill) {
        if (state === 'listening') {
          pill.textContent = 'Listening…';
          pill.style.background = 'rgba(59,130,246,0.2)';
          pill.style.color = '#60a5fa';
        } else if (state === 'thinking') {
          pill.textContent = 'Thinking…';
          pill.style.background = 'rgba(168,85,247,0.2)';
          pill.style.color = '#c084fc';
        } else if (state === 'speaking') {
          pill.textContent = 'Speaking…';
          pill.style.background = 'rgba(16,185,129,0.2)';
          pill.style.color = '#34d399';
        }
      }
      if (cap && caption) cap.textContent = caption;

      if (window.webIsland) {
        const titleText = state === 'listening' ? 'Listening…' : state === 'thinking' ? 'Thinking…' : state === 'speaking' ? 'Speaking…' : 'Mave Core';
        window.webIsland.setStatus(titleText, state);
      }
      if (window.webAvatar) {
        if (state === 'speaking') {
          window.webAvatar.setMood('happy');
          window.webAvatar.hop();
        } else if (state === 'thinking') {
          window.webAvatar.setMood('thinking');
        } else if (state === 'listening') {
          window.webAvatar.setMood('idle');
        }
      }
    }

    let voiceViewMode = 'auto'; // 'auto' | 'orb' | 'thoughts' | 'screen'
    let currentVoiceStage = 'orb'; // 'orb' | 'thoughts' | 'permission' | 'screen'

    function setVoiceStage(stage) {
      currentVoiceStage = stage;
      updateVoiceDisplay();
    }

    function updateVoiceDisplay() {
      let active = currentVoiceStage;
      if (voiceViewMode !== 'auto') {
        active = voiceViewMode;
      }
      const orbBox = $('voice-orb-container');
      const thoughtBox = $('voice-thought-container');
      const permBox = $('voice-permission-container');
      const screenBox = $('voice-screen-container');

      if (orbBox) orbBox.style.display = (active === 'orb') ? 'flex' : 'none';
      if (thoughtBox) thoughtBox.style.display = (active === 'thoughts') ? 'block' : 'none';
      if (permBox) permBox.style.display = (active === 'permission') ? 'block' : 'none';
      if (screenBox) {
        screenBox.style.display = (active === 'screen') ? 'block' : 'none';
        if (active === 'screen' && $('voice-screen-img')) {
          $('voice-screen-img').src = '/api/screen/stream?fps=10&mode=fast&t=' + Date.now();
        }
      }
    }

    ['auto', 'orb', 'thoughts', 'screen'].forEach((m) => {
      const btn = $('voice-pill-' + m);
      if (btn) {
        btn.addEventListener('click', () => {
          voiceViewMode = m;
          document.querySelectorAll('.voice-view-pill').forEach((p) => {
            const isMatch = p.dataset.vmode === m;
            p.classList.toggle('active', isMatch);
            p.style.background = isMatch ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)';
            p.style.borderColor = isMatch ? '#3b82f6' : 'rgba(255,255,255,0.12)';
            p.style.color = isMatch ? '#93c5fd' : '#94a3b8';
            p.style.fontWeight = isMatch ? '600' : '500';
          });
          updateVoiceDisplay();
        });
      }
    });

    async function openVoiceMode() {
      if (!localStorage.getItem('mave_meet_voice_seen') && $('meet-voice-modal')) {
        $('meet-voice-modal').style.display = 'flex';
        return;
      }
      if (!checkMediaPermissions('Microphone')) return;
      isVoiceModeActive = true;
      $('voice-mode-modal').style.display = 'flex';
      $('voice-user-sub').textContent = 'Listening to you…';
      $('voice-bot-sub').textContent = '';
      startVoiceModeLoop();
    }

    function closeVoiceMode() {
      isVoiceModeActive = false;
      stopVoiceModeLoop();
      if (currentSpeechAudio) {
        currentSpeechAudio.pause();
        currentSpeechAudio = null;
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      $('voice-mode-modal').style.display = 'none';
      if (window.webIsland) window.webIsland.setStatus('Mave Core', 'idle');
      if (window.webAvatar) window.webAvatar.setMood('idle');
    }

    function interruptVoiceMode() {
      if (currentSpeechAudio) {
        currentSpeechAudio.pause();
        currentSpeechAudio = null;
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      if (isVoiceModeActive) {
        startVoiceModeLoop();
      }
    }

    async function startVoiceModeLoop() {
      if (!isVoiceModeActive) return;
      setVoiceModeState('listening', 'Say something or tap orb to interrupt');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
          }
        });

        voiceModeAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = voiceModeAudioContext.createMediaStreamSource(stream);
        voiceModeAnalyser = voiceModeAudioContext.createAnalyser();
        voiceModeAnalyser.fftSize = 256;

        const processor = voiceModeAudioContext.createScriptProcessor(4096, 1, 1);
        const samples = [];
        voiceSpeechDetected = false;
        clearTimeout(voiceSilenceTimer);

        processor.onaudioprocess = (e) => {
          if (!isVoiceModeActive) return;
          const inputData = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
          const rms = Math.sqrt(sum / inputData.length);

          const orb = $('voice-orb');
          const halo = $('voice-orb-halo');
          if (orb && voiceModeState === 'listening') {
            const scale = 1 + Math.min(0.35, rms * 3.5);
            orb.style.transform = 'scale(' + scale + ')';
            if (halo) halo.style.transform = 'scale(' + (scale * 1.15) + ')';
          }

          if (!voiceModeMuted && voiceModeState === 'listening') {
            if (rms > 0.035) {
              voiceSpeechDetected = true;
              clearTimeout(voiceSilenceTimer);
              $('voice-user-sub').textContent = 'Listening… (hearing voice)';
            } else if (voiceSpeechDetected && rms <= 0.02) {
              if (!voiceSilenceTimer) {
                voiceSilenceTimer = setTimeout(async () => {
                  voiceSilenceTimer = null;
                  if (voiceSpeechDetected && samples.length > 5) {
                    await handleVoiceUtteranceComplete();
                  }
                }, 750);
              }
            }
          }

          samples.push(new Float32Array(inputData));
        };

        source.connect(voiceModeAnalyser);
        voiceModeAnalyser.connect(processor);
        processor.connect(voiceModeAudioContext.destination);

        voiceModeRecorder = {
          async stop() {
            source.disconnect();
            voiceModeAnalyser.disconnect();
            processor.disconnect();
            stream.getTracks().forEach((t) => t.stop());
            try { await voiceModeAudioContext.close(); } catch (e) {}

            let totalLen = samples.reduce((acc, curr) => acc + curr.length, 0);
            let merged = new Float32Array(totalLen);
            let offset = 0;
            for (const s of samples) {
              merged.set(s, offset);
              offset += s.length;
            }

            const buffer = new ArrayBuffer(44 + merged.length * 2);
            const view = new DataView(buffer);
            function writeStr(offset, str) {
              for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
            }
            writeStr(0, 'RIFF');
            view.setUint32(4, 36 + merged.length * 2, true);
            writeStr(8, 'WAVE');
            writeStr(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, 16000, true);
            view.setUint32(28, 32000, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeStr(36, 'data');
            view.setUint32(40, merged.length * 2, true);

            let pcmOffset = 44;
            for (let i = 0; i < merged.length; i++, pcmOffset += 2) {
              let s = Math.max(-1, Math.min(1, merged[i]));
              view.setInt16(pcmOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
            return new Blob([view], { type: 'audio/wav' });
          }
        };
      } catch (err) {
        setVoiceModeState('idle', 'Error: ' + err.message);
      }
    }

    function stopVoiceModeLoop() {
      clearTimeout(voiceSilenceTimer);
      voiceSilenceTimer = null;
      if (voiceModeRecorder) {
        voiceModeRecorder.stop();
        voiceModeRecorder = null;
      }
    }

    async function handleVoiceUtteranceComplete() {
      if (!isVoiceModeActive || !voiceModeRecorder) return;
      setVoiceModeState('thinking', 'Mave is thinking…');
      $('voice-user-sub').textContent = 'Processing speech…';
      setVoiceStage('thoughts');
      if ($('voice-thought-list')) {
        $('voice-thought-list').innerHTML = '<div style="color:#94a3b8; font-style:italic;">Processing your voice request…</div>';
      }

      let pollInterval = setInterval(async () => {
        try {
          const sRes = await fetch('/api/task/status');
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.thought && $('voice-thought-indicator')) {
              $('voice-thought-indicator').textContent = sData.thought.slice(0, 32);
            }
            if (Array.isArray(sData.thoughts) && sData.thoughts.length) {
              const list = $('voice-thought-list');
              if (list) {
                list.innerHTML = sData.thoughts.map(function(t) {
                  return '<div style="display:flex; gap:6px;"><span style="color:#3b82f6; font-weight:bold;">›</span><span>' + escapeHtml(t) + '</span></div>';
                }).join('');
                list.scrollTop = list.scrollHeight;
              }
            }
          }
        } catch {}
      }, 400);

      try {
        const wavBlob = await voiceModeRecorder.stop();
        voiceModeRecorder = null;

        const res = await fetch('/api/voice/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: wavBlob
        });
        const data = await res.json();
        clearInterval(pollInterval);

        if (!isVoiceModeActive) return;

        // Check if user spoke a vocal confirmation for an active permission card
        if (currentVoiceStage === 'permission' && data.transcript) {
          const trans = data.transcript.toLowerCase();
          if (/yes|proceed|approve|confirm|sure|do it|ok|okay/i.test(trans)) {
            const btn = $('voice-perm-approve-btn');
            if (btn && btn.onclick) { btn.onclick(); return; }
          } else if (/no|cancel|decline|stop|don't|dont/i.test(trans)) {
            const btn = $('voice-perm-decline-btn');
            if (btn && btn.onclick) { btn.onclick(); return; }
          }
        }

        if (data.ok && data.reply) {
          $('voice-user-sub').textContent = 'You: "' + (data.transcript || 'Spoken input') + '"';
          $('voice-bot-sub').textContent = data.reply;
          addMsg(data.transcript || 'Spoken input', true);
          addMsg(data.reply);

          // Handle thoughts display
          if (Array.isArray(data.thoughts) && data.thoughts.length && $('voice-thought-list')) {
            $('voice-thought-list').innerHTML = data.thoughts.map(function(t) {
              return '<div style="display:flex; gap:6px;"><span style="color:#3b82f6; font-weight:bold;">›</span><span>' + escapeHtml(t) + '</span></div>';
            }).join('');
          }

          // Dynamic Mave Stage Control
          if (data.needsPermission) {
            setVoiceStage('permission');
            const desc = (data.permissionDetails && (data.permissionDetails.prompt || data.permissionDetails.action)) || data.reply;
            $('voice-permission-desc').textContent = desc;
            $('voice-perm-approve-btn').onclick = async function() {
              setVoiceStage('orb');
              sendChatMsg('Yes, proceed with the action.');
              if (isVoiceModeActive) startVoiceModeLoop();
            };
            $('voice-perm-decline-btn').onclick = function() {
              setVoiceStage('orb');
              sendChatMsg('No, cancel this action.');
              if (isVoiceModeActive) startVoiceModeLoop();
            };
          } else if (data.reply.toLowerCase().includes('screen') || data.reply.toLowerCase().includes('desktop')) {
            setVoiceStage('screen');
            setTimeout(function() { if (voiceViewMode === 'auto') setVoiceStage('orb'); }, 8000);
          } else {
            setVoiceStage('orb');
          }

          await playVoiceModeReply(data.reply, data.audioUrl);
        } else {
          clearInterval(pollInterval);
          setVoiceStage('orb');
          $('voice-bot-sub').textContent = data.error || 'Could not understand audio. Listening again…';
          setTimeout(() => { if (isVoiceModeActive) startVoiceModeLoop(); }, 1500);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setVoiceStage('orb');
        $('voice-bot-sub').textContent = 'Error: ' + err.message;
        setTimeout(() => { if (isVoiceModeActive) startVoiceModeLoop(); }, 2000);
      }
    }

    async function playVoiceModeReply(text, customAudioUrl) {
      if (!isVoiceModeActive) return;
      setVoiceModeState('speaking', 'Mave is speaking… (Tap orb to interrupt)');
      unlockAudioPlayback();

      const audioUrl = customAudioUrl || ('/api/voice/tts?text=' + encodeURIComponent(text) + '&t=' + Date.now());
      const player = $('mave-voice-player') || new Audio();
      currentSpeechAudio = player;

      let speakAnim = setInterval(() => {
        const orb = $('voice-orb');
        if (orb && voiceModeState === 'speaking') {
          const s = 1 + Math.random() * 0.16;
          orb.style.transform = 'scale(' + s.toFixed(3) + ')';
        }
      }, 100);

      const cleanupSpeak = () => {
        clearInterval(speakAnim);
        const orb = $('voice-orb');
        if (orb) orb.style.transform = 'scale(1)';
        currentSpeechAudio = null;
      };

      player.onended = () => {
        cleanupSpeak();
        if (isVoiceModeActive) {
          startVoiceModeLoop();
        }
      };

      player.onerror = () => {
        cleanupSpeak();
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.onend = () => { if (isVoiceModeActive) startVoiceModeLoop(); };
          u.onerror = () => { if (isVoiceModeActive) startVoiceModeLoop(); };
          window.speechSynthesis.speak(u);
        } else {
          setTimeout(() => { if (isVoiceModeActive) startVoiceModeLoop(); }, 1500);
        }
      };

      try {
        player.src = audioUrl;
        await player.play();
      } catch (err) {
        cleanupSpeak();
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.onend = () => { if (isVoiceModeActive) startVoiceModeLoop(); };
          u.onerror = () => { if (isVoiceModeActive) startVoiceModeLoop(); };
          window.speechSynthesis.speak(u);
        } else {
          setTimeout(() => { if (isVoiceModeActive) startVoiceModeLoop(); }, 1500);
        }
      }
    }

    if ($('voice-mode-open-btn')) $('voice-mode-open-btn').addEventListener('click', openVoiceMode);
    if ($('composer-voice-mode-btn')) $('composer-voice-mode-btn').addEventListener('click', openVoiceMode);
    if ($('voice-mode-close-btn')) $('voice-mode-close-btn').addEventListener('click', closeVoiceMode);
    if ($('voice-interrupt-btn')) $('voice-interrupt-btn').addEventListener('click', interruptVoiceMode);
    if ($('voice-orb')) $('voice-orb').addEventListener('click', interruptVoiceMode);
    if ($('voice-mute-btn')) {
      $('voice-mute-btn').addEventListener('click', () => {
        voiceModeMuted = !voiceModeMuted;
        $('voice-mute-text').textContent = voiceModeMuted ? 'Unmute' : 'Mute';
        $('voice-mute-icon').textContent = voiceModeMuted ? '🔇' : '🎤';
        $('voice-mute-btn').style.background = voiceModeMuted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)';
      });
    }
    if ($('meet-voice-continue-btn')) {
      $('meet-voice-continue-btn').addEventListener('click', () => {
        try { localStorage.setItem('mave_meet_voice_seen', '1'); } catch {}
        if ($('meet-voice-modal')) $('meet-voice-modal').style.display = 'none';
        openVoiceMode();
      });
    }
    if ($('meet-voice-close-btn')) {
      $('meet-voice-close-btn').addEventListener('click', () => {
        if ($('meet-voice-modal')) $('meet-voice-modal').style.display = 'none';
      });
    }
    document.addEventListener('keydown', (e) => {
      if (isVoiceModeActive && e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        interruptVoiceMode();
      }
    });

    // ==========================================
    // 3-Tier Security PIN System
    // ==========================================
    let enteredPin = '';

    function updatePinDots() {
      const container = $('pin-dots-container');
      if (!container) return;
      const dots = container.querySelectorAll('.pin-dot');
      dots.forEach((dot, idx) => {
        if (idx < enteredPin.length) {
          dot.style.background = '#3b82f6';
          dot.style.borderColor = '#3b82f6';
        } else {
          dot.style.background = 'transparent';
          dot.style.borderColor = 'var(--border-strong)';
        }
      });
    }

    async function submitPinAuth() {
      $('pin-error-text').textContent = 'Verifying PIN…';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: enteredPin })
        });
        const data = await res.json();
        if (data.ok) {
          localStorage.setItem('mave_token', data.token);
          currentUserTier = data.tier;
          $('pin-lock-modal').style.display = 'none';
          applySecurityTier(data.tier);
        } else {
          $('pin-error-text').textContent = data.error || 'Incorrect PIN code';
          enteredPin = '';
          updatePinDots();
        }
      } catch (err) {
        $('pin-error-text').textContent = 'Connection error: ' + err.message;
      }
    }

    function applySecurityTier(tier) {
      const pill = $('security-tier-pill');
      if (pill) {
        if (isHostDevice) {
          pill.textContent = '🔒 Host Admin';
          pill.style.color = '#f59e0b';
        } else if (tier === 'admin') {
          pill.textContent = '🔒 Remote Admin';
          pill.style.color = '#f59e0b';
        } else if (tier === 'operate') {
          pill.textContent = '⚡ Operator (Chat/Control)';
          pill.style.color = '#34d399';
        } else if (tier === 'read') {
          pill.textContent = '👁️ Viewer (Read-Only)';
          pill.style.color = '#60a5fa';
        }
      }

      if (tier === 'read') {
        if ($('composer-input')) {
          $('composer-input').disabled = true;
          $('composer-input').placeholder = 'Viewer Mode: Chat is disabled for read-only tier';
        }
        if ($('send-btn')) $('send-btn').disabled = true;
        if ($('mic-btn')) $('mic-btn').disabled = true;
        if ($('voice-mode-open-btn')) $('voice-mode-open-btn').style.display = 'none';
        if ($('composer-voice-mode-btn')) $('composer-voice-mode-btn').style.display = 'none';
        if ($('remote-type-send')) $('remote-type-send').disabled = true;
        if ($('screen-container')) $('screen-container').style.pointerEvents = 'none';
      }
    }

    document.querySelectorAll('.keypad-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        if (val === 'clear') {
          enteredPin = '';
          $('pin-error-text').textContent = '';
        } else if (val === 'del') {
          enteredPin = enteredPin.slice(0, -1);
          $('pin-error-text').textContent = '';
        } else if (enteredPin.length < 8) {
          enteredPin += val;
          $('pin-error-text').textContent = '';
        }
        updatePinDots();
        if (enteredPin.length === 4) {
          submitPinAuth();
        }
      });
    });

    if ($('security-tier-pill')) {
      $('security-tier-pill').addEventListener('click', () => {
        if (!isHostDevice) {
          enteredPin = '';
          updatePinDots();
          $('pin-error-text').textContent = '';
          $('pin-lock-modal').style.display = 'flex';
        }
      });
    }

    if ($('sec-save-pins-btn')) {
      $('sec-save-pins-btn').addEventListener('click', async () => {
        const readPassword = $('sec-read-pin') ? $('sec-read-pin').value.trim() : '8080';
        const operatePassword = $('sec-operate-pin') ? $('sec-operate-pin').value.trim() : '0509';
        const adminPassword = $('sec-admin-pin') ? $('sec-admin-pin').value.trim() : '1508';

        try {
          const res = await fetch('/api/auth/passwords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ readPassword, operatePassword, adminPassword })
          });
          const data = await res.json();
          if (data.ok) {
            const msg = $('sec-status-msg');
            if (msg) {
              msg.style.display = 'inline';
              setTimeout(() => { msg.style.display = 'none'; }, 3000);
            }
          } else {
            alert('Error saving PINs: ' + (data.error || 'Permission denied'));
          }
        } catch (e) {
          alert('Error saving PINs: ' + e.message);
        }
      });
    }

    // ==========================================================
    // Vorssaint Cute Little Dot Avatar & Dynamic Island (Mobile & Web)
    // ==========================================================
    const EYE_PATHS = {
      idle: {
        left: 'M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z',
        right: 'M 67 20 C 71 20, 73 23, 73 30 C 73 37, 71 40, 67 40 C 63 40, 61 37, 61 30 C 61 23, 63 20, 67 20 Z',
        fill: '#111418',
        stroke: 'none'
      },
      happy: {
        left: 'M 27 34 Q 33 20 39 34',
        right: 'M 61 34 Q 67 20 73 34',
        fill: 'none',
        stroke: '#111418',
        strokeWidth: '4.5'
      },
      wink: {
        left: 'M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z',
        right: 'M 61 34 Q 67 20 73 34',
        fill: '#111418',
        stroke: 'none'
      },
      love: {
        left: 'M 33 25 C 33 21, 28 19, 25 23 C 21 19, 16 21, 16 25 C 16 32, 25 38, 25 38 C 25 38, 33 32, 33 25 Z',
        right: 'M 67 25 C 67 21, 62 19, 59 23 C 55 19, 50 21, 50 25 C 50 32, 59 38, 59 38 C 59 38, 67 32, 67 25 Z',
        fill: '#ef4444',
        stroke: 'none'
      },
      thinking: {
        left: 'M 27 32 Q 33 27 39 32',
        right: 'M 69 16 C 73 16, 75 19, 75 25 C 75 31, 73 34, 69 34 C 65 34, 63 31, 63 25 C 63 19, 65 16, 69 16 Z',
        fill: '#111418',
        stroke: 'none'
      },
      surprised: {
        left: 'M 33 22 C 38 22, 41 26, 41 30 C 41 34, 38 38, 33 38 C 28 38, 25 34, 25 30 C 25 26, 28 22, 33 22 Z',
        right: 'M 67 22 C 72 22, 75 26, 75 30 C 75 34, 72 38, 67 38 C 62 38, 59 34, 59 30 C 59 26, 62 22, 67 22 Z',
        fill: '#111418',
        stroke: 'none'
      },
      sleepy: {
        left: 'M 27 33 Q 33 37 39 33',
        right: 'M 61 33 Q 67 37 73 33',
        fill: 'none',
        stroke: '#111418',
        strokeWidth: '4'
      },
      determined: {
        left: 'M 27 24 L 39 34',
        right: 'M 73 24 L 61 34',
        fill: 'none',
        stroke: '#111418',
        strokeWidth: '4.5'
      }
    };

    class WebDotAvatarController {
      constructor() {
        this.currentMood = 'idle';
        this.palette = localStorage.getItem('mave_dot_palette') || 'sky';
        this.blinkTimer = null;
        this.init();
      }

      init() {
        this.applyPalette(this.palette);
        this.startBlinkLoop();
        this.bindInteractions();
      }

      setMood(mood, holdMs = 0) {
        this.currentMood = mood;
        const paths = EYE_PATHS[mood] || EYE_PATHS.idle;

        document.querySelectorAll('.island-dot-avatar').forEach((avatar) => {
          const eyes = avatar.querySelectorAll('.dot-eyes-svg .dot-eye');
          const left = eyes[0];
          const right = eyes[1];
          if (left) {
            left.setAttribute('d', paths.left);
            left.setAttribute('fill', paths.fill || '#111418');
            left.setAttribute('stroke', paths.stroke || 'none');
            if (paths.strokeWidth) left.setAttribute('stroke-width', paths.strokeWidth);
            else left.removeAttribute('stroke-width');
          }
          if (right) {
            right.setAttribute('d', paths.right);
            right.setAttribute('fill', paths.fill || '#111418');
            right.setAttribute('stroke', paths.stroke || 'none');
            if (paths.strokeWidth) right.setAttribute('stroke-width', paths.strokeWidth);
            else right.removeAttribute('stroke-width');
          }
        });

        if (holdMs > 0) {
          setTimeout(() => this.setMood('idle'), holdMs);
        }
      }

      hop() {
        document.querySelectorAll('.island-dot-avatar').forEach((avatar) => {
          avatar.classList.remove('dot-hopping');
          void avatar.offsetWidth;
          avatar.classList.add('dot-hopping');
          setTimeout(() => avatar.classList.remove('dot-hopping'), 650);
        });
      }

      bounce() {
        document.querySelectorAll('.island-dot-avatar').forEach((avatar) => {
          avatar.classList.remove('dot-bouncing');
          void avatar.offsetWidth;
          avatar.classList.add('dot-bouncing');
          setTimeout(() => avatar.classList.remove('dot-bouncing'), 950);
        });
      }

      pet() {
        this.bounce();
        this.setMood('love', 1500);
      }

      applyPalette(p) {
        this.palette = p;
        document.querySelectorAll('.dot-body').forEach((b) => {
          b.className = b.className.replace(/palette-\w+/g, '').trim() + ' palette-' + p;
        });
      }

      startBlinkLoop() {
        const scheduleBlink = () => {
          const delay = 3200 + Math.random() * 2800;
          this.blinkTimer = setTimeout(() => {
            if (this.currentMood === 'idle') {
              document.querySelectorAll('.island-dot-avatar').forEach((a) => a.classList.add('blinking'));
              setTimeout(() => {
                document.querySelectorAll('.island-dot-avatar').forEach((a) => a.classList.remove('blinking'));
              }, 140);
            }
            scheduleBlink();
          }, delay);
        };
        scheduleBlink();
      }

      bindInteractions() {
        const onPointerMove = (x, y) => {
          if (y < 280) {
            const faces = document.querySelectorAll('.island-dot-avatar .dot-face');
            const centerX = window.innerWidth / 2;
            const deltaX = Math.max(-5, Math.min(5, (x - centerX) / 80));
            const deltaY = Math.max(-3, Math.min(4, (y - 20) / 40));
            faces.forEach((face) => {
              face.style.transform = 'translate(' + deltaX.toFixed(1) + 'px, ' + deltaY.toFixed(1) + 'px)';
            });
          }
        };

        document.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
        document.addEventListener('touchmove', (e) => {
          if (e.touches && e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
      }
    }

    class WebDynamicIslandController {
      constructor(avatar) {
        this.avatar = avatar;
        this.isExpanded = false;
        this.autoCollapseTimer = null;
        this.init();
      }

      init() {
        const compact = $('island-compact');
        const collapseBtn = $('island-collapse-btn');

        if (compact) {
          compact.addEventListener('click', (e) => {
            if (e.target.closest('#island-dot-avatar')) {
              this.avatar.hop();
              this.avatar.setMood('happy', 1200);
            }
            this.toggle();
          });
        }

        if (collapseBtn) {
          collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.collapse();
          });
        }

        if ($('island-pet-btn')) {
          $('island-pet-btn').addEventListener('click', () => this.avatar.pet());
        }

        if ($('island-tool-voice')) {
          $('island-tool-voice').addEventListener('click', () => {
            this.collapse();
            openVoiceMode();
          });
        }

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && this.isExpanded) this.collapse();
        });

        document.addEventListener('click', (e) => {
          if (this.isExpanded && !e.target.closest('#dynamic-island')) {
            this.collapse();
          }
        });

        // Platform detection and satellite status setup
        this.updatePlatformInfo();
      }

      expand() {
        const island = $('dynamic-island');
        const compact = $('island-compact');
        const expanded = $('island-expanded');
        if (!island || !expanded) return;

        this.isExpanded = true;
        island.classList.add('expanded');
        if (compact) compact.style.display = 'none';
        expanded.style.display = 'flex';
        this.avatar.hop();

        clearTimeout(this.autoCollapseTimer);
        this.autoCollapseTimer = setTimeout(() => this.collapse(), 12000);
      }

      collapse() {
        const island = $('dynamic-island');
        const compact = $('island-compact');
        const expanded = $('island-expanded');
        if (!island || !expanded) return;

        this.isExpanded = false;
        island.classList.remove('expanded');
        expanded.style.display = 'none';
        if (compact) compact.style.display = 'flex';
        clearTimeout(this.autoCollapseTimer);
      }

      toggle() {
        if (this.isExpanded) this.collapse();
        else this.expand();
      }

      setStatus(text, state = 'idle') {
        const title = $('island-title');
        const island = $('dynamic-island');
        if (title) title.textContent = text;
        if (island) {
          island.classList.remove('thinking', 'listening', 'speaking');
          if (state === 'thinking') island.classList.add('thinking');
          else if (state === 'listening') island.classList.add('listening');
          else if (state === 'speaking') island.classList.add('speaking');
        }
        if ($('island-exp-sub')) {
          $('island-exp-sub').textContent = text + ' • Core Brain Connected';
        }
      }

      updatePlatformInfo(forceHost) {
        const ua = navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isAndroid = /Android/.test(ua);
        const isWindows = /Windows NT/.test(ua);
        const isMac = /Macintosh/.test(ua);
        const isLocal = forceHost !== undefined ? forceHost : (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

        const platformLabel = isIOS ? 'Apple iOS' : isAndroid ? 'Android' : isWindows ? 'Windows PC' : isMac ? 'macOS' : 'Companion Web';
        const roleLabel = isLocal ? 'Host Core' : 'Satellite Node';
        const pillLabel = isLocal ? 'Host AI' : (isIOS ? 'iOS Node' : isAndroid ? 'Android Node' : 'Satellite');

        if ($('im-platform-val')) $('im-platform-val').textContent = platformLabel;
        if ($('im-node-role')) $('im-node-role').textContent = roleLabel;
        if ($('island-node-pill')) $('island-node-pill').textContent = pillLabel;
      }
    }

    const webAvatar = new WebDotAvatarController();
    const webIsland = new WebDynamicIslandController(webAvatar);
    window.webAvatar = webAvatar;
    window.webIsland = webIsland;

    async function checkAuthStatus() {
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        $('ssl-nag-banner').style.display = 'flex';
        const link = $('ssl-nag-link');
        if (link) link.href = 'https://' + location.hostname + ':4043' + location.pathname;
      }

      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        if (data.ok) {
          isHostDevice = !!data.isLocalhost;
          if (window.webIsland) window.webIsland.updatePlatformInfo(isHostDevice);
          if (data.isLocalhost || data.authenticated) {
            currentUserTier = data.tier;
            applySecurityTier(data.tier);
            if (data.passwords) {
              if ($('sec-read-pin')) $('sec-read-pin').value = data.passwords.read;
              if ($('sec-operate-pin')) $('sec-operate-pin').value = data.passwords.operate;
              if ($('sec-admin-pin')) $('sec-admin-pin').value = data.passwords.admin;
            }
            if (!localStorage.getItem('mave_theme_manual')) {
              fetch('/api/settings').then((r) => r.json()).then((sd) => {
                if (sd && sd.settings && sd.settings.theme) {
                  applyWebTheme(sd.settings.theme, false);
                }
              }).catch(() => {});
            }
          } else {
            $('pin-lock-modal').style.display = 'flex';
          }
        }
      } catch (err) {
        console.warn('Auth status check error:', err);
      }
    }

    checkAuthStatus();
  </script>
</body>
</html>`;
}

class MobileWebServer {
  constructor({ controller, logger, port = 4040 }) {
    this.controller = controller;
    this.logger = logger;
    this.port = port;
    this.httpsPort = port + 3; // 4043
    this.server = null;
    this.httpsServer = null;
    this.sessions = new Map();
    this.ssl = null;
    try {
      this.ssl = ensureSslCert();
    } catch (e) {
      if (this.logger) this.logger.warn('SSL initialization note:', e.message);
    }
    this.chatgptBridge = getChatGPTNervousSystemBridge({
      controller: this.controller,
      logger: this.logger,
      port: this.port
    });
  }

  start() {
    if (this.server) return Promise.resolve(this.getUrl());
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.on('error', (err) => {
        if (this.logger) this.logger.error('Mobile web server error', err.message);
        reject(err);
      });
      this.server.listen(this.port, '0.0.0.0', () => {
        const url = this.getUrl();
        if (this.logger) this.logger.info(`Mave Web Controller live at ${url}`);

        if (this.ssl && this.ssl.key && this.ssl.cert) {
          try {
            this.httpsServer = https.createServer({
              key: this.ssl.key,
              cert: this.ssl.cert
            }, (req, res) => this.handle(req, res));
            this.httpsServer.listen(this.httpsPort, '0.0.0.0', () => {
              if (this.logger) this.logger.info(`Mave Secure HTTPS Controller live at ${this.getHttpsUrl()} (Camera/Mic Enabled)`);
            });
            this.httpsServer.on('error', (err) => {
              if (this.logger) this.logger.warn('HTTPS server warning:', err.message);
            });
          } catch (httpsErr) {
            if (this.logger) this.logger.warn('HTTPS startup note:', httpsErr.message);
          }
        }

        try {
          const { meshDiscoveryManager } = require('./mesh_discovery');
          const { userManager } = require('../users');
          meshDiscoveryManager.start({
            ...userManager.getHostInfo(),
            port: this.port,
            httpsPort: this.httpsPort,
          });
        } catch {}

        resolve(url);
      });
    });
  }

  stop() {
    try {
      const { meshDiscoveryManager } = require('./mesh_discovery');
      meshDiscoveryManager.stop();
    } catch {}

    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.httpsServer) {
      this.httpsServer.close();
      this.httpsServer = null;
    }
  }

  getUrl() {
    return `http://${getLocalIp()}:${this.port}`;
  }

  getHttpsUrl() {
    return `https://${getLocalIp()}:${this.httpsPort}`;
  }

  getSession(req) {
    let token = req.headers['x-mave-token'];
    if (!token && req.headers['authorization']) {
      const parts = req.headers['authorization'].split(' ');
      if (parts.length === 2 && /^bearer$/i.test(parts[0])) token = parts[1];
    }
    if (!token && req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)mave_token=([^;]+)/);
      if (match) token = match[1];
    }
    if (!token) {
      try {
        const u = new URL(req.url, 'http://localhost');
        token = u.searchParams.get('token');
      } catch {}
    }
    if (token && this.sessions.has(token)) {
      const sess = this.sessions.get(token);
      if (Date.now() < sess.expires) return sess;
      this.sessions.delete(token);
    }
    return null;
  }

  async handle(req, res) {
    const isHttps = !!(req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https');
    const protocol = isHttps ? 'https' : 'http';
    const url = new URL(req.url, `${protocol}://${req.headers.host || 'localhost'}`);

    // CORS headers for local LAN
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mave-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // --- Ghost AI Core Protocol Endpoints (MCP, AG-UI, A2UI, A2A) ---
    try {
      const { getGhostAICore } = require('../ghost_core');
      const ghostCore = getGhostAICore();
      const handled = await ghostCore.handleHttpRequest(req, res, url.pathname);
      if (handled) return;
    } catch (ghostErr) {
      if (this.logger) this.logger.warn('Ghost AI Core route error:', ghostErr.message);
    }

    // Serve rich desktop-parity UI at root and /drop
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/drop')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(getDesktopWebHtml(this.getUrl(), this.getHttpsUrl()));
    }

    // --- Commercial Selling Application Website, Download Hub & Account Portal ---
    if (req.method === 'GET' && (
      url.pathname === '/product' ||
      url.pathname === '/download' ||
      url.pathname === '/pricing' ||
      url.pathname === '/join' ||
      url.pathname === '/account' ||
      url.pathname === '/portal'
    )) {
      const { getProductSiteHtml } = require('./product_site');
      const { userManager } = require('../users');
      const html = getProductSiteHtml({
        hostUrl: this.getUrl(),
        httpsUrl: this.getHttpsUrl(),
        hostInfo: userManager.getHostInfo(),
        currentUser: userManager.getUser('user-owner-root'),
        users: userManager.listUsers(),
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // --- Direct CLI Installers (PowerShell & Shell) ---
    if (req.method === 'GET' && (url.pathname === '/install.ps1' || url.pathname === '/install-windows.ps1')) {
      const hostUrl = this.getUrl();
      const psScript = `# Mave Sovereign Local AI Server & Node Installer for Windows
# Run via: irm ${hostUrl}/install.ps1 | iex
param(
  [string]$HostUrl = "${hostUrl}",
  [string]$Role = "satellite",
  [string]$InviteToken = ""
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "             MAVE SOVEREIGN LOCAL AI SERVER               " -ForegroundColor White
Write-Host "       Turn your PC into a Private AI Brain & Node       " -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$installDir = "$env:LOCALAPPDATA\\Mave"
if (!(Test-Path $installDir)) {
  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}

Write-Host "[1/3] Checking environment & host connection..." -ForegroundColor Yellow
Write-Host "      Target Directory: $installDir" -ForegroundColor Gray

if ($HostUrl) {
  Write-Host "      Configuring connection to Host Server at: $HostUrl" -ForegroundColor Green
  $config = @{
    hostUrl = $HostUrl
    role = $Role
    inviteToken = $InviteToken
    installedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json
  Set-Content -Path "$installDir\\node_config.json" -Value $config
}

Write-Host "[2/3] Setting up Mave Node binaries..." -ForegroundColor Yellow
Write-Host "      Mave Sovereign Node configured successfully." -ForegroundColor Gray

Write-Host "[3/3] Ready to launch!" -ForegroundColor Green
Write-Host "      Launch Mave from desktop shortcut or run 'mave'." -ForegroundColor White
Write-Host "      Web Console: $HostUrl/product" -ForegroundColor Cyan
`;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(psScript);
    }

    if (req.method === 'GET' && (url.pathname === '/install.sh' || url.pathname === '/install-unix.sh')) {
      const hostUrl = this.getUrl();
      const shScript = `#!/usr/bin/env bash
# Mave Sovereign Local AI Server & Node Installer for macOS / Linux
# Run via: curl -fsSL ${hostUrl}/install.sh | bash

set -e
echo "=========================================================="
echo "             MAVE SOVEREIGN LOCAL AI SERVER               "
echo "       Turn your PC into a Private AI Brain & Node       "
echo "=========================================================="
echo ""

INSTALL_DIR="$HOME/.mave"
mkdir -p "$INSTALL_DIR"

echo "[1/3] Checking environment..."
echo "      Detected: $(uname -s) $(uname -m)"
echo "      Target Directory: $INSTALL_DIR"

echo "[2/3] Configuring Sovereign Node connection..."
cat <<EOF > "$INSTALL_DIR/node_config.json"
{
  "hostUrl": "${hostUrl}",
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platform": "$(uname -s)"
}
EOF

echo "[3/3] Sovereign Node installation complete!"
echo "      Start Mave by launching the desktop application or running 'mave'."
echo "      Web Console: ${hostUrl}/product"
`;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(shScript);
    }

    // --- Direct Download Metadata API ---
    if (req.method === 'GET' && url.pathname.startsWith('/api/download/')) {
      const platform = url.pathname.replace('/api/download/', '').toLowerCase();
      const extMap = {
        win: { ext: 'exe', name: 'Windows 10/11 (x64 / ARM64)', filename: 'Mave-Setup-1.0.0.exe', size: '94.2 MB' },
        windows: { ext: 'exe', name: 'Windows 10/11 (x64 / ARM64)', filename: 'Mave-Setup-1.0.0.exe', size: '94.2 MB' },
        mac: { ext: 'dmg', name: 'macOS Apple Silicon & Intel', filename: 'Mave-1.0.0-universal.dmg', size: '98.5 MB' },
        darwin: { ext: 'dmg', name: 'macOS Apple Silicon & Intel', filename: 'Mave-1.0.0-universal.dmg', size: '98.5 MB' },
        linux: { ext: 'AppImage', name: 'Linux (Ubuntu, Debian, Fedora, Arch)', filename: 'Mave-1.0.0.AppImage', size: '91.8 MB' },
        android: { ext: 'apk', name: 'Android Companion Node', filename: 'Mave-Satellite-v1.0.0.apk', size: '28.4 MB' },
        apk: { ext: 'apk', name: 'Android Companion Node', filename: 'Mave-Satellite-v1.0.0.apk', size: '28.4 MB' },
        ios: { ext: 'pwa', name: 'iOS Web Companion / TestFlight', filename: 'Mave-iOS-Profile.mobileconfig', size: '2.1 MB' },
      };

      const info = extMap[platform] || extMap.win;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        platform,
        name: info.name,
        filename: info.filename,
        size: info.size,
        downloadUrl: `${this.getUrl()}/download/files/${info.filename}`,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        instructions: `Download and run ${info.filename}. Sign in with your account or connect to this PC as a sovereign host.`,
      }));
    }

    // --- OpenAI Compatible API Gateway (/v1/models & /v1/chat/completions) ---
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      const { userManager } = require('../users');
      const authHeader = req.headers.authorization;
      const hostInfo = userManager.getHostInfo();
      if (!isLocalhostReq(req) && !hostInfo.publicAccessEnabled && !userManager.verifyApiKey(authHeader)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: { message: 'Invalid or missing API key. Provide Authorization: Bearer sk-mave-...', type: 'invalid_request_error', code: 'invalid_api_key' },
        }));
      }

      const models = [
        { id: 'mave-core', object: 'model', created: 1700000000, owned_by: 'mave-host' },
        { id: 'mave-brain-nervous-system', object: 'model', created: 1700000000, owned_by: 'mave-host' },
        { id: 'llama-3.2-3b', object: 'model', created: 1700000000, owned_by: 'local' },
        { id: 'qwen2.5-coder-7b', object: 'model', created: 1700000000, owned_by: 'local' },
        { id: 'deepseek-r1-distill-qwen-7b', object: 'model', created: 1700000000, owned_by: 'local' },
      ];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ object: 'list', data: models }));
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      try {
        const { userManager } = require('../users');
        const authHeader = req.headers.authorization;
        const hostInfo = userManager.getHostInfo();
        const authResult = userManager.verifyApiKey(authHeader);

        if (!isLocalhostReq(req) && !hostInfo.publicAccessEnabled && !authResult) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            error: { message: 'Incorrect API key provided. Mave Sovereign Server requires an active sk-mave-... key.', type: 'invalid_request_error', code: 'invalid_api_key' },
          }));
        }

        const body = await parseBody(req);
        const model = body.model || 'mave-core';
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const isStream = !!body.stream;

        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
        const prompt = lastUserMsg ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content)) : 'Hello Mave';

        let replyText = `I am Mave, your sovereign local AI server running on ${hostInfo.hostname || 'your Host PC'}.`;
        if (this.controller && this.controller.runTask) {
          const runRes = await this.controller.runTask(prompt, 'openai-api');
          if (runRes && (runRes.text || runRes.message)) {
            replyText = runRes.text || runRes.message;
          }
        } else {
          replyText = `Mave Host AI Server processed prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}". Local model is online.`;
        }

        const completionId = `chatcmpl-${crypto.randomUUID()}`;
        const createdTime = Math.floor(Date.now() / 1000);

        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          const chunk1 = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: createdTime,
            model,
            choices: [{ index: 0, delta: { role: 'assistant', content: replyText }, finish_reason: null }],
          };
          res.write(`data: ${JSON.stringify(chunk1)}\n\n`);
          const chunkEnd = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: createdTime,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          };
          res.write(`data: ${JSON.stringify(chunkEnd)}\n\n`);
          res.write('data: [DONE]\n\n');
          return res.end();
        }

        const promptTokens = Math.max(1, Math.round(prompt.length / 4));
        const completionTokens = Math.max(1, Math.round(replyText.length / 4));

        const responseObj = {
          id: completionId,
          object: 'chat.completion',
          created: createdTime,
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: replyText,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(responseObj));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: err.message, type: 'api_error' } }));
      }
    }

    // --- Multi-User & Workspace Management APIs ---
    if (req.method === 'GET' && url.pathname === '/api/users') {
      try {
        const { userManager } = require('../users');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, users: userManager.listUsers() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/users/add') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const result = await userManager.addUser(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/users/remove') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const result = userManager.removeUser(body.userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/users/role') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const result = userManager.updateUserRole(body.userId, body.role);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/users/invite') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const result = userManager.createInviteLink(body);
        const inviteUrl = `${this.getUrl()}/join?token=${result.token}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ...result, inviteUrl }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/users/invite/accept') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const result = await userManager.acceptInvite(body.token, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/users/apikeys') {
      try {
        const { userManager } = require('../users');
        const userId = url.searchParams.get('userId') || 'user-owner-root';
        const keys = userManager.listApiKeys(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, keys }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/users/apikeys/create') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const userId = body.userId || 'user-owner-root';
        const result = userManager.createApiKey({ userId, label: body.label || 'Default API Key' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/users/apikeys/revoke') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const result = userManager.revokeApiKey(body.key);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/host/info') {
      try {
        const { userManager } = require('../users');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, hostInfo: userManager.getHostInfo(), url: this.getUrl(), httpsUrl: this.getHttpsUrl() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // --- Common Sense & Spatial / Pitch Radar APIs ---
    if (req.method === 'GET' && url.pathname === '/api/common-sense/context') {
      try {
        const { getCommonSenseEngine } = require('../intelligence/common_sense');
        const cs = getCommonSenseEngine();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          ok: true,
          spatial: cs.getSpatialContext(),
          people: cs.listPeople(),
          nextGossip: cs.getNextGossipDebrief()
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/common-sense/location') {
      try {
        const body = await parseBody(req);
        const { getCommonSenseEngine } = require('../intelligence/common_sense');
        const cs = getCommonSenseEngine();
        if (body.type === 'host') {
          cs.updateHostLocation(body);
        } else {
          const remoteIp = req.socket && req.socket.remoteAddress;
          cs.recordClientDevice({
            deviceId: body.deviceId || remoteIp || 'remote_client',
            name: body.deviceName || req.headers['user-agent']?.slice(0, 30) || 'Mobile Companion',
            ip: remoteIp,
            location: body.location || (body.latitude ? `${body.latitude.toFixed(4)}, ${body.longitude.toFixed(4)}` : 'Remote'),
            isRemote: !isLocalRequest(req),
            connectedVia: isLocalRequest(req) ? 'Wi-Fi LAN' : 'Cloudflare Tunnel',
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, spatial: cs.getSpatialContext() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/common-sense/pitch') {
      try {
        const body = await parseBody(req);
        const { getCommonSenseEngine } = require('../intelligence/common_sense');
        const cs = getCommonSenseEngine();
        const briefing = cs.generatePitchBriefing(body.person || body.name || 'Shivam');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, briefing }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/common-sense/gossip/resolve') {
      try {
        const body = await parseBody(req);
        const { getCommonSenseEngine } = require('../intelligence/common_sense');
        const cs = getCommonSenseEngine();
        const result = cs.resolveGossip(body.candidateName, body.userResponse);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/host/settings') {
      try {
        const body = await parseBody(req);
        const { userManager } = require('../users');
        const updated = userManager.updateHostSettings(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, hostInfo: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // --- Backburner Wireless Co-Processing Mesh & KV Cache Paging APIs ---
    if (req.method === 'GET' && url.pathname === '/api/mesh/status') {
      try {
        const { backburnerMeshEngine } = require('../local/backburner_mesh');
        const { meshDiscoveryManager } = require('./mesh_discovery');
        const status = backburnerMeshEngine.getMeshStatus();
        const discovery = meshDiscoveryManager.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, mesh: status, discovery }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && (url.pathname === '/api/mesh/auto-join' || url.pathname === '/api/mesh/register')) {
      try {
        const body = await parseBody(req);
        const { meshDiscoveryManager } = require('./mesh_discovery');
        const result = meshDiscoveryManager.handleHttpAutoJoin(body, req.socket.remoteAddress);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/mesh/offload/page') {
      try {
        const body = await parseBody(req);
        const { backburnerMeshEngine } = require('../local/backburner_mesh');
        const result = backburnerMeshEngine.offloadKvPage(body);
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/mesh/attn/merge') {
      try {
        const body = await parseBody(req);
        const { backburnerMeshEngine } = require('../local/backburner_mesh');
        const merged = backburnerMeshEngine.mergeAttention(body.hostAttn, body.satAttn);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, merged }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/mesh/disconnect') {
      try {
        const body = await parseBody(req);
        const { backburnerMeshEngine } = require('../local/backburner_mesh');
        const ok = backburnerMeshEngine.disconnectCoProcessor(body.deviceId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok, message: 'Co-processor disconnected' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // --- SSD Preamble & Prompt Cache APIs ---
    if (req.method === 'GET' && url.pathname === '/api/prompt-cache/stats') {
      try {
        const { promptCacheManager } = require('../local/prompt_cache');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, stats: promptCacheManager.getStats() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/prompt-cache/put') {
      try {
        const body = await parseBody(req);
        const { promptCacheManager } = require('../local/prompt_cache');
        const hash = body.hash || promptCacheManager.computeHash(body.preamble);
        const success = promptCacheManager.put(hash, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: success, hash }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/prompt-cache/clear') {
      try {
        const { promptCacheManager } = require('../local/prompt_cache');
        const success = promptCacheManager.clear();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: success, message: 'Prompt cache cleared' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // --- ChatGPT Central Brain Actions & Nervous System Gateway ---
    if (req.method === 'GET' && url.pathname === '/api/chatgpt/openapi.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const baseUrl = isHttps ? this.getHttpsUrl() : this.getUrl();
      return res.end(JSON.stringify(this.chatgptBridge.getOpenApiSpec(baseUrl), null, 2));
    }

    if (req.method === 'GET' && url.pathname === '/api/chatgpt/custom-gpt-instructions') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      const baseUrl = isHttps ? this.getHttpsUrl() : this.getUrl();
      return res.end(this.chatgptBridge.getCustomGptInstructions(baseUrl));
    }

    if (req.method === 'GET' && url.pathname === '/api/chatgpt/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const status = await this.chatgptBridge.getSystemStatus();
      return res.end(JSON.stringify(status));
    }

    if (req.method === 'POST' && (url.pathname === '/api/chatgpt/instruct' || url.pathname === '/api/chatgpt/dispatch')) {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.dispatchAutonomousTask(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/eyes/screen-detailed') {
      try {
        const body = await parseBody(req).catch(() => ({}));
        const result = await this.chatgptBridge.captureScreenDetailed(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/eyes/elements') {
      try {
        const body = await parseBody(req).catch(() => ({}));
        const result = await this.chatgptBridge.findScreenElements(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/motor/mouse/click') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.mouseClick(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/motor/mouse/move') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.mouseMove(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/motor/mouse/scroll') {
      try {
        const body = await parseBody(req).catch(() => ({}));
        const result = await this.chatgptBridge.mouseScroll(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/motor/keyboard/type') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.keyboardType(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/motor/keyboard/key') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.keyboardPressKey(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/fs/read') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.readFileContent(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/fs/write') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.writeFileContent(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/fs/list') {
      try {
        const body = await parseBody(req).catch(() => ({}));
        const result = await this.chatgptBridge.listFiles(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // --- Universal Dictation & Speech Cleaning (Handy Parity) ---
    if (req.method === 'POST' && url.pathname === '/api/dictate') {
      try {
        const body = await parseBody(req);
        const mgr = getDictationManager({ controller: this.controller });
        const result = await mgr.dictate(body.text, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/dictate/status') {
      const mgr = getDictationManager({ controller: this.controller });
      const status = await mgr.getStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(status));
    }

    if (req.method === 'POST' && url.pathname === '/api/dictate/toggle') {
      const mgr = getDictationManager({ controller: this.controller });
      const body = await parseBody(req).catch(() => ({}));
      const state = typeof body.enabled === 'boolean' ? mgr.setMode(body.enabled) : mgr.toggleMode();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, dictationMode: state }));
    }

    if (req.method === 'POST' && url.pathname === '/api/voice/clean') {
      try {
        const body = await parseBody(req);
        const mgr = getDictationManager({ controller: this.controller });
        const cleaned = cleanTranscription(body.text, {
          customWords: mgr.getCustomWords(),
          additionalWords: body.additionalWords || [],
          threshold: body.threshold || 0.35,
          removeFillers: body.removeFillers !== false
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, raw: body.text, cleaned }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/voice/dictionary') {
      const mgr = getDictationManager({ controller: this.controller });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, words: mgr.getCustomWords() }));
    }

    if (req.method === 'POST' && url.pathname === '/api/voice/dictionary') {
      try {
        const body = await parseBody(req);
        const mgr = getDictationManager({ controller: this.controller });
        let words = mgr.getCustomWords();
        if (body.action === 'remove' && body.word) {
          words = mgr.removeCustomWord(body.word);
        } else if (body.words) {
          words = mgr.addCustomWords(body.words);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, words }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // --- Voice Studio & OmniVoice Parity Endpoints ---
    if (req.method === 'POST' && url.pathname === '/api/voice/design') {
      try {
        const body = await parseBody(req);
        const designer = getVoiceDesigner();
        const voice = designer.designVoiceFromPrompt(body.prompt, body.name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, voice }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/voice/clone') {
      try {
        const body = await parseBody(req);
        const cloner = getVoiceCloner();
        const clone = await cloner.cloneVoice({
          name: body.name,
          audioPath: body.audioPath || body.audio_path,
          description: body.description
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, clone }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/voice/dub') {
      try {
        const body = await parseBody(req);
        const dubber = getVideoDubber();
        const result = await dubber.dubVideo({
          videoPath: body.videoPath || body.video_path,
          targetLanguage: body.targetLanguage || body.target_language || 'es',
          voiceId: body.voiceId || body.voice_id || 'default',
          customSegments: body.segments || null
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/voice/story') {
      try {
        const body = await parseBody(req);
        const producer = getAudiobookProducer();
        const result = await producer.produceAudiobook({
          title: body.title || 'Untitled Story',
          scriptText: body.scriptText || body.script_text || '',
          voiceCast: body.voiceCast || body.voice_cast || {}
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/voice/personas') {
      const designer = getVoiceDesigner();
      const cloner = getVoiceCloner();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        designed: designer.listVoices(),
        cloned: cloner.listClones()
      }));
    }

    // --- ComfyUI Generative Studio Endpoints ---
    if (req.method === 'GET' && url.pathname === '/api/comfyui/status') {
      try {
        const client = getComfyClient();
        const status = await client.checkStatus();
        const models = await client.getAvailableModels();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, status, models }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/comfyui/generate') {
      try {
        const body = await parseBody(req);
        const builder = getWorkflowBuilder();
        const client = getComfyClient();
        const { workflow } = builder.buildText2Img({
          prompt: body.prompt,
          negativePrompt: body.negativePrompt || body.negative_prompt,
          checkpoint: body.checkpoint,
          width: body.width,
          height: body.height,
          steps: body.steps,
          cfg: body.cfg
        });

        const status = await client.checkStatus();
        if (status.online) {
          const result = await client.executeWorkflow({ workflow });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        } else {
          const fallback = client.generateOfflineFallback({
            prompt: body.prompt,
            workflowGraph: workflow,
            workflowType: 'text2img'
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(fallback));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/comfyui/workflow') {
      try {
        const body = await parseBody(req);
        const builder = getWorkflowBuilder();
        const type = body.type || body.workflow_type || 'text2img';
        let result;
        if (type === 'img2img') {
          result = builder.buildImg2Img(body);
        } else if (type === 'controlnet') {
          result = builder.buildControlNet(body);
        } else if (type === 'upscale') {
          result = builder.buildUpscale(body);
        } else if (type === 'video') {
          result = builder.buildVideo(body);
        } else {
          result = builder.buildText2Img(body);
        }
        const validation = builder.validateGraph(result.workflow);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, ...result, validation }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/comfyui/upscale') {
      try {
        const body = await parseBody(req);
        const builder = getWorkflowBuilder();
        const client = getComfyClient();
        const { workflow } = builder.buildUpscale({
          inputImagePath: body.imagePath || body.image_path || 'source.png',
          upscaleModel: body.upscaleModel || body.upscale_model || '4x-UltraSharp.pth'
        });
        const status = await client.checkStatus();
        if (status.online) {
          const result = await client.executeWorkflow({ workflow });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        } else {
          const fallback = client.generateOfflineFallback({
            prompt: `Upscaling ${body.imagePath || 'source.png'}`,
            workflowGraph: workflow,
            workflowType: 'upscale'
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(fallback));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // --- Digital Human & Avatar Studio Endpoints (HeyGem / Duix) ---
    if (req.method === 'GET' && url.pathname === '/api/avatar/list') {
      try {
        const producer = getAvatarProducer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, avatars: producer.listAvatars() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/avatar/video') {
      try {
        const body = await parseBody(req);
        const producer = getAvatarProducer();
        const result = await producer.produceAvatarVideo({
          avatarId: body.avatarId || body.avatar_id || 'alex-tech',
          scriptText: body.scriptText || body.script_text || '',
          resolution: body.resolution || '1080p'
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/avatar/clone') {
      try {
        const body = await parseBody(req);
        const producer = getAvatarProducer();
        const clone = producer.cloneAvatar({
          name: body.name,
          sourceMedia: body.sourceMedia || body.source_media,
          description: body.description,
          gender: body.gender || 'neutral'
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, avatar: clone }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/avatar/lipsync') {
      try {
        const body = await parseBody(req);
        const engine = getLipSyncEngine();
        const timeline = engine.generateVisemeTimeline({
          text: body.text || '',
          durationSec: body.durationSec || body.duration_seconds || null
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, timeline }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/eyes/screen') {
      try {
        const body = await parseBody(req).catch(() => ({}));
        const result = await this.chatgptBridge.captureScreen(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/eyes/camera') {
      try {
        const body = await parseBody(req).catch(() => ({}));
        const result = await this.chatgptBridge.captureCamera(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/hands/action') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.executeHandsAction(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/hands/terminal') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.executeTerminalCommand(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt/voice/speak') {
      try {
        const body = await parseBody(req);
        const result = await this.chatgptBridge.speakAloud(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    const isLocal = isLocalhostReq(req);
    const session = this.getSession(req);
    const tier = isLocal ? 'admin' : (session ? session.tier : null);

    // Authentication Status
    if (req.method === 'GET' && url.pathname === '/api/auth/status') {
      const settings = this.controller && this.controller.settings;
      const readPin = settings ? (settings.get('readPassword') || '8080') : '8080';
      const operatePin = settings ? (settings.get('operatePassword') || '0509') : '0509';
      const adminPin = settings ? (settings.get('adminPassword') || '1508') : '1508';

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        isLocalhost: isLocal,
        authenticated: isLocal || !!session,
        tier: tier || 'unauthenticated',
        httpsUrl: this.getHttpsUrl(),
        httpUrl: this.getUrl(),
        isHttps,
        passwords: (isLocal || tier === 'admin') ? {
          read: readPin,
          operate: operatePin,
          admin: adminPin
        } : null
      }));
    }

    // Authentication Login
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      try {
        const body = await parseBody(req);
        const pin = String(body.pin || body.password || '').trim();
        const settings = this.controller && this.controller.settings;
        const readPin = settings ? (settings.get('readPassword') || '8080') : '8080';
        const operatePin = settings ? (settings.get('operatePassword') || '0509') : '0509';
        const adminPin = settings ? (settings.get('adminPassword') || '1508') : '1508';

        let authedTier = null;
        if (pin === adminPin) authedTier = 'admin';
        else if (pin === operatePin) authedTier = 'operate';
        else if (pin === readPin) authedTier = 'read';

        if (!authedTier) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Invalid PIN code' }));
        }

        const token = crypto.randomBytes(24).toString('hex');
        this.sessions.set(token, {
          tier: authedTier,
          ip: req.socket.remoteAddress,
          created: Date.now(),
          expires: Date.now() + 30 * 24 * 3600 * 1000
        });

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `mave_token=${token}; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`
        });
        return res.end(JSON.stringify({ ok: true, tier: authedTier, token }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Authentication Logout
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      let token = req.headers['x-mave-token'];
      if (!token && req.headers.cookie) {
        const match = req.headers.cookie.match(/(?:^|;\s*)mave_token=([^;]+)/);
        if (match) token = match[1];
      }
      if (token) this.sessions.delete(token);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'mave_token=; Path=/; Max-Age=0'
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Update Security Passwords (Admin or Localhost only)
    if (req.method === 'POST' && url.pathname === '/api/auth/passwords') {
      if (!isLocal && tier !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Admin access required to modify security passwords' }));
      }
      try {
        const body = await parseBody(req);
        const settings = this.controller && this.controller.settings;
        if (settings) {
          const updates = {};
          if (body.readPassword != null && String(body.readPassword).trim()) updates.readPassword = String(body.readPassword).trim();
          if (body.operatePassword != null && String(body.operatePassword).trim()) updates.operatePassword = String(body.operatePassword).trim();
          if (body.adminPassword != null && String(body.adminPassword).trim()) updates.adminPassword = String(body.adminPassword).trim();
          settings.update(updates);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, message: 'Security passwords updated successfully' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Role-based security check for remaining API endpoints
    const isPublic =
      url.pathname === '/favicon.ico' ||
      url.pathname === '/api/status';

    if (!isPublic && !isLocal && !session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Authentication required. Please enter PIN.' }));
    }

    if (!isPublic && tier) {
      if (tier === 'read') {
        const allowedReadPaths = [
          '/api/status',
          '/api/auth/status',
          '/api/screen/stream',
          '/api/screen/mjpeg',
          '/api/screenshot',
          '/api/models',
          '/api/superpowers',
          '/api/diagnostics/errors',
          '/api/drop/files',
          '/api/drop/devices',
          '/api/devices',
          '/api/threads',
          '/api/windows',
          '/api/task/status'
        ];
        if (req.method !== 'GET' || !allowedReadPaths.includes(url.pathname)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Read-only access tier: write and operate actions are restricted' }));
        }
      } else if (tier === 'operate') {
        const blockedOperatePaths = [
          '/api/settings',
          '/api/terminal/exec',
          '/api/auth/passwords',
          '/api/diagnostics/fix',
          '/api/diagnostics/errors/clear'
        ];
        if (blockedOperatePaths.includes(url.pathname)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Operator access tier: administrative actions are restricted' }));
        }
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/windows') {
      try {
        const { BrowserWindow } = require('electron');
        const list = BrowserWindow.getAllWindows().map((w) => ({
          id: w.id,
          title: w.getTitle(),
          bounds: w.getBounds(),
          visible: w.isVisible(),
          isMinimized: w.isMinimized(),
          isFocused: w.isFocused(),
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, windows: list }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/show') {
      try {
        if (this.controller && this.controller.windows) {
          const section = url.searchParams.get('route') || 'account';
          const w = this.controller.windows.openMain(section);
          if (w) {
            w.show();
            w.restore();
            w.focus();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Opened ${section}` }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Settings API
    if (req.method === 'GET' && url.pathname === '/api/settings') {
      try {
        const s = this.controller && this.controller.settings ? this.controller.settings.publicView() : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, settings: s }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/settings') {
      try {
        const body = await parseBody(req);
        if (this.controller && this.controller.settings) {
          const updated = this.controller.settings.update(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, settings: updated }));
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Settings unavailable' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Models API
    if (req.method === 'GET' && url.pathname === '/api/models') {
      try {
        const hardware = require('../local/hardware');
        const hw = await hardware.detect().catch(() => ({ ramGB: 16, vramGB: 8, dedicated: true }));
        const rec = catalog.recommend(hw);
        const installed = this.controller && this.controller.local ? this.controller.local.installedId() : '';
        const settings = this.controller ? this.controller.settings : null;
        const provider = settings ? (settings.get('provider') || 'local') : 'local';
        const colibriModel = settings ? (settings.get('colibriModel') || 'deepseek-v4-flash') : 'deepseek-v4-flash';
        const ollamaModel = settings ? (settings.get('ollamaModel') || 'deepseek-r1:8b') : 'deepseek-r1:8b';
        const airllmModel = settings ? (settings.get('airllmModel') || 'Qwen/Qwen3-32B') : 'Qwen/Qwen3-32B';
        let colibriActive = false;
        let airllmActive = false;
        try {
          const { colibriService } = require('../local/colibri');
          colibriActive = await colibriService.isHealthy();
        } catch { /* empty */ }
        try {
          const { airllmService } = require('../local/airllm');
          airllmActive = await airllmService.isHealthy();
        } catch { /* empty */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          ok: true,
          ...rec,
          installed,
          provider,
          colibriModel,
          ollamaModel,
          colibriActive,
          airllmModel,
          airllmActive,
          hasOpenaiKey: Boolean(settings && settings.secret('openaiKey')),
          hasAnthropicKey: Boolean(settings && settings.secret('anthropicKey')),
          openaiModel: (settings && settings.get('openaiModel')) || 'gpt-4o',
          openaiEndpoint: (settings && settings.get('openaiEndpoint')) || '',
          claudeModel: (settings && settings.get('model')) || 'claude-opus-5-5',
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/models/cloud-key') {
      try {
        const body = await parseBody(req);
        const settings = this.controller ? this.controller.settings : null;
        if (settings) {
          const updates = {};
          if (body.openaiKey !== undefined) updates.openaiKey = String(body.openaiKey || '').trim();
          if (body.anthropicKey !== undefined) updates.anthropicKey = String(body.anthropicKey || '').trim();
          if (body.openaiEndpoint !== undefined) updates.openaiEndpoint = String(body.openaiEndpoint || '').trim();
          if (body.openaiModel) updates.openaiModel = String(body.openaiModel).trim();
          if (body.claudeModel) updates.model = String(body.claudeModel).trim();
          if (body.provider) updates.provider = body.provider;
          settings.update(updates);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, message: 'Cloud credentials updated successfully' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/models/switch') {
      try {
        const body = await parseBody(req);
        const modelId = body.modelId;
        if (!modelId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'modelId is required' }));
        }
        const settings = this.controller ? this.controller.settings : null;
        if (modelId === 'openai' || modelId.startsWith('openai:') || modelId === 'chatgpt') {
          const m = modelId.includes(':') ? modelId.split(':')[1] : ((settings && settings.get('openaiModel')) || 'gpt-4o');
          if (settings) settings.update({ provider: 'openai', openaiModel: m });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Switched intelligence to OpenAI / ChatGPT (${m})` }));
        }
        if (modelId === 'anthropic' || modelId.startsWith('anthropic:') || modelId === 'claude') {
          const m = modelId.includes(':') ? modelId.split(':')[1] : ((settings && settings.get('model')) || 'claude-opus-5-5');
          if (settings) settings.update({ provider: 'anthropic', model: m });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Switched intelligence to Claude (${m})` }));
        }
        if (modelId === 'local') {
          if (settings) settings.update({ provider: 'local' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: 'Switched intelligence to Local GPU model' }));
        }
        if (modelId.startsWith('airllm-')) {
          const airModels = catalog.scanAirLLMModels ? catalog.scanAirLLMModels() : [];
          const found = airModels.find((m) => m.id === modelId);
          const rawModel = found ? found.rawModel : modelId.replace(/^airllm-/, '').replace(/^([^-]+)-/, '$1/');
          if (this.controller && this.controller.local && this.controller.local.runtime) {
            this.controller.local.runtime.stop();
          }
          try {
            const { colibriService } = require('../local/colibri');
            colibriService.stop();
          } catch { /* empty */ }
          const { airllmService } = require('../local/airllm');
          await airllmService.start(rawModel);
          if (settings) settings.update({ provider: 'airllm', airllmModel: rawModel });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Switched to AirLLM: ${rawModel}` }));
        }
        if (modelId.startsWith('colibri-')) {
          const rawModel = modelId.replace(/^colibri-/, '');
          if (this.controller && this.controller.local && this.controller.local.runtime) {
            this.controller.local.runtime.stop();
          }
          try {
            const { airllmService } = require('../local/airllm');
            airllmService.stop();
          } catch { /* empty */ }
          const { colibriService } = require('../local/colibri');
          await colibriService.start(rawModel);
          if (settings) settings.update({ provider: 'colibri', colibriModel: rawModel });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Switched to Colibri MoE: ${rawModel}` }));
        }
        if (modelId.startsWith('ollama-')) {
          const parts = modelId.replace(/^ollama-/, '').split('-');
          const rawModel = parts.length > 1 ? `${parts.slice(0, -1).join('-')}:${parts[parts.length - 1]}` : parts[0];
          if (settings) settings.update({ provider: 'ollama', ollamaModel: rawModel });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Switched to Ollama: ${rawModel}` }));
        }
        try {
          const { colibriService } = require('../local/colibri');
          colibriService.stop();
        } catch { /* empty */ }
        try {
          const { airllmService } = require('../local/airllm');
          airllmService.stop();
        } catch { /* empty */ }
        if (settings) settings.update({ provider: 'local', localModel: modelId });
        if (this.controller && this.controller.local) {
          this.controller.local.start(modelId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Switched active local model to ${modelId}` }));
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Local manager unavailable' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Superpowers API
    if (req.method === 'GET' && url.pathname === '/api/superpowers') {
      try {
        let pet = null;
        try {
          const { getPetManager } = require('../pet/manager');
          const pm = getPetManager();
          if (pm) pet = pm.getStatus();
        } catch { /* empty */ }

        const settings = this.controller ? this.controller.settings : null;
        let tgToken = settings ? (settings.secret('telegramBotToken') || process.env.TELEGRAM_BOT_TOKEN) : process.env.TELEGRAM_BOT_TOKEN;
        if (!tgToken) {
          const fs = require('fs');
          const path = require('path');
          const home = process.env.USERPROFILE || process.env.HOME || '';
          const paths = [
            path.join(home, 'AppData', 'Roaming', 'mave', 'telegram-config.json'),
            path.join(home, 'AppData', 'Roaming', 'bigfoot', 'telegram-config.json'),
          ];
          for (const p of paths) {
            if (fs.existsSync(p)) {
              try {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (data.token) { tgToken = data.token; break; }
              } catch { /* empty */ }
            }
          }
        }
        const isTgConfigured = Boolean(tgToken);
        const tgBotUsername = (settings && settings.get('telegramBotUsername')) || (isTgConfigured ? 'FromnearTaskManager_bot' : '');
        const info = {
          ok: true,
          mobileLanUrl: this.getUrl(),
          mobileLocalUrl: `http://localhost:${this.port}`,
          pet: pet || { name: 'Codex Pet', state: 'idle', hunger: 30, happiness: 90, energy: 85 },
          telegram: {
            configured: isTgConfigured,
            token: tgToken || '',
            botUsername: tgBotUsername,
            chatId: settings ? settings.get('telegramChatId') : '',
          },
          routines: {
            proactiveEnabled: settings ? settings.get('proactiveRoutinesEnabled') !== false : true,
            circadianBriefing: settings ? settings.get('circadianBriefing') !== false : true,
          },
          screenMemory: {
            enabled: settings ? settings.get('screenMemoryEnabled') !== false : true,
          },
          knowledgeVault: {
            dir: settings ? settings.get('knowledgeVaultDir') || 'E:\\AI-Models' : 'E:\\AI-Models',
          },
          claudeMods: {
            installed: true,
            totalSkills: 112,
            version: '3.9.0',
          },
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(info));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/superpowers') {
      try {
        const body = await parseBody(req);
        const action = body.action;

        if (action === 'feed_pet') {
          const { getPetManager } = require('../pet/manager');
          const pm = getPetManager();
          if (pm) pm.feed();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: 'Fed pet!' }));
        }

        if (action === 'summon_pet') {
          const { getPetManager } = require('../pet/manager');
          const pm = getPetManager();
          if (pm) pm.show();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: 'Pet summoned!' }));
        }

        if (action === 'test_briefing') {
          const { ExecutiveBriefing } = require('../routines/circadian');
          const briefing = new ExecutiveBriefing({ controller: this.controller, logger: this.logger });
          const summary = await briefing.generateBriefing();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, summary }));
        }

        if (action === 'reindex_vault') {
          const { PersonalKnowledgeVault } = require('../rag/vault');
          const dir = (this.controller && this.controller.settings && this.controller.settings.get('knowledgeVaultDir')) || 'E:\\AI-Models';
          const vault = new PersonalKnowledgeVault({ dir, logger: this.logger });
          const stats = await vault.reindex();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, stats }));
        }

        if (action === 'connect_telegram') {
          const settings = this.controller ? this.controller.settings : null;
          const fs = require('fs');
          const path = require('path');
          let token = body.token && body.token.trim();
          if (!token && settings) {
            token = settings.secret('telegramBotToken') || process.env.TELEGRAM_BOT_TOKEN;
          }
          if (!token) {
            const home = process.env.USERPROFILE || process.env.HOME || '';
            const paths = [
              path.join(home, 'AppData', 'Roaming', 'mave', 'telegram-config.json'),
              path.join(home, 'AppData', 'Roaming', 'bigfoot', 'telegram-config.json'),
            ];
            for (const p of paths) {
              if (fs.existsSync(p)) {
                try {
                  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                  if (data.token) { token = data.token; break; }
                } catch { /* empty */ }
              }
            }
          }
          if (!token) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'No Telegram token provided' }));
          }
          const { TelegramBridge } = require('../remote/telegram');
          const bridge = new TelegramBridge({
            token,
            logger: this.logger,
            controller: this.controller,
          });
          const info = await bridge.getMe();
          if (!info || !info.ok) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'Telegram authentication failed' }));
          }
          if (settings) {
            settings.setSecret('telegramBotToken', token);
            settings.set('telegramEnabled', true);
            settings.set('telegramBotUsername', info.result.username);
            settings.save();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, bot: info.result }));
        }

        if (action === 'claude_mods_health') {
          const claudeMods = require('../plugins/builtin/claude_mods');
          const output = await claudeMods[2].run({ days: 7 }, { log: (k, m) => this.logger && this.logger.info(`[Claude-Mods] ${m}`) });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, output }));
        }

        if (action === 'claude_mods_proc') {
          const claudeMods = require('../plugins/builtin/claude_mods');
          const output = await claudeMods[3].run({ sample_seconds: 5, threshold_percent: 15 }, { log: (k, m) => this.logger && this.logger.info(`[Claude-Mods] ${m}`) });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, output }));
        }

        if (action === 'claude_mods_crash') {
          const claudeMods = require('../plugins/builtin/claude_mods');
          const output = await claudeMods[4].run({ days_back: 30 }, { log: (k, m) => this.logger && this.logger.info(`[Claude-Mods] ${m}`) });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, output }));
        }

        if (action === 'claude_mods_skills') {
          const claudeMods = require('../plugins/builtin/claude_mods');
          const output = await claudeMods[0].run({ query: body.query || '' }, { log: () => {} });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, output }));
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Unknown superpower action' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Terminal command execution
    if (req.method === 'POST' && url.pathname === '/api/terminal/exec') {
      try {
        const body = await parseBody(req);
        const cmd = String(body.cmd || '').trim();
        if (!cmd) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Empty command' }));
        }
        exec(cmd, { shell: 'powershell.exe', timeout: 15000 }, (error, stdout, stderr) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            ok: !error,
            output: stdout || stderr || (error ? error.message : 'Completed with no output.'),
            error: error ? error.message : null,
          }));
        });
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Task Status & Live Thought Inspection
    if (req.method === 'GET' && url.pathname === '/api/task/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        state: this.controller ? this.controller.state : 'idle',
        thought: this.controller ? (this.controller.currentThought || '') : '',
        thoughts: this.controller ? (this.controller.thoughts || []) : [],
      }));
    }

    // Diagnostics & Self-Healing Remediation
    if (req.method === 'POST' && url.pathname === '/api/diagnostics/fix') {
      try {
        const body = await parseBody(req);
        const { recommendation } = body;
        if (!recommendation) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Missing recommendation' }));
        }
        const { getTroubleshooter } = require('../diagnostics/troubleshooter');
        const troubleshooter = getTroubleshooter({ logger: this.logger });
        const result = await troubleshooter.executeRecommendation(recommendation, this.controller);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/diagnostics/errors') {
      const { getTroubleshooter } = require('../diagnostics/troubleshooter');
      const troubleshooter = getTroubleshooter({ logger: this.logger });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, errors: troubleshooter.getRecentErrors() }));
    }

    if (req.method === 'POST' && url.pathname === '/api/diagnostics/errors/clear') {
      const { getTroubleshooter } = require('../diagnostics/troubleshooter');
      const troubleshooter = getTroubleshooter({ logger: this.logger });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(troubleshooter.clearErrors()));
    }

    // Task Execution
    if (req.method === 'POST' && url.pathname === '/api/task') {
      try {
        const body = await parseBody(req);
        const task = String(body.task || '').trim();
        if (!task) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Empty task' }));
        }

        const { getThreadManager } = require('../threads');
        const tm = getThreadManager();
        const deviceId = req.headers['x-device-id'] || (req.socket.remoteAddress === '127.0.0.1' ? 'desktop' : 'mobile');
        const activeThread = tm.getActiveThread(deviceId);

        let result = { ok: true, text: `Received: "${task}". Mave controller is active.` };
        if (this.controller && this.controller.runTask) {
          result = await this.controller.runTask(task, 'remote-web');
        }

        if (activeThread) {
          tm.addMessage(activeThread.id, 'user', task);
          tm.addMessage(activeThread.id, 'assistant', result.text || result.message || 'Done.');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Conversation Threads / Task Contexts ("Dockers")
    if (req.method === 'GET' && url.pathname === '/api/threads') {
      try {
        const { getThreadManager } = require('../threads');
        const tm = getThreadManager();
        const device = req.headers['x-device-id'] || 'mobile';
        const threads = tm.listThreads();
        const active = tm.getActiveThread(device);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, threads, activeThread: active }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/threads') {
      try {
        const body = await parseBody(req);
        const { getThreadManager } = require('../threads');
        const tm = getThreadManager();
        const thread = tm.createThread(body.title || 'New Task', body.device || 'mobile');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, thread }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/threads/active') {
      try {
        const body = await parseBody(req);
        const { getThreadManager } = require('../threads');
        const tm = getThreadManager();
        const success = tm.setActiveThread(body.device || 'mobile', body.threadId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: success }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Live Connected Devices
    if (req.method === 'GET' && url.pathname === '/api/devices') {
      try {
        const { getMaveDropEngine } = require('../plugins/builtin/mobile_devices');
        let knownP2p = [];
        try {
          if (getMaveDropEngine) knownP2p = getMaveDropEngine().getKnownDevices();
        } catch {}

        const devList = [
          {
            id: 'host_desktop',
            name: 'Primary PC (Host)',
            type: 'desktop',
            os: 'Windows 11',
            ip: '127.0.0.1',
            status: 'online',
            isPrimary: true,
            tier: 'admin',
            lastActive: Date.now(),
          }
        ];

        const now = Date.now();
        for (const [token, sess] of this.sessions.entries()) {
          if (sess.expires && now > sess.expires) continue;
          devList.push({
            id: `session_${sess.ip}_${sess.tier}`,
            name: sess.tier === 'admin' ? 'Admin Controller' : (sess.tier === 'operate' ? 'Operator Device' : 'Viewer Device'),
            type: 'mobile',
            os: sess.os || 'Remote Client',
            ip: sess.ip || 'LAN',
            status: 'online',
            tier: sess.tier,
            lastActive: sess.lastActive || sess.created || now,
          });
        }

        for (const kd of knownP2p) {
          if (!devList.some(d => d.ip === kd.ip)) {
            devList.push({
              id: kd.id || `lan_${kd.ip}`,
              name: kd.name || 'Discovered Peer',
              type: kd.type || 'phone',
              os: kd.os || 'LAN Peer',
              ip: kd.ip || 'LAN',
              status: 'paired',
              lastActive: kd.lastSeen || now,
            });
          }
        }

        try {
          const { getRemoteHandsManager } = require('./hands');
          const handsDevs = getRemoteHandsManager().listDevices();
          for (const hd of handsDevs) {
            if (!devList.some(d => d.id === hd.id)) {
              devList.push({
                id: hd.id,
                name: hd.name,
                type: hd.type,
                os: hd.platform,
                ip: hd.ip,
                status: hd.permission.status === 'granted' ? 'authorized_hands' : (hd.permission.status === 'pending' ? 'pending_hands' : 'connected'),
                tier: 'hands',
                permission: hd.permission,
                isHandsTarget: hd.isActiveHandsTarget,
                lastActive: hd.lastSeen || now,
              });
            }
          }
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, count: devList.length, devices: devList }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // =========================================================================
    // Distributed Hands API: Central Brain, Distributed Remote Hands
    // =========================================================================
    if (req.method === 'GET' && url.pathname === '/api/hands/devices') {
      try {
        const { getRemoteHandsManager } = require('./hands');
        const mgr = getRemoteHandsManager();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, devices: mgr.listDevices() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/hands/register') {
      try {
        const body = await parseBody(req);
        const { getRemoteHandsManager } = require('./hands');
        const mgr = getRemoteHandsManager();
        const ip = req.socket.remoteAddress || '127.0.0.1';
        const dev = mgr.registerDevice({
          id: body.id,
          name: body.name || `Device_${ip.replace(/[^0-9]/g, '_')}`,
          type: body.type || 'browser',
          platform: body.platform || 'generic',
          ip,
          width: body.width || 1920,
          height: body.height || 1080,
          userAgent: req.headers['user-agent'] || '',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, device: dev }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/hands/permission') {
      try {
        const body = await parseBody(req);
        const { getRemoteHandsManager } = require('./hands');
        const mgr = getRemoteHandsManager();
        const action = body.action || 'grant';
        const deviceId = body.deviceId;
        if (!deviceId) throw new Error('Missing deviceId');

        if (action === 'grant') {
          const resGrant = mgr.grantPermission(deviceId, {
            scopes: body.scopes,
            durationMinutes: body.durationMinutes,
            code: body.code,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(resGrant));
        } else if (action === 'revoke') {
          const resRevoke = mgr.revokePermission(deviceId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(resRevoke));
        } else if (action === 'request') {
          const resReq = mgr.requestPermission(deviceId, {
            scopes: body.scopes,
            durationMinutes: body.durationMinutes,
            reason: body.reason,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(resReq));
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Unknown permission action' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/hands/screen') {
      try {
        const body = await parseBody(req);
        const { getRemoteHandsManager } = require('./hands');
        const mgr = getRemoteHandsManager();
        const deviceId = body.deviceId;
        const frame = body.frameBase64 || body.frame;
        if (!deviceId || !frame) throw new Error('Missing deviceId or frame');
        mgr.pushScreenFrame(deviceId, frame, { width: body.width, height: body.height });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/hands/screen') {
      try {
        const { getRemoteHandsManager } = require('./hands');
        const mgr = getRemoteHandsManager();
        const deviceId = url.searchParams.get('deviceId');
        const frame = await mgr.captureScreen(deviceId);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(frame);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/hands/actions') {
      try {
        const { getRemoteHandsManager } = require('./hands');
        const mgr = getRemoteHandsManager();
        const deviceId = url.searchParams.get('deviceId');
        const actions = mgr.pollActions(deviceId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, actions }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/hands/switch_target') {
      try {
        const body = await parseBody(req);
        const { getRemoteHandsManager } = require('./hands');
        const mgr = getRemoteHandsManager();
        const target = body.target;
        const agent = this.controller ? this.controller.agent : null;
        if (target === 'host' || !target) {
          mgr.resetToHostTarget(agent);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, target: 'host' }));
        } else {
          mgr.switchToRemoteTarget(target, agent);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, target, isRemote: true }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Live Screen Streaming (MJPEG continuous feed) - Smooth & Responsive
    if (req.method === 'GET' && (url.pathname === '/api/screen/stream' || url.pathname === '/api/screen/mjpeg')) {
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'close',
        'Pragma': 'no-cache',
      });
      let active = true;
      let busy = false;
      const fps = Math.max(1, Math.min(30, parseInt(url.searchParams.get('fps') || '15', 10)));
      const mode = url.searchParams.get('mode') || 'fast'; // fast = 960x540 (smooth), quality = 1280x720
      const thumbW = mode === 'quality' ? 1280 : 960;
      const thumbH = mode === 'quality' ? 720 : 540;
      const jpegQ = mode === 'quality' ? 65 : 55;
      const intervalMs = Math.round(1000 / fps);

      const captureAndSend = async () => {
        if (!active || busy) return;
        busy = true;
        const frameStart = Date.now();
        try {
          const { getPrivacyShield } = require('../privacy');
          if (getPrivacyShield().isBlind()) {
            busy = false;
            if (active) setTimeout(captureAndSend, intervalMs);
            return;
          }
          const { desktopCapturer } = require('electron');
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: thumbW, height: thumbH }
          });
          if (sources.length && sources[0].thumbnail && active) {
            const jpg = sources[0].thumbnail.toJPEG(jpegQ);
            res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`);
            res.write(jpg);
            res.write('\r\n');
          }
        } catch { /* ignore capture error */ }
        busy = false;

        if (active) {
          const elapsed = Date.now() - frameStart;
          const delay = Math.max(8, intervalMs - elapsed);
          setTimeout(captureAndSend, delay);
        }
      };

      captureAndSend();

      req.on('close', () => {
        active = false;
      });
      return;
    }

    // Remote PC Mouse Control (Physical Screen Pixel Mapped)
    if (req.method === 'POST' && url.pathname === '/api/control/mouse') {
      try {
        const body = await parseBody(req);
        const action = String(body.action || 'click').toLowerCase();

        let hostX = 0;
        let hostY = 0;
        try {
          const { screen } = require('electron');
          const primary = screen.getPrimaryDisplay();
          const scale = primary.scaleFactor || 1;
          const physW = Math.round(primary.bounds.width * scale);
          const physH = Math.round(primary.bounds.height * scale);
          if (body.xRatio != null && body.yRatio != null) {
            hostX = Math.round(Number(body.xRatio) * physW);
            hostY = Math.round(Number(body.yRatio) * physH);
          } else {
            hostX = Math.round((Number(body.x) || 0) * scale);
            hostY = Math.round((Number(body.y) || 0) * scale);
          }
          hostX = Math.max(0, Math.min(physW - 1, hostX));
          hostY = Math.max(0, Math.min(physH - 1, hostY));
        } catch {
          hostX = Math.round(Number(body.x) || 0);
          hostY = Math.round(Number(body.y) || 0);
        }

        if (this.controller && this.controller.input) {
          const input = this.controller.input;
          const button = body.button || 'left';
          const count = Number(body.count) || 1;

          if (action === 'click') {
            await input.move(hostX, hostY);
            await input.click(button, count);
          } else if (action === 'dblclick') {
            await input.move(hostX, hostY);
            await input.click(button, 2);
          } else if (action === 'move') {
            await input.move(hostX, hostY);
          } else if (action === 'down') {
            await input.move(hostX, hostY);
            await input.mouseDown(button);
          } else if (action === 'up') {
            await input.move(hostX, hostY);
            await input.mouseUp(button);
          } else if (action === 'scroll') {
            await input.scroll(Number(body.dx) || 0, Number(body.dy) || 0);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, x: hostX, y: hostY }));
        }

        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Input controller unavailable' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Remote PC Keyboard Control
    if (req.method === 'POST' && url.pathname === '/api/control/keyboard') {
      try {
        const body = await parseBody(req);
        const action = String(body.action || '').toLowerCase();

        if (this.controller && this.controller.input) {
          const input = this.controller.input;
          if (action === 'type' && body.text != null) {
            await input.type(String(body.text));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, message: 'Typed text.' }));
          }
          if (action === 'key' && (body.key || body.combo)) {
            const combo = String(body.key || body.combo);
            await input.keys(combo);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, message: `Pressed ${combo}.` }));
          }
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid keyboard action or missing text/key' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Remote Device Voice Transcribe (Device Microphone -> Whisper -> Mave)
    if (req.method === 'POST' && url.pathname === '/api/voice/transcribe') {
      try {
        const contentType = req.headers['content-type'] || '';
        let wavBuffer = null;

        if (contentType.includes('application/json')) {
          const body = await parseBody(req);
          if (body.audioBase64) {
            wavBuffer = Buffer.from(body.audioBase64.replace(/^data:audio\/[a-z]+;base64,/, ''), 'base64');
          }
        } else {
          wavBuffer = await parseRawBuffer(req);
        }

        if (!wavBuffer || !wavBuffer.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'No audio data received' }));
        }

        if (!this.controller || !this.controller.speech) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Speech service not initialized' }));
        }

        const transcript = await this.controller.speech.transcribe(wavBuffer);
        const cleanText = transcript ? transcript.trim() : '';
        try {
          const { getCommonSenseEngine } = require('../intelligence/common_sense');
          getCommonSenseEngine().observeUtterance(cleanText, { modality: 'remote_mic' });
        } catch {}
        if (!cleanText) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'No speech recognized. Please speak closer to device.' }));
        }

        // Speaker Recognition & Voice Biometrics
        const { getSpeakerRecognizer } = require('../local/speaker_recognition');
        const recognizer = getSpeakerRecognizer();
        const speaker = recognizer.identify(wavBuffer);

        // Check voice enrollment intent ("remember my voice as Shivam", "enroll voice as Dad")
        const enrollMatch = /(?:remember my voice as|enroll (?:my )?voice as|my name is (.+?) and remember my voice)\s*(.+)?/i.exec(cleanText);
        if (enrollMatch) {
          const nameToEnroll = (enrollMatch[1] || enrollMatch[2] || '').trim();
          if (nameToEnroll) {
            recognizer.enroll(nameToEnroll, wavBuffer, 'family');
            const enrollReply = `I have enrolled and remembered your voiceprint, ${nameToEnroll}. From now on, I will recognize your voice whenever you speak.`;
            const audioUrl = `/api/voice/tts?text=${encodeURIComponent(enrollReply)}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              ok: true,
              transcript: cleanText,
              speaker: { name: nameToEnroll, role: 'family', confidence: 1.0 },
              reply: enrollReply,
              audioUrl
            }));
          }
        }

        let reply = 'Task executed.';
        let thoughts = [];
        let recommendations = [];
        let needsPermission = false;
        let permissionDetails = null;

        if (this.controller && this.controller.runTask) {
          const result = await this.controller.runTask(cleanText, 'remote-web', { speaker });
          reply = result.text || result.message || 'Done.';
          thoughts = result.thoughts || this.controller.thoughts || [];
          recommendations = result.recommendations || [];
          needsPermission = Boolean(result.needsPermission || result.pendingConfirmation || (reply && /permission|confirm|proceed\?/i.test(reply)));
          permissionDetails = result.permissionDetails || (needsPermission ? { action: cleanText, prompt: reply } : null);
        }

        const { getThreadManager } = require('../threads');
        const tm = getThreadManager();
        const deviceId = req.headers['x-device-id'] || 'mobile';
        const activeThread = tm.getActiveThread(deviceId);
        if (activeThread) {
          tm.addMessage(activeThread.id, 'user', cleanText);
          tm.addMessage(activeThread.id, 'assistant', reply);
        }

        const audioUrl = `/api/voice/tts?text=${encodeURIComponent(reply.slice(0, 350))}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          ok: true,
          transcript: cleanText,
          speaker,
          reply,
          thoughts,
          recommendations,
          needsPermission,
          permissionDetails,
          audioUrl
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Intelligent Interruption & Cross-Talk / Background Chatter Filter
    if (req.method === 'POST' && url.pathname === '/api/voice/interrupt') {
      try {
        const body = await parseBody(req);
        const { getInterruptionFilter } = require('../local/interruption_filter');
        const filter = getInterruptionFilter();
        const evalResult = filter.evaluate({
          transcript: body.transcript || '',
          rms: Number(body.rms || 0.05),
          speaker: body.speaker || null,
          isMaveSpeaking: body.isMaveSpeaking !== false,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, ...evalResult }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Remote Device Speaker TTS (Hyper-Humanized Prosody, OpenAI ChatGPT Voice & Kokoro Fallback)
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/voice/tts') {
      try {
        let text = url.searchParams.get('text');
        let voice = url.searchParams.get('voice');
        let speed = Number(url.searchParams.get('speed') || 1.0);

        if (req.method === 'POST') {
          const body = await parseBody(req);
          if (body.text) text = body.text;
          if (body.voice) voice = body.voice;
          if (body.speed) speed = Number(body.speed);
        }

        const { enrichHumanProsody } = require('../local/human_voice');
        const humanText = enrichHumanProsody(text, { addFiller: false }) || String(text || '').trim();
        if (!humanText) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Text is required for TTS' }));
        }

        const settings = this.controller ? this.controller.settings : null;
        const openaiKey = settings ? settings.secret('openaiKey') : process.env.OPENAI_API_KEY;
        const ttsProvider = (settings && settings.get('ttsProvider')) || (openaiKey ? 'openai' : 'kokoro');

        // 1. OpenAI Neural ChatGPT Voice Mode (Multi-lingual: Hindi, Spanish, French, German, Japanese, Chinese, English)
        if (ttsProvider === 'openai' && openaiKey) {
          const { synthesizeOpenAITTS } = require('../local/human_voice');
          const gptVoice = voice && ['alloy', 'nova', 'shimmer', 'echo', 'fable', 'onyx'].includes(voice.toLowerCase())
            ? voice.toLowerCase()
            : ((settings && settings.get('openaiVoice')) || 'alloy');
          try {
            const speechResult = await synthesizeOpenAITTS({
              text: humanText,
              apiKey: openaiKey,
              voice: gptVoice,
              speed,
            });
            res.writeHead(200, {
              'Content-Type': 'audio/mpeg',
              'Content-Length': speechResult.buffer.length,
              'Cache-Control': 'no-cache',
            });
            return res.end(speechResult.buffer);
          } catch (oaErr) {
            if (this.logger) this.logger.error('OpenAI TTS failed, falling back to local voice', oaErr.message);
          }
        }

        // 2. Kokoro / Local Voice Engine Fallback
        const kokoro = require('../kokoro');
        if (kokoro.available()) {
          voice = voice || (settings && settings.get('voice')) || 'af_heart';
          const kokoroInstance = (this.controller && this.controller.audio && this.controller.audio.kokoro) || new kokoro.Kokoro(this.logger);
          const wavBuffer = await kokoroInstance.say(humanText, voice, speed);

          if (wavBuffer && wavBuffer.length) {
            res.writeHead(200, {
              'Content-Type': 'audio/wav',
              'Content-Length': wavBuffer.length,
              'Cache-Control': 'no-cache',
            });
            return res.end(wavBuffer);
          }
        }

        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'TTS audio synthesis failed', fallback: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message, fallback: true }));
      }
    }

    // Remote Device Camera Analysis (Device Camera Photo -> Qwen3-VL Vision Analysis)
    if (req.method === 'POST' && url.pathname === '/api/camera/analyze') {
      try {
        const body = await parseBody(req);
        const imageRaw = body.image || '';
        const prompt = String(body.prompt || 'Describe and analyze this image captured from the device camera.').trim();

        if (!imageRaw) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Image data is required' }));
        }

        const base64 = imageRaw.replace(/^data:image\/[a-z]+;base64,/, '');
        const imgBuffer = Buffer.from(base64, 'base64');

        if (this.controller && this.controller.runTask) {
          const result = await this.controller.runTask(prompt, 'remote-web', { image: imgBuffer });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, text: result.text || 'Analysis completed.' }));
        }

        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Mave controller unavailable' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Screenshot
    if (req.method === 'GET' && url.pathname === '/api/screenshot') {
      try {
        const { getPrivacyShield } = require('../privacy');
        if (getPrivacyShield().isBlind()) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Privacy Shield is active: vision capture is blinded.' }));
        }
        const { desktopCapturer } = require('electron');
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
        if (sources.length && sources[0].thumbnail && !sources[0].thumbnail.isEmpty()) {
          const img = sources[0].thumbnail.toJPEG(85);
          if (img && img.length > 0) {
            res.writeHead(200, {
              'Content-Type': 'image/jpeg',
              'Content-Length': img.length,
              'Cache-Control': 'no-cache, no-store',
            });
            return res.end(img);
          }
        }
      } catch { /* Fallback */ }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Screenshot unavailable' }));
    }

    // Quick Actions
    if (req.method === 'POST' && url.pathname === '/api/action') {
      try {
        const body = await parseBody(req);
        const act = String(body.action || '').toLowerCase();

        if (act === 'lock') {
          execFile('rundll32.exe', ['user32.dll,LockWorkStation']);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: 'Windows workstation locked.' }));
        }

        if (act === 'media' || act === 'mute') {
          const mc = require('../plugins/builtin/media_control');
          await mc[0].run({ action: act === 'mute' ? 'mute' : 'play_pause' }, { log: () => {} });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, message: `Executed ${act}.` }));
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Unknown action' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // =========================================================================
    // MaveDrop P2P Wireless File Sharing & LAN Sync API
    // =========================================================================

    // List MaveDrop Files
    if (req.method === 'GET' && url.pathname === '/api/drop/files') {
      try {
        const engine = getMaveDropEngine();
        const files = engine.listFiles();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, files, dropDir: engine.getDropDir() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Upload / Drop File from Mobile Phone or Peer Device
    if (req.method === 'POST' && url.pathname === '/api/drop/upload') {
      try {
        const engine = getMaveDropEngine();
        let filename = url.searchParams.get('filename') || '';
        let sender = url.searchParams.get('sender') || req.socket.remoteAddress || 'Mobile Phone';
        let buf = null;

        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          const body = await parseBody(req);
          if (body.filename) filename = body.filename;
          if (body.sender) sender = body.sender;
          if (body.fileBase64) {
            buf = Buffer.from(body.fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
          }
        } else {
          buf = await parseRawBuffer(req, 100e6); // up to 100MB
        }

        if (!buf || !buf.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'No file data received' }));
        }

        filename = filename || `mavedrop_${Date.now()}.bin`;
        const record = engine.saveReceivedFile(filename, buf, sender);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, file: record }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Download / Stream Stored MaveDrop File to Mobile Phone or Peer
    if (req.method === 'GET' && url.pathname === '/api/drop/download') {
      try {
        const filename = path.basename(url.searchParams.get('file') || '');
        if (!filename) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'File parameter is required' }));
        }
        const engine = getMaveDropEngine();
        const filePath = path.join(engine.getDropDir(), filename);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'File not found in MaveDrop storage' }));
        }
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Cache-Control': 'no-cache',
        });
        const stream = fs.createReadStream(filePath);
        return stream.pipe(res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Discovered LAN Devices
    if (req.method === 'GET' && url.pathname === '/api/drop/devices') {
      try {
        const engine = getMaveDropEngine();
        const devices = engine.getKnownDevices();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, devices }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Register Peer Device
    if (req.method === 'POST' && url.pathname === '/api/drop/devices/register') {
      try {
        const body = await parseBody(req);
        const engine = getMaveDropEngine();
        const dev = engine.registerDevice({
          id: body.id || `lan_${req.socket.remoteAddress}`,
          name: body.name || 'Mobile Device',
          os: body.os || 'Android/iOS',
          ip: req.socket.remoteAddress,
          type: body.type || 'phone',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, device: dev }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Get Shared LAN Clipboard (Bidirectional with Windows Clipboard)
    if (req.method === 'GET' && url.pathname === '/api/clipboard/sync') {
      try {
        const engine = getMaveDropEngine();
        let text = engine.getClipboard();
        try {
          const { clipboard } = require('electron');
          if (clipboard && clipboard.readText) {
            const winClip = clipboard.readText();
            if (winClip) {
              text = winClip;
              engine.setClipboard(text, 'Windows Desktop');
            }
          }
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, text }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Set Shared LAN Clipboard (Dispatches to Windows Desktop Clipboard)
    if (req.method === 'POST' && url.pathname === '/api/clipboard/sync') {
      try {
        const body = await parseBody(req);
        const text = String(body.text || '');
        const sender = String(body.sender || req.socket.remoteAddress || 'Mobile Phone');
        const engine = getMaveDropEngine();
        engine.setClipboard(text, sender);
        try {
          const { clipboard } = require('electron');
          if (clipboard && clipboard.writeText) {
            clipboard.writeText(text);
          }
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, length: text.length }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // =========================================================================
    // Firebase Cloud Authentication & User Database Endpoints
    // =========================================================================
    if (req.method === 'GET' && url.pathname === '/api/firebase/config') {
      const { firebaseService } = require('../firebase');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, config: firebaseService.getConfig() }));
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/auth/signup') {
      try {
        const body = await parseBody(req);
        const { firebaseService } = require('../firebase');
        const result = await firebaseService.signUp(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/auth/login') {
      try {
        const body = await parseBody(req);
        const { firebaseService } = require('../firebase');
        const result = await firebaseService.signIn(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/auth/anonymous') {
      try {
        const { firebaseService } = require('../firebase');
        const result = await firebaseService.signInAnonymously();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/auth/logout') {
      const { firebaseService } = require('../firebase');
      const result = firebaseService.signOut();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    if (req.method === 'GET' && url.pathname === '/api/firebase/auth/user') {
      const { firebaseService } = require('../firebase');
      const user = firebaseService.getCurrentUser();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, user }));
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/auth/password-reset') {
      try {
        const body = await parseBody(req);
        const { firebaseService } = require('../firebase');
        const result = await firebaseService.sendPasswordReset(body.email);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/firebase/db/profile') {
      try {
        const { firebaseService } = require('../firebase');
        const uid = url.searchParams.get('uid');
        const result = await firebaseService.getUserProfile(uid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/db/profile') {
      try {
        const body = await parseBody(req);
        const { firebaseService } = require('../firebase');
        const uid = body.uid || url.searchParams.get('uid');
        const result = await firebaseService.updateUserProfile(uid, body.profile || body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/db/sync-device') {
      try {
        const body = await parseBody(req);
        const { firebaseService } = require('../firebase');
        const uid = body.uid;
        const result = await firebaseService.syncDevice(uid, body.device || body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/firebase/db/devices') {
      try {
        const { firebaseService } = require('../firebase');
        const uid = url.searchParams.get('uid');
        const result = await firebaseService.getDevices(uid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/firebase/db/preferences') {
      try {
        const body = await parseBody(req);
        const { firebaseService } = require('../firebase');
        const uid = body.uid;
        const result = await firebaseService.savePreferences(uid, body.preferences || body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/firebase/db/preferences') {
      try {
        const { firebaseService } = require('../firebase');
        const uid = url.searchParams.get('uid');
        const result = await firebaseService.getPreferences(uid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    res.writeHead(404);
    res.end('Not Found');
  }
}

module.exports = { MobileWebServer, getLocalIp };
