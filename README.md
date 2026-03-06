# Hemnet.se Property Scraper

Extract structured property listing data from Hemnet.se with high coverage and clean output. Collect pricing, location, broker, media, and listing metadata in a single run. This actor is built for market research, lead generation, portfolio tracking, and real estate intelligence workflows.

---

## Features

- **For-sale listing extraction** — Collect active properties from Hemnet search pages.
- **Rich listing attributes** — Capture price, area, rooms, coordinates, agency details, and listing labels.
- **Flexible search control** — Start from a plain `/till-salu` URL or a pre-filtered Hemnet search URL.
- **Pagination support** — Continue through result pages until your target count is reached.
- **Clean structured dataset** — Receive normalized output ready for analysis and automation.

---

## Use Cases

### Real Estate Market Monitoring
Track newly listed properties, pricing changes, and area-level supply trends over time. Build recurring snapshots for data-driven decision making.

### Lead Discovery For Agencies
Collect property and broker context for sales outreach, partnership opportunities, and local market mapping.

### Investment Screening
Identify listings that match your preferred budget, area profile, and property characteristics for acquisition analysis.

### Pricing Analysis
Compare asking prices, monthly fees, and square meter pricing across neighborhoods and property categories.

### Data Pipelines And Dashboards
Feed listing data into BI dashboards, analytics tools, and reporting workflows with predictable field structure.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `startUrl` | String | No | `"https://www.hemnet.se/till-salu"` | Hemnet start page or pre-filtered search URL. |
| `keyword` | String | No | `""` | Optional keyword filter. |
| `location` | String | No | `""` | Optional location slug fallback. |
| `sort` | String | No | `"NEWEST"` | Sort mode for results. |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to collect. |
| `max_pages` | Integer | No | `10` | Maximum pages to process. |
| `proxyConfiguration` | Object | No | `{ "useApifyProxy": false }` | Optional proxy settings for request reliability. |

---

## Output Data

Each dataset item contains listing-level structured fields.

| Field | Type | Description |
|---|---|---|
| `id` | String | Unique listing ID. |
| `slug` | String | Listing slug. |
| `url` | String | Full listing URL. |
| `street_address` | String | Property street address. |
| `location_description` | String | Area and municipality text. |
| `asking_price` | String | Listing asking price. |
| `fee` | String | Monthly fee when available. |
| `rooms` | String | Room count text. |
| `living_and_supplemental_areas` | String | Area information. |
| `land_area` | String | Land size when available. |
| `square_meter_price` | String | Price per square meter. |
| `broker_name` | String | Broker full name. |
| `broker_agency_name` | String | Agency name. |
| `broker_agency_logo` | String | Agency logo URL. |
| `broker_thumbnail` | String | Broker image URL. |
| `lat` | Number | Latitude coordinate. |
| `lon` | Number | Longitude coordinate. |
| `housing_form_symbol` | String | Housing form code. |
| `housing_form_name` | String | Housing form label. |
| `labels` | Array | Listing labels and tags. |
| `showings` | Array | Showing schedule values. |
| `thumbnails` | Array | Listing image URLs. |
| `active_package` | String | Listing package tier. |
| `new_construction` | Boolean | New construction flag. |
| `project_id` | String | Project identifier when present. |
| `record_type` | String | Listing record type. |
| `removed_before_showing` | Boolean | Removed-before-showing flag. |
| `saved` | Boolean | Saved status. |
| `upcoming` | Boolean | Upcoming status. |
| `published_at` | String | Publication timestamp value. |
| `published_at_iso` | String | Publication timestamp in ISO format. |

---

## Usage Examples

### Basic Extraction

```json
{
  "startUrl": "https://www.hemnet.se/till-salu",
  "results_wanted": 20
}
```

### Filtered Search URL

```json
{
  "startUrl": "https://www.hemnet.se/till-salu?location_ids%5B%5D=17744&housing_form_groups%5B%5D=apartments",
  "sort": "HIGHEST_PRICE",
  "results_wanted": 50,
  "max_pages": 5
}
```

### Large Collection Run

```json
{
  "startUrl": "https://www.hemnet.se/till-salu",
  "sort": "NEWEST",
  "results_wanted": 200,
  "max_pages": 20,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

---

## Sample Output

```json
{
  "id": "21577475",
  "slug": "lagenhet-1rum-luthagen-uppsala-kommun-geijersgatan-23b-21577475",
  "url": "https://www.hemnet.se/bostad/lagenhet-1rum-luthagen-uppsala-kommun-geijersgatan-23b-21577475",
  "street_address": "Geijersgatan 23B",
  "location_description": "Luthagen, Uppsala kommun",
  "asking_price": "1 750 000 kr",
  "fee": "4 072 kr/mån",
  "rooms": "1 rum",
  "living_and_supplemental_areas": "41 m²",
  "square_meter_price": "42 683 kr/m²",
  "broker_name": "Martin Boholm",
  "broker_agency_name": "Notar",
  "lat": 59.86144,
  "lon": 17.617485,
  "housing_form_symbol": "APARTMENT",
  "housing_form_name": "Lägenhet",
  "labels": [
    { "text": "Premium", "identifier": "PREMIUM", "category": "PRODUCT" }
  ],
  "thumbnails": [
    "https://bilder.hemnet.se/images/itemgallery_cut/example.jpg"
  ],
  "record_type": "COMMON",
  "published_at_iso": "2026-03-06T10:31:49.000Z"
}
```

---

## Tips For Best Results

### Use Real Search URLs
Start from a Hemnet URL that already matches your area or property preferences to reduce filtering work later.

### Begin With Small Runs
Use `results_wanted: 20` first to validate output quickly before scaling to larger collections.

### Control Runtime With `max_pages`
Set a sensible page cap for predictable runtime and dataset size.

### Choose Sort Intentionally
Use sorting aligned with your use case, such as `NEWEST` for monitoring or `LOWEST_PRICE` for affordability scans.

### Use Proxy For Heavy Runs
For large or frequent runs, proxy usage can improve consistency.

---

## Integrations

Connect your dataset with:

- **Google Sheets** — Build shareable listing trackers.
- **Airtable** — Organize and filter property pipelines.
- **Make** — Automate enrichment and notifications.
- **Zapier** — Trigger workflows from new dataset items.
- **Webhooks** — Send results into custom systems.

### Export Formats

- **JSON** — Best for APIs and engineering workflows.
- **CSV** — Best for spreadsheet analysis.
- **Excel** — Best for business reporting.
- **XML** — Best for legacy integrations.

---

## Frequently Asked Questions

### How many listings can I collect?
You can collect large batches. Practical limits depend on your input settings and runtime constraints.

### Can I scrape filtered pages?
Yes. Use a Hemnet URL that already includes filters and sorting options.

### What if some fields are missing?
Some listings naturally omit optional information. Missing values are returned as `null` or empty arrays where applicable.

### Does it support pagination?
Yes. The actor paginates through result pages until `results_wanted` or `max_pages` is reached.

### Can I run it on a schedule?
Yes. You can schedule recurring runs in Apify to monitor market changes over time.

---

## Support

For issues or feature requests, use the Apify Console issue channels tied to this actor.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for legitimate data collection and analysis. You are responsible for complying with applicable laws and the target website terms for your jurisdiction and use case.
