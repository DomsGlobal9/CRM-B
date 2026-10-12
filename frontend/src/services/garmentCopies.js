/* "Same design" copies of a garment on the order wizard.

   A follower (`sameAs` set) is a copy of another garment that keeps being
   filled in from it while the staff fill that garment, so "three sarees, the
   same" is said once and filled once. Changing the follower itself makes it
   its own design. `syncedFrom` is the snapshot it was last copied from.
   Self-check: node src/services/garmentCopies.check.mjs */

/** What a same-design copy shares with the garment it follows. */
const SHARED = ['values', 'quantities', 'sources', 'brought', 'pricing', 'design',
                'fabrics', 'fabric_qty', 'purchases'];

export const garmentSnapshot = (job) => JSON.stringify(SHARED.map((k) => job[k] ?? null));

export const sharedGarmentParts = (job) => structuredClone(
  Object.fromEntries(SHARED.filter((k) => k in job).map((k) => [k, job[k]])));

/** A follower of `job` under `key`. */
export const followerOf = (job, key, pairedWith) => ({
  ...job, ...sharedGarmentParts(job), key, pairedWith,
  sameAs: job.key, syncedFrom: garmentSnapshot(job),
});

/** The jobs with every follower brought up to date, or `null` when nothing
 *  changed (so the caller does not set state for nothing). */
export function syncFollowers(jobs) {
  if (!jobs.some((job) => job.sameAs)) return null;
  const byKey = new Map(jobs.map((job) => [job.key, job]));
  let changed = false;
  const next = jobs.map((job) => {
    if (!job.sameAs) return job;
    const source = byKey.get(job.sameAs);
    const from = source && garmentSnapshot(source);
    const mine = garmentSnapshot(job);
    // Still identical (a change that reached both, like the saved
    // measurements filling in): still following.
    if (source && mine === from) {
      if (job.syncedFrom === from) return job;
      changed = true;
      return { ...job, syncedFrom: from };
    }
    // Its garment removed, or this one changed by hand: its own design now.
    if (!source || mine !== job.syncedFrom) {
      changed = true;
      return { ...job, sameAs: null, syncedFrom: null };
    }
    changed = true;
    return { ...job, ...sharedGarmentParts(source), syncedFrom: from };
  });
  return changed ? next : null;
}
