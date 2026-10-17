'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Agent, isConversationalTask, isPlanInsteadOfAction, isFalseCompletionHallucination } = require('../src/main/agent');
const connectedServices = require('../src/main/plugins/builtin/connected_services');

test('isConversationalTask accurately identifies conversational inquiries vs physical commands', () => {
  // Conversational questions that should NEVER open random apps or force tool actions
  assert.equal(isConversationalTask('how can you be better'), true);
  assert.equal(isConversationalTask('can you be better'), true);
  assert.equal(isConversationalTask('how to improve'), true);
  assert.equal(isConversationalTask('who are you'), true);
  assert.equal(isConversationalTask('what can you do'), true);
  assert.equal(isConversationalTask('what are your capabilities'), true);
  assert.equal(isConversationalTask('explain quantum computing'), true);
  assert.equal(isConversationalTask('tell me about yourself'), true);
  assert.equal(isConversationalTask('give me advice on my startup'), true);

  // Imperative action tasks that SHOULD execute computer tools
  assert.equal(isConversationalTask('open Brave and go to ChatGPT'), false);
  assert.equal(isConversationalTask('click the Sign In button'), false);
  assert.equal(isConversationalTask('type hello world into box 1'), false);
  assert.equal(isConversationalTask('run npm test in terminal'), false);
  assert.equal(isConversationalTask('scroll down the page'), false);
  assert.equal(isConversationalTask('delete temp.txt'), false);
});

test('isPlanInsteadOfAction does not force tools for conversational questions', () => {
  // If user asked "how can you be better", a conversational reply should NOT be treated as a plan needing tool nudging
  const reply = 'I can be better by helping you organize your workflow, opening apps faster, and learning your preferences.';
  assert.equal(isPlanInsteadOfAction(reply, 'how can you be better'), false);
  assert.equal(isPlanInsteadOfAction(reply, 'what can you do'), false);
});

test('isFalseCompletionHallucination intercepts fake action claims before tools execute', () => {
  // Case 1: Model claims it opened app / typed without actually having executed actions -> DETECTED
  assert.equal(isFalseCompletionHallucination('I have opened Chrome and navigated to github.com!', 'open Chrome and go to github.com', false), true);
  assert.equal(isFalseCompletionHallucination('Done! I created the file index.html with starter template.', 'create a file index.html', false), true);
  assert.equal(isFalseCompletionHallucination('I clicked the submit button for you.', 'click the submit button', false), true);

  // Case 2: Once action has actually been executed, legitimate completion is NOT flagged
  assert.equal(isFalseCompletionHallucination('Done! I created the file index.html with starter template.', 'create a file index.html', true), false);

  // Case 3: Pure conversational questions are never flagged
  assert.equal(isFalseCompletionHallucination('I have many capabilities including coding, web search, and voice.', 'what can you do', false), false);
});

test('Agent.prototype.checkGoalDivert blocks unrequested entertainment, YouTube, TikTok, and Instagram diverts', () => {
  const dummyAgent = Object.create(Agent.prototype);

  // Case 1: User asked for Python coding, model attempts to open YouTube -> BLOCKED
  const warningYt = dummyAgent.checkGoalDivert({ name: 'open_url', input: { url: 'https://www.youtube.com' } }, 'write a python script to parse logs');
  assert.match(warningYt, /did NOT request opening or using YouTube/i);

  // Case 2: User asked for math help, model attempts to open TikTok -> BLOCKED
  const warningTt = dummyAgent.checkGoalDivert({ name: 'open_app', input: { name: 'TikTok' } }, 'solve this differential equation');
  assert.match(warningTt, /did NOT request opening or using TikTok/i);

  // Case 3: User asked "how can you be better", model attempts to open Instagram -> BLOCKED
  const warning1 = dummyAgent.checkGoalDivert({ name: 'use_instagram', input: { action: 'open' } }, 'how can you be better');
  assert.match(warning1, /did NOT request opening or using Instagram|conversational question/i);

  // Case 4: User explicitly asked to open YouTube -> ALLOWED (null warning)
  const allowedYt = dummyAgent.checkGoalDivert({ name: 'open_url', input: { url: 'https://www.youtube.com' } }, 'open YouTube and search for Lo-Fi beats');
  assert.equal(allowedYt, null);
});

test('Agent.prototype.checkGoalDivert intercepts on-screen web placeholder hallucinations', () => {
  const dummyAgent = Object.create(Agent.prototype);

  // User asked to research a founder, model attempts to type the ChatGPT suggestion pill "What is the current weather in New York?"
  const task = 'go to chatgpt in brave and ask him about shivam maheshwari founder of fromnear';
  const divert = dummyAgent.checkGoalDivert({
    name: 'type_into',
    input: { id: 61, text: 'What is the current weather in New York?' },
  }, task);

  assert.ok(divert != null, 'Divert should be detected for weather placeholder');
  assert.match(divert, /web placeholder\/suggestion/i);
  assert.match(divert, /shivam maheshwari/i);

  // Valid query matching user intention is allowed
  const valid = dummyAgent.checkGoalDivert({
    name: 'type_into',
    input: { id: 61, text: 'Tell me about Shivam Maheshwari founder of Fromnear' },
  }, task);
  assert.equal(valid, null);
});

test('Connected Services plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(connectedServices));
  const toolNames = connectedServices.map((t) => t.name);

  assert.ok(toolNames.includes('chatgpt_intelligence'));
  assert.ok(toolNames.includes('claude_connector'));
  assert.ok(toolNames.includes('perplexity_connector'));
  assert.ok(toolNames.includes('gmail_search'));
  assert.ok(toolNames.includes('gmail_draft_email'));
  assert.ok(toolNames.includes('drive_search'));
  assert.ok(toolNames.includes('drive_sync_to_vault'));
  assert.ok(toolNames.includes('google_calendar_connector'));
  assert.ok(toolNames.includes('microsoft_365_connector'));
  assert.ok(toolNames.includes('slack_connector'));
  assert.ok(toolNames.includes('discord_connector'));
  assert.ok(toolNames.includes('notion_connector'));
  assert.ok(toolNames.includes('notes_search'));
  assert.ok(toolNames.includes('notes_create'));
  assert.ok(toolNames.includes('notes_append'));
  assert.ok(toolNames.includes('github_connector'));
  assert.ok(toolNames.includes('linear_jira_connector'));
  assert.ok(toolNames.includes('cloud_dev_connector'));
  assert.ok(toolNames.includes('finance_connector'));
  assert.ok(toolNames.includes('media_entertainment_connector'));
  assert.ok(toolNames.includes('todoist_reminders_connector'));
  assert.ok(toolNames.includes('cross_service_pipeline'));

  for (const tool of connectedServices) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('Connected Services notes_create and notes_search work reliably', async () => {
  const notesCreate = connectedServices.find((t) => t.name === 'notes_create');
  const notesSearch = connectedServices.find((t) => t.name === 'notes_search');
  const notesAppend = connectedServices.find((t) => t.name === 'notes_append');

  const mockCtx = {
    settings: { get: () => '' },
    log: () => {},
    confirm: async () => true,
  };

  const createRes = await notesCreate.run({
    title: 'Test Founder Dossier',
    content: 'Shivam Maheshwari is the founder of Fromnear.',
    tags: ['#founder', '#fromnear'],
  }, mockCtx);

  assert.match(createRes, /Note Created & Vaulted/i);

  const searchRes = await notesSearch.run({ query: 'Shivam' }, mockCtx);
  assert.match(searchRes, /Found .* Matching Note/i);
  assert.match(searchRes, /Test Founder Dossier/i);

  const appendRes = await notesAppend.run({
    title: 'Test Founder Dossier',
    addition: 'Fromnear builds high-impact consumer and business tools.',
  }, mockCtx);
  assert.match(appendRes, /Note Updated/i);
});

test('Connected Services cross_service_pipeline executes research-to-notes workflow', async () => {
  const pipeline = connectedServices.find((t) => t.name === 'cross_service_pipeline');
  const mockCtx = {
    settings: { get: () => '', secret: () => '' },
    log: () => {},
    confirm: async () => true,
  };

  const res = await pipeline.run({
    workflow: 'chatgpt_research_to_notes',
    topic_or_query: 'Shivam Maheshwari Fromnear',
  }, mockCtx);

  assert.match(res, /Cross-Service Pipeline Executed Successfully/i);
  assert.match(res, /ChatGPT Intelligence/i);
  assert.match(res, /Notes Database/i);
});

test('Connected Services developer and workplace connectors run cleanly', async () => {
  const gh = connectedServices.find((t) => t.name === 'github_connector');
  const cal = connectedServices.find((t) => t.name === 'google_calendar_connector');
  const slack = connectedServices.find((t) => t.name === 'slack_connector');
  const pipeline = connectedServices.find((t) => t.name === 'cross_service_pipeline');

  const mockCtx = {
    settings: { get: () => '', secret: () => '' },
    log: () => {},
    confirm: async () => true,
  };

  const ghRes = await gh.run({ action: 'view_prs', repo: 'facebook/react' }, mockCtx);
  assert.match(ghRes, /GitHub Connected/i);
  assert.match(ghRes, /facebook\/react/i);

  const calRes = await cal.run({ action: 'create_event', title: 'Sprint Review', date_time: 'Friday 4pm' }, mockCtx);
  assert.match(calRes, /Google Calendar/i);
  assert.match(calRes, /Sprint Review/i);

  const slackRes = await slack.run({ action: 'send_message', channel: '#general', message: 'Build deployed' }, mockCtx);
  assert.match(slackRes, /Slack Connected/i);

  const pipeRes = await pipeline.run({ workflow: 'dev_issue_to_pr', topic_or_query: 'Auth Token Refresh Bug' }, mockCtx);
  assert.match(pipeRes, /Linear -> GitHub -> Slack Pipeline/i);
});

