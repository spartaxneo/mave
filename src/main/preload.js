'use strict';
// The only bridge between the UI and the main process. Renderers never see API keys.

const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'settings:get', 'settings:update', 'provider:test', 'models:list', 'provider:active',
  'voices:list', 'voice:preview', 'voice:stop', 'speech:speak', 'mic:status', 'mic:test', 'wake:status',
  'task:run', 'task:stop', 'conversation:reset', 'select:start', 'region:clear',
  'app:open-settings', 'app:open-onboarding', 'app:quit', 'app:open-logs', 'app:open-plugins', 'app:open-link', 'app:info',
  'onboarding:finish', 'window:close', 'window:minimize', 'panel:resize', 'approval:answer',
  'terminal:open', 'terminal:get', 'terminal:clear', 'terminal:reveal',
  'term:shells', 'term:list', 'term:create', 'term:replay', 'term:close', 'term:open-url',
  'local:hardware', 'local:status', 'local:start', 'local:pause', 'local:resume', 'local:cancel',
  'local:custom-scan', 'local:pick-file', 'local:remove-custom',
  'superpowers:status', 'pet:feed', 'pet:summon', 'telegram:connect', 'knowledge:reindex', 'routines:briefing',
  'toolbar:pick', 'math:read', 'math:ink', 'math:system', 'math:calc', 'math:share', 'ink:stop', 'tool:exit', 'ink:share', 'ink:reveal', 'loader:status', 'loader:retry',
  'plugins:list', 'plugins:pick', 'plugins:install', 'plugins:remove',
  'diagnostics:fix', 'diagnostics:errors', 'diagnostics:clear',
  'governance:get-state', 'governance:set-active-user', 'governance:save-customization',
  'governance:admin-verify-pin', 'governance:admin-update-user', 'governance:admin-create-user',
  'governance:admin-delete-user', 'governance:admin-update-rules', 'governance:admin-set-device-power',
  'governance:admin-change-pin',
  'threads:list', 'threads:get', 'threads:create', 'threads:switch', 'threads:rename', 'threads:pin',
  'threads:archive', 'threads:unarchive', 'threads:delete', 'threads:archived', 'threads:groups',
  'projects:list', 'projects:create', 'projects:update', 'projects:delete',
  'media:generate-image', 'media:generate-video', 'media:analyze-file', 'file:pick',
  'firebase:get-config', 'firebase:sign-up', 'firebase:sign-in', 'firebase:sign-in-provider', 'firebase:sign-in-anon',
  'firebase:sign-out', 'firebase:get-user', 'firebase:update-profile', 'firebase:sync-device',
  'firebase:get-devices', 'firebase:save-preferences', 'firebase:get-preferences', 'firebase:password-reset',
  'users:list', 'users:add', 'users:remove', 'users:update-role', 'users:invite', 'users:accept-invite',
  'users:apikeys', 'users:create-key', 'users:revoke-key', 'host:info', 'host:update-settings',
  'mesh:status', 'mesh:auto-join', 'mesh:offload-page', 'mesh:merge-attn', 'mesh:disconnect',
  'promptcache:stats', 'promptcache:clear',
  'autonomous:plan', 'autonomous:execute', 'autonomous:status', 'autonomous:audit',
  'island:expand', 'island:collapse', 'island:open-main', 'island:toggle', 'island:status',
  'sentinel:status', 'sentinel:summary', 'sentinel:save-summary', 'sentinel:clear-history',
  'sentinel:update-privacy', 'sentinel:test-connectivity', 'sentinel:notify',
  'notifications:test', 'storage:stats', 'storage:clean-cache', 'storage:vacuum',
  'usage:stats', 'usage:reset', 'analytics:stats', 'data:export-all', 'data:clear-history',
  'security:setup-2fa', 'security:verify-2fa', 'security:disable-2fa', 'security:revoke-sessions',
  'trusted-contact:test-alert', 'plugins:toggle',
  'ghost:status', 'ghost:search', 'ghost:index-doc', 'ghost:mcp-catalog',
  'ghost:mcp-install', 'ghost:mcp-uninstall', 'ghost:mcp-call', 'ghost:render-a2ui',
  'ghost:file-watcher-stats', 'ghost:file-watcher-crawl', 'ghost:hardware-profile',
  'ghost:open-file', 'ghost:reveal-file',
  'code-interpreter:run',
  'personas:list', 'personas:get', 'personas:get-active', 'personas:set-active', 'personas:create', 'personas:delete',
  'personalization:get', 'personalization:update', 'personalization:memories', 'personalization:add-memory', 'personalization:delete-memory', 'personalization:clear-memories',
  'jarvis:telemetry', 'jarvis:briefing',
  'local:check-updates', 'local:auto-update-status', 'pet:pet', 'pet:play',
  'instagram:get-profile', 'instagram:update-profile', 'instagram:analyze-reel', 'instagram:get-rules', 'instagram:teach-rule',
  'routines:tidy', 'knowledge:list', 'knowledge:add', 'knowledge:delete', 'knowledge:search',
  'voice-mode:toggle', 'voice-mode:status', 'media:list-images', 'media:reveal-folder',
  'region:start', 'dictation:set-mode', 'dictation:toggle', 'dictation:status',
  'vorssaint:telemetry', 'vorssaint:agents', 'vorssaint:clipboard-history',
  'vorssaint:clipboard-copy', 'vorssaint:clipboard-clear', 'vorssaint:scratchpad-get',
  'vorssaint:scratchpad-save', 'vorssaint:keep-awake-set', 'vorssaint:keep-awake-get',
  'vorssaint:cleaning-toggle', 'vorssaint:settings-get', 'vorssaint:settings-update',
]);
const SEND = new Set([
  'overlay:ready', 'overlay:fly-done', 'overlay:region', 'overlay:region-ask', 'panel:ready',
  'engine:ready', 'engine:reply', 'engine:level', 'engine:vad', 'ink:passthrough', 'ink:reply', 'ink:state', 'loader:pointer', 'term:input', 'term:resize',
]);
const RECEIVE = new Set([
  'cursor', 'state', 'bubble', 'bubble-live', 'fly', 'banner', 'welcome', 'settings', 'log', 'log-live', 'log-image', 'usage', 'level',
  'thought', 'recommendations', 'voice:speaking', 'autonomous:update', 'island:update',
  'engine:cmd', 'approval:show', 'buddy:visible', 'annotate', 'select', 'region', 'terminal:line',
  'local:progress', 'local:runtime', 'toolbar:show', 'ink', 'voice-mode', 'loader', 'tools-blocked', 'term:data', 'term:exit', 'term:list', 'term:focus',
  'sentinel:network-change', 'sentinel:incoming-activity', 'ghost:a2ui', 'ghost:thought',
  'jarvis:intervention', 'voice:toggle-talk',
]);

contextBridge.exposeInMainWorld('buddy', {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`Blocked IPC channel ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  send(channel, payload) {
    if (!SEND.has(channel)) throw new Error(`Blocked IPC channel ${channel}`);
    ipcRenderer.send(channel, payload);
  },
  on(channel, fn) {
    if (!RECEIVE.has(channel)) throw new Error(`Blocked IPC channel ${channel}`);
    const listener = (_event, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
