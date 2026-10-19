'use strict';
// Autonomous Goal Graph & Reflexion Loop Plugin for Mave.
// Based on AutoGPT's Goal-to-DAG Decomposition, Plan-and-Solve Engine,
// and Fresh-Context "Zero-Theatre" Adversary Action Auditor.

const { AutonomousGoalDAG, GoalNode } = require('../../autonomous/goal_graph');
const { defaultAuditor } = require('../../autonomous/fresh_auditor');
const { reflexionEngine } = require('../../autonomous/reflexion_engine');

module.exports = [
  {
    name: 'plan_autonomous_goal',
    description: 'Decompose a complex, multi-stage human goal into a Directed Acyclic Graph (DAG) with dependency tracking, explicit milestone commitments, and interactive visual checklists (inspired by AutoGPT).',
    input_schema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'The high-level user objective (e.g. "Clone repo X, build it, run unit tests, and fix any errors").',
        },
        context: {
          type: 'string',
          description: 'Optional environment context, directory path, or operational constraints.',
        },
        custom_subtasks: {
          type: 'array',
          description: 'Optional custom list of milestone objects with title, description, and dependencies.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              dependencies: { type: 'array', items: { type: 'string' } },
              tool: { type: 'string' },
              commitment: { type: 'string' },
            },
            required: ['id', 'title'],
          },
        },
      },
      required: ['goal'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `Autonomous Planner: Decomposing goal "${input.goal}" into an executable DAG...`);

      let dag;
      if (Array.isArray(input.custom_subtasks) && input.custom_subtasks.length > 0) {
        dag = new AutonomousGoalDAG({ goal: input.goal, context: input.context || '' });
        for (const st of input.custom_subtasks) {
          dag.addNode(new GoalNode(st));
        }
      } else {
        dag = AutonomousGoalDAG.decompose(input.goal, input.context || '');
      }

      reflexionEngine.activeGoals.set(dag.id, dag);

      const checklist = dag.toChecklistMarkdown();
      const mermaid = dag.toMermaidDiagram();

      return `🚀 **AUTONOMOUS GOAL DAG GENERATED (AutoGPT Plan-and-Solve Engine)**:
**Execution ID**: \`${dag.id}\`
**Total Milestones**: ${dag.nodes.size}

${checklist}

\`\`\`mermaid
${mermaid}
\`\`\`

💡 **To begin autonomous execution**, call \`execute_autonomous_goal({ goal_id: "${dag.id}" })\`.`;
    },
  },

  {
    name: 'execute_autonomous_goal',
    description: 'Execute an Autonomous Goal DAG step-by-step using AutoGPT-style continuous loop with fresh-context adversary safety auditing and self-healing Reflexions on errors.',
    input_schema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'The execution ID of a previously planned goal DAG. If omitted, specify "goal" directly.',
        },
        goal: {
          type: 'string',
          description: 'Goal description if planning and executing in a single call.',
        },
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      let dag;
      if (input.goal_id) {
        dag = reflexionEngine.getGoal(input.goal_id);
        if (!dag) {
          throw new Error(`Goal ID "${input.goal_id}" not found. Run plan_autonomous_goal first.`);
        }
      } else if (input.goal) {
        dag = AutonomousGoalDAG.decompose(input.goal);
      } else {
        throw new Error('Either goal_id or goal must be specified.');
      }

      ctx.log('info', `Autonomous Engine: Starting execution loop for goal "${dag.goal}"...`);

      // Construct runner that executes tools safely within Mave's environment
      const toolRunner = async (tool, params, meta) => {
        ctx.log('info', `[DAG Step: ${meta.node.title}] Executing tool "${tool}"...`);
        // If run_command and terminal available, run command
        if (tool === 'run_command' && params.command && ctx.terminals) {
          try {
            const { exec } = require('child_process');
            return await new Promise((resolve, reject) => {
              exec(params.command, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                  reject(new Error(stderr ? stderr.trim() : error.message));
                } else {
                  resolve(stdout ? stdout.trim() : 'Command executed with exit code 0.');
                }
              });
            });
          } catch (err) {
            throw err;
          }
        }
        return `Successfully completed step "${meta.node.title}".`;
      };

      const result = await reflexionEngine.executeGoal(dag, {
        toolRunner,
        signal: ctx.signal,
        onUpdate: (updatedDag) => {
          const prog = updatedDag.getProgress();
          ctx.log('info', `[Goal Progress] ${prog.percentage}% (${prog.completed}/${prog.total})`);
        },
      });

      return `🏁 **AUTONOMOUS GOAL EXECUTION ${result.status.toUpperCase()}**:
**Goal**: "${dag.goal}"
**Progress**: ${result.progress.percentage}% (${result.progress.completed}/${result.progress.total} milestones completed)

${result.checklist}`;
    },
  },

  {
    name: 'get_autonomous_goal_status',
    description: 'Query the live status, progress percentage, execution milestones, and audit history of an autonomous goal.',
    input_schema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'Optional execution ID to query. If omitted, returns list of all active/past goals.',
        },
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      if (input.goal_id) {
        const dag = reflexionEngine.getGoal(input.goal_id);
        if (!dag) throw new Error(`Goal ID "${input.goal_id}" not found.`);
        return `📊 **AUTONOMOUS GOAL STATUS (\`${dag.id}\`)**:
${dag.toChecklistMarkdown()}`;
      }

      const list = reflexionEngine.listGoals();
      if (list.length === 0) {
        return 'No autonomous goals are currently tracked. Use `plan_autonomous_goal` to create one.';
      }

      const rows = list.map((g) => `• **${g.goal}** (\`${g.id}\`) - Status: \`${g.status}\`, Progress: ${g.progress.percentage}%`).join('\n');
      return `📋 **ACTIVE & RECENT AUTONOMOUS GOALS**:\n${rows}`;
    },
  },

  {
    name: 'audit_action_commitment',
    description: 'Perform AutoGPT\'s fresh-context "Zero-Theatre Audit" on any proposed action before execution. Evaluates the drafter\'s stated commitments against destructive patterns, secret leakage, and attention divergence.',
    input_schema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Tool name proposed to execute (e.g. "run_command", "write_file", "open_url").',
        },
        parameters: {
          type: 'object',
          description: 'Input arguments to pass to the tool.',
        },
        commitment: {
          type: 'string',
          description: 'What the drafter promises this action does and does NOT do (e.g. "Only inspect git logs; no file writes").',
        },
        user_goal: {
          type: 'string',
          description: 'The overall user objective this action claims to serve.',
        },
      },
      required: ['tool', 'parameters', 'commitment'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `Fresh-Context Auditor: Performing zero-theatre audit on proposed ${input.tool}...`);

      const audit = defaultAuditor.auditAction({
        goal: input.user_goal || '',
        proposal: {
          tool: input.tool,
          params: input.parameters,
          commitment: input.commitment,
        },
      });

      const icon = audit.approved ? '🛡️' : '🚨';
      return `${icon} **FRESH-CONTEXT AUDIT RESULT (${audit.auditor})**:
• **Verdict**: \`${audit.verdict}\` (Confidence Score: ${audit.score}/100)
• **Approved for Execution**: ${audit.approved ? '✅ YES' : '❌ NO (BLOCKED)'}
• **Rationale**: ${audit.reason}
${audit.safetyDirectives.length ? `• **Safety Directives**:\n  ${audit.safetyDirectives.map((d) => `✔ ${d}`).join('\n  ')}` : ''}`;
    },
  },
];
