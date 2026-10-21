import sqlite3

def init__db():
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()
    print("Opening data base")

    cursor.execute("PRAGMA foreign_keys = ON;")


    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            middle_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            number TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL                 
             );
    """)
    print("Created users table")

    cursor.execute("""
       CREATE TABLE IF NOT EXISTS budgets (
         budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL,
         monthly_income FLOAT NOT NULL, 
         FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE              
        );
    """)
    print("created budget table")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS target_limits (
            limit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            budget_id INTEGER NOT NULL,
            category_name TEXT NOT NULL,
            max_amount REAL NOT NULL,
            UNIQUE(budget_id, category_name),                                                                                    
            FOREIGN KEY (budget_id) REFERENCES budgets (budget_id) ON DELETE CASCADE
        );
    """)
    print("created target_limit table")

    cursor.execute("""
       CREATE TABLE IF NOT EXISTS expenses(
        expense_uuid TEXT PRIMARY KEY,
        budget_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        time TEXT NOT NULL,
        date TEXT NOT NULL,
        FOREIGN KEY (budget_id) REFERENCES budgets (budget_id) ON DELETE CASCADE          
      );
    """)
    print("created expenses table")

    
    conn.commit()
    print("Commiting data base")
    conn.close()
    print("closing data base")
    print("Data tables created successfully!")
if __name__ == "__main__":
    init__db()