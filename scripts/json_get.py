#!/usr/bin/env python3
"""
RhostMUSH execscript: extract a value from JSON (Python)

Usage: execscript(json_get.py, json_string, |, key)
  MUSHQ_0 = JSON string  (e.g. '{"hp":42,"mp":10}')
  MUSHQ_1 = key to look up (e.g. "hp")

Returns the value as a string, or #-1 ERROR on failure.
"""
import sys
import json

# execscript() passes all args as a single sys.argv[1]: "json_str | key"
raw = sys.argv[1] if len(sys.argv) > 1 else ''
parts = [p.strip() for p in raw.split('|')]
# MUSH strips outer {} from function args (they're literal delimiters).
# Re-wrap if the string looks like a JSON object body without braces.
json_str = parts[0] if parts and parts[0] else '{}'
key      = parts[1].strip() if len(parts) > 1 else ''

# MUSH strips outer {} from function args (they're literal string delimiters).
# Try parsing as-is; if that fails, try re-wrapping with braces.
try:
    data = json.loads(json_str)
except json.JSONDecodeError:
    try:
        data = json.loads('{' + json_str + '}')
    except json.JSONDecodeError as e:
        print(f'#-1 INVALID JSON: {e}')
        raise SystemExit(0)

if not key:
    # No key: return space-separated list of top-level keys
    print(' '.join(str(k) for k in data.keys()))
else:
    val = data.get(key)
    if val is None:
        print(f'#-1 KEY NOT FOUND: {key}')
    else:
        print(str(val))
