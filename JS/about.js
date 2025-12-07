// Added 'get' to the imports
import { auth, onAuthStateChanged, signOut, database, ref, push, get } from './firebase.js';

function setupFeedbackForm(user) {
    const feedbackForm = document.getElementById('feedbackForm');

    if (feedbackForm) {
        feedbackForm.addEventListener('submit', (event) => {
            event.preventDefault(); 

            // Helper functions to get form data
            const getRadioValue = (name) => {
                const radios = document.getElementsByName(name);
                for (const radio of radios) {
                    if (radio.checked) return radio.value;
                }
                return null;
            };

            const getCheckboxValues = (idPrefix) => {
                const checkboxes = document.querySelectorAll(`input[id^="${idPrefix}"]:checked`);
                return Array.from(checkboxes).map(cb => cb.value);
            };
            
            // Collect all form data
            const userName = document.getElementById('nameInput').value;
            const userEmail = document.getElementById('emailInput').value;
            const feedbackType = getRadioValue('feedbackType');
            const priorityLevel = document.getElementById('prioritySelect').value;
            const areasOfInterest = getCheckboxValues('interest');
            const message = document.getElementById('messageTextarea').value;

            const feedbackData = {
                timestamp: new Date().toISOString(),
                user_name: userName,
                user_email: userEmail,
                feedback_type: feedbackType,
                priority_level: priorityLevel,
                areas_of_interest: areasOfInterest,
                message: message,
                userId: user.uid || 'anonymous', 
            };

            console.log('--- FEEDBACK JSON ---', JSON.stringify(feedbackData, null, 2));

            // Save to Firebase
            push(ref(database, 'feedback'), feedbackData)
                .then(() => {
                    openGmailCompose(feedbackData);
                    alert('Feedback saved! Gmail will open in a new tab - just click Send!');
                    feedbackForm.reset();
                })
                .catch((error) => {
                    console.error("Firebase Push Failed:", error);
                    alert('There was an error submitting your feedback. Please try again.');
                });
        });
    }
}

// --- NEW FUNCTION: Fetch Real Stats ---
async function updateProjectStats() {
    try {
        // Fetch snapshot of users and scans to count them
        // Note: For massive databases, we would use a dedicated counter node,
        // but for this project, checking the size directly is perfectly fine.
        const usersSnapshot = await get(ref(database, 'users'));
        const scansSnapshot = await get(ref(database, 'scans'));

        // .size returns the number of children in the DataSnapshot
        const userCount = usersSnapshot.size || 0;
        const scanCount = scansSnapshot.size || 0;

        // Update DOM
        const userEl = document.getElementById('stat-active-users');
        const scanEl = document.getElementById('stat-total-scans');

        if (userEl) userEl.innerText = userCount;
        if (scanEl) scanEl.innerText = scanCount;

    } catch (error) {
        console.error("Error fetching stats:", error);
        // Fallback in case of error (e.g., permissions)
        const userEl = document.getElementById('stat-active-users');
        const scanEl = document.getElementById('stat-total-scans');
        if (userEl) userEl.innerText = "-";
        if (scanEl) scanEl.innerText = "-";
    }
}

function openGmailCompose(data) {
    const to = 'scannertron3000@gmail.com';
    const subject = `[Scannertron 3000] ${data.feedback_type ? data.feedback_type.toUpperCase() : 'FEEDBACK'} - ${data.priority_level} Priority`;
    
    const body = `Hello Scannertron 3000 Team,

I would like to submit the following feedback:

Name: ${data.user_name}
Email: ${data.user_email}
Feedback Type: ${data.feedback_type}
Priority Level: ${data.priority_level}
Areas of Interest: ${data.areas_of_interest ? data.areas_of_interest.join(', ') : 'None'}

Message:
${data.message}

---
Submitted: ${new Date(data.timestamp).toLocaleString()}
User ID: ${data.userId}`;

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    const gmailWindow = window.open(gmailUrl, '_blank');
    
    if (!gmailWindow || gmailWindow.closed || typeof gmailWindow.closed === 'undefined') {
        showEmailCopyModal(to, subject, body);
    }
}

function showEmailCopyModal(to, subject, body) {
    const modalHTML = `
        <div class="modal fade show" id="emailModal" tabindex="-1" style="display: block; background: rgba(0,0,0,0.5);">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title"><i class="fas fa-exclamation-triangle me-2"></i>Popup Blocked</h5>
                        <button type="button" class="btn-close" onclick="document.getElementById('emailModal').remove()"></button>
                    </div>
                    <div class="modal-body">
                        <p><strong>Your browser blocked the popup.</strong></p>
                        <p>Please copy the details below:</p>
                        <div class="mb-3"><label class="form-label">To:</label><input class="form-control" value="${to}" readonly></div>
                        <div class="mb-3"><label class="form-label">Subject:</label><input class="form-control" value="${subject}" readonly></div>
                        <div class="mb-3"><label class="form-label">Message:</label><textarea class="form-control" rows="8" readonly>${body}</textarea></div>
                        <button class="btn btn-primary w-100" onclick="copyEmailDetails('${to}', '${subject.replace(/'/g, "\\'")}', \`${body.replace(/`/g, '\\`')}\`)">Copy to Clipboard</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.copyEmailDetails = function(to, subject, body) {
    const fullText = `To: ${to}\n\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullText).then(() => {
        alert('Copied! Open Gmail and paste.');
        document.getElementById('emailModal').remove();
    });
};

onAuthStateChanged(auth, (user) => {
    // We call this immediately so stats load even if not logged in 
    // (Assuming your Firebase rules allow public read of basic paths)
    updateProjectStats(); 

    if (user) {
        setupFeedbackForm(user);
        
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) userDisplay.innerText = user.displayName || user.email;
        
        const nameInput = document.getElementById('nameInput');
        const emailInput = document.getElementById('emailInput');
        if (nameInput) nameInput.value = user.displayName || '';
        if (emailInput) emailInput.value = user.email || '';
        
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
        setupFeedbackForm({uid: 'anonymous'}); 
    }
});