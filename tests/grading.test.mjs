import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeJournalGrade } from '../js/grading.js';

function checks(...confirmed) {
  const obj = {};
  for (let i = 1; i <= 8; i++) obj[`rule_${i}`] = { confirmed: confirmed.includes(i), note: '' };
  return obj;
}

test('0 confirmed → Off-SOP / count 0', () => {
  const r = computeJournalGrade(checks());
  assert.deepEqual(r, { grade: 'Off-SOP', confluenceCount: 0 });
});

test('2 confirmed → Off-SOP / count 2 (boundary below C)', () => {
  const r = computeJournalGrade(checks(1, 2));
  assert.deepEqual(r, { grade: 'Off-SOP', confluenceCount: 2 });
});

test('3 confirmed → C (lower boundary)', () => {
  const r = computeJournalGrade(checks(1, 2, 3));
  assert.deepEqual(r, { grade: 'C', confluenceCount: 3 });
});

test('4 confirmed → C (mid)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4));
  assert.deepEqual(r, { grade: 'C', confluenceCount: 4 });
});

test('5 confirmed → B (lower boundary)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5));
  assert.deepEqual(r, { grade: 'B', confluenceCount: 5 });
});

test('6 confirmed → B (mid)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5, 6));
  assert.deepEqual(r, { grade: 'B', confluenceCount: 6 });
});

test('7 confirmed → A (lower boundary)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5, 6, 7));
  assert.deepEqual(r, { grade: 'A', confluenceCount: 7 });
});

test('8 confirmed → A (max)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5, 6, 7, 8));
  assert.deepEqual(r, { grade: 'A', confluenceCount: 8 });
});

test('null/undefined input → Off-SOP / 0', () => {
  assert.deepEqual(computeJournalGrade(null),      { grade: 'Off-SOP', confluenceCount: 0 });
  assert.deepEqual(computeJournalGrade(undefined), { grade: 'Off-SOP', confluenceCount: 0 });
  assert.deepEqual(computeJournalGrade({}),        { grade: 'Off-SOP', confluenceCount: 0 });
});
