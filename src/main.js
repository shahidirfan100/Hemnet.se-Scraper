import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

const GRAPHQL_URL = 'https://www.hemnet.se/graphql';
const DEFAULT_START_URL = 'https://www.hemnet.se/till-salu';
const PAGE_SIZE = 50;
const API_DISCOVERY_PATH = join(process.cwd(), 'API_DISCOVERY.md');
const HTML_SNIPPET_LIMIT = 240;

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

const GRAPHQL_HEADER_PROFILES = [
    (selectedStartUrl) => ({
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        Origin: 'https://www.hemnet.se',
        Referer: selectedStartUrl,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
    }),
    (selectedStartUrl) => ({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://www.hemnet.se',
        Referer: selectedStartUrl,
    }),
];

const START_PAGE_HEADERS = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
};

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

const getContentType = (headers = {}) => String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();

const looksLikeHtml = (body, headers = {}) => {
    const contentType = getContentType(headers);
    const snippet = truncateText(body, 64).toLowerCase();
    return contentType.includes('text/html')
        || snippet.startsWith('<!doctype html')
        || snippet.startsWith('<html')
        || snippet.includes('just a moment');
};

const buildFailureMetadata = ({ name, response, error }) => ({
    attempt: name,
    statusCode: response?.statusCode ?? error?.response?.statusCode ?? null,
    contentType: getContentType(response?.headers || error?.response?.headers),
    bodySnippet: truncateText(response?.body || error?.response?.body),
    message: error?.message,
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

const bootstrapSession = async ({ cookieJar, proxyUrl, selectedStartUrl }) => {
    const response = await gotScraping.get(selectedStartUrl, {
        cookieJar,
        proxyUrl,
        headers: START_PAGE_HEADERS,
        throwHttpErrors: false,
        timeout: { request: 30000 },
        retry: { limit: 1 },
    });

    return {
        statusCode: response.statusCode,
        contentType: getContentType(response.headers),
        bodySnippet: truncateText(response.body),
        isHtml: looksLikeHtml(response.body, response.headers),
    };
};

const parseJsonResponse = ({ response, name }) => {
    if (looksLikeHtml(response.body, response.headers)) {
        throw new Error(`Received HTML instead of JSON on ${name}`);
    }

    if (typeof response.body === 'object' && response.body !== null) {
        return response.body;
    }

    try {
        return JSON.parse(response.body);
    } catch (error) {
        throw new Error(`Invalid JSON on ${name}: ${error.message}`);
    }
};

const diagnoseRequestFailure = async ({
    cookieJar,
    offset,
    proxyUrl,
    requestBody,
    selectedStartUrl,
}) => {
    const apiDiscovery = await readApiDiscovery();
    const diagnostics = [];

    diagnostics.push({
        step: 'api_discovery_reference',
        snippet: truncateText(apiDiscovery, 320),
    });

    try {
        const startPage = await bootstrapSession({ cookieJar, proxyUrl, selectedStartUrl });
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
        const probeResponse = await gotScraping.post(GRAPHQL_URL, {
            cookieJar,
            proxyUrl,
            headers: GRAPHQL_HEADER_PROFILES[1](selectedStartUrl),
            json: requestBody,
            throwHttpErrors: false,
            timeout: { request: 30000 },
            retry: { limit: 0 },
        });

        diagnostics.push({
            step: 'graphql_probe',
            statusCode: probeResponse.statusCode,
            contentType: getContentType(probeResponse.headers),
            bodySnippet: truncateText(probeResponse.body),
            offset,
        });
    } catch (error) {
        diagnostics.push({
            step: 'graphql_probe',
            offset,
            message: error.message,
        });
    }

    log.warning('Hemnet request diagnostics', { diagnostics });
};

const fetchGraphqlPayload = async ({
    cookieJar,
    offset,
    proxyUrl,
    requestBody,
    selectedStartUrl,
}) => {
    const attempts = [
        { name: 'direct_graphql', profileIndex: 0, bootstrap: false },
        { name: 'bootstrapped_graphql', profileIndex: 0, bootstrap: true },
        { name: 'bootstrapped_minimal_graphql', profileIndex: 1, bootstrap: true },
    ];

    const failures = [];

    for (const attempt of attempts) {
        try {
            if (attempt.bootstrap) {
                const sessionInfo = await bootstrapSession({ cookieJar, proxyUrl, selectedStartUrl });
                log.info('Bootstrapped Hemnet session', {
                    attempt: attempt.name,
                    ...sessionInfo,
                });
            }

            const response = await gotScraping.post(GRAPHQL_URL, {
                cookieJar,
                proxyUrl,
                headers: GRAPHQL_HEADER_PROFILES[attempt.profileIndex](selectedStartUrl),
                json: requestBody,
                throwHttpErrors: false,
                timeout: { request: 30000 },
                retry: { limit: 1 },
            });

            if (response.statusCode >= 400) {
                failures.push(buildFailureMetadata({ name: attempt.name, response }));
                log.warning('Hemnet GraphQL attempt failed', failures[failures.length - 1]);
                continue;
            }

            return parseJsonResponse({ response, name: attempt.name });
        } catch (error) {
            failures.push(buildFailureMetadata({ name: attempt.name, error }));
            log.warning('Hemnet GraphQL attempt failed', failures[failures.length - 1]);
        }
    }

    await diagnoseRequestFailure({
        cookieJar,
        offset,
        proxyUrl,
        requestBody,
        selectedStartUrl,
    });

    throw new Error(`Hemnet API request failed after ${attempts.length} attempts. Last failure: ${JSON.stringify(failures.at(-1) || {})}`);
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

    const resultsWanted = Number.isFinite(Number(resultsWantedRaw))
        ? Math.max(1, Number(resultsWantedRaw))
        : 20;
    const maxPages = Number.isFinite(Number(maxPagesRaw))
        ? Math.max(1, Number(maxPagesRaw))
        : 10;

    const selectedStartUrl = pickFirstUrl(startUrls, startUrl, url);
    const searchParams = parseSearchFromUrl(selectedStartUrl);

    if (keyword && !searchParams.keywords) searchParams.keywords = String(keyword).trim();
    if (location && !searchParams.locationSlugs) {
        const normalizedLocation = String(location).trim().toLowerCase().replace(/\s+/g, '-');
        if (normalizedLocation) searchParams.locationSlugs = [normalizedLocation];
    }

    const sortValue = normalizeSort(sort);
    const proxy = proxyConfiguration ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;

    log.info('Starting Hemnet API extraction', {
        startUrl: selectedStartUrl,
        sort: sortValue,
        resultsWanted,
        maxPages,
    });

    let totalSaved = 0;
    let offset = 0;
    let page = 0;
    const cookieJar = new CookieJar();

    while (totalSaved < resultsWanted && page < maxPages) {
        const proxyUrl = proxy ? await proxy.newUrl() : undefined;

        const body = {
            operationName: 'webSearchForSaleListings',
            query: SEARCH_QUERY,
            variables: {
                searchParams,
                sort: sortValue,
                offset,
            },
        };

        const responseBody = await fetchGraphqlPayload({
            cookieJar,
            offset,
            proxyUrl,
            requestBody: body,
            selectedStartUrl,
        });

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
