import sqlite3

# Categories offered in the website's drop-downs. Any extra category that
# already exists in the database (for example from the terminal menu) is
# added to this list automatically.
DEFAULT_CATEGORIES = ["Food", "Transport", "Data & Airtime", "Toiletries",
                      "CDS & Contributions", "Other"]


def get_budget(user_id):
    """Return (budget_id, monthly_income) for this user, or None.
    Same rule as the terminal menu: the user's first budget is the active one."""
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    row = conn.execute(
        "SELECT budget_id, monthly_income FROM budgets WHERE user_id = ? ORDER BY budget_id LIMIT 1",
        (user_id,)
    ).fetchone()
    conn.close()
    return row


def save_allowance(user_id, monthly_income):
    """Create the user's budget, or change the allowance if one already exists."""
    existing = get_budget(user_id)
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    if existing:
        conn.execute("UPDATE budgets SET monthly_income = ? WHERE budget_id = ?",
                     (monthly_income, existing[0]))
    else:
        conn.execute("INSERT INTO budgets (user_id, monthly_income) VALUES (?, ?)",
                     (user_id, monthly_income))
    conn.commit()
    conn.close()


def save_limit(budget_id, category, max_amount):
    """Set a category limit. If that category already has one, replace it."""
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    conn.execute(
        """INSERT INTO target_limits (budget_id, category_name, max_amount)
           VALUES (?, ?, ?)
           ON CONFLICT(budget_id, category_name) DO UPDATE SET max_amount = excluded.max_amount""",
        (budget_id, category, max_amount)
    )
    conn.commit()
    conn.close()


def build_dashboard(user_id):
    """Collect everything the expense page shows into one dictionary."""
    conn = sqlite3.connect("nysc_companion.db", timeout=10)

    first, last = conn.execute(
        "SELECT first_name, last_name FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    user = {"id": user_id, "first_name": first, "last_name": last}

    budget_row = conn.execute(
        "SELECT budget_id, monthly_income FROM budgets WHERE user_id = ? ORDER BY budget_id LIMIT 1",
        (user_id,)
    ).fetchone()

    # No allowance yet: the page will show the "set your allowance" step.
    if budget_row is None:
        conn.close()
        return {"user": user, "budget": None, "limits": [], "expenses": [],
                "categories": DEFAULT_CATEGORIES}

    budget_id, income = budget_row

    # Newest first (rowid grows every time a row is added).
    expense_rows = conn.execute(
        """SELECT expense_uuid, category, amount, description, time, date
           FROM expenses WHERE budget_id = ? ORDER BY rowid DESC""",
        (budget_id,)
    ).fetchall()
    expenses = [{"id": r[0], "category": r[1], "amount": r[2],
                 "description": r[3], "time": r[4], "date": r[5]}
                for r in expense_rows]

    spent_by_category = {}
    for e in expenses:
        spent_by_category[e["category"]] = spent_by_category.get(e["category"], 0) + e["amount"]

    limit_rows = conn.execute(
        "SELECT category_name, max_amount FROM target_limits WHERE budget_id = ?",
        (budget_id,)
    ).fetchall()
    conn.close()
    limit_map = dict(limit_rows)

    # One entry per category that has a limit, an expense, or is a default one.
    categories = list(DEFAULT_CATEGORIES)
    for name in list(limit_map) + list(spent_by_category):
        if name not in categories:
            categories.append(name)

    limits = [{"category": name,
               "limit": limit_map.get(name),          # None means no limit set
               "spent": spent_by_category.get(name, 0)}
              for name in categories]

    total_spent = sum(e["amount"] for e in expenses)
    return {
        "user": user,
        "budget": {"id": budget_id, "monthly_income": income,
                   "spent": total_spent, "remaining": income - total_spent,
                   "count": len(expenses)},
        "limits": limits,
        "expenses": expenses,
        "categories": categories,
    }
