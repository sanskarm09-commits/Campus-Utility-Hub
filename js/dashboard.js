/**
 * CAMPUS UTILITIES HUB - DASHBOARD CONTROLLER
 * This module acts as the central brain of the student experience.
 * It manages real-time status updates for campus utilities and handles
 * the broadcast system for official announcements.
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
 * On load, we verify the user's identity. 
 * If they are an Admin, the UI dynamically expands to show administrative tools.
 * If they aren't logged in, they are redirected to protect the data.
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userDoc = await db.collection("users").doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Greeting the user by their preferred name
                if (userDisplayName) {
                    userDisplayName.textContent = userData.name || user.email.split('@')[0];
                }

                // ROLE-BASED ACCESS CONTROL (RBAC)
                // Only users with the 'admin' flag see these specific management shortcuts
                if (userData.role === 'admin') {
                    if (adminLink) adminLink.style.display = 'block';
                    if (adminAnnounceSection) adminAnnounceSection.style.display = 'block';
                }
            } else {
                // Fallback if the user profile hasn't fully propagated yet
                if (userDisplayName) userDisplayName.textContent = user.email.split('@')[0];
            }

            // Initialize the real-time data streams
            loadAnnouncements();
            loadUtilityStatus();

        } catch (error) {
            console.error("Dashboard Auth Error:", error);
        }
    } else {
        // Security check: No session found, send user to login
        if (!window.location.pathname.includes("index.html")) {
            window.location.href = "index.html"; 
        }
    }
});

/**
 * --- 2. LIVE UTILITY MONITORING ---
 * I built this to provide a "Glanceable" view of campus health.
 * It uses a WebSocket-like listener (onSnapshot) so that if an Admin 
 * marks a utility as 'Down', the student's dashboard updates instantly.
 */
function loadUtilityStatus() {
    if (!utilityGrid) return;

    db.collection("utilityStatus").onSnapshot((snap) => {
        utilityGrid.innerHTML = '';
        
        // Mapping internal names to visual symbols for better UX
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

            // Creating dynamic cards with CSS-driven status indicators
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
 * --- 3. ADMINISTRATIVE BROADCAST ---
 * Allows authorized users to push announcements directly to the campus feed.
 * Includes built-in error handling for permission validation.
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
            console.error("Firestore Permission Error:", err);
            if (msg) {
                msg.textContent = "❌ Denied: You do not have Admin permission.";
                msg.style.color = "#d32f2f";
            }
        }
    });
}

/**
 * --- 4. CAMPUS NEWS FEED ---
 * Fetches the 5 most recent announcements.
 * I used a descending order by timestamp so the freshest news stays at the top.
 */
function loadAnnouncements() {
    if (!announcementsContainer) return;

    db.collection("announcements")
      .orderBy("timestamp", "desc") 
      .limit(5)                        
      .onSnapshot((snap) => {
        announcementsContainer.innerHTML = ''; 
        
        if (snap.empty) {
            announcementsContainer.innerHTML = `<div class="empty-state"><p>📭 The feed is quiet today.</p></div>`;
            return;
        }
        
        snap.forEach(doc => {
            const data = doc.data();
            
            // Human-readable date formatting
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
 * --- 5. LOGOUT HANDLER ---
 * Safely clears the session and returns the user to the starting point.
 */
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = "index.html";
    });
}