/**
 * CAMPUS UTILITIES HUB - DASHBOARD CONTROLLER
 * This module acts as the central brain of the student experience.
 * It manages real-time status updates, handles official announcements,
 * and processes utility-related complaints.
 */

import { auth, db, firebase } from './firebase-config.js';

// --- UI ELEMENT SELECTION ---
const userDisplayName = document.getElementById('user-display-name');
const announcementsContainer = document.getElementById('announcements-container');
const utilityGrid = document.getElementById('utility-grid');
const adminLink = document.getElementById('admin-panel-link');
const adminAnnounceSection = document.getElementById('admin-announcement-section');
const logoutBtn = document.getElementById('logout-button');

/**
 * --- 1. SESSION & ROLE MANAGEMENT ---
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userDoc = await db.collection("users").doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                if (userDisplayName) {
                    userDisplayName.textContent = userData.name || user.email.split('@')[0];
                }

                // ROLE-BASED ACCESS CONTROL (RBAC)
                if (userData.role === 'admin') {
                    if (adminLink) adminLink.style.display = 'block';
                    if (adminAnnounceSection) adminAnnounceSection.style.display = 'block';
                }
            } else {
                if (userDisplayName) userDisplayName.textContent = user.email.split('@')[0];
            }

            // Initialize the real-time data streams
            loadAnnouncements();
            loadUtilityStatus();
            loadRecentComplaints();

        } catch (error) {
            console.error("Dashboard Auth Error:", error);
        }
    } else {
        if (!window.location.pathname.includes("index.html")) {
            window.location.href = "index.html"; 
        }
    }
});

/**
 * --- 2. LIVE UTILITY MONITORING ---
 */
function loadUtilityStatus() {
    if (!utilityGrid) return;

    db.collection("utilityStatus").onSnapshot((snap) => {
        utilityGrid.innerHTML = '';
        
        const icons = {
            "Water": "💧",
            "Electricity": "⚡",
            "Laundry": "🧺",
            "Wi-Fi": "🌐"
        };

        if (snap.empty) {
            utilityGrid.innerHTML = '<p>No status updates currently available.</p>';
            return;
        }

        snap.forEach(doc => {
            const data = doc.data();
            const statusClass = data.isOperational ? 'online' : 'offline';
            const statusText = data.isOperational ? 'Operational' : 'Maintenance Mode';
            const icon = icons[data.name] || "🛠️";

            const card = document.createElement('div');
            card.className = 'utility-card';
            card.innerHTML = `
                <div class="utility-header">
                    <span class="utility-icon">${icon}</span>
                    <div class="status-indicator ${statusClass}"></div>
                </div>
                <h4>${data.name}</h4>
                <p style="font-size: 0.9rem; color: #555;">${statusText}</p>
            `;
            utilityGrid.appendChild(card);
        });
    });
}

/**
 * --- 3. UTILITY COMPLAINT HANDLER ---
 * I built this to allow students to report outages directly to the admin.
 * Attached to 'window' to ensure visibility within the module scope.
 */
window.submitComplaint = async () => {
    const type = document.getElementById('complaint-utility-type').value;
    const issue = document.getElementById('complaint-text').value;
    const statusMsg = document.getElementById('complaint-status-msg');

    if (!issue.trim()) {
        alert("Please describe the issue.");
        return;
    }

    try {
        statusMsg.textContent = "Processing... ⏳";
        
        // Storing complaint in a dedicated collection for Admin review
        await db.collection("complaints").add({
            utilityType: type,
            description: issue,
            studentEmail: auth.currentUser.email,
            studentUid: auth.currentUser.uid,
            status: "Pending", // Default status for new complaints
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        statusMsg.textContent = "✅ Complaint lodged successfully!";
        statusMsg.style.color = "#2e7d32";
        document.getElementById('complaint-text').value = ""; // Clear input

        // Auto-clear success message after 3 seconds
        setTimeout(() => { statusMsg.textContent = ""; }, 3000);

    } catch (error) {
        console.error("Complaint Error:", error);
        statusMsg.textContent = "❌ Error submitting complaint.";
        statusMsg.style.color = "#d32f2f";
    }
};

function loadRecentComplaints() {
    const list = document.getElementById('recent-complaints-list');
    if (!list) return;

    // Fetching the last 3 complaints to maintain a clean dashboard UI
    db.collection("complaints")
      .orderBy("createdAt", "desc")
      .limit(3)
      .onSnapshot((snap) => {
        list.innerHTML = '';
        if (snap.empty) {
            list.innerHTML = '<p style="font-size: 0.8rem; opacity: 0.5; text-align: center;">No active reports. Campus is running smoothly! ✨</p>';
            return;
        }

        snap.forEach(doc => {
            const data = doc.data();
            const isResolved = data.status === 'Resolved';
            
            const div = document.createElement('div');
            // Using class names for cleaner styling
            div.className = `complaint-feed-item ${isResolved ? 'resolved' : ''}`;

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size: 0.85rem;">${data.utilityType}</strong>
                    <span class="complaint-tag ${isResolved ? 'resolved' : ''}">
                        ${data.status.toUpperCase()}
                    </span>
                </div>
                <p style="margin-top: 5px; font-size: 0.8rem; opacity: 0.8; line-height: 1.4;">${data.description}</p>
            `;
            list.appendChild(div);
        });
    });
}
/**
 * --- 4. ADMINISTRATIVE BROADCAST ---
 */
const announceForm = document.getElementById('announcement-form');
if (announceForm) {
    announceForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const title = document.getElementById('announcement-title').value;
        const text = document.getElementById('announcement-text').value;
        const msg = document.getElementById('announcement-msg');

        try {
            await db.collection("announcements").add({
                title: title,
                text: text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                postedBy: auth.currentUser.email
            });

            if (msg) {
                msg.textContent = "✅ Broadcast sent successfully!";
                msg.style.color = "#2e7d32";
            }
            announceForm.reset(); 
        } catch (err) {
            console.error("Permission Error:", err);
            if (msg) {
                msg.textContent = "❌ Access Denied: Admin only.";
                msg.style.color = "#d32f2f";
            }
        }
    });
}

/**
 * --- 5. CAMPUS NEWS FEED ---
 */
function loadAnnouncements() {
    if (!announcementsContainer) return;

    db.collection("announcements")
      .orderBy("timestamp", "desc") 
      .limit(5)                        
      .onSnapshot((snap) => {
        announcementsContainer.innerHTML = ''; 
        
        if (snap.empty) {
            announcementsContainer.innerHTML = `<div class="empty-state"><p>📭 No recent updates.</p></div>`;
            return;
        }
        
        snap.forEach(doc => {
            const data = doc.data();
            const dateStr = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric'
            }) : 'Updating...';

            announcementsContainer.innerHTML += `
                <div class="announcement-item">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 5px;">
                        <strong style="color: #333;">${data.title}</strong>
                        <span style="font-size: 0.7rem; color: #888; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${dateStr}</span>
                    </div>
                    <p style="font-size: 0.85rem; color: #555; line-height: 1.4;">${data.text}</p>
                </div>
            `;
        });
    });
}

/**
 * --- 6. LOGOUT HANDLER ---
 */
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = "index.html";
    });
}

