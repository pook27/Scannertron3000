import { database, ref, onValue, remove, onAuthStateChanged, signOut, update } from './firebase.js';
import { auth } from './firebase.js';

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
                
                // === FIX START ===
                // Store the User List Key separately (used for Deleting/Updating this specific history entry)
                scan.userListId = key; 
                
                // Ensure firebaseId uses the stored Scan ID, not the List Key
                if (!scan.firebaseId) {
                    scan.firebaseId = key; // Fallback for old data only
                }
                // === FIX END ===

                scans.push(scan);
            }
            this.scans = scans.sort((a, b) => new Date(b.date) - new Date(a.date));
            callback(this.scans);
        });
    }
    
    // Uses userListId because we are removing the entry from the user's list
    removeScan(userListId) {
        return remove(ref(database, `users/${this.uid}/scans/${userListId}`));
    }

    // Uses userListId to update status in the user's list
    async retryScan(userListId) {
        const scanRef = ref(database, `users/${this.uid}/scans/${userListId}`);
        await update(scanRef, { 
            status: 'Processing',
            retryTimestamp: new Date().toISOString()
        });

        console.log(`Retrying scan entry ${userListId}`);
        alert('Retry initiated. The scanner will attempt to rescan the object.');
    }
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function getStatusIcon(status) {
    status = status.toLowerCase();
    if (status === 'completed') return 'fa-check-circle text-success';
    if (status === 'processing') return 'fa-spinner fa-spin text-warning';
    if (status === 'failed') return 'fa-times-circle text-danger';
    return 'fa-question-circle text-muted';
}

function appendScanCard(scan) {
    const isCompleted = scan.status.toLowerCase() === 'completed';
    const isFailed = scan.status.toLowerCase() === 'failed';
    const isProcessing = scan.status.toLowerCase() === 'processing';

    // === FIX IN HTML GENERATION ===
    // Load/Download buttons use scan.firebaseId (The Global Scan Data)
    // Delete/Retry buttons use scan.userListId (The History Entry)
    
    return `
        <div class="col" data-scan-id="${scan.firebaseId}">
            <div class="card h-100 shadow-sm">
                <div class="ratio ratio-4x3">
                    <img src="/Final Project Site/Images/sample_model.png" class="card-img-top" alt="${scan.name}">
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
                    <div class="d-flex flex-column gap-2 mt-3">
                        ${isCompleted ? `
                            <button class="btn btn-primary btn-sm action-btn" data-action="Load" data-id="${scan.firebaseId}">
                                <i class="fas fa-eye me-1"></i>Load Model
                            </button>
                            <button class="btn btn-success btn-sm action-btn" data-action="Download" data-id="${scan.firebaseId}">
                                <i class="fas fa-download me-1"></i>Download
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
                        ${isProcessing ? `
                            <button class="btn btn-secondary btn-sm" disabled>
                                <i class="fas fa-spinner fa-spin me-1"></i>Processing...
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
    const id = target.getAttribute('data-id'); // Can be firebaseId OR userListId depending on button

    console.log(`[ACTION LOG] ${action} button pressed for ID: ${id}`);

    if (action === 'Delete') {
        if (!confirm('Are you sure you want to permanently delete this scan?')) return;
        
        try {
            await scanManager.removeScan(id); // id here is userListId
            console.log(`[SUCCESS] Deleted scan history entry ${id}`);
        } catch (error) {
            console.error("Error deleting scan:", error);
            alert("Failed to delete scan.");
        }
        
    } else if (action === 'Retry') {
        try {
            await scanManager.retryScan(id); // id here is userListId
        } catch (error) {
            console.error("Error retrying scan:", error);
            alert("Failed to retry scan.");
        }
        
    } else if (action === 'Load') {
        // id here is firebaseId (Global)
        console.log(`[LOAD] Loading model ID ${id} into viewer`);
        window.location.href = `model.html?scanId=${id}`;
        
    } else if (action === 'Download') {
        console.log(`[DOWNLOAD] Initiating download for model ID ${id}`);
        try {
            // Logic to find scan data using firebaseId
            const scanData = scanManager.scans.find(s => s.firebaseId === id);
            if (!scanData) {
                alert("Scan data not found.");
                return;
            }
            // ... (rest of download logic remains same) ...
             downloadScanObj(scanData);
        } catch (error) {
            console.error("Download error:", error);
        }
    }
}

// Helper to keep handleScanAction clean
function downloadScanObj(scanData) {
    // Build OBJ file
    let objContent = "# Scannertron 3000 Scan\n";
    objContent += `# Scan: ${scanData.name}\n`;
    objContent += `# Date: ${scanData.date}\n\n`;

    // Note: This logic assumes 'scanData.data' is populated. 
    // Usually 'loadScans' only gets metadata. You might need to fetch the actual points here 
    // if they aren't stored in the user node.
    
    if(!scanData.data) {
        alert("Point cloud data is not loaded in history view. (Click Load Model to view/download)");
        return;
    }

    const points = extractPointsFromScanData(scanData.data);
    
    points.forEach(p => {
        objContent += `v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}\n`;
    });

    const blob = new Blob([objContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scanData.name.replace(/\s+/g, '_')}_${Date.now()}.obj`;
    a.click();
    URL.revokeObjectURL(url);
}

function extractPointsFromScanData(data) {
    const points = [];
    if (Array.isArray(data)) {
        data.forEach(p => {
            if (p && typeof p === 'object' && (p.x || p.y || p.z)) {
                points.push({ x: p.x || 0, y: p.y || 0, z: p.z || 0 });
            }
        });
    }
    return points;
}

function filterAndRenderScans(scans) {
    const dateFilterValue = document.getElementById('dateFilter')?.value;
    const statusFilterValue = document.getElementById('statusFilter')?.value.toLowerCase();
    
    const filteredScans = scans.filter(scan => {
        const scanDate = new Date(scan.date);
        const now = new Date();

        let dateMatch = true;
        if (dateFilterValue === 'today') {
            dateMatch = scanDate.toDateString() === now.toDateString();
        } else if (dateFilterValue === 'week') {
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateMatch = scanDate >= oneWeekAgo;
        } else if (dateFilterValue === 'month') {
            const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            dateMatch = scanDate >= oneMonthAgo;
        } else if (dateFilterValue === 'year') {
            const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            dateMatch = scanDate >= oneYearAgo;
        }

        const statusMatch = statusFilterValue === 'all statuses' || 
                           scan.status.toLowerCase() === statusFilterValue;
        
        return dateMatch && statusMatch;
    });

    const container = scanManager.scanContainer;
    if (container) {
        container.innerHTML = filteredScans.map(appendScanCard).join('');
        container.removeEventListener('click', handleScanAction);
        container.addEventListener('click', handleScanAction);
    }
}

let scanManager;

onAuthStateChanged(auth, (user) => {
    if (user) {
        scanManager = new ScanManager(user.uid);
        scanManager.loadScans(filterAndRenderScans);

        document.getElementById('dateFilter')?.addEventListener('change', () => 
            filterAndRenderScans(scanManager.scans)
        );
        document.getElementById('statusFilter')?.addEventListener('change', () => 
            filterAndRenderScans(scanManager.scans)
        );

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