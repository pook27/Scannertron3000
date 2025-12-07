import { database, ref, onValue, onAuthStateChanged, signOut, update, get } from './firebase.js';
import { auth } from './firebase.js';

class GalleryManager {
    constructor(currentUserId) {
        this.galleryItems = [];
        this.currentUserId = currentUserId;
        this.userLikes = new Set(); // Track which items current user has liked
        this.galleryContainer = document.querySelector('.row.row-cols-1.row-cols-sm-2.row-cols-lg-3.row-cols-xl-4.g-4');
    }

    getRef() {
        return ref(database, 'public_gallery'); 
    }

    async loadUserLikes() {
        try {
            const snapshot = await get(ref(database, `users/${this.currentUserId}/likes`));
            const likes = snapshot.val() || {};
            this.userLikes = new Set(Object.keys(likes));
        } catch (error) {
            console.error("Error loading user likes:", error);
        }
    }

    loadGallery(callback) {
        onValue(this.getRef(), snapshot => {
            const data = snapshot.val() || {};
            const items = [];
            for (const key in data) {
                const item = data[key];
                item.galleryId = key;
                item.name = item.name || 'Untitled Public Model';
                item.likes = item.likes || 0;
                item.views = item.views || 0;
                item.timestamp = item.date || new Date().toISOString();
                item.authorId = item.authorId || 'Anonymous';
                items.push(item);
            }
            this.galleryItems = items;
            callback(this.galleryItems);
        });
    }

    async toggleLike(galleryId) {
        const itemRef = ref(database, `public_gallery/${galleryId}`);
        const userLikeRef = ref(database, `users/${this.currentUserId}/likes/${galleryId}`);
        
        try {
            const snapshot = await get(itemRef);
            const item = snapshot.val();
            
            if (!item) {
                console.error("Item not found");
                return;
            }

            const currentLikes = item.likes || 0;
            const hasLiked = this.userLikes.has(galleryId);

            if (hasLiked) {
                // Unlike
                await update(itemRef, { likes: Math.max(0, currentLikes - 1) });
                await update(userLikeRef, null); // Remove like record
                this.userLikes.delete(galleryId);
                console.log(`Unliked model ${galleryId}`);
            } else {
                // Like
                await update(itemRef, { likes: currentLikes + 1 });
                await update(userLikeRef, { timestamp: new Date().toISOString() });
                this.userLikes.add(galleryId);
                console.log(`Liked model ${galleryId}`);
                
                // Update author's total likes
                if (item.authorId) {
                    // Find author's UID (this is simplified - you might need better author tracking)
                    await this.updateAuthorLikes(item.authorId, 1);
                }
            }

        } catch (error) {
            console.error("Error toggling like:", error);
            alert("Failed to update like. Please try again.");
        }
    }

    async updateAuthorLikes(authorId, increment) {
        // This assumes authorId is the user's display name
        // You might need to map display names to UIDs for accurate tracking
        // For now, we'll skip this or implement a simplified version
        console.log(`Author ${authorId} received ${increment} like(s)`);
    }

    async incrementViews(galleryId) {
        const itemRef = ref(database, `public_gallery/${galleryId}`);
        
        try {
            const snapshot = await get(itemRef);
            const item = snapshot.val();
            
            if (item) {
                await update(itemRef, { views: (item.views || 0) + 1 });
            }
        } catch (error) {
            console.error("Error incrementing views:", error);
        }
    }
}

function appendGalleryCard(item, isLiked) {
    const likeButtonClass = isLiked ? 'btn-danger' : 'btn-outline-danger';
    const likeIcon = isLiked ? 'fas fa-heart' : 'far fa-heart';
    
    return `
        <div class="col" data-gallery-id="${item.galleryId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3">
                    <img src="/Final Project Site/Images/sample_model.png" class="card-img-top gallery-view-trigger" data-id="${item.galleryId}" alt="${item.name}" style="cursor: pointer;">
                </div>
                <div class="card-body">
                    <h5 class="card-title gallery-view-trigger" data-id="${item.galleryId}" style="cursor: pointer;">
                        <i class="fas fa-cube me-2 text-primary"></i>
                        ${item.name}
                    </h5>
                    <p class="card-text text-muted">
                        <i class="fas fa-user me-1"></i>
                        By ${item.authorId}
                    </p>
                    <div class="d-flex justify-content-between align-items-center">
                        <button class="btn ${likeButtonClass} btn-sm like-btn" data-id="${item.galleryId}">
                            <i class="${likeIcon} me-1"></i>${isLiked ? 'Liked' : 'Like'}
                        </button>
                        <div class="text-muted small">
                            <i class="fas fa-heart me-1 text-danger"></i>
                            <span class="like-count" data-likes-count="${item.galleryId}">${item.likes}</span>
                            <i class="fas fa-eye ms-2 me-1 text-info"></i>
                            <span>${item.views}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function handleGalleryAction(e) {
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
        const galleryId = likeBtn.getAttribute('data-id');
        console.log(`[ACTION LOG] Like button pressed for Gallery Model ID: ${galleryId}`);
        galleryManager.toggleLike(galleryId);
        return;
    }

    const viewTrigger = e.target.closest('.gallery-view-trigger');
    if (viewTrigger) {
        const galleryId = viewTrigger.getAttribute('data-id');
        console.log(`[ACTION LOG] View triggered for Gallery Model ID: ${galleryId}`);
        galleryManager.incrementViews(galleryId);
        // Here you would open a modal or navigate to a detail page
        alert(`Viewing model ${galleryId}. This would open a 3D viewer.`);
    }
}

function filterAndRenderGallery(items) {
    const searchWord = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const sortValue = document.getElementById('sortSelect')?.value;
    
    // 1. Filtering
    const filteredItems = items.filter(item => {
        const textMatch = (item.name.toLowerCase().includes(searchWord) ||
                           (item.authorId && item.authorId.toLowerCase().includes(searchWord)));
        return textMatch;
    });

    // 2. Sorting
    filteredItems.sort((a, b) => {
        if (sortValue === 'newest') {
            return new Date(b.timestamp) - new Date(a.timestamp);
        } else if (sortValue === 'oldest') {
            return new Date(a.timestamp) - new Date(b.timestamp);
        } else if (sortValue === 'popular') {
            return (b.likes || 0) - (a.likes || 0);
        } else if (sortValue === 'views') {
            return (b.views || 0) - (a.views || 0);
        }
        return 0;
    });

    // 3. Render
    const container = galleryManager.galleryContainer;
    if (container) {
        container.innerHTML = filteredItems.map(item => 
            appendGalleryCard(item, galleryManager.userLikes.has(item.galleryId))
        ).join('');
        
        container.removeEventListener('click', handleGalleryAction);
        container.addEventListener('click', handleGalleryAction);
    }
}

let galleryManager;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        galleryManager = new GalleryManager(user.uid);
        
        // Load user's likes first
        await galleryManager.loadUserLikes();
        
        // Then load and render gallery
        galleryManager.loadGallery(filterAndRenderGallery);

        // Attach filter listeners
        document.getElementById('searchInput')?.addEventListener('keyup', () => 
            filterAndRenderGallery(galleryManager.galleryItems)
        );
        document.getElementById('sortSelect')?.addEventListener('change', () => 
            filterAndRenderGallery(galleryManager.galleryItems)
        );

        // Logout logic
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