import { auth, onAuthStateChanged, signOut } from './firebase.js';

const loginLink = document.getElementById('nav-login-link');

if (loginLink) {
    // 1. LISTEN: Update the button text/icon whenever auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Logged In -> Show "Log out"
            loginLink.innerHTML = '<i class="fas fa-sign-out-alt me-1"></i>Log out';
            loginLink.href = "#"; 
        } else {
            // Logged Out -> Show "Sign in"
            loginLink.innerHTML = '<i class="fas fa-sign-in-alt me-1"></i>Sign in';
            loginLink.href = "login.html";
        }
    });

    // 2. ACTION: Handle the click event
    loginLink.addEventListener('click', async (e) => {
        // Only run logout logic if the user is currently signed in
        if (auth.currentUser) {
            e.preventDefault(); // Stop the link from jumping immediately
            
            try {
                await signOut(auth);
                console.log("User signed out");
                // Redirect to Home or Login page after successful logout
                window.location.href = 'index.html'; 
            } catch (error) {
                console.error("Error signing out:", error);
            }
        }
        // If not signed in, the link works normally (goes to login.html)
    });
}