import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { Impit } from 'impit';
import { CookieJar } from 'tough-cookie';

const GRAPHQL_URL = 'https://www.hemnet.se/graphql';
const DEFAULT_START_URL = 'https://www.hemnet.se/till-salu';
const PAGE_SIZE = 50;
const API_DISCOVERY_PATH = join(process.cwd(), 'API_DISCOVERY.md');
const HTML_SNIPPET_LIMIT = 240;

const REQUEST_TIMEOUT_MS = 30000;
const MAX_REQUEST_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 8000;

// Browser profiles verified against the live Hemnet endpoint. Requests are
// retried through this list so a temporarily blocked fingerprint auto-heals on
// the next attempt.
const BROWSER_PROFILES = ['chrome151', 'firefox144', 'okhttp5', 'chrome142'];

const SEARCH_QUERY = `
query webSearchForSaleListings($searchParams: ListingSearchForSaleInput!, $sort: ListingSearchForSaleSorting, $offset: Int) {
  searchForSaleListings(search: $searchParams, sort: $sort, limit: 50, offset: $offset) {
    total
    sort
    cards {
      id
      slug
      streetAddress
      askingPrice
      fee
      rooms
      livingAndSupplementalAreas
      landArea
      locationDescription
      publishedAt
      squareMeterPrice
      brokerName
      brokerAgencyName
      brokerAgencyLogo
      brokerThumbnail
      coordinates {
        lat
        long
      }
      housingForm {
        symbol
        name
      }
      labels {
        text
        identifier
        category
      }
      showings
      thumbnails(format: ITEMGALLERY_CUT)
      activePackage
      newConstruction
      projectId
      recordType
      removedBeforeShowing
      saved
      upcoming
    }
  }
}`;

const ALLOWED_SORTS = new Set([
    'NEWEST',
    'OLDEST',
    'LOWEST_PRICE',
    'HIGHEST_PRICE',
    'NEXT_OPEN_HOUSE',
    'STREET_ADDRESS',
    'STREET_ADDRESS_DESC',
    'LARGEST_LIVING_AREA',
    'SMALLEST_LIVING_AREA',
    'LARGEST_LAND_AREA',
    'SMALLEST_LAND_AREA',
    'LOWEST_PRICE_PER_M2',
    'HIGHEST_PRICE_PER_M2',
    'LOWEST_FEE',
    'HIGHEST_FEE',
    'CLOSEST_TO_WATER',
]);

const toInt = (value) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const toIntArray = (values) => {
    const parsed = values
        .flatMap((v) => String(v).split(','))
        .map((v) => toInt(v.trim()))
        .filter((v) => v !== null);

    return parsed.length ? [...new Set(parsed)] : undefined;
};

const toStringArray = (values) => {
    const parsed = values
        .flatMap((v) => String(v).split(','))
        .map((v) => v.trim())
        .filter(Boolean);

    return parsed.length ? [...new Set(parsed)] : undefined;
};

const parseBool = (value) => {
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return undefined;
};

const pickFirstUrl = (startUrls, startUrl, url) => {
    if (Array.isArray(startUrls)) {
        const found = startUrls.map((u) => String(u).trim()).find(Boolean);
        if (found) return found;
    }
    if (startUrl && String(startUrl).trim()) return String(startUrl).trim();
    if (url && String(url).trim()) return String(url).trim();
    return DEFAULT_START_URL;
};

const parseSearchFromUrl = (rawUrl) => {
    const parsed = {};
    let pathname = '';

    try {
        const url = new URL(rawUrl);
        pathname = url.pathname || '';
        const q = url.searchParams;

        const locationIds = toIntArray([
            ...q.getAll('location_ids[]'),
            ...q.getAll('location_ids'),
            ...q.getAll('locationIds[]'),
            ...q.getAll('locationIds'),
        ]);
        if (locationIds) parsed.locationIds = locationIds;

        const housingFormGroups = toStringArray([
            ...q.getAll('housing_form_groups[]'),
            ...q.getAll('housing_form_groups'),
            ...q.getAll('housingFormGroups[]'),
            ...q.getAll('housingFormGroups'),
        ]);
        if (housingFormGroups) parsed.housingFormGroups = housingFormGroups.map((v) => v.toUpperCase());

        const maybeIntField = (paramNames, targetField) => {
            for (const name of paramNames) {
                const value = q.get(name);
                if (value !== null && value !== '') {
                    const parsedInt = toInt(value);
                    if (parsedInt !== null) parsed[targetField] = parsedInt;
                    return;
                }
            }
        };

        maybeIntField(['price_min', 'priceMin'], 'priceMin');
        maybeIntField(['price_max', 'priceMax'], 'priceMax');
        maybeIntField(['rooms_min', 'roomsMin'], 'roomsMin');
        maybeIntField(['rooms_max', 'roomsMax'], 'roomsMax');
        maybeIntField(['living_area_min', 'livingAreaMin'], 'livingAreaMin');
        maybeIntField(['living_area_max', 'livingAreaMax'], 'livingAreaMax');
        maybeIntField(['land_area_min', 'landAreaMin'], 'landAreaMin');
        maybeIntField(['land_area_max', 'landAreaMax'], 'landAreaMax');
        maybeIntField(['fee_max', 'feeMax'], 'feeMax');
        maybeIntField(['square_meter_price_min', 'squareMeterPriceMin'], 'squareMeterPriceMin');
        maybeIntField(['square_meter_price_max', 'squareMeterPriceMax'], 'squareMeterPriceMax');

        const keywords = q.get('keywords') || q.get('keyword') || '';
        if (keywords.trim()) parsed.keywords = keywords.trim();

        const floor = q.get('floor');
        if (floor && floor.trim()) parsed.floor = floor.trim().toUpperCase();

        const publishedSince = q.get('published_since') || q.get('publishedSince');
        if (publishedSince && publishedSince.trim()) parsed.publishedSince = publishedSince.trim();

        const openHouseWithin = q.get('open_house_within') || q.get('openHouseWithin');
        if (openHouseWithin && openHouseWithin.trim()) parsed.openHouseWithin = openHouseWithin.trim();

        const deactivated = parseBool(q.get('deactivated_before_open_house') || q.get('deactivatedBeforeOpenHouse'));
        if (deactivated !== undefined) parsed.deactivatedBeforeOpenHouse = deactivated ? 'EXCLUDE' : 'INCLUDE';
    } catch {
        return {};
    }

    const slugs = pathname
        .split('/')
        .filter(Boolean)
        .slice(1);

    if (slugs.length) parsed.locationSlugs = slugs;
    return parsed;
};

const normalizeSort = (sort) => {
    const normalized = String(sort || '').trim().toUpperCase();
    return ALLOWED_SORTS.has(normalized) ? normalized : 'NEWEST';
};

const truncateText = (value, limit = HTML_SNIPPET_LIMIT) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

const getHeader = (headers, name) => {
    if (!headers) return '';
    if (typeof headers.get === 'function') return String(headers.get(name) || '');
    return String(headers[name] || headers[name.toLowerCase()] || '');
};

const getContentType = (headers) => getHeader(headers, 'content-type').toLowerCase();

const looksLikeHtml = (body, headers) => {
    const contentType = getContentType(headers);
    const snippet = truncateText(body, 64).toLowerCase();
    return (
        contentType.includes('text/html')
        || snippet.startsWith('<!doctype html')
        || snippet.startsWith('<html')
        || snippet.includes('just a moment')
    );
};

const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const computeBackoffMs = (attempt) => {
    const base = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    return base + Math.floor(Math.random() * 500);
};

// One Impit client per (browser profile, proxy session). Reusing clients keeps
// connection pooling intact, while sharing a cookie jar per profile keeps the
// Cloudflare clearance cookie consistent with the emulated user agent.
const cookieJars = new Map();
const clientCache = new Map();

const getClient = ({ browser, proxyUrl }) => {
    const key = `${browser}|${proxyUrl || 'direct'}`;
    let client = clientCache.get(key);
    if (!client) {
        if (!cookieJars.has(browser)) cookieJars.set(browser, new CookieJar());
        client = new Impit({
            browser,
            cookieJar: cookieJars.get(browser),
            timeout: REQUEST_TIMEOUT_MS,
            ...(proxyUrl ? { proxyUrl } : {}),
        });
        clientCache.set(key, client);
    }
    return client;
};

const buildGraphqlHeaders = (selectedStartUrl) => ({
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    Origin: 'https://www.hemnet.se',
    Referer: selectedStartUrl,
});

const buildStartPageHeaders = () => ({
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
});

let cachedApiDiscovery;

const readApiDiscovery = async () => {
    if (cachedApiDiscovery !== undefined) return cachedApiDiscovery;

    try {
        cachedApiDiscovery = await readFile(API_DISCOVERY_PATH, 'utf8');
    } catch {
        cachedApiDiscovery = '';
    }

    return cachedApiDiscovery;
};

const bootstrapSession = async ({ client, selectedStartUrl }) => {
    const response = await client.fetch(selectedStartUrl, { headers: buildStartPageHeaders() });
    const body = await response.text();

    return {
        statusCode: response.status,
        contentType: getContentType(response.headers),
        bodySnippet: truncateText(body),
        isHtml: looksLikeHtml(body, response.headers),
    };
};

const requestGraphql = async ({ client, requestBody, selectedStartUrl }) => {
    const response = await client.fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: buildGraphqlHeaders(selectedStartUrl),
        body: JSON.stringify(requestBody),
    });
    const body = await response.text();

    return {
        statusCode: response.status,
        headers: response.headers,
        body,
    };
};

const diagnoseRequestFailure = async ({ proxy, requestBody, selectedStartUrl }) => {
    const apiDiscovery = await readApiDiscovery();
    const diagnostics = [];

    diagnostics.push({
        step: 'api_discovery_reference',
        snippet: truncateText(apiDiscovery, 320),
    });

    const diagnosticBrowser = BROWSER_PROFILES[0];
    const diagnosticProxyUrl = proxy ? await proxy.newUrl() : undefined;
    const diagnosticClient = getClient({ browser: diagnosticBrowser, proxyUrl: diagnosticProxyUrl });

    try {
        const startPage = await bootstrapSession({ client: diagnosticClient, selectedStartUrl });
        diagnostics.push({
            step: 'start_page_probe',
            ...startPage,
        });
    } catch (error) {
        diagnostics.push({
            step: 'start_page_probe',
            message: error.message,
        });
    }

    try {
        const probe = await requestGraphql({ client: diagnosticClient, requestBody, selectedStartUrl });
        diagnostics.push({
            step: 'graphql_probe',
            statusCode: probe.statusCode,
            contentType: getContentType(probe.headers),
            bodySnippet: truncateText(probe.body),
        });
    } catch (error) {
        diagnostics.push({
            step: 'graphql_probe',
            message: error.message,
        });
    }

    log.warning('Hemnet request diagnostics', { diagnostics });
};

const fetchGraphqlPayload = async ({ proxy, requestBody, selectedStartUrl }) => {
    const failures = [];

    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
        const browser = BROWSER_PROFILES[(attempt - 1) % BROWSER_PROFILES.length];
        const proxyUrl = proxy ? await proxy.newUrl() : undefined;
        const client = getClient({ browser, proxyUrl });

        try {
            // The first attempt goes straight to GraphQL. Later attempts refresh
            // the public search page first to obtain fresh clearance cookies.
            if (attempt > 1) {
                const session = await bootstrapSession({ client, selectedStartUrl });
                log.info('Bootstrapped Hemnet session', { attempt, browser, ...session });
            }

            const response = await requestGraphql({ client, requestBody, selectedStartUrl });

            if (response.statusCode >= 200 && response.statusCode < 300 && !looksLikeHtml(response.body, response.headers)) {
                try {
                    return JSON.parse(response.body);
                } catch (error) {
                    failures.push({ attempt, browser, statusCode: response.statusCode, error: `Invalid JSON: ${error.message}` });
                }
            } else {
                failures.push({
                    attempt,
                    browser,
                    statusCode: response.statusCode,
                    contentType: getContentType(response.headers),
                    bodySnippet: truncateText(response.body),
                });
            }
        } catch (error) {
            failures.push({ attempt, browser, error: error.message });
        }

        const last = failures[failures.length - 1];
        log.warning('Hemnet GraphQL attempt failed', {
            attempt,
            browser,
            of: MAX_REQUEST_ATTEMPTS,
            ...last,
        });

        if (attempt < MAX_REQUEST_ATTEMPTS) await sleep(computeBackoffMs(attempt));
    }

    await diagnoseRequestFailure({ proxy, requestBody, selectedStartUrl });

    throw new Error(
        `Hemnet API request failed after ${MAX_REQUEST_ATTEMPTS} attempts. Last failure: ${JSON.stringify(failures.at(-1) || {})}`,
    );
};

const mapCard = (card) => {
    const publishedAtEpoch = Number.parseFloat(card.publishedAt || '');
    const detailUrl = card.slug ? `https://www.hemnet.se/bostad/${card.slug}` : null;

    return {
        id: card.id ?? null,
        slug: card.slug ?? null,
        url: detailUrl,
        street_address: card.streetAddress ?? null,
        location_description: card.locationDescription ?? null,
        asking_price: card.askingPrice ?? null,
        fee: card.fee ?? null,
        rooms: card.rooms ?? null,
        living_and_supplemental_areas: card.livingAndSupplementalAreas ?? null,
        land_area: card.landArea ?? null,
        square_meter_price: card.squareMeterPrice ?? null,
        broker_name: card.brokerName ?? null,
        broker_agency_name: card.brokerAgencyName ?? null,
        broker_agency_logo: card.brokerAgencyLogo ?? null,
        broker_thumbnail: card.brokerThumbnail ?? null,
        lat: card.coordinates?.lat ?? null,
        lon: card.coordinates?.long ?? null,
        housing_form_symbol: card.housingForm?.symbol ?? null,
        housing_form_name: card.housingForm?.name ?? null,
        labels: Array.isArray(card.labels) ? card.labels : [],
        showings: Array.isArray(card.showings) ? card.showings : [],
        thumbnails: Array.isArray(card.thumbnails) ? card.thumbnails : [],
        active_package: card.activePackage ?? null,
        new_construction: card.newConstruction ?? null,
        project_id: card.projectId ?? null,
        record_type: card.recordType ?? null,
        removed_before_showing: card.removedBeforeShowing ?? null,
        saved: card.saved ?? null,
        upcoming: card.upcoming ?? null,
        published_at: card.publishedAt ?? null,
        published_at_iso: Number.isFinite(publishedAtEpoch)
            ? new Date(Math.round(publishedAtEpoch * 1000)).toISOString()
            : null,
    };
};

await Actor.init();

async function main() {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl,
        startUrls,
        url,
        keyword = '',
        location = '',
        sort = 'NEWEST',
        results_wanted: resultsWantedRaw = 20,
        max_pages: maxPagesRaw = 10,
        proxyConfiguration,
    } = input;

    const resultsWanted = Number.isFinite(Number(resultsWantedRaw)) ? Math.max(1, Number(resultsWantedRaw)) : 20;
    const maxPages = Number.isFinite(Number(maxPagesRaw)) ? Math.max(1, Number(maxPagesRaw)) : 10;

    const selectedStartUrl = pickFirstUrl(startUrls, startUrl, url);
    const searchParams = parseSearchFromUrl(selectedStartUrl);

    if (keyword && !searchParams.keywords) searchParams.keywords = String(keyword).trim();
    if (location && !searchParams.locationSlugs) {
        const normalizedLocation = String(location).trim().toLowerCase().replace(/\s+/g, '-');
        if (normalizedLocation) searchParams.locationSlugs = [normalizedLocation];
    }

    const sortValue = normalizeSort(sort);

    const shouldUseProxy = Boolean(
        proxyConfiguration
        && (proxyConfiguration.useApifyProxy
            || (Array.isArray(proxyConfiguration.proxyUrls) && proxyConfiguration.proxyUrls.length > 0)),
    );
    const proxy = shouldUseProxy ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;

    log.info('Starting Hemnet API extraction', {
        startUrl: selectedStartUrl,
        sort: sortValue,
        resultsWanted,
        maxPages,
    });

    let totalSaved = 0;
    let offset = 0;
    let page = 0;

    while (totalSaved < resultsWanted && page < maxPages) {
        const body = {
            operationName: 'webSearchForSaleListings',
            query: SEARCH_QUERY,
            variables: {
                searchParams,
                sort: sortValue,
                offset,
            },
        };

        let responseBody;
        try {
            responseBody = await fetchGraphqlPayload({
                proxy,
                requestBody: body,
                selectedStartUrl,
            });
        } catch (error) {
            if (totalSaved === 0) throw error;
            log.error(`Stopping pagination after a request failure; returning the ${totalSaved} listings already saved.`, {
                message: error.message,
            });
            break;
        }

        const result = responseBody?.data?.searchForSaleListings;
        const errors = responseBody?.errors;

        if (Array.isArray(errors) && errors.length) {
            throw new Error(`GraphQL returned errors: ${JSON.stringify(errors)}`);
        }

        if (!result) {
            log.warning('Unexpected Hemnet GraphQL shape', {
                topLevelKeys: Object.keys(responseBody || {}),
                dataKeys: Object.keys(responseBody?.data || {}),
            });
            break;
        }

        const cards = Array.isArray(result?.cards) ? result.cards : [];
        if (!cards.length) {
            log.info('No more cards returned, stopping pagination.');
            break;
        }

        const remaining = resultsWanted - totalSaved;
        const batch = cards.slice(0, remaining).map(mapCard);

        await Dataset.pushData(batch);

        totalSaved += batch.length;
        page += 1;
        offset += cards.length;

        log.info('Saved page from Hemnet API', {
            page,
            offset,
            batchSize: batch.length,
            totalSaved,
            totalAvailable: result?.total ?? null,
        });

        if (cards.length < PAGE_SIZE) break;
    }

    log.info(`Extraction complete. Total saved: ${totalSaved}`);
}

main()
    .catch((err) => {
        log.error(`Actor failed: ${err.message}`, { stack: err.stack });
        process.exitCode = 1;
    })
    .finally(async () => {
        await Actor.exit();
    });
