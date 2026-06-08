/**
 * Multi-Source Job Scraper — Apify Actor entry point.
 *
 * Orchestrates parallel scraping from LinkedIn, Naukri, and Indeed India,
 * merges results, deduplicates, and pushes to the Apify Dataset.
 */

import { Actor } from 'apify';
import { log, createSourceLogger, logSourceStarted, logSourceFinished, logSourceFailed } from './utils/logger.js';
import { deduplicateJobs } from './utils/deduplicate.js';
import { purgeAllSourceQueues } from './utils/browser.js';
import { scrapeLinkedIn } from './scrapers/linkedin.js';
import { scrapeNaukri } from './scrapers/naukri.js';
import { scrapeIndeed } from './scrapers/indeed.js';

/** @type {Record<string, { name: string, scrape: Function }>} */
const SOURCE_REGISTRY = {
    linkedin: { name: 'LinkedIn', scrape: scrapeLinkedIn },
    naukri: { name: 'Naukri', scrape: scrapeNaukri },
    indeed: { name: 'Indeed India', scrape: scrapeIndeed },
};

const DEFAULT_SOURCES = ['linkedin', 'naukri', 'indeed'];
const DEFAULT_MAX_ITEMS = 50;

/**
 * Normalize and validate actor input with defaults.
 * @param {Record<string, unknown>} input
 * @returns {{ keyword: string, location: string, sources: string[], maxItemsPerSource: number }}
 */
function normalizeInput(input) {
    const keyword = String(input.keyword ?? '').trim();
    const location = String(input.location ?? '').trim();

    if (!keyword) {
        throw new Error('Input field "keyword" is required and cannot be empty.');
    }
    if (!location) {
        throw new Error('Input field "location" is required and cannot be empty.');
    }

    const rawSources = Array.isArray(input.sources) ? input.sources : DEFAULT_SOURCES;
    const sources = rawSources
        .map((s) => String(s).toLowerCase().trim())
        .filter((s) => s in SOURCE_REGISTRY);

    if (sources.length === 0) {
        throw new Error(
            `No valid sources provided. Supported sources: ${Object.keys(SOURCE_REGISTRY).join(', ')}`,
        );
    }

    const maxItemsPerSource = Number(input.maxItemsPerSource ?? DEFAULT_MAX_ITEMS);
    if (!Number.isFinite(maxItemsPerSource) || maxItemsPerSource < 1) {
        throw new Error('Input field "maxItemsPerSource" must be a positive integer.');
    }

    return {
        keyword,
        location,
        sources: [...new Set(sources)],
        maxItemsPerSource: Math.min(Math.floor(maxItemsPerSource), 500),
    };
}

/**
 * Run a single source scraper with isolated error handling.
 * Failures are logged but do not crash the actor.
 * @param {string} sourceKey
 * @param {{ keyword: string, location: string, maxItemsPerSource: number }} config
 * @returns {Promise<{ source: string, jobs: Array<Record<string, unknown>>, error: Error | null }>}
 */
async function runSourceScraper(sourceKey, config) {
    const { name, scrape } = SOURCE_REGISTRY[sourceKey];
    const sourceLog = createSourceLogger(sourceKey);

    logSourceStarted(sourceLog, {
        keyword: config.keyword,
        location: config.location,
        maxItems: config.maxItemsPerSource,
    });

    try {
        const jobs = await scrape(
            {
                keyword: config.keyword,
                location: config.location,
                maxItems: config.maxItemsPerSource,
            },
            sourceLog,
        );

        logSourceFinished(sourceLog, jobs.length);
        log.info(`${name}: ${jobs.length} records found`);

        return { source: sourceKey, jobs, error: null };
    } catch (error) {
        logSourceFailed(sourceLog, error);
        log.warning(`${name} scraper failed — continuing with other sources`, {
            message: error.message,
        });
        return { source: sourceKey, jobs: [], error };
    }
}

/**
 * Print final summary to actor logs.
 * @param {Record<string, number>} counts
 * @param {number} uniqueTotal
 */
function printSummary(counts, uniqueTotal) {
    log.info('========== SCRAPING SUMMARY ==========');
    log.info(`Total LinkedIn jobs: ${counts.linkedin ?? 0}`);
    log.info(`Total Indeed jobs:   ${counts.indeed ?? 0}`);
    log.info(`Total Naukri jobs:   ${counts.naukri ?? 0}`);
    log.info(`Total unique jobs:   ${uniqueTotal}`);
    log.info('======================================');
}

await Actor.main(async () => {
    log.info('Actor started');

    const rawInput = (await Actor.getInput()) ?? {};
    const input = normalizeInput(rawInput);

    log.info('Input normalized', {
        keyword: input.keyword,
        location: input.location,
        sources: input.sources,
        maxItemsPerSource: input.maxItemsPerSource,
    });

    // Clear stale Crawlee queues so re-runs always scrape fresh (fixes requestsTotal: 0)
    await purgeAllSourceQueues();
    log.info('Cleared stale source request queues');

    // Run all enabled scrapers in parallel
    const scraperResults = await Promise.all(
        input.sources.map((sourceKey) => runSourceScraper(sourceKey, input)),
    );

    // Aggregate per-source counts and merge all job arrays
    const counts = { linkedin: 0, naukri: 0, indeed: 0 };
    const allJobs = [];

    for (const result of scraperResults) {
        counts[result.source] = result.jobs.length;
        allJobs.push(...result.jobs);
    }

    log.info(`Total records before deduplication: ${allJobs.length}`);

    const uniqueJobs = deduplicateJobs(allJobs);
    const duplicatesRemoved = allJobs.length - uniqueJobs.length;

    if (duplicatesRemoved > 0) {
        log.info(`Removed ${duplicatesRemoved} duplicate job(s)`);
    }

    if (uniqueJobs.length > 0) {
        await Actor.pushData(uniqueJobs);
        log.info(`Records saved to dataset: ${uniqueJobs.length}`);
    } else {
        log.warning('No job records to save — all sources returned empty or failed');
    }

    printSummary(counts, uniqueJobs.length);

    log.info('Actor finished');
});
