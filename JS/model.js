import { auth, onAuthStateChanged, signOut } from './firebase.js';

function setupModelPage() {
    // Assuming model.html has these IDs:
    const startScanButton = document.getElementById('startScanButton'); 
    const downloadModelButton = document.getElementById('downloadModelButton'); 

    // 1. Start Scan (ESP32 Ready Placeholder)
    if (startScanButton) {
        startScanButton.addEventListener('click', () => {
            console.log('--- START SCAN INITIATED ---');
            console.log('Future Interaction: Attempting connection to ESP32 via Web Serial/WebSocket...');
            alert('Scan process simulated. Future feature will connect to the ESP32 for real-time data.');
        });
    }

    // 2. Download Model Suggestion (.obj or .stl)
    if (downloadModelButton) {
        downloadModelButton.addEventListener('click', () => {
            const modelFormats = ['.stl', '.obj'];
            const chosenFormat = modelFormats[Math.floor(Math.random() * modelFormats.length)];
            const dummyFileName = `scannertron_model_${new Date().getTime()}${chosenFormat}`;
            
            console.log(`--- DOWNLOAD MODEL SUGGESTION ---`);
            console.log(`Suggested downloading a dummy file in ${chosenFormat} format: ${dummyFileName}`);
            
            // Trigger an alert or a dummy download link click here
            alert(`A model download is suggested in ${chosenFormat} format. Check your console for details.`);
        });
    }
}

// Authentication Check and Setup
onAuthStateChanged(auth, (user) => {
    if (user) {
        setupModelPage();
    } else {
        // Redirect if not logged in
        window.location.href = 'login.html';
    }
    
    // Logout button logic (Reused boilerplate)
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });
});