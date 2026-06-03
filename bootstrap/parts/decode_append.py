#!/usr/bin/env python3
"""
Usage: python3 decode_append.py <output_file> <expected_md5> <expected_len>
Reads a base64 string from stdin, decodes it, verifies MD5+len, appends to output_file.
"""
import sys, base64, hashlib

def main():
    if len(sys.argv) < 4:
        print("Usage: decode_append.py <output_file> <expected_md5> <expected_len>")
        sys.exit(1)

    outfile = sys.argv[1]
    expected_md5 = sys.argv[2]
    expected_len = int(sys.argv[3])

    b64 = sys.stdin.read().strip()
    data = base64.b64decode(b64)

    actual_md5 = hashlib.md5(data).hexdigest()
    actual_len = len(data)

    if actual_md5 != expected_md5:
        print(f"MD5 MISMATCH: expected={expected_md5} got={actual_md5}", file=sys.stderr)
        sys.exit(2)
    if actual_len != expected_len:
        print(f"LEN MISMATCH: expected={expected_len} got={actual_len}", file=sys.stderr)
        sys.exit(3)

    with open(outfile, "ab") as f:
        f.write(data)

    print(f"OK: appended {actual_len} bytes (md5={actual_md5})")

if __name__ == "__main__":
    main()
