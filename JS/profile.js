import { auth, update, database, ref, onValue, onAuthStateChanged, signOut, get } from './firebase.js';

function renderProfileModels(models) {
    const modelsContainer = document.querySelector('.row.row-cols-1.row-cols-sm-2.row-cols-lg-3.row-cols-xl-4.g-4');
    if (!modelsContainer) return;

    if (models.length === 0) {
        modelsContainer.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-cube fa-4x text-muted mb-3"></i>
                <p class="text-muted">No models yet. Start scanning to create your first 3D model!</p>
                <a href="model.html" class="btn btn-primary mt-3">
                    <i class="fas fa-plus me-2"></i>Create Your First Scan
                </a>
            </div>
        `;
        return;
    }

    modelsContainer.innerHTML = models.map(model => `
        <div class="col" data-model-id="${model.firebaseId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3">
                    <img src="Images/sample_model.png" class="card-img-top" alt="${model.name}">
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

function loadProfileData(user) {
    // 1. Display User Auth Data
    const usernameElement = document.getElementById('profile-username');
    const userName = user.displayName || user.email.split('@')[0];
    if (usernameElement) {
        usernameElement.innerHTML = `<i class="fas fa-at me-2"></i>${userName}`;
    }

    // Update profile photo if available (with fallback)
    const profilePhotoElements = document.querySelectorAll('.profile-photo img, .profile-img, .profile-img-sm');
    if (profilePhotoElements) {
        profilePhotoElements.forEach(img => {
            if (user.photoURL) {
                img.src = user.photoURL;
            } else {
                img.src = "Images/user.jpg"; // Corrected relative path
            }
        });
    }

    // 2. Fetch User Stats (Total Scans, Likes, etc)
    const userMetaRef = ref(database, `users/${user.uid}`);
    get(userMetaRef).then(snapshot => {
        const userData = snapshot.val() || {
            totalScans: 0,
            totalLikes: 0,
            totalViews: 0,
            bio: 'Passionate 3D scanner and maker.'
        };
        
        const statNumbers = document.querySelectorAll('.stat-number');
        if (statNumbers.length >= 3) {
            statNumbers[0].innerHTML = `<i class="fas fa-cube m-2 text-primary"></i>${userData.totalScans || 0}`;
            statNumbers[1].innerHTML = `<i class="fas fa-heart m-2 text-danger"></i>${userData.totalLikes || 0}`;
            statNumbers[2].innerHTML = `<i class="fas fa-eye m-2 text-info"></i>${userData.totalViews || 0}`;
        }

        const bioElement = document.querySelector('.profile-info p.text-muted');
        if (bioElement && userData.bio) {
            bioElement.innerHTML = `<i class="fas fa-info-circle me-2"></i>${userData.bio}`;
        }
    }).catch(console.error);

    // 3. Fetch and Display User Scans (Real-time updates)
    const scansRef = ref(database, `users/${user.uid}/scans`);
    
    onValue(scansRef, snapshot => {
        const scanData = snapshot.val() || {};
        const models = [];
        
        for (const key in scanData) {
            const scan = scanData[key];
            
            // Only show completed scans on profile
            if (scan.status && scan.status.toLowerCase() === 'completed') {
                if (!scan.firebaseId) {
                    scan.firebaseId = key;
                }
                // We can save the list key separately if needed
                scan.userListKey = key;
                
                models.push(scan);
            }
        }
        
        // --- CHANGE: Show only the 3 most recent models ---
        const recentModels = models
            .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort Newest First
            .slice(0, 3); // Take top 3
        
        renderProfileModels(recentModels);

        // Update total scans count (based on actual list length)
        const totalScans = models.length;
        const firstStatNumber = document.querySelector('.stat-number');
        if (firstStatNumber) {
            firstStatNumber.innerHTML = `<i class="fas fa-cube m-2 text-primary"></i>${totalScans}`;
        }
    });

    // 4. Update Stats Logic
    calculateTotalStats(user.uid);
}

async function calculateTotalStats(userId) {
    try {
        const scansSnapshot = await get(ref(database, `users/${userId}/scans`));
        const scans = scansSnapshot.val() || {};
        let totalLikes = 0;
        let totalViews = 0;
        
        Object.values(scans).forEach(scan => {
            totalLikes += scan.likes || 0;
            totalViews += scan.views || 0;
        });

        // Update UI immediately for responsiveness
        const statNumbers = document.querySelectorAll('.stat-number');
        if (statNumbers.length >= 3) {
            statNumbers[1].innerHTML = `<i class="fas fa-heart m-2 text-danger"></i>${totalLikes}`;
            statNumbers[2].innerHTML = `<i class="fas fa-eye m-2 text-info"></i>${totalViews}`;
        }

        // Persist to DB if changed
        const userMetaRef = ref(database, `users/${userId}`);
        const currentMeta = (await get(userMetaRef)).val() || {};
        
        if (currentMeta.totalLikes !== totalLikes || currentMeta.totalViews !== totalViews) {
            await update(userMetaRef, {
                totalLikes,
                totalViews,
                lastUpdated: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error("Error calculating total stats:", error);
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        loadProfileData(user);
        
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) {
            userDisplay.innerText = user.displayName || user.email;
        }
        
        // Logout handled by navbar-auth.js usually, but fallback here:
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