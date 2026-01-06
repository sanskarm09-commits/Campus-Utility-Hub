/**
 * CAMPUS UTILITIES HUB - MARKETPLACE MODULE
 * This module enables a peer-to-peer student economy. 
 * Key features include:
 * 1. Cloudinary-powered image uploads for listings.
 * 2. Real-time product catalog with 'Sold' status management.
 * 3. Integrated Chat System for secure buyer-seller negotiations.
 */

import { auth, db } from './firebase-config.js';

// --- 1. DOM ELEMENT SELECTORS ---
const marketForm = document.getElementById('marketplace-form');
const marketContainer = document.getElementById('market-container');
const listingStatus = document.getElementById('listing-status');
const chatDrawer = document.getElementById('chat-drawer');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const inboxContainer = document.getElementById('inbox-container');

// View Control Selectors
const galleryView = document.getElementById('gallery-view');
const addItemView = document.getElementById('add-item-view');
const toggleAddBtn = document.getElementById('toggle-add-item');
const backBtn = document.getElementById('back-to-gallery');

// Header UI Components
const inboxToggle = document.getElementById('inbox-toggle');
const inboxMenu = document.getElementById('inbox-menu');
const hideSoldToggle = document.getElementById('hide-sold-toggle');
const logoutBtn = document.getElementById('logout-button');

// --- 2. CONFIGURATION & STATE ---
let currentActiveChatId = null; 
let currentChatListener = null;
let hideSold = false;

// Cloudinary credentials for hosting student product photos
const CLOUD_NAME = "di1jmmord";
const UPLOAD_PRESET = "CampusUtilityHub";

/**
 * --- 3. SESSION & PERMISSION MONITOR ---
 * Verifies that the user is logged in and checks if they have Admin 
 * permissions to display the hidden management links.
 */
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        loadInbox();
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
        // Redirect if a student tries to access the marketplace without an account
        window.location.href = "index.html"; 
    }
});

// Logout handler: Clears the session and sends user to the portal gate
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = "index.html";
        }).catch((err) => console.error("Logout Error:", err));
    });
}

/**
 * --- 4. NAVIGATION LOGIC ---
 * Using a clean toggle system to swap between the "Market Gallery" and 
 * the "Post New Item" form without refreshing the page.
 */
if (inboxToggle) {
    inboxToggle.onclick = (e) => {
        e.stopPropagation();
        inboxMenu.classList.toggle('show');
    };
}
window.onclick = () => { if (inboxMenu) inboxMenu.classList.remove('show'); };

if (toggleAddBtn) {
    toggleAddBtn.addEventListener('click', () => {
        galleryView.style.display = 'none';
        addItemView.style.display = 'block';
        toggleAddBtn.style.display = 'none';
    });
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        addItemView.style.display = 'none';
        galleryView.style.display = 'block';
        toggleAddBtn.style.display = 'inline-block';
    });
}

/**
 * --- 5. ASYNC LISTING HANDLER ---
 * This function orchestrates the upload process. I chose Cloudinary for the
 * heavy lifting of image hosting to keep our Firestore database light.
 */
if (marketForm) {
    marketForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nameEl = document.getElementById('prod-name');
        const priceEl = document.getElementById('prod-price');
        const descEl = document.getElementById('prod-desc');
        const imageEl = document.getElementById('prod-image');

        if (!nameEl || !priceEl || !descEl || !imageEl) return;

        const imageFile = imageEl.files[0];
        if (!imageFile) {
            if (listingStatus) listingStatus.textContent = "⚠️ Please upload a product image.";
            return;
        }

        const submitBtn = marketForm.querySelector('button');
        try {
            if (submitBtn) submitBtn.disabled = true;
            if (listingStatus) listingStatus.textContent = "Processing upload... ☁️";

            // Step 1: Uploading physical photo to the cloud
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('upload_preset', UPLOAD_PRESET);

            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });
            const cloudData = await res.json();

            // Step 2: Saving the product metadata and image URL to Firestore
            await db.collection("marketplace_items").add({
                itemName: nameEl.value,
                price: parseFloat(priceEl.value),
                description: descEl.value,
                imageUrl: cloudData.secure_url, 
                sellerEmail: auth.currentUser.email,
                sellerId: auth.currentUser.uid,
                status: 'available',
                createdAt: firebase.firestore.FieldValue.serverTimestamp() 
            });

            if (listingStatus) listingStatus.textContent = "✅ Listing posted successfully!";
            marketForm.reset();

            // Redirect back to gallery automatically after success
            setTimeout(() => {
                addItemView.style.display = 'none';
                galleryView.style.display = 'block';
                toggleAddBtn.style.display = 'inline-block';
                if (listingStatus) listingStatus.textContent = "";
            }, 1500);

        } catch (err) {
            console.error("Listing Error:", err);
            if (listingStatus) listingStatus.textContent = "❌ Error posting listing.";
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

/**
 * --- 6. REAL-TIME MARKET GALLERY ---
 * I used onSnapshot here so the catalog updates instantly when a peer 
 * posts a new item or marks one as sold. I also added a 'Hide Sold' toggle 
 * to improve the browsing experience.
 */
if (hideSoldToggle) {
    hideSoldToggle.addEventListener('change', (e) => {
        hideSold = e.target.checked;
        renderMarketplace(); 
    });
}

function renderMarketplace() {
    if (!marketContainer) return;
    db.collection("marketplace_items")
        .orderBy("createdAt", "desc")
        .onSnapshot((snap) => {
            marketContainer.innerHTML = ''; 
            snap.forEach((doc) => {
                const item = doc.data();
                const isAvailable = item.status === 'available';
                const isOwner = auth.currentUser && auth.currentUser.uid === item.sellerId;

                // User Preference: Skip sold items if filter is active
                if (hideSold && !isAvailable) return;

                const card = document.createElement('div');
                card.className = `item-card ${!isAvailable ? 'sold-out' : ''}`;
                
                // Visual UX: Gray out images of items already sold
                card.innerHTML = `
                    <img src="${item.imageUrl || 'placeholder.jpg'}" alt="${item.itemName}" loading="lazy" 
                         style="${!isAvailable ? 'filter: grayscale(1); opacity: 0.6;' : ''}">
                    <div class="item-info">
                        <span class="price-tag" style="color: ${isAvailable ? '#28a745' : '#666'}; font-weight: bold;">
                            ₹${item.price} ${!isAvailable ? '(SOLD)' : ''}
                        </span>
                        <h4>${item.itemName}</h4>
                        <p>${item.description}</p>
                        <small>Seller: ${item.sellerEmail}</small>
                        
                        <div class="card-actions" style="margin-top: 10px;">
                            ${isOwner && isAvailable ? 
                                `<button class="btn-sold" onclick="markAsSold('${doc.id}')" style="width:100%; background:#6c757d; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer;">
                                    Mark as Sold
                                 </button>` : 
                                isAvailable ? 
                                `<button class="btn-primary" style="width:100%" 
                                        onclick="openChat('${item.sellerId}', '${item.sellerEmail}', '${doc.id}')">
                                    Chat with Seller
                                </button>` : 
                                `<button disabled class="btn-disabled" style="width:100%; background:#eee; cursor:not-allowed; border:1px solid #ddd; padding:8px;">
                                    Item Sold
                                </button>`
                            }
                        </div>
                    </div>
                `;
                marketContainer.appendChild(card); 
            });
        });
}

// Logic to allow sellers to close their listings
window.markAsSold = async (itemId) => {
    if (confirm("Mark as sold? This hides the chat for new buyers.")) {
        try {
            await db.collection("marketplace_items").doc(itemId).update({ status: 'sold' });
        } catch (error) { console.error(error); }
    }
};

/**
 * --- 7. SECURE CHAT & INBOX ENGINE ---
 * This creates a direct bridge between a buyer and a seller.
 * I designed the chatId to be deterministic (Item_Buyer_Seller) so 
 * we never create duplicate threads for the same transaction.
 */
window.openChat = async (sellerId, sellerEmail, itemId) => {
    if (!sellerId || sellerId === auth.currentUser.uid) return;

    const buyerId = auth.currentUser.uid;
    const chatId = `${itemId}_${buyerId}_${sellerId}`;
    const chatRef = db.collection("chats").doc(chatId);

    try {
        const doc = await chatRef.get();
        if (!doc.exists) {
            await chatRef.set({
                itemId, participants: [buyerId, sellerId],
                participantEmails: [auth.currentUser.email, sellerEmail],
                messages: [], lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        currentActiveChatId = chatId; 
        chatDrawer.classList.add('open');
        chatDrawer.style.display = 'flex';
        startChatListener(chatId);
    } catch (e) { console.error(e); }
};

function startChatListener(chatId) {
    if (currentChatListener) currentChatListener(); 
    currentChatListener = db.collection("chats").doc(chatId)
        .onSnapshot((doc) => {
            if (!doc.exists) return;
            chatMessages.innerHTML = '';
            doc.data().messages.forEach(msg => {
                const div = document.createElement('div');
                div.className = `msg ${msg.senderId === auth.currentUser.uid ? 'sent' : 'received'}`;
                div.textContent = msg.text;
                chatMessages.appendChild(div);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight; 
        });
}

// Handler for sending messages inside a marketplace thread
if (sendMsgBtn) {
    sendMsgBtn.onclick = async () => {
        const text = chatInput.value.trim();
        if (!text || !currentActiveChatId) return;
        await db.collection("chats").doc(currentActiveChatId).update({
            messages: firebase.firestore.FieldValue.arrayUnion({
                senderId: auth.currentUser.uid, text, timestamp: new Date().toISOString()
            }),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        chatInput.value = '';
    };
}

/**
 * --- 8. GLOBAL INBOX ---
 * Summarizes all active negotiations. I included manual sorting to ensure 
 * the most recent activity stays at the top of the student's inbox.
 */
function loadInbox() {
    if (!auth.currentUser || !inboxContainer) return;

    db.collection("chats")
        .where("participants", "array-contains", auth.currentUser.uid)
        .onSnapshot((snap) => {
            const container = document.getElementById('inbox-container');
            const msgCount = document.getElementById('msg-count');
            if (!container) return;

            container.innerHTML = '';
            let unreadCount = 0;

            if (snap.empty) {
                container.innerHTML = '<p style="padding:15px; color: #666;">No active conversations.</p>';
                return;
            }

            // Client-side sorting while Firestore indexing propagates
            const docs = snap.docs.sort((a, b) => {
                const timeA = a.data().lastUpdated?.seconds || 0;
                const timeB = b.data().lastUpdated?.seconds || 0;
                return timeB - timeA;
            });

            docs.forEach((doc) => {
                const chat = doc.data();
                const otherEmail = chat.participantEmails.find(e => e !== auth.currentUser.email);
                const messages = chat.messages || [];
                const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
                const isNew = lastMsg && lastMsg.senderId !== auth.currentUser.uid;
                
                if (isNew) unreadCount++;

                const div = document.createElement('div');
                div.className = `chat-summary-card ${isNew ? 'unread-bg' : ''}`;
                div.innerHTML = `
                    <strong>${isNew ? '🔵 ' : ''}${otherEmail.split('@')[0]}</strong>
                    <p>${lastMsg ? lastMsg.text : 'Negotiation started...'}</p>
                `;
                
                div.onclick = () => {
                    currentActiveChatId = doc.id;
                    chatDrawer.classList.add('open');
                    chatDrawer.style.display = 'flex';
                    startChatListener(doc.id);
                };
                container.appendChild(div);
            });

            if (msgCount) msgCount.textContent = unreadCount > 0 ? `(${unreadCount})` : '';
        });
}

// Draggable UI utility for the chat overlay
const dragElement = (elmnt) => {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = elmnt.querySelector(".chat-header");
  if (header) { header.onmousedown = (e) => {
    e = e || window.event;
    pos3 = e.clientX; pos4 = e.clientY;
    document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
    document.onmousemove = (e) => {
        e = e || window.event;
        pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
        pos3 = e.clientX; pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        elmnt.style.bottom = "auto"; elmnt.style.right = "auto";
    };
  }};
}
if (chatDrawer) dragElement(chatDrawer);

// UX: Enter to send messages
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMsgBtn.click();
        }
    });
}

window.closeChat = () => { chatDrawer.style.display = 'none'; };

// Initial run
renderMarketplace();