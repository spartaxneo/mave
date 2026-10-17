'use strict';
// Local Smart Home & IoT Automation Plugin for Bigfoot.
// Provides 100% sovereign, local LAN control for Home Assistant, Philips Hue,
// WLED light strips, Tasmota/ESPHome smart plugs, and generic LAN HTTP IoT devices.
// Zero cloud subscriptions, zero third-party latency, zero recurring fees.

const { execFile } = require('child_process');

function normalizeUrl(url) {
  let s = String(url || '').trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = `http://${s}`;
  }
  return s.replace(/\/+$/, '');
}

function hexToRgb(hex) {
  if (!hex) return [255, 255, 255];
  const clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [255, 255, 255];
}

async function sendLanRequest(url, method = 'GET', headers = {}, body = null, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const opts = {
      method,
      headers,
      signal: controller.signal,
    };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      opts.body = typeof body === 'object' ? JSON.stringify(body) : String(body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Connection timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scan ARP cache table and categorize discovered LAN devices.
 */
function scanArpTable() {
  return new Promise((resolve) => {
    execFile('arp', ['-a'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      if (err) return resolve([]);
      const lines = String(stdout || '').split(/\r?\n/);
      const devices = [];

      const MAC_VENDORS = [
        { prefix: /^b8-27-eb|^dc-a6-32|^e4-5f-01|^28-cd-c1/i, type: 'Raspberry Pi / Home Assistant Hub' },
        { prefix: /^00-17-88|^ec-b5-fa/i, type: 'Philips Hue Bridge' },
        { prefix: /^24-0a-c4|^30-ae-a4|^84-0d-8e|^a4-cf-12|^d8-bf-c0|^bc-dd-c2/i, type: 'Espressif (WLED / ESPHome / Tasmota)' },
        { prefix: /^50-02-91|^98-cd-ac|^00-24-e4/i, type: 'TP-Link / Kasa Smart Device' },
        { prefix: /^68-c6-3a|^7c-49-eb/i, type: 'Sonoff / ITEAD Smart Switch' },
        { prefix: /^00-1e-c0|^74-da-38/i, type: 'Belkin Wemo IoT' },
      ];

      for (const line of lines) {
        const match = line.trim().match(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+([0-9a-fA-F-]+)\s+(\w+)/);
        if (match) {
          const ip = match[1];
          const mac = match[2].toLowerCase();
          const type = match[3];

          if (ip.endsWith('.255') || ip.startsWith('224.') || ip.startsWith('239.')) continue;

          let deviceClass = 'Network Device';
          for (const vendor of MAC_VENDORS) {
            if (vendor.prefix.test(mac)) {
              deviceClass = vendor.type;
              break;
            }
          }

          devices.push({ ip, mac, mode: type, deviceClass });
        }
      }

      resolve(devices);
    });
  });
}

module.exports = [
  {
    name: 'control_smart_home',
    description: 'Control smart home appliances and IoT lights/switches directly over local LAN. Operates Home Assistant, Philips Hue, WLED strips, Tasmota smart plugs, and generic local REST devices with zero cloud dependency.',
    input_schema: {
      type: 'object',
      properties: {
        system: {
          type: 'string',
          enum: ['home_assistant', 'philips_hue', 'wled', 'tasmota', 'generic_lan_http'],
          description: 'The smart home platform or protocol.',
        },
        action: {
          type: 'string',
          enum: ['turn_on', 'turn_off', 'toggle', 'set_brightness', 'set_color', 'query_state', 'trigger_scene'],
          description: 'Action to perform on the smart home device or group.',
        },
        endpoint: {
          type: 'string',
          description: 'IP address or local URL of the device/hub (e.g. "192.168.1.100:8123" or "http://192.168.1.50").',
        },
        entity_id: {
          type: 'string',
          description: 'Entity ID, light ID, or device name (e.g. "light.living_room", "1", "switch.desk").',
        },
        token: {
          type: 'string',
          description: 'Long-Lived Access Token for Home Assistant or username API key for Philips Hue.',
        },
        value: {
          type: 'string',
          description: 'Value parameter: brightness (0-255), hex color (e.g. "#ff7700"), or scene name.',
        },
      },
      required: ['system', 'action', 'endpoint'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const { system, action, entity_id, token, value } = input;
      const base = normalizeUrl(input.endpoint);

      const isRead = action === 'query_state';
      if (isRead) {
        await ctx.confirm('read', {
          title: 'Query Smart Home Status?',
          message: `Check status on ${system} (${base})`,
          confirm: 'Query Device',
        });
      } else {
        await ctx.confirm('change', {
          title: 'Send Smart Home Command?',
          message: `${action} on ${entity_id || system} via ${base}`,
          confirm: 'Execute Command',
        });
      }

      ctx.log('info', `Sending ${action} command to ${system} on ${base}...`);

      // 1. Home Assistant REST API
      if (system === 'home_assistant') {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        if (action === 'query_state') {
          if (!entity_id) throw new Error('entity_id is required to query Home Assistant state (e.g. "light.living_room").');
          const res = await sendLanRequest(`${base}/api/states/${entity_id}`, 'GET', headers);
          if (!res.ok) return `⚠️ Home Assistant Error: ${res.error || JSON.stringify(res.data)}`;
          return `🏠 **Home Assistant Device State** (\`${entity_id}\`):\n• State: **${res.data.state}**\n• Friendly Name: ${res.data.attributes?.friendly_name || 'N/A'}\n• Brightness: ${res.data.attributes?.brightness || 'N/A'}`;
        }

        const domain = (entity_id && entity_id.split('.')[0]) || 'homeassistant';
        let service = action === 'turn_off' ? 'turn_off' : action === 'toggle' ? 'toggle' : 'turn_on';
        if (action === 'trigger_scene') service = 'turn_on';

        const body = {};
        if (entity_id) body.entity_id = entity_id;
        if (action === 'set_brightness' && value) body.brightness = parseInt(value, 10);
        if (action === 'set_color' && value) body.rgb_color = hexToRgb(value);

        const res = await sendLanRequest(`${base}/api/services/${domain}/${service}`, 'POST', headers, body);
        if (!res.ok) return `⚠️ Home Assistant command failed: ${res.error || JSON.stringify(res.data)}`;
        return `✅ **Home Assistant**: Sent \`${service}\` to \`${entity_id || 'all'}\`. Response: Success.`;
      }

      // 2. Philips Hue Bridge Local API
      if (system === 'philips_hue') {
        const userKey = token || 'newdeveloper';
        const lightId = entity_id || '1';

        if (action === 'query_state') {
          const res = await sendLanRequest(`${base}/api/${userKey}/lights/${lightId}`, 'GET');
          if (!res.ok) return `⚠️ Philips Hue query failed: ${res.error || JSON.stringify(res.data)}`;
          const st = res.data.state || {};
          return `💡 **Philips Hue Light #${lightId}**:\n• Status: ${st.on ? '🟢 ON' : '⚫ OFF'}\n• Brightness: ${st.bri} / 254\n• Reachable: ${st.reachable ? 'Yes' : 'No'}`;
        }

        const body = {};
        if (action === 'turn_on') body.on = true;
        if (action === 'turn_off') body.on = false;
        if (action === 'set_brightness') {
          body.on = true;
          body.bri = Math.max(1, Math.min(254, parseInt(value || '254', 10)));
        }
        if (action === 'set_color') {
          body.on = true;
          const [r, g, b] = hexToRgb(value);
          // Simple RGB to Hue approximation
          body.hue = Math.round((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI + 360) % 360 * 182);
        }

        const res = await sendLanRequest(`${base}/api/${userKey}/lights/${lightId}/state`, 'PUT', {}, body);
        if (!res.ok) return `⚠️ Philips Hue command error: ${res.error || JSON.stringify(res.data)}`;
        return `💡 **Philips Hue**: Updated Light #${lightId} with ${JSON.stringify(body)}.`;
      }

      // 3. WLED Light Strips
      if (system === 'wled') {
        if (action === 'query_state') {
          const res = await sendLanRequest(`${base}/json/state`, 'GET');
          if (!res.ok) return `⚠️ WLED query failed: ${res.error || JSON.stringify(res.data)}`;
          return `🌈 **WLED Strip Status**:\n• Power: ${res.data.on ? '🟢 ON' : '⚫ OFF'}\n• Brightness: ${res.data.bri} / 255\n• Active Preset: ${res.data.ps || 'Default'}`;
        }

        const body = {};
        if (action === 'turn_on') body.on = true;
        if (action === 'turn_off') body.on = false;
        if (action === 'toggle') body.on = 't';
        if (action === 'set_brightness') {
          body.on = true;
          body.bri = Math.max(1, Math.min(255, parseInt(value || '255', 10)));
        }
        if (action === 'set_color') {
          body.on = true;
          const rgb = hexToRgb(value);
          body.seg = [{ col: [rgb] }];
        }

        const res = await sendLanRequest(`${base}/json/state`, 'POST', {}, body);
        if (!res.ok) return `⚠️ WLED command failed: ${res.error || JSON.stringify(res.data)}`;
        return `🌈 **WLED Strip**: Applied state update successfully (${action}).`;
      }

      // 4. Tasmota / ESPHome Plugs & Relays
      if (system === 'tasmota') {
        let cmnd = 'Power';
        if (action === 'turn_on') cmnd = 'Power%20On';
        if (action === 'turn_off') cmnd = 'Power%20Off';
        if (action === 'toggle') cmnd = 'Power%20TOGGLE';

        const res = await sendLanRequest(`${base}/cm?cmnd=${cmnd}`, 'GET');
        if (!res.ok) return `⚠️ Tasmota command error: ${res.error || JSON.stringify(res.data)}`;
        return `🔌 **Tasmota Device**: Command \`${cmnd}\` processed. State: **${res.data?.POWER || 'Updated'}**.`;
      }

      // 5. Generic LAN HTTP Device
      const method = action === 'query_state' ? 'GET' : 'POST';
      const res = await sendLanRequest(base, method);
      return `📡 **Generic Local HTTP**: Request to ${base} completed (Status: ${res.status || 'OK'}). Output: ${typeof res.data === 'object' ? JSON.stringify(res.data) : res.data}`;
    },
  },
  {
    name: 'discover_lan_devices',
    description: 'Scan the local network for connected smart home hubs, IoT smart plugs, ESP8266/ESP32 microcontrollers, Philips Hue bridges, and Home Assistant servers.',
    input_schema: {
      type: 'object',
      properties: {
        filter_type: {
          type: 'string',
          description: 'Optional filter to narrow down results (e.g. "smart_home", "raspberry_pi", "all").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', 'Scanning local ARP cache for network IoT devices...');
      const devices = await scanArpTable();

      if (!devices.length) {
        return '🔍 No active LAN devices found in local ARP cache table.';
      }

      const filtered = input.filter_type && input.filter_type !== 'all'
        ? devices.filter((d) => d.deviceClass.toLowerCase().includes(input.filter_type.toLowerCase()))
        : devices;

      const rows = filtered.map((d) => `| \`${d.ip}\` | \`${d.mac}\` | **${d.deviceClass}** |`).join('\n');

      return `🔍 **LOCAL NETWORK DISCOVERY REPORT**:
Discovered ${filtered.length} connected device(s) on local subnet:

| IP Address | MAC Address | Hardware / Device Type |
| :--- | :--- | :--- |
${rows}

*Tip: Use \`control_smart_home\` with the device's local IP address to control lights, switches, and hubs directly with zero cloud fees.*`;
    },
  },
];
