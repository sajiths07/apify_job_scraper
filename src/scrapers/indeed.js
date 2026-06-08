/**
 * Indeed India scraper — public search pages.
 * Uses Crawlee PlaywrightCrawler with pagination and retries.
 */

import { PlaywrightCrawler } from 'crawlee';
import { BASE_CRAWLER_OPTIONS, configurePage, openSourceRequestQueue, sleep, safeText, safeHref } from '../utils/browser.js';

const SOURCE = 'indeed';
const PAGE_SIZE = 10;
const RATE_LIMIT_MS = 1500;

/**
 * Build Indeed India search URL.
 * @param {string} keyword
 * @param {string} location
 * @param {number} start
 * @returns {string}
 */
function buildSearchUrl(keyword, location, start) {
    const params = new URLSearchParams({
        q: keyword,
        l: location,
        start: String(start),
    });
    return `https://in.indeed.com/jobs?${params.toString()}`;
}

/**
 * Parse job cards from the current Indeed search results page.
 * @param {import('playwright').Page} page
 */
async function extractJobsFromPage(page) {
    await page.waitForSelector(
        '.job_seen_beacon, div.jobsearch-ResultsList, #mosaic-provider-jobcards',
        { timeout: 30000 },
    ).catch(() => {});

    const cards = page.locator(
        '.job_seen_beacon, div.jobsearch-ResultsList > div[data-jk], div.cardOutline.tapItem, li.mosaic-provider-jobcards-with-new-summary',
    );
    const count = await cards.count();
    const jobs = [];

    for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        const title = await safeText(
            card.locator('h2.jobTitle a span, h2.jobTitle span, a[data-jk] span, [data-testid="job-title"]'),
        );
        const company = await safeText(
            card.locator('[data-testid="company-name"], span.companyName'),
        );
        const location = await safeText(
            card.locator('[data-testid="text-location"], div.companyLocation'),
        );
        const salary = await safeText(
            card.locator('.salary-snippet, .salaryOnly, div.metadata.salary-snippet-container, [data-testid="attribute_snippet_testid"]'),
        );

        let jobUrl = await safeHref(
            card.locator('h2.jobTitle a, a.jcs-JobTitle, a[data-jk], a[href*="/viewjob"]'),
        );

        if (jobUrl && jobUrl.startsWith('/')) {
            jobUrl = `https://in.indeed.com${jobUrl}`;
        }

        if (title) {
            jobs.push({
                title,
                company: company || '',
                location: location || '',
                salary: salary || '',
                jobUrl: jobUrl || '',
            });
        }
    }

    return jobs;
}

/**
 * Scrape Indeed India for the given search criteria.
 * @param {{ keyword: string, location: string, maxItems: number }} params
 * @param {import('apify/log').Log} logger
 */
export async function scrapeIndeed({ keyword, location, maxItems }, logger) {
    const scrapedAt = new Date().toISOString();
    const results = [];
    let stopPagination = false;

    const requestQueue = await openSourceRequestQueue(SOURCE);

    const crawler = new PlaywrightCrawler({
        ...BASE_CRAWLER_OPTIONS,
        requestQueue,
        maxRequestsPerMinute: 30,
        preNavigationHooks: [
            async ({ page }) => {
                await configurePage(page);
            },
        ],
        async requestHandler({ page, request, crawler: crawlerInstance, log }) {
            if (results.length >= maxItems || stopPagination) return;

            const { start = 0 } = request.userData;

            await sleep(1500);

            const pageJobs = await extractJobsFromPage(page);
            log.info(`Indeed page offset ${start}: found ${pageJobs.length} jobs`);

            for (const job of pageJobs) {
                if (results.length >= maxItems) break;
                results.push({
                    source: SOURCE,
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    jobUrl: job.jobUrl,
                    postedDate: '',
                    salary: job.salary,
                    scrapedAt,
                });
            }

            const hasMore = pageJobs.length >= PAGE_SIZE && results.length < maxItems;
            if (hasMore) {
                await sleep(RATE_LIMIT_MS);
                await crawlerInstance.addRequests([{
                    url: buildSearchUrl(keyword, location, start + PAGE_SIZE),
                    userData: { start: start + PAGE_SIZE },
                    uniqueKey: `indeed-${keyword}-${location}-${start + PAGE_SIZE}`,
                }]);
            } else {
                stopPagination = true;
            }
        },
        failedRequestHandler({ request }, error) {
            logger.warning('Indeed request failed after retries', {
                url: request.url,
                message: error.message,
            });
        },
    });

    await crawler.run([{
        url: buildSearchUrl(keyword, location, 0),
        userData: { start: 0 },
        uniqueKey: `indeed-${keyword}-${location}-0`,
    }]);

    return results;
}
