// JS/gallery.js

import { database, ref, onValue, onAuthStateChanged, signOut } from './firebase.js';
import { auth } from './firebase.js';

// --- Core Data Management ---
class GalleryManager {
    constructor() {
        this.galleryItems = [];
        this.galleryContainer = document.querySelector('.row.row-cols-1.row-cols-sm-2.row-cols-lg-3.row-cols-xl-4.g-4');
    }

    getRef() {
        // Fetch from the public root node
        return ref(database, 'public_gallery'); 
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
                item.timestamp = item.timestamp || new Date().toISOString();
                items.push(item);
            }
            this.galleryItems = items;
            callback(this.galleryItems);
        });
    }
}

// --- DOM Rendering and Actions ---

function appendGalleryCard(item) {
    // The gallery.html uses a simple 'Like' button with a counter.
    return `
        <div class="col" data-gallery-id="${item.galleryId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3">
                    <img src="/Final Project Site/Images/sample_model.png" class="card-img-top gallery-view-trigger" data-id="${item.galleryId}" alt="${item.name}">
                </div>
                <div class="card-body">
                    <h5 class="card-title gallery-view-trigger" data-id="${item.galleryId}">
                        <i class="fas fa-cube me-2 text-primary"></i>
                        ${item.name}
                    </h5>
                    <p class="card-text text-muted">
                        <i class="fas fa-user me-1"></i>
                        By ${item.authorId || 'Community'}
                    </p>
                    <div class="d-flex justify-content-between align-items-center">
                        <button class="btn btn-outline-danger btn-sm action-btn" data-action="Like" data-id="${item.galleryId}">
                            <i class="fas fa-heart me-1"></i>Like
                        </button>
                        <div class="text-muted small">
                            <i class="fas fa-heart me-1 text-danger"></i>
                            <span data-likes-count="${item.galleryId}">${item.likes} likes</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function handleGalleryAction(e) {
    const target = e.target.closest('.action-btn, .gallery-view-trigger');
    if (!target) return;
    
    const action = target.getAttribute('data-action') || 'View';
    const galleryId = target.getAttribute('data-id');

    if (action === 'Like') {
        console.log(`[ACTION LOG] Like button pressed for Gallery Model ID: ${galleryId}.`);
        // Future: Implement Firebase Transaction to increment like count
        alert('Like action simulated. Check console.');
    } else if (action === 'View') {
        console.log(`[ACTION LOG] View triggered for Gallery Model ID: ${galleryId}.`);
        alert('Model viewing simulated. Check console.');
    }
}

// --- Filtering/Sorting Logic ---

function filterAndRenderGallery(items) {
    // Get filter values from gallery.html
    const searchWord = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const sortValue = document.getElementById('sortSelect')?.value;
    
    // 1. Filtering
    const filteredItems = items.filter(item => {
        // Filter by text (name, author)
        const textMatch = (item.name.toLowerCase().includes(searchWord) ||
                           (item.authorId && item.authorId.toLowerCase().includes(searchWord)));
        
        return textMatch;
    });

    // 2. Sorting (Matching HTML options)
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
        return 0; // Sort by database key or initial load order
    });

    // Clear and re-render the card container
    const container = galleryManager.galleryContainer;
    if (container) {
        container.innerHTML = filteredItems.map(appendGalleryCard).join('');
        container.removeEventListener('click', handleGalleryAction);
        container.addEventListener('click', handleGalleryAction);
    }
}

let galleryManager;
// --- Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        galleryManager = new GalleryManager();
        galleryManager.loadGallery(filterAndRenderGallery);

        // Attach listeners to the filter controls
        document.getElementById('searchInput')?.addEventListener('keyup', () => filterAndRenderGallery(galleryManager.galleryItems));
        document.getElementById('sortSelect')?.addEventListener('change', () => filterAndRenderGallery(galleryManager.galleryItems));

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