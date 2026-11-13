'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function exportChat() {
  const fullLogPath = 'C:/Users/ryzen/.gemini/antigravity/brain/e55cd75d-8757-42fa-a2d6-9294d4937e9a/.system_generated/logs/transcript_full.jsonl';
  const outPath = path.resolve(__dirname, '../CHAT_EXPORT.md');

  if (!fs.existsSync(fullLogPath)) {
    console.error('Cannot find transcript_full.jsonl at', fullLogPath);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(fullLogPath),
    crlfDelay: Infinity
  });

  const turns = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        let content = obj.content || '';
        // Clean metadata tags if present
        content = content
          .replace(/^<USER_REQUEST>\r?\n?/i, '')
          .replace(/\r?\n?<\/USER_REQUEST>[\s\S]*$/i, '')
          .trim();
        turns.push({
          role: 'user',
          step: obj.step_index,
          time: obj.created_at,
          content
        });
      } else if (obj.type === 'PLANNER_RESPONSE' && obj.content && obj.content.trim()) {
        turns.push({
          role: 'assistant',
          step: obj.step_index,
          time: obj.created_at,
          content: obj.content.trim()
        });
      }
    } catch (e) {}
  }

  let md = '# MAVE — Full Conversation History & Engineering Mission Log\n\n';
  md += '**Product:** MAVE — A Little Friend for Everything  \n';
  md += '**Repository:** `C:\\Users\\ryzen\\Documents\\antigravity\\dazzling-archimedes`  \n';
  md += '**Conversation ID:** `e55cd75d-8757-42fa-a2d6-9294d4937e9a`  \n';
  md += '**Export Date:** ' + new Date().toISOString() + '  \n';
  md += '**Total Logged Turns:** ' + turns.length + '  \n\n';
  md += '---\n\n## Table of Contents\n\n';

  let userTurnCount = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role === 'user') {
      userTurnCount++;
      const firstLine = t.content.split('\n')[0].replace(/^[#\s\*\-]+/, '').trim().slice(0, 80) || ('Turn ' + userTurnCount);
      md += userTurnCount + '. [Turn ' + userTurnCount + ': ' + firstLine + '](#turn-' + userTurnCount + ')\n';
    }
  }

  md += '\n---\n\n';

  userTurnCount = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role === 'user') {
      userTurnCount++;
      const firstLine = t.content.split('\n')[0].replace(/^[#\s\*\-]+/, '').trim().slice(0, 80) || ('Turn ' + userTurnCount);
      md += '## Turn ' + userTurnCount + ': ' + firstLine + ' {#turn-' + userTurnCount + '}\n\n';
      md += '**Timestamp:** `' + t.time + '` | **Step Index:** `' + t.step + '`\n\n';
      md += '### 👤 User\n\n';
      md += t.content + '\n\n';
    } else {
      md += '### 🤖 Antigravity Assistant\n\n';
      md += '**Timestamp:** `' + t.time + '` | **Step Index:** `' + t.step + '`\n\n';
      md += t.content + '\n\n';
      md += '---\n\n';
    }
  }

  fs.writeFileSync(outPath, md, 'utf8');
  const stats = fs.statSync(outPath);
  console.log('Successfully wrote', outPath, 'Bytes:', stats.size);
}

exportChat().catch(err => {
  console.error(err);
  process.exit(1);
});
