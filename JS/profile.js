import { auth, update, database, ref, onValue, onAuthStateChanged, signOut, get, query, orderByChild, equalTo} from './firebase.js';
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

function renderProfileModels(models, containerId = '.row.row-cols-1.row-cols-sm-2.row-cols-lg-3.row-cols-xl-4.g-4') {
    const modelsContainer = document.querySelector(containerId);
    if (!modelsContainer) return;

    if (models.length === 0) {
        modelsContainer.innerHTML = `<p class="text-muted col-12 text-center">No models found.</p>`;
        return;
    }

    modelsContainer.innerHTML = models.map(model => {
        // Fallback logic
        const dateRaw = model.date || model.timestamp || model.createdAt;
        const dateObj = dateRaw ? new Date(dateRaw) : new Date();
        const displayDate = isNaN(dateObj.getTime()) ? 'Unknown Date' : dateObj.toLocaleDateString();
        const displayName = model.name || `Scan ${model.firebaseId ? model.firebaseId.substring(0,5) : 'Unknown'}`;

        return `
        <div class="col" data-model-id="${model.firebaseId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3 thumbnail-container" style="position: relative; cursor: pointer;" data-id="${model.firebaseId}">
                    <img src="Images/sample_model.png" class="card-img-top" alt="${displayName}">
                     <div class="hover-hint" style="position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.5); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; pointer-events: none;">
                        <i class="fas fa-cube"></i> Hover 3D
                    </div>
                </div>
                <div class="card-body">
                    <h5 class="card-title">${displayName}</h5>
                    <p class="card-text text-muted small"><i class="fas fa-calendar me-1"></i>${displayDate}</p>
                    <a href="model.html?scanId=${model.firebaseId}" class="btn btn-outline-primary btn-sm w-100">View Details</a>
                </div>
            </div>
        </div>
    `}).join('');

    const thumbContainers = modelsContainer.querySelectorAll('.thumbnail-container');
    thumbContainers.forEach(thumb => {
        const id = thumb.getAttribute('data-id');
        thumb.addEventListener('mouseenter', () => thumbnailManager.activateThumbnail(thumb, id));
        thumb.addEventListener('mouseleave', () => thumbnailManager.deactivateThumbnail());
    });
}

function loadProfileData(user) {
    const usernameElement = document.getElementById('profile-username');
    const userName = user.displayName || user.email.split('@')[0];
    if (usernameElement) usernameElement.innerHTML = `<i class="fas fa-at me-2"></i>${userName}`;

    const profilePhotoElements = document.querySelectorAll('.profile-photo img, .profile-img, .profile-img-sm');
    profilePhotoElements.forEach(img => { img.src = user.photoURL || "Images/user.jpg"; });

    // 2. Fetch User Stats
    const userMetaRef = ref(database, `users/${user.uid}`);
    get(userMetaRef).then(snapshot => {
        const userData = snapshot.val() || {};
        const statNumbers = document.querySelectorAll('.stat-number');
        if (statNumbers.length >= 3) {
            statNumbers[0].innerHTML = `<i class="fas fa-cube m-2 text-primary"></i>${userData.totalScans || 0}`;
        }
        const bioElement = document.querySelector('.profile-info p.text-muted');
        if (bioElement && userData.bio) bioElement.innerHTML = `<i class="fas fa-info-circle me-2"></i>${userData.bio}`;
    });

    // 3. Fetch My Scans
    const scansRef = ref(database, `users/${user.uid}/scans`);
    onValue(scansRef, snapshot => {
        const scanData = snapshot.val() || {};
        const models = [];
        for (const key in scanData) {
            const scan = scanData[key];
            if (scan.status && scan.status.toLowerCase() === 'completed') {
                if (!scan.firebaseId) scan.firebaseId = key;
                models.push(scan);
            }
        }
        renderProfileModels(models.sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4)); // My Recent Models
    });

    // 4. Fetch Favorites
    loadFavorites(user.uid);
    calculateTotalStats(user.uid);
}

function loadFavorites(uid) {
    const favRef = ref(database, `users/${uid}/favorites`);
    onValue(favRef, async (snapshot) => {
        const favorites = snapshot.val() || {};
        const favModels = [];
        
        const container = document.getElementById('favorites-container');
        if (!container) return;

        // Iterate through favorites: scanId (Global ID) -> ownerUid
        for (const [globalScanId, ownerUid] of Object.entries(favorites)) {
            if (typeof ownerUid === 'string') {
                try {
                    const ownerScansRef = ref(database, `users/${ownerUid}/scans`);
                    const q = query(ownerScansRef, orderByChild('firebaseId'), equalTo(globalScanId));
                    
                    const querySnap = await get(q);

                    if (querySnap.exists()) {
                        // We found the match! (Even though the keys are different)
                        const matchData = Object.values(querySnap.val())[0]; 
                        favModels.push(matchData);
                    } else {
                        // Fallback: If not in user list, try global 'scans' node
                        console.warn(`Scan ${globalScanId} missing from user list, trying global.`);
                        const globalSnap = await get(ref(database, `scans/${globalScanId}`));
                        if (globalSnap.exists()) {
                            const item = globalSnap.val();
                            item.firebaseId = globalScanId;
                            item.name = item.name || "Untitled (Global)"; 
                            favModels.push(item);
                        }
                    }
                } catch (e) {
                    console.error("Error fetching favorite:", e);
                }
            } 
        }
        renderProfileModels(favModels, '#favorites-container');
    });
}

async function calculateTotalStats(userId) {
    try {
        const scansSnapshot = await get(ref(database, `users/${userId}/scans`));
        const scans = scansSnapshot.val() || {};
        let totalLikes = 0, totalViews = 0;
        
        const scanIds = Object.keys(scans);
        for(const id of scanIds) {
             const s = await get(ref(database, `scans/${id}`));
             if(s.exists()) {
                 totalLikes += s.val().likes || 0;
                 totalViews += s.val().views || 0;
             }
        }

        const statNumbers = document.querySelectorAll('.stat-number');
        if (statNumbers.length >= 3) {
            statNumbers[1].innerHTML = `<i class="fas fa-heart m-2 text-danger"></i>${totalLikes}`;
            statNumbers[2].innerHTML = `<i class="fas fa-eye m-2 text-info"></i>${totalViews}`;
        }
    } catch (error) { console.error("Error stats:", error); }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        loadProfileData(user);
        document.getElementById('logout-btn')?.addEventListener('click', async (e) => { e.preventDefault(); try { await signOut(auth); window.location.href = 'login.html'; } catch (error) { console.error(error); } });
    } else { window.location.href = 'login.html'; }
});