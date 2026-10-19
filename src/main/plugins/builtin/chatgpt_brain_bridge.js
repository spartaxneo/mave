'use strict';
// ChatGPT Brain & Mave Nervous System Bridge Plugin.

const { getChatGPTNervousSystemBridge } = require('../../chatgpt_brain/chatgpt_bridge');

module.exports = [
  {
    name: 'get_chatgpt_brain_setup',
    description: 'Generates the 1-click Custom GPT setup configuration, OpenAPI 3.1 action manifest, and direct instructions to turn the user’s ChatGPT account into the Brain and Mave into its physical Hands & Eyes.',
    input_schema: {
      type: 'object',
      properties: {
        public_url: { type: 'string', description: 'Optional Cloudflare, ngrok, or Tailscale public tunnel URL (defaults to local LAN URL).' }
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      const bridge = getChatGPTNervousSystemBridge();
      const baseUrl = (input.public_url && input.public_url.trim()) ? input.public_url.trim().replace(/\/$/, '') : `http://localhost:${bridge.port}`;

      ctx.log('info', `Generating ChatGPT Brain setup manifest for: ${baseUrl}`);

      const openApiUrl = `${baseUrl}/api/chatgpt/openapi.json`;
      const instructions = bridge.getCustomGptInstructions(baseUrl);

      return `🧠 **CHATGPT CENTRAL BRAIN + MAVE NERVOUS SYSTEM (HANDS & EYES) SETUP**:

### 1. What This Connects:
• **ChatGPT (Your Account)** ➔ **The Central Brain** (high-level reasoning, vision cognition, voice planning, strategy).
• **Mave (On Your Windows PC)** ➔ **The Physical Nervous System**:
  - 👁️ **Eyes**: Screen perception (\`mave_see_screen\`) and room camera (\`mave_see_camera\`).
  - 🖐️ **Hands**: Physical mouse clicking, typing, hotkeys, and app launching (\`mave_execute_action\`).
  - ⚡ **Terminal**: Direct PowerShell shell execution with stdout feedback (\`mave_run_terminal_command\`).
  - 🗣️ **Voice**: Physical room speaker voice broadcast (\`mave_speak\`).

---

### 2. Turnkey Setup in 60 Seconds:
1. Open **[chatgpt.com/gpts/editor](https://chatgpt.com/gpts/editor)** (or your ChatGPT mobile app).
2. Name your GPT: **Mave Central Brain**
3. Under **Instructions**, paste this:
\`\`\`markdown
${instructions}
\`\`\`
4. Click **Create new action** at the bottom of the GPT configuration.
5. In **Import from URL**, enter:
\`\`\`text
${openApiUrl}
\`\`\`
*(Or copy the raw JSON from \`${openApiUrl}\`)*.
6. Click **Save** (Only me / Anyone with a link).

---

### 3. How to Use It:
Anytime you chat with your GPT on iPhone, Android, or Web:
• *"Look at my screen, what error is showing?"* ➔ ChatGPT calls \`mave_see_screen\`, reads your code, and gives you the fix.
• *"Fix that bug in PowerShell and run tests"* ➔ ChatGPT calls \`mave_run_terminal_command\` directly on your PC!
• *"Where did I leave my keys?"* ➔ ChatGPT calls \`mave_see_camera\` and looks around your room!
• *"Open Spotify and put on study music"* ➔ ChatGPT uses Mave's hands to launch Spotify and start playback!`;
    },
  },

  {
    name: 'chatgpt_brain_status',
    description: 'Checks the active connectivity and health of the ChatGPT Nervous System Bridge.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async run(input, ctx) {
      const bridge = getChatGPTNervousSystemBridge();
      const status = await bridge.getSystemStatus();

      return `⚡ **MAVE NERVOUS SYSTEM BRIDGE STATUS**:
• **Role**: ${status.role}
• **Host Machine**: \`${status.host}\` (${status.platform} ${status.osRelease})
• **Gateway Port**: \`${bridge.port}\` (HTTP) / \`${bridge.port + 3}\` (HTTPS)
• **Active Window**: "${status.activeWindow}"
• **Nervous System State**: **${status.status}**
• **OpenAPI Schema Endpoint**: \`http://localhost:${bridge.port}/api/chatgpt/openapi.json\``;
    }
  }
];
