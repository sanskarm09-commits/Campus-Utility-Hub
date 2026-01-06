/**
 * CAMPUS UTILITIES HUB - AUTHENTICATION MODULE
 * * This module serves as the primary gateway for the application. 
 * I designed it to handle two main tasks: identity verification through Firebase Auth 
 * and persistent profile management via Firestore.
 */

import { auth, db } from './firebase-config.js'; 

/**
 * --- UI STATE CONTROLS ---
 * To keep the user experience clean, I used a Single Page approach for the entry gate.
 * These selectors allow us to swap between 'Login' and 'Sign-up' modes without 
 * reloading the page.
 */
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const signupMessage = document.getElementById('signup-message');
const loginMessage = document.getElementById('login-message');

// Logic for switching to the Registration view
if (showSignupLink && loginForm && signupForm) {
    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault(); // Preventing default anchor behavior
        loginForm.style.display = 'none';
        signupForm.style.display = 'block'; 
        showSignupLink.style.display = 'none';
        showLoginLink.style.display = 'inline'; 
        loginMessage.textContent = ''; // Clear stale error messages
    });
}

// Logic for switching back to the Login view
if (showLoginLink && loginForm && signupForm) {
    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'block'; 
        signupForm.style.display = 'none';
        showSignupLink.style.display = 'inline'; 
        showLoginLink.style.display = 'none';
        signupMessage.textContent = ''; 
    });
}

/**
 * --- NEW STUDENT REGISTRATION ---
 * This function creates a new security record in Firebase Auth.
 * Critically, once the account is created, it also initializes a matching 
 * document in the 'users' collection in Firestore so we can assign roles.
 */
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const name = document.getElementById('signup-name').value;
        
        // Basic security check: Firebase requires at least 6 characters for passwords
        if (password.length < 6) {
            signupMessage.textContent = "Password must be at least 6 characters long.";
            signupMessage.style.color = "orange";
            return;
        }

        try {
            // Step 1: Securely create the user credentials
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Step 2: Store the profile data. 
            // I set 'role' to 'student' by default to prevent unauthorized admin access.
            await db.collection("users").doc(user.uid).set({
                name: name,
                email: email,
                role: "student", 
                createdAt: new Date()
            });

            // UI Feedback: Giving the user visual confirmation before the page jumps
            signupMessage.textContent = "Registration successful! Redirecting to dashboard...";
            signupMessage.style.color = "green";
            signupForm.reset();
            
            setTimeout(() => {
                window.location.href = 'dashboard.html'; 
            }, 1500);

        } catch (error) {
            console.error("Sign-up Error:", error.message);
            signupMessage.textContent = `Registration failed: ${error.message}`; 
            signupMessage.style.color = "red";
        }
    });
}

/**
 * --- SECURE LOGIN LOGIC ---
 * Authenticates returning users. If successful, they are moved to the dashboard.
 * I added error handling here to catch common issues like incorrect passwords 
 * without crashing the app.
 */
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            // Firebase handles the heavy lifting of password encryption/checking
            await auth.signInWithEmailAndPassword(email, password);
            
            loginMessage.textContent = "Login successful! Redirecting...";
            loginMessage.style.color = "green";
            loginForm.reset();
            
            // Artificial delay so the success message is actually readable by the human eye
            setTimeout(() => {
                window.location.href = 'dashboard.html'; 
            }, 1500);

        } catch (error) {
            console.error("Login Error:", error.message);
            loginMessage.textContent = "Login failed. Please check your credentials.";
            loginMessage.style.color = "red";
        }
    });
}