# Personalised Hotel Search Criteria

> Model browsing behaviours as XDM experience events, derive a small set of
> activation-friendly profile attributes, then let AJO or Target assemble a
> personalised hotel-search URL or API payload from those fields.

## Problem

A hotel search site captures rich browsing signals — party size, star rating selections,
amenity clicks, destination and resort affinity — but today's search results are the same
for every visitor. There is no mechanism to carry those signals forward into a
pre-populated or re-ranked search experience on the next visit, in a follow-up email, or
in a personalised CTA on the homepage.

The challenge is not data collection — XDM events can capture the behaviours. The
challenge is operationalising those signals into activation-friendly attributes that AJO
journeys, Target activities, and search API calls can consume without encoding every
business rule in the front end.

## Solution

- **Capture raw behaviours as XDM events** — `travel.hotelSearch` events carrying
  `destination`, `resortId`, `adults`, `children`, `selectedStarRating`, `clickedAmenity`.
- **Derive stable profile attributes in AEP** using computed attributes or segment rules —
  one-time derivation that AJO and Target can read without re-computing per request.
- **Promote flat scalar attributes for edge activation** — Target's edge personalization
  supports up to 30 single-value attributes per sandbox; arrays and nested objects are not
  supported on that path.
- **Use AJO for cross-channel orchestration** (email/push/SMS deep links, abandon-browse
  journeys) and **Target for same-page / next-hit on-site CTA updates**.
- **Keep CJA as analysis, not activation** — use CJA to discover which signals predict
  conversion, then operationalise those signals in AEP/AJO/Target. CJA should not compute
  the final URL.
- **Treat the search criteria as a first-class model** (see below) that decouples visitor
  intent from today's API query-string encoding, allowing the API contract to evolve
  independently.

---

## Canonical search criteria model

A reusable intent object, even if the current API only supports part of it:

```json
{
  "destination": "Algarve",
  "area": "Algarve",
  "resortIds": ["573"],
  "party": {
    "adults": 2,
    "children": 2,
    "partySize": 4,
    "partyType": "family"
  },
  "stayStyle": {
    "premiumIntent": true,
    "preferredStarRating": 5,
    "budgetBand": "premium"
  },
  "room": {
    "needsFamilyRoom": true,
    "preferredRoomType": "family-suite",
    "roomTypeIds": ["19"]
  },
  "amenities": {
    "primaryAmenityInterest": "pool",
    "amenityPoolRequired": true
  },
  "ranking": {
    "rankingMode": "family_premium_pool",
    "sort": "recommended"
  }
}
```

This separates *what the visitor signal means* from *how today's API happens to encode it*.

---

## Signal → attribute → search criteria mapping

| Signal seen in browsing | Derived meaning | Profile attribute(s) | Search criteria |
|---|---|---|---|
| `2 adults + 2 children` selected | Family trip | `travelPartyType=family`, `adultCount=2`, `childCount=2` | `adults=2`, `children=2`, `familyFriendly=true` |
| `5*` selected | Premium intent | `preferredStarRating=5`, `premiumIntent=true` | `starRatings=5` |
| Pool image clicked | Pool matters | `primaryAmenityInterest=pool` | `pool=true`, ranking boost |
| Repeated Algarve searches | Destination affinity | `preferredArea=Algarve` | `areas=Algarve` |
| Repeated resort `573` clicks | Resort preference | `preferredResortId=573` | `resorts=573` |
| Child-friendly filter applied | Family facilities matter | `familyFacilitiesImportance=high` | `kidsClub=true`, `childPool=true` |
| Pool + beach + spa clicks | Amenity cluster | `primaryAmenityInterest=pool`, `secondaryAmenityInterest=beach` | `pool=true`, `nearBeach=true`, `spa=true` |
| All-inclusive browsing | Convenience intent | `boardBasisPreference=all_inclusive` | `boardBasis=AI` |

### Attribute layers

Use three layers so downstream consumers can pick the right level of detail:

1. **Raw facts** — `adultCount=2`, `childCount=2`, `selectedStarRating=5`
2. **Stable derived attributes** — `travelPartyType=family`, `premiumIntent=true`, `primaryAmenityInterest=pool`
3. **Execution attributes** — `rankingMode=family_premium_pool`, `searchTemplate=family-luxury-pool`

---

## XDM / profile attribute model

### Event schema (`travel.hotelSearch`)

```json
{
  "eventType": "travel.hotelSearch",
  "travel": {
    "destination": "Algarve",
    "resortId": "573",
    "adults": 2,
    "children": 2,
    "selectedStarRating": 5,
    "clickedAmenity": "pool"
  }
}
```

### Derived profile attributes

```json
{
  "travelPartyType": "family",
  "adultCount": 2,
  "childCount": 2,
  "partySize": 4,
  "preferredArea": "Algarve",
  "preferredResortId": "573",
  "preferredStarRating": 5,
  "premiumIntent": true,
  "primaryAmenityInterest": "pool",
  "rankingMode": "family_premium_pool"
}
```

---

## Example search URLs

### URL template (profile attributes → query string)

How derived profile attributes map to URL parameters:

```text
/api/j2/hotels/getcachedhotels
  ?hotelOrder=1
  &page=0
  &pageSize=10
  &areas={preferredArea}
  &resorts={preferredResortId}
  &starRatings={preferredStarRating}
  &adults={adultCount}
  &children={childCount}
  &pool={primaryAmenityInterest == "pool"}
  &familyFriendly={travelPartyType == "family"}
```

### A. Minimal — current API parameters only

Built from area affinity, resort affinity, star preference, and room type — the subset
the current API already understands:

```text
https://j2api.cpilsworth.workers.dev/api/j2/hotels/getcachedhotels
  ?hotelOrder=1&page=0&pageSize=10
  &starRatings=5&areas=Algarve&roomTypeIds=19&resorts=573
```

### B. Near-term — add party and amenity params

Adds party counts and key boolean filters; API changes required are additive and low-risk:

```text
https://j2api.cpilsworth.workers.dev/api/j2/hotels/getcachedhotels
  ?hotelOrder=1&page=0&pageSize=10
  &areas=Algarve&resorts=573&starRatings=5
  &adults=2&children=2&familyFriendly=true&pool=true&roomTypeIds=19
```

### C. Long-term — API accepts intent and ranking hints

The API receives intent signals and owns the business logic for translating them into
filters, boosts, and room-type selection:

```text
https://j2api.cpilsworth.workers.dev/api/j2/hotels/getcachedhotels
  ?hotelOrder=1&page=0&pageSize=10
  &areas=Algarve&resorts=573&adults=2&children=2
  &preferredStarRating=5&primaryAmenityInterest=pool
  &rankingMode=family_premium_pool
```

Version C moves business logic server-side: the API decides which room types count as
"family", how strongly pool should influence ranking, and whether a 4* hotel with
excellent family facilities should outrank a mediocre 5* hotel.

---

## AJO vs Target decision guide

| Need | Better fit |
|---|---|
| Same-page / next-hit web CTA update | **Target** |
| Email / push / SMS deep link | **AJO** |
| Cross-channel abandon-browse follow-up | **AJO** |
| On-site immediate refinement from live browsing | **Target** |
| Recommendation/ranking across a large hotel catalog | **AJO Decisioning or a dedicated reco service** |

### AJO pattern

Journey triggered by `hotelSearchUpdated` event. Reads profile attributes, builds a
personalised CTA link and sends via email, push, or web surface:

```
Event: hotelSearchUpdated
  → read: preferredArea, preferredStarRating, travelPartyType,
           adultCount, childCount, primaryAmenityInterest, preferredResortId
  → content: "See your best family hotels in Algarve →"
  → link: /getcachedhotels?areas=Algarve&starRatings=5&adults=2&children=2&pool=true
```

### Target edge pattern

Target activity swaps a CTA href using RTCDP profile attributes. Attributes must be
**flat scalar values** — arrays and nested objects are not supported on the edge
personalization path (30-attribute limit per sandbox).

---

## Considerations

- **Target edge attribute limits**: max 30 single-value attributes per sandbox for
  same-page / next-page personalization. Arrays and maps are not supported. Flatten
  `amenitiesViewed=["pool","spa"]` to `primaryAmenityInterest=pool` +
  `secondaryAmenityInterest=spa`.
- **CJA is analysis, not activation**: use CJA to find which signals predict conversion
  (family party size, premium intent, amenity clicks), then promote those findings into
  AEP profile attributes. Do not route CJA output directly into search URL construction.
- **Recommended API evolution order**: start with tier-1 obvious params (`adults`,
  `children`, `familyFriendly`, `pool`, `preferredStarRating`), then add `rankingMode`
  to move business logic server-side, then evolve toward a full decisioning/reco service.
- **End state is decisioning, not URL-building**: the mature pattern is returning a ranked
  set of hotels for a visitor's intent profile, not assembling a query string. Adobe
  Decisioning / behavioral recommendation blueprints cover this.

## Findings

- The core architecture — XDM events → computed profile attributes → AJO/Target
  activation → personalised search URL — maps cleanly onto existing AEP/AJO primitives
  without custom infrastructure.
- Three-layer attribute design (raw facts / stable derived / execution) is the right
  separation: it prevents front-end business logic accumulation and lets the API evolve
  independently of the personalization layer.
- Target edge personalization's flat scalar constraint is the binding practical limit;
  designing attributes to be flat from the start avoids a painful retrofit later.
- Abandonment journeys in AJO (email/push with pre-built search deep link) are a strong
  near-term win before any API changes are needed — they only require the profile
  attributes, not API evolution.

---

*Captured: 2026-06-05*
