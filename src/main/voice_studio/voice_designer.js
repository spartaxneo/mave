'use strict';

/**
 * Voice Designer & Acoustic Persona Synthesis Engine
 * 
 * Inspired by k2-fsa/OmniVoice and debpalash/VoiceStudio:
 * Enables prompt-based "Voice Design" — generating custom vocal personas purely from natural language
 * descriptions (gender, age, pitch, accent, tone, speed, whispering, radio broadcast style).
 */

class VoiceDesigner {
  constructor({ logger = null } = {}) {
    this.logger = logger;
    this.designedVoices = new Map();

    // Seed curated archetype gallery (VoiceStudio / OmniVoice Gallery parity)
    this.seedGallery();
  }

  seedGallery() {
    this.saveVoice({
      id: 'narrator-british-deep',
      name: 'Lord Sterling (Documentary Narrator)',
      description: 'Mature British gentleman with deep resonant timber and measured cinematic pacing',
      gender: 'male',
      age: 'mature',
      pitch: -3.5,
      speed: 0.95,
      accent: 'british_rp',
      style: 'cinematic_documentary',
      emotionalTone: 'authoritative_warm'
    });

    this.saveVoice({
      id: 'companion-soothing-female',
      name: 'Aria (Bedtime Companion)',
      description: 'Soft-spoken, gentle young woman with intimate breathy tone and soothing cadence',
      gender: 'female',
      age: 'young_adult',
      pitch: 1.8,
      speed: 0.9,
      accent: 'general_american',
      style: 'whispered_intimate',
      emotionalTone: 'empathetic_calm'
    });

    this.saveVoice({
      id: 'tech-founder-energetic',
      name: 'Kai (Dynamic Tech Co-founder)',
      description: 'Crisp, articulate speaker with high energy, punchy delivery, and confident pitch',
      gender: 'non-binary',
      age: 'young_adult',
      pitch: 0.5,
      speed: 1.15,
      accent: 'californian',
      style: 'conversational_pitch',
      emotionalTone: 'optimistic_fast'
    });

    this.saveVoice({
      id: 'radio-host-golden-age',
      name: 'Duke Harrison (Vintage Radio Host)',
      description: 'Golden age broadcast announcer with rich mid-range warmth and rhythmic theatricality',
      gender: 'male',
      age: 'mature',
      pitch: -2.0,
      speed: 1.05,
      accent: 'mid_atlantic',
      style: 'broadcast_announcer',
      emotionalTone: 'charismatic_theatrical'
    });
  }

  /**
   * Analyzes a natural language prompt and extracts acoustic parameters.
   */
  designVoiceFromPrompt(prompt, name = null) {
    if (!prompt || !String(prompt).trim()) {
      throw new Error('Prompt description is required to design a voice.');
    }

    const text = String(prompt).toLowerCase();

    // 1. Gender identification
    let gender = 'neutral';
    if (/\b(?:female|woman|girl|lady|she|her|feminine|soprano|alto)\b/.test(text)) {
      gender = 'female';
    } else if (/\b(?:male|man|boy|gentleman|he|his|masculine|baritone|bass)\b/.test(text)) {
      gender = 'male';
    }

    // 2. Age profiling
    let age = 'adult';
    let basePitch = 0.0;
    if (/\b(?:child|kid|little|toddler)\b/.test(text)) {
      age = 'child';
      basePitch += 4.5;
    } else if (/\b(?:teen|young|youth|student)\b/.test(text)) {
      age = 'young_adult';
      basePitch += 1.5;
    } else if (/\b(?:elderly|old|grandfather|grandmother|senior|aged)\b/.test(text)) {
      age = 'senior';
      basePitch -= 2.0;
    } else if (/\b(?:mature|middle-aged|experienced)\b/.test(text)) {
      age = 'mature';
      basePitch -= 1.0;
    }

    // 3. Pitch adjustment
    let pitch = basePitch;
    if (/\b(?:deep|gravelly|baritone|bass|low|heavy|dark)\b/.test(text)) {
      pitch -= 3.0;
    } else if (/\b(?:high|bright|squeaky|falsetto|light)\b/.test(text)) {
      pitch += 3.0;
    }

    // Adjust gender defaults if not already shifted
    if (gender === 'female' && pitch === basePitch) pitch += 2.0;
    if (gender === 'male' && pitch === basePitch) pitch -= 2.0;

    // 4. Speed & pacing
    let speed = 1.0;
    if (/\b(?:fast|energetic|quick|rapid|punchy|hurried)\b/.test(text)) {
      speed = 1.15;
    } else if (/\b(?:slow|calm|measured|deliberate|relaxed|bedtime|meditation)\b/.test(text)) {
      speed = 0.88;
    }

    // 5. Accent detection
    let accent = 'general_american';
    if (/\b(?:british|uk|england|queen|posh|rp)\b/.test(text)) accent = 'british_rp';
    else if (/\b(?:indian|desi|hindi)\b/.test(text)) accent = 'indian_english';
    else if (/\b(?:australian|aussie)\b/.test(text)) accent = 'australian';
    else if (/\b(?:french)\b/.test(text)) accent = 'french_accent';
    else if (/\b(?:german)\b/.test(text)) accent = 'german_accent';
    else if (/\b(?:japanese|anime)\b/.test(text)) accent = 'japanese_accent';
    else if (/\b(?:southern|texas|drawl)\b/.test(text)) accent = 'american_southern';
    else if (/\b(?:scottish|irish)\b/.test(text)) accent = 'celtic';

    // 6. Speaking style
    let style = 'conversational';
    if (/\b(?:whisper|breathy|soft|quiet|intimate)\b/.test(text)) style = 'whispered';
    else if (/\b(?:cinematic|movie|trailer|epic|dramatic)\b/.test(text)) style = 'cinematic';
    else if (/\b(?:broadcast|radio|news|reporter|podcast)\b/.test(text)) style = 'broadcast';
    else if (/\b(?:academic|lecture|professor|teacher)\b/.test(text)) style = 'authoritative';

    const id = `designed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const voiceName = name || `Voice (${accent.replace('_', ' ')}, ${gender}, ${age})`;

    const voiceProfile = {
      id,
      name: voiceName,
      description: prompt.trim(),
      gender,
      age,
      pitch: Math.round(pitch * 10) / 10,
      speed: Math.round(speed * 100) / 100,
      accent,
      style,
      createdAt: Date.now()
    };

    this.saveVoice(voiceProfile);
    return voiceProfile;
  }

  saveVoice(voice) {
    if (!voice || !voice.id) return;
    this.designedVoices.set(voice.id, voice);
    return voice;
  }

  getVoice(id) {
    return this.designedVoices.get(id) || null;
  }

  listVoices() {
    return Array.from(this.designedVoices.values());
  }

  deleteVoice(id) {
    return this.designedVoices.delete(id);
  }
}

let designerInstance = null;
function getVoiceDesigner(options = {}) {
  if (!designerInstance) {
    designerInstance = new VoiceDesigner(options);
  }
  return designerInstance;
}

module.exports = { VoiceDesigner, getVoiceDesigner };
