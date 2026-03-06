import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

const GRAPHQL_URL = 'https://www.hemnet.se/graphql';
const DEFAULT_START_URL = 'https://www.hemnet.se/till-salu';
const PAGE_SIZE = 50;

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

        const response = await gotScraping.post(GRAPHQL_URL, {
            proxyUrl,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Origin: 'https://www.hemnet.se',
                Referer: selectedStartUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
            },
            json: body,
            timeout: { request: 30000 },
            retry: { limit: 2 },
        });

        const responseBody = typeof response.body === 'string'
            ? JSON.parse(response.body)
            : response.body;

        const result = responseBody?.data?.searchForSaleListings;
        const errors = responseBody?.errors;

        if (Array.isArray(errors) && errors.length) {
            throw new Error(`GraphQL returned errors: ${JSON.stringify(errors)}`);
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
