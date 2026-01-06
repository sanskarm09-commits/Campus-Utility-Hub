/**
 * CAMPUS UTILITIES HUB - LOST & FOUND MODULE
 * Developed to facilitate community help through real-time reporting.
 * Key features: Cloudinary image hosting, Firestore snapshots, and 
 * a draggable P2P chat bridge.
 */
import { auth, db } from './firebase-config.js';

// --- 1. DOM SELECTORS ---
const reportForm = document.getElementById('report-item-form');
const itemsContainer = document.getElementById('items-container');
const uploadStatus = document.getElementById('report-status'); 
const itemsView = document.getElementById('items-view');
const reportFormView = document.getElementById('report-form-view');
const toggleReportBtn = document.getElementById('toggle-report-item');
const backBtn = document.getElementById('back-to-items');
const filterType = document.getElementById('filter-type');
const searchInput = document.getElementById('search-items');

const inboxToggle = document.getElementById('inbox-toggle');
const inboxMenu = document.getElementById('inbox-menu');
const chatDrawer = document.getElementById('chat-drawer');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const logoutBtn = document.getElementById('logout-button');

// --- 2. CONFIGURATION & STATE ---
let currentActiveChatId = null;
let currentChatListener = null;

const CLOUD_NAME = "di1jmmord";
const UPLOAD_PRESET = "CampusUtilityHub";

/**
 * --- 3. UI VIEW CONTROLS ---
 * Simple display toggles to switch between the "Discovery Feed" 
 * and "Report" views without page reloads.
 */
if (toggleReportBtn) {
    toggleReportBtn.onclick = () => {
        itemsView.style.display = 'none';
        reportFormView.style.display = 'block';
        toggleReportBtn.style.visibility = 'hidden';
    };
}

if (backBtn) {
    backBtn.onclick = () => {
        reportFormView.style.display = 'none';
        itemsView.style.display = 'block';
        toggleReportBtn.style.visibility = 'visible';
    };
}

/**
 * --- 4. ASYNC ITEM SUBMISSION ---
 * Dual-process: Uploads photo to Cloudinary first, then saves 
 * metadata to Firestore.
 */
if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-report-btn');
        const status = document.getElementById('report-type').value; 
        const name = document.getElementById('item-name').value;
        const desc = document.getElementById('item-desc').value;
        const imageFile = document.getElementById('item-photo').files[0];

        try {
            submitBtn.disabled = true;
            uploadStatus.textContent = "Uploading to Cloud... ☁️";

            let finalImageUrl = "https://via.placeholder.com/300?text=No+Image";

            if (imageFile) {
                const formData = new FormData();
                formData.append('file', imageFile);
                formData.append('upload_preset', UPLOAD_PRESET);

                const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                finalImageUrl = data.secure_url;
            }

            await db.collection("lost_found_items").add({
                itemName: name,
                description: desc,
                status: status,
                imageUrl: finalImageUrl,
                reportedBy: auth.currentUser.email,
                reporterId: auth.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            uploadStatus.textContent = "✅ Posted Successfully!";
            reportForm.reset();
            setTimeout(() => { backBtn.click(); uploadStatus.textContent = ""; }, 1500);
        } catch (error) {
            console.error("Upload Error:", error);
            uploadStatus.textContent = "❌ Error uploading item.";
        } finally {
            submitBtn.disabled = false;
        }
    });
}

/**
 * --- 5. PEER-TO-PEER MESSAGING ---
 * I built this real-time bridge so students can coordinate meetups safely.
 * Note: I've made contactReporter global to fix the ReferenceError.
 */

window.contactReporter = async (reporterId, reporterEmail, itemId) => {
    // Prevent students from messaging themselves
    if (reporterId === auth.currentUser.uid) return;

    // Standard deterministic ID starting with LF_ for Hub filtering
    const chatId = `LF_${itemId}_${auth.currentUser.uid}_${reporterId}`;
    const chatRef = db.collection("chats").doc(chatId);
    
    try {
        const doc = await chatRef.get();
        if (!doc.exists) {
            await chatRef.set({
                itemId: itemId,
                participants: [auth.currentUser.uid, reporterId],
                participantEmails: [auth.currentUser.email, reporterEmail],
                messages: [],
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        window.openChatSession(chatId);
    } catch (err) {
        console.error("Chat initiation failed:", err);
    }
};

const sendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text || !currentActiveChatId) return;

    try {
        await db.collection("chats").doc(currentActiveChatId).update({
            messages: firebase.firestore.FieldValue.arrayUnion({
                senderId: auth.currentUser.uid,
                text: text,
                timestamp: new Date().toISOString()
            }),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        chatInput.value = ''; 
        chatMessages.scrollTop = chatMessages.scrollHeight; 
    } catch (error) {
        console.error("Chat Send Error:", error);
    }
};

function startChatListener(chatId) {
    if (currentChatListener) currentChatListener(); 
    currentChatListener = db.collection("chats").doc(chatId).onSnapshot((doc) => {
        if (!doc.exists) return;
        chatMessages.innerHTML = '';
        const data = doc.data();
        (data.messages || []).forEach(msg => {
            const div = document.createElement('div');
            div.className = `msg ${msg.senderId === auth.currentUser.uid ? 'sent' : 'received'}`;
            div.textContent = msg.text;
            chatMessages.appendChild(div);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

window.openChatSession = (chatId) => {
    currentActiveChatId = chatId;
    if (chatDrawer) {
        chatDrawer.classList.add('open');
        chatDrawer.style.display = 'flex';
        startChatListener(chatId);
    }
};

// Draggable logic for the chat drawer overlay
const dragElement = (elmnt) => {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = elmnt.querySelector(".chat-header");
    if (header) {
        header.onmousedown = (e) => {
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = (e) => {
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
                elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
                elmnt.style.bottom = "auto"; elmnt.style.right = "auto";
            };
        };
    }
}
if (chatDrawer) dragElement(chatDrawer);

/**
 * --- 6. REAL-TIME DISCOVERY FEED ---
 */
function initializeFeed() {
    const selectedFilter = filterType.value;
    const searchTerm = (searchInput.value || "").toLowerCase().trim();

    db.collection("lost_found_items").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        itemsContainer.innerHTML = ''; 
        
        if (snapshot.empty) {
            itemsContainer.innerHTML = '<p style="padding: 20px;">No reports found.</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const item = doc.data();
            const itemName = (item.itemName || "").toLowerCase();
            const itemDesc = (item.description || "").toLowerCase();

            if (selectedFilter !== "all" && item.status !== selectedFilter) return;
            const matchesSearch = itemName.includes(searchTerm) || itemDesc.includes(searchTerm);
            if (searchTerm !== "" && !matchesSearch) return;

            const card = document.createElement('div');
            card.className = 'item-card';
            
            const statusClass = item.status === 'lost' ? 'status-lost' : 
                                item.status === 'found' ? 'status-found' : 'status-returned';
            
            const isOwner = item.reporterId === auth.currentUser?.uid;

            card.innerHTML = `
                <img src="${item.imageUrl}" alt="${item.itemName}">
                <div class="item-info">
                    <span class="status-tag ${statusClass}">${item.status.toUpperCase()}</span>
                    <h4>${item.itemName}</h4>
                    <p>${item.description}</p>
                    <div class="card-actions" style="margin-top: 15px;">
                        ${isOwner ? 
                            `<div style="display:flex; gap:5px;">
                                <button onclick="markAsReturned('${doc.id}')" style="flex:1; background:#28a745; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer;">✅ Returned</button>
                                <button onclick="removeReport('${doc.id}')" style="flex:1; background:#dc3545; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer;">🗑️ Delete</button>
                            </div>` : 
                            `<button class="btn-primary" style="width:100%" onclick="contactReporter('${item.reporterId}', '${item.reportedBy}', '${doc.id}')">
                                💬 Contact ${item.status === 'lost' ? 'Finder' : 'Owner'}
                            </button>`
                        }
                    </div>
                </div>
            `;
            itemsContainer.appendChild(card);
        });
    });
}

/**
 * --- 7. UTILITY & EVENT HANDLERS ---
 */
function loadHeaderInbox() {
    if (!auth.currentUser) return;
    db.collection("chats")
        .where("participants", "array-contains", auth.currentUser.uid)
        .orderBy("lastUpdated", "desc")
        .onSnapshot((snap) => {
            const container = document.getElementById('inbox-container');
            const msgCount = document.getElementById('msg-count');
            if (!container) return;
            container.innerHTML = '';
            let unread = 0;

            snap.forEach((doc) => {
                const chat = doc.data();
                const isLF = doc.id.startsWith("LF_");
                const typeLabel = isLF ? '<span class="label-lf">🔍 L&F</span>' : '<span class="label-market">🛍️ Market</span>';
                
                const emails = chat.participantEmails || [];
                const otherEmail = emails.find(e => e !== auth.currentUser.email) || "User";
                const lastMsg = (chat.messages || []).slice(-1)[0];
                const isNew = lastMsg && lastMsg.senderId !== auth.currentUser.uid;
                if (isNew) unread++;

                const div = document.createElement('div');
                div.className = 'chat-summary-card';
                const displayName = otherEmail.includes('@') ? otherEmail.split('@')[0] : otherEmail;

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>${displayName}</strong>
                        ${typeLabel}
                    </div>
                    <p>${lastMsg ? lastMsg.text : 'New Chat'}</p>
                `;
                div.onclick = () => window.openChatSession(doc.id);
                container.appendChild(div);
            });
            if (msgCount) msgCount.textContent = unread > 0 ? `(${unread})` : '';
        });
}

window.markAsReturned = async (id) => {
    if (confirm("Has this item been successfully returned?")) {
        await db.collection("lost_found_items").doc(id).update({ status: 'returned' });
    }
};

window.removeReport = async (id) => {
    if (confirm("Delete this report?")) await db.collection("lost_found_items").doc(id).delete();
};

window.closeChat = () => { if (chatDrawer) chatDrawer.style.display = 'none'; };

// Initializing listeners and session-based loaders
if (filterType) filterType.addEventListener('change', initializeFeed);
if (searchInput) searchInput.addEventListener('input', initializeFeed);
if (inboxToggle) {
    inboxToggle.onclick = (e) => { e.stopPropagation(); inboxMenu.classList.toggle('show'); };
}

auth.onAuthStateChanged((user) => {
    if (user) {
        initializeFeed();
        loadHeaderInbox();
    }
});

if (logoutBtn) {
    logoutBtn.onclick = () => auth.signOut().then(() => window.location.href = "index.html");
}

if (sendMsgBtn) sendMsgBtn.onclick = sendMessage;