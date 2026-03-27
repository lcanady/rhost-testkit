#!/usr/bin/env python3
"""
RhostMUSH execscript: multilingual greeting (Python)

Usage: execscript(greet.py, name, |, lang)
  MUSHQ_0 = name  (e.g. "Alice")
  MUSHQ_1 = lang  (en | es | fr | de | ja)

Returns: greeting string in the requested language.
"""
import sys

# execscript() passes all args as a single sys.argv[1]: "name | lang"
raw = sys.argv[1] if len(sys.argv) > 1 else ''
parts = [p.strip() for p in raw.split('|')]
name = parts[0] if parts and parts[0] else 'World'
lang = (parts[1].strip() if len(parts) > 1 else 'en').lower()

GREETINGS = {
    'en': f'Hello, {name}!',
    'es': f'Hola, {name}!',
    'fr': f'Bonjour, {name}!',
    'de': f'Hallo, {name}!',
    'ja': f'Konnichiwa, {name}!',
}

print(GREETINGS.get(lang, f'Hello, {name}!'))
