/**
 * Naukri scraper — public search pages.
 * Uses Crawlee PlaywrightCrawler with pagination and retries.
 */

import { PlaywrightCrawler } from 'crawlee';
import { BASE_CRAWLER_OPTIONS, configurePage, openSourceRequestQueue, sleep, slugify, safeText, safeHref } from '../utils/browser.js';

const SOURCE = 'naukri';
const RATE_LIMIT_MS = 1500;
const MIN_JOBS_PER_PAGE = 5;

/**
 * Build Naukri slug-based search URL.
 * @param {string} keyword
 * @param {string} location
 * @param {number} page
 * @returns {string}
 */
function buildSearchUrl(keyword, location, page) {
    const keywordSlug = slugify(keyword);
    const locationSlug = slugify(location);

    if (page <= 1) {
        return `https://www.naukri.com/${keywordSlug}-jobs-in-${locationSlug}`;
    }
    return `https://www.naukri.com/${keywordSlug}-jobs-in-${locationSlug}-${page}`;
}

/**
 * Build fallback Naukri query-based search URL.
 * @param {string} keyword
 * @param {string} location
 * @param {number} page
 * @returns {string}
 */
function buildFallbackSearchUrl(keyword, location, page) {
    const params = new URLSearchParams({
        k: keyword,
        l: location,
        page: String(page),
    });
    return `https://www.naukri.com/job-listings?${params.toString()}`;
}

/**
 * Parse job tuples from the current Naukri search results page.
 * @param {import('playwright').Page} page
 */
async function extractJobsFromPage(page) {
    await page.waitForSelector(
        '.srp-jobtuple-wrapper, article.jobTuple, div.cust-job-tuple, #listContainer',
        { timeout: 30000 },
    ).catch(() => {});

    const cards = page.locator('.srp-jobtuple-wrapper, article.jobTuple, div.cust-job-tuple');
    const count = await cards.count();
    const jobs = [];

    for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        const title = await safeText(card.locator('a.title, h2 a, .jobTupleHeader a, a[title]'));
        const company = await safeText(card.locator('.comp-name, .subTitle, .companyInfo, a.subTitle'));
        const location = await safeText(card.locator('.locWdth, .loc, span.locWdth, .location'));
        const experience = await safeText(card.locator('.expwdth, .exp, span.expwdth'));
        const salary = await safeText(card.locator('.salary, .sal, span.salary'));

        let jobUrl = await safeHref(card.locator('a.title, h2 a, .jobTupleHeader a'));

        if (jobUrl && jobUrl.startsWith('/')) {
            jobUrl = `https://www.naukri.com${jobUrl}`;
        }

        if (title) {
            jobs.push({
                title,
                company: company || '',
                location: location || '',
                experience: experience || '',
                salary: salary || '',
                jobUrl: jobUrl || '',
            });
        }
    }

    return jobs;
}

/**
 * Scrape Naukri for the given search criteria.
 * @param {{ keyword: string, location: string, maxItems: number }} params
 * @param {import('apify/log').Log} logger
 */
export async function scrapeNaukri({ keyword, location, maxItems }, logger) {
    const scrapedAt = new Date().toISOString();
    const results = [];
    let stopPagination = false;

    const requestQueue = await openSourceRequestQueue(SOURCE);

    const crawler = new PlaywrightCrawler({
        ...BASE_CRAWLER_OPTIONS,
        requestQueue,
        maxRequestsPerMinute: 25,
        preNavigationHooks: [
            async ({ page }) => {
                await configurePage(page);
            },
        ],
        async requestHandler({ page, request, crawler: crawlerInstance, log }) {
            if (results.length >= maxItems || stopPagination) return;

            const { pageNum = 1, useFallback = false, triedFallback = false } = request.userData;

            await sleep(1500);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
            await sleep(1000);

            let pageJobs = await extractJobsFromPage(page);
            log.info(`Naukri page ${pageNum}: found ${pageJobs.length} jobs`);

            // Retry with fallback URL format on first empty slug page
            if (pageJobs.length === 0 && pageNum === 1 && !triedFallback && !useFallback) {
                log.info('Slug URL returned no results, enqueueing fallback search URL');
                await crawlerInstance.addRequests([{
                    url: buildFallbackSearchUrl(keyword, location, 1),
                    userData: { pageNum: 1, useFallback: true, triedFallback: true },
                    uniqueKey: `naukri-fallback-${keyword}-${location}-1`,
                }]);
                return;
            }

            for (const job of pageJobs) {
                if (results.length >= maxItems) break;
                results.push({
                    source: SOURCE,
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    jobUrl: job.jobUrl,
                    postedDate: '',
                    experience: job.experience,
                    salary: job.salary,
                    scrapedAt,
                });
            }

            const hasMore = pageJobs.length >= MIN_JOBS_PER_PAGE && results.length < maxItems;
            if (hasMore) {
                const nextPage = pageNum + 1;
                await sleep(RATE_LIMIT_MS);
                const nextUrl = useFallback
                    ? buildFallbackSearchUrl(keyword, location, nextPage)
                    : buildSearchUrl(keyword, location, nextPage);

                await crawlerInstance.addRequests([{
                    url: nextUrl,
                    userData: { pageNum: nextPage, useFallback, triedFallback: true },
                    uniqueKey: `naukri-${useFallback ? 'fb' : 'slug'}-${keyword}-${location}-${nextPage}`,
                }]);
            } else {
                stopPagination = true;
            }
        },
        failedRequestHandler({ request }, error) {
            logger.warning('Naukri request failed after retries', {
                url: request.url,
                message: error.message,
            });
        },
    });

    await crawler.run([{
        url: buildSearchUrl(keyword, location, 1),
        userData: { pageNum: 1, useFallback: false, triedFallback: false },
        uniqueKey: `naukri-slug-${keyword}-${location}-1`,
    }]);

    return results;
}
