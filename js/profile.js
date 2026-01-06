/**
 * CAMPUS UTILITIES HUB - CHAT HUB CONTROLLER
 * This module manages the real-time communication infrastructure of the portal.
 * I designed it to handle three distinct conversation categories:
 * 1. General DMs (Student to Student)
 * 2. Marketplace Inquiries (Buyer to Seller)
 * 3. Lost & Found leads
 */
import { auth, db, firebase } from './firebase-config.js';

// --- 1. GLOBALS & SELECTORS ---
let activeChatId = null;
let currentTab = 'general';
let chatListener = null;

/** * PERFORMANCE OPTIMIZATION: 
 * I implemented a local cache for user profile data (names/PFPs).
 * This prevents redundant Firestore calls every time a message renders.
 */
const userCache = {}; 

const conversationList = document.getElementById('conversation-list');
const messageContainer = document.getElementById('chat-hub-messages');
const chatInput = document.getElementById('chat-hub-input');
const sendBtn = document.getElementById('send-hub-btn');
const searchInput = document.getElementById('user-search-input');
const searchResults = document.getElementById('search-results');
const logoutBtn = document.getElementById('logout-button');

/**
 * --- 2. CONVERSATION MANAGEMENT ---
 * This function handles the sidebar logic. It uses a composite Firestore query
 * to fetch only the chats the current student is involved in.
 */
async function loadConversations() {
    if (!auth.currentUser || !conversationList) return;

    db.collection("chats")
        .where("participants", "array-contains", auth.currentUser.uid)
        .orderBy("lastUpdated", "desc")
        .onSnapshot(async (snap) => {
            conversationList.innerHTML = '';
            
            for (const doc of snap.docs) {
                const chat = doc.data();
                const chatId = doc.id;
                
                // Identify the context of the chat based on ID prefixes and metadata
                const isLF = chatId.startsWith("LF_");
                const isMarket = chat.itemId && !isLF;
                const isGeneral = !isLF && !isMarket;

                // Category Filtering: Only display chats relevant to the active tab
                if (currentTab === 'lost-found' && !isLF) continue;
                if (currentTab === 'marketplace' && !isMarket) continue;
                if (currentTab === 'general' && !isGeneral) continue;

                const otherUid = chat.participants.find(id => id !== auth.currentUser.uid);
                
                // Lazy-loading user details into the local cache
                if (!userCache[otherUid]) {
                    const userDoc = await db.collection("users").doc(otherUid).get();
                    userCache[otherUid] = userDoc.exists ? {
                        name: userDoc.data().name || "User",
                        pfp: userDoc.data().profilePic || "https://via.placeholder.com/40"
                    } : { name: "User", pfp: "https://via.placeholder.com/40" };
                }

                const userData = userCache[otherUid];
                const lastMsg = chat.messages?.length > 0 ? chat.messages[chat.messages.length - 1].text : "New Chat";
                
                // UI Visual Cues: Color-coded badges to distinguish different chat contexts
                const badgeColor = isLF ? '#fbbc04' : isMarket ? '#34a853' : '#70757a';

                const div = document.createElement('div');
                div.className = `convo-item ${chatId === activeChatId ? 'active' : ''}`;
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; padding: 10px;">
                        <img src="${userData.pfp}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">
                        <div style="flex: 1; overflow: hidden;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="font-size: 14px;">${userData.name}</strong>
                                <span style="font-size: 9px; color: ${badgeColor}; font-weight: bold;">
                                    ${isLF ? 'LF' : isMarket ? 'MKT' : 'GEN'}
                                </span>
                            </div>
                            <p style="margin: 0; font-size: 12px; color: #666; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">
                                ${lastMsg}
                            </p>
                        </div>
                    </div>
                `;
                div.onclick = () => openChat(chatId, userData.name);
                conversationList.appendChild(div);
            }
        });
}

// Global UI control for tab switching
window.switchTab = (tabName) => {
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const btnText = btn.innerText.toLowerCase();
        btn.classList.toggle('active', btnText.includes(tabName.split('-')[0]));
    });

    // The global user search is only visible in the 'General' tab
    const searchBar = document.getElementById('user-search-container');
    if (searchBar) searchBar.style.display = tabName === 'general' ? 'flex' : 'none';

    loadConversations();
};

/**
 * --- 3. SESSION MONITORING ---
 * Verifies the user is logged in and checks for Administrative roles 
 * to reveal the panel link if necessary.
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        window.switchTab('general'); // Initialize view on login
        try {
            const userDoc = await db.collection("users").doc(user.uid).get();
            if (userDoc.exists && userDoc.data().role === 'admin') {
                const adminLink = document.getElementById('admin-panel-link');
                if (adminLink) adminLink.style.display = 'block';
            }
        } catch (error) {
            console.error("Auth permission check failed:", error);
        }
    } else {
        window.location.href = "index.html";
    }
});

/**
 * --- 4. DISCOVERY & INITIATION ---
 * Enables searching for peers by name or email. I implemented a debounced
 * feel by requiring at least 2 characters before querying the database.
 */
if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
        const queryText = e.target.value.trim().toLowerCase();
        if (queryText.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        try {
            const snap = await db.collection("users").limit(50).get();
            searchResults.innerHTML = '';
            let matchCount = 0;

            snap.forEach(doc => {
                const user = doc.data();
                const name = (user.name || "").toLowerCase();
                const email = (user.email || "").toLowerCase();

                // Do not show the logged-in user in their own search results
                if ((name.includes(queryText) || email.includes(queryText)) && doc.id !== auth.currentUser.uid) {
                    matchCount++;
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerHTML = `<strong>${user.name || 'User'}</strong><br><small>${user.email}</small>`;
                    div.onclick = () => initiateChat(user.email, doc.id, user.name);
                    searchResults.appendChild(div);
                }
            });
            searchResults.style.display = matchCount > 0 ? 'block' : 'none';
        } catch (err) { console.error("Search Error:", err); }
    });
}

// Logic to create a new deterministic chat ID between two users
async function initiateChat(targetEmail, targetUid, targetName) {
    if (searchResults) searchResults.style.display = 'none';
    if (searchInput) searchInput.value = '';

    // Alphabetical sort of UIDs ensures the same ID is generated regardless of who starts the chat
    const chatId = [auth.currentUser.uid, targetUid].sort().join('_');
    const chatRef = db.collection("chats").doc(chatId);
    const doc = await chatRef.get();

    if (!doc.exists) {
        await chatRef.set({
            participants: [auth.currentUser.uid, targetUid],
            participantEmails: [auth.currentUser.email, targetEmail],
            messages: [],
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    openChat(chatId, targetName || targetEmail);
}

/**
 * --- 5. REAL-TIME MESSAGING ENGINE ---
 * Connects a persistent snapshot listener to the active conversation.
 */
function openChat(chatId, displayName) {
    activeChatId = chatId;
    document.getElementById('chat-header-info').textContent = `Chatting with: ${displayName}`;
    
    // Clean up previous listeners to prevent dual-rendering and memory leaks
    if (chatListener) chatListener(); 
    
    chatListener = db.collection("chats").doc(chatId).onSnapshot(async (doc) => {
        if (!messageContainer || !doc.exists) return;
        messageContainer.innerHTML = '';
        const messages = doc.data().messages || [];

        for (const msg of messages) {
            const isMe = msg.senderId === auth.currentUser.uid;
            
            // Check cache for avatar or fetch if missing
            if (!userCache[msg.senderId]) {
                const uDoc = await db.collection("users").doc(msg.senderId).get();
                userCache[msg.senderId] = uDoc.exists ? { pfp: uDoc.data().profilePic } : { pfp: "" };
            }

            const pic = userCache[msg.senderId].pfp || "https://via.placeholder.com/40";
            const div = document.createElement('div');
            div.className = `msg-wrapper ${isMe ? 'sent' : 'received'}`;
            div.innerHTML = `
                ${!isMe ? `<img src="${pic}" class="chat-avatar">` : ''}
                <div class="msg-bubble">${msg.text}</div>
                ${isMe ? `<img src="${pic}" class="chat-avatar">` : ''}
            `;
            messageContainer.appendChild(div);
        }
        // Auto-scroll to the bottom of the conversation
        messageContainer.scrollTop = messageContainer.scrollHeight;
    });
}

// Updates the message array in Firestore with a new message object
const sendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text || !activeChatId) return;

    await db.collection("chats").doc(activeChatId).update({
        messages: firebase.firestore.FieldValue.arrayUnion({
            senderId: auth.currentUser.uid,
            text: text,
            timestamp: new Date().toISOString()
        }),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    chatInput.value = '';
};

// --- 6. EVENT LISTENERS ---
if (sendBtn) sendBtn.onclick = sendMessage;
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => window.location.href = "index.html");
    });
}