# Content Fragment HTML Preview Repository

This repository stores inputs and outputs for the `cf-html-preview` skill used to build Handlebars-based HTML previews for AEM Content Fragments.

## What the skill does

The skill (`.claude/skills/cf-html-preview/SKILL.md`) is designed to:

- Discover Content Fragment models from a target AEM environment.
- Fetch a model schema for a selected model.
- Normalize schema fields into a `field-map.json` that is easy to template against.
- Produce HTML preview templates that render fragment fields with Handlebars.

The helper script is:

- `.claude/skills/cf-html-preview/scripts/fetch-model-schema.sh`

It writes model metadata into the `src/<tenant>/<model>/` layout used by this repo.

## Repository structure

```text
src/
  demo/
    models.json
    offer/
      model-id.txt
      model-path.txt
      schema.json
      field-map.json
      cf-preview-template.html
```

## Data and metadata files

For each tenant/model, these files describe the model used by the template:

- `models.json`: full model listing captured from the tenant environment.
- `schema.json`: schema/details for the selected model.
- `field-map.json`: normalized fields (`name`, `type`, `multi`, `required`, reference hints) for template authoring.
- `model-id.txt`: selected model id (for example `demo/offer`).
- `model-path.txt`: selected model path (for example `demo/offer`).

## HTML outputs

The key HTML output in this repo is:

1. `src/demo/offer/cf-preview-template.html`

The template renders the offer model fields:

- `title`
- `description`
- `ctaText`
- `ctaLink`
- `image`

### Output behavior

- Uses Handlebars with triple braces for field rendering, for example `{{{fields.title}}}`.
- Conditionally renders optional sections (`image`, `description`, CTA).
- Includes an AEM publish JSON metadata link in `<head>` when fragment id context is available.
- Produces semantic teaser markup (`article`, media section, body, CTA).

### Template variants

- This repository currently includes a single demo template: `cf-preview-template.html`.

## Notes

- This repository currently tracks model outputs for a demo tenant example (`demo`).
- Additional model templates should follow the same tenant/model folder convention under `src/`.
- There is an [experimental api](https://developer.adobe.com/experience-cloud/experience-manager-apis/api/experimental/sites/cvt/) to allow html templates to be managed


## Ideas / Improvements
- Create a matching dynamic media template, match the fields, inject the CF field values into the DM template params for an image visualisation of a fragment
