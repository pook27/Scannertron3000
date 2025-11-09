// JS/profile.js

import { auth, database, ref, onValue, onAuthStateChanged, signOut, get } from './firebase.js';

// --- Rendering Logic ---

function renderProfileModels(models) {
    // Target the Models Section container
    const modelsContainer = document.querySelector('.row.row-cols-1.row-cols-sm-2.row-cols-lg-3.row-cols-xl-4.g-4');
    if (!modelsContainer) return;

    modelsContainer.innerHTML = models.map(model => `
        <div class="col" data-model-id="${model.firebaseId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3">
                    <img src="/Final Project Site/Images/sample_model.png" class="card-img-top" alt="${model.name}">
                </div>
                <div class="card-body">
                    <h5 class="card-title">
                        <i class="fas fa-cube me-2 text-primary"></i>
                        ${model.name}
                    </h5>
                    <p class="card-text text-muted small">
                        <i class="fas fa-calendar me-1"></i>
                        Created: ${new Date(model.date).toLocaleDateString()}
                    </p>
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="text-muted small">
                            <i class="fas fa-heart me-1 text-danger"></i>
                            ${model.likes || 0} likes
                        </div>
                        <div class="text-muted small">
                            <i class="fas fa-eye me-1 text-info"></i>
                            ${model.views || 0} views
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}


// --- Data Loading and Connection ---

function loadProfileData(user) {
    // 1. Display User Auth Data (Username)
    const usernameElement = document.querySelector('.profile-header + .row h2');
    if (usernameElement) {
        // Use displayName if available, otherwise use the part of the email before @
        const userName = user.displayName || user.email.split('@')[0];
        usernameElement.innerHTML = `<i class="fas fa-at me-2"></i>${userName}`;
    }

    // 2. Fetch User-specific metadata (Stats)
    // We assume the stats in profile.html correspond to Total Scans, Total Likes, and Total Views
    const userMetaRef = ref(database, `users/${user.uid}/metadata`);
    get(userMetaRef).then(snapshot => {
        const userData = snapshot.val() || {};
        
        const statBoxes = document.querySelectorAll('.stat-number');
        
        // Hardcoded mapping to the three stat boxes in profile.html
        if (statBoxes[0]) statBoxes[0].innerHTML = `<i class="fas fa-cube m-2 text-primary"></i>${userData.totalScans || 0}`;
        if (statBoxes[1]) statBoxes[1].innerHTML = `<i class="fas fa-heart m-2 text-danger"></i>${userData.totalLikes || 0}`;
        if (statBoxes[2]) statBoxes[2].innerHTML = `<i class="fas fa-eye m-2 text-info"></i>${userData.totalViews || 0}`;
        
    }).catch(error => console.error("Error fetching user metadata:", error));


    // 3. Fetch User Scans (Models Section)
    const scansRef = ref(database, `users/${user.uid}/scans`);
    // Use onValue for real-time updates of the user's models
    onValue(scansRef, snapshot => {
        const scanData = snapshot.val() || {};
        const models = [];
        for (const key in scanData) {
            const scan = scanData[key];
            scan.firebaseId = key;
            models.push(scan);
        }
        // Show the 4 most recent models for the profile page
        const recentModels = models.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
        renderProfileModels(recentModels);
    });
}


// --- Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadProfileData(user);
        
        // Logout button logic
        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Error signing out:", error);
            }
        });
    } else {
        window.location.href = 'login.html';
    }
});