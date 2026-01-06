/**
 * CAMPUS UTILITIES HUB - CHAT HUB CONTROLLER
 * This module manages real-time communication across the campus.
 * I built it to handle three distinct types of conversations:
 * 1. General DMs (Student to Student)
 * 2. Marketplace Inquiries (Buyer to Seller)
 * 3. Lost & Found leads
 */
import { auth, db, firebase } from './firebase-config.js';

// --- 1. GLOBALS & SELECTORS ---
let activeChatId = null;
let currentTab = 'general';
let chatListener = null;

// PERFORMANCE OPTIMIZATION: I implemented a local cache for user profile data.
// This prevents redundant database calls for names/PFPs every time a message renders.
const userCache = {}; 

const conversationList = document.getElementById('conversation-list');
const messageContainer = document.getElementById('chat-hub-messages');
const chatInput = document.getElementById('chat-hub-input');
const sendBtn = document.getElementById('send-hub-btn');
const searchInput = document.getElementById('user-search-input');
const searchResults = document.getElementById('search-results');
const logoutBtn = document.getElementById('logout-button');

/**
 * --- 2. CORE CONVERSATION ENGINE ---
 * This function handles the sidebar logic. It filters conversations based on 
 * their origin (Marketplace vs General) so the user doesn't get overwhelmed.
 */
async function loadConversations() {
    if (!auth.currentUser || !conversationList) return;

    // We only pull chats where the logged-in user is a participant
    db.collection("chats")
        .where("participants", "array-contains", auth.currentUser.uid)
        .orderBy("lastUpdated", "desc")
        .onSnapshot(async (snap) => {
            conversationList.innerHTML = '';
            
            for (const doc of snap.docs) {
                const chat = doc.data();
                const chatId = doc.id;
                
                // Identify the chat type based on ID prefixes and metadata
                const isLF = chatId.startsWith("LF_");
                const isMarket = chat.itemId && !isLF;
                const isGeneral = !isLF && !isMarket;

                // Tab Filtering Logic: Only show chats relevant to the current view
                if (currentTab === 'lost-found' && !isLF) continue;
                if (currentTab === 'marketplace' && !isMarket) continue;
                if (currentTab === 'general' && !isGeneral) continue;

                const otherUid = chat.participants.find(id => id !== auth.currentUser.uid);
                
                // Lazy-loading user details into the cache
                if (!userCache[otherUid]) {
                    const userDoc = await db.collection("users").doc(otherUid).get();
                    userCache[otherUid] = userDoc.exists ? {
                        name: userDoc.data().name || "User",
                        pfp: userDoc.data().profilePic || "https://via.placeholder.com/40"
                    } : { name: "User", pfp: "https://via.placeholder.com/40" };
                }

                const userData = userCache[otherUid];
                const lastMsg = chat.messages?.length > 0 ? chat.messages[chat.messages.length - 1].text : "New Chat";
                
                // UI Visual Cues: Color-coded badges for different chat categories
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

// Global function to allow HTML buttons to trigger tab switches
window.switchTab = (tabName) => {
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const btnText = btn.innerText.toLowerCase();
        btn.classList.toggle('active', btnText.includes(tabName.split('-')[0]));
    });

    // We only show the global user search bar in the 'General' tab
    const searchBar = document.getElementById('user-search-container');
    if (searchBar) searchBar.style.display = tabName === 'general' ? 'flex' : 'none';

    loadConversations();
};

/**
 * --- 3. SESSION MONITOR ---
 * Verifies the student is logged in and checks for Admin status to 
 * show/hide the Admin Panel link accordingly.
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        window.switchTab('general'); 
        try {
            const userDoc = await db.collection("users").doc(user.uid).get();
            if (userDoc.exists && userDoc.data().role === 'admin') {
                const adminLink = document.getElementById('admin-panel-link');
                if (adminLink) adminLink.style.display = 'block';
            }
        } catch (error) {
            console.error("Auth check failed:", error);
        }
    } else {
        window.location.href = "index.html";
    }
});

/**
 * --- 4. DISCOVERY & SEARCH ---
 * Allows students to find others by name or email. 
 * Once a user is selected, it triggers a 'Chat Initiation' which either 
 * resumes an existing chat or creates a new one in the database.
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

                // Exclude the current user from their own search results
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

async function initiateChat(targetEmail, targetUid, targetName) {
    if (searchResults) searchResults.style.display = 'none';
    if (searchInput) searchInput.value = '';

    // Create a unique deterministic ID for the chat between two people
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
 * Opens a persistent connection (Snapshot) to a specific conversation.
 * I designed the UI to show avatars on the appropriate side to mimic 
 * standard messaging app behavior.
 */
function openChat(chatId, displayName) {
    activeChatId = chatId;
    document.getElementById('chat-header-info').textContent = `Chatting with: ${displayName}`;
    
    // Clean up old listeners to prevent memory leaks or dual-updates
    if (chatListener) chatListener(); 
    
    chatListener = db.collection("chats").doc(chatId).onSnapshot(async (doc) => {
        if (!messageContainer || !doc.exists) return;
        messageContainer.innerHTML = '';
        const messages = doc.data().messages || [];

        for (const msg of messages) {
            const isMe = msg.senderId === auth.currentUser.uid;
            
            // Check cache for avatars to keep rendering fast
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
        // Auto-scroll to the latest message
        messageContainer.scrollTop = messageContainer.scrollHeight;
    });
}

// Function to push a new message object into the Firestore array
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

// --- EVENT BINDING ---
if (sendBtn) sendBtn.onclick = sendMessage;
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// Session Cleanup
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = "index.html";
        }).catch((err) => console.error("Logout Error:", err));
    });
}