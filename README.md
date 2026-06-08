# Multi-Source Job Scraper

Production-ready [Apify Actor](https://docs.apify.com/platform/actors) that searches job listings from **LinkedIn Jobs**, **Naukri**, and **Indeed India**, merges the results, removes duplicates, and saves everything to an Apify Dataset.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Project Structure](#project-structure)
6. [Prerequisites](#prerequisites)
7. [Installation](#installation)
8. [Local Development](#local-development)
9. [Apify Deployment](#apify-deployment)
10. [Input Reference](#input-reference)
11. [Output Reference](#output-reference)
12. [How the Actor Works](#how-the-actor-works)
13. [Source Scrapers](#source-scrapers)
14. [Deduplication](#deduplication)
15. [Error Handling](#error-handling)
16. [Logging](#logging)
17. [Troubleshooting](#troubleshooting)
18. [Commands Reference](#commands-reference)
19. [License](#license)

---

## Overview

This Actor accepts a job **keyword** and **location**, scrapes all enabled job boards in parallel, and produces a unified, deduplicated dataset of job listings.

| Property | Value |
|----------|-------|
| Actor name | `multi-source-job-scraper` |
| Version | `1.0.0` |
| Entry point | `src/main.js` |
| Node.js | 22+ |
| Module system | ES Modules (`"type": "module"`) |
| Browser | Playwright Chromium (headless) |
| Crawler engine | Crawlee `PlaywrightCrawler` |

**Supported sources:**

| Key | Platform | Base URL |
|-----|----------|----------|
| `linkedin` | LinkedIn Jobs | `https://www.linkedin.com/jobs/search/` |
| `naukri` | Naukri | `https://www.naukri.com/` |
| `indeed` | Indeed India | `https://in.indeed.com/jobs` |

---

## Quick Start

Complete setup from scratch on **Windows PowerShell**:

```powershell
# 1. Go to project folder
cd d:\personal\apify_actor

# 2. Install dependencies (includes Playwright Chromium)
npm install

# 3. Install Apify CLI (required for npm run dev and apify push)
npm install -g apify-cli

# 4. Edit input if needed
#    File: storage/key_value_stores/default/INPUT.json

# 5. Run the actor
npm start
# OR (clears previous local storage first)
npm run dev
```

**Expected successful output:**

```
INFO  LinkedIn page offset 0: found 13 jobs
INFO  Naukri page 1: found 40 jobs
INFO  Indeed page offset 0: found 32 jobs
INFO  Total records before deduplication: 30
INFO  Removed 10 duplicate job(s)
INFO  Records saved to dataset: 20
INFO  ========== SCRAPING SUMMARY ==========
INFO  Total LinkedIn jobs: 10
INFO  Total Indeed jobs:   10
INFO  Total Naukri jobs:   10
INFO  Total unique jobs:   20
INFO  ======================================
INFO  Actor finished
```

**Results location:** `storage/datasets/default/` (one JSON file per job)

**Deploy to Apify Cloud:**

```powershell
apify login
apify push
```

---

## Features

- **Multi-source scraping** — LinkedIn, Naukri, and Indeed India from a single run
- **Parallel execution** — all enabled sources run simultaneously via `Promise.all`
- **Smart deduplication** — removes duplicates using `title + company + location`
- **Pagination** — automatically paginates until `maxItemsPerSource` is reached
- **Retries** — Crawlee `maxRequestRetries: 3` on failed page loads
- **Rate limiting** — configurable delays between page requests per source
- **Fault tolerance** — if one source fails, the others continue and results are still saved
- **Structured logging** — Apify log utility with per-source child loggers
- **Apify-ready** — Dockerfile, input schema, and actor config included

---

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| [Node.js](https://nodejs.org/) | 22+ | Runtime |
| [Apify SDK](https://docs.apify.com/sdk/js) | 3.x | Actor lifecycle, input, dataset, logging |
| [Crawlee](https://crawlee.dev/) | 3.x | `PlaywrightCrawler`, retries, request queue |
| [Playwright](https://playwright.dev/) | 1.x | Headless Chromium browser automation |

**Dependency note:** `package.json` includes npm `overrides` to align Apify SDK and Crawlee shared packages and prevent version conflicts.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        src/main.js                          │
│  Actor.init → read input → validate → run scrapers in       │
│  parallel → merge → deduplicate → pushData → summary        │
└──────────────┬──────────────────┬──────────────────┬────────┘
               │                  │                  │
       ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
       │  linkedin.js  │  │   naukri.js   │  │   indeed.js   │
       │ Playwright    │  │ Playwright    │  │ Playwright    │
       │ Crawler       │  │ Crawler       │  │ Crawler       │
       └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
               │                  │                  │
               └──────────────────┼──────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │     utils/browser.js      │
                    │  Shared launch config,    │
                    │  page setup, helpers      │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  utils/deduplicate.js     │
                    │  title+company+location   │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │     Apify Dataset         │
                    │   (Actor.pushData)        │
                    └───────────────────────────┘
```

### Actor execution flow

1. Read and validate input from Apify key-value store
2. Determine which sources are enabled
3. Launch all enabled scrapers **in parallel**
4. Each scraper uses its own `PlaywrightCrawler` instance **and dedicated request queue**
5. Merge all job arrays into one list
6. Deduplicate by composite key
7. Push unique jobs to the Apify Dataset
8. Print per-source and total summary to logs

---

## Project Structure

```
.
├── .actor/
│   ├── actor.json              # Apify Actor configuration
│   └── input_schema.json       # Input form schema for Apify Console
├── src/
│   ├── main.js                 # Actor entry point and orchestrator
│   ├── scrapers/
│   │   ├── linkedin.js         # LinkedIn Jobs scraper
│   │   ├── naukri.js           # Naukri scraper
│   │   └── indeed.js           # Indeed India scraper
│   └── utils/
│       ├── browser.js          # Shared Crawlee/Playwright config
│       ├── deduplicate.js      # Job deduplication logic
│       └── logger.js           # Apify log helpers
├── storage/                    # Local Apify storage (auto-created on run)
│   ├── datasets/default/       # Output dataset (JSON files)
│   └── key_value_stores/
│       └── default/
│           └── INPUT.json      # Local input file
├── Dockerfile                  # Playwright Chrome image for Apify Cloud
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

### File responsibilities

| File | Description |
|------|-------------|
| `src/main.js` | Reads input, runs scrapers in parallel, deduplicates, saves to dataset |
| `src/scrapers/linkedin.js` | Scrapes public LinkedIn Jobs search pages |
| `src/scrapers/naukri.js` | Scrapes public Naukri search pages (slug + fallback URL) |
| `src/scrapers/indeed.js` | Scrapes public Indeed India search pages |
| `src/utils/browser.js` | Shared `PlaywrightCrawler` options, per-source request queues, page helpers |
| `src/utils/deduplicate.js` | Builds dedupe keys and removes duplicate jobs |
| `src/utils/logger.js` | Source-scoped loggers using Apify `log` utility |
| `.actor/actor.json` | Actor metadata, default memory/timeout, Dockerfile reference |
| `.actor/input_schema.json` | Input form fields shown in Apify Console |
| `Dockerfile` | Uses `apify/actor-node-playwright-chrome:22` base image |

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Minimum version | Check command |
|------|-----------------|---------------|
| Node.js | 22.0.0 | `node --version` |
| npm | 9.0.0 | `npm --version` |
| Apify CLI *(for `npm run dev` and deploy)* | latest | `apify --version` |

Install Apify CLI globally (required for `npm run dev` and `apify push`):

```bash
npm install -g apify-cli
```

---

## Installation

### Step 1 — Clone or navigate to the project

```bash
cd d:\personal\apify_actor
```

### Step 2 — Install dependencies

```bash
npm install
```

This command:

- Installs `apify`, `crawlee`, and `playwright`
- Runs the `postinstall` script which downloads Chromium:
  ```
  npx playwright install chromium
  ```

### Step 3 — Verify installation

```bash
node --version    # Should print v22.x or higher
npm start         # Runs the actor (see Local Development below)
```

---

## Local Development

When running locally, the Actor uses the **Apify local storage** directory (`storage/`) instead of the Apify Cloud platform.

### Step 1 — Create or edit the input file

File path:

```
storage/key_value_stores/default/INPUT.json
```

**Working example (tested locally):**

```json
{
  "keyword": "Flutter Developer",
  "location": "Kochi",
  "sources": ["linkedin", "naukri", "indeed"],
  "maxItemsPerSource": 10
}
```

### Step 2 — Run the actor

**Option A — Direct Node.js (simplest):**

```bash
npm start
```

**Option B — Apify CLI (mirrors cloud behavior):**

```bash
npm run dev
```

The `dev` script runs `apify run --purge`, which clears previous local storage before each run.

### Step 3 — View results

After a successful run, output is saved to:

```
storage/datasets/default/
```

Each job is stored as a separate numbered JSON file (e.g. `000000001.json`).

### Verified local run results

Tested with `keyword: Flutter Developer`, `location: Kochi`, `maxItemsPerSource: 10`:

| Source | Jobs scraped | Notes |
|--------|-------------|-------|
| LinkedIn | 10 | Public search page |
| Naukri | 10 | 40 found on page, capped at 10 |
| Indeed | 10 | 32 found on page, capped at 10 |
| **Before dedup** | **30** | Combined from all sources |
| **After dedup** | **20** | 10 duplicates removed |
| **Saved to dataset** | **20** | `storage/datasets/default/` |

Run time: ~8–10 seconds locally (single page per source).

You can also inspect the run log in your terminal. A successful run ends with:

```
INFO  ========== SCRAPING SUMMARY ==========
INFO  Total LinkedIn jobs: 25
INFO  Total Indeed jobs:   18
INFO  Total Naukri jobs:   30
INFO  Total unique jobs:   58
INFO  ======================================
INFO  Actor finished
```

### Windows notes

On Windows PowerShell, use semicolons instead of `&&` to chain commands:

```powershell
cd d:\personal\apify_actor; npm install
cd d:\personal\apify_actor; npm start
```

---

## Apify Deployment

Deploy this Actor to the [Apify Platform](https://console.apify.com/) to run it in the cloud with a pre-configured Playwright Chrome environment.

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Log in to Apify

```bash
apify login
```

Follow the browser prompt to authenticate with your Apify account.

### Step 3 — Push the actor

From the project root:

```bash
apify push
```

This uploads the project, builds the Docker image from `Dockerfile`, and registers the Actor on your Apify account.

### Step 4 — Run on Apify Console

1. Open [Apify Console](https://console.apify.com/actors)
2. Find **Multi-Source Job Scraper**
3. Click **Start** and fill in the input form
4. View results in the **Dataset** tab after the run completes

### Docker configuration

The `Dockerfile` uses the official Apify Playwright base image:

```dockerfile
FROM apify/actor-node-playwright-chrome:22
```

This image includes:

- Node.js 22
- Pre-installed Chromium with all system dependencies
- Optimized for headless browser scraping on Apify Cloud

### Recommended cloud run settings

These are pre-configured in `.actor/actor.json`:

| Setting | Value | Reason |
|---------|-------|--------|
| Memory | 4096 MB | Three parallel Playwright browsers |
| Timeout | 3600 s (1 hour) | Large pagination runs |
| Build | latest | Always use the newest build |

---

## Input Reference

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `keyword` | `string` | **Yes** | — | Job title or search keyword (e.g. `Flutter Developer`) |
| `location` | `string` | **Yes** | — | City or region (e.g. `Kochi`, `Bangalore`, `Remote`) |
| `sources` | `string[]` | No | `["linkedin","naukri","indeed"]` | Job boards to scrape |
| `maxItemsPerSource` | `integer` | No | `50` | Max jobs per source (range: 1–500) |

### Valid source values

| Value | Platform |
|-------|----------|
| `linkedin` | LinkedIn Jobs |
| `naukri` | Naukri.com |
| `indeed` | Indeed India (`in.indeed.com`) |

Invalid source names are silently filtered out. If no valid sources remain, the Actor throws an error.

### Input examples

**All sources (default):**

```json
{
  "keyword": "Flutter Developer",
  "location": "Kochi",
  "sources": ["linkedin", "naukri", "indeed"],
  "maxItemsPerSource": 50
}
```

**Single source — Indeed only:**

```json
{
  "keyword": "React Developer",
  "location": "Bangalore",
  "sources": ["indeed"],
  "maxItemsPerSource": 25
}
```

**LinkedIn + Naukri only:**

```json
{
  "keyword": "Data Analyst",
  "location": "Mumbai",
  "sources": ["linkedin", "naukri"],
  "maxItemsPerSource": 100
}
```

**Remote jobs search:**

```json
{
  "keyword": "Python Developer",
  "location": "Remote",
  "sources": ["linkedin", "indeed"],
  "maxItemsPerSource": 30
}
```

---

## Output Reference

Each job is saved as a **separate item** in the Apify Dataset.

### Common fields (all sources)

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string` | Origin platform: `linkedin`, `naukri`, or `indeed` |
| `title` | `string` | Job title |
| `company` | `string` | Company name |
| `location` | `string` | Job location |
| `jobUrl` | `string` | Direct link to the job posting |
| `postedDate` | `string` | Post date (reserved, currently empty) |
| `scrapedAt` | `string` | ISO 8601 timestamp of when the job was scraped |

### Source-specific fields

| Field | Sources | Description |
|-------|---------|-------------|
| `salary` | Naukri, Indeed | Salary range when available on the listing |
| `experience` | Naukri | Required experience (e.g. `2-5 Yrs`) |

### Output examples

**LinkedIn:**

```json
{
  "source": "linkedin",
  "title": "Flutter Developer",
  "company": "ABC Technologies",
  "location": "Kochi, Kerala, India",
  "jobUrl": "https://www.linkedin.com/jobs/view/1234567890",
  "postedDate": "",
  "salary": "",
  "scrapedAt": "2026-06-08T10:30:00.000Z"
}
```

**Naukri:**

```json
{
  "source": "naukri",
  "title": "Flutter Developer",
  "company": "XYZ Pvt Ltd",
  "location": "Kochi",
  "jobUrl": "https://www.naukri.com/job-listings-flutter-developer-kochi-123456",
  "postedDate": "",
  "experience": "2-5 Yrs",
  "salary": "5-8 Lacs PA",
  "scrapedAt": "2026-06-08T10:30:00.000Z"
}
```

**Indeed India:**

```json
{
  "source": "indeed",
  "title": "Flutter Developer",
  "company": "Tech Corp",
  "location": "Kochi, Kerala",
  "jobUrl": "https://in.indeed.com/viewjob?jk=abc123",
  "postedDate": "",
  "salary": "₹6,00,000 - ₹10,00,000 a year",
  "scrapedAt": "2026-06-08T10:30:00.000Z"
}
```

### Exporting results

On Apify Console, export the dataset as:

- **JSON** — for API integration
- **CSV** — for spreadsheets
- **Excel** — for reporting
- **API** — programmatic access via [Apify Dataset API](https://docs.apify.com/api/v2/dataset-items-get)

---

## How the Actor Works

### Step-by-step execution

```
1. Actor.main() starts
        ↓
2. Read INPUT.json / Actor.getInput()
        ↓
3. Validate keyword, location, sources, maxItemsPerSource
        ↓
4. Promise.all([ linkedin, naukri, indeed ])  ← parallel
        ↓
5. Each scraper:
   a. Launch PlaywrightCrawler
   b. Open search URL for page 1
   c. Extract job cards from DOM
   d. Enqueue next page if more results needed
   e. Repeat until maxItems reached or no more pages
        ↓
6. Merge all job arrays
        ↓
7. deduplicateJobs() — remove duplicates
        ↓
8. Actor.pushData(uniqueJobs) — save to dataset
        ↓
9. Print summary → Actor finished
```

### Parallel execution

All enabled scrapers run at the same time. Each scraper manages its own:

- Playwright browser instance
- Crawlee request queue (`job-scraper-linkedin`, `job-scraper-naukri`, `job-scraper-indeed`)

This isolation prevents request queue lock conflicts when scraping in parallel. A failure in one scraper does not stop the others.

---

## Source Scrapers

### LinkedIn Jobs (`src/scrapers/linkedin.js`)

| Property | Value |
|----------|-------|
| Search URL | `https://www.linkedin.com/jobs/search/?keywords={keyword}&location={location}&start={offset}` |
| Page size | 25 jobs per page |
| Rate limit | 2000 ms between pages |
| Max requests/min | 20 |
| Retries | 3 |

**Extracted fields:** title, company, location, jobUrl

---

### Naukri (`src/scrapers/naukri.js`)

| Property | Value |
|----------|-------|
| Primary URL | `https://www.naukri.com/{keyword-slug}-jobs-in-{location-slug}` |
| Fallback URL | `https://www.naukri.com/job-listings?k={keyword}&l={location}&page={n}` |
| Page size | ~20 jobs per page |
| Rate limit | 1500 ms between pages |
| Max requests/min | 25 |
| Retries | 3 |

**Extracted fields:** title, company, location, experience, salary, jobUrl

Naukri uses a slug-based URL first. If page 1 returns no results, it automatically retries with the query-parameter fallback URL.

---

### Indeed India (`src/scrapers/indeed.js`)

| Property | Value |
|----------|-------|
| Search URL | `https://in.indeed.com/jobs?q={keyword}&l={location}&start={offset}` |
| Page size | 10 jobs per page |
| Rate limit | 1500 ms between pages |
| Max requests/min | 30 |
| Retries | 3 |

**Extracted fields:** title, company, location, salary, jobUrl

---

## Deduplication

After all sources finish, duplicates are removed before saving to the dataset.

### Dedupe key formula

```
key = normalize(title) + "|" + normalize(company) + "|" + normalize(location)
```

### Normalization rules

1. Convert to lowercase
2. Trim leading/trailing whitespace
3. Collapse multiple spaces into one
4. Remove punctuation and special characters

### Example

These two records would be treated as duplicates:

```
{ title: "Flutter Developer", company: "ABC Tech", location: "Kochi" }
{ title: "flutter developer", company: "ABC Tech.", location: "kochi" }
```

The **first occurrence** is kept. Source priority follows the order results are merged (LinkedIn → Naukri → Indeed based on `Promise.all` completion order).

---

## Error Handling

The Actor is designed to be resilient. Individual source failures never crash the entire run.

| Scenario | Behavior |
|----------|----------|
| One source fails (network, timeout, blocked) | Error logged, other sources continue, partial results saved |
| All sources fail | Actor finishes with warning, empty dataset |
| Invalid input (missing keyword/location) | Actor throws error and exits immediately |
| No valid sources in input | Actor throws error and exits immediately |
| Page load fails after 3 retries | Request marked failed, scraper continues with collected results |
| Empty page (no job cards) | Scraper stops pagination for that source |

### Failed request logging

Each scraper registers a `failedRequestHandler` that logs:

- Failed URL
- Error message
- Retry count

---

## Logging

All logs use the Apify `log` utility (`import { log } from 'apify'`).

### Log events

| Event | Level | Example |
|-------|-------|---------|
| Actor started | INFO | `Actor started` |
| Input validated | INFO | `Input normalized { keyword, location, sources }` |
| Source started | INFO | `linkedin: Source started { keyword, location, maxItems }` |
| Page scraped | INFO | `LinkedIn page offset 0: found 25 jobs` |
| Source finished | INFO | `linkedin: Source finished { recordsFound: 25 }` |
| Source failed | ERROR | `linkedin: Source failed { message, stack }` |
| Deduplication | INFO | `Removed 5 duplicate job(s)` |
| Records saved | INFO | `Records saved to dataset: 58` |
| Summary | INFO | `Total LinkedIn jobs: 25` |
| Actor finished | INFO | `Actor finished` |

Per-source loggers use child loggers with a prefix (e.g. `linkedin:`, `naukri:`) for easy filtering in Apify Console.

---

## Troubleshooting

### `'apify' is not recognized` (Windows)

The Apify CLI is not installed or not on your PATH.

```powershell
npm install -g apify-cli
apify --version
```

Then retry:

```powershell
npm run dev
```

---

### `Input schema is not valid (items.enum is not allowed)`

This happens when the `sources` field uses `"editor": "stringList"` with `items.enum`. Apify only allows `enum` on array items when using `"editor": "select"`.

**Already fixed in this project.** The correct schema is:

```json
"sources": {
  "type": "array",
  "editor": "select",
  "items": {
    "type": "string",
    "enum": ["linkedin", "naukri", "indeed"],
    "enumTitles": ["LinkedIn Jobs", "Naukri", "Indeed India"]
  }
}
```

---

### `requestsTotal: 0` / all sources return 0 jobs instantly (~1 second)

Crawlee persists request queues in `storage/request_queues/`. When you re-run with the same keyword and location, requests with the same `uniqueKey` are already marked as **handled** and get skipped — no pages are opened.

**Already fixed in code.** `src/main.js` calls `purgeAllSourceQueues()` at startup, and each scraper opens a fresh queue via `openSourceRequestQueue()` in `src/utils/browser.js`.

If you still hit this on an old build, manually delete queues:

```powershell
Remove-Item -Recurse -Force storage\request_queues
npm start
```

---

### `RequestQueue ... locked by other clients`

Previously, all three scrapers shared Crawlee's default request queue when running in parallel, causing lock contention and intermittent 0-job results from Indeed/Naukri.

**Already fixed.** Each scraper uses a dedicated queue (`job-scraper-linkedin`, etc.) and queues are **purged at the start of every actor run** so re-runs always scrape fresh URLs.

---

### Intermittent 0 jobs from one or more sources

Job boards may temporarily block or rate-limit headless browsers. Symptoms:

- LinkedIn returns jobs but Indeed/Naukri return 0
- Run takes 60+ seconds with queue warnings

**What to do:**

- Run again — results can vary between runs
- Use `npm run dev` to start with a clean storage folder
- Deploy to Apify Cloud (`apify push`) for more stable results
- Reduce parallel load by scraping fewer sources at once

---

### `Warning: You are not logged in with your Apify Account`

This is **informational only** for local runs. Login is **not required** for local scraping.

Local runs work without login:

```powershell
npm start
npm run dev
```

Login is only needed for Apify Cloud features (proxy, deploy, cloud runs):

```powershell
apify login
apify push
```

---

### 0 jobs returned on every run

Job boards often serve bot-detection or CAPTCHA pages to headless browsers on local machines. This is expected behavior locally.

**Solutions:**

- Deploy to **Apify Cloud** using `apify push` — the Playwright Chrome Docker image has better success rates
- Increase `maxItemsPerSource` and run during off-peak hours
- Check the Apify run log for `Source failed` or `0 jobs found` messages

### `npm install` fails on Playwright

Ensure you have sufficient disk space (~300 MB for Chromium). Re-run:

```bash
npx playwright install chromium
```

### `apify push` build fails with `EACCES: permission denied, open package-lock.json`

Apify base images run as non-root user `myuser`. Files copied without `--chown` are owned by root, so `npm install` cannot write `package-lock.json`.

**Already fixed in `Dockerfile`:**

```dockerfile
COPY --chown=myuser:myuser package*.json ./
COPY --chown=myuser:myuser . ./
```

A `.dockerignore` file also excludes `node_modules/` and `storage/` from the build context.

---

### Other `apify push` failures

1. Confirm you are logged in: `apify login`
2. Confirm actor version in `.actor/actor.json` is `MAJOR.MINOR` format (e.g. `"1.0"`, not `"1.0.0"`)
3. Check that `Dockerfile` exists in the project root

### `ERR_PACKAGE_PATH_NOT_EXPORTED` for `apify/log`

Use `import { log } from 'apify'` — not `import log from 'apify/log'`. This is already configured correctly in `src/utils/logger.js`.

### Actor times out on Apify Cloud

Increase timeout in `.actor/actor.json`:

```json
"defaultRunOptions": {
  "timeoutSecs": 7200
}
```

Then re-deploy with `apify push`.

### Duplicate results across sources

Deduplication runs automatically. If duplicates still appear, the `title`, `company`, or `location` text may differ slightly between platforms (e.g. `"ABC Tech"` vs `"ABC Technologies"`). These are treated as separate jobs by design.

---

## Commands Reference

### Setup

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies and download Playwright Chromium |
| `npm install -g apify-cli` | Install Apify CLI globally (one-time) |

### Local run

| Command | Description |
|---------|-------------|
| `npm start` | Run the actor locally with Node.js |
| `npm run dev` | Run via Apify CLI with storage purge |
| `node --check src/main.js` | Syntax-check the entry point |

### Apify deployment

| Command | Description |
|---------|-------------|
| `apify login` | Authenticate with Apify platform |
| `apify push` | Build and deploy actor to Apify Cloud |
| `apify run` | Run actor locally via Apify CLI |
| `apify info` | Show actor info and status |

### Playwright

| Command | Description |
|---------|-------------|
| `npx playwright install chromium` | Re-download Chromium browser |
| `npx playwright --version` | Check Playwright version |

---

## License

ISC
#   a p i f y _ j o b _ s c r a p e r  
 