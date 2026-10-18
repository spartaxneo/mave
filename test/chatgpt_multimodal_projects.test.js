'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { ThreadManager } = require('../src/main/threads');
const { MultimodalAnalyzer, getMultimodalAnalyzer } = require('../src/main/multimodal/analyzer');
const { GenerativeMediaEngine, getGenerativeMediaEngine } = require('../src/main/multimodal/generator');

test('ThreadManager: Project creation, listing, updating, and thread association', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-threads-'));
  const threadsFile = path.join(tmpDir, 'threads.json');
  const projectsFile = path.join(tmpDir, 'projects.json');

  const tm = new ThreadManager(threadsFile, projectsFile);

  // 1. Create Project
  const project = tm.createProject('Quantum Research', 'Always provide citations and mathematical rigor.');
  assert.ok(project.id.startsWith('proj_'));
  assert.equal(project.name, 'Quantum Research');
  assert.equal(project.instructions, 'Always provide citations and mathematical rigor.');

  // 2. Create Threads attached to project
  const thread1 = tm.createThread('Quantum Entanglement', 'desktop', project.id);
  const thread2 = tm.createThread('Bell Inequalities', 'desktop', project.id);
  const unlinkedThread = tm.createThread('General Chat', 'desktop', null);

  assert.equal(thread1.projectId, project.id);
  assert.equal(thread2.projectId, project.id);
  assert.equal(unlinkedThread.projectId, null);

  // 3. List Projects with threadCount calculation
  const projectList = tm.listProjects();
  assert.equal(projectList.length, 1);
  assert.equal(projectList[0].id, project.id);
  assert.equal(projectList[0].threadCount, 2);

  // 4. Update Project
  const updated = tm.updateProject(project.id, { name: 'Quantum & Particle Physics' });
  assert.equal(updated.name, 'Quantum & Particle Physics');
  assert.equal(tm.getProject(project.id).name, 'Quantum & Particle Physics');

  // 5. Delete Project unlinks threads
  const deleted = tm.deleteProject(project.id);
  assert.equal(deleted, true);
  assert.equal(tm.getProject(project.id), null);
  assert.equal(tm.getThread(thread1.id).projectId, null);
  assert.equal(tm.getThread(thread2.id).projectId, null);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ThreadManager: Archiving, Pinning, Renaming, and Active Thread Management', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-archive-'));
  const threadsFile = path.join(tmpDir, 'threads.json');
  const projectsFile = path.join(tmpDir, 'projects.json');

  const tm = new ThreadManager(threadsFile, projectsFile);

  const t1 = tm.createThread('Alpha Thread', 'desktop');
  const t2 = tm.createThread('Beta Thread', 'desktop');

  // Active thread should be t2
  assert.equal(tm.getActiveThread('desktop').id, t2.id);

  // Pinning
  tm.pinThread(t1.id, true);
  assert.equal(tm.getThread(t1.id).pinned, true);

  // Renaming
  tm.renameThread(t1.id, 'Renamed Alpha Project');
  assert.equal(tm.getThread(t1.id).title, 'Renamed Alpha Project');

  // Archiving
  assert.equal(tm.getThread(t2.id).archived, false);
  tm.archiveThread(t2.id, true);
  assert.equal(tm.getThread(t2.id).archived, true);

  // Check archived listing
  const archived = tm.listArchivedThreads();
  assert.ok(archived.some(t => t.id === t2.id));

  // Since t2 was active and now archived, getActiveThread should fallback to t1 (unarchived)
  assert.equal(tm.getActiveThread('desktop').id, t1.id);

  // Unarchive t2
  tm.unarchiveThread(t2.id);
  assert.equal(tm.getThread(t2.id).archived, false);
  assert.equal(tm.listArchivedThreads().length, 0);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ThreadManager: Timeline Grouping (Pinned, Today, Yesterday, 7 Days, 30 Days)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-timeline-'));
  const threadsFile = path.join(tmpDir, 'threads.json');
  const projectsFile = path.join(tmpDir, 'projects.json');

  const tm = new ThreadManager(threadsFile, projectsFile);

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Thread today
  const thToday = tm.createThread('Today Task', 'desktop');
  thToday.updatedAt = now - (1000 * 60 * 5); // 5 mins ago

  // Thread pinned
  const thPinned = tm.createThread('Pinned Notes', 'desktop');
  thPinned.pinned = true;
  thPinned.updatedAt = now - (oneDayMs * 10); // older, but pinned

  // Thread yesterday
  const thYesterday = tm.createThread('Yesterday Debrief', 'desktop');
  thYesterday.updatedAt = now - (oneDayMs * 1.5);

  // Thread 7 days
  const th7Days = tm.createThread('Last Week Sprint', 'desktop');
  th7Days.updatedAt = now - (oneDayMs * 4);

  // Thread 30 days
  const th30Days = tm.createThread('Monthly Report', 'desktop');
  th30Days.updatedAt = now - (oneDayMs * 15);

  // Thread older
  const thOlder = tm.createThread('Ancient Chat', 'desktop');
  thOlder.updatedAt = now - (oneDayMs * 45);

  tm.save();

  const groups = tm.getTimelineGroups();

  assert.ok(groups.pinned.some(t => t.id === thPinned.id));
  assert.ok(groups.today.some(t => t.id === thToday.id));
  assert.ok(groups.yesterday.some(t => t.id === thYesterday.id));
  assert.ok(groups.previous7Days.some(t => t.id === th7Days.id));
  assert.ok(groups.previous30Days.some(t => t.id === th30Days.id));
  assert.ok(groups.older.some(t => t.id === thOlder.id));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ThreadManager: Multimodal message retention and searching', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-multimodal-msg-'));
  const threadsFile = path.join(tmpDir, 'threads.json');
  const projectsFile = path.join(tmpDir, 'projects.json');

  const tm = new ThreadManager(threadsFile, projectsFile);
  const thread = tm.createThread('Design Meeting', 'desktop');

  // Add message with attachments
  tm.addMessage(thread.id, 'user', 'Analyze this wireframe diagram', {
    attachments: [
      { name: 'wireframe.png', type: 'image', size: 102400, mimeType: 'image/png' }
    ]
  });

  const updatedThread = tm.getThread(thread.id);
  const msgUser = updatedThread.messages[0];
  assert.equal(msgUser.role, 'user');
  assert.equal(msgUser.attachments.length, 1);
  assert.equal(msgUser.attachments[0].name, 'wireframe.png');

  // Add assistant message with generated media
  tm.addMessage(thread.id, 'assistant', 'Here is the improved aesthetic render.', {
    generatedMedia: [
      { id: 'img_123', type: 'image', url: 'data:image/svg+xml;base64,PHN2Zz4=', summary: '🎨 Image Generated' }
    ]
  });

  const msgAssistant = tm.getThread(thread.id).messages[1];
  assert.equal(msgAssistant.role, 'assistant');
  assert.equal(msgAssistant.generatedMedia.length, 1);
  assert.equal(msgAssistant.generatedMedia[0].type, 'image');

  // Verify search
  const foundByTitle = tm.searchThreads('Design');
  assert.equal(foundByTitle.length, 1);
  assert.equal(foundByTitle[0].id, thread.id);

  const foundByContent = tm.searchThreads('wireframe diagram');
  assert.equal(foundByContent.length, 1);
  assert.equal(foundByContent[0].id, thread.id);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('MultimodalAnalyzer: Ingests documents, CSVs, JSON, SVGs, and formats prompt context', async () => {
  const analyzer = getMultimodalAnalyzer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-analyzer-'));

  // 1. Text document
  const txtPath = path.join(tmpDir, 'notes.txt');
  fs.writeFileSync(txtPath, 'Line 1: Objectives\nLine 2: Milestones\nLine 3: Deliverables\n', 'utf8');
  const txtResult = await analyzer.analyzeFile(txtPath);
  assert.equal(txtResult.ok, true);
  assert.equal(txtResult.file.type, 'document');
  assert.equal(txtResult.analysis.lineCount, 3);
  assert.ok(txtResult.analysis.summary.includes('notes.txt'));

  // 2. CSV document
  const csvPath = path.join(tmpDir, 'revenue.csv');
  fs.writeFileSync(csvPath, 'Quarter,Revenue,Profit\nQ1,120000,34000\nQ2,150000,42000\nQ3,180000,51000\n', 'utf8');
  const csvResult = await analyzer.analyzeFile(csvPath);
  assert.equal(csvResult.ok, true);
  assert.ok(csvResult.analysis.summary.includes('Tabular CSV dataset with 3 rows'));
  assert.ok(csvResult.analysis.summary.includes('Columns: [Quarter,Revenue,Profit]'));

  // 3. JSON document
  const jsonPath = path.join(tmpDir, 'config.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ mode: 'autonomous', maxTokens: 4096, stream: true }), 'utf8');
  const jsonResult = await analyzer.analyzeFile(jsonPath);
  assert.equal(jsonResult.ok, true);
  assert.ok(csvResult.analysis.summary.includes('CSV'));
  assert.ok(jsonResult.analysis.summary.includes('Structured JSON object containing 3 keys'));

  // 4. SVG Image
  const svgPath = path.join(tmpDir, 'vector.svg');
  fs.writeFileSync(svgPath, '<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><circle cx="400" cy="300" r="100"/></svg>', 'utf8');
  const svgResult = await analyzer.analyzeFile(svgPath);
  assert.equal(svgResult.ok, true);
  assert.equal(svgResult.file.type, 'image');
  assert.equal(svgResult.analysis.dimensions.width, 800);
  assert.equal(svgResult.analysis.dimensions.height, 600);
  assert.ok(svgResult.analysis.previewUrl.startsWith('data:image/svg+xml;base64,'));

  // 5. Generate prompt injection context
  const context = analyzer.generateAttachmentContext([
    {
      name: 'revenue.csv',
      type: 'document',
      analysis: csvResult.analysis
    },
    {
      name: 'vector.svg',
      type: 'image',
      analysis: svgResult.analysis
    }
  ]);

  assert.ok(context.includes('[USER ATTACHED MULTIMODAL FILES (2)]'));
  assert.ok(context.includes('revenue.csv'));
  assert.ok(context.includes('vector.svg'));
  assert.ok(context.includes('Tabular CSV dataset'));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GenerativeMediaEngine: Generates high-definition artwork and video storyboards', async () => {
  const engine = getGenerativeMediaEngine();

  // 1. Generate Image with theme detection
  const imgResult = await engine.generateImage({
    prompt: 'Neon cybernetic cityscape at dusk with flying autonomous vehicles',
    style: 'cyberpunk'
  });

  assert.equal(imgResult.ok, true);
  assert.equal(imgResult.type, 'image');
  assert.ok(imgResult.id.startsWith('img_'));
  assert.ok(fs.existsSync(imgResult.filePath));
  assert.ok(imgResult.url.startsWith('data:image/svg+xml;base64,'));
  assert.equal(imgResult.width, 1024);
  assert.equal(imgResult.height, 1024);
  assert.ok(imgResult.summary.includes('Image Generated'));

  // Read generated image content
  const svgContent = fs.readFileSync(imgResult.filePath, 'utf8');
  assert.ok(svgContent.includes('<svg'));
  assert.ok(svgContent.includes('Cyberpunk Neon')); // theme verified

  // 2. Generate Video with storyboard
  const vidResult = await engine.generateVideo({
    prompt: 'Cinematic drone shot soaring over deep emerald mountain valleys',
    durationSeconds: 8,
    style: 'cinematic'
  });

  assert.equal(vidResult.ok, true);
  assert.equal(vidResult.type, 'video');
  assert.ok(vidResult.id.startsWith('vid_'));
  assert.ok(fs.existsSync(vidResult.filePath));
  assert.ok(vidResult.url.startsWith('data:text/html;base64,'));
  assert.equal(vidResult.durationSeconds, 8);
  assert.ok(Array.isArray(vidResult.storyboard));
  assert.equal(vidResult.storyboard.length, 3);
  assert.ok(vidResult.summary.includes('Video Generated'));

  // Read generated video content
  const htmlContent = fs.readFileSync(vidResult.filePath, 'utf8');
  assert.ok(htmlContent.includes('<canvas id="c"'));
  assert.ok(htmlContent.includes('requestAnimationFrame(frame)'));

  // 3. Error on empty prompts
  await assert.rejects(
    async () => { await engine.generateImage({ prompt: '' }); },
    /Prompt is required/
  );
  await assert.rejects(
    async () => { await engine.generateVideo({ prompt: '   ' }); },
    /Prompt is required/
  );
});
