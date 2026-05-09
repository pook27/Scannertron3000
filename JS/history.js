import { database, ref, onValue, remove, onAuthStateChanged, signOut, get, update } from './firebase.js';
import { auth } from './firebase.js';
import * as THREE from 'three';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

// ====================================================================
//                    3D THUMBNAIL MANAGER & EXPORTER
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

            if (scanData) {
                // Generate the mesh and add to scene
                const mesh = this.generateMesh(scanData);
                if (mesh) {
                    this.scene.add(mesh);
                    this.fitCameraToMesh(mesh);
                }
            }
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
        
        // Auto-rotate mesh (assumes mesh is at index 2)
        if (this.scene.children.length > 2) { 
            const mesh = this.scene.children[2];
            mesh.rotation.y += 0.02; 
            mesh.rotation.x = 0.5;   
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    // --- MESH GENERATION (Refactored to return Mesh) ---
    generateMesh(data) {
        const levels = this.extractLevels(data);
        if (levels.length === 0) return null;

        const gapThresholdSq = this.calculateGapThreshold(levels);
        const clusteredLevels = levels.map(l => this.clusterLevelByGaps(l, gapThresholdSq));
        const geometry = this.buildConnections(clusteredLevels);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x00b0ff,
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        
        // Center Geometry
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        mesh.position.sub(center);

        return mesh;
    }

    fitCameraToMesh(mesh) {
        if (!mesh || !this.camera) return;
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        this.camera.position.z = maxDim * 2.0;
    }

    // Helpers
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
//                    EXISTING HISTORY MANAGER
// ====================================================================

class ScanManager {
    constructor(userID) {
        this.scans = [];
        this.uid = userID;
        this.scanContainer = document.querySelector('.row.row-cols-1.row-cols-sm-2.row-cols-lg-3.row-cols-xl-4.g-4'); 
    }

    getRef() {
        return ref(database, `users/${this.uid}/scans`);
    }

    loadScans(callback) {
        onValue(this.getRef(), snapshot => {
            const data = snapshot.val() || {};
            const scans = [];
            for (const key in data) {
                const scan = data[key];
                
                scan.name = scan.name || 'Untitled Scan';
                scan.status = scan.status || 'Unknown';
                scan.date = scan.date || new Date().toISOString();
                // Ensure privacy field exists (default false)
                scan.private = scan.private === true;
                
                scan.userListId = key; 
                if (!scan.firebaseId) scan.firebaseId = key; 

                scans.push(scan);
            }
            this.scans = scans.sort((a, b) => new Date(b.date) - new Date(a.date));
            callback(this.scans);
        });
    }
    
    removeScan(userListId) {
        return remove(ref(database, `users/${this.uid}/scans/${userListId}`));
    }

    togglePrivacy(userListId, currentStatus, firebaseId) {
        // Toggle user scan list
        update(ref(database, `users/${this.uid}/scans/${userListId}`), {
            private: !currentStatus
        });
        // Toggle global scan data
        update(ref(database, `scans/${firebaseId}`), {
            private: !currentStatus
        });
    }

    retryScan(id) {
        // Placeholder for retry logic
        alert("Retry logic implementation required.");
    }
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric' 
    });
}

function getStatusIcon(status) {
    status = status.toLowerCase();
    if (status === 'completed') return 'fa-check-circle text-success';
    if (status === 'scanning') return 'fa-spinner fa-spin text-warning';
    if (status === 'failed') return 'fa-times-circle text-danger';
    return 'fa-question-circle text-muted';
}

function appendScanCard(scan) {
    const isCompleted = scan.status.toLowerCase() === 'completed';
    const isFailed = scan.status.toLowerCase() === 'failed';
    const isScanning = scan.status.toLowerCase() === 'scanning';

    return `
        <div class="col" data-scan-id="${scan.firebaseId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3 thumbnail-container" style="position: relative; cursor: pointer;" data-id="${scan.firebaseId}">
                    <img src="Images/New Project.png" class="card-img-top" alt="${scan.name}" style="transition: opacity 0.3s;">
                    <div class="hover-hint" style="position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.5); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; pointer-events: none;">
                        <i class="fas fa-cube"></i> Hover 3D
                    </div>
                </div>
                <div class="card-body">
                    <h5 class="card-title">
                        <i class="fas fa-cube me-2 text-primary"></i>
                        ${scan.name}
                    </h5>
                    <p class="card-text text-muted small">
                        <i class="fas fa-calendar me-1"></i>
                        Scanned: ${formatDate(new Date(scan.date))}
                    </p>
                    <p class="card-text text-muted small">
                        <i class="fas ${getStatusIcon(scan.status)} me-1"></i>
                        Status: ${scan.status}
                    </p>
                    <div class="mb-3">
                        <button class="btn ${scan.private ? 'btn-warning text-dark' : 'btn-success'} btn-sm action-btn w-100" 
                                data-action="TogglePrivacy" 
                                data-id="${scan.userListId}" 
                                data-firebase-id="${scan.firebaseId}" 
                                data-private="${scan.private}">
                            <i class="fas ${scan.private ? 'fa-lock' : 'fa-globe'} me-1"></i>
                            ${scan.private ? 'Private' : 'Public'}
                        </button>
                    </div>
                    <div class="d-flex flex-column gap-2 mt-3">
                        ${isCompleted ? `
                            <button class="btn btn-primary btn-sm action-btn" data-action="Load" data-id="${scan.firebaseId}">
                                <i class="fas fa-eye me-1"></i>Load Model
                            </button>
                            <button class="btn btn-success btn-sm action-btn" data-action="Download" data-id="${scan.firebaseId}">
                                <i class="fas fa-download me-1"></i>Download
                            </button>
                            <button class="btn btn-info btn-sm action-btn text-white" data-action="Share" data-id="${scan.firebaseId}">
                                <i class="fas fa-share-alt me-1"></i>Share
                            </button>
                            <button class="btn btn-outline-danger btn-sm action-btn" data-action="Delete" data-id="${scan.userListId}">
                                <i class="fas fa-trash me-1"></i>Delete
                            </button>
                        ` : ''}
                        ${isFailed ? `
                            <button class="btn btn-warning btn-sm action-btn" data-action="Retry" data-id="${scan.userListId}">
                                <i class="fas fa-redo me-1"></i>Retry Scan
                            </button>
                            <button class="btn btn-outline-danger btn-sm action-btn" data-action="Delete" data-id="${scan.userListId}">
                                <i class="fas fa-trash me-1"></i>Delete
                            </button>
                        ` : ''}
                        ${isScanning ? `
                            <button class="btn btn-secondary btn-sm" disabled>
                                <i class="fas fa-spinner fa-spin me-1"></i>Scanning...
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function handleScanAction(e) {
    const target = e.target.closest('.action-btn');
    if (!target) return;
    
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id'); // This might be userListId or firebaseId depending on context

    if (action === 'Delete') {
        if (!confirm('Are you sure you want to permanently delete this scan?')) return;
        try {
            await scanManager.removeScan(id);
        } catch (error) {
            console.error("Error deleting scan:", error);
            alert("Failed to delete scan.");
        }
    } 
    else if (action === 'Retry') {
        scanManager.retryScan(id);
    } 
    else if (action === 'Load') {
        window.location.href = `model.html?scanId=${id}`;
    } 
    else if (action === 'TogglePrivacy') {
        const isPrivate = target.getAttribute('data-private') === 'true';
        const firebaseId = target.getAttribute('data-firebase-id');
        await scanManager.togglePrivacy(id, isPrivate, firebaseId);
    }
    else if (action === 'Share') {
        // Generate Public URL
        const shareUrl = `${window.location.origin}${window.location.pathname.replace('history.html', 'model.html')}?scanId=${id}`;
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert(`Link copied to clipboard!\n${shareUrl}`);
            
            const originalHtml = target.innerHTML;
            target.innerHTML = `<i class="fas fa-check me-1"></i>Copied!`;
            setTimeout(() => target.innerHTML = originalHtml, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            prompt("Copy this link:", shareUrl);
        });
    } 
    else if (action === 'Download') {
        const btnText = target.innerHTML;
        target.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Gen...`;
        target.disabled = true;

        try {
            // 1. Get Data
            let data = thumbnailManager.cache[id];
            if (!data) {
                const snap = await get(ref(database, `scans/${id}`));
                data = snap.val();
            }
            
            if (data) {
                // 2. Generate Mesh
                const mesh = thumbnailManager.generateMesh(data);
                if (!mesh) throw new Error("Could not generate mesh from data");

                // 3. Export to OBJ
                const exporter = new OBJExporter();
                const result = exporter.parse(mesh); // Parse the mesh directly
                
                // 4. Download
                const blob = new Blob([result], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const name = scanManager.scans.find(s => s.firebaseId === id)?.name || "scan";
                a.download = `${name.replace(/\s+/g, '_')}_${Date.now()}.obj`;
                a.click();
                URL.revokeObjectURL(url);
                
                // Cleanup geometry (material is shared or simple)
                mesh.geometry.dispose();
            } else {
                alert("Scan data is empty or not found.");
            }
        } catch (error) {
            console.error("Download error:", error);
            alert("Error downloading model.");
        } finally {
            target.innerHTML = btnText;
            target.disabled = false;
        }
    }
}

function filterAndRenderScans(scans) {
    const dateFilterValue = document.getElementById('dateFilter')?.value;
    const statusFilterValue = document.getElementById('statusFilter')?.value.toLowerCase();
    
    const filteredScans = scans.filter(scan => {
        const scanDate = new Date(scan.date);
        const now = new Date();

        let dateMatch = true;
        if (dateFilterValue === 'today') dateMatch = scanDate.toDateString() === now.toDateString();
        else if (dateFilterValue === 'week') dateMatch = scanDate >= new Date(now.getTime() - 7 * 86400000);
        else if (dateFilterValue === 'month') dateMatch = scanDate >= new Date(now.getTime() - 30 * 86400000);
        else if (dateFilterValue === 'year') dateMatch = scanDate >= new Date(now.getTime() - 365 * 86400000);

        const statusMatch = statusFilterValue === 'all statuses' || scan.status.toLowerCase() === statusFilterValue;
        return dateMatch && statusMatch;
    });

    const container = scanManager.scanContainer;
    if (container) {
        container.innerHTML = filteredScans.map(appendScanCard).join('');
        container.removeEventListener('click', handleScanAction);
        container.addEventListener('click', handleScanAction);

        // --- ATTACH THUMBNAIL LISTENERS ---
        const thumbContainers = container.querySelectorAll('.thumbnail-container');
        thumbContainers.forEach(thumb => {
            const id = thumb.getAttribute('data-id');
            
            thumb.addEventListener('mouseenter', () => {
                thumbnailManager.activateThumbnail(thumb, id);
            });
            
            thumb.addEventListener('mouseleave', () => {
                thumbnailManager.deactivateThumbnail();
            });
        });
    }
}

let scanManager;

onAuthStateChanged(auth, (user) => {
    if (user) {
        scanManager = new ScanManager(user.uid);
        scanManager.loadScans(filterAndRenderScans);

        document.getElementById('dateFilter')?.addEventListener('change', () => filterAndRenderScans(scanManager.scans));
        document.getElementById('statusFilter')?.addEventListener('change', () => filterAndRenderScans(scanManager.scans));

        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            try { await signOut(auth); window.location.href = 'login.html'; } catch (error) { console.error(error); }
        });
    } else {
        window.location.href = 'login.html';
    }
});