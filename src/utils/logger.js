/**
 * Logging helpers built on top of Apify's log utility.
 * Provides consistent, source-aware log messages across scrapers.
 */

import { log } from 'apify';

/**
 * @param {string} source - Scraper source identifier (linkedin, naukri, indeed)
 * @returns {import('apify/log').Log} Child logger with source context
 */
export function createSourceLogger(source) {
    return log.child({ prefix: source });
}

/**
 * Log that a scraper source has started.
 * @param {import('apify/log').Log} sourceLog
 * @param {Record<string, unknown>} context
 */
export function logSourceStarted(sourceLog, context = {}) {
    sourceLog.info('Source started', context);
}

/**
 * Log that a scraper source has finished successfully.
 * @param {import('apify/log').Log} sourceLog
 * @param {number} count - Number of records found
 */
export function logSourceFinished(sourceLog, count) {
    sourceLog.info('Source finished', { recordsFound: count });
}

/**
 * Log a source failure without rethrowing.
 * @param {import('apify/log').Log} sourceLog
 * @param {Error} error
 */
export function logSourceFailed(sourceLog, error) {
    sourceLog.error('Source failed', {
        message: error.message,
        stack: error.stack,
        name: error.name,
    });
}

export { log };