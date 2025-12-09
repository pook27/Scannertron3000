import { database, ref, onValue, onAuthStateChanged, signOut, update, get } from './firebase.js';
import { auth } from './firebase.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

// ====================================================================
//                    3D THUMBNAIL MANAGER (Reused)
// ====================================================================
class ThumbnailManager {
    constructor() {
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animationId = null;
        this.currentContainer = null;
        this.cache = {}; 
    }

    async activateThumbnail(container, scanId) {
        this.currentContainer = container;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const img = container.querySelector('img');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf8f9fa);

        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        this.camera.position.z = 50;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '10';
        
        container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 10, 10);
        this.scene.add(dirLight);

        if(img) img.style.opacity = '0.3';

        try {
            let scanData = this.cache[scanId];
            if (!scanData) {
                const snapshot = await get(ref(database, `scans/${scanId}`));
                scanData = snapshot.val();
                this.cache[scanId] = scanData;
            }
            if (scanData) this.createMesh(scanData);
        } catch (error) {
            console.error("Error loading thumbnail:", error);
        }
        this.animate();
    }

    deactivateThumbnail() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.renderer && this.currentContainer) {
            this.currentContainer.removeChild(this.renderer.domElement);
            this.renderer.dispose();
            const img = this.currentContainer.querySelector('img');
            if(img) img.style.opacity = '1';
        }
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.currentContainer = null;
    }

    animate() {
        if (!this.renderer) return;
        this.animationId = requestAnimationFrame(() => this.animate());
        if (this.scene.children.length > 2) {
            const mesh = this.scene.children[2];
            mesh.rotation.y += 0.02;
            mesh.rotation.x = 0.5;
        }
        this.renderer.render(this.scene, this.camera);
    }

    createMesh(data) {
        const levels = this.extractLevels(data);
        if (levels.length === 0) return;
        const gapThresholdSq = this.calculateGapThreshold(levels);
        const clusteredLevels = levels.map(l => this.clusterLevelByGaps(l, gapThresholdSq));
        const geometry = this.buildConnections(clusteredLevels);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x00b0ff, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        mesh.position.sub(center);

        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        this.camera.position.z = maxDim * 2.0;

        this.scene.add(mesh);
    }

    extractLevels(data) {
        let levels = [];
        if (typeof data === 'object' && data !== null) {
            const sortedKeys = Object.keys(data).filter(k => !isNaN(parseInt(k))).sort((a,b)=>a-b);
            levels = sortedKeys.map(k => {
                const ld = data[k];
                if(Array.isArray(ld)) return ld.map(p=>new THREE.Vector3(p.x,p.y,p.z));
                if(typeof ld==='object') return Object.values(ld).map(p=>new THREE.Vector3(p.x,p.y,p.z));
                return [];
            }).filter(l=>l.length>0);
        }
        return levels;
    }

    calculateGapThreshold(levels) {
        if (!levels[0] || !levels[0].length) return 100;
        const step = (2*Math.PI)/levels[0].length;
        let maxR = 0;
        levels.slice(0,5).forEach(l => l.forEach(p => { const r=Math.sqrt(p.x*p.x+p.y*p.y); if(r>maxR)maxR=r; }));
        return Math.pow(maxR*step*100, 2);
    }

    clusterLevelByGaps(level, thresh) {
        const contours = []; let cur = [];
        for(let i=0; i<level.length; i++) {
            const p1=level[i], p2=level[(i+1)%level.length];
            if(p1.x||p1.y) cur.push(p1);
            if((p1.distanceToSquared(p2)>thresh || (!p2.x&&!p2.y)) && cur.length) {
                if(cur.length>2) contours.push(cur); cur=[];
            }
        }
        if(cur.length>2) contours.push(cur);
        return contours;
    }

    getCentroid(c) { let x=0,y=0; c.forEach(p=>{x+=p.x;y+=p.y}); return new THREE.Vector2(x/c.length,y/c.length); }

    buildConnections(clustered) {
        const geo = new THREE.BufferGeometry(); const verts=[]; const inds=[]; let vIdx=0;
        for(let i=0; i<clustered.length-1; i++) {
            const cur=clustered[i], nxt=clustered[i+1];
            cur.forEach(cA => {
                const centA = this.getCentroid(cA);
                let bestB=null, minD=Infinity;
                nxt.forEach(cB => { const d=centA.distanceToSquared(this.getCentroid(cB)); if(d<minD){minD=d; bestB=cB;} });
                if(bestB) vIdx = this.stitch(verts, inds, cA, bestB, vIdx);
            });
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(inds);
        return geo;
    }

    stitch(verts, inds, cA, cB, vIdx) {
        const nA=cA.length, nB=cB.length;
        const iA=[]; cA.forEach(p=>{iA.push(vIdx++); verts.push(p.x,p.y,p.z)});
        const iB=[]; cB.forEach(p=>{iB.push(vIdx++); verts.push(p.x,p.y,p.z)});
        
        let bestJ=0, minD=Infinity;
        cB.forEach((p,j)=>{ const d=cA[0].distanceToSquared(p); if(d<minD){minD=d; bestJ=j} });
        
        let i=0, j=bestJ, sA=0, sB=0;
        while(sA<nA || sB<nB) {
            const idxA=iA[i%nA], idxA2=iA[(i+1)%nA];
            const idxB=iB[j%nB], idxB2=iB[(j+1)%nB];
            if(sA>=nA) { inds.push(idxA,idxB,idxB2); j++; sB++; continue; }
            if(sB>=nB) { inds.push(idxA,idxB,idxA2); i++; sA++; continue; }
            if(nA-sA > nB-sB) { inds.push(idxA,idxB,idxA2); i++; sA++; }
            else { inds.push(idxA,idxB,idxB2); j++; sB++; }
        }
        return vIdx;
    }
}

const thumbnailManager = new ThumbnailManager();

// ====================================================================
//                    GALLERY MANAGER
// ====================================================================

class GalleryManager {
    constructor(currentUserId) {
        this.galleryItems = [];
        this.currentUserId = currentUserId;
        this.userLikes = new Set(); 
        this.galleryContainer = document.querySelector('.row.row-cols-1.row-cols-sm-2.row-cols-lg-3.row-cols-xl-4.g-4');
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

    // --- NEW LOGIC: FETCH ALL USERS & ALL SCANS ---
    loadGallery(callback) {
        // Fetch the entire 'users' node
        onValue(ref(database, 'users'), snapshot => {
            const usersData = snapshot.val() || {};
            const allScans = [];

            // Loop through every user
            for (const userId in usersData) {
                const user = usersData[userId];
                
                // If user has scans
                if (user.scans) {
                    for (const key in user.scans) {
                        const scan = user.scans[key];
                        
                        // Ensure we use the correct ID for the model link
                        if (!scan.firebaseId) scan.firebaseId = key;
                        
                        // Standardize fields
                        scan.galleryId = scan.firebaseId; 
                        scan.name = scan.name || 'Untitled Scan';
                        scan.likes = scan.likes || 0;
                        scan.views = scan.views || 0;
                        scan.timestamp = scan.date || new Date().toISOString();
                        
                        // Try to get a friendly author name
                        scan.authorId = scan.authorId || userId.substring(0,6) + '...';

                        // Only show completed scans
                        if (scan.status && scan.status.toLowerCase() === 'completed') {
                            allScans.push(scan);
                        }
                    }
                }
            }
            
            this.galleryItems = allScans;
            callback(this.galleryItems);
        });
    }

    async toggleLike(galleryId) {
        // Logic might need adjustment since we aren't using a central 'public_gallery'
        // For now, we can try to find the owner of the scan to update likes.
        // Simplified: Just update local visual state since finding owner is expensive without index.
        const hasLiked = this.userLikes.has(galleryId);
        if (hasLiked) {
             this.userLikes.delete(galleryId);
        } else {
             this.userLikes.add(galleryId);
        }
        // Force re-render to update icon
        filterAndRenderGallery(this.galleryItems);
    }

    async incrementViews(galleryId) {
        // Requires finding the specific path to update views
        console.log("Increment view for", galleryId);
    }
}

function appendGalleryCard(item, isLiked) {
    const likeButtonClass = isLiked ? 'btn-danger' : 'btn-outline-danger';
    const likeIcon = isLiked ? 'fas fa-heart' : 'far fa-heart';
    
    return `
        <div class="col" data-gallery-id="${item.galleryId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3 thumbnail-container" style="position: relative; cursor: pointer;" data-id="${item.galleryId}">
                    <img src="" class="card-img-top gallery-view-trigger" data-id="${item.galleryId}" alt="${item.name}" style="transition: opacity 0.3s;">
                    <div class="hover-hint" style="position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.5); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; pointer-events: none;">
                        <i class="fas fa-cube"></i> Hover 3D
                    </div>
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
                            <span class="like-count">${item.likes}</span>
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
        galleryManager.toggleLike(galleryId);
        return;
    }

    const viewTrigger = e.target.closest('.gallery-view-trigger');
    // Also handle clicking the 3D canvas container
    const thumbTrigger = e.target.closest('.thumbnail-container');
    
    if (viewTrigger || thumbTrigger) {
        const galleryId = (viewTrigger || thumbTrigger).getAttribute('data-id');
        galleryManager.incrementViews(galleryId);
        window.location.href = `model.html?scanId=${galleryId}`;
    }
}

function filterAndRenderGallery(items) {
    const searchWord = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const sortValue = document.getElementById('sortSelect')?.value;
    
    const filteredItems = items.filter(item => {
        return (item.name.toLowerCase().includes(searchWord) ||
               (item.authorId && item.authorId.toLowerCase().includes(searchWord)));
    });

    filteredItems.sort((a, b) => {
        if (sortValue === 'newest') return new Date(b.timestamp) - new Date(a.timestamp);
        if (sortValue === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
        if (sortValue === 'popular') return (b.likes || 0) - (a.likes || 0);
        return 0;
    });

    const container = galleryManager.galleryContainer;
    if (container) {
        container.innerHTML = filteredItems.map(item => 
            appendGalleryCard(item, galleryManager.userLikes.has(item.galleryId))
        ).join('');
        
        container.removeEventListener('click', handleGalleryAction);
        container.addEventListener('click', handleGalleryAction);

        // --- ATTACH HOVER LISTENERS ---
        const thumbContainers = container.querySelectorAll('.thumbnail-container');
        thumbContainers.forEach(thumb => {
            const id = thumb.getAttribute('data-id');
            thumb.addEventListener('mouseenter', () => thumbnailManager.activateThumbnail(thumb, id));
            thumb.addEventListener('mouseleave', () => thumbnailManager.deactivateThumbnail());
        });
    }
}

let galleryManager;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        galleryManager = new GalleryManager(user.uid);
        await galleryManager.loadUserLikes();
        galleryManager.loadGallery(filterAndRenderGallery);

        document.getElementById('searchInput')?.addEventListener('keyup', () => filterAndRenderGallery(galleryManager.galleryItems));
        document.getElementById('sortSelect')?.addEventListener('change', () => filterAndRenderGallery(galleryManager.galleryItems));

        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            try { await signOut(auth); window.location.href = 'login.html'; } catch (error) { console.error(error); }
        });
    } else {
        window.location.href = 'login.html';
    }
});