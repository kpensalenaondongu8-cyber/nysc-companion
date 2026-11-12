"""Save every place in the app into one small CSV file, so you can load the same places on another computer.

Run from the folder that holds nysc_companion.db:
    python export_places.py
It writes places-export.csv. On the other computer:
    python import_places.py places-export.csv --source "Nigeria places"
"""
import csv

import known_places


def main():
    conn = known_places._connect()
    rows = conn.execute("SELECT name, kind, state, lga, town, address, lat, lon FROM known_places ORDER BY id").fetchall()
    conn.close()
    with open("places-export.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "type", "state", "lga", "town", "address", "latitude", "longitude"])
        for r in rows:
            w.writerow([r["name"], r["kind"], r["state"], r["lga"], r["town"], r["address"], r["lat"], r["lon"]])
    print(f"Saved {len(rows)} places to places-export.csv")


if __name__ == "__main__":
    main()
