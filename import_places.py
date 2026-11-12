"""Load a list of places into the app.

Usage (run from the folder that holds nysc_companion.db):
    python import_places.py FILE --source "GRID3 health 2026"
    python import_places.py benue_schools.csv --source "Benue schools" --kind school --state Benue
    python import_places.py nigeria.geojson --source "OpenStreetMap" --replace

FILE      a .csv, .xlsx (Excel), .geojson, .json or shapefile .zip file with a name and coordinates for each place
--source  a label for this list, shown nowhere to users; used so you can reload it later
--kind    school, health or other (default: guessed from each place's name and type)
--state   for lists that cover one state and have no state column
--replace delete the places from an earlier load with the same --source first
"""
import argparse
import sys

import known_places


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--source", required=True)
    ap.add_argument("--kind", choices=known_places.KINDS)
    ap.add_argument("--state", default="")
    ap.add_argument("--replace", action="store_true")
    a = ap.parse_args()
    try:
        added, skipped = known_places.import_file(a.file, a.source, a.kind, a.state, a.replace)
    except (OSError, ValueError) as err:
        sys.exit("Could not load the file: " + str(err))
    print(f"Added {added} places. Skipped {skipped} (no name, no coordinates inside Nigeria, or already loaded).")
    if added == 0:
        print("Nothing was added. Check that the file has a name column and latitude/longitude columns.")


if __name__ == "__main__":
    main()
