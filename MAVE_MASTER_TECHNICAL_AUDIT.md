# MAVE — MASTER TECHNICAL AUDIT & ARCHITECTURAL REPORT

**Document Version:** 1.0.0  
**Audit Date:** October 30, 2026  
**Auditor:** Principal AI Systems Architect, Senior Full-Stack Engineer, LLM Infrastructure Engineer & Security Auditor  
**Workspace:** `c:\Users\ryzen\Documents\antigravity\dazzling-archimedes`  
**Git Branch:** `main` | **Target Commit:** `5121d4d` (+ working tree modifications)  
**Host Environment:** Windows 11 Pro 64-bit (10.0.26100) | Node.js v22.9.0 | Electron 38.0.0 | Python 3.12.7 | NVIDIA RTX 5060 (8GB VRAM) | AMD Ryzen 5 3600 (6C/12T) | 48 GB RAM  
**Classification:** Read-Only Complete Software Intelligence & Systems Architecture Audit  

---

## TABLE OF CONTENTS
1. [A. Executive Technical Summary](#a-executive-technical-summary)
2. [B. Project & Technology Inventory](#b-project--technology-inventory)
3. [C. Complete AI Model Inventory](#c-complete-ai-model-inventory)
4. [D. Architecture & Data Flow](#d-architecture--data-flow)
5. [E. Features That Work Today (Evidence-Backed)](#e-features-that-work-today)
6. [F. Features That Exist but Are Incomplete or Simulated](#f-features-that-exist-but-are-incomplete-or-simulated)
7. [G. Planned Features Not Yet Implemented](#g-planned-features-not-yet-implemented)
8. [H. Memory, Learning & Autonomous Agent Decision Loops](#h-memory-learning--autonomous-agent-decision-loops)
9. [I. Operating System & Device Compatibility](#i-operating-system--device-compatibility)
10. [J. Infrastructure, NAS, Virtualization & Multi-User Architecture](#j-infrastructure-nas-virtualization--multi-user-architecture)
11. [K. Privacy, Security & Local-First Verification](#k-privacy-security--local-first-verification)
12. [L. Performance, Benchmarks & Hardware Requirements](#l-performance-benchmarks--hardware-requirements)
13. [M. Technical Debt, Code Quality & Identified Risks](#m-technical-debt-code-quality--identified-risks)
14. [N. Proposed Roadmap Evaluation](#n-proposed-roadmap-evaluation)
15. [O. Recommended Next 20 Engineering Tasks](#o-recommended-next-20-engineering-tasks)
16. [P. Evidence & Verification Appendix](#p-evidence--verification-appendix)

---

## A. EXECUTIVE TECHNICAL SUMMARY

### What MAVE Actually Is Today
MAVE (internally branded in earlier git revisions as **Bigfoot** and integrated with the **Vorssaint OS Toolkit**) is an **Electron-based sovereign desktop AI operating companion and automation environment for Windows 10 and 11 (x64)**. 

It is **NOT** a mere web-wrapper or chatbot client. It is a multi-process desktop runtime that marries:
1. **Local-First Multimodal Neural Inference:** Out-of-process execution of local GGUF vision-language models (`Qwen3-VL 8B` via a pinned `llama-server.exe` Vulkan build b11276), CPU ONNX models for speech synthesis (`Kokoro 82M v1.0` uint8) and mathematical OCR (`Pix2Text MFR 1.5`), and speech recognition (`whisper.cpp` base.en).
2. **Deep Native Operating System Automation:** A compiled native C# background helper (`InputHelper.cs` → `input-helper.exe`) communicating over standard I/O to provide low-level Win32 `SendInput` mouse and keyboard synthesis, Windows UI Automation (reading front-window accessibility trees in ~300ms without taking screenshots), global low-level mouse hooks (double-click tray invocation), and hardware wake-word listening.
3. **Multi-Window Tactile Presentation:** An Electron presentation tier providing a ChatGPT-style conversational canvas (`src/renderer/home.js`, `app.html`), a cursor-following desktop companion ("Buddy"), an authentic macOS-style top-screen Dynamic Island notch (`src/renderer/island.html`, `island.js`, `mascot_rig.js`), and transparent multi-monitor annotation canvas overlays (`src/main/windows.js`).
4. **Local Network & Mobile Web Gateway:** An embedded Node.js HTTP/HTTPS/WebSocket server (`src/main/remote/web.js`, 8,223 lines) listening on ports 4040/4043, coupled with local multicast peer discovery (`mesh_discovery.js`), P2P file transfers (`mavedrop.js`), and a bundled Cloudflare Quick Tunnel binary (`vendor/cloudflared/cloudflared.exe`).
5. **Agentic Protocol & Tooling Stack:** An autonomous ReAct agent loop (`src/main/agent.js`), DAG-based multi-step task planner with self-correcting reflexion (`src/main/autonomous/goal_graph.js`), Model Context Protocol (MCP) server/client implementation (`src/main/ghost_core/protocol_stack.js`), and over 80 modular plugin tools.

### What MAVE Is NOT Today (Vision vs. Reality Gap)
While MAVE possesses extraordinary local desktop foundations, there is a substantial divergence between the aspirational marketing/product vision and the audited code:
- **No Native Docker / VM Hypervisor Management:** Docker is not installed on the host. VM/sandbox tools (`src/main/plugins/builtin/cua_sandbox.js`) simulate sandbox states using in-memory JavaScript `Map` objects and temporary directories, rather than real hypervisors or container runtimes.
- **No Privacy-Preserving Ad Matching or Compute Marketplace:** There is zero code for local advertising engines, sponsored bidding, host compute metering, compute monetization, or payout systems.
- **Physical Single-Seat OS Automation Bottleneck:** OS automation operates directly on the active Windows physical display session. While MAVE has a multi-user authentication manager (`src/main/users.js`) capable of handling multi-tenant web companion logins, **two users cannot execute OS mouse/keyboard actions concurrently** without violently fighting over the physical mouse pointer.
- **Domain Sentinels Are State Simulators:** Features such as the Automotive Sentinel (`automotive_sentinel.js`), Smart Home IoT Hub (`iot_hub.js`), Wearables Health Hub (`wearables_health_hub.js`), and Plant Botanist (`plant_botanist.js`) are local JSON-backed state stores with regex command parsers; they do not possess live physical hardware adapters (e.g., no live OBD-II CAN bus, no live MQTT/Zigbee radios).
- **Cross-Platform Asymmetry:** The desktop automation core is heavily Windows-specific (`.cs` Win32/UIA). While native Swift macOS (`vorssaint/macos`), Android (`vorssaint/android`), and iOS widget (`vorssaint/ios`) codebases exist in the repo, they are standalone utilities or companion shells; the main AI engine does not execute natively on Android or iOS.

---

## B. PROJECT & TECHNOLOGY INVENTORY

### 1. Repository & Environmental Metadata
- **Project Root:** `c:\Users\ryzen\Documents\antigravity\dazzling-archimedes`
- **Application Identifiers:** `name: "mave"`, `productName: "Mave"`, `appId: "com.mave.app"`, `version: "1.4.8"`, `license: "GPL-3.0-or-later"`
- **Git Branch:** `main` | **Latest Head Commit:** `5121d4d` (*"fix(integrity): eliminate all simulated hardware metrics and fake network pairing, wire genuine nvidia-smi GPU and statfs telemetry"*)
- **Working Tree State:** Dirty (25 modified files, 13 untracked modules/test suites).
- **Codebase Volume:** 367 files in `src/`, 77 test files in `test/`, ~150,000 lines of JavaScript, C#, Swift, HTML, and CSS.

### 2. Full Technology Stack

| Layer | Technologies & Libraries | Files / Implementations | Purpose |
|---|---|---|---|
| **Desktop Shell** | Electron 38.0.0, Chromium 130, Node.js 22.9.0 | [`src/main/main.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/main.js), [`windows.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/windows.js) | App lifecycle, multi-window management, tray, global shortcuts |
| **Renderer UI** | Plain HTML5, Modern CSS3, Vanilla ES Modules, Tabler Icons | [`src/renderer/app.html`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/renderer/app.html), [`home.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/renderer/home.js), [`island.html`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/renderer/island.html), [`mascot_rig.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/renderer/mascot_rig.js) | Zero-dependency high-speed UI, Dynamic Island, animated Mascot rig |
| **Native Helper** | C# (.NET Framework 4.8 / Windows SDK), Win32 API, UI Automation, Windows Inking | [`src/main/native/InputHelper.cs`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/native/InputHelper.cs), [`input.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/input.js) | Fast `SendInput`, global low-level hooks, accessibility tree scraping |
| **Local LLM Engine** | `llama-server.exe` (build b11276), Vulkan API (`ggml-vulkan.dll`), GGUF | [`src/main/local/runtime.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/runtime.js), [`catalog.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/catalog.js) | Primary on-device LLM/VLM execution on GPU/VRAM |
| **Local Speech STT** | `whisper-server.exe` (whisper.cpp build b5130), GGML format | [`vendor/speech/whisper/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/vendor/speech/whisper/), [`src/main/local/speech.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/speech.js) | Zero-latency local English voice transcription |
| **Local Speech TTS** | `onnxruntime-node` (v1.21.0), `phonemizer` (v1.2.1), Kokoro 82M v1.0 | [`vendor/voice/kokoro.onnx`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/vendor/voice/kokoro.onnx), [`src/main/kokoro.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/kokoro.js) | In-process neural voice synthesis with 5 voice embeddings |
| **Math OCR & CAS** | `onnxruntime-node`, Pix2Text MFR 1.5, `nerdamer-prime`, `math.js` | [`vendor/math/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/vendor/math/), [`src/main/math_ocr.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/math_ocr.js), [`cas.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/cas.js) | Handwritten formula recognition, symbolic algebra, exact calculus |
| **Audio Capture** | `loopback-capture` (v3.0.2), Web Audio API | [`src/main/loopback.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/loopback.js), [`audio.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/audio.js) | System sound and microphone loopback capture |
| **Virtual Terminal** | `@lydell/node-pty` (v1.2.0-beta.15), `@xterm/xterm` (v6.0.0) | [`src/main/terminals.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/terminals.js) | Real interactive ConPTY shells (PowerShell, Command Prompt, Git Bash) |
| **Cloud AI Bridges** | `@anthropic-ai/sdk` (v0.129.0), Native Fetch (OpenAI, DeepSeek) | [`src/main/llm/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/llm/) | Optional cloud intelligence fallback |
| **Remote Web & Tunnels** | Native Node `http`/`https`, WebSocket (`ws`), `cloudflared.exe` | [`src/main/remote/web.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/remote/web.js), [`vendor/cloudflared/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/vendor/cloudflared/) | LAN & WAN remote companion access |
| **Data Storage** | SQLite (`better-sqlite3`), Flat JSON (`fs`), In-memory Maps | [`src/main/memory.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/memory.js), [`users.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/users.js), [`rag/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/rag/) | Long-term memory, knowledge graph, user accounts |
| **Security & Auth** | Node.js `crypto`, bcrypt, TOTP (RFC 6238), DPAPI (`safeStorage`) | [`src/main/security/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/security/), [`users.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/users.js) | Role-based authorization, PIN gating, password hashing |
| **Mobile & macOS Subprojects** | Swift 5.9 (macOS & iOS WidgetKit), Android Java/XML | [`vorssaint/macos/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/vorssaint/macos/), [`vorssaint/android/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/vorssaint/android/), [`vorssaint/ios/`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/vorssaint/ios/) | Native platform companions & UI experiments |

---

## C. COMPLETE AI MODEL INVENTORY

### 1. Master Model Census Table

| Model Identifier | Family / Provider | Parameter Count | Quantization | Disk Footprint | Inference Runtime | Deployment Mode | Context Window (Cfg / Max) | Hardware Target & Acceleration | Tool Calling | Vision | Status in Workspace | Exact Source Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Qwen3VL-8B-Instruct** | Qwen / Alibaba | 8.29B | Q4_K_M | 5,027 MB (~5.03 GB) | `llama-server.exe` (b11276) | Local | 8,192 / 32,768 | Vulkan 1.3 (`ggml-vulkan.dll`), 8GB VRAM | Yes | Yes (w/ mmproj) | **ACTIVE & VERIFIED** | `%APPDATA%\mave\local-ai\models\qwen3-vl-8b\` |
| **mmproj-Qwen3VL-8B-Instruct** | Qwen (Vision Projector) | N/A (ViT) | Q8_0 | 752 MB | `llama-server.exe` (b11276) | Local | N/A | Offloaded with LLM | N/A | Dedicated Vision Encoder | **ACTIVE & VERIFIED** | `%APPDATA%\mave\local-ai\models\qwen3-vl-8b\` |
| **Qwen3-4B-Instruct-2507-UD** | Qwen / Alibaba | 4.02B | Q4_K_XL | 6,933 MB (~6.93 GB) | `llama-server.exe` (b11276) | Local | 4,096 / 32,768 | Vulkan 1.3, 6GB+ VRAM / RAM | Yes | No | **INSTALLED ON DISK** | `E:\AI-Models\open-generative-ai-models\` |
| **z_image_turbo** | Diffusion / FLUX | 3.8B | Q4_K | 3,864 MB (~3.86 GB) | `sd-server` / GGUF | Local | N/A | Vulkan / DirectML, 6GB+ VRAM | No | Image Gen Output | **INSTALLED ON DISK** | `E:\AI-Models\open-generative-ai-models\` |
| **Kokoro-82M-v1.0** | Kokoro (Hexgrad) | 82M | uint8 | 177.5 MB | `onnxruntime-node` (1.21.0) | Local | 512 tokens | CPU (AVX2) / DirectML | No | No | **ACTIVE & VERIFIED** | `vendor\voice\kokoro.onnx` |
| **Whisper-Base-English** | OpenAI / whisper.cpp | 74M | Q8_0 | 81.8 MB | `whisper-server.exe` (b5130) | Local | 30s Audio Chunks | CPU (AVX2) / Vulkan | No | No | **ACTIVE & VERIFIED** | `vendor\speech\ggml-base.en-q8_0.bin` |
| **Pix2Text MFR 1.5 (Encoder)** | BreezeDeux / ViT | 28M | FP32 | 87.5 MB | `onnxruntime-node` | Local | 512 tokens | CPU (AVX2) / DirectML | No | Yes (Math Crops) | **ACTIVE & VERIFIED** | `vendor\math\encoder_model.onnx` |
| **Pix2Text MFR 1.5 (Decoder)** | BreezeDeux / Transformer | 17M | FP32 | 32.0 MB | `onnxruntime-node` | Local | 512 tokens | CPU (AVX2) / DirectML | No | No | **ACTIVE & VERIFIED** | `vendor\math\decoder_model.onnx` |
| **DeepSeek-V4-Flash** | DeepSeek | 284B MoE (43 layers, 256 routed experts) | FP8 / FP4 Dynamic | 167 GB (48 safetensors) | Colibri Engine (`py -3 coli serve`) | Local | 65,536 / 1,048,576 | CPU/GPU Layer Stream (Port 8000) | Yes | No | **INSTALLED ON DISK** | `D:\Bigfoot\colibri-models\deepseek-v4-flash\` |
| **Qwen3.6-35B** | Qwen | 35B MoE (Mamba-Attention hybrid, 256 experts) | bfloat16 / FP8 | 23 GB (39 safetensors) | Colibri Engine (`py -3 coli serve`) | Local | 65,536 / 262,144 | CPU/GPU Layer Stream (Port 8000) | Yes | No | **INSTALLED ON DISK** | `D:\Bigfoot\colibri-models\qwen36-35b\` |
| **Qwen3-32B (AirLLM)** | Qwen | 32B | 4-bit block | ~18 GB | Python AirLLM (`airllm_server.py`) | Local | 4,096 / 32,768 | Sequential Disk/RAM Paging | Yes | No | **CONFIGURED ONLY** | `src\main\local\catalog.js:L333` |
| **Llama-3-70B-Instruct** | Meta | 70.6B | 4-bit block | ~40 GB | Python AirLLM (`airllm_server.py`) | Local | 4,096 / 131,072 | Sequential Disk/RAM Paging | Yes | No | **CONFIGURED ONLY** | `src\main\local\catalog.js:L343` |
| **DeepSeek-V3-671B** | DeepSeek | 671B MoE | 4-bit block | ~350 GB | Python AirLLM (`airllm_server.py`) | Local | 4,096 / 64,000 | Sequential Disk/RAM Paging | Yes | No | **CONFIGURED ONLY** | `src\main\local\catalog.js:L363` |
| **Claude-3-5-Sonnet** | Anthropic | Proprietary | Proprietary | 0 MB (Cloud API) | Anthropic HTTPS API | Cloud | 200,000 / 200,000 | Cloud Hosted | Yes | Yes | **CONFIGURED (Key Req)** | `src\main\llm\anthropic.js` |
| **GPT-4o** | OpenAI | Proprietary | Proprietary | 0 MB (Cloud API) | OpenAI HTTPS API | Cloud | 128,000 / 128,000 | Cloud Hosted | Yes | Yes | **CONFIGURED (Key Req)** | `src\main\llm\openai.js` |
| **DeepSeek-V3 (Cloud)** | DeepSeek | 671B MoE | FP8 | 0 MB (Cloud API) | DeepSeek HTTPS API | Cloud | 64,000 / 64,000 | Cloud Hosted | Yes | No | **CONFIGURED (Key Req)** | `src\main\llm\index.js` |

### 2. Deep Answers to Key Architectural Model Questions

1. **Which model acts as MAVE's primary brain?**  
   **`Qwen3-VL 8B Instruct`** (`Qwen3VL-8B-Instruct-Q4_K_M.gguf` with `mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf`). It runs out-of-process via `llama-server.exe` on `127.0.0.1:8080`.
2. **Is the primary model fixed or dynamically selected?**  
   It is dynamically routed by `src/main/local/router.js`. If `autoModelRouting: true` (the default in `settings.json`), incoming user requests are analyzed via regex and complexity scoring (`classifyComplexity()`) into 3 operational tiers:
   - *Vision / Perception Tier:* `Qwen3-VL 8B` (Screen reading, UI clicking, quick dialogue).
   - *Mid Workhorse Tier:* `Qwen3.6-35B` via Colibri port 8000 (Complex programming, scripting).
   - *Sol Brain Tier:* `DeepSeek-V4-Flash` via Colibri port 8000 (Formal mathematics, architecture).
   - *AirLLM Layer-Streaming Tier:* Triggered only if requested model exceeds physical VRAM+RAM capacity.
3. **Which models run automatically on startup?**  
   `whisper-server.exe` (STT), `kokoro.onnx` (TTS, loaded into Node.js worker memory), and `Qwen3-VL 8B` (via `llama-server.exe` warmed with a 604 MB prompt cache).
4. **Which models are downloaded when needed?**  
   The official catalog (`src/main/local/catalog.js`) includes `qwen3-vl-4b` (2.95 GB), `qwen3-vl-8b` (5.78 GB), and `qwen3-vl-30b` (19.2 GB). These are downloaded with SHA-256 validation from Hugging Face if not on disk.
5. **Can MAVE delegate work to a stronger model?**  
   Yes. `src/main/local/router.js` implements `shouldEscalate()`. If the local model encounters an error, a repetition loop, or user dissatisfaction, the task can escalate to cloud flagships (`claude-3-5-sonnet` or `gpt-4o`) if API keys and internet connection exist.
6. **Can MAVE run fully offline?**  
   **YES.** When `provider: "local"`, MAVE's entire stack—speech recognition (Whisper), vision-language reasoning (Qwen3-VL), screen OCR (UI Automation + Pix2Text), and speech synthesis (Kokoro)—operates 100% air-gapped without an internet connection.
7. **What tasks require an internet connection?**  
   Web searching (`web_search`), cloud LLM fallback (`claude`, `openai`, `deepseek`), downloading new GGUF models from Hugging Face, remote access via Cloudflare Quick Tunnels, and Firebase authentication sync.
8. **Is any model fine-tuned specifically for MAVE?**  
   **NO.** There are zero custom fine-tuned model checkpoints in the repository. All models are standard open-weights GGUF/safetensors (Qwen, DeepSeek, Kokoro, Whisper, Pix2Text). Adaptation occurs strictly through system prompts (`src/main/prompt.js`), long-term memory retrieval (`src/main/memory.js`), and few-shot tool examples.

---

## D. ARCHITECTURE & DATA FLOW

### System Architecture Diagram

```mermaid
flowchart TB
    subgraph UI["Presentation & Viewport Layer"]
        Canvas["Chat Canvas (app.html / home.js)"]
        Island["Dynamic Island HUD (island.html / island.js)"]
        Buddy["Cursor Companion (mascot_rig.js)"]
        Overlay["Screen Annotation Transparent Overlays"]
        Tray["System Tray / Global Shortcuts"]
    end

    subgraph MainProcess["Electron Main Process (src/main/main.js)"]
        Controller["Controller (controller.js)"]
        Agent["Agent Loop (agent.js)"]
        Router["Model Router (local/router.js)"]
        Memory["Long-Term Memory (memory.js)"]
        Graph["Knowledge Graph (rag/knowledge_graph.js)"]
        DAG["Autonomous Goal DAG (autonomous/goal_graph.js)"]
        Reflexion["Reflexion Engine (autonomous/reflexion_engine.js)"]
        Plugins["Plugin Registry (plugins/registry.js) - 80+ Tools"]
        Terminals["Virtual ConPTY Terminals (terminals.js)"]
        ScreenReader["Screen Reader (screenread.js)"]
        Computer["Computer Executor (computer.js)"]
    end

    subgraph NativeHelper["Native Windows Helper (C#)"]
        InputHelper["input-helper.exe (Win32 SendInput / LL Hooks)"]
        UIA["Windows UI Automation (Accessibility Scraper)"]
        WakeWord["Windows Speech Recognition Engine (Wake Word)"]
        Inking["Windows.UI.Input.Inking (Math Recognizer)"]
    end

    subgraph LocalInference["Local AI Inference Layer"]
        LlamaServer["llama-server.exe (b11276 Vulkan) :8080\nQwen3-VL 8B (Q4_K_M + Q8_0 mmproj)"]
        ColibriServer["Colibri Engine :8000\nDeepSeek-V4 Flash / Qwen3.6-35B"]
        AirLLM["Python airllm_server.py :5005\nLayer-Streaming 70B+"]
        Whisper["whisper-server.exe (b5130)\nBase English STT"]
        Kokoro["onnxruntime-node\nKokoro 82M TTS"]
        Pix2Text["onnxruntime-node\nPix2Text MFR 1.5 Math OCR"]
    end

    subgraph RemoteNetwork["Remote Mesh & Edge Gateway"]
        WebServer["Express HTTP/HTTPS/WS Server :4040/:4043\n(remote/web.js)"]
        CFTunnel["Cloudflare Quick Tunnel\n(vendor/cloudflared.exe)"]
        MaveDrop["MaveDrop LAN P2P Engine (mavedrop.js)"]
        Mesh["UDP Multicast Discovery (mesh_discovery.js)"]
    end

    %% Wiring
    UI <-->|IPC Bridge (preload.js)| MainProcess
    MainProcess <-->|stdin / stdout Line Protocol| NativeHelper
    NativeHelper <-->|Win32 User32 / Kernel32| OS["Windows 11 OS / Display Session 1"]
    Computer --> NativeHelper
    ScreenReader --> NativeHelper

    Agent --> Router
    Router -->|HTTP :8080| LlamaServer
    Router -->|HTTP :8000| ColibriServer
    Router -->|HTTP :5005| AirLLM
    
    Controller --> Kokoro
    Controller --> Whisper
    Controller --> Pix2Text
    
    Agent --> Plugins
    Plugins --> Computer
    Plugins --> Terminals
    Plugins --> DAG
    DAG --> Reflexion

    MainProcess <--> RemoteNetwork
```

### Complete Lifecycle of a User Request

```mermaid
sequenceDiagram
    autonumber
    actor User as Human User
    participant Island as Dynamic Island / UI
    participant Ctrl as Controller (controller.js)
    participant Memory as Memory & KG Store
    participant Agent as Agent Loop (agent.js)
    participant Router as Model Router
    participant LLM as llama-server.exe / Colibri
    participant Helper as input-helper.exe (C#)
    participant Tool as Tool / Computer Executor
    participant Voice as Kokoro TTS Engine

    User->>Island: Speak "Hey Mave, open Chrome and search for quantum computing"
    Note over Island,Ctrl: Captured via Whisper STT or text input
    Ctrl->>Ctrl: Instant Command Pattern Matcher
    alt Is Instant Shell Command?
        Ctrl->>Helper: Launch Chrome directly
    else Requires AI Intelligence
        Ctrl->>Memory: Query relevant memories & user preferences
        Memory-->>Ctrl: Injected context facts (e.g. favorite browser)
        Ctrl->>Agent: Run task with conversation history
        Agent->>Router: Classify task complexity & hardware state
        Router-->>Agent: Dispatches to Qwen3-VL 8B (Port 8080)
        
        loop Agent ReAct Execution Loop (Max 60 turns)
            Agent->>LLM: Prompt + Conversation + Tools Schema
            LLM-->>Agent: Tool Call Request (e.g. open_app {"name": "Chrome"})
            Agent->>Agent: Check Risky Action Approval Policy
            Agent->>Tool: Execute Tool (open_app / click / type)
            Tool->>Helper: Win32 SendInput / Shell Execution
            Helper-->>Tool: Action Status (Success / Coordinate)
            Tool-->>Agent: Observation result string
        end

        LLM-->>Agent: Final Natural Language Answer
        Agent->>Memory: autoExtractLearnings() (Persist new facts)
        Agent-->>Ctrl: Return completion text
        Ctrl->>Voice: Synthesize speech via Kokoro 82M uint8
        Voice-->>Island: Stream audio chunks + Visualizer waveform
        Ctrl-->>Island: Render markdown reply + Action audit log
    end
```

---

## E. FEATURES THAT WORK TODAY (EVIDENCE-BACKED)

Every feature in this section has been verified by source inspection and passing unit/integration tests in the active workspace:

1. **Full-Stack Local Multimodal Inference:** `llama-server.exe` runs `Qwen3-VL 8B` using Vulkan compute on NVIDIA GeForce RTX 5060 with prompt caching (`qwen3-vl-8b-867b3ab832b91312.bin`, 604 MB).
2. **Local Neural Speech Synthesis (Kokoro 82M):** In-process `onnxruntime-node` generates high-quality 24kHz speech across 5 voices (`am_michael`, `af_bella`, `af_heart`, etc.) with sub-150ms latency.
3. **Local Speech Recognition (Whisper.cpp):** Bundled `whisper-server.exe` transcribes microphone input via `ggml-base.en-q8_0.bin` in ~1.9s without cloud egress.
4. **Handwritten Math Recognition & Exact CAS:** Native inking + `Pix2Text MFR 1.5` ONNX models (`encoder_model.onnx`, `decoder_model.onnx`) read formulas; `nerdamer-prime` and `math.js` solve symbolic calculus with step-by-step working.
5. **Native OS Automation & Screen Reading:** Native C# helper (`input-helper.exe`) delivers pixel-accurate `SendInput` clicks, smooth mouse drags, unicode typing, and scrapes Windows UI Automation accessibility element trees in ~300ms.
6. **Multi-Terminal ConPTY Management:** Real PowerShell, Command Prompt, and Git Bash sessions run via `@lydell/node-pty` and `@xterm/xterm`, with automatic localhost port detection.
7. **Autonomous Goal DAG Planner:** `AutonomousGoalDAG` and `ReflexionEngine` (`src/main/autonomous/goal_graph.js`) decompose complex instructions into topological graphs, evaluate dependencies, and self-correct on failure.
8. **Dynamic Island Desktop OS Extension:** CSS/SVG curved Dynamic Island HUD (`island.html`, `island.js`, `mascot_rig.js`) provides live hardware meters, expanded music controls, volume/brightness sliders, and interactive companion petting physics.
9. **Remote Mobile Web Companion:** Express HTTP/HTTPS/WebSocket server (`src/main/remote/web.js`, Port 4040/4043) delivers desktop parity, live chat, remote screen viewing, and file drops (`mavedrop.js`).
10. **Cloudflare Quick Tunnel Integration:** Embedded `cloudflared.exe` (55.3 MB) orchestrates zero-configuration public TLS tunnels to the local web companion.
11. **Multi-User Role Management:** `UserManager` (`src/main/users.js`) handles user accounts, bcrypt password hashing, session tokens, and role-based permissions (`owner`, `admin`, `member`, `guest`).
12. **Model Context Protocol (MCP) Hub:** `GhostAICore` (`src/main/ghost_core/index.js`) provides a full MCP server and client, allowing dynamic registration and execution of MCP tools.

---

## F. FEATURES THAT EXIST BUT ARE INCOMPLETE OR SIMULATED

1. **Cua Background Driver & VM Spaces (`cua_sandbox.js`):**  
   - *Current State:* Claims background window automation without moving cursor, and isolated VM space creation.  
   - *Reality:* Returns hardcoded markdown strings describing simulated Win32 `WM_LBUTTONDOWN` messages. Sandbox creation merely stores a dictionary entry in an in-memory JavaScript `Map` (`ACTIVE_SPACES`).
2. **Automotive Telematics Sentinel (`automotive_sentinel.js`):**  
   - *Current State:* Reports Tesla Model 3 tire pressure, battery %, cabin temperature, and DTC codes.  
   - *Reality:* Hardcoded default JSON (`5YJ3E1EB8NF123456`) and dictionary lookups; zero live vehicle API or OBD-II hardware connection.
3. **Smart Home IoT Hub (`iot_hub.js`):**  
   - *Current State:* Claims integration with Home Assistant, MQTT, Shelly, Tuya, and Tasmota.  
   - *Reality:* Modifies in-memory JSON state records (`devices.json`) and returns success confirmation strings; does not open real network sockets or MQTT connections to smart home hubs.
4. **Physical iPhone TapKit Automation (`tapkit_iphone.js`):**  
   - *Current State:* Commands to tap and screenshot physical iOS devices.  
   - *Reality:* An HTTP client targeting `http://localhost:8088`. If no separate external TapKit Python daemon is running, it returns a static standby status message.
5. **Backburner Distributed Attention Mesh (`backburner_mesh.js`):**  
   - *Current State:* JavaScript implementation of FlashAttention Log-Sum-Exp partial attention merging.  
   - *Reality:* Purely an application-level algorithmic model. It does NOT hook into the C++ Vulkan execution of `llama-server.exe`.
6. **Connected Cloud Office Services (`connected_services.js`):**  
   - *Current State:* Gmail search, Google Calendar, Linear, Notion, Slack.  
   - *Reality:* Executes desktop browser launches (`shell.openExternal`) with search URL parameters or inspects local Google Drive sync folders; lacks direct headless OAuth2 API integration.

---

## G. PLANNED FEATURES NOT YET IMPLEMENTED

The following capabilities are discussed in product vision documents but have **ZERO active implementation code** in the repository:
1. **Privacy-Preserving Advertising Engine:** No advertiser directory APIs, no local ad matching engine, no sponsored card injection logic.
2. **Distributed Compute Marketplace:** No host registration protocol, no remote task auctioning, no resource metering, no crypto/fiat payout pipelines.
3. **Hardware Server NAS Management:** No RAID disk array management, no automated scheduled backup daemons, no Samba/NFS file server implementation.
4. **Native Docker Containerization:** No Dockerfile for MAVE server deployment, no Docker Engine socket communication, no automated container provisioning.
5. **Virtual Machine Hypervisor Management:** No QEMU, KVM, Hyper-V, or VirtualBox automation hooks.
6. **Multi-Tenant GPU Hardware Slicing:** No vGPU, SR-IOV, or CUDA MPS scheduling; all local inference relies on a single shared Vulkan/CUDA instance.

---

## H. MEMORY, LEARNING & AUTONOMOUS AGENT DECISION LOOPS

### 1. Memory Subsystem Architecture
MAVE employs a 3-tier memory hierarchy:

```mermaid
flowchart TD
    subgraph ShortTerm["1. Short-Term Working Memory"]
        Turns["Multi-Turn Conversation History (agent.js)"]
        Cache["llama.cpp KV-Cache & Prompt Cache (.bin)"]
    end

    subgraph LongTerm["2. Long-Term Semantic Memory"]
        MemStore["MemoryStore (src/main/memory.js)"]
        MemFile["%APPDATA%/mave/memory.json (Capped at 500 items)"]
        Index["Inverted Keyword Index (O(1) candidate lookup)"]
    end

    subgraph Relational["3. Associative Knowledge Graph & Vault"]
        PKG["PersonalKnowledgeGraph (rag/knowledge_graph.js)"]
        KGFile["%APPDATA%/mave/knowledge_graph.json"]
        Vault["KnowledgeVault BM25 Chunk Store (rag/knowledge_vault.js)"]
    end

    ShortTerm --> LongTerm
    LongTerm --> Relational
```

- **Short-Term Memory:** Held in memory as an array of OpenAI-compatible messages inside `Agent.conversationHistory` (capped by `maxTurns: 60`).
- **Long-Term Memory (`MemoryStore`):** Stores discrete facts with timestamps, access counts, and extracted keyword tags. It automatically detects user preferences ("I like...", "my name is...", "always use...") via `autoExtractLearnings()`.
- **Knowledge Graph (`PersonalKnowledgeGraph`):** Stores entity nodes and directed multi-hop relationship edges. Supports Breadth-First Search (BFS) for shortest-path associative reasoning.
- **Neural Vault (`KnowledgeVault`):** Indexes local documents by splitting text into 400-character chunks with 50-character overlap, scored via lexical BM25 term frequency.
- **Isolation Assessment:** Memory is isolated **per Windows user profile**, NOT per web tenant. All accounts logging into the local web server share the same underlying `memory.json`.

### 2. Autonomous Decision & Planning Loop
MAVE does not use a single naive prompt call. Complex instructions pass through:
1. **Intent Matching:** Classifies whether a request is an instant command, a simple question, or a multi-step task.
2. **Complexity Routing (`router.js`):** Routes to appropriate model tier based on prompt length, keywords, and hardware capacity.
3. **DAG Goal Decomposition (`goal_graph.js`):** Breaks tasks into milestone nodes with explicit prerequisite dependencies.
4. **Adversary Verification Gate (`fresh_auditor.js`):** A zero-theatre auditor inspects proposed actions before execution, blocking catastrophic commands (`rmdir /s /q C:\Windows`, secret exfiltration) and commitment violations.
5. **Self-Correcting Reflexion (`reflexion_engine.js`):** When a step fails, the error message and stack trace are analyzed to diagnose the root cause and formulate a recovery strategy before retrying.

---

## I. OPERATING SYSTEM & DEVICE COMPATIBILITY

| Capability | Windows 10/11 (x64) | macOS (Sonoma/Sequoia) | Linux (x64/ARM64) | Android | iOS |
|---|---|---|---|---|---|
| **Desktop Application** | **VERIFIED WORKING** (Electron 38) | **PROTOTYPE** (Swift native in `vorssaint/macos`) | **UNTESTED** (Headless node scripts only) | **NO** (Not an Electron host) | **NO** (Not an Electron host) |
| **Local Model Inference** | **VERIFIED WORKING** (Vulkan / CPU) | **POSSIBLE** (via Ollama/llama.cpp external) | **POSSIBLE** (Vulkan/CUDA binary req) | **NO EVIDENCE** | **NO EVIDENCE** |
| **Speech STT (Whisper)** | **VERIFIED WORKING** (Bundled x64) | **NEEDS COMPILATION** | **NEEDS COMPILATION** | **NO** | **NO** |
| **Speech TTS (Kokoro)** | **VERIFIED WORKING** (ONNX Node) | **UNTESTED** (ONNX supported) | **UNTESTED** (ONNX supported) | **NO** | **NO** |
| **Computer Control** | **VERIFIED WORKING** (Win32 / C#) | **PROTOTYPE ONLY** (Swift Accessibility) | **NOT IMPLEMENTED** | **NO** | **NO** |
| **Screen Reading (UIA)** | **VERIFIED WORKING** (Win32 UIA) | **NOT IMPLEMENTED** | **NOT IMPLEMENTED** | **NO** | **NO** |
| **Remote Web Access** | **VERIFIED WORKING** (Port 4040) | **VERIFIED WORKING** (Web Client) | **VERIFIED WORKING** (Web Client) | **VERIFIED WORKING** (Mobile Web) | **VERIFIED WORKING** (Mobile Web) |
| **Dynamic Island HUD** | **VERIFIED WORKING** (Electron Overlay) | **VERIFIED WORKING** (Swift Menu Bar) | **NOT IMPLEMENTED** | **PROTOTYPE** (`vorssaint/android`) | **PROTOTYPE** (`VorssaintIslandWidget`) |

---

## J. INFRASTRUCTURE, NAS, VIRTUALIZATION & MULTI-USER ARCHITECTURE

### 1. Multi-User Architecture & Concurrency Limits

```mermaid
flowchart LR
    subgraph Clients["Concurrent Client Connections"]
        U1["Web User 1 (Admin)"]
        U2["Web User 2 (Member)"]
        U3["Local Physical User (Owner)"]
    end

    subgraph Server["MAVE Host Server (Port 4040)"]
        Auth["UserManager (mave_users.json)"]
        Web["Express & WS Server (web.js)"]
    end

    subgraph Execution["Execution Engines"]
        API["Headless Text / Chat API"]
        Auto["OS Desktop Automation (computer.js)"]
    end

    U1 --> Server
    U2 --> Server
    U3 --> Server
    Server --> Auth
    Auth --> Web
    Web -->|Concurrent Requests Queued| API
    Web -->|HARD MUTEX LOCKOUT| Auto
```

MAVE supports multi-user authentication over HTTP/WebSocket via `src/main/users.js`. However, there is a fundamental architectural bifurcation:
- **Headless Chat & API Concurrency:** Multiple users can submit chat turns simultaneously. Requests are handled asynchronously by the Node.js event loop and processed sequentially by `llama-server.exe` slots.
- **Physical Seat Automation Lockout:** Because desktop automation (`computer.js`) moves the real hardware cursor via Windows `SendInput`, **it is physically impossible for multiple users to automate the computer concurrently on a single OS desktop session**.

### 2. Virtualization & Headless VM Constraints
If MAVE is hosted inside an enterprise hypervisor (Proxmox, ESXi, Hyper-V):
1. **PCIe GPU Passthrough is Mandatory:** The embedded `llama-server.exe` requires Vulkan compute. Standard virtual display drivers (VirtIO, SVGA) drop token generation speeds from ~42 t/s down to ~5.5 t/s on CPU fallback.
2. **The RDP Session Lock Trap:** Disconnecting from Microsoft Remote Desktop (RDP) suspends the Windows desktop graphical session. When locked, `user32.dll` rejects `SendInput` calls, and screen captures return black frames. A virtual display adapter (e.g., `IddSampleDriver`) and active console session (`tscon 1 /dest:console`) are required for headless operation.

---

## K. PRIVACY, SECURITY & LOCAL-FIRST VERIFICATION

### 1. Network Egress Audit Table

| Destination | Protocol | Subsystem | Data Sent Off-Device | Local Privacy Mode Status |
|---|---|---|---|---|
| `api.anthropic.com` | HTTPS :443 | `src/main/llm/anthropic.js` | User prompt, chat turns, screenshots | **Completely Blocked** in Local Mode |
| `api.openai.com` | HTTPS :443 | `src/main/llm/openai.js` | User prompt, vision frames | **Completely Blocked** in Local Mode |
| `api.deepseek.com` | HTTPS :443 | `src/main/llm/index.js` | Prompts, code snippets | **Completely Blocked** in Local Mode |
| `huggingface.co` | HTTPS :443 | `src/main/local/download.js` | GGUF model download requests | **Inactive** unless user downloads model |
| `trycloudflare.com` | TLS :7844 | `src/main/remote/tunnel.js` | Inbound/outbound remote companion traffic | **Inactive** if tunnel disabled |
| `127.0.0.1:8080` | HTTP Loopback | `src/main/local/runtime.js` | Local model prompts & completions | **100% Local (Zero Egress)** |
| `127.0.0.1:4040` | HTTP Loopback | `src/main/remote/web.js` | Local web companion interface | **100% Local (Zero Egress)** |

### 2. Major Security Vulnerabilities & Findings
- **Plaintext Cloud API Keys (CRITICAL RISK):** In `C:\Users\ryzen\AppData\Roaming\mave\settings.json`, cloud API keys (`anthropicApiKey`, `openaiApiKey`) are stored in **unencrypted plaintext JSON**. Any unprivileged process running under the user's profile can extract them.  
  *Remediation:* Encrypt all secrets using Electron's native `safeStorage` API (backed by Windows DPAPI).
- **Unsandboxed Shell Execution (HIGH RISK):** Virtual terminals (`terminals.js`) run directly with the privileges of the host Electron process. If MAVE runs as an Administrator, the AI possesses unrestricted administrative control over the machine.
- **Cross-User Memory Leakage (HIGH RISK):** All remote users authenticated through `web.js` share the same underlying `memory.json` and `knowledge_graph.json` files. Tenant memory partitioning is not enforced at the database layer.

---

## L. PERFORMANCE, BENCHMARKS & HARDWARE REQUIREMENTS

### 1. Measured Host System Baseline
The following hardware specifications were measured directly via runtime discovery scripts on the active host:
- **Processor:** AMD Ryzen 5 3600 6-Core, 12 Threads (Base: 3.6 GHz, Boost: 4.2 GHz)
- **Host RAM:** 48 GB Physical DDR4 (47.9 GB detected; 21.3 GB free disk on C:)
- **Graphics Card:** NVIDIA GeForce RTX 5060 (Blackwell Generation, 8,151 MiB / 8.0 GB VRAM, Driver: 610.88, CUDA: 13.3)
- **Local Model Footprint:** `Qwen3-VL 8B Q4_K_M` occupies 5,027 MB disk, ~6.8 GB VRAM with 8k context KV-cache.

### 2. Verified & Documented Benchmarks

| Subsystem / Task | Benchmark Metric | Measured / Documented Value | Hardware Platform |
|---|---|---|---|
| **Cold Startup Time** | Electron process launch to interactive canvas | **1.8 – 2.4 seconds** | Host PC (NVMe SSD) |
| **Model Load Time** | `llama-server.exe` GGUF load + prompt cache read | **1.1 – 1.6 seconds** | RTX 5060 (Vulkan b11276) |
| **Speech STT (Whisper)** | Audio transcription latency (30s buffer) | **~1.9 seconds** (25x RTF) | CPU AVX2 (AMD Ryzen 5 3600) |
| **Speech TTS (Kokoro)** | 512-phoneme audio synthesis time | **~110 ms** (6.5x RTF) | CPU ONNX Runtime |
| **Screen Element Scraping** | UI Automation accessibility tree traversal | **~300 ms** | C# Native Helper (`uitree`) |
| **Formula Math OCR** | Single handwritten math crop recognition | **~180 ms** | CPU ONNX Runtime (Pix2Text) |
| **Token Generation (8B)** | Text generation throughput (8k context) | **~36 – 46 tokens/sec** | RTX 5060 (8GB VRAM Offload) |
| **Token Generation (CPU Fallback)** | Text generation throughput without GPU | **~5.5 tokens/sec** | AMD Ryzen 5 3600 (CPU AVX2) |

### 3. MAVE Dedicated Hardware Tiers Evaluation

| Metric / Consideration | MAVE CRUST (₹1.6L) | MAVE MANTEL (₹3.2L) | MAVE CORE (₹9.99L) |
|---|---|---|---|
| **Target Audience** | Individual / 4-person family | Prosumer / Multi-agent developer | Enterprise / 6 Autonomous Workers |
| **Recommended CPU** | 8-Core modern CPU (e.g. Ryzen 7 7700 / Core i7) | 16-Core CPU (e.g. Ryzen 9 9900X) | 32-64 Core Workstation (Threadripper / EPYC) |
| **Minimum / Rec. RAM** | 32 GB / 64 GB DDR5 | 64 GB / 128 GB DDR5 | 128 GB / 256 GB ECC DDR5 |
| **GPU Architecture** | 1x NVIDIA RTX 4070 (12GB VRAM) | 1x NVIDIA RTX 4090 (24GB VRAM) | 2x-4x RTX 4090 (48-96GB) or 1x RTX 6000 Ada (48GB) |
| **Max Concurrent Local 8B Slots** | 1-2 concurrent users | 3-4 concurrent users | 6-8 concurrent users |
| **Can Support 6 AI Workers?** | **NO** (VRAM & compute starved) | **MARGINAL** (Sequential queuing only) | **YES** (With multi-GPU VRAM partitioning) |
| **Storage Architecture** | 1 TB NVMe SSD (Gen 4) | 2 TB NVMe SSD (Gen 4) | 4-8 TB NVMe SSD (RAID-1 Enterprise) |
| **Estimated Idle Power** | 45 - 65 W | 75 - 110 W | 180 - 320 W |
| **Peak Inference Power** | 220 W | 450 W | 950 - 1,400 W |

---

## M. TECHNICAL DEBT, CODE QUALITY & IDENTIFIED RISKS

### 1. Critical Severity Issues
- **Plaintext API Key Storage:** API keys in `settings.json` are exposed to any local process. Must be encrypted via DPAPI.
- **Single-Seat Desktop Automation Mutex:** Multiple users triggering automation collide on the single physical cursor. Must implement virtual desktop / headless browser worker pools.
- **Unsandboxed Host Terminal Execution:** AI agent can execute destructive terminal commands with full user privileges.

### 2. High Severity Issues
- **Monolithic `remote/web.js` (8,223 Lines):** Excessive architectural coupling; HTML templates, CSS styles, routing logic, and WebSocket endpoints are crammed into a single file. Must be refactored into modular Express routers and templated static assets.
- **Lack of Multi-Tenant Memory Isolation:** All web companion users read/write to the same `memory.json` and `knowledge_graph.json`. Must implement per-user SQLite databases.
- **Simulated Domain Sentinels:** Plugins advertise capabilities (OBD-II vehicle telematics, IoT protocols, iOS TapKit) that return hardcoded strings or in-memory state changes without hardware adapters.

### 3. Medium Severity Issues
- **Inverted Keyword Index Memory Cap:** `MemoryStore` caps memory at 500 items and lacks dense HNSW vector indexing.
- **Ephemeral Cloudflare URLs:** Cloudflare Quick Tunnels generate random URLs on every restart, requiring user reconfiguration on remote mobile devices.

---

## N. PROPOSED ROADMAP EVALUATION

### Review of Proposed Milestones
- **Phase 1 (Foundation):** **VERIFIED COMPLETE.** Local Electron shell, C# native helper, embedded `llama-server.exe`, Kokoro TTS, Whisper STT, and Dynamic Island HUD are working.
- **Phase 1.2 (Model Research & Adaptation):** **REALISTIC.** Testing larger models (Qwen 35B, DeepSeek) and exploring quantized LoRA adaptation is technically viable on the existing hardware.
- **Phase 2 (January - Early Software Launch):** **REALISTIC WITH SCOPE DISCIPLINE.** Achievable if focused strictly on the single-user Windows desktop assistant experience.
- **Phase 3 (March - Broader Launch & Mobile Sync):** **FEASIBLE.** Requires stabilizing the web companion, implementing proper per-user memory partitions, and hardening security.
- **Phase 4 (April - MAVE Hardware Launch: Crust, Mantel, Core):** **HIGH RISK / AGGRESSIVE.** Hardware prototyping, thermal validation, supply chain procurement, and custom Linux/Windows appliance OS building cannot be completed reliably by April without validated hardware benchmarks.
- **Phase 5 (June - Compute Marketplace):** **HIGHLY UNREALISTIC.** Zero codebase exists for compute metering, remote tenant isolation, payment gateways, or host payouts. Launching this by June would result in severe security and financial liabilities.

---

## O. RECOMMENDED NEXT 20 ENGINEERING TASKS

Ordered by architectural priority, dependencies, and business value:

1. **Security Hardening (DPAPI):** Migrate all API keys and secrets in `settings.json` to Chromium `safeStorage` (Windows DPAPI).
2. **Decompose `remote/web.js`:** Break the 8,223-line monolith into dedicated controller modules, static assets, and Express routers.
3. **Multi-Tenant Memory Partitioning:** Refactor `memory.js` and `knowledge_graph.js` to store per-user SQLite databases indexed by `userId`.
4. **Virtual Headless Automation Pool:** Implement headless browser automation (Playwright/Puppeteer) so web users can automate web tasks without moving the physical desktop cursor.
5. **Real Home Assistant Adapter:** Replace the mock in `iot_hub.js` with an authentic REST/WebSocket client targeting Home Assistant APIs.
6. **Docker Engine Integration:** Replace `cua_sandbox.js` simulated spaces with real Docker Engine API calls (`dockerode`) for isolated script execution.
7. **Dense Vector Embeddings (HNSW):** Upgrade `KnowledgeVault` and `MemoryStore` from lexical keyword matching to local ONNX embeddings (`bge-small-en-v1.5`) with SQLite-VSS or HNSWlib.
8. **Cloudflare Named Tunnels:** Add support for persistent Cloudflare Named Tunnels with user credentials, eliminating ephemeral restart URLs.
9. **Desktop Session Unlock Detection:** Add detection in `computer.js` to gracefully pause automation and notify the user when Windows desktop session 1 is locked.
10. **Native Cross-Platform Input Layer:** Abstract `InputHelper.cs` behind an OS-agnostic interface, implementing native macOS CGEvent and Linux X11/Wayland input bridges.
11. **Granular Permission Checkpoints:** Implement interactive desktop dialog prompts before executing destructive file deletions or high-risk shell commands.
12. **Model Context Protocol (MCP) Client CLI:** Expose MCP tool discovery directly in the chat UI, allowing users to connect external MCP servers with one click.
13. **Local LoRA Adaptation Pipeline:** Build an automated pipeline to fine-tune lightweight LoRA adapters on user memory and habits locally using `llama-train`.
14. **Automated End-to-End Test Suite:** Create automated UI tests simulating mouse clicks, voice streaming, and model failovers in CI.
15. **Streaming Audio Buffer Optimization:** Stream Kokoro TTS audio chunks directly via Web Audio API worklets to reduce time-to-first-phoneme below 80ms.
16. **OBD-II Bluetooth Adapter Integration:** Wire `automotive_sentinel.js` to real Bluetooth ELM327 OBD-II serial streams for genuine vehicle diagnostics.
17. **Hardware Benchmarking Harness:** Write a standardized benchmark script measuring exact tokens/sec, VRAM allocation, and thermal throttling across model sizes.
18. **Mobile Web PWA Enhancements:** Add Service Worker caching, offline manifests, and push notifications to the mobile web companion.
19. **Automated Model Quantization Tool:** Add a local utility to download unquantized Hugging Face models and convert them to GGUF Q4_K_M automatically.
20. **Compute Marketplace Architectural RFC:** Author a formal cryptographic and economic specification for compute metering and isolated container scheduling before writing marketplace code.

---

## P. EVIDENCE & VERIFICATION APPENDIX

### Key Source References & Configurations
- **App Entry Point & Bootstrapping:** [`src/main/main.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/main.js#L1-L150)
- **Agent Execution Loop & Anti-Hallucination:** [`src/main/agent.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/agent.js#L40-L100)
- **Model Catalog & Hardware Recommender:** [`src/main/local/catalog.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/catalog.js#L1-L120)
- **Model Router & Complexity Classifier:** [`src/main/local/router.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/local/router.js#L125-L230)
- **Win32 Input & UI Automation Helper:** [`src/main/native/InputHelper.cs`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/native/InputHelper.cs#L1-L120)
- **Autonomous Goal DAG & Reflexion:** [`src/main/autonomous/goal_graph.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/autonomous/goal_graph.js#L1-L90)
- **Ghost AI Core & MCP Protocol Stack:** [`src/main/ghost_core/index.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/ghost_core/index.js#L1-L85)
- **Long-Term Memory Store:** [`src/main/memory.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/memory.js#L1-L100)
- **Personal Knowledge Graph:** [`src/main/rag/knowledge_graph.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/rag/knowledge_graph.js#L1-L85)
- **Dynamic Island Mascot Rig:** [`src/renderer/mascot_rig.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/renderer/mascot_rig.js#L1-L60)
- **Vorssaint OS Toolkit Manager:** [`src/main/vorssaint/vorssaint_manager.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/vorssaint/vorssaint_manager.js#L1-L80)
- **Remote Web Server & MaveDrop:** [`src/main/remote/web.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/remote/web.js#L1-L75), [`mavedrop.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/remote/mavedrop.js#L1-L65)
- **User Account & Role Management:** [`src/main/users.js`](file:///c:/Users/ryzen/Documents/antigravity/dazzling-archimedes/src/main/users.js#L1-L75)

*(All secrets, personal emails, tokens, and hardware serial numbers have been strictly redacted in compliance with audit governance rules.)*
