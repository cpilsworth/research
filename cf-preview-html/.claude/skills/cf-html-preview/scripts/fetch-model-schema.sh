#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  fetch-model-schema.sh \
    --base-url <aem-base-url> \
    --auth-header "Authorization: Bearer <token>" \
    --tenant-name <name> \
    [--model-id <id> | --model-name <name>] \
    [--model-dir-name <name>] \
    [--src-root <dir>] \
    [--models-url <url>] \
    [--schema-url-template <url-with-{modelId}>] \
    [--out-dir <dir>]

Description:
  Fetches content models and one model schema from an AEM environment, then
  writes normalized field metadata for template generation.

Outputs:
  src/<tenantName>/models.json
  src/<tenantName>/<modelName>/model-id.txt
  src/<tenantName>/<modelName>/model-path.txt
  src/<tenantName>/<modelName>/schema.json
  src/<tenantName>/<modelName>/field-map.json

`--out-dir` can override only the model-level output directory:
  <out-dir>/model-id.txt
  <out-dir>/model-path.txt
  <out-dir>/schema.json
  <out-dir>/field-map.json

Notes:
  - The default schema fetch uses model detail endpoint (`.../models/{modelId}`),
    which returns field definitions in many AEM environments.
  - Override with --models-url and --schema-url-template when needed.
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

BASE_URL=""
AUTH_HEADER=""
MODEL_ID=""
MODEL_NAME=""
TENANT_NAME=""
MODEL_DIR_NAME=""
SRC_ROOT="./src"
MODELS_URL=""
SCHEMA_URL_TEMPLATE=""
OUT_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --auth-header)
      AUTH_HEADER="$2"
      shift 2
      ;;
    --model-id)
      MODEL_ID="$2"
      shift 2
      ;;
    --model-name)
      MODEL_NAME="$2"
      shift 2
      ;;
    --tenant-name)
      TENANT_NAME="$2"
      shift 2
      ;;
    --tennant-name)
      echo "Warning: --tennant-name is deprecated; use --tenant-name" >&2
      TENANT_NAME="$2"
      shift 2
      ;;
    --model-dir-name)
      MODEL_DIR_NAME="$2"
      shift 2
      ;;
    --src-root)
      SRC_ROOT="$2"
      shift 2
      ;;
    --models-url)
      MODELS_URL="$2"
      shift 2
      ;;
    --schema-url-template)
      SCHEMA_URL_TEMPLATE="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BASE_URL" ]]; then
  echo "Error: --base-url is required" >&2
  usage >&2
  exit 1
fi
if [[ -z "$AUTH_HEADER" ]]; then
  echo "Error: --auth-header is required" >&2
  usage >&2
  exit 1
fi
if [[ -z "$TENANT_NAME" ]]; then
  echo "Error: --tenant-name is required" >&2
  usage >&2
  exit 1
fi
if [[ -z "$MODEL_ID" && -z "$MODEL_NAME" ]]; then
  echo "Error: provide --model-id or --model-name" >&2
  usage >&2
  exit 1
fi

require_cmd curl
require_cmd python3

BASE_URL="${BASE_URL%/}"
MODELS_URL="${MODELS_URL:-$BASE_URL/adobe/sites/cf/models}"
SCHEMA_URL_TEMPLATE="${SCHEMA_URL_TEMPLATE:-$BASE_URL/adobe/sites/cf/models/{modelId}}"

if [[ -z "$MODEL_DIR_NAME" ]]; then
  MODEL_DIR_NAME="$MODEL_NAME"
fi
if [[ -z "$MODEL_DIR_NAME" ]]; then
  MODEL_DIR_NAME="$MODEL_ID"
fi

MODEL_DIR_NAME="$(
  python3 - "$MODEL_DIR_NAME" <<'PY'
import re
import sys

value = sys.argv[1].strip().lower()
value = re.sub(r'[^a-z0-9._-]+', '-', value)
value = value.strip('-')
print(value or "model")
PY
)"

TENANT_DIR="$SRC_ROOT/$TENANT_NAME"
MODEL_OUT_DIR="${OUT_DIR:-$TENANT_DIR/$MODEL_DIR_NAME}"

mkdir -p "$TENANT_DIR" "$MODEL_OUT_DIR"
MODELS_JSON="$TENANT_DIR/models.json"
SCHEMA_JSON="$MODEL_OUT_DIR/schema.json"
FIELD_MAP_JSON="$MODEL_OUT_DIR/field-map.json"
MODEL_ID_TXT="$MODEL_OUT_DIR/model-id.txt"
MODEL_PATH_TXT="$MODEL_OUT_DIR/model-path.txt"

echo "Fetching models: $MODELS_URL" >&2
curl -fsS \
  -H "$AUTH_HEADER" \
  -H 'Accept: application/json' \
  "$MODELS_URL" > "$MODELS_JSON"

if [[ -z "$MODEL_ID" ]]; then
  MODEL_ID="$(
    python3 - "$MODELS_JSON" "$MODEL_NAME" <<'PY'
import json
import sys

path = sys.argv[1]
needle = sys.argv[2].strip().lower()

with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

items = data.get('items') if isinstance(data, dict) else None
if not isinstance(items, list):
    items = []

for c in items:
    if not isinstance(c, dict):
        continue
    cid = c.get('id', '')
    if not isinstance(cid, str) or not cid.strip():
        continue
    haystack = ' '.join([
        str(c.get('name', '')),
        str(c.get('title', '')),
        str(c.get('technicalName', '')),
        str(c.get('path', '')),
        cid,
    ]).lower()
    if needle and needle in haystack:
        print(cid)
        sys.exit(0)

sys.exit(1)
PY
  )" || true
fi

if [[ -z "$MODEL_ID" ]]; then
  echo "Error: could not resolve model id from --model-name. Check models.json and retry with --model-id." >&2
  exit 1
fi

MODEL_PATH="$(
  python3 - "$MODELS_JSON" "$MODEL_ID" <<'PY'
import json
import sys

path = sys.argv[1]
needle = sys.argv[2]

with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

items = data.get('items') if isinstance(data, dict) else None
if not isinstance(items, list):
    items = []

for c in items:
    if not isinstance(c, dict):
        continue
    if c.get('id') == needle:
        model_path = c.get('path', '')
        if isinstance(model_path, str):
            print(model_path)
        break
PY
)"

printf '%s\n' "$MODEL_ID" > "$MODEL_ID_TXT"
printf '%s\n' "$MODEL_PATH" > "$MODEL_PATH_TXT"

SCHEMA_URL="$(
  python3 - "$SCHEMA_URL_TEMPLATE" "$MODEL_ID" <<'PY'
import sys
template = sys.argv[1]
model_id = sys.argv[2]
print(template.replace('{modelId}', model_id))
PY
)"

echo "Fetching model schema: $SCHEMA_URL" >&2
curl -fsS \
  -H "$AUTH_HEADER" \
  -H 'Accept: application/json' \
  "$SCHEMA_URL" > "$SCHEMA_JSON"

python3 - "$SCHEMA_JSON" > "$FIELD_MAP_JSON" <<'PY'
import json
import sys

schema_path = sys.argv[1]
with open(schema_path, 'r', encoding='utf-8') as f:
    data = json.load(f)


def normalize_from_fields_array(node):
    fields = node.get('fields') if isinstance(node, dict) else None
    if not isinstance(fields, list):
        return None

    out = []
    for f in fields:
        if not isinstance(f, dict):
            continue
        name = f.get('name')
        if not isinstance(name, str) or not name:
            continue
        ftype = f.get('type')
        multi = bool(f.get('multiple')) or bool(f.get('multi')) or bool(f.get('multiValue'))
        blob = json.dumps(f).lower()
        ref_kind = None
        if ftype == 'content-reference' or 'allowedcontenttypes' in blob:
            ref_kind = 'asset-or-content-reference'
        elif ftype == 'content-fragment':
            ref_kind = 'content-fragment'
        out.append({
            'name': name,
            'type': ftype,
            'itemType': None,
            'multi': multi,
            'required': bool(f.get('required')),
            'format': f.get('format'),
            'refKind': ref_kind,
        })
    return {'fields': out}


def find_largest_properties_node(node):
    best = None

    def walk(n):
        nonlocal best
        if isinstance(n, dict):
            props = n.get('properties')
            if isinstance(props, dict):
                size = len(props)
                if best is None or size > best[0]:
                    best = (size, n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for i in n:
                walk(i)

    walk(node)
    return best[1] if best else None

node = find_largest_properties_node(data)
if not node:
    normalized = normalize_from_fields_array(data)
    if normalized is not None:
        print(json.dumps(normalized, indent=2))
        sys.exit(0)
    print(json.dumps({"fields": [], "warning": "No properties object or fields[] found in schema"}, indent=2))
    sys.exit(0)

required = set(node.get('required', [])) if isinstance(node.get('required'), list) else set()
props = node.get('properties', {})

fields = []
for name, spec in props.items():
    if not isinstance(spec, dict):
        spec = {}

    field_type = spec.get('type')
    is_array = field_type == 'array' or 'items' in spec or bool(spec.get('multi')) or bool(spec.get('multiValue'))

    item_type = None
    if isinstance(spec.get('items'), dict):
        item_type = spec['items'].get('type')

    blob = json.dumps(spec).lower()
    ref_kind = None
    if 'asset' in blob:
        ref_kind = 'asset'
    elif 'reference' in blob or 'contentfragment' in blob or 'content-fragment' in blob:
        ref_kind = 'content-fragment'

    fields.append({
        'name': name,
        'type': field_type,
        'itemType': item_type,
        'multi': is_array,
        'required': name in required,
        'format': spec.get('format'),
        'refKind': ref_kind,
    })

print(json.dumps({'fields': fields}, indent=2))
PY

echo "Wrote:"
echo "  $MODELS_JSON"
echo "  $MODEL_ID_TXT"
echo "  $MODEL_PATH_TXT"
echo "  $SCHEMA_JSON"
echo "  $FIELD_MAP_JSON"
