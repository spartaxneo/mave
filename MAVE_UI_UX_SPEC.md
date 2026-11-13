# MAVE UI/UX DESIGN SPECIFICATION & INTERFACE ARCHITECTURE

**Product:** MAVE — A Little Friend for Everything  
**Benchmark:** ChatGPT-Class Conversational UX + Native Tactile Physics + Independent Virtual Computer Interface  
**Design Philosophy:** Hallmark & Apple Design · Anti-AI-Slop · 1 Core Idea per Surface · Fluid Tactile Micro-Interactions  

---

## 1. 3-PART CONVERSATIONAL WORKSPACE ARCHITECTURE

MAVE implements an authentic, distraction-free 3-column layout tailored for desktop productivity:

```
┌─────────┬──────────────────────┬────────────────────────────────────────────────────────┐
│ 48px    │ 260px Collapsible    │ Main Viewport (Fluid Width)                           │
│ Nav     │ Workspace Sidebar    │ ┌────────────────────────────────────────────────────┐ │
│ Rail    │                      │ │ Header: Title • Model Pill • Temporary Mode Pill  │ │
│         │ • New Chat (Ctrl+N)  │ ├────────────────────────────────────────────────────┤ │
│ [Home]  │ • Search (Ctrl+K)    │ │ Chat Message Flow:                                 │ │
│ [Chat]  │ • Projects List      │ │   - User prompt bubbles                            │ │
│ [Files] │ • Timeline Buckets:  │ │   - Assistant streaming markdown                   │ │
│ [Auto]  │     - Pinned         │ │   - Interactive Artifact Delivery Cards            │ │
│ [ISO]   │     - Today          │ │   - Deep Research Grounded Citations               │ │
│ [Settings│    - Previous 7 Days│ ├────────────────────────────────────────────────────┤ │
│         │     - Previous 30 Days│ Intelligent Composer:                                │ │
│         │                      │   - Auto-expanding textarea                          │ │
│         │ • Account & Storage  │   - Attachments, Voice Dictation, Deep Think Toggle  │ │
│         │                      │ └────────────────────────────────────────────────────┘ │
└─────────┴──────────────────────┴────────────────────────────────────────────────────────┘
```

### 1.1 Left Navigation Rail (48px)
- Fixed vertical rail providing single-click access across portals:
  - **Home / Chat (`rail-btn-home` / `rail-btn-chat`):** Instant return to conversational workspace.
  - **Scheduled Automations (`rail-btn-scheduled`):** Cron triggers and autonomous background tasks.
  - **Artifact Library (`rail-btn-library`):** Stored documents, markdown reports, and spreadsheets generated inside the Virtual Computer.
  - **Virtual PC Viewer (`rail-btn-work` / `[ISO]`):** Full-screen live offscreen 1280x800 framebuffer stream with manual pointer takeover.
  - **Account & Settings (`rail-avatar-btn`):** Opens 14-tab system configuration modal.

### 1.2 Secondary Workspace Sidebar (260px)
- Keyboard collapsible (`Ctrl+\` or toggle icon button).
- Chronologically clustered conversation history (`Pinned`, `Today`, `Yesterday`, `7 Days`, `30 Days`).
- Workspace context selector (`MAVE Workspaces`).

### 1.3 Intelligent Message Composer
- Auto-growing multiline input (`rows="1"` expanding up to 240px).
- Placeholder: `Message Mave, @ to mention, / for actions`.
- Integrated action pills:
  - **Think Mode (`btn-think-mode`):** Activates multi-step chain-of-thought and Reflexion loops.
  - **Deep Research:** Dispatches inquiries to isolated Virtual Browser with DuckDuckGo citations.
  - **Voice Dictation (`btn-mic`):** One-click local Whisper speech transcription with Soundex error correction.

---

## 2. INTERACTIVE CHAT ARTIFACT DELIVERY CARDS

Whenever MAVE's background workers generate reports, scripts, data models, or files inside the Virtual Computer, they are presented inside chat as tactile **Artifact Cards**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📄  MAVE Deep Research Report: WebAssembly SIMD Performance                 │
│      research_webassembly_simd_1730360000.md • 4.2 KB • [Virtual PC]         │
│                                                                              │
│      [ 💾 Save to Host ]                  [ 🖥️ View in Virtual PC ]           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Card Capabilities
1. **Save to Host:** Dispatches IPC `vc:export-file` from guest sandbox root (`%APPDATA%/mave/guest_fs/workspace/artifacts/`) to the user's host Downloads folder with explicit path traversal protection.
2. **View in Virtual PC:** Seamlessly switches the main viewport to the live 1280x800 Virtual Computer viewer pane.
3. **Verified Source Citations:** Deep research artifacts include clickable markdown footnotes with source URLs, retrieved titles, and ISO timestamps.

---

## 3. REAL-TIME VIRTUAL PC VIEWER & MANUAL TAKEOVER

Located at `<section data-pane="virtual-computer">` within `src/renderer/app.html`:
- **Canvas Display Server:** High-fidelity 1280x800 HTML5 canvas receiving 30 FPS PNG/JPEG synthetic framebuffers.
- **Virtual Cursor Overlay:** Offscreen cursor coordinates rendered visually on the guest screen without touching Windows host cursor APIs.
- **Manual Takeover Mode:** Clicking "Take Control" enables 1:1 pointer event dispatch (`mousedown`, `mousemove`, `mouseup`, `keydown`) into guest Chromium or guest terminal via `vc:user-input`.
- **Takeover Release:** Pressing `Esc` or clicking "Release Control" returns the virtual environment to autonomous agent execution.

---

## 4. 10-STEP GUIDED FIRST-RUN ONBOARDING WIZARD

Implemented in `src/renderer/onboarding_wizard.js` and mounted at `onboarding.html`:

| Step | Identifier | Purpose & User Options |
|---|---|---|
| **1** | `welcome` | Mascot welcome, "A Little Friend for Everything", 4 core value cards. |
| **2** | `device` | Real-time hardware verification: NVIDIA RTX 5060 (8GB VRAM), RAM, and Native Isolated Sandbox status. |
| **3** | `privacy` | Privacy boundary: 100% Local-First (Offline Sovereign), Cloud Sync, or Custom API Keys. |
| **4** | `voice` | Neural voice audition: Kokoro voices (Nicole, Michael, Bella, Sarah) with real-time audio playback. |
| **5** | `listen` | Local Whisper speech verification: mic level meter and push-to-talk (`Ctrl+Alt`) tutorial. |
| **6** | `model` | Neural model selection: Qwen3-VL 8B local core, Ollama service, or cloud reasoning fallback. |
| **7** | `virtual_pc` | Explanation of isolated guest workspace: Zero host cursor hijacking guarantee. |
| **8** | `personalization` | Display name, companion nickname, conversation tone (Friendly, Direct, Butler). |
| **9** | `connections` | Optional connectors: Telegram bot, Obsidian vault, GitHub repositories. |
| **10** | `ready` | Final verification summary and "Start Using MAVE" one-click launch. |

---

## 5. COMPLETE 14-TAB SETTINGS ARCHITECTURE

Accessible via `rail-avatar-btn` or `Ctrl+,`:
1. **General:** Startup behavior, language, notification sounds.
2. **Appearance:** Dark/Light theme, accent color palette, font size.
3. **Personalization:** User instructions, companion personality, response length.
4. **Memory:** Knowledge graph viewer, discrete remembered facts, memory wipe button.
5. **Voice:** Kokoro voice selector, Whisper microphone selection, VAD sensitivity.
6. **AI Models:** Local model core, NVIDIA RTX 5060 VRAM quota, optional Anthropic/OpenAI keys.
7. **Virtual Computer:** Isolation backend status, CPU/RAM quotas, guest filesystem explorer, sandbox reset.
8. **Agents & Automation:** MissionController DAG settings, Deep Research engine, Skill Forge.
9. **Privacy & Security:** Sovereign offline mode, DPAPI credential vault, 2FA PIN protection.
10. **Connected Apps:** MCP servers, Telegram bot token, Google Workspace, GitHub tokens.
11. **Devices & Nodes:** LAN mesh co-processing, mobile pairing QR code, mDNS discovery.
12. **Storage:** Cache usage, guest workspace disk usage, database compaction.
13. **Notifications:** System alerts, task completion chimes, critical outage alerts.
14. **About:** Version info (1.4.8-LTS), license (GPLv3), diagnostics export.
