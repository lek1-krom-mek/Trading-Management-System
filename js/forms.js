/**
 * forms.js — Slide-in form panel primitives shared by account/strategy/backtest forms.
 */

import { el } from './utils.js';

let activePanel = null;

function closePanel() {
  if (!activePanel) return;
  activePanel.overlay.classList.remove('open');
  activePanel.panel.classList.remove('open');
  setTimeout(() => {
    activePanel?.overlay.remove();
    activePanel = null;
  }, 280);
}

export function openFormPanel({ title, body, onSubmit, submitLabel = 'Save', onDelete = null, width = 460 }) {
  closePanel();
  const overlay = el('div', { class: 'form-overlay' });
  const panel = el('aside', { class: 'form-panel', style: { maxWidth: width + 'px' } },
    el('header', { class: 'form-panel-header' },
      el('h2', {}, title),
      el('button', { class: 'icon-btn', onClick: closePanel, 'aria-label': 'Close' },
        el('span', { html: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>' })
      )
    ),
    el('form', { class: 'form-body', onSubmit: (e) => {
      e.preventDefault();
      try { const r = onSubmit(e.target); if (r && r.then) r.then(closePanel).catch(err => console.error(err)); else closePanel(); }
      catch(err) { console.error(err); }
    } },
      body,
      el('footer', { class: 'form-panel-footer' },
        onDelete ? el('button', { type: 'button', class: 'btn btn-ghost-danger', onClick: async () => { await onDelete(); closePanel(); } }, 'Delete') : null,
        el('div', { class: 'form-panel-spacer' }),
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closePanel }, 'Cancel'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel)
      )
    )
  );
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
  document.body.appendChild(overlay);
  activePanel = { overlay, panel };
  // animate in
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    panel.classList.add('open');
    const firstInput = panel.querySelector('input, textarea, select');
    firstInput?.focus();
  });
  const onKey = e => { if (e.key === 'Escape') { closePanel(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

// ── Common form field builders ────────────────────────
export function field(label, control, help) {
  return el('label', { class: 'form-field' },
    el('span', { class: 'form-label' }, label),
    control,
    help ? el('span', { class: 'form-help' }, help) : null
  );
}

export function textInput({ name, value = '', placeholder = '', required = false, type = 'text' }) {
  return el('input', { type, name, value, placeholder, required: required ? 'required' : null, class: 'text-input' });
}

export function numberInput({ name, value = '', placeholder = '', min, max, step = 'any', required = false }) {
  return el('input', { type: 'number', name, value, placeholder, min, max, step, required: required ? 'required' : null, class: 'text-input number-input' });
}

export function textArea({ name, value = '', placeholder = '', rows = 4 }) {
  return el('textarea', { name, placeholder, rows, class: 'text-input textarea' }, value);
}

export function select({ name, value, options, required = false }) {
  const s = el('select', { name, required: required ? 'required' : null, class: 'text-input select-input' });
  for (const o of options) {
    const opt = el('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    s.appendChild(opt);
  }
  return s;
}

export function multiChips({ options, values = [], name }) {
  const wrap = el('div', { class: 'chip-select', dataset: { name } });
  const selected = new Set(values);
  const hidden = el('input', { type: 'hidden', name, value: Array.from(selected).join(',') });
  options.forEach(opt => {
    const label = typeof opt === 'string' ? opt : opt.label;
    const val   = typeof opt === 'string' ? opt : opt.value;
    const chip = el('button', { type: 'button', class: 'chip' + (selected.has(val) ? ' active' : ''), onClick: () => {
      if (selected.has(val)) { selected.delete(val); chip.classList.remove('active'); }
      else                   { selected.add(val);    chip.classList.add('active'); }
      hidden.value = Array.from(selected).join(',');
    } }, label);
    wrap.appendChild(chip);
  });
  wrap.appendChild(hidden);
  return wrap;
}

export function colorPicker({ name, value, colors }) {
  const wrap = el('div', { class: 'color-picker' });
  const hidden = el('input', { type: 'hidden', name, value });
  colors.forEach(c => {
    const s = el('button', { type: 'button', class: 'color-swatch' + (c === value ? ' active' : ''), style: { background: c }, 'aria-label': c });
    s.addEventListener('click', () => {
      hidden.value = c;
      wrap.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    });
    wrap.appendChild(s);
  });
  wrap.appendChild(hidden);
  return wrap;
}

export function imageUpload({ name, value = '', onChange }) {
  const wrap = el('div', { class: 'image-upload' });
  const hidden = el('input', { type: 'hidden', name, value });
  const preview = el('div', { class: 'image-upload-preview' + (value ? ' has-image' : '') });
  if (value) preview.style.backgroundImage = `url(${value})`;
  const placeholder = el('div', { class: 'image-upload-placeholder' },
    el('span', { html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' })
  );
  preview.appendChild(placeholder);
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'image-upload-input' });
  // Make preview focusable so it can own paste events + keyboard activation
  preview.setAttribute('tabindex', '0');

  async function handle(file) {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    preview.style.backgroundImage = `url(${localUrl})`;
    preview.classList.add('has-image', 'uploading');
    try {
      const { uploadScreenshot } = await import('./db.js');
      const serverPath = await uploadScreenshot(file);
      hidden.value = serverPath;
      preview.style.backgroundImage = `url(${serverPath})`;
      onChange?.(serverPath);
    } catch (err) {
      console.error('Upload failed', err);
      preview.classList.add('upload-error');
    } finally {
      URL.revokeObjectURL(localUrl);
      preview.classList.remove('uploading');
    }
  }
  fileInput.addEventListener('change', (e) => handle(e.target.files[0]));
  preview.addEventListener('click', () => fileInput.click());
  preview.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  preview.addEventListener('dragover', (e) => { e.preventDefault(); preview.classList.add('dragover'); });
  preview.addEventListener('dragleave', () => preview.classList.remove('dragover'));
  preview.addEventListener('drop', (e) => { e.preventDefault(); preview.classList.remove('dragover'); handle(e.dataTransfer.files[0]); });

  // --- Paste-from-clipboard support ---
  // Arm the global paste listener only while the cursor is over (or focus is in) the dropzone,
  // so pasting into other inputs on the form still works normally.
  function extractImage(e) {
    const items = e.clipboardData?.items;
    if (!items) return null;
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile();
    }
    return null;
  }
  function onPaste(e) {
    const file = extractImage(e);
    if (!file) return;
    e.preventDefault();
    handle(file);
    preview.classList.add('pasted');
    setTimeout(() => preview.classList.remove('pasted'), 450);
  }
  let armed = false;
  function arm()   { if (!armed) { document.addEventListener('paste', onPaste); armed = true;  preview.classList.add('armed'); } }
  function disarm(){ if (armed)  { document.removeEventListener('paste', onPaste); armed = false; preview.classList.remove('armed'); } }
  preview.addEventListener('mouseenter', arm);
  preview.addEventListener('mouseleave', () => { if (document.activeElement !== preview) disarm(); });
  preview.addEventListener('focus', arm);
  preview.addEventListener('blur',  () => { if (!preview.matches(':hover')) disarm(); });

  wrap.appendChild(preview);
  wrap.appendChild(fileInput);
  wrap.appendChild(hidden);
  return wrap;
}

export function toggleGroup({ name, value, options }) {
  const wrap = el('div', { class: 'toggle-group' });
  const hidden = el('input', { type: 'hidden', name, value });
  options.forEach(opt => {
    const btn = el('button', { type: 'button', class: 'toggle-btn' + (opt.value === value ? ' active' : '') }, opt.label);
    btn.addEventListener('click', () => {
      hidden.value = opt.value;
      wrap.querySelectorAll('.toggle-btn').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
    });
    wrap.appendChild(btn);
  });
  wrap.appendChild(hidden);
  return wrap;
}

/** Reads a form's values into a plain object, splitting comma strings from chip inputs */
export function readForm(form, chipFields = []) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) {
    if (chipFields.includes(k)) obj[k] = v ? v.split(',').filter(Boolean) : [];
    else obj[k] = v;
  }
  return obj;
}
