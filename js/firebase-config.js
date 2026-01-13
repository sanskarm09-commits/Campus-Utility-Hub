/**
 * CAMPUS UTILITIES HUB - FIREBASE INITIALIZATION
 */

const firebaseConfig = {
  apiKey: "AIzaSyDm1-Ay9bMwE8iTZjon0sFlpFUotxF9mRs",
  authDomain: "campus-utility-hub-91fab.firebaseapp.com",
  projectId: "campus-utility-hub-91fab",
  storageBucket: "campus-utility-hub-91fab.firebasestorage.app",
  messagingSenderId: "274897016242",
  appId: "1:274897016242:web:da63ec800dd99c040340ab",
  measurementId: "G-WX4F3RPPSN"
};

// INITIALIZING THE SDK
const app = firebase.initializeApp(firebaseConfig);

// --- MOBILE NETWORK & STABILITY FIX ---
const dbInstance = app.firestore();

/**
 * We force Long Polling to bypass mobile carrier blocks on the QUIC protocol.
 * The 'merge: true' setting resolves the host-override warning in your console.
 */
dbInstance.settings({ 
    experimentalForceLongPolling: true,
    merge: true 
});

// EXPORTING CORE SERVICES
const firebaseLib = window.firebase; 

export const auth = app.auth();         
export const db = dbInstance;  
export { firebaseLib as firebase };