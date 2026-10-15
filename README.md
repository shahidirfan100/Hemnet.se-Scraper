## What does Hemnet.se Scraper do?

Hemnet.se Scraper collects structured Swedish property listings from Hemnet.se, the country's largest real estate marketplace. Provide a Hemnet for-sale search URL, or use the optional keyword and location filters, and receive clean records with asking price, monthly fee, rooms, living area, price per square meter, address, coordinates, broker and agency details, thumbnails, labels, and listing metadata.

Use the dataset for Swedish property market research, investment screening, agency lead discovery, price comparisons, inventory monitoring, and scheduled market snapshots. Results can be downloaded as JSON, CSV, Excel, or XML, connected to integrations, or accessed through the Apify API.

## Why use Hemnet.se Scraper?

- **Collect Swedish property inventory** - Gather for-sale listings from the national `/till-salu` search or any pre-filtered Hemnet search URL.
- **Rich listing records** - Capture pricing, fees, room counts, areas, allmän and supplemental area, coordinates, housing form, broker and agency information, labels, showings, and image URLs.
- **Flexible search control** - Start from a plain Hemnet URL, a filtered URL, or apply an optional keyword or location filter.
- **Controlled collection size** - Set a maximum result count and a page cap for small tests or larger research runs.
- **Scheduled monitoring** - Repeat the same search on a schedule to compare new inventory and prices over time.
- **Automation-ready output** - Export structured results or connect datasets to spreadsheets, webhooks, and downstream tools.

## What data can you extract from Hemnet.se?

Each dataset item represents one property listing. Available fields depend on the information Hemnet publishes for that listing.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique Hemnet listing ID. |
| `slug` | String | Listing slug used in the property URL. |
| `url` | String | Full listing URL on Hemnet.se. |
| `street_address` | String | Property street address. |
| `location_description` | String | Area and municipality text. |
| `asking_price` | String | Listing asking price. |
| `fee` | String | Monthly fee when available. |
| `rooms` | String | Room count text. |
| `living_and_supplemental_areas` | String | Living and supplemental area. |
| `land_area` | String | Land size when available. |
| `square_meter_price` | String | Price per square meter. |
| `broker_name` | String | Broker full name. |
| `broker_agency_name` | String | Agency name. |
| `broker_agency_logo` | String | Agency logo URL. |
| `broker_thumbnail` | String | Broker image URL. |
| `lat` | Number | Latitude coordinate. |
| `lon` | Number | Longitude coordinate. |
| `housing_form_symbol` | String | Housing form code, such as `APARTMENT`. |
| `housing_form_name` | String | Housing form label, such as `Lägenhet`. |
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

## How to use Hemnet.se Scraper

1. Open the Actor on Apify Store.
2. Add a Hemnet URL in `startUrl`, or leave it empty and use `keyword` or `location`.
3. Optionally set `sort`, `results_wanted`, and `max_pages`.
4. Leave Apify Proxy enabled for reliable access, or adjust `proxyConfiguration` if needed.
5. Run the Actor and review the dataset preview.
6. Download the results or connect the dataset to your workflow.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | `https://www.hemnet.se/till-salu` | Hemnet for-sale URL, including pre-filtered search URLs. |
| `keyword` | String | No | Empty | Optional keyword filter applied on top of the start URL. |
| `location` | String | No | Empty | Optional location slug fallback when the URL has no filters. |
| `sort` | String | No | `NEWEST` | Sort mode for listings. |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to save. Minimum is `1`. |
| `max_pages` | Integer | No | `10` | Safety cap on the number of result pages to process. Minimum is `1`. |
| `proxyConfiguration` | Object | No | Apify Proxy enabled | Apify Proxy for request routing. Residential proxy can be selected for heavier or recurring runs. |

## Output Data

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique listing ID. |
| `url` | String | Direct listing URL. |
| `street_address` | String | Property street address. |
| `location_description` | String | Area and municipality text. |
| `asking_price` | String | Listing asking price. |
| `fee` | String | Monthly fee when available. |
| `rooms` | String | Room count text. |
| `living_and_supplemental_areas` | String | Living and supplemental area. |
| `land_area` | String | Land size when available. |
| `square_meter_price` | String | Price per square meter. |
| `broker_name` | String | Broker full name. |
| `broker_agency_name` | String | Agency name. |
| `lat` | Number | Latitude coordinate. |
| `lon` | Number | Longitude coordinate. |
| `housing_form_name` | String | Housing form label. |
| `labels` | Array | Listing labels and tags. |
| `showings` | Array | Showing schedule values. |
| `thumbnails` | Array | Listing image URLs. |
| `record_type` | String | Listing record type. |
| `published_at_iso` | String | Publication timestamp in ISO format. |

## Usage Examples

### Basic Extraction

Collect the newest listings from the national for-sale page:

```json
{
  "startUrl": "https://www.hemnet.se/till-salu",
  "sort": "NEWEST",
  "results_wanted": 20
}
```

### Filtered Search URL

Use a Hemnet URL that already includes location and property filters:

```json
{
  "startUrl": "https://www.hemnet.se/till-salu?location_ids%5B%5D=17744&housing_form_groups%5B%5D=apartments",
  "sort": "HIGHEST_PRICE",
  "results_wanted": 50,
  "max_pages": 5
}
```

### Keyword Search

Search by keyword when you do not have a prepared URL:

```json
{
  "keyword": "villa",
  "sort": "NEWEST",
  "results_wanted": 50,
  "max_pages": 5
}
```

### Larger Scheduled Collection

Use higher limits and residential proxy routing for a larger recurring snapshot:

```json
{
  "startUrl": "https://www.hemnet.se/till-salu",
  "sort": "NEWEST",
  "results_wanted": 500,
  "max_pages": 20,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

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
  "showings": ["Mån 19 okt kl 17:30"],
  "thumbnails": [
    "https://bilder.hemnet.se/images/itemgallery_cut/example.jpg"
  ],
  "record_type": "COMMON",
  "published_at_iso": "2026-03-06T10:31:49.000Z"
}
```

## Tips for Best Results

- **Use a real search URL** - Start from a Hemnet URL that already matches your area or property preferences to reduce filtering work later.
- **Test with a small limit** - Run `results_wanted: 20` first to confirm the search and fields before scaling up.
- **Align limits with pages** - A higher `results_wanted` may need a higher `max_pages` value to reach the target count.
- **Keep Apify Proxy enabled** - Hemnet restricts direct cloud network access, so proxy routing keeps runs reliable. Residential proxy can help heavier or recurring runs.
- **Schedule consistent inputs** - Reuse the same URL, sort, and limits so later runs remain comparable.
- **Expect optional fields** - Fee, land area, project ID, and some media values can be missing when a listing does not publish them.

## Integrations

- **Google Sheets** - Build shareable Swedish property trackers.
- **Airtable** - Organize and filter property pipelines.
- **Make** - Automate enrichment and notifications.
- **Zapier** - Trigger workflows from new dataset items.
- **Webhooks** - Send results into custom systems.
- **Apify API** - Access datasets programmatically from your own applications.

### Export Formats

- **JSON** - Best for APIs and engineering workflows.
- **CSV** - Best for spreadsheet analysis.
- **Excel** - Best for business reporting.
- **XML** - Best for legacy integrations.

## Frequently Asked Questions

### How many listings can I collect?

You can collect large batches. The practical limit depends on your `results_wanted` and `max_pages` settings and on the number of listings available for your search.

### Can I collect from a filtered Hemnet page?

Yes. Use a Hemnet URL that already includes your location, property type, price, and sorting filters.

### Can I search by keyword instead of a URL?

Yes. Leave `startUrl` empty and provide `keyword` to run a keyword search across the for-sale listings.

### What if some fields are missing?

Some listings do not publish optional information such as fee, land area, or project ID. Missing values are returned as `null` or empty arrays.

### Does the Actor support pagination?

Yes. The Actor follows result pages until `results_wanted` or `max_pages` is reached.

### Can I run this Actor on a schedule?

Yes. Create an Apify schedule to refresh Swedish property data hourly, daily, or weekly.

### Can I export Hemnet data to CSV or Excel?

Yes. Apify datasets can be downloaded as CSV, Excel, JSON, XML, and other supported formats.

### Is it legal to collect Hemnet.se data?

You are responsible for complying with Hemnet's terms, applicable laws, and privacy requirements. Collect and use public listing data only for legitimate purposes.

## Related Actors

For other real estate datasets from the same developer, see:

- [Rightmove Property Scraper](https://apify.com/shahidirfan/rightmove-property-scraper) - Collect UK sale and rental property listings from Rightmove.
- [Kyero Property Scraper](https://apify.com/shahidirfan/kyero-property-scraper) - Gather European property listings from Kyero.com.
- [Propertyfinder Scraper](https://apify.com/shahidirfan/propertyfinder-scraper) - Extract UAE property listings, prices, and agent details from PropertyFinder.ae.
- [Housing.com Property Scraper](https://apify.com/shahidirfan/housing-com-property-scraper) - Collect Indian property listings and details from Housing.com.

## Support

For issues or feature requests, use the Issues tab on the Actor page or contact the developer through Apify.

## Legal Notice

This Actor is intended for legitimate collection of publicly available property information. Users are responsible for complying with Hemnet's terms of service, applicable laws, privacy rules, and any restrictions that apply to their intended use.
