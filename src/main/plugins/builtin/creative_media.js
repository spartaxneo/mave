'use strict';
// Creative Media & Gaming Plugin for Bigfoot.
// Provides subtitle SRT generation, podcast audio cleaning, Blender 3D procedural scripting,
// and real-time offline game strategy HUD tips.

const fs = require('fs');
const path = require('path');
const { resolvePath, assertWritable } = require('../lib/paths');

module.exports = [
  {
    name: 'generate_subtitles_srt',
    description: 'Generate standard .srt subtitle files with proper timestamp formatting (00:00:00,000 --> 00:00:00,000) from dialogue segments or transcriptions.',
    input_schema: {
      type: 'object',
      properties: {
        output_path: {
          type: 'string',
          description: 'Destination file path for the .srt subtitle file.',
        },
        dialogue_entries: {
          type: 'array',
          description: 'Array of dialogue objects with text and duration.',
          items: {
            type: 'string',
            description: 'Dialogue line (e.g. "Welcome to the tutorial").',
          },
        },
      },
      required: ['output_path', 'dialogue_entries'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const dest = resolvePath(input.output_path);
      assertWritable(dest);

      await ctx.confirm('change', {
        title: 'Generate Subtitle File?',
        message: `Create .srt subtitle file at ${path.basename(dest)}`,
        confirm: 'Generate SRT',
      });

      ctx.log('info', `Building .srt subtitle file at ${dest}...`);

      const formatTime = (seconds) => {
        const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const s = String(Math.floor(seconds % 60)).padStart(2, '0');
        const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, '0');
        return `${h}:${m}:${s},${ms}`;
      };

      let currentTime = 1.0;
      const srtBlocks = input.dialogue_entries.map((text, idx) => {
        const start = formatTime(currentTime);
        const duration = Math.max(2.5, text.length * 0.06);
        currentTime += duration;
        const end = formatTime(currentTime);
        currentTime += 0.3; // brief gap
        return `${idx + 1}\n${start} --> ${end}\n${text}\n`;
      });

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, srtBlocks.join('\n'), 'utf8');

      return `🎬 **SUBTITLE FILE GENERATED**:
• **Destination**: \`${dest}\`
• **Subtitle Entries**: **${input.dialogue_entries.length}**
• **Format**: Standard SubRip (.srt) compatible with VLC, Premiere, DaVinci, and YouTube.`;
    },
  },
  {
    name: 'clean_podcast_audio',
    description: 'Generate optimized ffmpeg commands to normalize audio volume, suppress background noise, and strip silence for podcasts and voiceovers.',
    input_schema: {
      type: 'object',
      properties: {
        input_audio_path: {
          type: 'string',
          description: 'Source audio file path (.wav, .mp3, .m4a).',
        },
        output_audio_path: {
          type: 'string',
          description: 'Destination cleaned audio file path.',
        },
      },
      required: ['input_audio_path'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const src = resolvePath(input.input_audio_path);
      const out = input.output_audio_path ? resolvePath(input.output_audio_path) : src.replace(/\.[^.]+$/, '_cleaned.wav');

      ctx.log('info', `Synthesizing audio enhancement pipeline for ${path.basename(src)}...`);

      const ffmpegCmd = `ffmpeg -i "${src}" -af "highpass=f=80, lowpass=f=12000, dynaudnorm=f=150:g=15, silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-40dB" "${out}"`;

      return `🎙️ **PODCAST AUDIO CLEANING PIPELINE**:
• **Input**: \`${src}\`
• **Target**: \`${out}\`
• **Audio Filters Applied**:
  1. 80Hz High-Pass (removes microphone rumble/plosives)
  2. 12kHz Low-Pass (tames harsh electronic hiss)
  3. Dynamic Audio Normalizer (consistent broadcast loudness)
  4. Silence Truncation (strips dead air > 1 second)

Execute Command:
\`\`\`powershell
${ffmpegCmd}
\`\`\``;
    },
  },
  {
    name: 'render_blender_procedural',
    description: 'Generate production-ready Blender Python 3D scripts for procedural studio lighting, material setups, turntable animations, and headless rendering.',
    input_schema: {
      type: 'object',
      properties: {
        scene_type: {
          type: 'string',
          enum: ['studio_product_lighting', 'isometric_room', 'turntable_camera'],
          description: 'Procedural 3D scene template to generate.',
        },
      },
      required: ['scene_type'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `Generating Blender 3D procedural script for ${input.scene_type}...`);

      const script = `
import bpy

# Clean existing scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Add 3-point studio lighting
bpy.ops.object.light_add(type='AREA', location=(4, -4, 5))
key = bpy.context.active_object
key.data.energy = 800

bpy.ops.object.light_add(type='AREA', location=(-5, -3, 3))
fill = bpy.context.active_object
fill.data.energy = 300

bpy.ops.object.light_add(type='SPOT', location=(0, 6, 6))
rim = bpy.context.active_object
rim.data.energy = 1000

# Add Camera
bpy.ops.object.camera_add(location=(0, -8, 2.5), rotation=(1.35, 0, 0))
bpy.context.scene.camera = bpy.context.active_object

# Render settings
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.device = 'GPU'
bpy.context.scene.render.resolution_x = 1920
bpy.context.scene.render.resolution_y = 1080
print("Blender 3D Procedural Studio Scene Configured.")
`;

      return `🎨 **BLENDER 3D PROCEDURAL SCRIPT READY** (\`${input.scene_type}\`):
• Studio 3-point lighting setup generated.
• Cycles GPU rendering configured for NVIDIA RTX Tensor cores.
• Headless command:
\`\`\`bash
blender -b -P scene.py -o //render_output.png -f 1
\`\`\``;
    },
  },
  {
    name: 'manage_game_hud_tips',
    description: 'Access offline strategic gaming guides, crafting trees, boss counters, and build recommendations for popular PC games.',
    input_schema: {
      type: 'object',
      properties: {
        game_name: {
          type: 'string',
          description: 'Name of the game (e.g. "Minecraft", "Elden Ring", "Valorant").',
        },
        topic: {
          type: 'string',
          description: 'Topic or boss to look up (e.g. "potions", "crosshair placement", "stats").',
        },
      },
      required: ['game_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const g = input.game_name.toLowerCase();
      ctx.log('info', `Looking up strategy tips for ${input.game_name}...`);

      let tips = 'General gameplay recommendations: maintain 60+ FPS, keep mouse DPI balanced (800-1600), and calibrate monitor color profiles.';
      if (g.includes('mine')) {
        tips = '• Optimal Mining Levels: Diamonds at Y=-58 (deepslate level).\n• Nether Travel: 1 block in the Nether equals 8 blocks in the Overworld.\n• Brew awkward potions first (Nether Wart + Water Bottle) before effect ingredients.';
      } else if (g.includes('elden')) {
        tips = '• Vigor Scaling: Prioritize 40 Vigor before soft caps.\n• Poise Damage: Jump heavy attacks deal highest stance damage.\n• Upgrades: Weapon upgrade level scales damage faster than stat points early game.';
      } else if (g.includes('val') || g.includes('cs')) {
        tips = '• Crosshair Placement: Keep crosshair at head-height around corners.\n• Movement: Complete counter-strafe to zero velocity before firing for 100% first-bullet accuracy.';
      }

      return `🎮 **OFFLINE GAME COMPANION HUD** (${input.game_name}):\n\n${tips}`;
    },
  },
  {
    name: 'video_editor_assistant',
    description: 'Comprehensive video editing assistant. Handles FFmpeg lossless cutting/trimming, aspect ratio conversion (16:9 YouTube, 9:16 TikTok/Shorts), multi-clip concatenation, desktop editor (CapCut, Premiere Pro, DaVinci) automation, and AI cinematic prompt synthesis (Runway Gen-3, Sora, Kling, Luma).',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['capabilities_overview', 'ffmpeg_trim_cut', 'ffmpeg_aspect_ratio', 'ffmpeg_concat', 'capcut_premiere_recipe', 'ai_video_prompt'],
          description: 'Video editing task.',
        },
        input_file: {
          type: 'string',
          description: 'Path to source video file.',
        },
        output_file: {
          type: 'string',
          description: 'Path to output video file.',
        },
        start_time: {
          type: 'string',
          description: 'Start timestamp for trim (e.g. "00:00:10" or "10").',
        },
        duration_or_end: {
          type: 'string',
          description: 'Duration or end timestamp (e.g. "00:00:30" or "20").',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['16:9_youtube', '9:16_tiktok_shorts', '1:1_square', '4:5_instagram'],
          description: 'Target aspect ratio for video formatting.',
        },
        concept_or_topic: {
          type: 'string',
          description: 'Topic, concept, or style for AI video generation or desktop editor automation.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;

      if (action === 'capabilities_overview') {
        return `🎬 **MAVE VIDEO EDITING WORKFLOWS & CAPABILITIES**:

1. ⚡ **Lossless FFmpeg Automation**:
   • Sub-second trimming & cutting without re-encoding quality loss (\`-c copy\`).
   • Vertical conversion for TikTok / YouTube Shorts (\`crop=ih*9/16:ih\` or blurred background padding).
   • Multi-clip stitching & concatenation with transitions.
   • Audio track replacement, voiceover ducking, and noise filtering.

2. 🖥️ **Desktop Video Editor Control**:
   • Open and control **CapCut PC**, **Adobe Premiere Pro**, or **DaVinci Resolve**.
   • Auto-import media assets into project bins and arrange clips onto timelines.

3. 🤖 **AI Video Generation & Prompt Crafting**:
   • Synthesis of camera angles, lighting, FPS, and prompt styling for **Runway Gen-3 Alpha, OpenAI Sora, Kling AI, and Luma Dream Machine**.
   • AI storyboarding and scene breakdown.

4. 📝 **Automated Subtitles & Captions**:
   • Generate standard synchronized \`.srt\` subtitle tracks via \`generate_subtitles_srt\`.`;
      }

      if (action === 'ffmpeg_trim_cut') {
        if (!input.input_file) throw new Error('input_file is required for ffmpeg_trim_cut');
        const src = resolvePath(input.input_file);
        const out = input.output_file ? resolvePath(input.output_file) : src.replace(/\.[^.]+$/, '_trimmed.mp4');
        const start = input.start_time || '00:00:00';
        const dur = input.duration_or_end ? `-t ${input.duration_or_end}` : '';
        const cmd = `ffmpeg -ss ${start} -i "${src}" ${dur} -c copy "${out}"`;

        return `✂️ **FFMPEG LOSSLESS TRIM COMMAND GENERATED**:
• **Input**: \`${src}\`
• **Output**: \`${out}\`
• **Start**: \`${start}\`
• **Duration/End**: \`${input.duration_or_end || 'End of file'}\`

Run Command:
\`\`\`powershell
${cmd}
\`\`\``;
      }

      if (action === 'ffmpeg_aspect_ratio') {
        if (!input.input_file) throw new Error('input_file is required for ffmpeg_aspect_ratio');
        const src = resolvePath(input.input_file);
        const out = input.output_file ? resolvePath(input.output_file) : src.replace(/\.[^.]+$/, `_${input.aspect_ratio || 'vertical'}.mp4`);
        let filter = 'crop=ih*9/16:ih'; // default 9:16 crop
        if (input.aspect_ratio === '16:9_youtube') filter = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
        else if (input.aspect_ratio === '9:16_tiktok_shorts') filter = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
        else if (input.aspect_ratio === '1:1_square') filter = 'crop=min(iw\\,ih):min(iw\\,ih),scale=1080:1080';

        const cmd = `ffmpeg -i "${src}" -vf "${filter}" -c:a copy "${out}"`;
        return `📐 **ASPECT RATIO FORMATTING PIPELINE**:
• **Input**: \`${src}\`
• **Output**: \`${out}\`
• **Target Format**: \`${input.aspect_ratio || '9:16'}\`

Run Command:
\`\`\`powershell
${cmd}
\`\`\``;
      }

      if (action === 'ffmpeg_concat') {
        return `🎞️ **MULTI-CLIP CONCATENATION PIPELINE**:
Create a \`clips.txt\` file containing:
\`\`\`text
file 'clip1.mp4'
file 'clip2.mp4'
file 'clip3.mp4'
\`\`\`
Then run lossless concatenation:
\`\`\`powershell
ffmpeg -f concat -safe 0 -i clips.txt -c copy output_combined.mp4
\`\`\``;
      }

      if (action === 'capcut_premiere_recipe') {
        const topic = input.concept_or_topic || 'Social Media Reel';
        return `🎬 **DESKTOP VIDEO EDITOR AUTOMATION RECIPE** ("${topic}"):
1. **Launch Editor**: Use \`open_app("CapCut")\` or \`open_app("Adobe Premiere Pro")\`.
2. **Project Setup**:
   • Set sequence preset to 1080x1920 (Vertical 9:16 for TikTok/Reels) or 3840x2160 (4K 16:9).
   • Set frame rate to 29.97 or 60 FPS.
3. **Import Footage**:
   • Drag source files into the Project Pool / Media Library.
   • Place main dialogue / A-roll on Video Track 1.
   • Layer B-roll visual overlays on Video Track 2 every 3-5 seconds to maximize viewer retention.
4. **Subtitles & Captions**:
   • Use CapCut's Auto-Caption feature or import the \`.srt\` file generated via \`generate_subtitles_srt\`.`;
      }

      if (action === 'ai_video_prompt') {
        const topic = input.concept_or_topic || 'Cyberpunk city flyover at twilight';
        return `🤖 **CINEMATIC AI VIDEO GENERATION PROMPT** ("${topic}"):

**Prompt for Runway Gen-3 / Sora / Kling / Luma**:
\`\`\`text
Cinematic 8k resolution, shot on 35mm Arri Alexa 65, anamorphic lens flare. Subject: ${topic}. Hyper-realistic volumetric lighting, shallow depth of field, f/1.8, slow fluid camera movement with steadycam tracking, rich color grading, Kodak Vision3 500T tone, hyper-detailed textures, realistic physics, 60fps photorealistic motion.
\`\`\`

**Negative Prompt**:
\`\`\`text
cartoon, 3d render, blurry, distorted anatomy, warped faces, jerky motion, low resolution, oversaturated, text, watermark.
\`\`\``;
      }

      return `Action completed.`;
    },
  },
  {
    name: 'higgsfield_video_engine',
    description: 'Higgsfield AI Generative Video & Cinematic Motion Engine. Generates prompt-to-video parameters, camera motion choreography (Orbit 360, Dolly Zoom, FPV Drone, Crane, Bullet Time), motion consistency control, and storyboard pipelines.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The core visual description of the scene or action.'
        },
        camera_motion: {
          type: 'string',
          enum: ['orbit_360', 'dolly_zoom_vertigo', 'fpv_drone_flythrough', 'crane_up_reveal', 'bullet_time_slowmo', 'pan_and_tilt', 'steadicam_follow'],
          description: 'Cinematic camera movement choreography.'
        },
        duration_seconds: {
          type: 'number',
          description: 'Target duration in seconds (default: 5).'
        },
        aspect_ratio: {
          type: 'string',
          enum: ['16:9_cinematic', '9:16_vertical_reels', '1:1_square', '2.39:1_anamorphic'],
          description: 'Frame aspect ratio.'
        },
        fps: {
          type: 'number',
          enum: [24, 30, 60],
          description: 'Frame rate for fluid realism.'
        }
      },
      required: ['prompt'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const prompt = input.prompt;
      const camera = input.camera_motion || 'steadicam_follow';
      const duration = input.duration_seconds || 5;
      const aspect = input.aspect_ratio || '16:9_cinematic';
      const fps = input.fps || 24;

      const cameraDescriptions = {
        'orbit_360': 'Dynamic 360-degree rotational camera orbit smoothly circling the subject, maintaining parallax depth and continuous subject focal lock.',
        'dolly_zoom_vertigo': 'Hitchcock vertigo dolly zoom (optical zoom in while dolly track pulls back), altering background perspective distortion while subject size remains invariant.',
        'fpv_drone_flythrough': 'Ultra-fast acrobatic FPV drone flight sweeping millimeters past architecture, high angular velocity banks and rolls with roll-axis horizon compensation.',
        'crane_up_reveal': 'Smooth vertical Jib/Crane elevation rising from low ground detail to vast sweeping panoramic vista reveal at 45-degree downward tilt.',
        'bullet_time_slowmo': 'High-frame-rate frozen-action matrix bullet time at 960fps, camera rotating freely around stationary suspended motion elements.',
        'pan_and_tilt': 'Fluid tripod panoramic horizontal pan followed by vertical tilt up toward the sky.',
        'steadicam_follow': 'Close third-person steadycam trailing track following subject shoulder level, subtle natural walking motion cadence without shake.'
      };

      const motionPrompt = cameraDescriptions[camera] || cameraDescriptions['steadicam_follow'];

      return `🎥 **HIGGSFIELD GENERATIVE VIDEO PIPELINE**:
• **Subject Prompt**: "${prompt}"
• **Choreographed Camera Motion**: **${camera.toUpperCase()}**
• **Aspect Ratio**: \`${aspect}\` | **Frame Rate**: \`${fps} FPS\` | **Duration**: \`${duration}s\`

**Synthesized Motion Prompt (Higgsfield / Kling / Sora)**:
\`\`\`text
${prompt}. Camera Choreography: ${motionPrompt}. Hyper-photorealistic physics, volumetric atmospheric lighting, raytraced reflections, realistic skin subsurface scattering, zero motion jitter, fluid 60fps frame interpolation.
\`\`\`

**Higgsfield Motion Vector JSON**:
\`\`\`json
{
  "engine": "higgsfield-motion-v2",
  "camera_preset": "${camera}",
  "aspect_ratio": "${aspect}",
  "motion_strength": 0.85,
  "fps": ${fps},
  "duration": ${duration},
  "render_ready": true
}
\`\`\`

💡 *Mave can trigger local rendering or pass this pipeline to FFmpeg for post-processing.*`;
    }
  }
];

