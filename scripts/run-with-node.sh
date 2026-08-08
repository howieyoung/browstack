#!/bin/sh
# Resolve Node at runtime and exec it on the given script, so a Node upgrade doesn't leave a
# stale pinned path baked into the LaunchAgent. launchd sets a PATH that lists the install-time
# node dir first; command -v honors it, with a fallback list for a bare environment.
NODE="$(command -v node 2>/dev/null)"
if [ -z "$NODE" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    [ -x "$p" ] && NODE="$p" && break
  done
fi
exec "$NODE" "$@"
