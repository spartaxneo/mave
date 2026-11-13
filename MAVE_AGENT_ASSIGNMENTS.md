# MAVE AGENT ASSIGNMENTS & WORKSTREAM OWNERSHIP

**Master Orchestration Lead:** Principal Systems Architect & CTO  
**Coordination Protocol:** Non-overlapping file ownership, strict interface contracts, evidence-backed test verification.

---

## AGENT ROLES & FILE OWNERSHIP

### Agent A — Virtual Computer & Hypervisor Engineering
- **Domain:** Guest VM provisioning, lifecycle, display server, and guest filesystem.
- **Owned Modules:**
  - `src/main/virtual_computer/vm_manager.js`
  - `src/main/virtual_computer/display_server.js`
  - `src/main/virtual_computer/desktop_controller.js`
  - `src/main/virtual_computer/fs_bridge.js`
  - `src/main/virtual_computer/session.js`
- **Assigned Deliverable:** Fully operational guest virtual computer engine with independent framebuffer and lifecycle management.

### Agent B — Virtual Browser & Computer-Use Automation
- **Domain:** Isolated offscreen browser, tab management, visual and semantic automation.
- **Owned Modules:**
  - `src/main/virtual_computer/browser_controller.js`
  - `src/main/virtual_computer/tab_manager.js`
  - `src/main/virtual_computer/router.js`
  - `src/main/automation/browser_worker.js`
- **Assigned Deliverable:** Multi-tab isolated browser automation without host mouse/keyboard interference.

### Agent C — Security, Privacy & DPAPI Storage
- **Domain:** Secrets encryption, multi-tenant memory isolation, permission broker.
- **Owned Modules:**
  - `src/main/settings.js` (DPAPI safeStorage integration)
  - `src/main/security/vault.js`
  - `src/main/permission_broker.js`
- **Assigned Deliverable:** Zero plaintext secrets in storage, verified DPAPI encryption, and strict host/guest containment.

### Agent D — MAVE Brain & Model Health Routing
- **Domain:** Model routing, health probes, telemetry-aware complexity routing, AirLLM fallback.
- **Owned Modules:**
  - `src/main/local/router.js`
  - `src/main/local/runtime.js`
  - `scripts/benchmark_models.js`
- **Assigned Deliverable:** Dynamic model routing adapted to live VRAM/RAM telemetry with automatic health failover.

### Agent E — Mission Control & Autonomous DAG
- **Domain:** Goal DAG, Reflexion self-correction, independent worker pools.
- **Owned Modules:**
  - `src/main/autonomous/mission_controller.js`
  - `src/main/autonomous/goal_graph.js`
  - `src/main/autonomous/reflexion_engine.js`
- **Assigned Deliverable:** Multi-step autonomous planning engine with worker pools and verifiable outcome checks.

### Agent F — Memory, Life Graph & Skill Forge
- **Domain:** Per-user partitioned memory, associative knowledge graph, and Skill Forge.
- **Owned Modules:**
  - `src/main/memory.js`
  - `src/main/rag/knowledge_graph.js`
  - `src/main/evolution/skill_forge.js`
- **Assigned Deliverable:** Multi-tenant isolated memory store and skill learning/verification registry.

### Agent G — Frontend Virtual Computer Viewer & Companion
- **Domain:** Virtual computer canvas streamer, manual takeover mode, mascot HUD.
- **Owned Modules:**
  - `src/renderer/virtual_computer.html`
  - `src/renderer/virtual_computer.js`
  - `src/renderer/home.js` (navigation tab integration)
  - `src/renderer/app.html`
- **Assigned Deliverable:** Real-time visual display of MAVE's virtual computer in the UI with manual takeover.

### Agent L — Quality Assurance, Release & Verification
- **Domain:** Regression testing, non-interference verification suite, packaging.
- **Owned Modules:**
  - `test/virtual_computer.test.js`
  - `test/host_non_interference.test.js`
  - `test/mission_control_and_skills.test.js`
  - `MAVE_TEST_RESULTS.md`
  - `MAVE_RELEASE_READINESS.md`
- **Assigned Deliverable:** 100% passing test matrix proving host non-interference, multi-tenant isolation, and build integrity.
