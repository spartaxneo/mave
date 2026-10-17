'use strict';
// Remote Phone Control Plugin for Bigfoot.
// Exposes tools to activate the Local Wi-Fi Web Controller and the Telegram Bot Bridge.

const { MobileWebServer, getLocalIp } = require('../../remote/web');
const { TelegramBridge, saveTelegramConfig, loadTelegramConfig } = require('../../remote/telegram');

let activeWebServer = null;
let activeTelegramBridge = null;

module.exports = [
  {
    name: 'start_mobile_web_controller',
    description: 'Start the local Wi-Fi mobile web controller on your home network so you can command Mave from your phone browser.',
    input_schema: {
      type: 'object',
      properties: {
        port: {
          type: 'number',
          description: 'Port number to listen on (default 4040).',
        },
      },
      required: [],
    },
    async run(input, ctx) {
      const port = Number(input.port) || 4040;
      if (!activeWebServer) {
        activeWebServer = new MobileWebServer({
          controller: global.__maveController || global.__bigfootController || null,
          logger: console,
          port,
        });
        await activeWebServer.start();
      }

      const lanUrl = `http://${getLocalIp()}:${port}`;
      ctx.log('info', `Mobile controller live at: ${lanUrl}`);
      return `Mave Mobile Web Controller is LIVE!\n\nOpen this link on your phone (connected to the same Wi-Fi):\n👉 ${lanUrl}\n\nFeatures available on your phone:\n• Voice microphone button (tap to speak)\n• Instant task input & command execution\n• Live desktop screen viewer\n• Hardware telemetry diagnostics\n• Quick actions (lock PC, media play/pause)`;
    },
  },
  {
    name: 'start_telegram_bot',
    description: 'Activate the Telegram Bot bridge to command Mave and receive screenshots directly on Telegram from your phone.',
    input_schema: {
      type: 'object',
      properties: {
        bot_token: {
          type: 'string',
          description: 'The Telegram Bot API token obtained from @BotFather (optional if already configured).',
        },
        authorized_chat_id: {
          type: 'string',
          description: 'Optional Telegram Chat ID to whitelist. If omitted, the first person to send /start will be paired.',
        },
      },
      required: [],
    },
    async run(input, ctx) {
      const saved = loadTelegramConfig();
      const token = String(input.bot_token || saved.token || '').trim();
      if (!token) throw new Error('A Telegram Bot Token is required.');
      saveTelegramConfig({ token });

      if (activeTelegramBridge) {
        activeTelegramBridge.stop();
        activeTelegramBridge = null;
      }

      const bridge = new TelegramBridge({
        token,
        authorizedChatId: input.authorized_chat_id ? String(input.authorized_chat_id).trim() : null,
        controller: global.__maveController || global.__bigfootController || null,
        logger: console,
      });

      const botInfo = await bridge.verifyToken();
      bridge.start();
      activeTelegramBridge = bridge;

      ctx.log('info', `Telegram bot @${botInfo.username} connected and listening`);
      return `Telegram Bot @${botInfo.username} is now ACTIVE!\n\nTo control Mave from your phone:\n1. Open Telegram on your phone.\n2. Search for @${botInfo.username} and send "/start".\n3. You can now command Mave, view live desktop screenshots (/screen), check hardware (/status), and lock your PC (/lock) from anywhere!`;
    },
  },
  {
    name: 'get_remote_control_status',
    description: 'Check the status and connection URLs for Mave phone control (Local Wi-Fi and Telegram).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async run(_input, ctx) {
      const webRunning = Boolean(activeWebServer && activeWebServer.server);
      const tgRunning = Boolean(activeTelegramBridge && activeTelegramBridge.running);
      const lanUrl = `http://${getLocalIp()}:4040`;

      return `REMOTE PHONE CONTROL STATUS:
• Local Wi-Fi Web Controller: ${webRunning ? 'ONLINE' : 'OFFLINE'}
  ${webRunning ? `URL: ${lanUrl}` : 'Use start_mobile_web_controller to launch'}
• Telegram Bot Bridge: ${tgRunning ? 'ONLINE' : 'OFFLINE'}
  ${tgRunning ? 'Listening for messages on Telegram' : 'Use start_telegram_bot with your token to connect'}`;
    },
  },
];
