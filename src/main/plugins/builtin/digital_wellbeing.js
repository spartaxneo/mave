'use strict';
// Autonomous Digital Ergonomics, Ocular Health & Focus Architecture Plugin for Mave.

const { getDigitalWellbeingGuardian } = require('../../safety/digital_wellbeing');

module.exports = [
  {
    name: 'wellbeing_check_ergonomic_status',
    description: 'Checks continuous desk time, triggers 20-20-20 ocular rest alerts, posture stretches, and hydration reminders.',
    input_schema: {
      type: 'object',
      properties: {
        active_minutes: { type: 'number', description: 'Minutes spent actively working without a break.' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const guardian = getDigitalWellbeingGuardian();
      if (typeof input.active_minutes === 'number') {
        guardian.continuousWorkMinutes = input.active_minutes;
      }
      ctx.log('info', 'Evaluating ocular and ergonomic status...');

      const status = guardian.checkErgonomicAlerts();
      if (!status.needsBreak) {
        return `✅ **Ergonomic Posture Nominal**: ${status.continuousWorkMinutes} mins active. Eye strain and muscle fatigue levels are low.`;
      }

      const alertLines = status.alerts.map(a => `• ⚠️ **${a.type}** [${a.urgency}]: ${a.message}\n  👉 *${a.action}*`).join('\n');
      return `🧘 **DIGITAL ERGONOMIC ALERT** (${status.continuousWorkMinutes}m continuous screen time):\n${alertLines}`;
    },
  },

  {
    name: 'wellbeing_start_focus_session',
    description: 'Launches a deep work focus session (e.g. Pomodoro 25m or Flow 50m) that shields the user from ambient digital distractions.',
    input_schema: {
      type: 'object',
      properties: {
        task_goal: { type: 'string', description: 'Specific project or task to achieve in this session.' },
        duration_minutes: { type: 'number', description: 'Session duration in minutes (default 25).' },
      },
      required: ['task_goal'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const guardian = getDigitalWellbeingGuardian();
      ctx.log('info', `Initiating focus session: ${input.task_goal}`);

      const session = guardian.startFocusSession(input.task_goal, input.duration_minutes || 25);
      return `🎯 **DEEP WORK FOCUS SESSION ACTIVATED**:
• **Objective**: **${session.taskGoal}**
• **Duration**: **${session.durationMinutes} minutes**
• **Planned Completion**: \`${new Date(session.plannedEnd).toLocaleTimeString()}\`
🛡️ *Distraction shields active. Ambient notifications muted.*`;
    },
  },

  {
    name: 'wellbeing_evaluate_circadian_light',
    description: 'Evaluates current blue-light melatonin suppression risk and suggests optimal screen color temperature.',
    input_schema: {
      type: 'object',
      properties: {
        bedtime_hour: { type: 'number', description: 'Target bedtime hour in 24h format (e.g. 23 for 11 PM).' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const guardian = getDigitalWellbeingGuardian();
      ctx.log('info', 'Assessing circadian photobiology and melatonin risk...');

      const evalResult = guardian.evaluateCircadianRisk(new Date(), input.bedtime_hour || 23);
      return `🌙 **CIRCADIAN BLUE-LIGHT EVALUATION**:
• **Current Risk Level**: **${evalResult.riskLevel}**
• **Hours Until Bedtime**: ~${evalResult.hoursUntilBed} hour(s)
• **Guidance**: ${evalResult.recommendations}`;
    },
  },
];
