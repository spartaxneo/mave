'use strict';
// Desktop Pet Companion Engine ("Codex Pets") for Bigfoot.
// Manages on-screen floating pixel/vector companions that reflect agent state in real time:
// (idle, thinking, working, success, needs_approval, error).
// Persists pet profiles, happiness, and custom hatched species in D:\Bigfoot\pet.json.

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DEFAULT_SPECIES = {
  meta_muse: { name: 'Muse', personality: 'Cute & Ethereal Meta Companion', color: '#8B5CF6', emoji: '🔮' },
  chatgpt_dots: { name: 'Dots', personality: 'Harmonic & Rhythmic', color: '#10B981', emoji: '✨' },
  cyber_fox: { name: 'Kitsune', personality: 'Curious & Agile', color: '#6366F1', emoji: '🦊' },
  mini_robot: { name: 'Byte', personality: 'Analytical & Methodical', color: '#06B6D4', emoji: '🤖' },
  pixel_cat: { name: 'Mochi', personality: 'Cozy & Independent', color: '#F59E0B', emoji: '🐱' },
  baby_dragon: { name: 'Ignis', personality: 'Fierce & Passionate', color: '#EF4444', emoji: '🐉' },
  shiba_inu: { name: 'Doge', personality: 'Loyal & Cheerful', color: '#EAB308', emoji: '🐕' },
  ghost: { name: 'Spooky', personality: 'Gentle & Observant', color: '#A855F7', emoji: '👻' },
};

class PetEngine extends EventEmitter {
  constructor(profileDir = 'D:\\Bigfoot') {
    super();
    this.profileDir = profileDir;
    this.dataFile = path.join(profileDir, 'pet.json');
    this.state = this.loadState();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.profileDir)) fs.mkdirSync(this.profileDir, { recursive: true });
    } catch {}
  }

  loadState() {
    this._ensureDir();
    if (fs.existsSync(this.dataFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      } catch {}
    }
    return {
      enabled: true,
      activePet: {
        id: 'pet_default',
        name: 'Muse',
        species: 'meta_muse',
        personality: 'Cute & Ethereal Meta Companion',
        color: '#8B5CF6',
        level: 1,
        happiness: 100,
        hunger: 20,
        state: 'idle',
        taskMode: 'idle',
        speechBubble: null,
      },
      hatchedPets: [
        { id: 'pet_default', name: 'Muse', species: 'meta_muse', hatchedAt: new Date().toISOString() },
      ],
    };
  }


  saveState() {
    this._ensureDir();
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {}
  }

  get activePet() {
    return this.state.activePet;
  }

  /**
   * Set agent state and task mode for animated visual feedback.
   * states: 'idle', 'listening', 'thinking', 'working', 'success', 'needs_approval', 'error', 'sleep'
   * taskModes: 'idle', 'coding', 'thinking', 'research', 'action', 'sleep'
   */
  setAgentState(agentState, speechBubble = null, taskMode = null) {
    const validStates = ['idle', 'listening', 'thinking', 'working', 'success', 'needs_approval', 'error', 'sleep'];
    const safeState = validStates.includes(agentState) ? agentState : 'idle';

    this.state.activePet.state = safeState;
    if (speechBubble !== undefined && speechBubble !== null) {
      this.state.activePet.speechBubble = speechBubble;
    }
    if (taskMode) {
      this.state.activePet.taskMode = taskMode;
    }
    this.saveState();
    this.emit('state-changed', {
      state: safeState,
      taskMode: this.state.activePet.taskMode || 'idle',
      speechBubble: this.state.activePet.speechBubble,
      pet: this.state.activePet,
    });
    return this.state.activePet;
  }

  setTaskMode(mode, speechBubble = null) {
    const validModes = ['idle', 'coding', 'thinking', 'research', 'action', 'sleep'];
    const safeMode = validModes.includes(mode) ? mode : 'idle';
    this.state.activePet.taskMode = safeMode;
    if (speechBubble !== null && speechBubble !== undefined) {
      this.state.activePet.speechBubble = speechBubble;
    }
    this.saveState();
    this.emit('state-changed', {
      state: this.state.activePet.state || 'idle',
      taskMode: safeMode,
      speechBubble: this.state.activePet.speechBubble,
      pet: this.state.activePet,
    });
    return this.state.activePet;
  }


  /**
   * Switch active pet species.
   */
  setSpecies(species, name = null) {
    const template = DEFAULT_SPECIES[species] || DEFAULT_SPECIES.cyber_fox;
    this.state.activePet.species = species in DEFAULT_SPECIES ? species : 'cyber_fox';
    this.state.activePet.name = name || template.name;
    this.state.activePet.personality = template.personality;
    this.state.activePet.color = template.color;
    this.saveState();
    this.emit('pet-updated', this.state.activePet);
    return this.state.activePet;
  }

  /**
   * Hatch a new personalized companion.
   */
  hatchPet(name, species = 'cyber_fox', personality = null, color = null) {
    const template = DEFAULT_SPECIES[species] || DEFAULT_SPECIES.cyber_fox;
    const petId = `pet_${Date.now()}`;
    const newPet = {
      id: petId,
      name: name ? name.trim() : template.name,
      species: species in DEFAULT_SPECIES ? species : 'cyber_fox',
      personality: personality || template.personality,
      color: color || template.color,
      level: 1,
      happiness: 100,
      hunger: 10,
      state: 'idle',
      speechBubble: `Hello! I'm ${name || template.name}!`,
    };

    this.state.activePet = newPet;
    this.state.hatchedPets.push({
      id: petId,
      name: newPet.name,
      species: newPet.species,
      hatchedAt: new Date().toISOString(),
    });

    this.saveState();
    this.emit('pet-hatched', newPet);
    return newPet;
  }

  /**
   * Interact with pet (feed, pet, play).
   */
  interact(action) {
    const pet = this.state.activePet;
    let message = '';

    if (action === 'feed') {
      pet.hunger = Math.max(0, pet.hunger - 30);
      pet.happiness = Math.min(100, pet.happiness + 15);
      pet.state = 'success';
      pet.speechBubble = 'Yummy! Thanks for the snack! 🍓';
      message = `🍓 Fed ${pet.name}. Hunger reduced, happiness increased!`;
    } else if (action === 'pet') {
      pet.happiness = Math.min(100, pet.happiness + 20);
      pet.state = 'idle';
      pet.speechBubble = 'Purr... ❤️';
      message = `❤️ You petted ${pet.name}. ${pet.name} is feeling happy!`;
    } else if (action === 'play') {
      pet.level += 1;
      pet.happiness = Math.min(100, pet.happiness + 25);
      pet.hunger = Math.min(100, pet.hunger + 15);
      pet.state = 'success';
      pet.speechBubble = 'That was so fun! Level Up! ⭐';
      message = `⭐ Played with ${pet.name}! Leveled up to Level ${pet.level}!`;
    } else {
      pet.state = 'idle';
      message = `${pet.name} is happily hanging out on your desktop.`;
    }

    this.saveState();
    this.emit('state-changed', { state: pet.state, speechBubble: pet.speechBubble, pet });
    return { ok: true, pet, message };
  }

  feed() {
    return this.interact('feed');
  }

  pet() {
    return this.interact('pet');
  }

  play() {
    return this.interact('play');
  }

  getStatus() {
    const pet = this.state.activePet;
    const meta = DEFAULT_SPECIES[pet.species] || DEFAULT_SPECIES.cyber_fox;
    return {
      enabled: this.state.enabled,
      name: pet.name,
      species: pet.species,
      emoji: meta.emoji,
      personality: pet.personality,
      state: pet.state,
      happiness: pet.happiness,
      hunger: pet.hunger,
      level: pet.level,
      totalHatched: this.state.hatchedPets.length,
      speechBubble: pet.speechBubble,
    };
  }
}

let _petInstance = null;
function getPetEngine() {
  if (!_petInstance) _petInstance = new PetEngine();
  return _petInstance;
}

module.exports = { PetEngine, getPetEngine, DEFAULT_SPECIES };
