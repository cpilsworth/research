# OpenAPI Workflow: Model Discovery to Template Fields

Use this workflow to derive valid Handlebars field usage from the target AEM environment.

## 1) Discover models (`getModels`)

Endpoint doc:
`https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/contentfragments/delivery/#operation/models/getModels`

Goal:
- List available content models in the target environment.
- Select one model by stable identifier (prefer id/path over display-only labels).

Record:
- Environment base URL
- Publish base URL derived from environment:
  - Replace host prefix `author-` with `publish-`
  - Example: `https://author-p31359-e1338271.adobeaemcloud.com` -> `https://publish-p31359-e1338271.adobeaemcloud.com`
- Chosen model id/path/name
- Any namespace/space information required by your environment

## 2) Fetch model schema (`getModelSchema`)

Endpoint doc:
`https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/contentfragments/delivery/#operation/models/getModelSchema`

Goal:
- Retrieve property definitions for the chosen model.
- Build a field map used directly by template generation.

Extract at minimum per property:
- `name` (technical field key)
- `type`
- `multi` / array semantics
- reference target behavior (content fragment ref vs asset ref)
- required/optional status

## 3) Build a template field map

Create a local mapping table before writing HTML:

- Text-like single value: `{{{fields.<name>}}}`
- Text-like multi value: `{{#each fields.<name>}}...{{/each}}`
- Reference single value: `{{{fields.<name>.<nestedField>}}}`
- Reference multi value: `{{#each fields.<name>}}...{{/each}}`
- Asset single value: `{{{fields.<name>}}}` or `{{{asset fields.<name> class="..."}}}`
- Asset multi value: `{{#each fields.<name>}}...{{/each}}`

If an array item needs direct indexing, use `.[0]` form:
- `{{{fields.tags.[0]}}}`

Persist outputs using the standard layout:
- Tenant-level output: `src/{tenantName}/models.json`
- Model-level output: `src/{tenantName}/{modelName}/model-id.txt`
- Model-level output: `src/{tenantName}/{modelName}/model-path.txt`
- Model-level output: `src/{tenantName}/{modelName}/schema.json`
- Model-level output: `src/{tenantName}/{modelName}/field-map.json`
- Model-level output: HTML template file(s), for example `src/{tenantName}/{modelName}/cf-preview-template.html`

## 4) Decide hydration depth for references

Set preview hydration based on deepest nested reference path used by the template.

- Depth 1: direct references
- Depth 2+: nested references within references

Example pattern:
- `?hydration={"enabled":true,"maxDepth":2}` (URL encode for real requests)

## 5) Generate template and validate against schema

Before finalizing, verify:
- Every `fields.<name>` in template exists in the model schema.
- Multi-valued schema fields are iterated (`#each`) unless intentional index access is used.
- Optional fields are guarded with `#if`.
- Asset and helper output uses triple braces.
- Template `<head>` includes JSON metadata link using full publish domain:
  - `<link rel="alternate" type="application/json" href="https://publish-<env>/adobe/contentFragments/{CF_ID}?references=all-hydrated">`

## 6) Debug mismatch quickly

If output is empty or wrong:
- Re-check selected model id/path.
- Re-fetch schema and confirm field technical names.
- Add temporary diagnostics:

```handlebars
{{#if hasFields}}
  {{#each allFields}}
    <p><strong>{{name}}</strong>: {{{value}}}</p>
  {{/each}}
{{/if}}
```

Remove diagnostics after confirming field mappings.
