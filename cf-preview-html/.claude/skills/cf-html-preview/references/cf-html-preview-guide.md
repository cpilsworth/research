Content Fragment Template Authoring Guide

================================================================================

TABLE OF CONTENTS

1. Introduction
2. Getting Started with Handlebars
3. Template Context Reference
4. Basic Field Access
5. Nested Content Fragments
6. Multi-Valued Fields
7. Loops and Iteration
8. Conditional Rendering
9. Built-in Handlebars Helpers
10. Advanced Patterns
11. Complete Examples
12. Best Practices
13. Troubleshooting
14. Working with Assets
15. Custom Template Helpers (asset, text)

================================================================================

INTRODUCTION

This guide explains how to create custom Handlebars templates for rendering AEM Content Fragments. Templates allow you to control exactly how your content fragments are displayed in preview mode.

What You'll Learn

• Handlebars syntax basics
• How to access content fragment data
• Working with nested content fragments
• Handling multi-valued fields
• Creating loops and conditional logic
• Best practices for template design

Prerequisites

• Basic understanding of HTML
• Familiarity with AEM Content Fragments
• Understanding of your content fragment models

================================================================================

GETTING STARTED WITH HANDLEBARS

Handlebars is a simple templating language that uses double curly braces {{ }} to insert dynamic content into HTML.

Basic Syntax

<!-- Output a variable (HTML-escaped) -->
{{variableName}}

<!-- Output raw HTML (unescaped) -->
{{{htmlContent}}}

<!-- Comment (not rendered) -->
{{! This is a comment }}

Key Concepts

Double Braces {{ }}: Escapes HTML special characters

Example:
{{title}}
<!-- If title = "<script>alert('XSS')</script>" -->
<!-- Output: &lt;script&gt;alert('XSS')&lt;/script&gt; -->

Triple Braces {{{ }}}: Outputs raw HTML (use for pre-rendered field values)

Example:
{{{fields.description}}}
<!-- If description contains <p>Hello</p> -->
<!-- Output: <p>Hello</p> (rendered as HTML) -->

⚠️ IMPORTANT: Use triple braces {{{ }}} for all field values since they contain pre-rendered HTML.

================================================================================

TEMPLATE CONTEXT REFERENCE

When your template is rendered, it receives a context object containing all the data about your content fragment.

---

## Main Content Fragment

| Variable   | Type    | Description                                          |
| ---------- | ------- | ---------------------------------------------------- |
| properties | Map     | Fragment metadata (see [Properties structure] below) |
| fields     | Map     | Direct access to field values by name                |
| allFields  | List    | Array of `{name, value}` objects for iteration       |
| hasFields  | Boolean | True if the fragment has fields                      |

---

## Properties structure (main and referenced CFs)

The **properties** object has the same shape for the main fragment and for each referenced fragment.

| Property                 | Type                    | Description                                              | Example                 |
| ------------------------ | ----------------------- | -------------------------------------------------------- | ----------------------- |
| id                       | String                  | UUID of the fragment                                     |                         |
| title                    | String                  | Title of the fragment                                    | "Cycling Southern Utah" |
| description              | String                  | Description of the fragment                              | "An adventure..."       |
| path                     | String                  | JCR path to the fragment                                 | "/content/dam/..."      |
| hasDescription           | Boolean                 | True if description is not blank                         | true                    |
| createdDate              | String                  | ISO-8601 created date                                    |                         |
| modifiedDate             | String                  | ISO-8601 modified date                                   |                         |
| publishedDate            | String                  | ISO-8601 published date                                  |                         |
| status                   | String                  | Content fragment status                                  | e.g. DRAFT              |
| model                    | Map                     | Contains: id, path, name, technicalName, description     |                         |
| validationStatus         | List                    | Each item: `{property, message}`                         |                         |
| previewReplicationStatus | String                  | Preview replication status                               |                         |
| tags                     | List                    | Each item: id, title, titlePath, name, path, description |                         |
| fieldTags                | List                    | Same structure as tags                                   |                         |
     
Template access (main CF): `{{properties.title}}`, `{{properties.description}}`, `{{{ fields.description }}}` for field HTML.

---

## Referenced Content Fragments

| Variable               | Type    | Description                                  |
| ---------------------- | ------- | -------------------------------------------- |
| hasReferencedFragments | Boolean | True if there are referenced fragments       |
| referencedFragments    | List    | Array of referenced fragment objects         |
| referencesError        | Boolean | True if an error occurred loading references |
| referencesErrorMessage | String  | Error message when referencesError is true   |

---

## Referenced fragment structure

Each item in **referencedFragments** contains:

| Property   | Type    | Description                                                |
| ---------- | ------- | ---------------------------------------------------------- |
| anchorId.  | String  | HTML-safe anchor ID (at fragment level; not a CF property) |
| properties | Map     | Fragment metadata (same structure as [above])              |
| hasFields  | Boolean | True if the fragment has fields                            |
| fields     | Map     | Direct access to fields within this fragment               |
| allFields  | List    | Array of `{name, value}` for iteration                     |

Template access (referenced CF): `{{anchorId}}`, `{{properties.title}}`, `{{properties.description}}`, or from the fields map: `{{{ fields.referenced_cf_field.properties.description }}}`.

================================================================================

BASIC FIELD ACCESS

Direct Field Access (Recommended)

Access fields directly by name using the fields map:

<!DOCTYPE html>
<html>
<head>
  <title>{{main_cf_title}}</title>
</head>
<body>
  <article>
    <h1>{{{fields.title}}}</h1>
    <p class="subtitle">{{{fields.subtitle}}}</p>
    <div class="content">
      {{{fields.description}}}
    </div>
    <div class="image">
      {{{fields.primaryImage}}}
    </div>
  </article>
</body>
</html>

Key Points:
• Use triple braces {{{ }}} for field values (they contain HTML)
• Field names must match your content fragment model
• Missing fields render as empty strings (no errors)

Iterating Through All Fields

Use allFields when you don't know field names in advance:

<table>
  <thead>
    <tr>
      <th>Field Name</th>
      <th>Field Value</th>
    </tr>
  </thead>
  <tbody>
    {{#each allFields}}
      <tr>
        <td>{{name}}</td>
        <td>{{{value}}}</td>
      </tr>
    {{/each}}
  </tbody>
</table>

📝 Note: {{name}} uses double braces (plain text), {{{value}}} uses triple braces (HTML).

================================================================================

NESTED CONTENT FRAGMENTS

When a content fragment field references another content fragment, you can access the referenced fragment's fields directly using dot notation.

Single-Level Nesting

<article>
  <h1>{{{fields.title}}}</h1>

  <!-- Access author (a referenced content fragment) -->
  <div class="author-info">
    <h3>Author</h3>
    <p>Name: {{{fields.author.name}}}</p>
    <p>Email: {{{fields.author.email}}}</p>
    <p>Bio: {{{fields.author.bio}}}</p>
  </div>

  <div class="content">
    {{{fields.content}}}
  </div>
</article>

Pattern: fields.referenceFieldName.nestedFieldName

Multi-Level Nesting (Unlimited Depth)

The system supports unlimited nesting depth:

<article>
  <h1>{{{fields.title}}}</h1>

  <div class="author-details">
    <!-- Level 1: Author -->
    <p>Author: {{{fields.author.name}}}</p>

    <!-- Level 2: Author's Organization -->
    <p>Organization: {{{fields.author.organization.name}}}</p>
    <p>Website: {{{fields.author.organization.website}}}</p>

    <!-- Level 3: Organization's Address -->
    <p>Located in: {{{fields.author.organization.address.city}}},
       {{{fields.author.organization.address.country}}}</p>
  </div>

  <div class="content">
    {{{fields.content}}}
  </div>
</article>

Pattern: fields.level1.level2.level3.fieldName (unlimited depth)

API Parameter Requirements

To enable nested content fragment access, you must use the hydration query parameter:

# Enable hydration with depth=2 for 2 levels of nesting
GET /adobe/sites/cf/fragments/{id}/preview?hydration=%7B%22enabled%22%3Atrue%2C%22maxDepth%22%3A2%7D

Hydration Levels:
• maxDepth=1: Main fragment + direct references
• maxDepth=2: Main fragment + direct references + their references
• maxDepth=3+: Continue up to 10 levels deep

================================================================================

MULTI-VALUED FIELDS

Fields can have multiple values (arrays). The system automatically detects and structures these as lists.

Multi-Valued Text Fields

Text, number, date, and other simple fields become arrays when multi-valued:

<article>
  <h1>{{{fields.title}}}</h1>

  <!-- Access individual items by index (use dot before bracket) -->
  <div class="tags">
    <span class="tag">{{{fields.tags.[0]}}}</span>
    <span class="tag">{{{fields.tags.[1]}}}</span>
    <span class="tag">{{{fields.tags.[2]}}}</span>
  </div>

  <!-- Better: Iterate through all tags -->
  <div class="tags">
    {{#each fields.tags}}
      <span class="tag">{{{this}}}</span>
    {{/each}}
  </div>
</article>

⚠️ IMPORTANT: Use .[0] (dot before bracket) not [0] in Handlebars.

Multi-Valued Number Fields

Numbers are converted to strings for rendering:

<div class="pricing">
  <h3>Available Prices:</h3>
  {{#each fields.prices}}
    <span class="price">${{{this}}}</span>
  {{/each}}
</div>

Multi-Valued Content Fragment References

When a field references multiple content fragments:

<article>
  <h1>{{{fields.title}}}</h1>

  <!-- Access by index -->
  <div class="authors">
    <h3>Authors:</h3>
    <ul>
      <li>
        <span class="name">{{{fields.authors.[0].name}}}</span>
        <span class="email">{{{fields.authors.[0].email}}}</span>
      </li>
      <li>
        <span class="name">{{{fields.authors.[1].name}}}</span>
        <span class="email">{{{fields.authors.[1].email}}}</span>
      </li>
    </ul>
  </div>

  <!-- Better: Iterate through all authors -->
  <div class="authors">
    <h3>Authors:</h3>
    {{#each fields.authors}}
      <div class="author">
        <h4>{{{this.name}}}</h4>
        <p>Email: {{{this.email}}}</p>
        {{#if this.bio}}
          <p class="bio">{{{this.bio}}}</p>
        {{/if}}
      </div>
    {{/each}}
  </div>
</article>

Multi-Valued Asset References (Images, etc.)

Asset fields (images, documents) are pre-rendered as HTML. Multi-valued assets become arrays:

<!-- Single asset -->
<div class="hero-image">
  {{{fields.heroImage}}}
</div>

<!-- Multi-valued asset - access by index -->
<div class="gallery">
  <div class="image">{{{fields.gallery.[0]}}}</div>
  <div class="image">{{{fields.gallery.[1]}}}</div>
</div>

<!-- Better: Iterate through all images -->
<div class="gallery">
  {{#each fields.gallery}}
    <div class="image">{{{this}}}</div>
  {{/each}}
</div>

Nested Multi-Valued References

Multi-valued references can contain multi-valued references at any depth:

<article>
  <h1>{{{fields.title}}}</h1>

  <!-- Access nested multi-valued references -->
  <div class="complex-structure">
    {{#each fields.chapters}}
      <div class="chapter">
        <h3>Chapter: {{{this.title}}}</h3>

        <!-- Nested multi-valued authors -->
        <div class="chapter-authors">
          {{#each this.authors}}
            <p>Author: {{{this.name}}}</p>

            <!-- Even deeper: author's publications -->
            {{#each this.publications}}
              <p>Publication: {{{this.title}}}</p>
            {{/each}}
          {{/each}}
        </div>
      </div>
    {{/each}}
  </div>
</article>

================================================================================

LOOPS AND ITERATION

Handlebars provides the {{#each}} helper for iterating over arrays and objects.

Iterating Over Arrays

<!-- Simple array iteration -->
{{#each fields.tags}}
  <span class="tag">{{{this}}}</span>
{{/each}}

<!-- Array of objects -->
{{#each fields.authors}}
  <div class="author">
    <h4>{{{this.name}}}</h4>
    <p>{{{this.email}}}</p>
  </div>
{{/each}}

Iterating Over All Fields

<dl>
  {{#each allFields}}
    <dt>{{name}}</dt>
    <dd>{{{value}}}</dd>
  {{/each}}
</dl>

Iterating Over Referenced Fragments

{{#if hasReferencedFragments}}
  <section class="references">
    <h2>Related Content</h2>
    {{#each referencedFragments}}
      <article id="{{anchorId}}">
        <h3>{{properties.title}}</h3>
        {{#if properties.hasDescription}}
          <p>{{properties.description}}</p>
        {{/if}}

        {{#if hasFields}}
          <ul>
            {{#each allFields}}
              <li><strong>{{name}}:</strong> {{{value}}}</li>
            {{/each}}
          </ul>
        {{/if}}
      </article>
    {{/each}}
  </section>
{{/if}}

Special Variables in Loops

Inside {{#each}} blocks, Handlebars provides special variables:

{{#each fields.items}}
  <div class="item">
    <p>Index: {{@index}}</p>          <!-- 0-based index -->
    <p>Number: {{@number}}</p>         <!-- 1-based index -->
    <p>First: {{@first}}</p>           <!-- true for first item -->
    <p>Last: {{@last}}</p>             <!-- true for last item -->
    <p>Value: {{{this}}}</p>           <!-- current item -->
  </div>
{{/each}}

Example usage:

<ul>
  {{#each fields.steps}}
    <li class="{{#if @first}}first{{/if}} {{#if @last}}last{{/if}}">
      Step {{@number}}: {{{this}}}
    </li>
  {{/each}}
</ul>

Iterating Over Object Properties

<!-- Iterate over all context properties -->
{{#each this}}
  <div>
    <strong>{{@key}}:</strong> {{this}}
  </div>
{{/each}}

Nested Loops

{{#each fields.categories}}
  <section class="category">
    <h2>{{{this.name}}}</h2>

    <!-- Nested loop over products in category -->
    {{#each this.products}}
      <article class="product">
        <h3>{{{this.name}}}</h3>
        <p>{{{this.description}}}</p>
      </article>
    {{/each}}
  </section>
{{/each}}

================================================================================

CONDITIONAL RENDERING

Use conditionals to show or hide content based on data availability.

Basic If/Else

{{#if hasMainDescription}}
  <p class="description">{{main_cf_description}}</p>
{{else}}
  <p class="no-description">No description available.</p>
{{/if}}

Checking Field Values

{{#if fields.author}}
  <div class="author">
    <p>By {{{fields.author.name}}}</p>
  </div>
{{/if}}

{{#if fields.publishDate}}
  <time>{{{fields.publishDate}}}</time>
{{/if}}

Nested Conditionals

{{#if fields.author}}
  <div class="author">
    <h3>{{{fields.author.name}}}</h3>

    {{#if fields.author.bio}}
      <p class="bio">{{{fields.author.bio}}}</p>
    {{/if}}

    {{#if fields.author.website}}
      <a href="{{{fields.author.website}}}">Visit Website</a>
    {{/if}}
  </div>
{{/if}}

Unless (Negative Conditional)

{{#unless fields.hideAuthor}}
  <div class="author">{{{fields.author.name}}}</div>
{{/unless}}

<!-- Equivalent to: -->
{{#if fields.hideAuthor}}
{{else}}
  <div class="author">{{{fields.author.name}}}</div>
{{/if}}

Combining Conditions with Loops

{{#if hasFields}}
  <section class="fields">
    <h2>Content Fields</h2>
    <table>
      {{#each allFields}}
        <tr>
          <td>{{name}}</td>
          <td>{{{value}}}</td>
        </tr>
      {{/each}}
    </table>
  </section>
{{else}}
  <p>No fields available.</p>
{{/if}}

Error Handling

{{#if referencesError}}
  <div class="error-message">
    <strong>⚠ Error Loading Referenced Fragments</strong>
    <p>An error occurred while loading referenced content.</p>

    {{#if referencesErrorMessage}}
      <p class="error-details">{{referencesErrorMessage}}</p>
    {{/if}}
  </div>
{{/if}}

================================================================================

BUILT-IN HANDLEBARS HELPERS

Handlebars includes several built-in helpers beyond {{#if}} and {{#each}}.

If Helper

{{#if condition}}
  <!-- Show if condition is truthy -->
{{/if}}

{{#if condition}}
  <!-- Show if truthy -->
{{else}}
  <!-- Show if falsy -->
{{/if}}

Truthy values: non-empty strings, numbers ≠ 0, true, non-empty arrays, objects
Falsy values: false, undefined, null, 0, "", [], empty objects

Unless Helper

{{#unless condition}}
  <!-- Show if condition is falsy -->
{{/unless}}

Each Helper

{{#each array}}
  <!-- Repeat for each item -->
  {{{this}}}
{{/each}}

{{#each array}}
  <!-- Content -->
{{else}}
  <!-- Show if array is empty -->
  <p>No items found.</p>
{{/each}}

With Helper

Creates a new scope for nested objects:

{{#with fields.author}}
  <div class="author">
    <h3>{{{name}}}</h3>          <!-- Same as fields.author.name -->
    <p>{{{email}}}</p>            <!-- Same as fields.author.email -->
    <p>{{{bio}}}</p>              <!-- Same as fields.author.bio -->
  </div>
{{/with}}

Useful for deeply nested objects:

{{#with fields.author.organization}}
  <div class="organization">
    <h4>{{{name}}}</h4>
    <p>{{{website}}}</p>

    {{#with address}}
      <address>
        {{{street}}}<br>
        {{{city}}}, {{{country}}}
      </address>
    {{/with}}
  </div>
{{/with}}

Lookup Helper

Dynamically lookup a property:

{{#each fields.items}}
  <!-- Access a dynamic property by name -->
  {{lookup this "dynamicFieldName"}}
{{/each}}

================================================================================

ADVANCED PATTERNS

Accessing Parent Context in Nested Loops

Use ../ to access parent scope:

<h1>{{{fields.title}}}</h1>

{{#each fields.chapters}}
  <section class="chapter">
    <h2>Chapter {{@number}}: {{{this.title}}}</h2>

    {{#each this.sections}}
      <article>
        <!-- Access parent chapter -->
        <p>Chapter: {{{../title}}}</p>

        <!-- Access root context -->
        <p>Book: {{{../../fields.title}}}</p>

        <!-- Current section -->
        <h3>{{{this.title}}}</h3>
        <div>{{{this.content}}}</div>
      </article>
    {{/each}}
  </section>
{{/each}}

Combining Multiple Conditions

{{#if hasFields}}
  {{#if hasMainDescription}}
    <div class="content-with-description">
      <p>{{main_cf_description}}</p>

      {{#each allFields}}
        <div>{{{value}}}</div>
      {{/each}}
    </div>
  {{/if}}
{{/if}}

Dynamic CSS Classes

<article class="content-fragment {{#if hasMainDescription}}with-description{{/if}} {{#if hasReferencedFragments}}has-refs{{/if}}">
  <h1>{{main_cf_title}}</h1>
  <!-- Content -->
</article>

<ul class="tag-list">
  {{#each fields.tags}}
    <li class="tag {{#if @first}}first{{/if}} {{#if @last}}last{{/if}}">
      {{{this}}}
    </li>
  {{/each}}
</ul>

Fallback Values

<!-- Show title or fallback to path -->
<h1>{{main_cf_title}}{{#unless main_cf_title}}{{main_cf_path}}{{/unless}}</h1>

<!-- Better: Use #if/#else -->
<h1>
  {{#if main_cf_title}}
    {{main_cf_title}}
  {{else}}
    {{main_cf_path}}
  {{/if}}
</h1>

Custom Data Attributes

<div class="fragment"
     data-path="{{main_cf_path}}"
     data-has-description="{{hasMainDescription}}"
     data-field-count="{{allFields.length}}">
  <!-- Content -->
</div>

{{#each referencedFragments}}
  <div class="ref-fragment"
       id="{{anchorId}}"
       data-cf-id="{{properties.id}}"
       data-path="{{properties.path}}">
    <h3>{{properties.title}}</h3>
  </div>
{{/each}}

================================================================================

COMPLETE EXAMPLES

Example 1: Blog Post with Author

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{main_cf_title}}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .author-card { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    .tags { display: flex; gap: 10px; }
    .tag { background: #007bff; color: white; padding: 5px 10px; border-radius: 4px; }
  </style>
</head>
<body>
  <article>
    <!-- Main content -->
    <header>
      <h1>{{{fields.title}}}</h1>

      {{#if fields.publishDate}}
        <time datetime="{{{fields.publishDate}}}">{{{fields.publishDate}}}</time>
      {{/if}}

      {{#if fields.tags}}
        <div class="tags">
          {{#each fields.tags}}
            <span class="tag">{{{this}}}</span>
          {{/each}}
        </div>
      {{/if}}
    </header>

    <!-- Hero image -->
    {{#if fields.heroImage}}
      <figure>
        {{{fields.heroImage}}}
        {{#if fields.imageCaption}}
          <figcaption>{{{fields.imageCaption}}}</figcaption>
        {{/if}}
      </figure>
    {{/if}}

    <!-- Content -->
    <div class="content">
      {{{fields.content}}}
    </div>

    <!-- Author info (nested CF) -->
    {{#if fields.author}}
      <aside class="author-card">
        <h3>About the Author</h3>
        <h4>{{{fields.author.name}}}</h4>

        {{#if fields.author.profilePicture}}
          <div class="author-image">
            {{{fields.author.profilePicture}}}
          </div>
        {{/if}}

        {{#if fields.author.bio}}
          <p>{{{fields.author.bio}}}</p>
        {{/if}}

        {{#if fields.author.email}}
          <p>Contact: <a href="mailto:{{{fields.author.email}}}">{{{fields.author.email}}}</a></p>
        {{/if}}
      </aside>
    {{/if}}
  </article>
</body>
</html>

Required API call:
GET /adobe/sites/cf/fragments/{id}/preview?hydration=%7B%22enabled%22%3Atrue%2C%22maxDepth%22%3A1%7D

Example 2: Product Catalog with Categories

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{main_cf_title}} - Product Catalog</title>
  <style>
    .product-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .product { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
    .price { color: #28a745; font-size: 1.5em; font-weight: bold; }
  </style>
</head>
<body>
  <header>
    <h1>{{main_cf_title}}</h1>
    {{#if hasMainDescription}}
      <p>{{main_cf_description}}</p>
    {{/if}}
  </header>

  <main>
    <!-- Multi-valued products -->
    {{#if fields.products}}
      <div class="product-grid">
        {{#each fields.products}}
          <article class="product">
            {{#if this.image}}
              {{{this.image}}}
            {{/if}}

            <h2>{{{this.name}}}</h2>
            <p>{{{this.description}}}</p>

            {{#if this.price}}
              <div class="price">${{{this.price}}}</div>
            {{/if}}

            {{#if this.specifications}}
              <ul>
                {{#each this.specifications}}
                  <li>{{{this}}}</li>
                {{/each}}
              </ul>
            {{/if}}
          </article>
        {{/each}}
      </div>
    {{else}}
      <p>No products available.</p>
    {{/if}}
  </main>
</body>
</html>

Example 3: Generic Table View (No Prior Knowledge)

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{main_cf_title}}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #f4f4f4; font-weight: bold; }
    .ref-section { background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 8px; }
  </style>
</head>
<body>
  <!-- Main fragment metadata -->
  <header>
    <h1>{{main_cf_title}}</h1>
    {{#if hasMainDescription}}
      <p>{{main_cf_description}}</p>
    {{/if}}
    <p><small>Path: {{main_cf_path}}</small></p>
  </header>

  <!-- Main fragment fields -->
  {{#if hasFields}}
    <section>
      <h2>Fields</h2>
      <table>
        <thead>
          <tr>
            <th>Field Name</th>
            <th>Field Value</th>
          </tr>
        </thead>
        <tbody>
          {{#each allFields}}
            <tr>
              <td><strong>{{name}}</strong></td>
              <td>{{{value}}}</td>
            </tr>
          {{/each}}
        </tbody>
      </table>
    </section>
  {{/if}}

  <!-- Referenced fragments -->
  {{#if hasReferencedFragments}}
    <section class="ref-section">
      <h2>Referenced Content Fragments</h2>

      {{#each referencedFragments}}
        <article id="{{anchorId}}" style="margin-bottom: 30px;">
          <h3>{{properties.title}}</h3>

          {{#if properties.hasDescription}}
            <p>{{properties.description}}</p>
          {{/if}}

          <p><small>Path: {{properties.path}}</small></p>

          {{#if hasFields}}
            <table>
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Field Value</th>
                </tr>
              </thead>
              <tbody>
                {{#each allFields}}
                  <tr>
                    <td><strong>{{name}}</strong></td>
                    <td>{{{value}}}</td>
                  </tr>
                {{/each}}
              </tbody>
            </table>
          {{/if}}
        </article>
      {{/each}}
    </section>
  {{/if}}

  <!-- Error handling -->
  {{#if referencesError}}
    <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0;">
      <strong>⚠ Error Loading Referenced Fragments</strong>
      {{#if referencesErrorMessage}}
        <p>{{referencesErrorMessage}}</p>
      {{/if}}
    </div>
  {{/if}}
</body>
</html>

================================================================================

BEST PRACTICES

1. Always Use Triple Braces for Field Values

Field values are pre-rendered HTML. Use triple braces to avoid double-escaping:

✅ CORRECT:
{{{fields.description}}}

❌ WRONG - will show HTML tags as text:
{{fields.description}}

2. Check for Existence Before Accessing

Always check if data exists before rendering:

✅ GOOD:
{{#if fields.author}}
  <p>By {{{fields.author.name}}}</p>
{{/if}}

❌ RISKY - might render empty or undefined:
<p>By {{{fields.author.name}}}</p>

3. Use Direct Field Access When Possible

Direct access is more readable and maintainable:

✅ RECOMMENDED:
<h1>{{{fields.title}}}</h1>
<p>{{{fields.description}}}</p>

❌ LESS MAINTAINABLE:
{{#each allFields}}
  {{#if name == "title"}}
    <h1>{{{value}}}</h1>
  {{/if}}
{{/each}}

4. Structure Templates for Readability

Use whitespace and comments:

{{! ===== HEADER SECTION ===== }}
<header>
  <h1>{{main_cf_title}}</h1>
</header>

{{! ===== MAIN CONTENT ===== }}
<main>
  {{#if hasFields}}
    <!-- Fields rendering -->
  {{/if}}
</main>

{{! ===== REFERENCES ===== }}
{{#if hasReferencedFragments}}
  <!-- References rendering -->
{{/if}}

5. Handle Missing Data Gracefully

Provide fallbacks for missing data:

{{#if fields.title}}
  <h1>{{{fields.title}}}</h1>
{{else}}
  <h1>Untitled</h1>
{{/if}}

6. Use Proper HTML Structure

Always include proper HTML document structure:

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{main_cf_title}}</title>
</head>
<body>
  <!-- Your content -->
</body>
</html>

7. Test with Different Content

Test your templates with:
• Content with all fields populated
• Content with optional fields missing
• Content with empty multi-valued fields
• Content with deep nesting
• Content with errors in references

8. Use Semantic HTML

Use appropriate HTML elements for accessibility:

<article>
  <header>
    <h1>{{{fields.title}}}</h1>
    {{#if fields.publishDate}}
      <time datetime="{{{fields.publishDate}}}">{{{fields.publishDate}}}</time>
    {{/if}}
  </header>

  <main>
    {{{fields.content}}}
  </main>

  <footer>
    {{#if fields.author}}
      <address>{{{fields.author.name}}}</address>
    {{/if}}
  </footer>
</article>

9. Keep Styles in CSS

Use external styles or <style> tags, not inline styles.

10. Document Your Template

Add comments explaining complex logic.

================================================================================

TROUBLESHOOTING

Problem: Field shows HTML tags as text

Symptom: <p>Hello World</p> displayed as text instead of rendered HTML.

Solution: Use triple braces {{{ }}} instead of double braces:

❌ WRONG:
{{fields.description}}

✅ CORRECT:
{{{fields.description}}}

────────────────────────────────────────────────────────────────────────────────

Problem: Nested content fragment fields show as "[object Object]" or empty

Symptom: {{{fields.author.name}}} renders as empty or [object Object].

Solutions:

1. Enable hydration in your API call:
   GET /adobe/sites/cf/fragments/{id}/preview?hydration=%7B%22enabled%22%3Atrue%2C%22maxDepth%22%3A2%7D

2. Check field name spelling - must match your content fragment model exactly

3. Verify nesting depth - ensure maxDepth is high enough for your nesting level

────────────────────────────────────────────────────────────────────────────────

Problem: Multi-valued field only shows first item

Symptom: Array field with 5 items only shows 1 item.

Solution: Use {{#each}} to iterate:

❌ WRONG - only shows one item:
{{{fields.tags}}}

✅ CORRECT - shows all items:
{{#each fields.tags}}
  <span>{{{this}}}</span>
{{/each}}

────────────────────────────────────────────────────────────────────────────────

Problem: Array index access not working

Symptom: {{{fields.tags[0]}}} doesn't work.

Solution: Use dot before bracket: .[0]

❌ WRONG:
{{{fields.tags[0]}}}

✅ CORRECT:
{{{fields.tags.[0]}}}

────────────────────────────────────────────────────────────────────────────────

Problem: Referenced fragments not appearing

Symptom: {{#if hasReferencedFragments}} is always false.

Solutions:

1. Enable hydration:
   ?hydration=%7B%22enabled%22%3Atrue%7D

2. Check for errors:
   {{#if referencesError}}
     <p>Error: {{referencesErrorMessage}}</p>
   {{/if}}

────────────────────────────────────────────────────────────────────────────────

Problem: Template renders nothing

Symptom: Empty page or no output.

Debugging steps:

1. Check template syntax - look for unclosed {{#if}} or {{#each}} blocks

2. Add diagnostic output:
   <pre>
   Has Fields: {{hasFields}}
   Has Refs: {{hasReferencedFragments}}
   Title: {{main_cf_title}}
   </pre>

3. Use generic table template to see all available data:
   {{#each this}}
     <p><strong>{{@key}}:</strong> {{this}}</p>
   {{/each}}

────────────────────────────────────────────────────────────────────────────────

Problem: Comments appear in output

Symptom: Comments show in rendered HTML.

Solution: Use Handlebars comments {{! }} not HTML comments <!-- -->:

❌ WRONG - this will appear in output:
<!-- This is a comment -->

✅ CORRECT - this will not appear:
{{! This is a comment }}

────────────────────────────────────────────────────────────────────────────────

Problem: Conditional not working as expected

Symptom: {{#if fields.enabled}} always evaluates to true.

Understanding: Handlebars treats these as falsy:
• false
• undefined
• null
• "" (empty string)
• 0
• [] (empty array)

Everything else is truthy, including:
• "false" (string)
• Non-empty arrays
• Objects

Solution: Be aware of data types from your content fragment.

────────────────────────────────────────────────────────────────────────────────

Problem: Special characters not rendering correctly

Symptom: Characters like <, >, & render as HTML entities.

Solution: Use triple braces for pre-rendered HTML content:
{{{fields.content}}}

────────────────────────────────────────────────────────────────────────────────

Problem: Need to access parent context in nested loop

Solution: Use ../ notation:

{{#each fields.items}}
  {{#each this.subitems}}
    <!-- Access parent item -->
    <p>Parent: {{{../name}}}</p>

    <!-- Access root context -->
    <p>Title: {{../../main_cf_title}}</p>
  {{/each}}
{{/each}}

────────────────────────────────────────────────────────────────────────────────

Problem: Empty lists showing "No items" message when list exists but is empty

Symptom: Multi-valued field exists but has no items.

Solution: Use {{else}} in {{#each}}:

{{#each fields.tags}}
  <span class="tag">{{{this}}}</span>
{{else}}
  <p>No tags available</p>
{{/each}}

================================================================================

WORKING WITH ASSETS (Images, Documents)

Asset fields in content fragments (images, PDFs, videos, etc.) are pre-rendered
as HTML by the system. This is why you MUST use triple braces when outputting
asset fields.

Why Triple Braces Are Required for Assets

When the system processes an asset field, it generates an HTML element:
• Images become <img src="..." alt="..."> tags
• Videos become <video> elements
• Documents become <a href="..."> links

If you use double braces {{ }}, the HTML will be escaped and displayed as text:

❌ WRONG - Double braces escape HTML:
{{fields.heroImage}}
<!-- Output: &lt;img src="path/to/image.jpg" alt="Hero"&gt; -->
<!-- Displays as text in the browser! -->

✅ CORRECT - Triple braces output raw HTML:
{{{fields.heroImage}}}
<!-- Output: <img src="path/to/image.jpg" alt="Hero"> -->
<!-- Displays as an actual image! -->

Single Asset Examples

<!-- Simple asset output -->
<div class="hero">
  {{{fields.heroImage}}}
</div>

<!-- Asset with conditional check -->
{{#if fields.logo}}
  <header>
    {{{fields.logo}}}
  </header>
{{/if}}

Multi-Valued Assets (Galleries)

Asset fields can be multi-valued (arrays):

<!-- Iterate through all images -->
<div class="gallery">
  {{#each fields.photos}}
    <figure>
      {{{this}}}
    </figure>
  {{/each}}
</div>

<!-- Access by index -->
<div class="featured">
  {{{fields.photos.[0]}}}
</div>

Assets in Nested Content Fragments

Access assets from referenced content fragments:

<article>
  <h1>{{{fields.title}}}</h1>
  
  <!-- Author's profile picture (nested CF) -->
  {{#if fields.author.profilePicture}}
    <div class="author-avatar">
      {{{fields.author.profilePicture}}}
    </div>
  {{/if}}
</article>

⚠️ IMPORTANT: Remember to enable hydration with sufficient maxDepth to access
nested assets.

================================================================================

CUSTOM TEMPLATE HELPERS

The system provides custom Handlebars helpers for generating HTML elements with
custom HTML attributes. These helpers give you control over
the generated markup while handling the complexity of extracting source URLs
from pre-rendered content.

Available Helpers

1. asset - Generates <img> tags with custom attributes
2. text  - Generates <span> tags wrapping text content with custom attributes

────────────────────────────────────────────────────────────────────────────────

ASSET HELPER

The asset helper generates an <img> tag with custom CSS classes and HTML
attributes. It can accept either:
• A pre-rendered img tag (extracts src and alt automatically)
• A raw image URL/path

Syntax:
{{{asset fieldValue attribute1="value1" attribute2="value2"}}}

⚠️ IMPORTANT: Use triple braces {{{ }}} with asset helper, not double braces!

Basic Examples

<!-- Add a CSS class to an image -->
{{{asset fields.heroImage class="hero-image"}}}
<!-- Output: <img src="..." alt="..." class="hero-image"> -->

<!-- Add multiple CSS classes -->
{{{asset fields.productImage class="product-img responsive shadow"}}}

<!-- Add id and class -->
{{{asset fields.logo class="brand-logo" id="main-logo"}}}

<!-- Add data attributes -->
{{{asset fields.thumbnail class="thumb" data-category="product" data-id="123"}}}

Supported Attributes

You can add any valid HTML attribute:

Attribute        Example
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class            class="my-class another-class"
id               id="unique-id"
alt              alt="Custom alt text" (overrides existing alt)
data-*           data-index="1" data-type="hero"
aria-*           aria-label="Description" aria-hidden="true"
width            width="300"
height           height="200"
loading          loading="lazy"
style            style="border-radius: 8px;"

Override Alt Text

The alt attribute from the original image can be overridden:

{{{asset fields.photo alt="Custom description for accessibility"}}}

Complex Example

<article class="blog-post">
  <header>
    {{{asset fields.featuredImage 
        class="featured-image responsive" 
        id="post-hero"
        loading="lazy"
        data-post-id="12345"}}}
  </header>
</article>

Using with Loops

{{#each fields.galleryImages}}
  {{{asset this class="gallery-item" data-index=@index}}}
{{/each}}

────────────────────────────────────────────────────────────────────────────────

TEXT HELPER

The text helper generates a <span> tag wrapping text content with custom CSS
classes and HTML attributes. Useful for styling individual text fields.

Syntax:
{{{text fieldValue attribute1="value1" attribute2="value2"}}}

⚠️ IMPORTANT: Use triple braces {{{ }}} with text helper, not double braces!

Basic Examples

<!-- Add a CSS class to text -->
{{{text fields.title class="article-title"}}}
<!-- Output: <span class="article-title">The Title Text</span> -->

<!-- Add multiple attributes -->
{{{text fields.price class="price-tag" id="product-price" data-currency="USD"}}}

<!-- Style inline text -->
{{{text fields.highlightedText class="highlighted" style="background: yellow;"}}}

Common Use Cases

<!-- Styling article metadata -->
<article>
  <header>
    {{{text fields.category class="category-badge"}}}
    <h1>{{{fields.title}}}</h1>
    {{{text fields.author class="byline"}}}
    {{{text fields.publishDate class="date"}}}
  </header>
</article>

<!-- Creating styled labels -->
<div class="product-card">
  {{{text fields.productName class="product-name"}}}
  {{{text fields.brand class="brand-label" data-brand-id="abc"}}}
  {{{text fields.price class="price" id="main-price"}}}
</div>

<!-- Accessibility enhancements -->
{{{text fields.importantNote class="alert" role="alert" aria-live="polite"}}}

Using with Loops

{{#each fields.tags}}
  {{{text this class="tag-badge"}}}
{{/each}}

────────────────────────────────────────────────────────────────────────────────

ATTRIBUTE VALIDATION

Both helpers validate attribute names before including them in the output.

Valid Attribute Names

• Must start with a letter (a-z, A-Z)
• Can contain letters, digits, hyphens, and underscores
• Case-insensitive

✅ Valid: class, id, data-value, aria-label, my_attr, dataIndex1
❌ Invalid: 123-attr, -class, @special, $money

Invalid attribute names are silently skipped with a warning in the logs.

Example:

{{{asset fields.image class="valid" 123-invalid="skipped" id="also-valid"}}}
<!-- Output: <img src="..." alt="..." class="valid" id="also-valid"> -->
<!-- 123-invalid is skipped because it starts with a number -->

Check server logs for "Blocked invalid attribute name format" warnings.

────────────────────────────────────────────────────────────────────────────────

COMPARING DIRECT OUTPUT VS HELPERS

When to Use Direct Output {{{fields.xxx}}}

• You don't need custom styling
• You want the default output as-is
• The field contains complex HTML you don't want to modify

<div>{{{fields.heroImage}}}</div>

When to Use Helpers

• You need to add CSS classes for styling
• You need to add custom HTML attributes (data-*, aria-*, etc.)
• You want consistent, controlled HTML structure

<div>{{{asset fields.heroImage class="styled-image" loading="lazy"}}}</div>

Side-by-Side Comparison

<!-- Direct output - uses whatever HTML the system generates -->
{{{fields.heroImage}}}
<!-- Output: <img src="/path/image.jpg" alt="Hero Image"> -->

<!-- With asset helper - full control over attributes -->
{{{asset fields.heroImage class="hero responsive" id="main-hero" loading="lazy"}}}
<!-- Output: <img src="/path/image.jpg" alt="Hero Image" class="hero responsive" id="main-hero" loading="lazy"> -->

================================================================================

ADDITIONAL RESOURCES

External Resources

• Handlebars Official Documentation: https://handlebarsjs.com/
• Handlebars Built-in Helpers: https://handlebarsjs.com/guide/builtin-helpers.html
• AEM Content Fragments Documentation: https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/sites/administering/content-fragments/content-fragments.html

================================================================================

QUICK REFERENCE

Context Variables

{{main_cf_title}}              <!-- Main fragment title -->
{{main_cf_description}}         <!-- Main fragment description -->
{{main_cf_path}}                <!-- Main fragment JCR path -->
{{hasMainDescription}}          <!-- Boolean -->
{{hasFields}}                   <!-- Boolean -->
{{hasReferencedFragments}}      <!-- Boolean -->
{{referencesError}}             <!-- Boolean -->
{{referencesErrorMessage}}      <!-- String or null -->

Field Access

{{{fields.fieldName}}}                          <!-- Direct field -->
{{{fields.author.name}}}                        <!-- Nested CF field -->
{{{fields.author.org.address.city}}}            <!-- Multi-level nesting -->
{{{fields.tags.[0]}}}                           <!-- Array by index -->
{{#each fields.tags}}...{{/each}}               <!-- Array iteration -->
{{{fields.authors.[0].name}}}                   <!-- Multi-valued CF reference -->

Control Flow

{{#if condition}}...{{/if}}                     <!-- Conditional -->
{{#if condition}}...{{else}}...{{/if}}          <!-- If/else -->
{{#unless condition}}...{{/unless}}             <!-- Negative conditional -->
{{#each array}}...{{/each}}                     <!-- Iteration -->
{{#each array}}...{{else}}...{{/each}}          <!-- Iteration with fallback -->
{{#with object}}...{{/with}}                    <!-- Change scope -->

Loop Variables

{{@index}}      <!-- 0-based index -->
{{@number}}     <!-- 1-based index -->
{{@first}}      <!-- true for first item -->
{{@last}}       <!-- true for last item -->
{{@key}}        <!-- Object property name -->
{{this}}        <!-- Current item -->
{{../parent}}   <!-- Access parent scope -->

Custom Template Helpers

{{{asset fields.image class="css-class"}}}              <!-- Image with class -->
{{{asset fields.image class="c1" id="my-id"}}}          <!-- Image with multiple attrs -->
{{{asset fields.image alt="Custom alt text"}}}          <!-- Override alt text -->
{{{asset fields.image loading="lazy" data-x="val"}}}    <!-- Custom attributes -->

{{{text fields.title class="title-class"}}}             <!-- Span with class -->
{{{text fields.price class="price" id="p1"}}}           <!-- Span with multiple attrs -->
{{{text this class="item" data-index=@index}}}          <!-- In loops -->

Triple Braces Requirement

⚠️ Always use triple braces {{{ }}} for:
• Field values: {{{fields.description}}}
• Asset fields: {{{fields.heroImage}}}
• Asset helper: {{{asset fields.image class="x"}}}
• Text helper: {{{text fields.title class="x"}}}

Double braces {{ }} only for:
• Metadata: {{main_cf_title}}
• Booleans: {{hasFields}}
• Field names: {{name}}
• Loop variables: {{@index}}
