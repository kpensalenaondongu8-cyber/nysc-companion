"""Start file for PythonAnywhere. Paste the 5 lines from DEPLOY-PYTHONANYWHERE.txt into the Web tab's WSGI file;
this file does the same job and is also used by the test below.

PythonAnywhere runs apps the older WSGI way. a2wsgi lets the FastAPI app run that way.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
os.chdir(HERE)                      # the database and uploads are found by relative name

from a2wsgi import ASGIMiddleware   # noqa: E402
from app import app as fastapi_app  # noqa: E402

application = ASGIMiddleware(fastapi_app)
