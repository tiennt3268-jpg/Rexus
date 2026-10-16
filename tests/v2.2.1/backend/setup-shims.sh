#!/bin/sh
# Restores test-only modules (npm prunes them). Copies production deps (waddler, pg) from the REXUS tree.
D=$(cd "$(dirname "$0")" && pwd); S=${REXUS_SRC:-$D/../../..}/node_modules
mkdir -p $D/node_modules/@netlify
cp -r $D/shims/@netlify/database $D/shims/@netlify/blobs $D/node_modules/@netlify/
for m in waddler pg pg-cloudflare pg-connection-string pg-int8 pg-pool pg-protocol pg-types pgpass postgres-array postgres-bytea postgres-date postgres-interval split2 xtend; do [ -d $S/$m ] && cp -r $S/$m $D/node_modules/; done
