# MAVE — DATA PRIVACY, SECURITY & NETWORK EGRESS AUDIT

**Audit Date**: October 24, 2026  
**Auditor**: Principal AI Security Architect & Privacy Compliance Auditor  
**Target Repository**: `c:\Users\ryzen\Documents\antigravity\dazzling-archimedes`  
**Git Commit**: `5121d4de5e236b90d27b352b13fed62f99d00c27`  

---

## 1. Network Egress & Data Flow Matrix

Every outbound network endpoint, data payload, and security boundary in the MAVE codebase was inspected:

| Destination Endpoint | Protocol | Triggering Subsystem | Data Transmitted Off-Device | Local Privacy Mode Impact | Evidence (File & Lines) |
|---|---|---|---|---|---|
| **api.anthropic.com** | HTTPS (Port 443) | `src/main/llm/index.js` | User prompt text, conversation history, optional uploaded images | **Completely Blocked** when Local-Only is enabled | [`src/main/llm/index.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/llm/index.js#L18-L40) |
| **api.openai.com** | HTTPS (Port 443) | `src/main/llm/index.js` | User prompts, vision frames, system instructions | **Completely Blocked** when Local-Only is enabled | [`src/main/llm/index.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/llm/index.js#L42-L65) |
| **api.deepseek.com** | HTTPS (Port 443) | `src/main/llm/index.js` | User prompts, code snippets, chat turns | **Completely Blocked** when Local-Only is enabled | [`src/main/llm/index.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/llm/index.js#L55-L78) |
| **api.colibri.ai** | HTTPS (Port 443) | `src/main/llm/index.js` | Routing prompts and metadata | **Completely Blocked** when Local-Only is enabled | [`src/main/llm/index.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/llm/index.js#L110-L140) |
| **trycloudflare.com** (Cloudflare Edge) | TLS Tunnel (Port 7844) | `src/main/remote/tunnel.js` | Inbound remote web companion requests, outbound web UI HTML/JS | **Disabled** if remote companion is turned off | [`src/main/remote/tunnel.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/remote/tunnel.js#L1-L110) |
| **huggingface.co** | HTTPS (Port 443) | `src/main/local/downloader.js` | Model download GET requests (GGUF weights) | **Inactive** unless user explicitly clicks download model | [`src/main/local/downloader.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/downloader.js#L1-L130) |
| **127.0.0.1:8080** (Embedded llama-server) | HTTP (Local Loopback) | `src/main/local/server.js` | All local model queries and completions | **Zero Egress**: Stays 100% inside local host memory | [`src/main/local/server.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/server.js#L1-L180) |
| **127.0.0.1:3000** (Local Web Companion) | HTTP / WS (Local Loopback) | `src/main/remote/web.js` | Web companion UI and chat | **Zero Egress**: Stays on LAN / Loopback | [`src/main/remote/web.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/remote/web.js#L1-L260) |

---

## 2. Local-Only Air-Gap Verification

1. **Deterministic Local Routing**:
   - In [`src/main/local/router.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/router.js#L1-L220), the model routing logic checks `settings.forceLocal` and `hardware.canRunNatively`.
   - When configured in "Local Mode", the router dispatches prompts strictly to `http://127.0.0.1:8080/completion` or `/v1/chat/completions`.
   - No telemetry, analytics, tracking pings, or background usage beacons were identified in the audited codebase.
2. **Audio & Speech Air-Gap**:
   - Both Kokoro TTS (`vendor/voice/kokoro.onnx`) and Whisper STT (`vendor/speech/whisper-server.exe`) run 100% on local hardware. Microphone audio is never transmitted to cloud STT APIs (such as OpenAI Whisper API or Google Cloud Speech) during local operation.
3. **Vision & Screenshot Air-Gap**:
   - Screen frames captured by `computer.js` are processed locally by the Qwen3-VL 8B vision encoder (`mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf`) in local VRAM. Screenshots are NOT uploaded to cloud vision APIs unless the user explicitly overrides the model to `gpt-4o` or `claude-3-5-sonnet`.

---

## 3. Credential & Secrets Storage Audit

1. **Cloud API Keys**:
   - Located in: `C:\Users\ryzen\AppData\Roaming\mave\settings.json`.
   - **Finding**: API keys (`anthropicApiKey`, `openaiApiKey`, etc.) are stored in **plaintext JSON**.
   - **Architectural Risk**: Any software running under the current Windows user profile can read these keys.
   - **Recommended Hardening**: Migrate key storage to Chromium's native `safeStorage` API (DPAPI on Windows) to encrypt credentials at rest.
2. **User Password Hashes**:
   - Located in: `C:\Users\ryzen\AppData\Roaming\mave\users.json` via [`src/main/users.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/users.js#L1-L240).
   - **Finding**: Passwords are securely hashed using **bcrypt** with standard salt rounds before persisting to disk.
   - **Verdict**: Compliant with modern password hashing best practices.
3. **Session Tokens & API Authentication**:
   - Generated via Node.js cryptographic randomness: `crypto.randomBytes(32).toString('hex')`.
   - Session tokens expire upon logout or server restart.

---

## 4. Execution Sandboxing & System Privilege Level

1. **Electron Sandbox Boundaries**:
   - [`src/main/main.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/main.js#L40-L55) enforces:
     - `contextIsolation: true`
     - `nodeIntegration: false`
     - Preload script isolation via `src/preload/preload.js`
   - **Verdict**: Renderer process is well-isolated from arbitrary Node.js native execution, protecting against XSS-driven code execution in chat history.
2. **PTY Terminal & OS Automation Privilege**:
   - [`src/main/pty.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/pty.js#L1-L120) and [`src/main/computer.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/computer.js#L1-L260) execute with the **full privileges of the logged-in Windows user**.
   - **Safety Boundary**: The autonomous agent does not currently run inside a restricted Windows AppContainer or Hyper-V container. High-risk commands (e.g. `del /s`, `format`, system file modification) rely on model self-restraint and user confirmation dialogs rather than kernel-level sandbox enforcement.
