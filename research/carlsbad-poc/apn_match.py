#!/usr/bin/env python3
"""Local, read-only ABC candidate -> SanGIS situs address/APN crosswalk.

Usage:
  python3 research/carlsbad-poc/apn_match.py --addresses /path/to/Address_Points.csv

Downloads are deliberately manual: https://data.sandiego.gov/datasets/gis-address-points-apn/
Outputs stay local under research/carlsbad-poc/raw/ (ignored by Git).
"""
import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CANDIDATES = ROOT / "tenant-candidates.csv"
OUT = ROOT / "raw" / "apn-match-results.json"

def norm(value):
    s = re.sub(r"[^A-Z0-9 ]", " ", str(value or "").upper())
    s = re.sub(r"\b(STREET|ST)\b", "ST", s)
    s = re.sub(r"\b(AVENUE|AVE)\b", "AVE", s)
    s = re.sub(r"\b(DRIVE|DR)\b", "DR", s)
    s = re.sub(r"\b(BOULEVARD|BLVD)\b", "BLVD", s)
    s = re.sub(r"\b(ROAD|RD)\b", "RD", s)
    s = re.sub(r"\b(LOOP|LP)\b", "LP", s)
    return " ".join(s.split())

def field(row, *aliases):
    lower = {norm(k).replace(" ", ""): v for k,v in row.items() if k}
    for alias in aliases:
        value = lower.get(norm(alias).replace(" ", ""))
        if value not in (None, ""):
            return str(value).strip()
    return ""

def situs(row):
    address = field(row, "FULLADDR", "FULL_ADDRESS", "SITE_ADDRESS", "SITUS_ADDRESS", "ADDRESS", "ADDR")
    if not address:
        number = field(row, "ADDRNUM", "ADDR_NUMBER", "STREET_NUMBER", "HOUSE_NUMBER")
        street = field(row, "STREETNAME", "STREET_NAME", "STNAME")
        suffix = field(row, "STREETTYPE", "STREET_TYPE", "STTYPE")
        address = " ".join(filter(None, (number, street, suffix)))
    return norm(address)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--addresses", required=True, type=Path, help="Downloaded SanGIS Address Points CSV")
    p.add_argument("--output", type=Path, default=OUT)
    args = p.parse_args()
    with args.addresses.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        print("SanGIS columns:", ", ".join(headers))
        index = defaultdict(set)
        valid = 0
        for row in reader:
            apn = field(row, "APN", "ASSESSOR_PARCEL_NUMBER", "ASSESSORPARCELNUMBER", "PARCELNUMBER")
            address = situs(row)
            city = field(row, "CITY", "SITUS_CITY", "COMMUNITY")
            if not apn or not address:
                continue
            if city and norm(city) != "CARLSBAD":
                continue
            index[address].add(apn)
            valid += 1
    if not valid:
        raise SystemExit("No valid address/APN rows: inspect actual CSV schema; no output written.")
    with CANDIDATES.open(newline="", encoding="utf-8-sig") as f:
        candidates = list(csv.DictReader(f))
    results = []
    for row in candidates:
        street = norm(row["address"])
        # Do not collapse suites into parcel ownership or tenant identity.
        apns = sorted(index.get(street, []))
        results.append({
            "candidate": row["candidate_name"],
            "abc_file_number": row["abc_file_number"],
            "address": row["address"],
            "suite": row["suite"].strip(),
            "apns": apns,
            "status": "unmatched" if not apns else ("unique_apn_candidate" if len(apns) == 1 else "ambiguous_multiple_apns"),
            "note": "Street-level candidate only; APN and unit must be verified before publishing."
        })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"source": str(args.addresses), "address_rows_indexed": valid, "candidate_count": len(results), "unique_apn_candidates": sum(r["status"]=="unique_apn_candidate" for r in results), "ambiguous": sum(r["status"]=="ambiguous_multiple_apns" for r in results), "unmatched": sum(r["status"]=="unmatched" for r in results), "results": results}, indent=2) + "\n")
    print(f"Saved {args.output}")
    print(f"Unique APN candidates: {sum(r['status']=='unique_apn_candidate' for r in results)}/{len(results)}")

if __name__ == "__main__":
    main()
