import { db } from './firebase-config.js';

/**
 * --- NETWORK PROTOCOL FIX ---
 * Bypasses mobile network blocks and resolves host warnings
 */
db.settings({ 
    experimentalForceLongPolling: true,
    merge: true 
});

const GEOAPIFY_KEY = "3a400c98f0124335b78d250e97eb82d6"; 
const CAMPUS_CENTER = [23.814, 86.441]; 

const map = L.map('map').setView(CAMPUS_CENTER, 17);

// Using the exact Key from your dashboard
L.tileLayer(`https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_KEY}`, {
    attribution: 'Powered by Geoapify',
    maxZoom: 20
}).addTo(map);

let userMarker, routingLayer, destinationMarker;

window.locateUser = function() {
    if (!navigator.geolocation) return alert("GPS not supported.");
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        if (userMarker) {
            userMarker.setLatLng([latitude, longitude]);
        } else {
            userMarker = L.marker([latitude, longitude], { 
                icon: L.divIcon({ className: 'user-dot', html: '<div style="background:#1a73e8; width:15px; height:15px; border-radius:50%; border:2px solid white;"></div>' }) 
            }).addTo(map);
        }
        map.setView([latitude, longitude], 17);
    }, () => alert("Enable GPS permissions."));
};

window.startRouting = async function(lat, lng, name) {
    const start = userMarker ? userMarker.getLatLng() : L.latLng(CAMPUS_CENTER);
    if (routingLayer) map.removeLayer(routingLayer);
    if (destinationMarker) map.removeLayer(destinationMarker);

    const url = `https://api.geoapify.com/v1/routing?waypoints=${start.lat},${start.lng}|${lat},${lng}&mode=walk&apiKey=${GEOAPIFY_KEY}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("API Key restriction error.");
        const data = await res.json();

        routingLayer = L.geoJson(data, {
            style: { color: '#1a73e8', weight: 6, opacity: 0.8, dashArray: '10, 10' }
        }).addTo(map);

        destinationMarker = L.marker([lat, lng]).addTo(map).bindPopup(`<b>${name}</b>`).openPopup();
        
        document.getElementById('route-panel').style.display = 'block';
        const props = data.features[0].properties;
        document.getElementById('route-details').innerText = `${name}: ${(props.distance/1000).toFixed(2)}km (~${Math.round(props.time/60)} min walk)`;

        map.fitBounds(routingLayer.getBounds(), { padding: [50, 50] });
    } catch (e) {
        alert("Routing failed. Check if GitHub domain is allowed in Geoapify dashboard.");
    }
};

window.clearRoute = () => {
    if (routingLayer) map.removeLayer(routingLayer);
    if (destinationMarker) map.removeLayer(destinationMarker);
    document.getElementById('route-panel').style.display = 'none';
};

function loadLocations() {
    const list = document.getElementById('location-list');
    db.collection("campus_locations").onSnapshot((snap) => {
        list.innerHTML = '';
        snap.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => window.startRouting(data.lat, data.lng, data.name);
            card.innerHTML = `<h4>📍 ${data.name}</h4><p style="font-size:11px;color:#666;">View Walking Route</p>`;
            list.appendChild(card);
        });
    });
}

loadLocations();