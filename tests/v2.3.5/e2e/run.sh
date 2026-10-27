#!/bin/sh
# fresh database per run: restart the test server, then run the suite
pgrep -f "^node server.mjs" | xargs -r kill; sleep 1
cd "$(dirname "$0")/../../v2.2.1/backend" && (node server.mjs > /tmp/rexus-test-server.log 2>&1 &)
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:8899/ && break; sleep 1; done
cd - >/dev/null; python3 "$@"
