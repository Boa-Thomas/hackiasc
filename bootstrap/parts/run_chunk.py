#!/usr/bin/env python3
"""
This script is regenerated for each chunk. It contains the b64 string as a Python literal
and applies it. Edit B64, EXPECTED_MD5, EXPECTED_LEN, OUTFILE for each chunk.
"""
import base64, hashlib, sys

B64 = "__B64__"
EXPECTED_MD5 = "__MD5__"
EXPECTED_LEN = __LEN__
OUTFILE = "__OUTFILE__"

data = base64.b64decode(B64)
actual_md5 = hashlib.md5(data).hexdigest()
actual_len = len(data)

if actual_md5 != EXPECTED_MD5:
    print(f"MD5 MISMATCH: expected={EXPECTED_MD5} got={actual_md5}", file=sys.stderr)
    sys.exit(2)
if actual_len != EXPECTED_LEN:
    print(f"LEN MISMATCH: expected={EXPECTED_LEN} got={actual_len}", file=sys.stderr)
    sys.exit(3)

with open(OUTFILE, "ab") as f:
    f.write(data)

print(f"OK: appended {actual_len} bytes (md5={actual_md5}) to {OUTFILE}")
