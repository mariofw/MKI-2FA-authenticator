// Common configuration
const CONFIG = {
    userStorageKey: 'userManagement.users',
    adminEmails: ['admin@admin.com', 'mrakaazwar@gmail.com']
};

const LOGIN_ATTEMPTS_CONFIG = {
    maxAttempts: 5,
    timeoutSeconds: 30,
    storageKey: 'userManagement.loginAttempts'
};

// DOM elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');

// Utility functions
const utils = {
    getUsers: () => JSON.parse(localStorage.getItem(CONFIG.userStorageKey)) || [],
    
    saveUsers: (users) => localStorage.setItem(CONFIG.userStorageKey, JSON.stringify(users)),
    
    findUserByEmail: (email) => utils.getUsers().find(u => u.email === email),

    getLoginAttempts: (email) => {
        const attempts = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_CONFIG.storageKey)) || {};
        return attempts[email] || { count: 0, timeout: 0 };
    },
    
    setLoginAttempts: (email, data) => {
        const attempts = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_CONFIG.storageKey)) || {};
        attempts[email] = data;
        localStorage.setItem(LOGIN_ATTEMPTS_CONFIG.storageKey, JSON.stringify(attempts));
    },

    resetLoginAttempts: (email) => {
        const attempts = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_CONFIG.storageKey)) || {};
        delete attempts[email];
        localStorage.setItem(LOGIN_ATTEMPTS_CONFIG.storageKey, JSON.stringify(attempts));
    },
    
    isAdmin: (email) => CONFIG.adminEmails.includes(email),
    
    showLoading: (button) => {
        const originalText = button.textContent;
        button.innerHTML = '<span class="loading"></span> Processing...';
        button.disabled = true;
        return () => {
            button.textContent = originalText;
            button.disabled = false;
        };
    }
};

// 2FA functions
const twoFactorAuth = {
    require2FA: (email) => {
        if (!email) {
            alert("No email provided");
            return;
        }
        localStorage.setItem("currentUser.email", email);
        const is2faEnabled = localStorage.getItem(`2fa.${email}.enabled`) === "true";

        if (is2faEnabled) {
            window.location.href = "verify-2fa.html";
        } else {
            window.location.href = "setup-2fa.html";
        }
    },

    verifyToken: (token, secret) => {
        if (!token || token.length !== 6) return false;
        
        try {
            // Use the OTP library from the global scope (included in HTML)
            return otplib.authenticator.verify({ 
                token, 
                secret 
            });
        } catch (error) {
            console.error('Token verification error:', error);
            return false;
        }
    }
};

function redirectToPanel(email) {
    if (utils.isAdmin(email)) {
        window.location.href = "admin.html";
    } else {
        window.location.href = "home.html";
    }
}

function processLogin(email) {
    localStorage.setItem("currentUser.email", email);
    const is2faEnabled = localStorage.getItem(`2fa.${email}.enabled`) === "true";
    if (is2faEnabled) {
        window.location.href = "verify-2fa.html";
    } else {
        redirectToPanel(email);
    }
}

// Google OAuth handler
function handleCredentialResponse(response) {
    const id_token = response.credential;
    
    try {
        const payload = JSON.parse(atob(id_token.split('.')[1]));
        const users = utils.getUsers();
        const existingUser = utils.findUserByEmail(payload.email);
        
        if (!existingUser) {
            const newUser = {
                username: payload.name || 'Google User',
                email: payload.email
            };
            users.push(newUser);
            utils.saveUsers(users);
        }

        processLogin(payload.email);
    } catch (error) {
        console.error('Google OAuth error:', error);
        alert('Authentication failed. Please try again.');
    }
}

// Form switching
showRegister?.addEventListener('click', e => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
});

showLogin?.addEventListener('click', e => {
    e.preventDefault();
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
});

// Manual login handler
loginForm?.querySelector('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email') || e.target.querySelector('input[type="email"]').value;
    const password = formData.get('password') || e.target.querySelector('input[type="password"]').value;

    const loginAttempts = utils.getLoginAttempts(email);
    const now = Date.now();

    if (loginAttempts.count >= LOGIN_ATTEMPTS_CONFIG.maxAttempts && loginAttempts.timeout > now) {
        const remainingSeconds = Math.ceil((loginAttempts.timeout - now) / 1000);
        alert(`Too many failed login attempts. Please try again in ${remainingSeconds} seconds.`);
        return;
    }

    const handleInvalidLogin = () => {
        const newAttempts = {
            count: (loginAttempts.count || 0) + 1,
            timeout: 0
        };

        if (newAttempts.count >= LOGIN_ATTEMPTS_CONFIG.maxAttempts) {
            newAttempts.timeout = Date.now() + (LOGIN_ATTEMPTS_CONFIG.timeoutSeconds * 1000);
            const remainingSeconds = LOGIN_ATTEMPTS_CONFIG.timeoutSeconds;
            alert(`Too many failed login attempts. Please try again in ${remainingSeconds} seconds.`);
        } else {
            alert('Invalid credentials');
        }
        utils.setLoginAttempts(email, newAttempts);
    };

    // Demo credentials check
    if ((email === 'admin@admin.com' && password === 'admin') ||
        (email === 'user@user.com' && password === 'user')) {
        utils.resetLoginAttempts(email);
        processLogin(email);
    } else {
        // Check stored users
        const user = utils.findUserByEmail(email);
        if (user && user.password === password) {
            utils.resetLoginAttempts(email);
            processLogin(email);
        } else {
            handleInvalidLogin();
        }
    }
});

// Manual registration handler
registerForm?.querySelector('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get('username') || e.target.querySelector('input[type="text"]').value;
    const email = formData.get('email') || e.target.querySelector('input[type="email"]').value;
    const password = formData.get('password') || e.target.querySelector('input[type="password"]').value;

    if (!username || !email || !password) {
        alert('Please fill all fields');
        return;
    }

    const users = utils.getUsers();
    
    if (utils.findUserByEmail(email)) {
        alert('User already exists!');
        return;
    }

    const newUser = { username, email, password };
    users.push(newUser);
    utils.saveUsers(users);
    
    alert('Registration successful! Please login.');
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
});

// Logout functionality
document.getElementById('logout-button')?.addEventListener('click', () => {
    localStorage.removeItem("currentUser.email");
    window.location.href = 'index.html';
});