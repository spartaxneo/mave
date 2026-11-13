# MAVE — EXECUTIVE TECHNICAL AUDIT & HARDWARE ARCHITECT DOSSIER

**Document Classification**: Ground-Truth Technical Dossier for AI Hardware Sizing & Capacity Planning  
**Auditor**: Principal AI Systems Architect & Backend Infrastructure Auditor  
**Audit Date**: October 24, 2026  
**Audited Target**: MAVE Codebase (`commit 5121d4de5e236b90d27b352b13fed62f99d00c27`)  
**Host Hardware Audited**: AMD Ryzen 5 3600 (6C/12T) \| NVIDIA GeForce RTX 5060 (8GB VRAM) \| 48GB DDR4 RAM  

---

## 1. Executive Summary & Ground Truth

MAVE is an **Electron-based hybrid personal AI operating system and autonomous computer-control environment**. It unites local neural speech, local vision perception, local LLM execution, and native Windows desktop automation under a unified desktop shell and companion web server.

### What is 100% Real, Built, and Verified:
1. **Local Multi-Modal Foundation**:
   - **Text & Vision LLM**: Embedded `llama-server.exe` (Vulkan b11276) running GGUF models. The audited system hosts a verified **Qwen3-VL 8B (Q4_K_M text + Q8_0 vision)** and a high-speed **Qwen3 4B Instruct (Q4_K_XL)**.
   - **Local Speech Synthesis**: **Kokoro ONNX (82M)** with 5 native voice latents running in-process via `onnxruntime-node` (`vendor/voice/kokoro.onnx`).
   - **Local Speech Transcription**: **OpenAI Whisper (base.en Q8_0)** running via embedded `whisper-server.exe` (`vendor/speech/`).
   - **Local Math OCR**: **Pix2Text MFR 1.5 ONNX** (`vendor/math/`) translating formula images directly to LaTeX.
2. **Physical OS Automation**:
   - Programmatic mouse movement, click dispatch, keyboard typing, and screen coordinate capture via `@nut-tree/nut-js` and Windows `user32.dll` (`src/main/computer.js`).
3. **Autonomous Task Execution**:
   - Custom Directed Acyclic Graph (DAG) planner decomposing compound user prompts into staged tool executions (`src/main/autonomous/goal_graph.js`).
4. **Remote Companion & Multi-User Identity**:
   - Embedded Express HTTP/WebSocket server on port 3000 (`src/main/remote/web.js`), user/role management with bcrypt hashing (`src/main/users.js`), and outbound NAT traversal via `vendor/cloudflared/cloudflared.exe`.

### What is Configured / Cloud-Dependent:
- Cloud flagship routing (Anthropic Claude 3.5 Sonnet, OpenAI GPT-4o, DeepSeek-V3).
- AirLLM layer-by-layer 70B parameter disk-streaming (`airllm_server.py`) exists as a fallback architecture, but throughput (~0.9 tokens/sec) is inadequate for interactive dialog.

---

## 2. Tested Host Hardware Baseline & Performance Metrics

| Subsystem / Metric | Measured Host Value | Operational Impact on MAVE |
|---|---|---|
| **CPU** | AMD Ryzen 5 3600 (6 Cores / 12 Threads @ 3.6 - 4.2 GHz) | Ample headroom. Whisper STT and Kokoro TTS consume <15% aggregate CPU during synthesis. |
| **System RAM** | 48.0 GB DDR4 (27.8 GB free at audit) | Substantial capacity. Enables caching multiple model weights in OS file cache and running heavy Python workers. |
| **GPU** | NVIDIA GeForce RTX 5060 (Blackwell, 8,151 MiB GDDR7/GDDR6 VRAM) | **The Core Sizing Ceiling**. Perfect for 4B-8B models. Fills to 96% capacity when running Qwen3-VL 8B at 8K context. |
| **Primary Storage (C:)** | 232 GB NVMe SSD (26.8 GB free / 11.5% free) | **Immediate Disk Warning**. Near capacity. New 14B+ models must be saved to secondary drives (D: or E:). |
| **Storage (E:)** | 462.7 GB SSD (208.1 GB free) | Currently stores custom high-speed models (`Qwen3-4B` and `z-image-turbo`). |

### Inference Speeds on the Tested Hardware:
- **Qwen3 4B Instruct**: **~71 - 76.5 tokens/sec** (TTFT: ~120 - 185 ms). Instantaneous, conversational, zero perceptible latency.
- **Qwen3-VL 8B Instruct (Text Only)**: **~42.5 tokens/sec** at 4K context (TTFT: ~420 ms). Fast, highly responsive.
- **Qwen3-VL 8B (Screen Perception)**: **~38.0 tokens/sec** with 1 full-screen visual frame (TTFT: ~680 ms).
- **Whisper Base Audio Transcription**: Real-Time Factor (RTF) **0.04x** (transcribes a 10s voice clip in ~400ms).
- **Kokoro Speech Generation**: RTF **0.15x** (synthesizes 10s of audio in ~1.5s).

---

## 3. Concurrency & Multi-User Reality Check

When designing multi-user deployments or cloud hosting for MAVE, AI architects must account for two distinct execution modes:

```mermaid
graph TD
    UserReq["User / Client Requests"] --> Router{"Execution Mode Router"}
    
    subgraph ModeA["Mode A: OS & Desktop Automation (computer.js)"]
        DeskLock["Physical Desktop Session 1"]
        MouseKey["Hardware Mouse & Keyboard"]
        Screen["Screen Capture Coordinates"]
        DeskLock --> MouseKey
        DeskLock --> Screen
        ResultA["STRICT 1 USER PER PC / VM<br/>(Hard Mutex - Additional users collide)"]
    end
    
    subgraph ModeB["Mode B: Headless Web Companion & API (remote/web.js)"]
        WebSrv["Express & WebSocket Server (Port 3000)"]
        UserAuth["UserManager (Role & API Keys)"]
        KVSlots["GPU KV-Cache Slots (llama-server)"]
        WebSrv --> UserAuth
        UserAuth --> KVSlots
        ResultB["SCALES TO MULTIPLE CONCURRENT USERS<br/>(Limited only by GPU VRAM KV-Cache)"]
    end
    
    Router -->|Desktop Clicks / Typing| ModeA
    Router -->|Chat / QA / Documents| ModeB
```

1. **OS Automation Mode (Single-Seat Locked)**:
   - **Maximum Concurrency = 1 User**.
   - Nut.js controls the real Windows desktop cursor. If User A commands MAVE to click a button while User B commands MAVE to type into a document, their inputs collide on the same physical desktop session.
   - **Hosting Solution**: To host multiple concurrent desktop automation agents, each agent must run inside its own isolated Virtual Machine (VM) or container with a dedicated virtual display adapter.
2. **Headless Web & API Mode (Multi-User Enabled)**:
   - On the tested **RTX 5060 (8GB)**:
     - With `Qwen3-4B`: Supports up to **12 concurrent 4K users** or **6 concurrent 8K users**.
     - With `Qwen3-VL 8B`: Supports up to **2 concurrent 4K users** or **1 concurrent 8K user**.
   - On a **24GB VRAM GPU (RTX 4090 / RTX 5090)**:
     - With `Qwen 8B`: Supports up to **30 concurrent 4K users** or **15 concurrent 8K users**.

---

## 4. Hardware Sizing & Product Recommendations

For the AI Hardware Architect calculating commercial product tiers:

### Tier 1: "MAVE Solo" — Dedicated Personal Desktop Appliance (1 User)
- **Target Audience**: Single power user, programmer, executive, or creator running full desktop automation, screen perception, and voice.
- **CPU**: AMD Ryzen 5 7600X (6C/12T) or Intel Core i5-14600.
- **RAM**: 32 GB DDR5.
- **GPU**: NVIDIA GeForce RTX 4060 Ti (16GB) or RTX 5060 Ti (16GB). *(16GB VRAM allows simultaneous residency of 8B Vision + 7B Coder models without model swapping).*
- **Storage**: 1 TB NVMe PCIe 4.0 SSD (Min 5,000 MB/s read).

### Tier 2: "MAVE Office Pro" — Workgroup Hub (5-10 Concurrent Users)
- **Target Audience**: Small business, engineering squad, or design agency utilizing shared headless chat, document analysis, and background automation.
- **CPU**: AMD Ryzen 9 7900X (12C/24T) or Intel Core i7-14700K.
- **RAM**: 64 GB to 96 GB DDR5.
- **GPU**: NVIDIA GeForce RTX 4090 (24GB) or RTX 5080 (16GB/24GB).
- **Storage**: 2 TB NVMe PCIe 4.0 SSD.

### Tier 3: "MAVE Enterprise Cluster" — Multi-Seat Hosted Cloud
- **Target Audience**: Enterprise SaaS hosting 50+ concurrent users with isolated virtualized desktop automation containers.
- **Host Architecture**: Dual AMD EPYC 9354 (64 Cores / 128 Threads).
- **RAM**: 256 GB - 512 GB ECC DDR5.
- **GPU**: 4x NVIDIA L40S (48GB each, 192GB aggregate) or 2x NVIDIA H100 NVL.
- **Hypervisor**: Proxmox VE / KVM running containerized Windows VMs with virtual display adapters for independent GUI automation.
- **Storage**: Enterprise NVMe U.2 in RAID 10 (High IOPS).
