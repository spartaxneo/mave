'use strict';
// Dedicated Bot Analytical Database & Tabular Data Tab for Mave (OpenMausBot parity).
// Provides an in-process local analytical database where Mave and its specialist personas
// can import spreadsheets, CSVs, customer lists, and financial logs, and execute deterministic
// SQL queries (SELECT, WHERE, SUM, AVG, GROUP BY, ORDER BY, LIMIT) with zero arithmetic hallucination.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolvePath } = require('../lib/paths');

const BOT_DATA_DIR = path.join(os.homedir(), '.mave', 'bot_data');

function ensureDataDir() {
  try {
    if (!fs.existsSync(BOT_DATA_DIR)) fs.mkdirSync(BOT_DATA_DIR, { recursive: true });
  } catch {}
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = lines[0].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const rawVals = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row = {};
    columns.forEach((col, idx) => {
      const val = rawVals[idx] !== undefined ? rawVals[idx] : null;
      // Convert number if numeric
      if (val !== null && val !== '' && !isNaN(Number(val))) {
        row[col] = Number(val);
      } else {
        row[col] = val;
      }
    });
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Lightweight, zero-dependency in-process SQL executor for tabular datasets.
 */
function executeSimpleSql(query, tables) {
  const q = query.trim().replace(/;$/, '');
  const match = q.match(/^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+([a-zA-Z0-9_,\s]+))?(?:\s+ORDER\s+BY\s+([a-zA-Z0-9_\s]+))?(?:\s+LIMIT\s+(\d+))?$/i);

  if (!match) {
    return { error: 'Unsupported SQL syntax. Supported: SELECT <fields|agg> FROM <table> [WHERE ...] [GROUP BY ...] [ORDER BY ...] [LIMIT ...]' };
  }

  const selectClause = match[1].trim();
  const tableName = match[2].trim().toLowerCase();
  const whereClause = match[3] ? match[3].trim() : null;
  const groupByClause = match[4] ? match[4].trim() : null;
  const orderByClause = match[5] ? match[5].trim() : null;
  const limitClause = match[6] ? parseInt(match[6], 10) : null;

  const table = tables[tableName];
  if (!table) {
    return { error: `Table "${tableName}" not found. Available: ${Object.keys(tables).join(', ')}` };
  }

  let filteredRows = [...table.rows];

  // 1. WHERE filter (basic col = val, col > val, col < val, col LIKE val)
  if (whereClause) {
    const condMatch = whereClause.match(/([a-zA-Z0-9_]+)\s*(=|!=|>|<|>=|<=|LIKE)\s*(.+)/i);
    if (condMatch) {
      const col = condMatch[1];
      const op = condMatch[2].toUpperCase();
      let rawVal = condMatch[3].trim().replace(/^["']|["']$/g, '');
      const numVal = !isNaN(Number(rawVal)) ? Number(rawVal) : null;

      filteredRows = filteredRows.filter((row) => {
        const val = row[col];
        if (op === '=') return String(val) === String(rawVal);
        if (op === '!=') return String(val) !== String(rawVal);
        if (op === '>') return numVal !== null && Number(val) > numVal;
        if (op === '<') return numVal !== null && Number(val) < numVal;
        if (op === '>=') return numVal !== null && Number(val) >= numVal;
        if (op === '<=') return numVal !== null && Number(val) <= numVal;
        if (op === 'LIKE') return String(val).toLowerCase().includes(rawVal.toLowerCase());
        return true;
      });
    }
  }

  // 2. GROUP BY and Aggregations (SUM, AVG, COUNT, MIN, MAX)
  if (groupByClause) {
    const groupCol = groupByClause.split(',')[0].trim();
    const groups = {};

    for (const row of filteredRows) {
      const key = String(row[groupCol]);
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    const aggMatch = selectClause.match(/(SUM|AVG|COUNT|MIN|MAX)\(([a-zA-Z0-9_*]+)\)/i);
    const results = [];

    for (const [key, groupRows] of Object.entries(groups)) {
      const outRow = { [groupCol]: key };
      if (aggMatch) {
        const aggFn = aggMatch[1].toUpperCase();
        const targetCol = aggMatch[2];
        const nums = groupRows.map((r) => Number(r[targetCol])).filter((n) => !isNaN(n));

        if (aggFn === 'COUNT') outRow['count'] = groupRows.length;
        if (aggFn === 'SUM') outRow[`sum_${targetCol}`] = nums.reduce((a, b) => a + b, 0);
        if (aggFn === 'AVG') outRow[`avg_${targetCol}`] = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;
        if (aggFn === 'MIN') outRow[`min_${targetCol}`] = Math.min(...nums);
        if (aggFn === 'MAX') outRow[`max_${targetCol}`] = Math.max(...nums);
      }
      results.push(outRow);
    }

    return { columns: Object.keys(results[0] || {}), rows: results };
  }

  // 3. Regular Aggregation without GROUP BY (e.g. SELECT SUM(amount) FROM sales)
  const singleAgg = selectClause.match(/^(SUM|AVG|COUNT|MIN|MAX)\(([a-zA-Z0-9_*]+)\)$/i);
  if (singleAgg) {
    const fn = singleAgg[1].toUpperCase();
    const col = singleAgg[2];
    const nums = filteredRows.map((r) => Number(r[col])).filter((n) => !isNaN(n));
    const res = {};
    if (fn === 'COUNT') res['count'] = filteredRows.length;
    if (fn === 'SUM') res[`sum_${col}`] = nums.reduce((a, b) => a + b, 0);
    if (fn === 'AVG') res[`avg_${col}`] = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;
    if (fn === 'MIN') res[`min_${col}`] = Math.min(...nums);
    if (fn === 'MAX') res[`max_${col}`] = Math.max(...nums);
    return { columns: Object.keys(res), rows: [res] };
  }

  // 4. Projections (SELECT col1, col2 or SELECT *)
  let projectedRows = filteredRows;
  if (selectClause !== '*') {
    const wantedCols = selectClause.split(',').map((c) => c.trim());
    projectedRows = filteredRows.map((row) => {
      const projected = {};
      wantedCols.forEach((c) => { projected[c] = row[c]; });
      return projected;
    });
  }

  // 5. ORDER BY
  if (orderByClause) {
    const [ordCol, ordDir] = orderByClause.split(/\s+/);
    const desc = ordDir && ordDir.toUpperCase() === 'DESC';
    projectedRows.sort((a, b) => {
      if (a[ordCol] < b[ordCol]) return desc ? 1 : -1;
      if (a[ordCol] > b[ordCol]) return desc ? -1 : 1;
      return 0;
    });
  }

  // 6. LIMIT
  if (limitClause) {
    projectedRows = projectedRows.slice(0, limitClause);
  }

  const columns = projectedRows[0] ? Object.keys(projectedRows[0]) : table.columns;
  return { columns, rows: projectedRows };
}

module.exports = [
  {
    name: 'bot_import_dataset',
    description: 'Import a CSV or JSON dataset into the bot\'s private analytical database tab (OpenMausBot Data Tab parity). Allows querying structured records without hallucination.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Identifier for the table (e.g. "sales", "invoices", "expenses", "users").'
        },
        file_path_or_content: {
          type: 'string',
          description: 'Absolute file path to CSV/JSON, or raw CSV string.'
        },
        description: {
          type: 'string',
          description: 'Optional human description of what this dataset contains.'
        }
      },
      required: ['table_name', 'file_path_or_content'],
      additionalProperties: false
    },
    async run(input, ctx) {
      ensureDataDir();
      const tableName = input.table_name.toLowerCase().trim();
      let content = input.file_path_or_content;

      if (!content.includes('\n') && fs.existsSync(resolvePath(content))) {
        content = fs.readFileSync(resolvePath(content), 'utf8');
      }

      ctx.log('info', `Importing dataset into table "${tableName}"...`);

      let tableData = null;
      if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          const columns = rows[0] ? Object.keys(rows[0]) : [];
          tableData = { columns, rows };
        } catch {}
      }

      if (!tableData) {
        tableData = parseCsv(content);
      }

      const filePath = path.join(BOT_DATA_DIR, `${tableName}.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        table_name: tableName,
        description: input.description || 'Imported dataset',
        columns: tableData.columns,
        rows: tableData.rows,
        importedAt: new Date().toISOString()
      }, null, 2), 'utf8');

      return `📊 **DATASET IMPORTED INTO BOT DATA TAB**:
• **Table Name**: \`${tableName}\`
• **Rows**: ${tableData.rows.length} rows loaded
• **Columns (${tableData.columns.length})**: ${tableData.columns.map((c) => `\`${c}\``).join(', ')}
• **Storage**: \`${filePath}\`

*Run deterministic analytical queries on this data using \`bot_sql_query\`.*`;
    }
  },
  {
    name: 'bot_sql_query',
    description: 'Execute deterministic SQL queries (SELECT, WHERE, SUM, AVG, COUNT, GROUP BY, ORDER BY, LIMIT) across imported datasets in the Bot Data Tab (zero math hallucinations).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL statement (e.g. "SELECT category, SUM(amount) FROM expenses GROUP BY category").'
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    async run(input, ctx) {
      ensureDataDir();
      const query = input.query.trim();
      ctx.log('info', `Executing Bot SQL: ${query}`);

      // Load all available tables from disk
      const tables = {};
      try {
        const files = fs.readdirSync(BOT_DATA_DIR).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = JSON.parse(fs.readFileSync(path.join(BOT_DATA_DIR, file), 'utf8'));
          tables[content.table_name] = content;
        }
      } catch {}

      const result = executeSimpleSql(query, tables);
      if (result.error) {
        return `❌ **SQL EXECUTION ERROR**: ${result.error}`;
      }

      const header = result.columns.join(' | ');
      const divider = result.columns.map(() => '---').join(' | ');
      const rowsRender = result.rows.map((r) => result.columns.map((col) => String(r[col] !== undefined ? r[col] : '')).join(' | ')).join('\n');

      return `📈 **BOT SQL QUERY RESULT**:
*Query*: \`${query}\`
*Returned*: ${result.rows.length} records

| ${header} |
| ${divider} |
${rowsRender}

*(Computed deterministically in-process with 0% arithmetic hallucination).*`;
    }
  },
  {
    name: 'bot_list_tables',
    description: 'Enumerate all structured analytical tables stored in the Bot Data Tab.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async run(_input, ctx) {
      ensureDataDir();
      const tables = [];
      try {
        const files = fs.readdirSync(BOT_DATA_DIR).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = JSON.parse(fs.readFileSync(path.join(BOT_DATA_DIR, file), 'utf8'));
          tables.push(content);
        }
      } catch {}

      if (tables.length === 0) {
        return `ℹ️ **BOT DATA TAB**: No analytical tables currently loaded. Use \`bot_import_dataset\` to load CSVs or JSON data.`;
      }

      const list = tables.map((t) => `• **${t.table_name}**: ${t.rows.length} rows | Columns: [${t.columns.join(', ')}] | *${t.description}*`).join('\n');
      return `📊 **ACTIVE BOT DATA TAB TABLES** (${tables.length}):\n\n${list}`;
    }
  }
];
