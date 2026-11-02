# NYSC Companion

## Run it (http://127.0.0.1:8000)

```
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Then open http://127.0.0.1:8000 in your browser. The backend and the website run together from that one command.

## What the app does
- **Home**: save your PPA (name, state, LGA, town) and see what is around it
- **Houses for rent**: search by state, LGA, town, rent and rooms; post or delete your own listings
- **House agents**: find agents covering your area; list yourself as an agent
- **Expenses**: set your monthly allowance, log expenses, set category limits

The first run adds some clearly-labelled *sample* houses and agents (dummy phone numbers) so the pages are not empty. Real listings appear beside them.

## Where things are
- `app.py` – starts the server, serves the pages, includes the old routes
- `api_routes.py` – accounts, login and expense routes
- `locator_routes.py` / `locator_db.py` – PPA, houses and agents routes and database code
- `frontend/html_files/` – login, register, expenses pages
- `frontend/css`, `frontend/js` – styles and scripts
- `main.py` – the original terminal menu (still works)
