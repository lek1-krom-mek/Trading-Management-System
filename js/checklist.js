/**
 * checklist.js — Reusable editor for a list of checks.
 *
 * Renders a list of editable rows (label, description, must-pass toggle, delete)
 * plus an "add" form row. Fires the supplied callbacks for persistence.
 *
 * Use cases:
 *  - Doctrine page editing globals: scope='global', strategyId=null
 *  - Strategy form editing per-strategy: scope='strategy', strategyId=<id>
 */

import { el, iconSVG } from './utils.js';
import { uid } from './db.js';

/**
 * @param {Object} opts
 * @param {Array<Check>} opts.checks       Current checks (already filtered to scope).
 * @param {'global'|'strategy'} opts.scope
 * @param {string|null} opts.strategyId
 * @param {(check: Check) => Promise<void>} opts.onSave
 * @param {(id: string) => Promise<void>} opts.onDelete
 * @returns {HTMLElement}
 */
export function checklistEditor({ checks, scope, strategyId, onSave, onDelete }) {
  const root = el('div', { class: 'checklist-editor' });

  function render() {
    root.innerHTML = '';
    const sorted = [...checks].sort((a, b) => (a.position||0) - (b.position||0));

    if (!sorted.length) {
      root.appendChild(el('div', { class: 'checklist-empty' },
        scope === 'global'
          ? 'No global checks yet. Add your first discipline rule below.'
          : 'No checks for this strategy yet. Add setup conditions below.'));
    }

    sorted.forEach(c => root.appendChild(renderRow(c)));
    root.appendChild(renderAddRow());
  }

  function renderRow(c) {
    const labelInput = el('input', {
      type: 'text', class: 'text-input', value: c.label, placeholder: 'Check label',
    });
    const descInput = el('input', {
      type: 'text', class: 'text-input', value: c.description || '', placeholder: 'Optional description / hint',
    });
    const mpToggle = el('label', { class: 'must-pass-toggle' },
      el('input', { type: 'checkbox', checked: !!c.mustPass }),
      el('span', {}, 'must-pass'),
    );

    async function commit() {
      const label = labelInput.value.trim();
      if (!label) return;
      await onSave({
        ...c,
        label,
        description: descInput.value.trim(),
        mustPass: mpToggle.querySelector('input').checked,
      });
    }

    labelInput.addEventListener('blur', commit);
    descInput.addEventListener('blur', commit);
    mpToggle.querySelector('input').addEventListener('change', commit);

    return el('div', { class: 'checklist-row' },
      mpToggle,
      labelInput,
      descInput,
      el('button', {
        type: 'button', class: 'icon-btn icon-btn-danger',
        'aria-label': 'Remove check',
        onClick: async () => { await onDelete(c.id); },
      }, el('span', { html: iconSVG('close') })),
    );
  }

  function renderAddRow() {
    const labelInput = el('input', { type: 'text', class: 'text-input', placeholder: 'New check…' });
    const mustPass = el('input', { type: 'checkbox' });

    async function add() {
      const label = labelInput.value.trim();
      if (!label) return;
      await onSave({
        id: uid(),
        scope,
        strategyId: scope === 'strategy' ? strategyId : null,
        label,
        description: '',
        mustPass: mustPass.checked,
        position: (checks.length ? Math.max(...checks.map(c => c.position||0)) + 1 : 0),
      });
      labelInput.value = '';
      mustPass.checked = false;
    }

    labelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    return el('div', { class: 'checklist-row checklist-add-row' },
      el('label', { class: 'must-pass-toggle' }, mustPass, el('span', {}, 'must-pass')),
      labelInput,
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: add },
        el('span', { html: iconSVG('plus') }), ' Add'),
    );
  }

  render();
  return root;
}
