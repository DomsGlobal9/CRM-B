// node src/services/workKind.check.mjs -- every workroom stage has its own kind and colour.
import assert from 'node:assert/strict';
import { TODO_KIND, workKind } from './workKind.js';

const cases = {
  pattern_cutting: 'cutting', paper_cutting: 'cutting', fabric_cutting: 'cutting',
  maggam_work: 'maggam', maggam_handwork: 'maggam', maggam_verification: 'maggam',
  stitching_in_progress: 'stitching', finishing: 'finishing', pressing: 'finishing',
  master_quality_check: 'qc', trial_scheduled: 'trial', trial_completed: 'trial',
  ready_for_delivery: 'delivery', payment: 'delivery', delivered: 'delivery',
  alteration_work: 'alteration', created: 'other', some_custom_stage: 'other',
};
for (const [stage, kind] of Object.entries(cases)) assert.equal(workKind(stage).key, kind, stage);
const colours = new Set([...Object.keys(cases).map((s) => workKind(s).color), TODO_KIND.color]);
assert.equal(colours.size, 10, 'each kind (and to-dos) has its own colour');
console.log(`ok: ${Object.keys(cases).length} stages`);
