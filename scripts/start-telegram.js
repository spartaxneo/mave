'use strict';
// Standalone runner for Bigfoot's Telegram Bot Bridge.
// Run this directly with: node scripts/start-telegram.js
// Or Bigfoot will auto-start it when you run: npm start

const { TelegramBridge, loadTelegramConfig, saveTelegramConfig } = require('../src/main/remote/telegram');

async function main() {
  const config = loadTelegramConfig();
  const token = process.env.TELEGRAM_BOT_TOKEN || config.token;

  if (!token) {
    console.error('No Telegram Bot Token found. Run start_telegram_bot or set TELEGRAM_BOT_TOKEN.');
    process.exit(1);
  }

  console.log('Connecting to Telegram Bot API...');
  const bridge = new TelegramBridge({
    token,
    authorizedChatId: config.authorizedChatId || null,
    controller: global.__bigfootController || null,
    logger: console,
  });

  try {
    const info = await bridge.verifyToken();
    console.log(`\n========================================`);
    console.log(`🤖 Telegram Bot Online: @${info.username}`);
    console.log(`   Bot Name: ${info.first_name}`);
    console.log(`   Pairing Status: ${config.authorizedChatId ? `Paired to chat ID ${config.authorizedChatId}` : 'Awaiting first /start message to pair'}`);
    console.log(`========================================\n`);
    console.log(`To control Mave from your phone:`);
    console.log(`1. Open Telegram on your phone.`);
    console.log(`2. Search for @${info.username}`);
    console.log(`3. Send "/start" to connect!`);
    console.log(`\nAvailable commands on Telegram:`);
    console.log(`• /screen  - Get live desktop screenshot`);
    console.log(`• /status  - System diagnostics (CPU, RAM, GPU, storage)`);
    console.log(`• /lock    - Lock your Windows workstation`);
    console.log(`• Or type any task/question for Mave to execute!\n`);

    bridge.start();

    process.on('SIGINT', () => {
      console.log('\nStopping Telegram bridge...');
      bridge.stop();
      process.exit(0);
    });
  } catch (err) {
    console.error(`Failed to connect to Telegram bot:`, err.message);
    process.exit(1);
  }
}

main();
