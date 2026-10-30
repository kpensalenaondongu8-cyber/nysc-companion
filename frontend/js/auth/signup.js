document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const response = await fetch('http://localhost:8000/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Account created successfully! Redirecting to login...');
            window.location.href = 'login.html';
        } else {
            alert(data.message || 'Registration failed.');
        }
    } catch (err) {
        console.error('Registration Error:', err);
        alert('Server error. Make sure your backend is running.');
    }
});