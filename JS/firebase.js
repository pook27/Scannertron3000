// Import Firebase modules from the SAME version
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-analytics.js';
import { getDatabase, ref, push, set, get, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const database = getDatabase(app);

// Optional: expose Firebase Realtime DB globally
window.firebaseDB = {
  database,
  ref,
  push,
  set,
  get,
  onValue,
  remove,
  update
};

// Export for use in other modules
export {
  database,
  ref,
  push,
  set,
  get,
  onValue,
  update,
  remove,
  auth,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
};

console.log("Firebase initialized:", database);
