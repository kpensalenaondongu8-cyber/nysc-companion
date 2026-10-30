document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('userDisplayName').textContent = `Welcome, ${user.username}`;

    // Handle Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });

    // Handle Form Submission & Fetch Initial Data
    loadBalance();
    loadExpenseHistory();

    document.getElementById('addExpenseForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const category = document.getElementById('expenseCategory').value;
        const amount = parseFloat(document.getElementById('expenseAmount').value);
        const description = document.getElementById('expenseDescription').value;

        try {
            const response = await fetch('http://localhost:8000/expenses/expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user.username, category, amount, description })
            });

            if (response.ok) {
                document.getElementById('addExpenseForm').reset();
                loadBalance();
                loadExpenseHistory();
            } else {
                alert('Failed to add expense.');
            }
        } catch (err) {
            console.error('Add Expense Error:', err);
        }
    });
});

async function loadBalance() {
    // Implement fetch balance API call
}

async function loadExpenseHistory() {
    // Implement fetch expenses list API call
}