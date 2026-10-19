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
• **ChatGPT (Your Account)** ➔ **The Central Cognitive Brain** (both high-level strategy and low-level step-by-step thinking & coordinate calculation).
• **Mave (On Your Windows PC)** ➔ **The Physical Nervous System**:
  - 👁️ **Eyes & Spatial Perception**: Full screen layout, cursor coordinates & UI elements (\`mave_see_screen_detailed\`, \`mave_find_screen_elements\`, \`mave_see_screen\`, \`mave_see_camera\`).
  - 🖐️ **Granular Motor Hands**: Precise pixel clicking (\`mave_mouse_click\`), moving (\`mave_mouse_move\`), scrolling (\`mave_mouse_scroll\`), typing (\`mave_keyboard_type\`), and hotkeys (\`mave_keyboard_press_key\`).
  - 📁 **Filesystem Access**: Read and write local files and source code (\`mave_read_file\`, \`mave_write_file\`, \`mave_list_files\`).
  - ⚡ **Terminal**: Direct PowerShell shell execution with stdout feedback (\`mave_run_terminal_command\`).
  - 🗣️ **Voice**: Physical room speaker voice broadcast (\`mave_speak\`).
  - 🤖 **Macro Delegation**: Optional high-level autonomous task delegation (\`mave_instruct\`).

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
