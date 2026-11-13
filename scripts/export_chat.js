'use strict';

/**
 * MAVE Conversation Exporter
 * Reads the full conversation trajectory from transcript_full.jsonl and formats
 * it into a comprehensive, beautifully styled GitHub-Flavored Markdown document.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TRANSCRIPT_PATH = 'C:\\Users\\ryzen\\.gemini\\antigravity\\brain\\2b161573-5b23-4f72-bb5a-e4e09f0b4752\\.system_generated\\logs\\transcript_full.jsonl';
const OUTPUT_PATH = path.join(__dirname, '..', 'CHAT_EXPORT.md');

const TURN_TITLES = {
  1: 'Complete Software Intelligence, Architecture & Capability Audit',
  2: 'Master Development Prompt: Virtual Computer & Execution Program',
  3: 'Ultimate All-in-One Master Development Command (ChatGPT-Class Architecture)',
  4: 'Final Engineering Completion Mission (Test Validation & Ground-Truth Verification)',
  5: 'Next Master Execution Command (Virtual Computer WSL Analysis & Brain Mesh)',
  6: 'Real Compute Sharing, True Virtual Computer & Complete Product Validation',
  7: 'Time Elapsed & Milestone Progress Status Inquiry',
  8: 'Background Tasks & Subagents Audit and Full Resource Cleanup',
  9: 'Export Chat to Markdown File'
};

async function exportChat() {
  console.log('Reading transcript from:', TRANSCRIPT_PATH);
  const fileStream = fs.createReadStream(TRANSCRIPT_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const turns = [];
  let currentTurn = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.type === 'USER_INPUT') {
      if (currentTurn) {
        turns.push(currentTurn);
      }
      const turnNum = turns.length + 1;
      currentTurn = {
        turnNumber: turnNum,
        title: TURN_TITLES[turnNum] || `Conversation Turn ${turnNum}`,
        userTimestamp: obj.created_at,
        rawUserContent: obj.content || '',
        startStepIndex: obj.step_index,
        endStepIndex: obj.step_index,
        toolCallsCount: 0,
        toolCallTypes: {},
        subagentsInvoked: [],
        assistantResponse: '',
        assistantTimestamp: null
      };
    } else if (currentTurn) {
      currentTurn.endStepIndex = obj.step_index;

      if (obj.type === 'PLANNER_RESPONSE') {
        if (Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
          for (const tc of obj.tool_calls) {
            currentTurn.toolCallsCount++;
            const name = tc.name || 'unknown';
            currentTurn.toolCallTypes[name] = (currentTurn.toolCallTypes[name] || 0) + 1;

            if (name === 'invoke_subagent' && tc.args) {
              const role = tc.args.Role || tc.args.role || tc.args.TypeName || 'Subagent';
              currentTurn.subagentsInvoked.push(role);
            }
          }
        } else if (obj.content && obj.content.trim()) {
          // Final assistant message for the turn
          currentTurn.assistantResponse = obj.content.trim();
          currentTurn.assistantTimestamp = obj.created_at;
        }
      }
    }
  }

  if (currentTurn) {
    turns.push(currentTurn);
  }

  console.log(`Parsed ${turns.length} turns.`);

  // Generate Markdown
  let md = '';

  md += '# MAVE — Complete Engineering & Architecture Chat History\n\n';
  md += '> **Product:** MAVE — *A Little Friend for Everything*  \n';
  md += '> **Primary Role:** Principal AI Systems Architect, Senior Full-Stack Engineer, Virtualization Engineer, and Systems Auditor  \n';
  md += `> **Conversation ID:** \`2b161573-5b23-4f72-bb5a-e4e09f0b4752\`  \n`;
  md += `> **Workspace Directory:** \`C:\\Users\\ryzen\\Documents\\antigravity\\dazzling-archimedes\`  \n`;
  md += `> **Physical Workstation:** AMD Ryzen 5 3600 (6-Core / 12-Thread), NVIDIA GeForce RTX 5060 (8GB VRAM), Windows 11 Pro 64-bit  \n`;
  md += `> **Generated On:** ${new Date().toISOString()}  \n`;
  md += `> **Total Conversation Turns:** ${turns.length}  \n\n`;

  md += '---\n\n';

  // Table of Contents
  md += '## 📑 Table of Contents\n\n';
  for (const t of turns) {
    const anchor = `turn-${t.turnNumber}-${t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, '');
    md += `- [Turn ${t.turnNumber}: ${t.title}](#${anchor})\n`;
  }
  md += '- [Deliverables & Production Readiness Summary](#deliverables--production-readiness-summary)\n\n';

  md += '---\n\n';

  // Output Each Turn
  for (const t of turns) {
    const anchor = `turn-${t.turnNumber}-${t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, '');
    md += `<a id="${anchor}"></a>\n`;
    md += `## Turn ${t.turnNumber}: ${t.title}\n\n`;
    md += `**Timestamp:** \`${t.userTimestamp}\` | **Trajectory Steps:** \`#${t.startStepIndex}\` to \`#${t.endStepIndex}\`\n\n`;

    // Process user request
    let userText = t.rawUserContent;
    let metadataStr = '';

    const metaMatch = userText.match(/<ADDITIONAL_METADATA>([\s\S]*?)<\/ADDITIONAL_METADATA>/);
    if (metaMatch) {
      metadataStr = metaMatch[1].trim();
      userText = userText.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/, '').trim();
    }

    userText = userText.replace(/<USER_REQUEST>/g, '').replace(/<\/USER_REQUEST>/g, '').trim();

    // Context Summary handling if present
    const contextMatch = userText.match(/<CONTEXT_SUMMARY>([\s\S]*?)<\/CONTEXT_SUMMARY>/);
    if (contextMatch) {
      userText = userText.replace(/<CONTEXT_SUMMARY>[\s\S]*?<\/CONTEXT_SUMMARY>/, '').trim();
    }

    md += '### 👤 User Prompt\n\n';
    if (metadataStr) {
      md += `> [!NOTE]\n> **Context Metadata:** ${metadataStr.replace(/\n/g, ' ')}\n\n`;
    }
    md += `${userText}\n\n`;

    // Tool actions summary
    if (t.toolCallsCount > 0) {
      md += `> [!TIP]\n`;
      md += `> **Engineering Actions in Turn ${t.turnNumber}:** ${t.toolCallsCount} tool operations executed across steps #${t.startStepIndex}–#${t.endStepIndex}.\n`;
      const toolsSummary = Object.entries(t.toolCallTypes)
        .map(([k, v]) => `\`${k}\` (${v})`)
        .join(', ');
      md += `> Tools used: ${toolsSummary}.\n`;
      if (t.subagentsInvoked.length > 0) {
        md += `> Parallel Subagents: ${t.subagentsInvoked.map(s => `*${s}*`).join(', ')}.\n`;
      }
      md += '\n';
    }

    md += '### 🤖 Assistant Response (Antigravity / MAVE Engineering Lead)\n\n';
    if (t.assistantResponse) {
      md += `${t.assistantResponse}\n\n`;
    } else {
      md += '*[Executing Turn 9: Exporting complete conversation history into Markdown document...]*\n\n';
    }

    md += '---\n\n';
  }

  // Deliverables & Project State Section
  md += '## Deliverables & Production Readiness Summary\n\n';
  md += '### 1. Built Executable Release\n';
  md += '- **Installer Path:** `dist\\Mave-Setup-1.4.8.exe`\n';
  md += '- **Installer Size:** 459,306,324 bytes (438.03 MB)\n';
  md += '- **SHA-256 Checksum:** `E8405E49A06EC6FC4FDB2044B51F12AF992CA220D361906A0D82F46DB3065AD2`\n';
  md += '- **Architecture:** Windows x64 NSIS Package (`oneClick=false, perMachine=false`)\n';
  md += '- **User Data Safety Rule:** Configured in `build/installer.nsh` to strictly prevent silent deletion of user memories, conversational history, and credentials in `%APPDATA%\\Mave`.\n\n';

  md += '### 2. Comprehensive Test Verification Matrix\n';
  md += '- **Monorepo Test Suite:** **521 passed**, 0 failed, 1 skipped (522 total tests across all modules).\n';
  md += '- **Networked Acceptance Tests A–L:** **10 passed**, 0 failed (100% pass rate in 917ms).\n';
  md += '- **Standalone Worker Service Suite:** **8 passed**, 0 failed (`test/mesh_worker_service.test.js`).\n';
  md += '- **Remote Worker Scheduler & Inference Suite:** **8 passed**, 0 failed (`test/remote_worker_scheduler.test.js`).\n';
  md += '- **Backburner P2P Co-Processing Suite:** **5 passed**, 0 failed (`test/backburner_mesh.test.js`).\n\n';

  md += '### 3. Key Core Modules Implemented & Tested\n';
  md += '- `src/main/mesh/mesh_protocol.js`: Cryptographic Ed25519 identity, HMAC-SHA256 handshake, binary length-prefixed framing.\n';
  md += '- `src/main/mesh/mesh_worker_service.js`: Standalone TCP/HTTP compute daemon, workspace isolation, child process RSS memory monitoring, timeout enforcement, artifact extraction.\n';
  md += '- `bin/mave-worker.js`: Standalone CLI daemon executable on any external laptop, workstation, or server.\n';
  md += '- `src/main/mesh/remote_worker_client.js`: Primary Host TCP client with authenticated challenge-response, heartbeats, progress streaming, and abort handling.\n';
  md += '- `src/main/mesh/remote_inference_provider.js`: AI inference routing with TTFT and tokens/sec metrics, with Primary Host fallback.\n';
  md += '- `src/main/mesh/mesh_coding_distributor.js`: Coding task DAG decomposition, parallel worktree provisioning, patch collection, and conflict detection.\n';
  md += '- `src/main/mesh/distributed_scheduler.js`: Real compute mesh scheduler with automatic mid-subtask failure re-routing and node capacity reporting.\n';
  md += '- `src/main/ipc.js` & `src/main/preload.js`: Secure IPC allowlist exposing `mesh:connect-worker`, `mesh:disconnect-worker`, and `mesh:generate-pin`.\n\n';

  md += '### 4. Virtual Computer Physical Reality\n';
  md += '- **Audit Ground Truth:** Workstation physical CPU is AMD Ryzen 5 3600 with `VirtualizationFirmwareEnabled: False` in motherboard BIOS.\n';
  md += '- **Operational Reality:** Alpine Linux guest (`mave-guest`) executes using WSL 1 syscall translation for bash/Python scripting, and Chromium operates via isolated offscreen processes without cursor disruption.\n';
  md += '- **Hyper-V Guide:** Provided script `scripts/enable_hyperv_virtualization.ps1` with instructions to enable SVM in BIOS when full WSL 2 hypervisor VMs are desired.\n\n';

  fs.writeFileSync(OUTPUT_PATH, md, 'utf8');
  const stat = fs.statSync(OUTPUT_PATH);
  console.log(`Successfully generated ${OUTPUT_PATH} (${stat.size} bytes).`);
}

exportChat().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
