/**
 * sop-checklist.js — 8-row SOP checklist field with live grade preview.
 *
 * Returns a DOM node containing 8 rows ([checkbox][label][note]), a live
 * grade pill, and a hidden <input name="sopChecks"> whose value is the
 * JSON-serialized state for readForm() to pick up.
 *
 * Validation contract: the returned node exposes isFullyTouched() so the
 * journal form can block submit until all 8 boxes have been touched.
 */

import { el } from './utils.js';
import { SOP_RULES, emptySopChecks } from './sop-rules.js';
import { computeJournalGrade } from './grading.js';

export function sopChecklistField({ name = 'sopChecks', value = null } = {}) {
  const state = value && typeof value === 'object' ? cloneState(value) : emptySopChecks();
  const editing = !!value;
  const touched = new Set(editing ? SOP_RULES.map(r => r.id) : []);

  const wrap = el('div', { class: 'sop-checklist' });
  const hidden = el('input', { type: 'hidden', name, value: JSON.stringify(state) });

  const rowsEl = el('div', { class: 'sop-checklist-rows' });
  const previewEl = el('div', { class: 'sop-grade-preview' });

  function syncHidden() { hidden.value = JSON.stringify(state); }

  function renderPreview() {
    const { grade, confluenceCount } = computeJournalGrade(state);
    previewEl.innerHTML = '';
    previewEl.appendChild(el('span', { class: 'sop-grade-label' }, 'GRADE'));
    previewEl.appendChild(el('span', { class: `grade-pill grade-pill--${gradeClass(grade)}` }, grade));
    previewEl.appendChild(el('span', { class: 'sop-grade-count' }, `${confluenceCount}/8 confirmed`));
  }

  function row(rule) {
    const cb = el('input', { type: 'checkbox', class: 'sop-row-cb' });
    cb.checked = state[rule.id]?.confirmed === true;
    const note = el('input', {
      type: 'text', class: 'text-input sop-row-note',
      value: state[rule.id]?.note ?? '',
      placeholder: 'Optional note',
    });
    cb.addEventListener('change', () => {
      state[rule.id] = { ...state[rule.id], confirmed: cb.checked };
      touched.add(rule.id);
      syncHidden();
      renderPreview();
    });
    note.addEventListener('input', () => {
      state[rule.id] = { ...state[rule.id], note: note.value };
      syncHidden();
    });
    return el('div', { class: 'sop-row' },
      el('label', { class: 'sop-row-cb-wrap' }, cb),
      el('span', { class: 'sop-row-label' }, rule.label),
      note,
    );
  }

  SOP_RULES.forEach(r => rowsEl.appendChild(row(r)));
  wrap.appendChild(rowsEl);
  wrap.appendChild(previewEl);
  wrap.appendChild(hidden);
  renderPreview();

  wrap.isFullyTouched = () => touched.size === SOP_RULES.length;
  wrap.getState = () => cloneState(state);
  return wrap;
}

function cloneState(s) {
  const out = {};
  for (const r of SOP_RULES) {
    out[r.id] = {
      confirmed: s[r.id]?.confirmed === true,
      note: s[r.id]?.note ?? '',
    };
  }
  return out;
}

export function gradeClass(grade) {
  if (grade === 'A') return 'a';
  if (grade === 'B') return 'b';
  if (grade === 'C') return 'c';
  if (grade === 'Off-SOP') return 'off-sop';
  return 'pre-grading';
}
