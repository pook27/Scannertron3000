// JS/about.js (Updated)

import { auth, onAuthStateChanged, signOut, database, ref, push } from './firebase.js';

function setupFeedbackForm(user) {
    const feedbackForm = document.getElementById('feedbackForm');

    if (feedbackForm) {
        feedbackForm.addEventListener('submit', (event) => {
            event.preventDefault(); 

            // Helper to get selected radio button value
            const getRadioValue = (name) => {
                const radios = document.getElementsByName(name);
                for (const radio of radios) {
                    if (radio.checked) return radio.value;
                }
                return null;
            };

            // Helper to get checked checkbox values
            const getCheckboxValues = (idPrefix) => {
                const checkboxes = document.querySelectorAll(`input[id^="${idPrefix}"]:checked`);
                return Array.from(checkboxes).map(cb => cb.value);
            };

            // Collect all form data into a JSON object
            const feedbackData = {
                timestamp: new Date().toISOString(),
                user_name: document.getElementById('nameInput').value,
                user_email: document.getElementById('emailInput').value,
                feedback_type: getRadioValue('feedbackType'),
                priority_level: document.getElementById('prioritySelect').value,
                areas_of_interest: getCheckboxValues('interest'),
                message: document.getElementById('messageTextarea').value,
                userId: user.uid,
                app_version: '3.0.0' 
            };

            // Requirement: console.log a JSON with the output
            console.log('--- FEEDBACK DATA SUBMITTED ---');
            console.log(JSON.stringify(feedbackData, null, 2));

            // Optional: Send to Firebase Realtime Database
            push(ref(database, 'feedback'), feedbackData)
                .then(() => {
                    alert('Feedback sent successfully! Check the console for the logged JSON data.');
                    feedbackForm.reset();
                })
                .catch((error) => {
                    console.error("Failed to send feedback to Firebase:", error);
                    alert('Feedback captured locally, but failed to send to server.');
                });
        });
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        setupFeedbackForm(user);
        
        const userDisplay = document.getElementById('user-display');
        userDisplay.innerText = user['displayName'] || user.email;
        
        // Logout logic
        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault(); 
            try {
                await signOut(auth);
                window.location.href = 'login.html'; 
            } catch (error) {
                console.error("Error signing out:", error);
                alert("Error signing out. Please try again.");
            }
        });

    } else {
        // Allows unauthenticated users to submit feedback with a dummy ID
        setupFeedbackForm({uid: 'unauthenticated'}); 
    }
});