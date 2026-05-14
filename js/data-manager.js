/**
 * data-manager.js — Data management panel (export, import, migration).
 */

import { getMode } from './db.js';
import { migrateServerToIdb } from './migrate.js';
import { exportBackup, importBackup } from './backup.js';
import { el, toast, confirmDialog } from './utils.js';
import { openFormPanel } from './forms.js';
import { loadAll } from './store.js';

export function openDataManager() {
  const mode = getMode();

  const body = el('div', { class: 'data-manager' },
    el('div', { class: 'dm-section' },
      el('h4', {}, 'Storage Mode'),
      el('p', { class: 'dm-mode-badge ' + mode },
        mode === 'http' ? 'Server (SQLite)' : 'Browser (IndexedDB)'
      ),
      el('p', { class: 'dm-hint' },
        mode === 'http'
          ? 'Data is stored on the server in SQLite. You can copy it to your browser for offline use.'
          : 'Data is stored locally in your browser. Export regularly to avoid data loss.'
      ),
    ),

    // Export section (IDB mode)
    mode === 'idb' ? el('div', { class: 'dm-section' },
      el('h4', {}, 'Backup'),
      el('div', { class: 'dm-actions' },
        el('button', { class: 'btn btn-primary', onClick: handleExport }, 'Export Data (JSON)'),
        el('button', { class: 'btn btn-outline', onClick: handleExportWithScreenshots }, 'Export with Screenshots'),
      ),
    ) : null,

    // Import section (IDB mode)
    mode === 'idb' ? el('div', { class: 'dm-section' },
      el('h4', {}, 'Restore'),
      el('div', { class: 'dm-actions' },
        el('button', { class: 'btn btn-outline', onClick: handleImport }, 'Import Backup'),
      ),
    ) : null,

    // Migrate section
    el('div', { class: 'dm-section' },
      el('h4', {}, 'Migration'),
      el('div', { class: 'dm-actions' },
        mode === 'http'
          ? el('button', { class: 'btn btn-outline', onClick: handleMigrateToBrowser }, 'Copy to Browser Storage')
          : el('button', { class: 'btn btn-outline', onClick: handleMigrateFromServer }, 'Import from Server'),
      ),
      el('p', { class: 'dm-hint' },
        mode === 'http'
          ? 'Copies all data + screenshots to IndexedDB so you can use TMS without the server.'
          : 'If the server is running locally, pull its data into your browser storage.'
      ),
    ),
  );

  openFormPanel({ title: 'Data Management', body, onSubmit: () => {}, submitLabel: 'Done' });
}

async function handleExport() {
  try {
    await exportBackup({ includeScreenshots: false });
    toast('Backup exported successfully', 'success');
  } catch (e) {
    toast('Export failed: ' + e.message, 'error');
  }
}

async function handleExportWithScreenshots() {
  try {
    await exportBackup({ includeScreenshots: true });
    toast('Full backup exported', 'success');
  } catch (e) {
    toast('Export failed: ' + e.message, 'error');
  }
}

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    if (!input.files[0]) return;
    const confirmed = await confirmDialog({
      title: 'Replace all data?',
      message: 'Importing this backup will overwrite every account, strategy and journal entry currently stored.',
      confirmLabel: 'Replace',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const result = await importBackup(input.files[0], { mode: 'replace' });
      toast(`Imported: ${result.counts.accounts} accounts, ${result.counts.journals} journals`, 'success');
      await loadAll();
    } catch (e) {
      toast('Import failed: ' + e.message, 'error');
    }
  };
  input.click();
}

async function handleMigrateToBrowser() {
  const confirmed = await confirmDialog({
    title: 'Copy server data to browser?',
    message: 'All accounts, strategies, journals and screenshots will be copied into IndexedDB so the app works offline.',
    confirmLabel: 'Copy to browser',
  });
  if (!confirmed) return;
  try {
    const result = await migrateServerToIdb((p) => {
      console.log(`[migrate] ${p.label}`);
    });
    toast(`Migrated: ${result.counts.accounts} accounts, ${result.counts.journals} journals, ${result.counts.screenshots} screenshots`, 'success');
  } catch (e) {
    toast('Migration failed: ' + e.message, 'error');
  }
}

async function handleMigrateFromServer() {
  // Check if server is reachable first
  try {
    const res = await fetch('/api/accounts', { method: 'HEAD' });
    if (!res.ok) throw new Error('Server not reachable');
  } catch {
    toast('Server not reachable. Start the local server first.', 'error');
    return;
  }
  const confirmed = await confirmDialog({
    title: 'Replace browser data?',
    message: 'Importing from the local server will overwrite the data currently stored in this browser.',
    confirmLabel: 'Import & replace',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const result = await migrateServerToIdb((p) => {
      console.log(`[migrate] ${p.label}`);
    });
    toast(`Imported: ${result.counts.accounts} accounts, ${result.counts.journals} journals, ${result.counts.screenshots} screenshots`, 'success');
    await loadAll();
  } catch (e) {
    toast('Migration failed: ' + e.message, 'error');
  }
}
