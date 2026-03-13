---
name: cf-html-preview
description: Generate and refine Handlebars-based HTML templates for AEM Content Fragment preview rendering. Use when asked to create, update, debug, or optimize CF preview templates, including nested fragment fields, multi-valued fields, and asset/text helper usage.
---

# CF HTML Preview Skill

Create production-ready HTML templates for AEM Content Fragment preview using Handlebars.

Use model metadata from the target AEM environment before generating template markup.

## Workflow

1. Identify target environment and model scope.
- Confirm AEM environment base URL (for example `https://author-p31359-e1338271.adobeaemcloud.com`).
- Confirm auth details needed to call the Delivery OpenAPI endpoints.
- Confirm target model identifier (name/path/id) or list available models first.

2. Fetch model definitions from OpenAPI.
- Call `getModels` for the specific environment to discover available models:
  - `https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/contentfragments/delivery/#operation/models/getModels`
- Select the exact model to template.
- Call `getModelSchema` to fetch that model's field schema:
  - `https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/contentfragments/delivery/#operation/models/getModelSchema`
- Build a working field map from schema properties (field name, type, multi-value flag, reference/asset behavior).
- Prefer the bundled helper to fetch and normalize model metadata:
  - `scripts/fetch-model-schema.sh --base-url <env-url> --auth-header "Authorization: Bearer <token>" --tenant-name <tenantName> --model-id <id>`
  - Use `--model-name` when id is unknown.
  - Use `--model-dir-name` to override the model folder name.
  - Use `--models-url` / `--schema-url-template` when environment-specific endpoints differ.
  - Default output layout:
    - Tenant-level: `src/{tenantName}/models.json`
    - Model-level: `src/{tenantName}/{modelName}/model-id.txt`
    - Model-level: `src/{tenantName}/{modelName}/model-path.txt`
    - Model-level: `src/{tenantName}/{modelName}/schema.json`
    - Model-level: `src/{tenantName}/{modelName}/field-map.json`
    - Model-level HTML template output should be written in the same model folder.

3. Identify template intent and data shape.
- Ask for model field names if missing.
- Determine whether content includes nested references, multi-valued fields, and assets.
- Decide required hydration depth for nested references.

4. Build from safe defaults.
- Start with semantic HTML skeleton (`<!DOCTYPE html>`, `head`, `body`).
- Render field values with triple braces: `{{{fields.fieldName}}}`.
- Guard optional values with `{{#if ...}}`.
- Use `{{#each ...}}` for arrays and multi-valued references.

5. Handle references and depth correctly.
- Access nested references with dot notation (for example `fields.author.organization.name`).
- For array indexing, use `.[0]` form (for example `fields.tags.[0]`).
- Include/confirm hydration when nested data is required:
  - `maxDepth=1`: direct references
  - `maxDepth=2+`: deeper chains

6. Use helpers when attribute control is needed.
- Use direct output when default rendered HTML is acceptable: `{{{fields.heroImage}}}`.
- Use `asset` helper to add classes/attributes to image output.
- Use `text` helper to wrap styled text spans.
- Keep helper calls in triple braces.

7. Add resilience and debug affordances.
- Include fallbacks for missing title/description/content.
- Surface reference-load failures when useful (`referencesError`, `referencesErrorMessage`).
- If debugging unknown data, render a temporary table with `allFields`.
- Include a JSON metadata link to the fragment representation when fragment id is available:
  - Use a relative path: `/adobe/contentFragments/{{properties.id}}?references=all-hydrated`
  - Place it in `<head>` as `<link rel="alternate" type="application/json">`.
  - Relative paths resolve against the current origin, so the template works across any AEM instance without code changes.

## Output Rules

- Always use triple braces for field values and helper output.
- Use double braces for metadata/booleans/field names (`{{main_cf_title}}`, `{{hasFields}}`, `{{name}}`).
- Prefer direct `fields.*` access over iterating `allFields` when field names are known.
- Use schema-derived field names and types from `getModelSchema` as source of truth.
- Include `<link rel="alternate" type="application/json" ...>` in `<head>` using full publish domain.
- Keep markup semantic and minimal.

## Quick Patterns

```handlebars
<h1>{{{fields.title}}}</h1>

{{#if fields.author}}
  <p>By {{{fields.author.name}}}</p>
{{/if}}

{{#each fields.tags}}
  <span class="tag">{{{this}}}</span>
{{/each}}

{{{asset fields.heroImage class="hero-image" loading="lazy"}}}
{{{text fields.category class="category-badge"}}}

{{#if properties.id}}
  <link rel="alternate" type="application/json" href="/adobe/contentFragments/{{properties.id}}?references=all-hydrated">
{{/if}}
```

## Validation Checklist

- `getModels` and `getModelSchema` were called for the target environment.
- Template fields align with schema property names and data types.
- Template renders with fully populated content.
- Template renders with optional fields missing.
- Multi-valued fields are iterated, not stringified.
- Nested references resolve at expected hydration depth.
- Asset fields render as HTML (not escaped text).
- `<head>` contains a relative JSON metadata link with `?references=all-hydrated`.
- No unclosed Handlebars blocks.

## Reference

Use `references/cf-html-preview-guide.md` for full context object details, advanced examples, troubleshooting, and helper behavior.
Use `references/openapi-workflow.md` for a concrete `getModels` + `getModelSchema` workflow and schema-to-template mapping rules.
Use `scripts/fetch-model-schema.sh` to fetch tenant-level `models.json` and model-level metadata (`model-id.txt`, `model-path.txt`, `schema.json`, `field-map.json`) in `src/{tenantName}/{modelName}`.
