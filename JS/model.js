import { auth, onAuthStateChanged, signOut, database, ref, update, push, get, set } from './firebase.js';

function setupModelPage(user) {
    const startScanButton = document.getElementById('startScanButton'); 
    const downloadModelButton = document.getElementById('downloadModelButton'); 

    // 1. Start Scan - Updates Firebase Branch
    if (startScanButton) {
        startScanButton.addEventListener('click', () => {
            console.log('--- INITIATING SCAN ---');
            // Reset scan status first, then trigger start
            const updates = {};
            updates['active/startScan'] = true;
            updates['active/scanStatus'] = "scanning"; 
            
            update(ref(database), updates)
                .then(() => {
                    alert('Command sent to ESP32: Start Scan');
                    simulateScanCompletion(user); // Remove this line when real ESP32 is connected
                })
                .catch((error) => console.error("Error starting scan:", error));
        });
    }

    // 2. Download Model - Builds OBJ from points
    if (downloadModelButton) {
        downloadModelButton.addEventListener('click', async () => {
            try {
                // Fetch points from Firebase (Assuming path 'live_scan/points')
                const snapshot = await get(ref(database, 'live_scan/points'));
                const points = snapshot.val() || []; // Expecting array of {x, y, z}

                if (!points || points.length === 0) {
                    alert("No point cloud data available to download.");
                    return;
                }

                // Build OBJ Content (Vertices only for point cloud)
                let objContent = "# Scannertron 3000 Scan\n";
                // Handle different point structures (array of arrays or array of objects)
                Object.values(points).forEach(p => {
                    const x = p.x || p[0] || 0;
                    const y = p.y || p[1] || 0;
                    const z = p.z || p[2] || 0;
                    objContent += `v ${x} ${y} ${z}\n`;
                });

                // Create Blob and Download
                const blob = new Blob([objContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `scan_${Date.now()}.obj`;
                a.click();
                URL.revokeObjectURL(url);
                
            } catch (error) {
                console.error("Download failed:", error);
                alert("Error generating model file.");
            }
        });
    }
}

// Helper: Simulate ESP32 finishing and triggering the "Save" popup
function simulateScanCompletion(user) {
    setTimeout(() => {
        // 3. Pop up: Save Scan?
        const saveScan = confirm("Scan Completed! Do you want to save this model to your history?");
        
        if (saveScan) {
            const newScanRef = push(ref(database, `users/${user.uid}/scans`));
            const scanData = {
                name: `Scan ${new Date().toLocaleDateString()}`,
                date: new Date().toISOString(),
                status: 'Completed',
                // In a real scenario, you might move data from 'live_scan' to storage here
                points_ref: 'live_scan/points' 
            };
            
            set(newScanRef, scanData).then(() => {
                alert("Saved to History!");
                // Optional: Add to public gallery automatically or ask
                // push(ref(database, 'public_gallery'), { ...scanData, authorId: user.displayName }); 
            });
        } else {
            console.log("User discarded the scan.");
        }
        
        // Reset Trigger
        update(ref(database, 'active'), { startScan: false });
        
    }, 3000); // 3 second simulated delay
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        setupModelPage(user);
    } else {
        window.location.href = 'login.html';
    }
    // Logout logic...
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => { /* ... */ });
});