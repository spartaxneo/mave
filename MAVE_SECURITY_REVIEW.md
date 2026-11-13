# MAVE — SECURITY & PRIVACY REVIEW (AUDIT & HARDENING ROADMAP)

## 1. THREAT MODEL & SECURITY POSTURE

MAVE operates as a privileged local desktop assistant and network gateway. The primary threat boundaries are:
1. **Local Privilege Escalation & Secret Theft:** Malicious unprivileged local processes attempting to extract stored cloud API keys, session tokens, or personal conversation logs from disk.
2. **Remote Web Companion Unauthorized Ingress:** Unauthenticated or unauthorized network users attempting to control the desktop OS via the embedded HTTP/WebSocket gateway.
3. **Cross-Tenant Information Disclosure:** In multi-user setups (e.g., family or small business server), tenant A accessing private memories, credentials, or tasks belonging to tenant B.
4. **Unsandboxed Command Injection:** Malicious or hallucinated agent prompts invoking destructive system commands (`rmdir /s /q`, system file overwrites, unvetted PowerShell scripts).
5. **Silent Cloud Data Exfiltration:** Private screenshots, clipboard entries, or documents being transmitted to external cloud APIs without explicit user consent.

---

## 2. AUDITED VULNERABILITIES & REMEDIATION STATUS

| Vulnerability ID | Description | Severity | Initial Audit State | Remediation Strategy | Status in Phase A |
|---|---|---|---|---|---|
| **SEC-01** | Plaintext API Keys in `settings.json` | **CRITICAL** | Plaintext keys on disk | Encrypt all secrets via Windows DPAPI (`safeStorage.encryptString()`) | **IN REMEDIATION** |
| **SEC-02** | Plaintext Remote Passwords | **HIGH** | Default passwords ('8080', '0509', '1508') stored in plaintext | Migrate to bcrypt / PBKDF2 salt-hashed password verification | **IN REMEDIATION** |
| **SEC-03** | Multi-Tenant Memory Leakage | **HIGH** | All web users share single `memory.json` | Partition stores by `userId` into isolated directories | **IN REMEDIATION** |
| **SEC-04** | Unsandboxed ConPTY Shell Execution | **HIGH** | Commands run with full host process privileges | Restrict destructive system directory access; enforce user approval | **MITIGATED (Adversary Auditor)** |
| **SEC-05** | Cloud Egress in Local Mode | **MEDIUM** | Potential fallback leaks | Hard block on cloud SDK network calls when `provider: "local"` | **VERIFIED BLOCKED** |
| **SEC-06** | Ephemeral Cloudflare Tunnel URLs | **MEDIUM** | Random tunnel hostnames | Support persistent named tunnels with user credentials | **QUEUED (Phase D)** |
| **SEC-07** | Foreign Backend Cross-Pollution | **CRITICAL** | Foreign project backend IDs lingering | Enforce strict single-project backend isolation (LR-146) | **VERIFIED HARDENED** |

---

## 3. DPAPI CREDENTIAL ENCRYPTION ARCHITECTURE
- Electron's `safeStorage` uses the Windows Data Protection API (DPAPI).
- Encryption keys are tied to the local Windows user profile login credentials.
- Even if an attacker copies the `settings.json` file to another computer or user account, DPAPI decryption fails gracefully, protecting credentials.
- All alias variants (`anthropicKey`, `anthropicApiKey`, `openaiKey`, `openaiApiKey`) are handled uniformly and normalized.

---

## 4. MULTI-TENANT ISOLATION SPECIFICATION
- Each authenticated user is assigned a deterministic ID: `usr_<uuid>`.
- Storage paths are isolated under `%APPDATA%/mave/users/${userId}/`.
- When an agent executes a query on behalf of a user, the memory context injected into the prompt is strictly filtered by the session's active `userId`.
- Deleting a user account invokes a cryptographic erasure of that user's data directory.

---

## 5. STRICT SOVEREIGN BACKEND ISOLATION MANDATE (LR-146)
- **Principle**: Zero foreign backend pollution. No project backend (Firebase, Supabase, Cloud DB, Telegram Bots, Auth domains) may ever be mixed or reused across different projects.
- **Enforcement**:
  1. MAVE binds exclusively to `mave-assistant-9026` across all Firebase endpoints, Firestore databases, auth domains, and storage buckets.
  2. Telegram Bot tokens and default usernames bind exclusively to MAVE infrastructure (`@MaveAssistant_bot`).
  3. All project seeds, default settings, and test suites validate only sovereign MAVE backend assets.

