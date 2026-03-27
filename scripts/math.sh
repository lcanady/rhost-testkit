#!/bin/bash
# RhostMUSH execscript: integer arithmetic via shell
#
# Usage: execscript(math.sh, num1, |, num2, |, op)
#   $1 = num1  ($2 is "|" separator)
#   $3 = num2  ($4 is "|" separator)
#   $5 = operation: add | sub | mul | div | mod | pow
#
# Returns: numeric result or #-1 ERROR MESSAGE

# execscript passes all args as a single $1: "num1 | num2 | op"
A=$(echo "${1:-}" | cut -d'|' -f1 | tr -d ' ')
B=$(echo "${1:-}" | cut -d'|' -f2 | tr -d ' ')
OP=$(echo "${1:-}" | cut -d'|' -f3 | tr -d ' ')
A="${A:-0}"
B="${B:-0}"
OP="${OP:-add}"

# Validate numeric input
if ! [[ "$A" =~ ^-?[0-9]+$ ]] || ! [[ "$B" =~ ^-?[0-9]+$ ]]; then
    printf '%s' "#-1 ARGUMENTS MUST BE INTEGERS"
    exit 0
fi

case "$OP" in
    add) printf '%s' $((A + B)) ;;
    sub) printf '%s' $((A - B)) ;;
    mul) printf '%s' $((A * B)) ;;
    div)
        if [ "$B" -eq 0 ]; then
            printf '%s' "#-1 DIVISION BY ZERO"
        else
            printf '%s' $((A / B))
        fi
        ;;
    mod)
        if [ "$B" -eq 0 ]; then
            printf '%s' "#-1 DIVISION BY ZERO"
        else
            printf '%s' $((A % B))
        fi
        ;;
    pow)
        if [ "$B" -lt 0 ] || [ "$B" -gt 62 ]; then
            printf '%s' "#-1 EXPONENT TOO LARGE"
        else
            printf '%s' $((A ** B))
        fi
        ;;
    *)   printf '%s' "#-1 UNKNOWN OPERATION '$OP'" ;;
esac
