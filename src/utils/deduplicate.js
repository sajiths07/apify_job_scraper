/**
 * Deduplication utilities for job listings.
 * Unique key: normalized title + company + location
 */

/**
 * Normalize a string for deduplication key generation.
 * @param {string | null | undefined} value
 * @returns {string}
 */
function normalize(value) {
    if (!value || typeof value !== 'string') return '';
    return value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '');
}

/**
 * Build a unique deduplication key from job fields.
 * @param {{ title?: string, company?: string, location?: string }} job
 * @returns {string}
 */
export function buildDedupeKey(job) {
    return [normalize(job.title), normalize(job.company), normalize(job.location)].join('|');
}

/**
 * Remove duplicate jobs based on title + company + location.
 * Keeps the first occurrence (preserves source priority order from merge).
 * @param {Array<Record<string, unknown>>} jobs
 * @returns {Array<Record<string, unknown>>}
 */
export function deduplicateJobs(jobs) {
    const seen = new Set();
    const unique = [];

    for (const job of jobs) {
        const key = buildDedupeKey(job);
        if (!key || key === '||') {
            unique.push(job);
            continue;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(job);
    }

    return unique;
}
