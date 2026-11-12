"""Our own list of places in Nigeria (schools, hospitals and other PPAs) and the search API for it.

Where the places come from:
  * free open data files (hospital lists, school lists, an OpenStreetMap extract) loaded with import_places.py
  * the admin adding or removing a place by hand (POST / DELETE below)
(PPAs that corps members pin themselves live in the shared list, ppa_directory.py. The PPA page
 searches both lists at once.)

The search runs on our own database, so it is instant and needs no outside service.
"""
import csv
import json
import re
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import locator_db as db
from api_routes import current_user_id
from ppa_directory import name_score, words

router = APIRouter(prefix="/api/places")

STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
          "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
          "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
          "Taraba", "Yobe", "Zamfara"]
KINDS = ("school", "health", "other")
MIN_SCORE = 0.34
NIGERIA = (3.5, 14.0, 2.5, 15.0)           # lat min, lat max, lon min, lon max: rejects points outside Nigeria

_ready = False


def _connect():
    global _ready
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    conn.row_factory = sqlite3.Row
    if not _ready:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS known_places(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'other',
              state TEXT NOT NULL DEFAULT '',
              lga TEXT NOT NULL DEFAULT '',
              town TEXT NOT NULL DEFAULT '',
              address TEXT NOT NULL DEFAULT '',
              lat REAL NOT NULL,
              lon REAL NOT NULL,
              source TEXT NOT NULL DEFAULT '',
              dedupe TEXT NOT NULL UNIQUE
            );
            CREATE INDEX IF NOT EXISTS idx_known_state_lga ON known_places (state, lga);
        """)
        conn.commit()
        _ready = True
    return conn


# ---------- cleaning values ----------

STATE_CODES = {"AB": "Abia", "AD": "Adamawa", "AK": "Akwa Ibom", "AN": "Anambra", "BA": "Bauchi", "BY": "Bayelsa",
               "BE": "Benue", "BO": "Borno", "CR": "Cross River", "DE": "Delta", "EB": "Ebonyi", "ED": "Edo",
               "EK": "Ekiti", "EN": "Enugu", "FC": "FCT", "GO": "Gombe", "IM": "Imo", "JI": "Jigawa", "KD": "Kaduna",
               "KN": "Kano", "KT": "Katsina", "KE": "Kebbi", "KO": "Kogi", "KW": "Kwara", "LA": "Lagos",
               "NA": "Nasarawa", "NI": "Niger", "OG": "Ogun", "ON": "Ondo", "OS": "Osun", "OY": "Oyo", "PL": "Plateau",
               "RI": "Rivers", "SO": "Sokoto", "TA": "Taraba", "YO": "Yobe", "ZA": "Zamfara"}


def clean_state(text):
    if (text or "").strip().upper() in STATE_CODES:                  # two-letter codes such as "BE" for Benue
        return STATE_CODES[text.strip().upper()]
    t = re.sub(r"\bstate\b", "", (text or "").replace("-", " ").replace("_", " "), flags=re.I).strip().lower()
    t = re.sub(r"\s+", " ", t)
    if t in ("federal capital territory", "abuja", "fct abuja", "f c t", "fct"):
        return "FCT"
    if t in ("nassarawa",):
        return "Nasarawa"
    for s in STATES:
        if s.lower() == t:
            return s
    return ""


def clean_lga(text):
    t = re.sub(r"\b(local government area|local government|lga)\b", "", (text or "").replace("_", " "), flags=re.I)
    return re.sub(r"\s+", " ", t).strip(" ,-")


def guess_kind(*texts):
    t = " ".join(x for x in texts if x).lower()
    if re.search(r"hospital|clinic|health|\bphc\b|medical|maternity|dispensary|pharmacy|infirmary", t):
        return "health"
    if re.search(r"school|college|university|polytechnic|academy|institute|nursery|primary|secondary|\bgss\b|\bgjss\b", t):
        return "school"
    return "other"


def _dedupe_key(name, lat, lon):
    return " ".join(words(name)) + "|" + f"{lat:.3f}|{lon:.3f}"


def add_place(conn, name, lat, lon, state="", lga="", town="", address="", kind=None, source=""):
    """Insert one place. Returns True if it was new, False if it was bad or already there."""
    name = re.sub(r"\s+", " ", (name or "")).strip()
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return False
    if len(name) < 3 or not (NIGERIA[0] <= lat <= NIGERIA[1] and NIGERIA[2] <= lon <= NIGERIA[3]):
        return False
    kind = kind if kind in KINDS else guess_kind(name)
    cur = conn.execute(
        """INSERT OR IGNORE INTO known_places (name, kind, state, lga, town, address, lat, lon, source, dedupe)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (name[:150], kind, clean_state(state), clean_lga(lga)[:80], (town or "").strip()[:80],
         (address or "").strip()[:200], lat, lon, source[:60], _dedupe_key(name, lat, lon)))
    return cur.rowcount == 1


# ---------- reading data files (CSV, GeoJSON, OpenStreetMap/Overpass JSON) ----------

FIELDS = {
    "name": ("name", "facility_name", "facility name", "school_name", "school name", "primary_name", "official_name", "title", "institution"),
    "lat": ("lat", "latitude", "y", "lat_y", "ycoord"),
    "lon": ("lon", "long", "lng", "longitude", "x", "lon_x", "xcoord"),
    "state": ("state", "state_code", "state_standard", "statename", "state_name", "admin1", "addr:state", "adm1_name"),
    "lga": ("lga", "lga_name", "lganame", "local_government", "admin2", "adm2_name", "addr:district", "lga_name_", "lga_standard"),
    "town": ("ward", "ward_standard", "settlement_name", "ward_name", "wardname", "settlement", "town", "community", "addr:city", "addr:suburb", "village"),
    "address": ("address", "addr:street", "street", "location"),
    "type": ("type", "poi_type", "subtype", "category", "facility_type", "facility_level", "amenity", "functional_status", "ownership_type", "level", "school_type"),
}


def _pick(row, field):
    low = {str(k).lower().strip(): v for k, v in row.items()}
    for key in FIELDS[field]:
        v = low.get(key)
        if v not in (None, ""):
            return str(v).strip()
    return ""


def _from_row(row):
    return {k: _pick(row, k) for k in FIELDS}


def _centre(geom):
    """A point for a GeoJSON geometry (the middle of a building outline counts too)."""
    if not geom:
        return None
    t, c = geom.get("type"), geom.get("coordinates")
    try:
        if t == "Point":
            return c[1], c[0]
        pts = []
        def walk(x):
            if x and isinstance(x[0], (int, float)):
                pts.append(x)
            else:
                for y in x:
                    walk(y)
        walk(c)
        if pts:
            return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)
    except (TypeError, IndexError, KeyError):
        pass
    return None


def read_places(path):
    """Yield dicts with name, lat, lon, state, lga, town, address, type from a file."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
            for row in csv.DictReader(f):
                yield _from_row(row)
    elif suffix in (".zip", ".shp"):                                   # a shapefile (the .zip from the download page)
        try:
            import shapefile
        except ImportError:
            raise ValueError("To read shapefiles, run once:  pip install pyshp")
        import tempfile
        import zipfile
        with tempfile.TemporaryDirectory() as tmp:
            shp = str(path)
            if suffix == ".zip":
                with zipfile.ZipFile(path) as z:
                    z.extractall(tmp)
                found = sorted(Path(tmp).rglob("*.shp"))
                if not found:
                    raise ValueError("That zip file has no .shp file inside.")
                shp = str(found[0])
            sf = shapefile.Reader(shp, encodingErrors="replace")
            for rec in sf.iterShapeRecords():
                row = _from_row(rec.record.as_dict())
                pt = _centre(rec.shape.__geo_interface__) if rec.shape.shapeType else None
                if pt:
                    row["lat"], row["lon"] = pt
                yield row
            sf.close()
    elif suffix == ".xlsx":                                            # an Excel file
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise ValueError("To read Excel files, run once:  pip install openpyxl   (or save the sheet as CSV from Excel).")
        wb = load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            rows = ws.iter_rows(values_only=True)
            head = next(rows, None)
            if not head:
                continue
            head = [str(h).strip() if h is not None else "" for h in head]
            for values in rows:
                yield _from_row(dict(zip(head, values)))
        wb.close()
    elif suffix in (".json", ".geojson"):
        with open(path, encoding="utf-8-sig") as f:
            data = json.load(f)
        if isinstance(data, dict) and "features" in data:              # GeoJSON
            for ft in data["features"]:
                props = ft.get("properties") or {}
                row = _from_row(props)
                pt = _centre(ft.get("geometry"))
                if pt:
                    row["lat"], row["lon"] = pt
                yield row
        elif isinstance(data, dict) and "elements" in data:            # Overpass (OpenStreetMap) JSON
            for el in data["elements"]:
                tags = el.get("tags") or {}
                c = el.get("center") or el
                row = _from_row(tags)
                row["lat"], row["lon"] = c.get("lat", ""), c.get("lon", "")
                row["type"] = tags.get("amenity") or tags.get("healthcare") or ""
                yield row
        elif isinstance(data, list):
            for row in data:
                yield _from_row(row)
        else:
            raise ValueError("This JSON file is not GeoJSON, Overpass JSON or a list of rows.")
    else:
        raise ValueError("Use a .csv, .xlsx, .geojson, .json or shapefile .zip file.")


def import_file(path, source, kind=None, state="", replace=False):
    """Load a file into the places list. Returns (added, skipped)."""
    conn = _connect()
    try:
        if replace:
            conn.execute("DELETE FROM known_places WHERE source = ?", (source,))
        added = skipped = 0
        for row in read_places(path):
            k = kind or guess_kind(row["name"], row["type"])
            ok = add_place(conn, row["name"], row["lat"], row["lon"], row["state"] or state, row["lga"],
                           row["town"], row["address"], k, source)
            added += ok
            skipped += not ok
        conn.commit()
        return added, skipped
    finally:
        conn.close()


# ---------- searching ----------

def _public(r):
    return {"id": r["id"], "name": r["name"], "kind": r["kind"], "state": r["state"], "lga": r["lga"],
            "town": r["town"], "address": ", ".join(x for x in [r["address"], r["town"], r["lga"], r["state"]] if x),
            "lat": r["lat"], "lon": r["lon"], "source": "places"}


def search(name="", town="", state="", lga="", kind="", limit=20):
    """Best name matches first. Looks in the town or LGA you typed; if nothing is there, widens to the whole state."""
    conn = _connect()
    base, args = "SELECT * FROM known_places WHERE 1=1", []
    if state:
        base += " AND state = ?"
        args.append(clean_state(state) or state)
    if kind in KINDS:
        base += " AND kind = ?"
        args.append(kind)
    place_text = (lga or town or "").strip().lower()

    def run(extra_sql="", extra_args=()):
        rows = conn.execute(base + extra_sql, list(args) + list(extra_args)).fetchall()
        scored = []
        for r in rows:
            s = name_score(name, r["name"]) if name else 0.0
            if name and s < MIN_SCORE:
                continue
            scored.append((s, r))
        scored.sort(key=lambda x: (-x[0], x[1]["name"].lower()))
        return scored

    scope = "state" if state else "all"
    scored = []
    if place_text:
        like = f"%{place_text}%"
        scored = run(" AND (LOWER(lga) LIKE ? OR LOWER(town) LIKE ? OR LOWER(address) LIKE ?)", (like, like, like))
        if scored:
            scope = "area"
    if not scored:
        scored = run()
    conn.close()
    return {"results": [_public(r) for _, r in scored[:limit]], "scope": scope}


class PlaceBody(BaseModel):
    name: str = Field(min_length=3, max_length=150)
    lat: float
    lon: float
    state: str = ""
    lga: str = Field(default="", max_length=80)
    town: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=200)
    kind: str = "other"


def _admin(user_id):
    if db.get_role(user_id) != "admin":
        raise HTTPException(403, "This is for the admin only.")


@router.get("/search")
def search_route(name: str = "", town: str = "", state: str = "", lga: str = "", kind: str = "",
                 user_id: int = Depends(current_user_id)):
    return search(name.strip()[:100], town.strip()[:80], state.strip()[:40], lga.strip()[:80], kind.strip(), 20)


@router.get("/areas")
def areas_route(state: str = "", user_id: int = Depends(current_user_id)):
    """What is loaded: how many places per state, or per LGA when a state is given."""
    conn = _connect()
    try:
        total = conn.execute("SELECT COUNT(*) FROM known_places").fetchone()[0]
        if state:
            st = clean_state(state) or state
            rows = conn.execute("""SELECT lga, COUNT(*) n FROM known_places WHERE state = ? AND lga != ''
                                   GROUP BY lga ORDER BY lga""", (st,)).fetchall()
            return {"total": total, "lgas": [{"lga": r["lga"], "count": r["n"]} for r in rows]}
        rows = conn.execute("SELECT state, COUNT(*) n FROM known_places WHERE state != '' GROUP BY state ORDER BY state").fetchall()
        return {"total": total, "states": [{"state": r["state"], "count": r["n"]} for r in rows]}
    finally:
        conn.close()


@router.get("/area")
def area_route(state: str, lga: str, q: str = "", kind: str = "", user_id: int = Depends(current_user_id)):
    """Every place we know in one LGA, optionally narrowed by a few typed letters."""
    out = search(q.strip()[:100], "", state.strip()[:40], lga.strip()[:80], kind.strip(), 300)
    conn = _connect()
    exact = conn.execute("SELECT * FROM known_places WHERE state = ? AND LOWER(lga) = LOWER(?)",
                         (clean_state(state) or state, clean_lga(lga))).fetchall()
    conn.close()
    exact_ids = {r["id"] for r in exact}
    out["results"] = [r for r in out["results"] if r["id"] in exact_ids]     # the LGA only, not the widened state list
    if not q.strip():
        out["results"] = sorted((_public(r) for r in exact if not kind or r["kind"] == kind), key=lambda x: x["name"].lower())[:300]
    return {"results": out["results"]}


@router.post("")
def add_route(body: PlaceBody, user_id: int = Depends(current_user_id)):
    _admin(user_id)
    conn = _connect()
    try:
        new = add_place(conn, body.name, body.lat, body.lon, body.state, body.lga, body.town, body.address, body.kind, "admin")
        conn.commit()
    finally:
        conn.close()
    if not new:
        raise HTTPException(400, "That place was not added. Check the name and the coordinates (they must be inside Nigeria), or it is already on the list.")
    return {"ok": True}


@router.delete("/{place_id}")
def delete_route(place_id: int, user_id: int = Depends(current_user_id)):
    _admin(user_id)
    conn = _connect()
    n = conn.execute("DELETE FROM known_places WHERE id = ?", (place_id,)).rowcount
    conn.commit()
    conn.close()
    if not n:
        raise HTTPException(404, "That place is not on the list.")
    return {"ok": True}
