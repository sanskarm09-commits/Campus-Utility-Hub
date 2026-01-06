/**
 * CAMPUS NAVIGATOR - GEOSPATIAL MODULE
 * This module handles the interactive map, GPS positioning, and pathfinding.
 * It integrates the Leaflet.js library with the Geoapify Routing API.
 */
import { db, auth } from './firebase-config.js';

/**
 * --- 1. GLOBAL CONFIGURATION ---
 * Setting the initial focus on the IIT (ISM) Dhanbad campus area.
 */
const GEOAPIFY_KEY = "b45ad8d4272c4f85a76c19358dcb45d6"; 
const CAMPUS_CENTER = [23.814, 86.441]; 

// Initialize the map and set its starting zoom level
const map = L.map('map').setView(CAMPUS_CENTER, 17);

/**
 * --- 2. MAP TILE LAYER ---
 * We use Geoapify's OSM-Carto tiles to provide a clear, detailed 
 * view of the campus buildings and pathways.
 */
L.tileLayer(`https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_KEY}`, {
    attribution: 'Powered by Geoapify',
    maxZoom: 20
}).addTo(map);

let userMarker, routingLayer, destinationMarker;

/**
 * --- 3. LIVE GPS POSITIONING ---
 * This function triggers the browser's Geolocation API.
 * I designed a custom 'Blue Pulse' dot using Leaflet's divIcon to distinguish 
 * the student's live location from static campus landmarks.
 */
window.locateUser = function() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;

        if (userMarker) {
            userMarker.setLatLng([latitude, longitude]);
        } else {
            userMarker = L.marker([latitude, longitude], { 
                icon: L.divIcon({ 
                    className: 'user-dot', 
                    html: '<div style="background:#1a73e8; width:15px; height:15px; border-radius:50%; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.3);"></div>' 
                }) 
            }).addTo(map);
        }
        // Smoothly pan the map to the user's current coordinates
        map.setView([latitude, longitude], 17);
    }, () => {
        alert("Unable to retrieve your location. Please check your GPS settings.");
    });
};

/**
 * --- 4. PEDESTRIAN ROUTING ENGINE ---
 * This is the core logic for calculating paths between the student and a building.
 * I implemented a fallback to the 'Campus Center' to prevent application 
 * crashes if the user hasn't enabled GPS yet.
 */
window.startRouting = async function(lat, lng, name) {
    const startPoint = userMarker ? userMarker.getLatLng() : L.latLng(CAMPUS_CENTER);
    
    // Clear previous UI elements to maintain a clean map view
    if (routingLayer) map.removeLayer(routingLayer);
    if (destinationMarker) map.removeLayer(destinationMarker);

    // Fetching the walking route from Geoapify's API
    const url = `https://api.geoapify.com/v1/routing?waypoints=${startPoint.lat},${startPoint.lng}|${lat},${lng}&mode=walk&apiKey=${GEOAPIFY_KEY}`;

    try {
        const res = await fetch(url);
        
        // SECURITY CHECK: Handling potential 401 Authorization errors
        if (!res.ok) {
            console.error("HTTP Error:", res.status);
            return alert("API Authorization failed. Ensure your local server is authorized in the Geoapify dashboard.");
        }

        const data = await res.json();

        // VALIDATION: Ensuring we have a valid GeoJSON feature to draw
        if (!data || !data.features || data.features.length === 0) {
            return alert("No route found between these points.");
        }

        // DRAWING: I chose a blue dashed line to represent a pedestrian walking path
        routingLayer = L.geoJson(data, {
            style: { color: '#1a73e8', weight: 6, opacity: 0.8, dashArray: '10, 10' }
        }).addTo(map);

        destinationMarker = L.marker([lat, lng]).addTo(map)
            .bindPopup(`<b>${name}</b>`)
            .openPopup();

        // UI SYNC: Update the sidebar info box with calculated distance and estimated walk time
        const infoBox = document.getElementById('route-panel');
        const detailsText = document.getElementById('route-details');
        
        if (infoBox && detailsText) {
            infoBox.style.display = 'block';
            const props = data.features[0].properties;
            const dist = (props.distance / 1000).toFixed(2);
            const mins = Math.round(props.time / 60);
            detailsText.innerText = `${name}: ${dist}km (~${mins} mins walk)`;
        }

        // Auto-Zoom: Adjust map bounds so the entire route is visible
        map.fitBounds(routingLayer.getBounds(), { padding: [50, 50] });

    } catch (e) {
        console.error("Routing Error:", e);
        alert("Routing failed. Please ensure you are running on a secure Live Server environment.");
    }
};

/**
 * --- 5. CLEANUP UTILITY ---
 */
window.clearRoute = () => {
    if (routingLayer) map.removeLayer(routingLayer);
    if (destinationMarker) map.removeLayer(destinationMarker);
    const infoBox = document.getElementById('route-panel');
    if (infoBox) infoBox.style.display = 'none';
};

/**
 * --- 6. DYNAMIC LANDMARK INITIALIZATION ---
 * Instead of hardcoding building locations, this function opens a live 
 * connection to Firestore. As the Admin adds new hostels or facilities, 
 * they appear instantly in the student's 'Quick Destinations' sidebar.
 */
function loadLandmarksFromDB() {
    const listContainer = document.querySelector('.location-list');
    
    // Establishing a real-time listener for the 'campus_locations' collection
    db.collection("campus_locations").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
        // Clear existing cards to prevent duplicate entries during live updates
        listContainer.innerHTML = ''; 

        snapshot.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'card';
            
            // Re-linking each card to the primary routing engine
            card.onclick = () => window.startRouting(data.lat, data.lng, data.name);
            
            card.innerHTML = `
                <h4>📍 ${data.name}</h4>
                <p style="font-size: 12px; color: #666; margin: 0;">Campus Landmark</p>
            `;
            listContainer.appendChild(card);
        });
    }, (error) => {
        console.error(" लैंडमार्क Sync Error:", error);
    });
}

// Kick off the landmark loader on script initialization
loadLandmarksFromDB();