/**
 * LinkedIn Jobs scraper — public search pages only.
 * Uses Crawlee PlaywrightCrawler with pagination, rate limiting, and retries.
 */

import { PlaywrightCrawler } from 'crawlee';
import { BASE_CRAWLER_OPTIONS, configurePage, openSourceRequestQueue, sleep, safeText, safeHref } from '../utils/browser.js';

const SOURCE = 'linkedin';
const PAGE_SIZE = 25;
const RATE_LIMIT_MS = 2000;

/**
 * Build LinkedIn Jobs search URL for a given page offset.
 * @param {string} keyword
 * @param {string} location
 * @param {number} start
 * @returns {string}
 */
function buildSearchUrl(keyword, location, start) {
    const params = new URLSearchParams({
        keywords: keyword,
        location,
        start: String(start),
    });
    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/**
 * Parse job cards from the current LinkedIn search results page.
 * @param {import('playwright').Page} page
 */
async function extractJobsFromPage(page) {
    await page.waitForSelector(
        'ul.jobs-search__results-list li, div.jobs-search-no-results-banner, div.scaffold-layout__list-container',
        { timeout: 30000 },
    ).catch(() => {});

    const cards = page.locator('ul.jobs-search__results-list > li, div.scaffold-layout__list-container li');
    const count = await cards.count();
    const jobs = [];

    for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        const title = await safeText(
            card.locator('.base-search-card__title, h3.base-search-card__title, [class*="job-card-list__title"]'),
        );
        const company = await safeText(
            card.locator('.base-search-card__subtitle, h4.base-search-card__subtitle, [class*="job-card-container__company-name"]'),
        );
        const location = await safeText(
            card.locator('.job-search-card__location, span.job-search-card__location, [class*="job-card-container__metadata-item"]'),
        );

        let jobUrl = await safeHref(
            card.locator('a.base-card__full-link, a[href*="/jobs/view/"], a.job-card-list__title'),
        );

        if (jobUrl && jobUrl.startsWith('/')) {
            jobUrl = `https://www.linkedin.com${jobUrl}`;
        }
        if (jobUrl.includes('?')) {
            jobUrl = jobUrl.split('?')[0];
        }

        if (title && jobUrl) {
            jobs.push({ title, company, location, jobUrl });
        }
    }

    return jobs;
}

/**
 * Scrape LinkedIn Jobs for the given search criteria.
 * @param {{ keyword: string, location: string, maxItems: number }} params
 * @param {import('apify/log').Log} logger
 */
export async function scrapeLinkedIn({ keyword, location, maxItems }, logger) {
    const scrapedAt = new Date().toISOString();
    const results = [];
    let stopPagination = false;

    const requestQueue = await openSourceRequestQueue(SOURCE);

    const crawler = new PlaywrightCrawler({
        ...BASE_CRAWLER_OPTIONS,
        requestQueue,
        maxRequestsPerMinute: 20,
        preNavigationHooks: [
            async ({ page }) => {
                await configurePage(page);
            },
        ],
        async requestHandler({ page, request, crawler: crawlerInstance, log }) {
            if (results.length >= maxItems || stopPagination) return;

            const { start = 0 } = request.userData;

            await sleep(1500);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)).catch(() => {});
            await sleep(1000);

            const pageJobs = await extractJobsFromPage(page);
            log.info(`LinkedIn page offset ${start}: found ${pageJobs.length} jobs`);

            for (const job of pageJobs) {
                if (results.length >= maxItems) break;
                results.push({
                    source: SOURCE,
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    jobUrl: job.jobUrl,
                    postedDate: '',
                    salary: '',
                    scrapedAt,
                });
            }

            const hasMore = pageJobs.length >= PAGE_SIZE && results.length < maxItems;
            if (hasMore) {
                await sleep(RATE_LIMIT_MS);
                await crawlerInstance.addRequests([{
                    url: buildSearchUrl(keyword, location, start + PAGE_SIZE),
                    userData: { start: start + PAGE_SIZE },
                    uniqueKey: `linkedin-${keyword}-${location}-${start + PAGE_SIZE}`,
                }]);
            } else {
                stopPagination = true;
            }
        },
        failedRequestHandler({ request }, error) {
            logger.warning('LinkedIn request failed after retries', {
                url: request.url,
                message: error.message,
            });
        },
    });

    await crawler.run([{
        url: buildSearchUrl(keyword, location, 0),
        userData: { start: 0 },
        uniqueKey: `linkedin-${keyword}-${location}-0`,
    }]);

    return results;
}
