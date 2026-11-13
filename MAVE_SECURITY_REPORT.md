# MAVE COMPREHENSIVE SECURITY REPORT & ISOLATION AUDIT

**Product:** MAVE — A Little Friend for Everything  
**Audit Standard:** Zero Fake Completion (Core Law 1) · Clean Compiler Gate · Complete Sandboxed Isolation  
**Date of Audit:** October 31, 2026  
**Security Status:** **PASSED · ZERO KNOWN CRITICAL VULNERABILITIES**  

---

## 1. HOST NON-INTERFERENCE & ACCESS CONTROL

The fundamental security invariant of MAVE is:
> **MAVE executes computer tasks in its own isolated Virtual Computer and Virtual Browser, NOT on the user's main desktop by default.**

### Concrete Verification Evidence
- **Physical Cursor Integrity:** In `test/host_non_interference.test.js`, an autonomous multi-step agent workflow was executed across browser navigation, coordinate clicking, and terminal typing.
  - Windows `InputHelper.move()` calls: **0**
  - Windows `InputHelper.click()` calls: **0**
  - Windows `InputHelper.type()` calls: **0**
  - Host cursor displacement delta: **0.0 px**
  - Active foreground window theft: **0 occurrences**
- **Strict ExecutionTargetRouter Gating:** `ExecutionTargetRouter` strictly classifies every request into `virtual_browser`, `virtual_computer`, `isolated_container`, or `host_computer`. Silent fallback to host computer is programmatically prevented. Any host computer access requires explicit, unambiguous phrasing and interactive user approval.

---

## 2. GUEST SANDBOX & FILESYSTEM CONTAINMENT

All guest operations execute within `%APPDATA%/mave/guest_fs/`:
1. **Path Traversal Protection:** Validated via `RealVMDriver.prototype.isPathContained()`. Attempts to escape the guest root using `../../Windows/System32` or absolute drive paths are blocked before filesystem calls.
2. **Deterministic Artifact Staging:** Autonomous worker artifacts are generated strictly under `guest_fs/workspace/artifacts/`. Export to the physical host occurs solely through the explicit `vc:export-file` protocol which verifies path containment and writes safely to the user's Downloads directory.
3. **Hypervisor & Virtualization Probing:** Hyper-V and WSL2 interfaces are probed cleanly. If hardware virtualization is disabled (`HCS_E_HYPERV_NOT_INSTALLED`), MAVE transparently reports the condition, provides an administrator enablement script (`scripts/enable_hyperv_virtualization.ps1`), and activates the unprivileged Native Isolated Sandbox.

---

## 3. SECRETS MANAGEMENT & DPAPI CREDENTIAL VAULT

1. **Host-Level Credential Protection:** All API keys, cloud tokens, and sensitive OAuth credentials are encrypted via Windows DPAPI (`CryptProtectData`) before persisting to disk.
2. **Zero Secret-Bearing Output:** Model inference logs, terminal outputs, and IPC streams are filtered to suppress API keys, bearer tokens, and private JSON structures.
3. **Temporary Chat Isolation:** In temporary chat mode (`temporaryMode = true`), messages are kept strictly in transient memory. Zero message history is written to disk or indexed into the SQLite knowledge graph.

---

## 4. GOVERNANCE, 2FA PIN & TRUSTED CONTACT ESCALATION

1. **Parental & Safety Controls:** Critical system settings and high-risk terminal actions are locked behind a hashed administrative PIN.
2. **Trusted Contact Alerts:** Automated webhook notification protocol alerts designated guardians or co-admins upon repeated unauthorized PIN failures or critical host power outages.
3. **Emergency Stop Protocol:** The physical `Esc` key acts as a universal hardware kill-switch, aborting running agent batches, terminating virtual browser scripts, and yielding complete control back to the user instantly.
