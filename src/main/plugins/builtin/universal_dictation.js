'use strict';
// Universal Dictation & Speech Post-Processing Plugin (inspired by Handy - https://github.com/cjpais/Handy)

const { getDictationManager } = require('../../dictation');
const { cleanTranscription } = require('../../local/text_cleaner');

module.exports = [
  {
    name: 'dictate_text',
    description: 'Dictates text or speech directly into whatever window or application is currently active on the computer (VS Code, Word, Chrome, Slack, etc.) using reliable paste with anti-hallucination cleanup and clipboard preservation.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text or speech transcript to type/paste into the active app.' },
        auto_submit: { type: 'boolean', description: 'Whether to press Enter automatically after typing (default false).' },
        paste_method: { type: 'string', enum: ['reliable_paste', 'type', 'ctrl_v'], description: 'Text injection method (default "reliable_paste").' }
      },
      required: ['text'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getDictationManager();
      ctx.log('info', `Dictating text (${input.text.length} chars) into active application.`);

      const res = await mgr.dictate(input.text, {
        autoSubmit: Boolean(input.auto_submit),
        pasteMethod: input.paste_method || 'reliable_paste'
      });

      if (!res.ok) {
        return `❌ Dictation failed: ${res.error}`;
      }

      return `✍️ **DICTATED SUCCESSFULLY**:
• **Text Injected**: "${res.text}"
• **Characters**: ${res.characters}
• **Method**: ${res.method}
• **Auto-Submitted**: ${res.autoSubmitted ? 'Yes (Enter pressed)' : 'No'}`;
    },
  },

  {
    name: 'clean_speech_transcript',
    description: 'Post-processes speech transcripts with anti-hallucination stutter collapse, filler word removal (with sentence capital debt restoration), and phonetic custom dictionary replacement.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Raw voice transcription text to clean.' },
        remove_fillers: { type: 'boolean', description: 'Whether to strip filler words ("uh", "um", "hmm") (default true).' },
        additional_words: { type: 'array', items: { type: 'string' }, description: 'Additional custom words/names to phonetically match.' }
      },
      required: ['text'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getDictationManager();
      const cleaned = cleanTranscription(input.text, {
        customWords: mgr.getCustomWords(),
        additionalWords: input.additional_words || [],
        removeFillers: input.remove_fillers !== false
      });

      return `🧹 **SPEECH CLEANING REPORT**:
• **Raw Speech**: "${input.text}"
• **Cleaned Transcript**: "${cleaned}"
• **Changes Made**: ${input.text !== cleaned ? 'Removed stutters/fillers or applied phonetic corrections' : 'Already optimal'}`;
    },
  },

  {
    name: 'manage_voice_dictionary',
    description: 'Manages custom words, developer terms, and brand names in the speech recognition phonetic dictionary for accurate spelling.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove', 'list'], description: 'Action to perform: "add", "remove", or "list".' },
        words: { type: 'array', items: { type: 'string' }, description: 'List of words to add or remove.' }
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getDictationManager();
      const action = input.action;

      if (action === 'add') {
        const updated = mgr.addCustomWords(input.words || []);
        return `✅ **Added Custom Words**: ${(input.words || []).join(', ')}\n• **Total Dictionary Words**: ${updated.length}`;
      } else if (action === 'remove') {
        let updated = mgr.getCustomWords();
        for (const w of input.words || []) {
          updated = mgr.removeCustomWord(w);
        }
        return `🗑️ **Removed Custom Words**: ${(input.words || []).join(', ')}\n• **Total Dictionary Words**: ${updated.length}`;
      }

      const words = mgr.getCustomWords();
      return `📚 **VOICE CUSTOM DICTIONARY (${words.length} terms)**:\n${words.map(w => `• ${w}`).join('\n')}`;
    },
  },

  {
    name: 'toggle_dictation_mode',
    description: 'Toggles or checks Mave Universal Dictation Mode between Assistant Mode (executing tasks) and Dictation Mode (typing speech into active window).',
    input_schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Explicitly set dictation mode (true/false). Omit to toggle.' }
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getDictationManager();
      let state = false;
      if (typeof input.enabled === 'boolean') {
        state = mgr.setMode(input.enabled);
      } else {
        state = mgr.toggleMode();
      }

      const status = await mgr.getStatus();
      return `🎙️ **UNIVERSAL DICTATION MODE**: **${state ? 'ACTIVATED (Direct Voice Typing)' : 'DEACTIVATED (Assistant Task Mode)'}**
• **Active Window**: "${status.activeWindow}"
• **Paste Strategy**: ${status.pasteMethod}
• **Preserve Clipboard**: ${status.preserveClipboard ? 'Yes' : 'No'}`;
    },
  }
];
