# Shoppable Image EDS Block

This document describes the plan for building an IKEA-style shoppable image as an Edge Delivery Services block that boots a web component for the interactive hotspot experience. The frontend is responsible for rendering and interaction, AEM Content Fragments own scene and hotspot metadata, and AEM with Dynamic Media manages responsive image delivery, crop variants, and focal-point-aware renditions.

## Goal

- Reproduce the IKEA-style shoppable image pattern with visible hotspots and compact product teaser cards.
- Support hover and focus preview cards on desktop plus tap interactions on touch devices.
- Support multiple crops, aspect ratios, and focal points through Dynamic Media without forcing the frontend to guess hotspot placement.

## Architecture Overview

- The EDS block provides the block contract and page-level integration.
- The block reads authored scene data and initializes a custom element such as `shoppable-image`.
- The web component owns rendering, interaction state, filtering, responsive behavior, and preview-card positioning.
- AEM Content Fragments provide authored metadata for scenes, hotspots, and optional editorial enrichment.
- Dynamic Media provides image URLs for responsive variants and crop-aware delivery.
- Commerce or product services provide live product facts such as price, stock, and canonical product URLs.

## Scope

In scope:

- EDS block contract and progressive-enhancement markup
- Custom element behavior and rendering
- Content model and frontend payload contract
- Responsive image strategy with Dynamic Media variants
- Hotspot interactions, filtering, and accessibility behavior
- Crop-aware coordinates across multiple aspect ratios

Out of scope:

- Backend commerce implementation
- Full authoring UI implementation
- Detailed AEM workflow configuration beyond the metadata contract

## User Experience

- All hotspots are visible by default so users retain spatial context.
- Only one hotspot is active at a time.
- Hover or keyboard focus opens a compact teaser card with product name, type, price, and a CTA affordance.
- Tap toggles teaser cards on touch devices.
- Optional filter controls dim or hide non-matching hotspots.
- A non-visual list fallback remains available for accessibility and no-JavaScript resilience.

## EDS Block Design

- Implement the feature as a standard EDS block that can consume either authored JSON or server-rendered block markup derived from Content Fragment data.
- The block should progressively enhance instead of requiring JavaScript for the base image and hotspot list content.
- The block script is responsible for mapping authored data into the component input contract and instantiating the custom element.
- The block should keep its responsibilities thin: normalize data, mount the component, and expose fallback markup.

## Web Component Design

The custom element owns:

- current variant selection
- active hotspot selection
- filter state
- keyboard, pointer, hover, and touch interaction
- teaser-card placement logic
- hotspot rendering and responsive updates

Implementation expectations:

- Render semantic HTML inside the component.
- Expose configuration through a single JSON payload property or equivalent normalized data input.
- Avoid framework assumptions so the component can live comfortably inside an EDS block.
- Preserve accessible relationships between hotspots, preview cards, and any fallback list representation.

## Data Model

### `ShoppableScene`

- `id`
- `title`
- `subtitle`
- `altText`
- `sceneTags`
- `imageVariants`
- `hotspots`

### `Hotspot`

- `id`
- `sku`
- `previewPlacement`
- `priority`
- `filterTags`
- `labelOverride`
- `variantCoordinates`

Optional editorial enrichment may be added only where needed, but live commerce data such as price and stock should be resolved externally by SKU.

## Dynamic Media Strategy

- Store a single master asset in AEM/DAM.
- Use Dynamic Media to deliver responsive renditions for named variants such as `portrait`, `square`, `landscape`, and `hero`.
- Each variant may define:
  - an explicit crop definition
  - focal point metadata
  - a Dynamic Media delivery URL
  - target width and height metadata
- The frontend should render variants through `picture` or an equivalent responsive source selection pattern.
- Dynamic Media controls image composition, while the component consumes variant metadata already resolved for delivery.

## Crop and Coordinate Strategy

Crop-aware behavior is a first-class requirement.

- Hotspots should default to variant-specific coordinates rather than master-image coordinate transformation.
- Each hotspot stores coordinates for every supported variant.
- Focal points inform image composition, but hotspot placement remains explicit per variant.
- If a variant coordinate is missing for a hotspot, the hotspot is hidden for that variant instead of being guessed.
- This keeps the implementation predictable and avoids drift between crops, focal points, and teaser-card placement.

## Rendering Contract

The following interfaces are proposed for implementation planning. They are not existing repo code.

```json
{
  "scene": {
    "id": "bedroom-storage-look-01",
    "title": "Bedroom storage look",
    "subtitle": "A compact room scene with visible hotspots",
    "altText": "Bedroom scene with wardrobe, dresser and bed",
    "sceneTags": ["bedroom", "storage", "modern"],
    "variants": [
      {
        "name": "portrait",
        "aspectRatio": "4:5",
        "dmUrl": "https://delivery.example/portrait",
        "width": 1200,
        "height": 1500,
        "cropMode": "crop",
        "focalPoint": {
          "x": 0.58,
          "y": 0.44
        }
      },
      {
        "name": "landscape",
        "aspectRatio": "16:9",
        "dmUrl": "https://delivery.example/landscape",
        "width": 1600,
        "height": 900,
        "cropMode": "smartcrop",
        "focalPoint": {
          "x": 0.58,
          "y": 0.44
        }
      }
    ],
    "hotspots": [
      {
        "id": "mirror-01",
        "sku": "20458615",
        "previewPlacement": "left",
        "priority": 20,
        "filterTags": ["mirror", "decor"],
        "labelOverride": "LINDBYN",
        "variantCoordinates": [
          {
            "variantName": "portrait",
            "xPercent": 34.9,
            "yPercent": 29.1
          },
          {
            "variantName": "landscape",
            "xPercent": 28.4,
            "yPercent": 35.2
          }
        ]
      }
    ]
  },
  "filters": [
    { "id": "all", "label": "All" },
    { "id": "decor", "label": "Decor" },
    { "id": "storage", "label": "Storage" }
  ]
}
```

### `scene`

- `id`
- `title`
- `subtitle`
- `altText`
- `sceneTags[]`
- `variants[]`
- `hotspots[]`

### `variant`

- `name`
- `aspectRatio`
- `dmUrl`
- `width`
- `height`
- `cropMode`
- `focalPoint`

### `hotspot`

- `id`
- `sku`
- `previewPlacement`
- `priority`
- `filterTags[]`
- `labelOverride`
- `variantCoordinates[]`

### `variantCoordinate`

- `variantName`
- `xPercent`
- `yPercent`

Variant-specific coordinates are the default implementation choice.

## Authoring Plan

- Authors manage scene and hotspot metadata in Content Fragments.
- Authors choose supported Dynamic Media variants for each scene.
- Authors define hotspot positions per variant rather than once against the master image.
- Authors may override teaser-card placement and apply filter tags for presentation-tier filtering.
- Optional enrichment fields can add editorial labels or merchandising copy without replacing live commerce truth.

## Implementation Plan

### Phase 1: Define models and payload contract

- Define the Content Fragment model structure for `ShoppableScene` and `Hotspot`.
- Define the EDS block to web component handoff payload.
- Confirm how live product data is resolved by SKU.

### Phase 2: Build the EDS block scaffold

- Create the block markup contract and fallback structure.
- Normalize authored data into the runtime payload.
- Mount the custom element with progressive enhancement.

### Phase 3: Build the web component

- Render the active image variant and hotspot markers.
- Implement hover, focus, touch, and keyboard interactions.
- Implement teaser-card display and active hotspot state.

### Phase 4: Integrate Dynamic Media variants

- Add responsive source selection for named variants.
- Switch hotspot coordinates when the active variant changes.
- Validate focal-point-aware delivery and crop behavior.

### Phase 5: Add filtering and accessibility

- Add optional filter controls and hotspot dimming/hiding rules.
- Add accessible list fallback and keyboard traversal.
- Confirm screen reader labels and focus handling for teaser cards and hotspots.

### Phase 6: Validate with authored content

- Test against real Content Fragment payloads and Dynamic Media renditions.
- Confirm behavior across portrait, square, landscape, and hero variants.
- Confirm that missing variant coordinates safely hide the hotspot for that variant.

## Assumptions

- The component is delivered as an EDS block with a custom element enhancement.
- Metadata is owned by AEM Content Fragments.
- Dynamic Media owns image rendition delivery.
- Commerce services own live product facts such as price and availability.
- The variant-specific coordinate approach is preferred over runtime coordinate transformation.
