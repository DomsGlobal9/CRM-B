// node src/services/garmentCopies.check.mjs -- fails loudly if the follower rules break.
import assert from 'node:assert/strict';
import { followerOf, syncFollowers } from './garmentCopies.js';

const saree = { key: 'saree', template: { key: 'saree' }, values: { saree_type: 'silk' } };
const copy = followerOf(saree, 'saree#a', null);
let jobs = [saree, copy];
assert.equal(syncFollowers(jobs), null, 'nothing changed yet');

// Filling the saree fills its copy.
jobs = [{ ...saree, values: { saree_type: 'silk', hand_work: 'with_work' } }, copy];
jobs = syncFollowers(jobs);
assert.equal(jobs[1].values.hand_work, 'with_work');
assert.equal(jobs[1].sameAs, 'saree');

// A change that reaches both (saved measurements) keeps it following.
const both = jobs.map((j) => ({ ...j, values: { ...j.values, length: '42' } }));
jobs = syncFollowers(both) || both;
assert.equal(jobs[1].sameAs, 'saree');

// Editing the copy makes it its own design, and later saree edits leave it alone.
jobs = [jobs[0], { ...jobs[1], values: { ...jobs[1].values, saree_type: 'cotton' } }];
jobs = syncFollowers(jobs);
assert.equal(jobs[1].sameAs, null);
jobs = [{ ...jobs[0], values: { ...jobs[0].values, saree_type: 'banarasi' } }, jobs[1]];
assert.equal(syncFollowers(jobs), null);
assert.equal(jobs[1].values.saree_type, 'cotton');

// Its saree removed: the copy keeps what it has, as its own design.
const orphan = syncFollowers([followerOf(saree, 'saree#b', null)]);
assert.equal(orphan[0].sameAs, null);
assert.equal(orphan[0].values.saree_type, 'silk');

console.log('garmentCopies: all checks passed');
