'use strict';
// Local Neural Knowledge Vault (Zero-Cloud Personal RAG) Plugin for Bigfoot.
// Indexes and retrieves personal notes, code repos, documentation, and specs
// locally with instant semantic retrieval and zero cloud fees.

const { getKnowledgeVault } = require('../../rag/knowledge_vault');
const { resolvePath } = require('../lib/paths');

module.exports = [
  {
    name: 'index_personal_document',
    description: 'Index a local text, markdown, code, or documentation file into Bigfoot sovereign Knowledge Vault (Personal RAG) for instant semantic recall.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the file to index (.md, .txt, .js, .py, .json, .csv, etc.).',
        },
        category: {
          type: 'string',
          description: 'Optional category tag (e.g. "Work", "Personal", "Code", "Taxes", "Invoices").',
        },
      },
      required: ['file_path'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const resolved = resolvePath(input.file_path);
      await ctx.confirm('read', {
        title: 'Index Document into Vault?',
        message: `Parse and chunk ${resolved} into local neural search index`,
        confirm: 'Index Document',
      });

      ctx.log('info', `Chunking and indexing ${resolved} into Knowledge Vault...`);
      const vault = getKnowledgeVault();
      const res = vault.indexFile(resolved, input.category || 'General');

      return `📚 **DOCUMENT INDEXED INTO PERSONAL VAULT**:
• **File**: \`${res.name}\`
• **Category**: **${res.category}**
• **Semantic Chunks Created**: **${res.chunkCount}**
• **Location**: \`${res.path}\`

*You can now query this document anytime using \`search_knowledge_vault\`.*`;
    },
  },
  {
    name: 'search_knowledge_vault',
    description: 'Perform sovereign semantic search across all indexed personal notes, project documentation, codebases, and invoices in your local Knowledge Vault.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query or question (e.g. "auth token refresh", "warranty invoice", "project roadmap").',
        },
        category: {
          type: 'string',
          description: 'Optional category filter to restrict search scope.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of relevant chunks to retrieve (default: 4).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `Searching Knowledge Vault for "${input.query}"...`);
      const vault = getKnowledgeVault();
      const results = vault.search(input.query, input.category, input.limit || 4);

      if (results.length === 0) {
        return `🔍 **No Matching Knowledge Found**: No indexed snippets matching "${input.query}" in the vault. Try indexing files with \`index_personal_document\`.`;
      }

      const rows = results.map((r, idx) =>
        `**${idx + 1}. [${r.category}] \`${r.sourceName}\`** *(Relevance Score: ${r.score})*\n• Path: \`${r.sourcePath}\` (Chunk ${r.chunkIndex + 1})\n• Excerpt:\n> ${r.snippet}`
      ).join('\n\n');

      return `🧠 **KNOWLEDGE VAULT SEARCH RESULTS** (${results.length} citation(s)):\n\n${rows}`;
    },
  },
  {
    name: 'get_vault_status',
    description: 'View statistics and the list of documents currently indexed in Bigfoot Knowledge Vault.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      const vault = getKnowledgeVault();
      const stats = vault.getVaultStats();

      if (!stats.totalDocuments) {
        return '📚 **Knowledge Vault is Empty**: No personal documents have been indexed yet. Use `index_personal_document` to add files.';
      }

      const rows = stats.documents.map((d) =>
        `• **${d.name}** [${d.category}] - ${d.chunkCount} chunks (${Math.round(d.sizeBytes / 1024)} KB)`
      ).join('\n');

      return `📚 **KNOWLEDGE VAULT STATUS**:
• Total Indexed Documents: **${stats.totalDocuments}**
• Total Searchable Chunks: **${stats.totalChunks}**

**Indexed Files**:
${rows}`;
    },
  },
];
