// JS/history.js

import { database, ref, onValue, remove, onAuthStateChanged, signOut } from './firebase.js';
import { auth } from './firebase.js';
// Make sure to implement formatDate in utils.js if it doesn't exist
import { formatDate } from './utils.js'; 

// --- Core Data Management (Adapted from TransactionManager) ---
class ScanManager {
    constructor(userID) {
        this.scans = [];
        this.uid = userID;
        // Target the row container where all cards are located
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
                scan.firebaseId = key;  
                scans.push(scan);
            }
            this.scans = scans.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first
            callback(this.scans);
        });
    }
    
    removeScan(firebaseId) {
        return remove(ref(database, `users/${this.uid}/scans/${firebaseId}`));
    }
}

// --- DOM Rendering and Actions ---

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
                        Scanned on: ${formatDate(new Date(scan.date))}
                    </p>
                    <p class="card-text text-muted small">
                        <i class="fas ${getStatusIcon(scan.status)} me-1"></i>
                        Status: ${scan.status}
                    </p>
                    <div class="d-flex flex-column gap-2 mt-3">
                        ${isCompleted ? `
                            <button class="btn btn-primary btn-sm action-btn" data-action="Load" data-id="${scan.firebaseId}">
                                <i class="fas fa-eye me-1"></i>Load
                            </button>
                            <button class="btn btn-success btn-sm action-btn" data-action="Download" data-id="${scan.firebaseId}">
                                <i class="fas fa-download me-1"></i>Download
                            </button>
                        ` : ''}
                        ${isFailed ? `
                            <button class="btn btn-warning btn-sm action-btn" data-action="Retry" data-id="${scan.firebaseId}">
                                <i class="fas fa-redo me-1"></i>Retry
                            </button>
                            <button class="btn btn-outline-danger btn-sm action-btn" data-action="Delete" data-id="${scan.firebaseId}">
                                <i class="fas fa-trash me-1"></i>Delete
                            </button>
                        ` : ''}
                        ${!isCompleted && !isFailed ? `
                            <button class="btn btn-primary btn-sm" disabled>
                                <i class="fas fa-spinner me-1"></i>Processing
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function handleScanAction(e) {
    const target = e.target.closest('.action-btn');
    if (!target) return;
    
    const action = target.getAttribute('data-action');
    const scanId = target.getAttribute('data-id');

    console.log(`[ACTION LOG] ${action} button pressed for Scan ID: ${scanId}`);

    if (action === 'Delete') {
        // Dummy console.log for delete button
        console.log(`[DUMMY CONSOLE.LOG] Initiating model deletion for ID ${scanId}. This removes the data from Firebase.`);
        if (!confirm('Are you sure you want to permanently delete this scan?')) return;
        
        scanManager.removeScan(scanId)
            .then(() => {
                // onValue listener automatically updates the UI
            })
            .catch(error => {
                console.error("Error deleting scan:", error);
                alert("Failed to delete scan.");
            });
    } else if (action === 'Retry') {
        // Dummy console.log for retry button
        console.log(`[DUMMY CONSOLE.LOG] Attempting to RETRY scan for ID ${scanId}. This would simulate sending a command to the ESP32.`);
        alert('Retry function simulated. Check console.');
    } else if (action === 'Load') {
        // Dummy console.log for load button
        console.log(`[DUMMY CONSOLE.LOG] Loading model ID ${scanId} into the viewer. This would fetch the model file from storage.`);
        alert('Load model function simulated. Check console.');
    } else if (action === 'Download') {
        console.log(`[ACTION LOG] Initiating download for model ID ${scanId}.`);
        alert('Download function simulated. Check console.');
    }
}


// --- Filtering Logic (Adapted from script.js's updateFilterTable) ---

function filterAndRenderScans(scans) {
    // Get filter values from history.html
    const dateFilterValue = document.getElementById('dateFilter')?.value;
    const statusFilterValue = document.getElementById('statusFilter')?.value.toLowerCase();
    
    const filteredScans = scans.filter(scan => {
        const scanDate = new Date(scan.date);
        const now = new Date();

        // 1. Date Filtering (relative time, matching HTML options)
        let dateMatch = true;
        if (dateFilterValue === 'today') {
            dateMatch = scanDate.toDateString() === now.toDateString();
        } else if (dateFilterValue === 'week') {
            const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));
            dateMatch = scanDate >= oneWeekAgo;
        } else if (dateFilterValue === 'month') {
            const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1));
            dateMatch = scanDate >= oneMonthAgo;
        } else if (dateFilterValue === 'year') {
            const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
            dateMatch = scanDate >= oneYearAgo;
        }

        // 2. Status Filtering
        const statusMatch = statusFilterValue === 'all statuses' || scan.status.toLowerCase() === statusFilterValue;
        
        return dateMatch && statusMatch;
    });

    // Clear and re-render the card container
    const container = scanManager.scanContainer;
    if (container) {
        container.innerHTML = filteredScans.map(appendScanCard).join('');
        // Attach a single delegated listener to the container
        container.removeEventListener('click', handleScanAction); // Remove previous listener to prevent duplicates
        container.addEventListener('click', handleScanAction);
    }
}

let scanManager;
// --- Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        scanManager = new ScanManager(user.uid);
        scanManager.loadScans(filterAndRenderScans);

        // Attach listeners to the filter controls
        document.getElementById('dateFilter')?.addEventListener('change', () => filterAndRenderScans(scanManager.scans));
        document.getElementById('statusFilter')?.addEventListener('change', () => filterAndRenderScans(scanManager.scans));

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