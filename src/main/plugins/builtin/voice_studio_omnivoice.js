'use strict';
// Mave Voice Studio & OmniVoice Plugin (inspired by k2-fsa/OmniVoice & debpalash/VoiceStudio)

const { getVoiceDesigner } = require('../../voice_studio/voice_designer');
const { getVoiceCloner } = require('../../voice_studio/voice_cloner');
const { getVideoDubber } = require('../../voice_studio/video_dubber');
const { getAudiobookProducer } = require('../../voice_studio/audiobook_producer');

module.exports = [
  {
    name: 'design_custom_voice',
    description: 'Designs a bespoke custom voice purely from a natural language prompt (e.g. "British professor in his 50s with a warm erudite tone" or "Soft-spoken young woman with gentle intimate whispers").',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the desired voice (age, gender, pitch, accent, tone, style).' },
        name: { type: 'string', description: 'Optional name for this voice persona.' }
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const designer = getVoiceDesigner();
      ctx.log('info', `Designing voice from prompt: "${input.prompt}"`);

      const voice = designer.designVoiceFromPrompt(input.prompt, input.name);
      return `🎭 **VOICE PERSONA DESIGNED**:
• **Name**: **${voice.name}** (\`${voice.id}\`)
• **Description**: "${voice.description}"
• **Gender**: ${voice.gender} | **Age**: ${voice.age}
• **Acoustic Pitch**: ${voice.pitch > 0 ? `+${voice.pitch}` : voice.pitch} semitones
• **Tempo Speed**: ${voice.speed}x
• **Accent**: ${voice.accent.replace('_', ' ')}
• **Speaking Style**: ${voice.style}`;
    },
  },

  {
    name: 'clone_voice_profile',
    description: 'Registers a zero-shot cloned voice from a reference audio recording or file, extracting speaker timbre, pitch mean, and acoustic embedding.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the speaker or voice persona.' },
        audio_path: { type: 'string', description: 'File path to reference audio clip (3–25 seconds WAV/MP3).' },
        description: { type: 'string', description: 'Optional background description for this voice clone.' }
      },
      required: ['name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const cloner = getVoiceCloner();
      ctx.log('info', `Cloning voice profile for: "${input.name}"`);

      const clone = await cloner.cloneVoice({
        name: input.name,
        audioPath: input.audio_path,
        description: input.description
      });

      return `🧬 **VOICE CLONED SUCCESSFULLY**:
• **Profile Name**: **${clone.name}** (\`${clone.id}\`)
• **Duration Analyzed**: ${clone.durationSeconds}s
• **Mean Pitch (F0)**: ${clone.features.f0Mean} Hz (±${clone.features.f0Std})
• **Tempo**: ${clone.features.tempo}x
• **Embedding Dimensions**: ${clone.features.embedding.length}-D Vector
• **Status**: Saved in Mave Voice Studio Registry`;
    },
  },

  {
    name: 'dub_video_multilingual',
    description: 'Automatically dubs a video into another language (Spanish, French, German, Hindi, Japanese, etc.) with synchronized timed speech matching.',
    input_schema: {
      type: 'object',
      properties: {
        video_path: { type: 'string', description: 'Path to video file or reel.' },
        target_language: { type: 'string', description: 'Target language code (e.g. "es", "fr", "de", "hi", "ja").' },
        voice_id: { type: 'string', description: 'Voice profile to use for dubbing.' }
      },
      required: ['video_path', 'target_language'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const dubber = getVideoDubber();
      ctx.log('info', `Dubbing video "${input.video_path}" into ${input.target_language}`);

      const res = await dubber.dubVideo({
        videoPath: input.video_path,
        targetLanguage: input.target_language,
        voiceId: input.voice_id || 'default'
      });

      return `🎬 **VIDEO DUBBING COMPLETE**:
• **Original Video**: \`${res.sourceFilename}\`
• **Dubbed Output**: \`${res.dubbedVideoPath}\`
• **Target Language**: ${res.targetLanguage.toUpperCase()}
• **Segments Synchronized**: ${res.segmentCount}
• **Total Duration**: ${res.totalDurationSec}s
• **Sync Score**: ${res.synchronizationScore}
• **Dubbed Preview**:
${res.segments.map(s => `  [${s.startSec}s - ${s.endSec}s] "${s.translatedText}" (${s.targetSpeedMultiplier}x speed)`).join('\n')}`;
    },
  },

  {
    name: 'produce_multi_voice_story',
    description: 'Produces a multi-speaker audio story, audiobook, or podcast episode with automated character dialogue parsing and cast assignment.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the story, audiobook chapter, or podcast.' },
        script_text: { type: 'string', description: 'Full story text or dialogue script with character names or quotes.' },
        voice_cast: { type: 'object', description: 'Mapping of character names to voice profile IDs (e.g. {"Narrator": "narrator-british-deep", "Alice": "companion-soothing-female"}).' }
      },
      required: ['script_text'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const producer = getAudiobookProducer();
      ctx.log('info', `Producing multi-voice story: "${input.title || 'Untitled'}"`);

      const res = await producer.produceAudiobook({
        title: input.title || 'Untitled Story',
        scriptText: input.script_text,
        voiceCast: input.voice_cast || {}
      });

      return `🎧 **MULTI-VOICE AUDIO STORY PRODUCED**:
• **Title**: **${res.title}**
• **Characters Cast**: ${res.speakers.join(', ')}
• **Total Lines / Tracks**: ${res.totalLines}
• **Estimated Duration**: ${res.totalDurationMinutes} mins (${res.totalDurationSeconds}s)
• **Output Format**: ${res.outputFormat}
• **Cast Breakdown**:
${res.tracks.slice(0, 5).map(t => `  • Track ${t.trackNumber} [${t.speaker}] (${t.durationSeconds}s): "${t.text.slice(0, 60)}..."`).join('\n')}${res.tracks.length > 5 ? `\n  ... and ${res.tracks.length - 5} more tracks` : ''}`;
    },
  },

  {
    name: 'list_voice_personas',
    description: 'Lists all available designed, cloned, and built-in voice profiles in Mave Voice Studio.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async run(input, ctx) {
      const designer = getVoiceDesigner();
      const cloner = getVoiceCloner();

      const designed = designer.listVoices();
      const cloned = cloner.listClones();

      return `🎙️ **MAVE VOICE STUDIO CATALOG**:

**Designed Voices (${designed.length})**:
${designed.map(v => `• **${v.name}** (\`${v.id}\`): ${v.description} [${v.gender}, ${v.accent}, ${v.speed}x]`).join('\n')}

**Cloned Voices (${cloned.length})**:
${cloned.length > 0 ? cloned.map(c => `• **${c.name}** (\`${c.id}\`): ${c.description} [F0: ${c.features.f0Mean} Hz, ${c.durationSeconds}s sample]`).join('\n') : '• (No voice clones yet registered. Use `clone_voice_profile` to add one.)'}`;
    },
  }
];
