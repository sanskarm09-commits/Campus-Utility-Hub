/**
 * CAMPUS UTILITIES HUB - FIREBASE INITIALIZATION
 * * This is the central configuration file. I set it up to initialize the 
 * Firebase app and export the specific services (Auth and Firestore) 
 * so they can be reused across all other modules.
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
// Since we are using the Compatibility (v9 Compat) scripts in our HTML,
// we initialize the app through the global firebase object.
const app = firebase.initializeApp(firebaseConfig);

// EXPORTING CORE SERVICES
// I'm capturing the global firebase object here to handle advanced Firestore 
// commands like FieldValue.serverTimestamp() in other files.
const firebaseLib = window.firebase; 

export const auth = app.auth();         
export const db = app.firestore();  
export { firebaseLib as firebase };