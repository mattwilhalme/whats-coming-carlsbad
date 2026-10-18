#!/usr/bin/env python3
"""Local, read-only ABC candidate -> SanGIS situs address/APN crosswalk.

Usage:
  python3 research/carlsbad-poc/apn_match.py
  python3 research/carlsbad-poc/apn_match.py --addresses /path/to/Address_Points.csv

API-first; optional CSV fallback: https://data.sandiego.gov/datasets/gis-address-points-apn/
Outputs stay local under research/carlsbad-poc/raw/ (ignored by Git).
"""
import argparse
import csv
import json
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CANDIDATES = ROOT / "tenant-candidates.csv"
OUT = ROOT / "raw" / "apn-match-results.json"
API = "https://gis-public.sandiegocounty.gov/arcgis/rest/services/sdep_warehouse/ADDRAPN/FeatureServer/0"

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
        number = field(row, "ADDRNMBR", "ADDRNUM", "ADDR_NUMBER", "STREET_NUMBER", "HOUSE_NUMBER")
        if re.fullmatch(r"\d+\.0", number):
            number = number[:-2]
        prefix = field(row, "ADDRPDIR", "PREFIX_DIRECTION")
        street = field(row, "ADDRNAME", "STREETNAME", "STREET_NAME", "STNAME")
        suffix = field(row, "ADDRSFX", "STREETTYPE", "STREET_TYPE", "STTYPE")
        post_direction = field(row, "ADDRPOSTD", "POST_DIRECTION")
        address = " ".join(filter(None, (number, prefix, street, suffix, post_direction)))
    return norm(address)

def live_rows(candidates):
    def request(url):
        req = Request(url, headers={"User-Agent": "WhatsComingCarlsbad/0.1"})
        with urlopen(req, timeout=30) as response:
            result = json.load(response)
        if "error" in result:
            raise RuntimeError(str(result["error"]))
        return result
    metadata = request(API + "?f=json")
    fields = {f["name"].upper(): f["name"] for f in metadata.get("fields", [])}
    number_field = next((fields[k] for k in ("ADDRNMBR", "ADDRNUM", "ADDR_NUMBER", "STREET_NUMBER", "HOUSE_NUMBER") if k in fields), None)
    if not number_field:
        raise RuntimeError("Unsupported ArcGIS address number field: " + str(list(fields)))
    numbers = sorted({int(m.group(1)) for row in candidates if (m := re.match(r"^\s*(\d+)", row["address"]))})
    where = f"{number_field} IN ({','.join(map(str, numbers))}) AND UPPER(COMMUNITY) = 'CARLSBAD'"
    count = request(API + "/query?" + urlencode({"f":"json","where":where,"returnCountOnly":"true"})).get("count", 0)
    rows = []
    offset = 0
    while offset < count:
        params = {"f":"json","where":where,"outFields":"*","returnGeometry":"true","outSR":"4326","resultOffset":offset,"resultRecordCount":min(500,count-offset)}
        response = request(API + "/query?" + urlencode(params))
        batch = [{**x["attributes"], "_longitude": x.get("geometry", {}).get("x"), "_latitude": x.get("geometry", {}).get("y")} for x in response.get("features", [])]
        if not batch:
            raise RuntimeError("Incomplete ArcGIS response for Carlsbad candidate addresses")
        rows.extend(batch)
        offset += len(batch)
        time.sleep(0.15)
    return rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--addresses", type=Path, help="Optional downloaded CSV fallback")
    p.add_argument("--output", type=Path, default=OUT)
    args = p.parse_args()
    with CANDIDATES.open(newline="", encoding="utf-8-sig") as f:
        candidates = list(csv.DictReader(f))
    if args.addresses:
        with args.addresses.open(newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        source = str(args.addresses)
    else:
        rows = live_rows(candidates)
        source = API
    index = defaultdict(dict)
    valid = 0
    for row in rows:
        apn = field(row, "APN", "ASSESSOR_PARCEL_NUMBER", "ASSESSORPARCELNUMBER", "PARCELNUMBER")
        address = situs(row)
        city = field(row, "CITY", "SITUS_CITY", "COMMUNITY")
        jurisdiction = field(row, "ADDRJUR", "JURISDICTION", "JURIS", "JURIS_CODE")
        if not apn or not address:
            continue
        if city and norm(city) != "CARLSBAD":
            continue
        if jurisdiction and norm(jurisdiction) not in ("CB", "CARLSBAD"):
            continue
        index[address][apn] = {
            "apn": apn,
            "longitude": row.get("_longitude"),
            "latitude": row.get("_latitude"),
            "address_point_id": field(row, "ADDRAPNID"),
        }
        valid += 1
    if not valid:
        raise SystemExit("No valid address/APN rows; inspect ArcGIS schema or CSV fields.")
    results = []
    for row in candidates:
        street = norm(row["address"])
        # Do not collapse suites into parcel ownership or tenant identity.
        matches = [index[street][apn] for apn in sorted(index.get(street, {}))]
        apns = [match["apn"] for match in matches]
        results.append({
            "candidate": row["candidate_name"],
            "abc_file_number": row["abc_file_number"],
            "address": row["address"],
            "suite": row["suite"].strip(),
            "apns": apns,
            "address_points": matches,
            "status": "unmatched" if not apns else ("unique_apn_candidate" if len(apns) == 1 else "ambiguous_multiple_apns"),
            "note": "Street-level candidate only; APN and unit must be verified before publishing."
        })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"source": source, "address_rows_indexed": valid, "candidate_count": len(results), "unique_apn_candidates": sum(r["status"]=="unique_apn_candidate" for r in results), "ambiguous": sum(r["status"]=="ambiguous_multiple_apns" for r in results), "unmatched": sum(r["status"]=="unmatched" for r in results), "results": results}, indent=2) + "\n")
    print(f"Saved {args.output}")
    print(f"Unique APN candidates: {sum(r['status']=='unique_apn_candidate' for r in results)}/{len(results)}")

if __name__ == "__main__":
    main()
