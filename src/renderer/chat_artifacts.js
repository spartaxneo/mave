'use strict';

/**
 * ChatArtifactsRenderer: Renders interactive, rich artifact cards for files,
 * reports, spreadsheets, and code generated inside MAVE's Virtual Computer.
 */
class ChatArtifactsRenderer {
  constructor() {
    this.typeIcons = {
      document: '📄',
      markdown: '📝',
      spreadsheet: '📊',
      code: '💻',
      presentation: '📽️',
      image: '🖼️',
      file: '📦',
    };
  }

  /**
   * Render an Artifact Card HTML snippet for injection into chat responses.
   * @param {object} artifact
   * @param {string} artifact.fileName
   * @param {string} artifact.guestPath
   * @param {number} artifact.sizeBytes
   * @param {string} [artifact.type]
   * @param {string} [artifact.title]
   */
  renderCard(artifact) {
    if (!artifact || !artifact.fileName) return '';

    const icon = this.typeIcons[artifact.type] || this.typeIcons.file;
    const sizeKb = artifact.sizeBytes ? `${Math.round(artifact.sizeBytes / 1024 * 10) / 10} KB` : 'Generated Artifact';
    const title = artifact.title || artifact.fileName;

    return `
      <div class="mave-artifact-card" data-guest-path="${artifact.guestPath || artifact.fileName}">
        <div class="mave-artifact-icon">${icon}</div>
        <div class="mave-artifact-info">
          <div class="mave-artifact-title">${this._escape(title)}</div>
          <div class="mave-artifact-meta">
            <span class="mave-artifact-filename">${this._escape(artifact.fileName)}</span>
            <span class="mave-artifact-bullet">•</span>
            <span class="mave-artifact-size">${sizeKb}</span>
            <span class="mave-artifact-badge">Virtual PC</span>
          </div>
        </div>
        <div class="mave-artifact-actions">
          <button type="button" class="mave-artifact-btn primary" data-action="export-artifact" data-path="${artifact.guestPath || artifact.fileName}" title="Save file to your host computer">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v9M4 7l4 4 4-4M2 13h12"/></svg>
            <span>Save to Host</span>
          </button>
          <button type="button" class="mave-artifact-btn secondary" data-action="view-virtual-pc" title="Open in MAVE Virtual Computer viewer">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="12" height="8" rx="1.5"/><line x1="5" y1="14" x2="11" y2="14"/><line x1="8" y1="11" x2="8" y2="14"/></svg>
            <span>View</span>
          </button>
        </div>
      </div>
    `;
  }

  bindCardEvents(container) {
    if (!container) return;

    container.querySelectorAll('[data-action="export-artifact"]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const guestPath = btn.dataset.path;
        btn.textContent = 'Exporting...';
        try {
          if (window.buddy) {
            await window.buddy.invoke('vc:export-file', { guestPath });
            btn.textContent = 'Saved to Downloads!';
            btn.style.color = '#10b981';
          }
        } catch (err) {
          btn.textContent = 'Export Failed';
          alert(`Could not export artifact: ${err.message}`);
        }
      };
    });

    container.querySelectorAll('[data-action="view-virtual-pc"]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (typeof window.show === 'function') {
          window.show('virtual-computer');
        }
      };
    });
  }

  _escape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

if (typeof window !== 'undefined') {
  window.chatArtifacts = new ChatArtifactsRenderer();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChatArtifactsRenderer };
}
