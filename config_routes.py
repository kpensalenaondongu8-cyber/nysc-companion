"""/api/config - tells the pages which map to use.

If you give the server a Google Maps key, the PPA pages use Google Maps and Google place search.
If not, they use the free OpenStreetMap map and search.

Give the key in ONE of these ways (before starting the server):
  1. a one-line text file next to app.py named:   google_maps_key.txt
  2. an environment variable:                     GOOGLE_MAPS_KEY=your_key

This key is meant to be seen by the browser (Google Maps needs that). So protect it on Google's side:
in Google Cloud > Credentials, restrict the key to your website address, and to the
"Maps JavaScript API" and "Places API (New)" only. See SETUP-GOOGLE.txt.
"""
import os

from fastapi import APIRouter

router = APIRouter(prefix="/api")

KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "google_maps_key.txt")


def get_key():
    key = os.environ.get("GOOGLE_MAPS_KEY", "").strip()
    if not key and os.path.exists(KEY_FILE):
        with open(KEY_FILE, encoding="utf-8") as f:
            key = f.read().strip()
    return key


@router.get("/config")
def config():
    return {"google_maps_key": get_key()}
