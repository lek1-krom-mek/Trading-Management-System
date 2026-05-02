/**
 * doctrine.js — Editor for the global discipline checklist.
 */

import { el, iconSVG } from './utils.js';
import { data, globalChecks, saveCheck, deleteCheck } from './store.js';
import { checklistEditor } from './checklist.js';
import { go } from './router.js';

export function renderDoctrineChecklistPage() {
  const root = document.querySelector('[data-page="doctrine-checklist"]');
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => go('dashboard') },
        el('span', { html: iconSVG('chevron-left') || '←' }), ' Back to dashboard'),
      el('div', { class: 'page-eyebrow', style: { marginTop: '8px' } }, 'Doctrine'),
      el('h1', { class: 'page-title' }, 'Global discipline checklist'),
      el('p', { class: 'page-sub' },
        'These checks apply to every Trade Plan. Must-pass checks are deal-breakers — if any unticked, the plan is auto-graded SKIP.'),
    ),
  ));

  const editor = checklistEditor({
    checks: globalChecks(),
    scope: 'global',
    strategyId: null,
    onSave: async (c) => {
      await saveCheck(c);
      // Re-render with fresh data
      renderDoctrineChecklistPage();
    },
    onDelete: async (id) => {
      if (!confirm('Remove this check? Existing plans that reference it will keep their original grade.')) return;
      await deleteCheck(id);
      renderDoctrineChecklistPage();
    },
  });

  root.appendChild(el('div', { class: 'card', style: { padding: '20px', marginTop: '16px' } }, editor));
}
