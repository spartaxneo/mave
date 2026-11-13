# MAVE SPECIALIZED AGENT TASK BOARD & OWNERSHIP TABLE

## 1. AGENT OWNERSHIP MATRIX

| Agent Role | Assigned Objective | Owned Directories & Files | Key Dependencies | Deliverables & Acceptance Criteria | Current Status |
|---|---|---|---|---|---|
| **AGENT 1: Security & Privacy Engineer** | Encrypt secrets via DPAPI (`safeStorage`), hash web passwords, enforce zero-leakage policies. | `src/main/settings.js`, `src/main/security/*`, `test/totp_and_settings.test.js`, `test/security_hardening.test.js` | Electron `safeStorage`, Node `crypto` | 100% of API keys and passwords encrypted on disk; zero plaintext secrets in publicView or logs. | **IN PROGRESS (Phase A)** |
| **AGENT 2: Local AI & Inference Engineer** | Hardware-aware routing, model health monitoring, fallback handling, benchmark harness. | `src/main/local/*`, `scripts/benchmark_models.js`, `test/router.test.js`, `test/model_benchmarks_router.test.js` | `llama-server.exe`, Vulkan GPU | Accurate classification by hardware limits, automated reproducible benchmark script. | **IN PROGRESS (Phase A)** |
| **AGENT 3: Memory & Learning Engineer** | Multi-user memory partitioning, procedural memory store, knowledge graph isolation. | `src/main/memory.js`, `src/main/rag/*`, `test/knowledge_graph.test.js`, `test/multi_user_memory.test.js` | User authentication identities (`userId`) | Strict isolation between tenants; user A cannot access user B's facts or graph nodes. | **IN PROGRESS (Phase A)** |
| **AGENT 4: Autonomous Agent Engineer** | ReAct loop resilience, Goal DAG persistence, reflexion recovery, task scheduling. | `src/main/agent.js`, `src/main/autonomous/*`, `test/agent.test.js`, `test/autonomous_goal_graph.test.js` | Plugins registry, LLM router | Interruptible long-running DAG tasks, verifiable action outcomes, zero fake completion. | **QUEUED (Phase B)** |
| **AGENT 5: Computer & Browser Automation Engineer** | Headless browser worker pool, Windows Session 1 lock detection, UI Automation resilience. | `src/main/computer.js`, `src/main/automation/*`, `src/main/native/InputHelper.cs`, `test/browser_worker_and_simulators.test.js` | Win32 API, Playwright / CDP | Non-disruptive headless web tasks, graceful pause on locked desktop session. | **IN PROGRESS (Phase A)** |
| **AGENT 6: Networking & Device Ecosystem Engineer** | Authenticated MAVE Mesh, P2P MaveDrop, encrypted LAN WebSocket pairing. | `src/main/remote/mesh_discovery.js`, `src/main/remote/mavedrop.js`, `test/remote.test.js` | UDP sockets, Node HTTP/WS | Mutual authentication of paired devices, chunked file transfer with hash verification. | **QUEUED (Phase C)** |
| **AGENT 7: Infrastructure & Hosting Engineer** | Real Docker Engine integration, container sandboxing, multi-user resource quotas. | `src/main/plugins/builtin/cua_sandbox.js`, `src/main/infrastructure/*` | Docker Engine API / socket | Authentic container creation, startup, execution, and cleanup with resource limits. | **QUEUED (Phase C)** |
| **AGENT 8: Frontend, UX & Companion Engineer** | Desktop companion mascot, Dynamic Island HUD, tactile animations, settings dashboard. | `src/renderer/*`, `src/main/windows.js` | Electron Chromium renderer | Subtle tactile animations, responsive Dynamic Island states, zero layout shift. | **STANDBY (Preserving working state)** |
| **AGENT 9: Monetization & Marketplace Engineer** | Privacy-preserving contextual advertising architecture, compute metering protocol. | `src/main/monetization/*` | Feature flags (default disabled) | Disabled-by-default architecture prototype, zero exfiltration of user data. | **QUEUED (Phase D)** |
| **AGENT 10: QA, Testing & Integration Engineer** | Test execution, regression coverage, benchmark validation, release-readiness audits. | `test/*`, `scripts/*` | Node test runner, system telemetry | Automated regression passes across all modified modules with 0 failures and 0 warnings. | **ACTIVE (Continuous)** |

---

## 2. COHORT ALLOCATION FOR IMMEDIATE PARALLEL IMPLEMENTATION

### Cohort 1: Phase A Foundation Stabilization (Concurrently Executed)
- **Workstream 1A (Security):** `src/main/settings.js` secret hardening + DPAPI encryption + password hashing.
- **Workstream 1B (Memory):** `src/main/memory.js` & `src/main/rag/knowledge_graph.js` multi-tenant user scoping (`userId`).
- **Workstream 1C (Automation & Simulators):** `src/main/computer.js` lock detection + `src/main/automation/browser_worker.js` + simulation labeling for mock sentinels.
- **Workstream 1D (Model Routing & Benchmarking):** `src/main/local/router.js` enhancements + `scripts/benchmark_models.js`.

**File Collision Prevention Rule:** Zero files are shared across Workstreams 1A, 1B, 1C, and 1D.
