/**
 * CAMPUS UTILITIES HUB - MESS MENU MODULE
 * * I built this module to bridge the gap between mess administrators and students.
 * It manages three core areas:
 * 1. Admin-only menu publishing tools.
 * 2. Real-time synchronization of daily and weekly meal plans.
 * 3. A quantitative feedback loop for students to rate their meals.
 */

import { auth, db } from './firebase-config.js'; 

// --- DOM ELEMENT INITIALIZATION ---
const adminMenuEntry = document.getElementById('admin-menu-entry');
const adminLink = document.getElementById('admin-panel-link');
const menuForm = document.getElementById('menu-form');
const menuDetails = document.getElementById('menu-details');
const menuMessage = document.getElementById('menu-message');
const weeklyGrid = document.getElementById('weekly-menu-grid');
const ratingForm = document.getElementById('rating-form');
const ratingMessage = document.getElementById('rating-message');
const toggleBtn = document.getElementById('toggle-weekly-btn');
const weeklyContainer = document.getElementById('weekly-menu-container');

/**
 * --- 1. SECURITY & AUTHORIZATION ---
 * To maintain data integrity, I implemented a role-check.
 * Only users with the 'admin' flag in Firestore can see the menu editor tools.
 */
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // Checking the 'users' collection for the specific role field
            const userDoc = await db.collection("users").doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                // Admin UI Toggling: revealing tools only for authorized staff
                if (userData.role === 'admin') {
                    if (adminMenuEntry) adminMenuEntry.style.display = 'block';
                    if (adminLink) adminLink.style.display = 'block';
                }
            }
        } catch (error) {
            console.error("Authorization check failed:", error);
        }
    }
});

/**
 * --- 2. ADMIN MENU PUBLICATION ---
 * This handles the 'Write' operations. I used a .set() method so that
 * admins can easily overwrite a specific day's menu if the plan changes.
 */
if (menuForm) {
    menuForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const selectedDay = document.getElementById('menu-day').value; 
        const breakfast = document.getElementById('breakfast').value;
        const lunch = document.getElementById('lunch').value;
        const dinner = document.getElementById('dinner').value;
        
        const menuData = {
            breakfast,
            lunch,
            dinner,
            publishedBy: firebase.auth().currentUser.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        };

        try {
            // Updating the database for the selected day of the week
            await db.collection("menus").doc(selectedDay).set(menuData);
            menuMessage.textContent = `✅ Updated ${selectedDay.replace('_', ' ')} successfully!`;
            menuMessage.style.color = "green";
            menuForm.reset(); 
        } catch (error) {
            menuMessage.textContent = `❌ Update Failed: ${error.message}`;
            menuMessage.style.color = "red";
        }
    });
}

/**
 * --- 3. LIVE DATA BINDING (TODAY'S SPECIAL) ---
 * I used onSnapshot here to ensure students always see the latest 
 * menu without having to refresh their dashboard.
 */
db.collection("menus").doc("current_menu").onSnapshot((doc) => {
    if (doc.exists) {
        const menu = doc.data();
        // Dynamic injection of daily meal data into the UI
        menuDetails.innerHTML = `
            <div class="menu-item"><strong>🍳 Breakfast:</strong> ${menu.breakfast}</div>
            <div class="menu-item"><strong>🍱 Lunch:</strong> ${menu.lunch}</div>
            <div class="menu-item"><strong>🍲 Dinner:</strong> ${menu.dinner}</div>
        `;
    } else {
        menuDetails.innerHTML = '<p>The menu is currently being updated.</p>';
    }
});

/**
 * --- 4. WEEKLY MENU COORDINATION ---
 * This function pulls the entire menu collection and organizes it 
 * into a chronological 7-day grid for easier student planning.
 */
db.collection("menus").onSnapshot((querySnapshot) => {
    if (!weeklyGrid) return;
    weeklyGrid.innerHTML = '';
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const docs = {};
    
    // Mapping existing documents into a local object for easier sorting
    querySnapshot.forEach(doc => docs[doc.id.toLowerCase()] = doc.data());

    dayOrder.forEach(day => {
        const data = docs[day] || { breakfast: '-', lunch: '-', dinner: '-' };
        const dayCard = document.createElement('div');
        dayCard.className = 'day-card';
        dayCard.innerHTML = `
            <div class="day-title">${day.toUpperCase()}</div>
            <div class="day-body">
                <p><strong>B:</strong> ${data.breakfast}</p>
                <p><strong>L:</strong> ${data.lunch}</p>
                <p><strong>D:</strong> ${data.dinner}</p>
            </div>
        `;
        weeklyGrid.appendChild(dayCard);
    });
});

/**
 * --- 5. STUDENT SENTIMENT ANALYSIS ---
 * I added this feedback loop so mess managers can see real student 
 * ratings and comments for different meals, facilitating service improvement.
 */
if (ratingForm) {
    ratingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await db.collection("ratings").add({
                meal: document.getElementById('meal-type').value,
                rating: parseInt(document.getElementById('star-rating').value),
                comments: document.getElementById('meal-feedback').value,
                submittedBy: auth.currentUser.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            ratingMessage.textContent = "✅ Feedback submitted! Thank you.";
            ratingMessage.style.color = "green";
            ratingForm.reset();
        } catch (error) {
            ratingMessage.textContent = "❌ Could not submit rating.";
        }
    });
}

/**
 * --- 6. UI POLISH (COLLAPSIBLE VIEWS) ---
 * Since the weekly menu is long, I included a toggle to keep the 
 * interface clean and scannable for the user.
 */
if (toggleBtn && weeklyContainer) {
    toggleBtn.addEventListener('click', () => {
        const isHidden = weeklyContainer.style.display === 'none';
        weeklyContainer.style.display = isHidden ? 'block' : 'none';
        toggleBtn.textContent = isHidden ? 'Hide Full Week' : 'Show Full Week';
    });
}