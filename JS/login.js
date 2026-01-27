import { auth, provider, signInWithPopup, database, ref, get, set } from './firebase.js';

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then(async (result) => {
            const user = result.user;

            const userRef = ref(database, 'users/' + user.uid);
            
            try {
                const snapshot = await get(userRef);
                
                if (!snapshot.exists()) {
                    console.log("New user detected! Creating database profile...");
                    await set(userRef, {
                        email: user.email,
                        name: user.displayName,
                        totalScans: 0,
                        totalLikes: 0,
                        accountCreated: new Date().toISOString(),
                        
                        scans: {}
                    });
                } else {
                    console.log("Existing user found.");
                }
                // 3. Proceed to the site
                window.location.href = 'index.html';
                
            } catch (error) {
                console.error("Database check failed:", error);
                // Optional: redirect anyway, or show error
                window.location.href = 'index.html'; 
            }
        })
        .catch(error => {
            console.error("Login Failed", error);
        });
});