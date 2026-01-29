import { auth, onAuthStateChanged, signOut, database, ref, update, push, get, set, onValue, remove, off } from './firebase.js';
import * as THREE from 'three';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

let scene, camera, renderer;
let currentMesh = null;
let currentScanId = null;
let currentUserScanKey = null;

// Unsubscribe functions
let scanDataUnsubscribe = null;
let commandUnsubscribe = null;

// --- Interaction Variables ---
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let rotation = { x: 0, y: 0 };
let targetRotation = { x: 0, y: 0.005 };
let autoRotate = true;
let modelSize = { x: 0, y: 0, z: 0 };

let viewMode = 'new';

// ============================================================================
//                            MAIN LOGIC
// ============================================================================

function setupModelPage(user) {
    const startScanButton = document.getElementById('startScanButton');
    const downloadModelButton = document.getElementById('downloadModelButton');

    initThreeJS();

    const urlParams = new URLSearchParams(window.location.search);
    const scanIdFromUrl = urlParams.get('scanId');

    if (scanIdFromUrl) {
        // --- VIEW MODE ---
        viewMode = 'view';
        currentScanId = scanIdFromUrl;

        if (startScanButton) startScanButton.style.display = 'none';

        const pageTitle = document.querySelector('h1, h2');
        if (pageTitle) pageTitle.textContent = 'Viewing Scan: ' + scanIdFromUrl;

        console.log('Loading existing scan:', scanIdFromUrl);
        loadExistingScan(scanIdFromUrl);
    } else {
        // --- NEW SCAN MODE ---
        viewMode = 'new';

        if (startScanButton) {
            // Remove old listeners
            startScanButton.replaceWith(startScanButton.cloneNode(true));
            const newStartBtn = document.getElementById('startScanButton');

            newStartBtn.addEventListener('click', async () => {
                console.log('--- INITIATING SCAN ---');
                try {
                    // 1. Create Database Entries
                    const newScanRef = push(ref(database, 'scans'));
                    currentScanId = newScanRef.key;

                    const userScanRef = push(ref(database, `users/${user.uid}/scans`));
                    currentUserScanKey = userScanRef.key;

                    const initialMetadata = {
                        firebaseId: currentScanId,
                        name: `Scan ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                        date: new Date().toISOString(),
                        status: 'Scanning',
                        authorId: user.displayName || user.email,
                        likes: 0,
                        views: 0
                    };

                    await Promise.all([
                        set(newScanRef, {
                            createdAt: new Date().toISOString(),
                            status: "waiting_for_esp32"
                        }),
                        set(userScanRef, initialMetadata)
                    ]);

                    await set(ref(database, 'command'), {
                        active: true,
                        userId: user.uid,
                        scanId: currentScanId,
                        status: 'starting',
                        timestamp: new Date().toISOString()
                    });

                    // 2. UX Updates
                    alert(`Scan started! ID: ${currentScanId}`);
                    newStartBtn.disabled = true;
                    newStartBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning';

                    // 3. AUTO-UPDATE URL (So refresh works)
                    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?scanId=' + currentScanId;
                    window.history.pushState({ path: newUrl }, '', newUrl);

                    // 4. Start Listeners
                    startMonitoringScan(currentScanId, user, newStartBtn);

                } catch (error) {
                    console.error("Error starting scan:", error);
                    alert('Failed to start scan.');

                    if (currentScanId && currentUserScanKey) {
                        const updates = {};
                        updates[`scans/${currentScanId}/status`] = 'failed';
                        updates[`users/${user.uid}/scans/${currentUserScanKey}/status`] = 'failed';
                        update(ref(database), updates);
                    }
                }
            });
        }
    }

    if (downloadModelButton) {
        downloadModelButton.addEventListener('click', () => {
            // Assume 'scene' is your global Three.js scene object
            // If 'scene' is not global, you must pass it into this function
            if (typeof scene === 'undefined') {
                console.error("Three.js Scene not found. Make sure your 3D variable is accessible.");
                alert("Error: No 3D model found to export.");
                return;
            }

            const exporter = new OBJExporter();
            const result = exporter.parse(scene);

            // Create the blob and link
            const blob = new Blob([result], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.href = url;
            link.download = `scannertron_scan_${timestamp}.obj`;
            link.click();

            // Clean up
            URL.revokeObjectURL(url);
            console.log('Model exported as OBJ.');
        });
    }
}

// ============================================================================
//                       LOAD EXISTING SCAN (FIXED)
// ============================================================================

async function loadExistingScan(scanId) {
    try {
        console.log('Fetching scan data for:', scanId);

        const scanRef = ref(database, `scans/${scanId}`);
        const snapshot = await get(scanRef);

        if (!snapshot.exists()) {
            alert('Scan not found in database!');
            return;
        }

        const scanData = snapshot.val();

        // --- FIX: Check if we actually have data layers ---
        const dataKeys = Object.keys(scanData).filter(key => !isNaN(parseInt(key)));

        if (dataKeys.length === 0) {
            // Only if NO numeric keys (layers) exist do we assume it's empty
            console.warn("Scan has metadata but no points.");
            // Optional: Don't return, just let it render empty scene
            alert('This scan has no point cloud data yet.');
            return;
        }

        // Display the model
        updateModelMesh(scanData);

        // Listen for updates (in case it's still running)
        if (scanDataUnsubscribe) scanDataUnsubscribe();
        scanDataUnsubscribe = onValue(scanRef, (snapshot) => {
            const data = snapshot.val();
            if (data) updateModelMesh(data);
        });

    } catch (error) {
        console.error('Error loading scan:', error);
        alert('Failed to load scan data.');
    }
}

// ============================================================================
//                       LIVE SCAN MONITORING
// ============================================================================

function startMonitoringScan(scanId, user, startButton) {
    const scanDataRef = ref(database, `scans/${scanId}`);
    if (scanDataUnsubscribe) scanDataUnsubscribe();

    // Live update the mesh
    scanDataUnsubscribe = onValue(scanDataRef, (snapshot) => {
        const data = snapshot.val();
        if (data) updateModelMesh(data);
    });

    // Listen for completion command
    const commandRef = ref(database, 'command');
    if (commandUnsubscribe) commandUnsubscribe();

    commandUnsubscribe = onValue(commandRef, (snapshot) => {
        const cmd = snapshot.val();
        // Check if active flipped to false AND status is complete
        if (cmd && cmd.active === false && cmd.status === 'complete') {
            if (cmd.scanId === scanId) {
                console.log("Scan finish detected.");
                handleScanCompletion(user, scanId, startButton);
            }
        }
    });
}

async function handleScanCompletion(user, scanId, startButton) {
    // Stop listening to command updates
    if (commandUnsubscribe) {
        commandUnsubscribe();
        commandUnsubscribe = null;
    }
    // Note: We KEEP scanDataUnsubscribe to show the final model

    startButton.disabled = false;
    startButton.classList.remove('btn-primary');
    startButton.classList.add('btn-success');
    startButton.innerHTML = '<i class="fas fa-check"></i> Scan Complete';

    try {
        if (currentUserScanKey) {
            const userScanRef = ref(database, `users/${user.uid}/scans/${currentUserScanKey}`);
            await update(userScanRef, {
                status: 'Completed'
            });

            // Update stats
            const userMetaRef = ref(database, `users/${user.uid}`);
            const metaSnapshot = await get(userMetaRef);
            const currentMeta = metaSnapshot.val() || {};
            await update(userMetaRef, {
                totalScans: (currentMeta.totalScans || 0) + 1
            });

            alert("Scan Completed! You can now view the full model.");
        }
    } catch (error) {
        console.error("Error finalizing scan:", error);
    }
}

// ============================================================================
//                       MESH GENERATION (Standard)
// ============================================================================

function extractLevelsFromData(data) {
    let levels = [];

    if (typeof data === 'object' && data !== null) {
        // Filter for numeric keys "0", "1", "2"...
        const sortedKeys = Object.keys(data)
            .filter(key => !isNaN(parseInt(key)))
            .sort((a, b) => parseInt(a) - parseInt(b));

        levels = sortedKeys.map(key => {
            const levelData = data[key];
            // Handle Batch Structure (Object of objects) or Array
            if (typeof levelData === 'object') {
                // Convert { "0": {x,y,z}, "1":{...} } to Array
                return Object.values(levelData).map(p => new THREE.Vector3(p.x, p.y, p.z));
            } else if (Array.isArray(levelData)) {
                return levelData.map(p => new THREE.Vector3(p.x, p.y, p.z));
            }
            return [];
        }).filter(level => level.length > 0);
    }

    console.log(`Extracted ${levels.length} levels`);
    return levels;
}

function updateModelMesh(data) {
    const levels = extractLevelsFromData(data);
    if (levels.length === 0) return;

    // Standard reconstruction logic
    const gapThresholdSq = calculateGapThreshold(levels);
    const clusteredLevels = levels.map(level => clusterLevelByGaps(level, gapThresholdSq));
    const geometry = buildConnections(clusteredLevels);
    geometry.computeVertexNormals();

    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
    }

    const material = new THREE.MeshStandardMaterial({
        color: 0x00b0ff,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide,
    });

    currentMesh = new THREE.Mesh(geometry, material);
    scene.add(currentMesh);

    // Auto-center
    const box = new THREE.Box3().setFromObject(currentMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    modelSize = size;
    currentMesh.position.sub(center);

    // Only adjust camera on first load or significant change
    if (camera.position.z === 40) {
        camera.position.z = Math.max(size.x, size.y, size.z) * 1.5;
        camera.lookAt(0, 0, 0);
    }
}

// --- MATH HELPERS (Same as before) ---
function calculateGapThreshold(levels) {
    if (levels.length === 0 || levels[0].length === 0) return 100;
    const numPoints = levels[0].length;
    const angularStep = (2 * Math.PI) / numPoints;
    let maxRadius = 0;
    for (const level of levels.slice(0, 10)) {
        if (!level) continue;
        for (const p of level) {
            if (!p) continue;
            const r = Math.sqrt(p.x * p.x + p.y * p.y);
            if (r > maxRadius) maxRadius = r;
        }
    }
    return Math.pow(maxRadius * angularStep * 100, 2); // Heuristic
}

function clusterLevelByGaps(level, thresholdSq) {
    // (Keep your existing cluster logic here - copied for completeness)
    const contours = [];
    let currentContour = [];
    const numPoints = level.length;

    for (let i = 0; i < numPoints; i++) {
        const p1 = level[i];
        const p2 = level[(i + 1) % numPoints];

        if (p1.x !== 0 || p1.y !== 0) currentContour.push(p1);

        const isMiss = (p2.x === 0 && p2.y === 0);
        let isGap = false;
        if ((p1.x !== 0 || p1.y !== 0) && (p2.x !== 0 || p2.y !== 0)) {
            isGap = p1.distanceToSquared(p2) > thresholdSq;
        }

        if ((isMiss || isGap) && currentContour.length > 0) {
            if (currentContour.length > 2) contours.push(currentContour);
            currentContour = [];
        }
    }
    if (currentContour.length > 0) {
        if (contours.length > 0) {
            const firstContour = contours[0];
            const lastPoint = currentContour[currentContour.length - 1];
            const firstPoint = firstContour[0];
            if (lastPoint.distanceToSquared(firstPoint) <= thresholdSq) {
                contours[0] = [...currentContour, ...firstContour];
            } else if (currentContour.length > 2) contours.push(currentContour);
        } else if (currentContour.length > 2) contours.push(currentContour);
    }
    return contours;
}

function getContourCentroid(contour) {
    let x = 0, y = 0;
    for (const p of contour) { x += p.x; y += p.y; }
    return new THREE.Vector2(x / contour.length, y / contour.length);
}

function buildConnections(clusteredLevels) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    let vertexIndex = 0;

    for (let i = 0; i < clusteredLevels.length - 1; i++) {
        const currentContours = clusteredLevels[i];
        const nextContours = clusteredLevels[i + 1];
        if (nextContours.length === 0) continue;

        for (const contourA of currentContours) {
            const centroidA = getContourCentroid(contourA);
            let closestContourB = null;
            let minCentroidDistSq = Infinity;

            for (const contourB of nextContours) {
                const centroidB = getContourCentroid(contourB);
                const distSq = centroidA.distanceToSquared(centroidB);
                if (distSq < minCentroidDistSq) {
                    minCentroidDistSq = distSq;
                    closestContourB = contourB;
                }
            }
            if (closestContourB) {
                vertexIndex = stitchContours(vertices, indices, contourA, closestContourB, vertexIndex);
            }
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
}

function stitchContours(vertices, indices, contourA, contourB, vertexIndex) {
    const numPointsA = contourA.length;
    const numPointsB = contourB.length;
    if (numPointsA < 2 || numPointsB < 2) return vertexIndex;

    const indicesA = [];
    for (const p of contourA) {
        indicesA.push(vertexIndex++);
        vertices.push(p.x, p.y, p.z);
    }
    const indicesB = [];
    for (const p of contourB) {
        indicesB.push(vertexIndex++);
        vertices.push(p.x, p.y, p.z);
    }

    // Simplified connection logic
    let bestB_idx = 0;
    let minStartDistSq = Infinity;
    for (let j = 0; j < numPointsB; j++) {
        const d = contourA[0].distanceToSquared(contourB[j]);
        if (d < minStartDistSq) { minStartDistSq = d; bestB_idx = j; }
    }

    let i = 0, j = bestB_idx;
    let stepsA = 0, stepsB = 0;

    while (stepsA < numPointsA || stepsB < numPointsB) {
        const pA1_idx = indicesA[i % numPointsA];
        const pA2_idx = indicesA[(i + 1) % numPointsA];
        const pB1_idx = indicesB[j % numPointsB];
        const pB2_idx = indicesB[(j + 1) % numPointsB];

        if (stepsA >= numPointsA) {
            indices.push(indicesA[(i - 1 + numPointsA) % numPointsA], pB1_idx, pB2_idx);
            j++; stepsB++; continue;
        }
        if (stepsB >= numPointsB) {
            indices.push(pA1_idx, indicesB[(j - 1 + numPointsB) % numPointsB], pA2_idx);
            i++; stepsA++; continue;
        }

        const d1 = contourA[i % numPointsA].distanceToSquared(contourB[(j + 1) % numPointsB]);
        const d2 = contourA[(i + 1) % numPointsA].distanceToSquared(contourB[j % numPointsB]);

        if (numPointsA - stepsA > numPointsB - stepsB) {
            indices.push(pA1_idx, pB1_idx, pA2_idx); i++; stepsA++;
        } else if (numPointsB - stepsB > numPointsA - stepsA) {
            indices.push(pA1_idx, pB1_idx, pB2_idx); j++; stepsB++;
        } else {
            if (d1 < d2) { indices.push(pA1_idx, pB1_idx, pB2_idx); indices.push(pA1_idx, pB2_idx, pA2_idx); }
            else { indices.push(pA1_idx, pB1_idx, pA2_idx); indices.push(pA2_idx, pB1_idx, pB2_idx); }
            i++; j++; stepsA++; stepsB++;
        }
    }
    return vertexIndex;
}

// ============================================================================
//                  THREE.JS SETUP
// ============================================================================

function initThreeJS() {
    const canvas = document.getElementById('modelCanvas');
    if (!canvas) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x1a202c, 1);
    camera.position.z = 40;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Controls
    canvas.addEventListener('mousedown', (e) => { isDragging = true; autoRotate = false; previousMousePosition = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            targetRotation.y += deltaX * 0.01;
            targetRotation.x += deltaY * 0.01;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.02;
    }, { passive: false });

    animate();
    window.addEventListener('resize', handleResize);
    function handleResize() {
        if (!canvas.isConnected) return;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (autoRotate && !isDragging) targetRotation.y += 0.005;
    rotation.x += (targetRotation.x - rotation.x) * 0.1;
    rotation.y += (targetRotation.y - rotation.y) * 0.1;
    if (currentMesh) {
        currentMesh.rotation.x = rotation.x;
        currentMesh.rotation.y = rotation.y;
    }
    renderer.render(scene, camera);
}

function cleanup() {
    if (scanDataUnsubscribe) scanDataUnsubscribe();
    if (commandUnsubscribe) commandUnsubscribe();
    if (renderer) renderer.dispose();
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        setupModelPage(user);
        document.getElementById('nav-login-link')?.addEventListener('click', () => cleanup());
    } else {
        window.location.href = 'login.html';
    }
});

window.addEventListener('beforeunload', cleanup);