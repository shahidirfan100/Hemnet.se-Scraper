## Selected API
- Endpoint: `https://www.hemnet.se/graphql`
- Method: `POST`
- Auth: None required for public listing search
- Pagination: `offset` parameter with `limit: 50` per request
- Primary Operation: `webSearchForSaleListings`
- Query Field: `searchForSaleListings(search, sort, limit, offset)`

## Why This API Was Selected
- Returns JSON directly
- Supports pagination via offset
- Returns many structured listing fields in a single request
- No session login required for public for-sale listings

## Endpoint Score (Apify Updater rubric)
- Returns JSON directly: +30
- Has >15 unique fields: +25
- No auth required: +20
- Has pagination support: +15
- Matches or extends current fields: +10
- Total: **100**

## Fields Available (validated)
- `id`
- `slug`
- `streetAddress`
- `askingPrice`
- `fee`
- `rooms`
- `livingAndSupplementalAreas`
- `landArea`
- `locationDescription`
- `publishedAt`
- `squareMeterPrice`
- `brokerName`
- `brokerAgencyName`
- `brokerAgencyLogo`
- `brokerThumbnail`
- `coordinates.lat`
- `coordinates.long`
- `housingForm.symbol`
- `housingForm.name`
- `labels[]`
- `showings[]`
- `thumbnails[]`
- `activePackage`
- `newConstruction`
- `projectId`
- `recordType`
- `removedBeforeShowing`
- `saved`
- `upcoming`

## Existing Actor Fields (before rewrite)
- `title`
- `company`
- `category`
- `location`
- `date_posted`
- `description_html`
- `description_text`
- `url`

## New Fields Added vs Existing
- Rich listing metadata (pricing package, record type, listing state flags)
- Geospatial data (`lat`, `lon`)
- Agency and broker metadata
- Listing media URLs (`thumbnails`, broker/agency image URLs)
- Structured labels and showing details

## Notes
- Direct access to `/_next/data/...` endpoints was blocked with `403`.
- The GraphQL endpoint remained accessible and provided broader listing-card coverage.
