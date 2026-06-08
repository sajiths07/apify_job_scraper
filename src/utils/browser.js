/**
 * Shared Playwright / Crawlee browser configuration for all scrapers.
 */

import { RequestQueue } from 'crawlee';
import { chromium } from 'playwright';

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_VIEWPORT = { width: 1366, height: 900 };

/** Standard Chromium launch options for Apify and local environments. */
export const LAUNCH_OPTIONS = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
    ],
};

/** Crawlee launchContext shared by all PlaywrightCrawler instances. */
export const LAUNCH_CONTEXT = {
    launcher: chromium,
    launchOptions: LAUNCH_OPTIONS,
};

/** Realistic browser context options applied via preNavigationHooks. */
export const CONTEXT_OPTIONS = {
    userAgent: DEFAULT_USER_AGENT,
    viewport: DEFAULT_VIEWPORT,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    extraHTTPHeaders: {
        'Accept-Language': 'en-IN,en;q=0.9',
    },
};

/**
 * Base PlaywrightCrawler options shared across all source scrapers.
 */
export const BASE_CRAWLER_OPTIONS = {
    maxConcurrency: 1,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    launchContext: LAUNCH_CONTEXT,
};

const SOURCE_QUEUE_PREFIX = 'job-scraper';

/**
 * Drop all persisted source request queues from previous local runs.
 * Crawlee marks requests as handled; without this, re-runs with the same
 * keyword/location skip all URLs and return 0 jobs (requestsTotal: 0).
 */
export async function purgeAllSourceQueues() {
    const sourceIds = ['linkedin', 'naukri', 'indeed'];
    await Promise.all(
        sourceIds.map(async (sourceId) => {
            try {
                const queue = await RequestQueue.open(`${SOURCE_QUEUE_PREFIX}-${sourceId}`);
                await queue.drop();
            } catch {
                // Queue may not exist on first run — safe to ignore
            }
        }),
    );
}

/**
 * Open a fresh dedicated Crawlee request queue per source.
 * Prevents lock contention when multiple scrapers run in parallel.
 * @param {string} sourceId - Source key (linkedin, naukri, indeed)
 * @returns {Promise<import('@crawlee/core').RequestQueue>}
 */
export async function openSourceRequestQueue(sourceId) {
    const queueId = `${SOURCE_QUEUE_PREFIX}-${sourceId}`;

    // Ensure no handled requests remain from a previous run with the same input
    try {
        const staleQueue = await RequestQueue.open(queueId);
        await staleQueue.drop();
    } catch {
        // Queue may not exist yet
    }

    return RequestQueue.open(queueId);
}

/**
 * Apply anti-detection init script and context options to a page.
 * @param {import('playwright').Page} page
 */
export async function configurePage(page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setExtraHTTPHeaders(CONTEXT_OPTIONS.extraHTTPHeaders);
    await page.setViewportSize(CONTEXT_OPTIONS.viewport);
}

/**
 * Pause execution for rate limiting between requests.
 * @param {number} ms
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert text to URL slug (lowercase, hyphenated).
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

/**
 * Safely extract inner text from a locator, returning empty string on failure.
 * @param {import('playwright').Locator} locator
 * @returns {Promise<string>}
 */
export async function safeText(locator) {
    try {
        const count = await locator.count();
        if (count === 0) return '';
        const text = await locator.first().innerText({ timeout: 5000 });
        return text?.trim() ?? '';
    } catch {
        return '';
    }
}

/**
 * Safely extract href attribute from a locator.
 * @param {import('playwright').Locator} locator
 * @returns {Promise<string>}
 */
export async function safeHref(locator) {
    try {
        const count = await locator.count();
        if (count === 0) return '';
        const href = await locator.first().getAttribute('href', { timeout: 5000 });
        return href?.trim() ?? '';
    } catch {
        return '';
    }
}
