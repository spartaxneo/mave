'use strict';
// Speech Verbalizer: Prepares raw markdown text into fluid, natural spoken English.
// Adapted from OpenMausBot (milind-soni/OpenMausBot) server/tts/speech-text.ts.
// Removes code fence noise, formats markdown tables into conversational phrases,
// cleans long URLs and paths, and strips emojis so Kokoro and device TTS speak cleanly.

function describeCodeBlock(fence) {
  const clean = String(fence || '').replace(/[`~]/g, '').trim();
  const lang = (clean.split(/\s+/)[0] || '').replace(/[^a-z0-9+#]/gi, '').toLowerCase();
  const spokenLanguages = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    python: 'Python',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    powershell: 'PowerShell',
    ps1: 'PowerShell',
    json: 'JSON',
    yml: 'YAML',
    yaml: 'YAML',
    sql: 'SQL',
    rs: 'Rust',
    go: 'Go',
    cpp: 'C plus plus',
    cs: 'C sharp',
    swift: 'Swift',
    html: 'HTML',
    css: 'CSS',
    diff: 'code diff',
  };
  const name = spokenLanguages[lang];
  return name ? `. (a ${name} code block) ` : '. (a code block) ';
}

function shortenPaths(text) {
  return text.replace(/(?:[\w.@-]+\/){1,}([\w.-]+\.\w{1,6})\b/g, '$1')
             .replace(/(?:[\w.@-]+\\){1,}([\w.-]+\.\w{1,6})\b/g, '$1');
}

const ENDS_SENTENCE = /[.!?:;]\s*$/;

/**
 * Transform markdown text into natural speakable English for Kokoro / Device TTS.
 */
function speakable(input) {
  if (!input) return '';
  let text = String(input);

  // 1. Fenced code blocks -> descriptive spoken summaries
  text = text.replace(/```+([^\r\n]*)\r?\n[\s\S]*?(?:```+|$)/g, (_m, fence) => describeCodeBlock(fence));
  text = text.replace(/~~~+([^\r\n]*)\r?\n[\s\S]*?(?:~~~+|$)/g, (_m, fence) => describeCodeBlock(fence));

  // 2. Images & Links
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt) => (alt ? `. (image: ${alt}) ` : '. (an image) '));
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/<https?:\/\/[^>\s]+>/g, ' a link ');
  text = text.replace(/\bhttps?:\/\/\S+/g, ' a link ');

  // 3. Markdown Tables -> comma separated speech
  text = text.replace(/^\s*\|?[\s:-]*\|[\s|:-]*$/gm, '');
  text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_m, row) =>
    row.split('|').map((cell) => cell.trim()).filter(Boolean).join(', ')
  );

  // 4. Shorten long directory paths first so file basenames are spoken cleanly
  text = shortenPaths(text);

  // 5. Inline code backticks: short snippets read normally, long snippets shortened
  text = text.replace(/`([^`\n]+)`/g, (_m, code) => (code.length <= 40 ? code : ' that snippet '));

  // 6. Headings: make sure they end with a natural punctuation pause
  text = text.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, (_m, head) =>
    ENDS_SENTENCE.test(head) ? head : `${head.trim()}.`
  );

  // 6. Markdown List markers, blockquotes, horizontal dividers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/^\s*(?:[-*_]\s*){3,}$/gm, '');

  // 7. Styling markers (bold, italic, strikethrough)
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');
  text = text.replace(/\[[ xX]\]\s*/g, '');

  // 8. Emojis and visual symbols (strip so TTS does not stutter or pronounce Unicode tags)
  text = text.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu,
    ''
  );

  // 10. Clean up sentence pauses and extra whitespace
  text = text.replace(/\n{2,}/g, '. ');
  text = text.replace(/\n/g, '. ');
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\s+([.,!?;:])/g, '$1');
  text = text.replace(/(?:\.\s*){2,}/g, '. ');
  text = text.replace(/,\s*\./g, '.');
  text = text.trim();

  return /[\p{L}\p{N}]/u.test(text) ? text : '';
}

/**
 * Split text into breath-sized natural utterances (12-320 chars).
 */
function toUtterances(input, { minChars = 15, maxChars = 320 } = {}) {
  const text = speakable(input);
  if (!text) return [];

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [text];
  const utterances = [];
  let current = '';

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (current && (current.length + trimmed.length > maxChars)) {
      utterances.push(current);
      current = trimmed;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }

  if (current) utterances.push(current);
  return utterances;
}

module.exports = {
  speakable,
  toUtterances,
};
