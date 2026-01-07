import { auth, db, firebase } from './firebase-config.js';

/**
 * --- ADMIN PANEL CONTROLLER ---
 * Centralized state and event management for all administrative tasks.
 */
let allUsers = [];
let activeAdminTab = 'users';

/**
 * SECURITY GATEKEEPER
 * Verifies admin credentials before allowing access to the panel.
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists && userDoc.data().role === 'admin') {
            document.getElementById('admin-name-display').textContent = userDoc.data().name || "Admin";
            switchAdminTab('users'); 
        } else {
            alert("Access Denied: Admin privileges required.");
            window.location.href = "dashboard.html";
        }
    } else {
        window.location.href = "index.html";
    }
});

/**
 * DYNAMIC NAVIGATION SYSTEM (SPA Logic)
 * Toggles section visibility and routes data fetching based on the active tab.
 */
window.switchAdminTab = (tab) => {
    activeAdminTab = tab;

    // Sidebar UI Highlighting
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `btn-${tab}`);
    });

    /**
     * DOM Mapping: 
     * I unified Marketplace and LostFound to share 'section-moderation' 
     * to keep the HTML clean and prevent 'null' reference errors.
     */
    const sections = {
        'users': 'section-users',
        'map': 'section-map', 
        'marketplace': 'section-moderation',
        'lostfound': 'section-moderation',
        'complaints': 'section-complaints',
        'announcements': 'section-announcements',
        'utilities': 'section-utilities'
    };

    // Global Section Reset
    Object.values(sections).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const activeSectionId = sections[tab];
    if (activeSectionId) document.getElementById(activeSectionId).style.display = 'block';

    // Data Router
    if (tab === 'users') loadUserManagement();
    if (tab === 'map') loadAdminLocations(); 
    if (tab === 'marketplace') loadModeration('marketplace_items', '🛍️ Marketplace Moderation');
    if (tab === 'lostfound') loadModeration('lost_found_items', '🔍 Lost & Found Moderation');
    if (tab === 'complaints') loadComplaints();
    if (tab === 'announcements') loadAnnouncements();
    if (tab === 'utilities') loadUtilityManager();
};

/**
 * COMPLAINT MONITOR
 * Real-time listener for the utility complaints lodged by students.
 */
async function loadComplaints() {
    const list = document.getElementById('complaint-list');
    if (!list) return;

    db.collection("complaints").orderBy("createdAt", "desc").onSnapshot(snap => {
        list.innerHTML = '';
        if (snap.empty) {
            list.innerHTML = '<p style="padding:20px; opacity:0.6;">No complaints filed yet.</p>';
            return;
        }
        snap.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = `admin-panel-item ${data.status === 'Resolved' ? 'resolved-dim' : ''}`;
            div.style.borderLeft = data.status === 'Resolved' ? '5px solid #34a853' : '5px solid #ea4335';
            
            div.innerHTML = `
                <div>
                    <strong>${data.utilityType} Issue</strong> - <small>${data.status}</small><br>
                    <p style="margin: 5px 0;">"${data.description}"</p>
                    <small style="opacity:0.7;">Reporter: ${data.studentEmail}</small>
                </div>
                <div style="display:flex; gap:10px;">
                    ${data.status !== 'Resolved' ? `<button onclick="resolveComplaint('${doc.id}')" class="btn-online">Mark Resolved</button>` : ''}
                    <button onclick="deleteContent('complaints', '${doc.id}')" class="ban-btn">Remove</button>
                </div>
            `;
            list.appendChild(div);
        });
    });
}

window.resolveComplaint = async (id) => {
    if(confirm("Mark this issue as fixed?")) {
        await db.collection("complaints").doc(id).update({ status: "Resolved" });
    }
};

/**
 * CAMPUS MAP MANAGER
 * Direct Firestore injection for building coordinates.
 */
window.saveMapLocation = async function() {
    const name = document.getElementById('map-loc-name').value;
    const lat = parseFloat(document.getElementById('map-loc-lat').value);
    const lng = parseFloat(document.getElementById('map-loc-lng').value);

    if (!name || isNaN(lat) || isNaN(lng)) {
        alert("Please enter valid name and coordinates.");
        return;
    }

    try {
        await db.collection("campus_locations").add({
            name, lat, lng,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("Landmark added!");
        ['map-loc-name', 'map-loc-lat', 'map-loc-lng'].forEach(id => document.getElementById(id).value = '');
    } catch (e) { console.error(e); }
};

function loadAdminLocations() {
    const list = document.getElementById('admin-map-list');
    db.collection("campus_locations").orderBy("timestamp", "desc").onSnapshot(snap => {
        list.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'admin-panel-item';
            div.innerHTML = `
                <div><strong>${data.name}</strong><br><small>${data.lat}, ${data.lng}</small></div>
                <button class="ban-btn" onclick="deleteLocation('${doc.id}')">Remove Landmark</button>
            `;
            list.appendChild(div);
        });
    });
}

window.deleteLocation = async (id) => {
    if (confirm("Delete this landmark?")) await db.collection("campus_locations").doc(id).delete();
};

/**
 * STUDENT DIRECTORY
 */
async function loadUserManagement() {
    const snap = await db.collection("users").get();
    allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderUsers(allUsers);
}

function renderUsers(users) {
    const container = document.getElementById('user-list-container');
    if (!container) return;
    container.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'admin-panel-item';
        div.innerHTML = `
            <div><strong>${u.name}</strong><br><small>${u.email}</small></div>
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
 * SHARED MODERATION ENGINE
 */
async function loadModeration(collection, title) {
    const titleEl = document.getElementById('moderation-title');
    const list = document.getElementById('moderation-list');
    if (titleEl) titleEl.textContent = title;
    
    db.collection(collection).onSnapshot(snap => {
        if (!list) return;
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
    if (confirm("Remove this entry permanently?")) await db.collection(col).doc(id).delete();
};

/**
 * UTILITY STATUS MANAGER
 */
async function loadUtilityManager() {
    const container = document.getElementById('admin-utility-list');
    db.collection("utilityStatus").onSnapshot(snap => {
        if (!container) return;
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
    await db.collection("utilityStatus").doc(id).update({ isOperational: !currentStatus });
};

/**
 * BROADCAST & ANNOUNCEMENTS
 */
const annForm = document.getElementById('announcement-form');
if (annForm) {
    annForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await db.collection("announcements").add({
            title: document.getElementById('ann-title').value,
            text: document.getElementById('ann-content').value,
            category: document.getElementById('ann-category').value,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            postedBy: auth.currentUser.email
        });
        annForm.reset();
    });
}

async function loadAnnouncements() {
    const list = document.getElementById('active-announcements-list');
    db.collection("announcements").orderBy("timestamp", "desc").onSnapshot(snap => {
        if (!list) return;
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