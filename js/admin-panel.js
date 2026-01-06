import { auth, db, firebase } from './firebase-config.js';

/**
 * STATE MANAGEMENT
 * We keep track of the user list and the current tab to handle 
 * filtering and UI updates smoothly.
 */
let allUsers = [];
let activeAdminTab = 'users';

/**
 * SECURITY GATEKEEPER
 * This block ensures that only authorized administrators can see the panel.
 * If a regular student tries to access this page, they are booted back 
 * to the dashboard for security.
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists && userDoc.data().role === 'admin') {
            document.getElementById('admin-name-display').textContent = userDoc.data().name || "Admin";
            switchAdminTab('users'); // Defaulting to Student Management on login
        } else {
            alert("Access Denied: Admin privileges required.");
            window.location.href = "dashboard.html";
        }
    } else {
        window.location.href = "index.html";
    }
});

/**
 * DYNAMIC NAVIGATION SYSTEM
 * Instead of multiple pages, I built a single-page interface (SPA).
 * This function toggles section visibility and triggers the specific 
 * data fetcher for whichever category the admin is currently managing.
 */
window.switchAdminTab = (tab) => {
    activeAdminTab = tab;

    // Highlight the active button in the sidebar
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `btn-${tab}`);
    });

    // Mapping sidebar buttons to their respective HTML content sections
    const sections = {
        'users': 'section-users',
        'map': 'section-map', 
        'marketplace': 'section-moderation',
        'lostfound': 'section-moderation',
        'announcements': 'section-announcements',
        'utilities': 'section-utilities'
    };

    // Hide everything first, then show only what we need
    Object.values(sections).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const activeSectionId = sections[tab];
    if (activeSectionId) document.getElementById(activeSectionId).style.display = 'block';

    // Trigger the appropriate database listener for the selected tab
    if (tab === 'users') loadUserManagement();
    if (tab === 'map') loadAdminLocations(); 
    if (tab === 'marketplace') loadModeration('marketplace_items', '🛍️ Marketplace Moderation');
    if (tab === 'lostfound') loadModeration('lost_found_items', '🔍 Lost & Found Moderation');
    if (tab === 'announcements') loadAnnouncements();
    if (tab === 'utilities') loadUtilityManager();
};

/**
 * CAMPUS MAP MANAGER
 * Allows admins to add physical coordinates for buildings.
 * These points are pushed to Firestore and sync immediately with the student map.
 */
window.saveMapLocation = async function() {
    const name = document.getElementById('map-loc-name').value;
    const lat = parseFloat(document.getElementById('map-loc-lat').value);
    const lng = parseFloat(document.getElementById('map-loc-lng').value);

    // Validation to ensure we don't send broken data to the map API
    if (!name || isNaN(lat) || isNaN(lng)) {
        alert("Please enter a valid name and numeric coordinates.");
        return;
    }

    try {
        await db.collection("campus_locations").add({
            name: name,
            lat: lat,
            lng: lng,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("Landmark added successfully!");
        
        // Resetting form fields for the next entry
        document.getElementById('map-loc-name').value = '';
        document.getElementById('map-loc-lat').value = '';
        document.getElementById('map-loc-lng').value = '';
    } catch (e) {
        console.error("Error adding location:", e);
    }
};

function loadAdminLocations() {
    const list = document.getElementById('admin-map-list');
    // Live listener ensures that if a location is deleted, it disappears instantly from the list
    db.collection("campus_locations").orderBy("timestamp", "desc").onSnapshot(snap => {
        list.innerHTML = '';
        if (snap.empty) {
            list.innerHTML = '<p>No landmarks added yet.</p>';
            return;
        }
        snap.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'admin-panel-item';
            div.innerHTML = `
                <div>
                    <strong>${data.name}</strong><br>
                    <small>${data.lat}, ${data.lng}</small>
                </div>
                <button class="ban-btn" onclick="deleteLocation('${doc.id}')">Remove Landmark</button>
            `;
            list.appendChild(div);
        });
    });
}

window.deleteLocation = async (id) => {
    if (confirm("Permanently delete this landmark from the map?")) {
        await db.collection("campus_locations").doc(id).delete();
    }
};

/**
 * STUDENT DIRECTORY
 * Fetches all registered users. I added a filter function so admins 
 * can quickly find specific students in a large database.
 */
async function loadUserManagement() {
    const snap = await db.collection("users").get();
    allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderUsers(allUsers);
}

function renderUsers(users) {
    const container = document.getElementById('user-list-container');
    container.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'admin-panel-item';
        div.innerHTML = `
            <div>
                <strong>${u.name}</strong><br>
                <small>${u.email}</small>
            </div>
            <button class="ban-btn" onclick="deleteUserAccount('${u.id}')">Remove Student</button>
        `;
        container.appendChild(div);
    });
}

window.filterAdminUsers = () => {
    const query = document.getElementById('admin-user-search').value.toLowerCase();
    const filtered = allUsers.filter(u => 
        u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)
    );
    renderUsers(filtered);
};

window.deleteUserAccount = async (uid) => {
    if (confirm("Permanently remove this student?")) {
        await db.collection("users").doc(uid).delete();
        loadUserManagement();
    }
};

/**
 * GLOBAL CONTENT MODERATION
 * A unified function to handle both Marketplace and Lost & Found.
 * This keeps the code DRY (Don't Repeat Yourself) by reusing the same logic for different collections.
 */
async function loadModeration(collection, title) {
    document.getElementById('moderation-title').textContent = title;
    const list = document.getElementById('moderation-list');
    
    db.collection(collection).onSnapshot(snap => {
        list.innerHTML = '';
        if (snap.empty) {
            list.innerHTML = '<p>No items to moderate.</p>';
            return;
        }
        snap.forEach(doc => {
            const item = doc.data();
            const div = document.createElement('div');
            div.className = 'admin-panel-item';
            div.innerHTML = `
                <span>${item.itemName || item.title || "Untitled"}</span>
                <button class="ban-btn" onclick="deleteContent('${collection}', '${doc.id}')">Delete Post</button>
            `;
            list.appendChild(div);
        });
    });
}

window.deleteContent = async (col, id) => {
    if (confirm("Remove this post permanently?")) {
        await db.collection(col).doc(id).delete();
    }
};

/**
 * CAMPUS UTILITY TOGGLES
 * This allows the admin to manually flip the status of campus services 
 * (like Wi-Fi or Water) to 'Maintenance' mode if there's an outage.
 */
async function loadUtilityManager() {
    const container = document.getElementById('admin-utility-list');
    db.collection("utilityStatus").onSnapshot(snap => {
        container.innerHTML = '';
        snap.forEach(doc => {
            const u = doc.data();
            const btnClass = u.isOperational ? 'ban-btn' : 'btn-online';
            const status = u.isOperational ? 'OPERATIONAL' : 'MAINTENANCE';
            
            const div = document.createElement('div');
            div.className = 'admin-panel-item';
            div.innerHTML = `
                <span><strong>${u.name}</strong>: ${status}</span>
                <button class="${btnClass}" onclick="toggleUtility('${doc.id}', ${u.isOperational})">
                    Set to ${u.isOperational ? 'Maintenance' : 'Operational'}
                </button>
            `;
            container.appendChild(div);
        });
    });
}

window.toggleUtility = async (id, currentStatus) => {
    await db.collection("utilityStatus").doc(id).update({
        isOperational: !currentStatus
    });
};

/**
 * BROADCAST SYSTEM
 * Sends global notices to the student dashboard. 
 * I've included categories so students can filter between Urgent and General news.
 */
const annForm = document.getElementById('announcement-form');
if (annForm) {
    annForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('ann-title').value;
        const content = document.getElementById('ann-content').value;
        const category = document.getElementById('ann-category').value;

        await db.collection("announcements").add({
            title,
            text: content,
            category,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            postedBy: auth.currentUser.email
        });
        annForm.reset();
    });
}

async function loadAnnouncements() {
    const list = document.getElementById('active-announcements-list');
    db.collection("announcements").orderBy("timestamp", "desc").onSnapshot(snap => {
        list.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'admin-panel-item';
            div.innerHTML = `
                <div><strong>[${data.category}] ${data.title}</strong></div>
                <button class="ban-btn" onclick="deleteAnnouncement('${doc.id}')">Remove</button>
            `;
            list.appendChild(div);
        });
    });
}

window.deleteAnnouncement = async (id) => {
    await db.collection("announcements").doc(id).delete();
};