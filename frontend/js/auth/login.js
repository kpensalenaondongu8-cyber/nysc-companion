document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('http://localhost:8000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
            // Save token/user context to localStorage
            localStorage.setItem('user', JSON.stringify(data.user || { username }));
            localStorage.setItem('token', data.token || '');
            
            // Redirect to expense dashboard
            window.location.href = 'expenses.html';
        } else {
            alert(data.message || 'Login failed.');
        }
    } catch (err) {
        console.error('Login Error:', err);
        alert('Server error. Make sure your local server is running.');
    }
});