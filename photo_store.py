"""Saving house pictures.

The browser shrinks each picture to a JPEG and sends it inside the request as text
(a "data URL": data:image/jpeg;base64,....). Here we check it, turn it back into
bytes, and save it as a file in uploads/houses/. The database only stores the file name.
"""
import base64
import re
import secrets
from pathlib import Path

UPLOAD_DIR = Path("uploads") / "houses"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_PHOTOS = 6
MAX_PHOTO_BYTES = 1_500_000          # 1.5 MB each, after the browser has shrunk it

_DATA_URL = re.compile(r"data:image/jpeg;base64,([A-Za-z0-9+/=]+)")


def save_photo(data_url):
    """Save one picture and return its file name. Raises ValueError if it is not a normal JPEG."""
    match = _DATA_URL.fullmatch(data_url.strip())
    if not match:
        raise ValueError("One of the pictures is not a valid photo.")
    try:
        raw = base64.b64decode(match.group(1), validate=True)
    except Exception:
        raise ValueError("One of the pictures is damaged. Please choose it again.")
    if raw[:3] != b"\xff\xd8\xff":                      # every JPEG starts with these bytes
        raise ValueError("One of the pictures is not a JPEG photo.")
    if len(raw) > MAX_PHOTO_BYTES:
        raise ValueError("One of the pictures is too large. Please choose a smaller one.")

    filename = secrets.token_hex(12) + ".jpg"            # random name: nobody can guess it
    (UPLOAD_DIR / filename).write_bytes(raw)
    return filename


def delete_photos(filenames):
    """Remove picture files from disk (used when a house is deleted)."""
    for name in filenames:
        # Only plain file names we created ourselves: never a path.
        if re.fullmatch(r"[0-9a-f]{24}\.jpg", name):
            try:
                (UPLOAD_DIR / name).unlink()
            except FileNotFoundError:
                pass
