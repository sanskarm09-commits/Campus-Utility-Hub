import { auth, db } from './firebase-config.js';

const profileForm = document.getElementById('profile-form');
const nameInput = document.getElementById('profile-name');
const emailInput = document.getElementById('profile-email');
const profilePic = document.getElementById('profile-display-pic');
const statusMsg = document.getElementById('profile-status');

const CLOUD_NAME = "di1jmmord";
const UPLOAD_PRESET = "CampusUtilityHub";

/**
 * 1. Load User Data
 * Fetches existing info from Firestore to pre-fill the form
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        emailInput.value = user.email;
        
        // Fetch additional data from Firestore
        const doc = await db.collection("users").doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            nameInput.value = data.name || "";
            if (data.profilePic) profilePic.src = data.profilePic;
        } else {
            // If doc doesn't exist, use Auth info as fallback
            nameInput.value = user.displayName || "";
            if (user.photoURL) profilePic.src = user.photoURL;
        }
    } else {
        window.location.href = "index.html";
    }
});

/**
 * 2. Update Profile Logic
 * Saves data to Firestore and updates the Search Index
 */
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    const newName = nameInput.value.trim();
    const imageFile = document.getElementById('profile-upload').files[0];

    if (!newName) {
        statusMsg.style.color = "orange";
        statusMsg.textContent = "⚠️ Please enter a name.";
        return;
    }

    try {
        statusMsg.style.color = "blue";
        statusMsg.textContent = "Updating profile... ⏳";
        let imageUrl = profilePic.src;

        // Step A: Upload new picture to Cloudinary if a file was selected
        if (imageFile) {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('upload_preset', UPLOAD_PRESET);

            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            imageUrl = data.secure_url;
        }

        // Step B: Update Firestore
        // This ensures the Chat Hub can find this user by name (case-insensitive)
        await db.collection("users").doc(user.uid).set({
            name: newName,
            name_lowercase: newName.toLowerCase(), // CRITICAL for Chat Hub search
            profilePic: imageUrl,
            email: user.email,
            lastUpdated: new Date().toISOString()
        }, { merge: true });

        // Step C: Update Firebase Auth Profile (Optional but recommended)
        // This allows other Firebase features to see the name/photo
        await user.updateProfile({
            displayName: newName,
            photoURL: imageUrl
        });

        profilePic.src = imageUrl;
        statusMsg.style.color = "green";
        statusMsg.textContent = "✅ Profile updated successfully!";
        
        // Optional: Reset file input
        document.getElementById('profile-upload').value = "";
        
    } catch (error) {
        console.error("Profile Update Error:", error);
        statusMsg.style.color = "red";
        statusMsg.textContent = "❌ Error updating profile.";
    }
});