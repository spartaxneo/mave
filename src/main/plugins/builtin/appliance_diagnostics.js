'use strict';
// Autonomous Home Maintenance, Appliance Diagnostics & Warranty Vault Plugin for Mave.

const { getApplianceDiagnostics } = require('../../home/appliance_diagnostics');

module.exports = [
  {
    name: 'home_diagnose_appliance_error',
    description: 'Diagnoses manufacturer error codes for major household appliances (Bosch, Samsung, LG, Whirlpool) and provides step-by-step DIY repair guides.',
    input_schema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'Appliance brand (e.g., Bosch, Samsung, LG, Whirlpool).' },
        error_code: { type: 'string', description: 'Error code displayed on the screen (e.g. E15, 4E, OE, Er FF).' },
      },
      required: ['brand', 'error_code'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const diag = getApplianceDiagnostics();
      ctx.log('info', `Troubleshooting appliance error: ${input.brand} ${input.error_code}`);

      const result = diag.diagnoseErrorCode(input.brand, input.error_code);
      if (!result.found) {
        return `⚠️ ${result.message}`;
      }

      const steps = result.diySteps.map((s, idx) => `  ${idx + 1}. ${s}`).join('\n');
      const tools = result.toolsRequired.join(', ');

      return `🔧 **APPLIANCE DIAGNOSTIC REPORT**:
• **Appliance**: **${result.brand} ${result.appliance}** (\`${result.code}\`)
• **Meaning**: ${result.meaning}
• **Severity**: \`${result.severity}\`
• **Cost Comparison**: Pro Service: **${result.estimatedProCost}** vs DIY: **${result.diyCost}**
• **Tools Needed**: \`${tools}\`

🛠️ **Step-by-Step DIY Remediation**:
${steps}`;
    },
  },

  {
    name: 'home_check_preventative_maintenance',
    description: 'Checks household preventative maintenance schedules (HVAC air filters, refrigerator filters, smoke alarms, dryer vents).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const diag = getApplianceDiagnostics();
      ctx.log('info', 'Auditing household preventative maintenance schedules...');

      const schedule = diag.checkMaintenanceSchedule(new Date());
      const overdueLines = schedule.overdueTasks.map(t => `• ⚠️ **OVERDUE**: **${t.name}** [${t.location}] (Due: ${t.nextDueDate}, ${Math.abs(t.daysUntilDue)} days overdue)`).join('\n');
      const upcomingLines = schedule.upcomingTasks.map(t => `• 📅 **${t.name}**: Due in **${t.daysUntilDue} days** (${t.nextDueDate})`).join('\n');

      return `🏡 **HOUSEHOLD PREVENTATIVE MAINTENANCE AUDIT**:
${overdueLines ? `🚨 **Items Requiring Immediate Attention**:\n${overdueLines}\n\n` : '✅ Zero overdue maintenance items.\n\n'}📋 **Upcoming Routine Schedule**:
${upcomingLines}`;
    },
  },

  {
    name: 'home_log_maintenance_completed',
    description: 'Logs completion of a home maintenance task to reset its cycle timer.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          enum: ['hvac_filter', 'fridge_water', 'smoke_detector', 'dryer_vent'],
          description: 'Identifier of the maintenance task completed.',
        },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const diag = getApplianceDiagnostics();
      ctx.log('info', `Logging completed maintenance for: ${input.task_id}`);

      const res = diag.logCompletedMaintenance(input.task_id, new Date());
      return `✅ **MAINTENANCE LOGGED**:
• **Task**: **${res.taskName}**
• **Reset Timestamp**: \`${res.updatedLastDate}\``;
    },
  },
];
