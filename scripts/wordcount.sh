#!/bin/bash
# RhostMUSH execscript: count words / chars / lines in input
#
# Usage: execscript(wordcount.sh, text, |, mode)
#   $1 = text to analyse  ($2 is "|" separator)
#   $3 = mode: words | chars | lines (default: words)

# execscript passes all args as a single $1: "text | mode"
TEXT=$(echo "${1:-}" | cut -d'|' -f1 | sed 's/[[:space:]]*$//')
MODE=$(echo "${1:-}" | cut -d'|' -f2 | tr -d ' ')
MODE="${MODE:-words}"

case "$MODE" in
    words) echo "$TEXT" | wc -w | tr -d ' ' ;;
    chars) echo -n "$TEXT" | wc -c | tr -d ' ' ;;
    lines) echo "$TEXT" | wc -l | tr -d ' ' ;;
    *)     echo "#-1 UNKNOWN MODE '$MODE'" ;;
esac
