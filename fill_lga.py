"""Give places that have no LGA the LGA of the nearest place that has one (same state, within MAX_KM).

Run from the folder that holds nysc_companion.db:
    python fill_lga.py

Your school list has no LGA names, but the health list does. A school takes the LGA of the closest
health facility. This is a good guess, not a boundary: a school right on an LGA border can get the
neighbour's LGA. Run it again after loading more files; places that already have an LGA are never changed.
"""
import math
from collections import defaultdict

import known_places

MAX_KM = 8.0
CELL = 0.1          # about 11 km


def km(lat1, lon1, lat2, lon2):
    dy = (lat2 - lat1) * 111.0
    dx = (lon2 - lon1) * 111.0 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def main():
    conn = known_places._connect()
    grid = defaultdict(list)
    for r in conn.execute("SELECT lat, lon, state, lga FROM known_places WHERE lga != ''"):
        grid[(r["state"], int(r["lat"] // CELL), int(r["lon"] // CELL))].append((r["lat"], r["lon"], r["lga"]))
    todo = conn.execute("SELECT id, lat, lon, state FROM known_places WHERE lga = ''").fetchall()
    updates = []
    for r in todo:
        gx, gy = int(r["lat"] // CELL), int(r["lon"] // CELL)
        best, best_d = None, MAX_KM
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for lat, lon, lga in grid.get((r["state"], gx + dx, gy + dy), ()):
                    d = km(r["lat"], r["lon"], lat, lon)
                    if d < best_d:
                        best, best_d = lga, d
        if best:
            updates.append((best, r["id"]))
    conn.executemany("UPDATE known_places SET lga = ? WHERE id = ?", updates)
    conn.commit()
    conn.close()
    print(f"Gave an LGA to {len(updates)} of {len(todo)} places without one.")


if __name__ == "__main__":
    main()
