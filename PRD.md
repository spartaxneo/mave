# MAVE V2 — Product Requirements Document (PRD)

## 1. Executive Vision & Objective
MAVE ("A Little Friend for Everything") is a sovereign, local-first personal AI operating layer and companion ecosystem. Evolving from an Electron/Node.js desktop assistant into an autonomous personal computing layer, MAVE must understand user objectives, acquire required capabilities, coordinate specialized local and cloud intelligence, safely execute authorized tasks across operating systems and devices, verify every critical outcome with real evidence, and operate without leaking private data off-device.

## 2. Core Pillars & Invariants
1. **Local-First Sovereign AI:** Default execution operates 100% air-gapped on-device using quantized GGUF vision-language models (`Qwen3-VL 8B` via `llama-server.exe` Vulkan) and ONNX models (`Kokoro 82M` TTS, `Whisper` STT, `Pix2Text` OCR). Cloud fallback is strictly opt-in and transparent.
2. **Zero Dummy Data & Authentic Execution:** Real data streams, genuine hardware adapters, real OS automation (`SendInput`, UI Automation), and authentic empty states. Simulated features must be prominently labeled as `[SIMULATED] / PROTOTYPE`.
3. **Multi-User Security & Tenant Isolation:** Distinct identities, credentials, memory partitions, and permissions for each user. Encryption of all secrets using DPAPI (`safeStorage`).
4. **Reliable Autonomous Agent Loops:** ReAct, topological Goal DAG planning, adversary verification gates, and reflexion self-healing with evidence-based completion gates.
5. **Cross-Device Connected Mesh:** Secure LAN discovery, encrypted WebSockets, MaveDrop file exchange, and unified companion endpoints across Windows, macOS, Linux, Android, and iOS.

## 3. High-Priority Functional Requirements (Phase A & B)

### FR-01: Secret Encryption & DPAPI Hardening
- **Requirement:** All sensitive API keys (`anthropicKey`, `openaiKey`, `geminiKey`, `perplexityKey`, etc.), web passwords (`readPassword`, `operatePassword`, `adminPassword`), and tokens must be encrypted using Windows DPAPI via Electron's `safeStorage`.
- **Acceptance Criteria:** No plaintext keys stored in `settings.json` or logs. Plaintext aliases (`anthropicApiKey`, `openaiApiKey`) normalized. Public settings view exposes only boolean presence flags.

### FR-02: Multi-Tenant Memory & Knowledge Graph Partitioning
- **Requirement:** `MemoryStore` and `PersonalKnowledgeGraph` must partition data by `userId`.
- **Acceptance Criteria:** Memory and entity graphs for User A are inaccessible to User B. Default local user maintains full backward compatibility. User deletion purges associated memory partition.

### FR-03: Authentic Domain Sentinels & Simulation Transparency
- **Requirement:** Features lacking live physical hardware adapters (`automotive_sentinel.js`, `tapkit_iphone.js`, `iot_hub.js`, `cua_sandbox.js`) must be clearly labeled with metadata `simulated: true` and status indicators `[SIMULATED / PROTOTYPE]`.
- **Acceptance Criteria:** Agent prompts and UI inspect responses accurately indicate simulation status to prevent hallucinations.

### FR-04: Headless Browser Automation Worker Pool
- **Requirement:** Provide an independent browser automation worker so web navigation and scraping can execute without monopolizing the physical OS mouse cursor.
- **Acceptance Criteria:** Headless worker launches isolated browser contexts, executes tasks, and returns verified DOM/screenshot evidence.

### FR-05: Desktop Session 1 Lock & Safe Computer Control
- **Requirement:** `computer.js` must detect Windows desktop lock status (`tscon` / session state) before firing `SendInput` actions, preventing black frame captures or failed inputs.
- **Acceptance Criteria:** Graceful pause and status notification when display session is locked.

### FR-06: Hardware-Aware Model Routing & Benchmark Harness
- **Requirement:** Enhanced `router.js` with hardware metrics inspection (VRAM, RAM, load), inference timeouts, automatic fallback, and standardized performance benchmarking harness (`scripts/benchmark_models.js`).
- **Acceptance Criteria:** Repeatable benchmark measuring tokens/sec, time-to-first-token, and memory usage.

### FR-07: Universal Cross-Platform Flutter Client Architecture
- **Requirement:** Provide a unified Flutter package (`mave_flutter`) targeting Windows, macOS, Linux, iOS, Android, and Meta Oculus Quest (Horizon OS spatial 2D window).
- **Parity:** 1:1 tactile design parity with Electron UI:
  - Dynamic Island HUD with audio equalizer waveforms and collapsed notch.
  - Tactile Vorssaint Mascot Rig with eye tracking parallax, mood states, and spring dragging.
  - 5 Hallmark High-Contrast Metric Tiles & Brain Mesh Mission Control.
  - Local AI GPU telemetry and model slot management (Vulkan llama-server, Colibri MoE, Whisper STT, Kokoro TTS).
  - Virtual Computer isolated sandbox terminal canvas.
  - Multi-tenant memory and Knowledge Graph viewer.
- **Acceptance Criteria:** `dart analyze` passes with 0 errors and 0 warnings; `flutter test` passes all widget test suites with zero RenderFlex overflows.

## 4. Architectural Non-Negotiables
- Static analysis and compilation: 0 compilation errors.
- Test integrity: All regression suites must pass without weakened assertions.
- Data privacy: Zero telemetry or cloud egress in strict local mode.
- Backward compatibility: Existing Windows desktop companion, Dynamic Island, and tray remain 100% operational.

## 5. All-In-One Autonomous Onboarding & Platform Setup
- **User Burden Zero-Floor**: User merely runs the installer or opens the app. No manual tool downloads, no manual python/node/ffmpeg setup, no manual model downloading.
- **Single Manual Action**: Approving OS-level system security permission dialogs (Accessibility, Screen Recording, Microphone).
- **Autonomous Setup Engine**: SelfProvisioner in Node.js daemon and AutonomousSetupView in Flutter automatically sequence:
  1. OS Permission Request (`/api/provision/permissions`).
  2. Hardware Architecture Profiling (`/api/provision/status`).
  3. AI Multimodal Model Auto-Selection & Local Download.
  4. Platform Runtimes (llama-server Metal/Vulkan) & Tool Bridges configuration.
  5. Autonomous Activation & Transition to Workspace Canvas.

## 6. Mobile Edge Semantic Router & Tool Dispatcher
- **Edge SLM Architecture**: Mobile phones (Android/iOS) and Meta Quest run a compact on-device SLM (0.5B - 1.5B parameters, <1GB RAM) rather than attempting to host heavy 35B models.
- **Competencies**:
  1. *Zero-Latency Intent Recognition*: Sub-50ms local classification of user goals.
  2. *Intelligent Tool & Mesh Dispatch*:
     - `localMobileTool`: Executes native camera, mic, sensors, or clipboard.
     - `meshWorkstation`: Dispatches desktop automation, screen capture, or Win32/macOS/Linux input to Primary Host.
     - `frontierCloud` / `workstationMoE`: Dispatches heavy code/architecture tasks to 35B MoE or Claude/GPT-4o.
     - `edgeDirect`: Answers simple conversation, factoids, and translation directly on-device with zero network latency.
- **Implementation**: [`EdgeSemanticRouter`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/mave_flutter/lib/core/router/edge_semantic_router.dart) verified via unit tests.


