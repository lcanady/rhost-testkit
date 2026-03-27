#!/bin/bash
# RhostMUSH execscript: inspect calling-user context
#
# Usage: execscript(userinfo.sh)
# Returns: "Name=#dbref" for the player who triggered the script
#
# RhostMUSH sets MUSH_PLAYER to "#dbref Name" (e.g. "#1 Wizard")

DBREF=$(echo "$MUSH_PLAYER" | awk '{print $1}')
NAME=$(echo "$MUSH_PLAYER" | awk '{$1=""; print substr($0,2)}')

echo "${NAME:-unknown}=${DBREF:-#?}"
