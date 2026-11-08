"""Place search for the PPA finder, using the Foursquare Places API.

The API key stays on the SERVER. The browser asks us (/api/places/search) and we ask Foursquare,
so nobody can copy the key from the page.

Set the key in ONE of these ways (before starting the server):
  1. an environment variable:   FOURSQUARE_API_KEY=your_key
  2. a one-line text file next to app.py named:   foursquare_key.txt
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException

from api_routes import current_user_id

router = APIRouter(prefix="/api/places")

# Foursquare changed its API in 2025. If a future change breaks the search, only these two lines matter.
FSQ_URL = os.environ.get("FOURSQUARE_URL", "https://places-api.foursquare.com/places/search")
FSQ_VERSION = os.environ.get("FOURSQUARE_VERSION", "2025-06-17")

KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "foursquare_key.txt")

_cache = {}        # (query, near) -> (time, results): saves your free allowance
_calls = {}        # user id -> [times]: stops one account from using it all up
CACHE_SECONDS = 24 * 3600
MAX_CALLS_PER_HOUR = 40


def get_key():
    key = os.environ.get("FOURSQUARE_API_KEY", "").strip()
    if not key and os.path.exists(KEY_FILE):
        with open(KEY_FILE, encoding="utf-8") as f:
            key = f.read().strip()
    return key


def _pick(d, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d


def tidy(place):
    """One Foursquare place -> the small shape the page needs (works with the old and new API shapes)."""
    loc = place.get("location") or {}
    lat = place.get("latitude")
    lon = place.get("longitude")
    if lat is None:
        lat = _pick(place, "geocodes", "main", "latitude")
        lon = _pick(place, "geocodes", "main", "longitude")
    if lat is None or lon is None or not place.get("name"):
        return None
    cats = [c.get("name") for c in (place.get("categories") or []) if isinstance(c, dict) and c.get("name")]
    return {
        "name": place["name"],
        "address": loc.get("formatted_address") or ", ".join(
            x for x in [loc.get("address"), loc.get("locality"), loc.get("region")] if x),
        "lat": lat, "lon": lon,
        "state": (loc.get("region") or "").replace(" State", ""),
        "lga": "",
        "town": loc.get("locality") or "",
        "kind": cats[0] if cats else "",
    }


@router.get("/status")
def status(user_id: int = Depends(current_user_id)):
    return {"enabled": bool(get_key())}


@router.get("/search")
def search(q: str, near: str, user_id: int = Depends(current_user_id)):
    q, near = q.strip()[:100], near.strip()[:100]
    if not q or not near:
        raise HTTPException(400, "Type the PPA name and the town.")
    key = get_key()
    if not key:
        raise HTTPException(503, "Place search is not set up on this server yet.")

    now = time.time()
    hit = _cache.get((q.lower(), near.lower()))
    if hit and now - hit[0] < CACHE_SECONDS:
        return {"results": hit[1]}

    recent = [t for t in _calls.get(user_id, []) if now - t < 3600]
    if len(recent) >= MAX_CALLS_PER_HOUR:
        raise HTTPException(429, "Too many searches. Please wait a little and try again.")
    _calls[user_id] = recent + [now]

    params = urllib.parse.urlencode({"query": q, "near": near + ", Nigeria", "limit": 30})
    req = urllib.request.Request(FSQ_URL + "?" + params, headers={
        "Authorization": "Bearer " + key,
        "X-Places-Api-Version": FSQ_VERSION,
        "Accept": "application/json",
        "User-Agent": "nysc-companion",
    })
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise HTTPException(502, "The place-search key was refused. Check FOURSQUARE_API_KEY.")
        if e.code == 429:
            raise HTTPException(502, "The place-search allowance is used up for now.")
        raise HTTPException(502, "The place-search service returned an error (%s)." % e.code)
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise HTTPException(502, "Could not reach the place-search service.")

    results = [r for r in (tidy(p) for p in data.get("results", [])) if r]
    if len(_cache) > 500:
        _cache.clear()
    _cache[(q.lower(), near.lower())] = (now, results)
    return {"results": results}
