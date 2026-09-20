/** The order's garments as groups: each primary followed by the pieces paired
 *  with it. A piece whose primary is gone stands as its own group. */
export function groupGarmentJobs(jobs = []) {
  const keys = new Set(jobs.map((job) => job.key));
  const primaries = jobs.filter((job) => !job.pairedWith || !keys.has(job.pairedWith));
  return primaries.map((primary) => ({
    primary,
    jobs: [primary, ...jobs.filter((job) => job.pairedWith === primary.key)],
  }));
}
