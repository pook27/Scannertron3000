import { auth, provider, signInWithPopup, onAuthStateChanged } from './firebase.js';

document.getElementById('login-btn').addEventListener('click', () => {
    console.log("Login button clicked");
  signInWithPopup(auth, provider)
    .then(result => {
      console.log("Signed in:", result.user);
      window.location.href = 'index.html';
    })
    .catch(error => {
      console.error("Login Failed", error);
    });
});