const API_KEY = 'AIzaSyCfmA_2wFMG2eXCJF0stxziBnM4CVNpoB0'; // Dein API-Key
const KEY_ROUTES = 'ampelfrei_routes_v1';
const KEY_START = 'ampelfrei_start_v1';
const KEY_DEST = 'ampelfrei_dest_v1';
let acStart, acDest, acRideOrigin, acRideDest;
let map;
const CACHE = {};
let hasGeometry = false;

// Globale Callback-Funktion für Google Maps
window.initMap = function () {
  console.log('initMap aufgerufen');
  whenMapsReady(initializeMap);
};

// Tab-Navigation
document.querySelectorAll('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.tab).classList.add('active');
  });
});

function showResult(msg, type) {
  const el = document.getElementById('result');
  if (el) {
    el.innerHTML = msg;
    el.className = type ? type : 'muted';
  } else {
    console.error('Result-Element nicht gefunden');
  }
}

function showLoading(show) {
  const loading = document.getElementById('loading') || document.createElement('div');
  loading.id = 'loading';
  loading.style = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card); padding: 16px; border-radius: var(--radius); color: var(--muted); z-index: 1000;';
  loading.textContent = 'Lade Route...';
  if (show) document.body.appendChild(loading);
  else if (loading.parentNode) document.body.removeChild(loading);
}

function whenMapsReady(cb, timeout = 20000, start = Date.now()) {
  const mapFallback = document.getElementById('map-fallback');
  if (window.google && google.maps && google.maps.places) {
    hasGeometry = !!google.maps.geometry;
    console.log('Google Maps API geladen (REST Directions wird verwendet):', {
      places: !!google.maps.places,
      geometry: hasGeometry
    });
    if (mapFallback) mapFallback.style.display = 'none';
    return cb();
  }
  if (Date.now() - start > timeout) {
    let errorMsg = 'Fehler: Google Maps API konnte nicht geladen werden. ';
    if (!window.google) errorMsg += 'Skript nicht geladen (Netzwerkproblem?). ';
    else if (!google.maps) errorMsg += 'Maps API nicht verfügbar. ';
    else if (!google.maps.places) errorMsg += 'Places Library fehlt. ';
    errorMsg += ' Prüfe Billing, API-Key und Netzwerk.';
    showResult(errorMsg, 'danger');
    console.error('Google Maps API Timeout:', errorMsg);
    if (mapFallback) mapFallback.style.display = 'block';
    return;
  }
  showResult('Google Maps API wird geladen...', 'muted');
  setTimeout(() => whenMapsReady(cb, timeout, start), 500);
}

// Initialisiere Google Maps
function initializeMap() {
  try {
    map = new google.maps.Map(document.getElementById('map'), {
      zoom: 12,
      center: { lat: 52.52, lng: 13.405 },
      mapTypeControl: false,
      streetViewControl: false,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#212121" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#3d3d3d" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa3b2" }] },
      ]
    });
    acStart = new google.maps.places.Autocomplete(document.getElementById('startAddress'));
    acDest = new google.maps.places.Autocomplete(document.getElementById('destAddress'));
    acRideOrigin = new google.maps.places.Autocomplete(document.getElementById('rideOrigin'));
    acRideDest = new google.maps.places.Autocomplete(document.getElementById('rideDestination'));
    document.getElementById('map-fallback').style.display = 'none';
    showResult('Google Maps initialisiert (REST Directions API bereit)', 'success');
  } catch (e) {
    document.getElementById('map-fallback').style.display = 'block';
    showResult('Fehler beim Laden der Karte: ' + e.message, 'danger');
    console.error('Maps Initialisierungsfehler:', e);
  }
}

// REST Directions API aufrufen
  async function getDirections(origin, destination, travelMode) {
  const mode = travelMode === 'BICYCLING' ? 'bicycling' : 'driving';
  const url = `http://localhost:3000/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&alternatives=true`;
  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'OK') {
        return data;
      } else {
        throw new Error(`Directions API Status: ${data.status}`);
      }
    } else {
      throw new Error(`Proxy-Fehler: ${response.status}`);
    }
  } catch (e) {
    console.error('Directions Proxy-Fehler:', e);
    throw e;
  }
}


// Fallback für Distanzberechnung ohne Geometry
function computeDistanceFallback(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function saveStart() {
  localStorage.setItem(KEY_START, document.getElementById('startAddress').value);
  showResult('Startadresse gespeichert', 'success');
}

function saveDest() {
  localStorage.setItem(KEY_DEST, document.getElementById('destAddress').value);
  showResult('Zieladresse gespeichert', 'success');
}

function loadRoutes() {
  const r = localStorage.getItem(KEY_ROUTES);
  return r ? JSON.parse(r) : [];
}

function saveRoutes(routes) {
  localStorage.setItem(KEY_ROUTES, JSON.stringify(routes));
  renderRoutes();
}

function clearRouteForm() {
  document.getElementById('rideTitle').value = '';
  document.getElementById('rideOrigin').value = '';
  document.getElementById('rideDestination').value = '';
  document.getElementById('rideTravelMode').value = 'DRIVING';
  document.getElementById('ridePriority').value = 'traffic_lights';
}

function saveRoute() {
  const routes = loadRoutes();
  const id = Date.now();
  const r = {
    id,
    title: document.getElementById('rideTitle').value || 'unnamed',
    originAddress: document.getElementById('rideOrigin').value,
    destinationAddress: document.getElementById('rideDestination').value,
    travelMode: document.getElementById('rideTravelMode').value,
    priority: document.getElementById('ridePriority').value,
    enabled: true
  };
  routes.push(r);
  saveRoutes(routes);
  clearRouteForm();
}

function deleteRoute(id) {
  const routes = loadRoutes().filter(r => r.id !== id);
  saveRoutes(routes);
}

async function getTrafficLights(points) {
  const cacheKey = points.map(p => `${p.lat}_${p.lng}`).join('|');
  if (CACHE[cacheKey]) return CACHE[cacheKey];
  const bounds = points.reduce((b, p) => ({
    minLat: Math.min(b.minLat, p.lat),
    maxLat: Math.max(b.maxLat, p.lat),
    minLng: Math.min(b.minLng, p.lng),
    maxLng: Math.max(b.maxLng, p.lng)
  }), { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity });
  const query = `[out:json];node["highway"="traffic_signals"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});out;`;
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: `data=${encodeURIComponent(query)}` });
    if (response.ok) {
      const data = await response.json();
      const signals = data.elements;
      let count = 0;
      signals.forEach(signal => {
        const signalPos = { lat: signal.lat, lng: signal.lon };
        const isNear = points.some(p => {
          if (hasGeometry) {
            return google.maps.geometry.spherical.computeDistanceBetween(
              new google.maps.LatLng(p.lat, p.lng), new google.maps.LatLng(signal.lat, signal.lon)) <= 50;
          } else {
            return computeDistanceFallback(p.lat, p.lng, signal.lat, signal.lon) <= 50;
          }
        });
        if (isNear) {
          count++;
          if (map) {
            new google.maps.Marker({
              position: signalPos,
              map: map,
              icon: { url: 'http://maps.google.com/mapfiles/ms/icons/red.png', scaledSize: new google.maps.Size(20, 20) },
              title: 'Ampel'
            });
          }
        }
      });
      CACHE[cacheKey] = count;
      return count;
    }
  } catch (e) {
    console.error('OSM Overpass Fehler:', e);
    return 0;
  }
}

// Funktion zum Dekodieren von Google Polylines
function decodePolyline(encoded) {
  if (!encoded) return [];
  let points = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

async function calculateRoute() {
  showLoading(true);
  const startVal = document.getElementById('startAddress').value.trim();
  const destVal = document.getElementById('destAddress').value.trim();
  const travelMode = document.getElementById('travelMode').value;
  const priority = document.getElementById('routePriority').value;

  if (!startVal || !destVal || startVal.length < 3 || destVal.length < 3) {
    showResult('Bitte gültige Start- und Zieladressen eingeben (mind. 3 Zeichen)', 'danger');
    showLoading(false);
    return;
  }

  whenMapsReady(async () => {
    if (!map) {
      showResult('Fehler: Karte nicht geladen. Prüfe API-Key und Billing.', 'danger');
      showLoading(false);
      return;
    }

    console.group('🗺️ AmpelFrei Berechnung: ' + startVal + ' → ' + destVal);
    try {
      // REST Directions API aufrufen
      console.log('Rufe REST Directions API auf...');
      const data = await getDirections(startVal, destVal, travelMode);
      const routes = data.routes;
      let bestRoute = null;
      let minScore = Infinity;
      const routeDetails = [];

      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const leg = route.legs[0];
        const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
        const trafficLights = await getTrafficLights(path);
        const distance = leg.distance.value / 1000;
        const duration = leg.duration.value / 60;
        let score;
        if (priority === 'traffic_lights') {
          score = trafficLights * 10 + distance;
        } else if (priority === 'fastest') {
          score = duration;
        } else {
          score = distance;
        }
        routeDetails.push({
          index: i,
          trafficLights,
          distance: distance.toFixed(1),
          duration: Math.round(duration),
          score
        });
        if (score < minScore) {
          minScore = score;
          bestRoute = { index: i, trafficLights, distance, duration };
        }
      }

      // Route auf Karte anzeigen
      const directionsRenderer = new google.maps.DirectionsRenderer();
      directionsRenderer.setMap(map);
      const directionsService = new google.maps.DirectionsService();
      directionsService.route({
        origin: startVal,
        destination: destVal,
        travelMode: google.maps.TravelMode[travelMode],
        provideRouteAlternatives: true
      }, (result, status) => {
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
          directionsRenderer.setRouteIndex(bestRoute.index);
        }
      });

      let resultHtml = `<strong>Beste Route (${priority === 'traffic_lights' ? 'Wenigste Ampeln' : priority === 'fastest' ? 'Schnellste' : 'Kürzeste'}):</strong><br>`;
      resultHtml += `🚦 ${bestRoute.trafficLights} Ampeln<br>`;
      resultHtml += `📏 ${bestRoute.distance} km<br>`;
      resultHtml += `⏱ ${bestRoute.duration} Minuten<br>`;
      resultHtml += `<br><strong>Alle Routen:</strong><br>`;
      routeDetails.forEach(r => {
        resultHtml += `Route ${r.index + 1}: ${r.trafficLights} Ampeln, ${r.distance} km, ${r.duration} Min<br>`;
      });
      showResult(resultHtml, 'success');
      console.log('Routen:', routeDetails);
      console.groupEnd();
    } catch (e) {
      showResult('Fehler bei der Routenberechnung: ' + e.message, 'danger');
      console.error('Routenberechnungsfehler:', e);
      console.groupEnd();
    } finally {
      showLoading(false);
    }
  });
}

// Rest der Funktionen (saveStart, saveDest, loadRoutes, etc.) unverändert – kopiere aus vorheriger Version

function saveStart() {
  localStorage.setItem(KEY_START, document.getElementById('startAddress').value);
  showResult('Startadresse gespeichert', 'success');
}

function saveDest() {
  localStorage.setItem(KEY_DEST, document.getElementById('destAddress').value);
  showResult('Zieladresse gespeichert', 'success');
}

function loadRoutes() {
  const r = localStorage.getItem(KEY_ROUTES);
  return r ? JSON.parse(r) : [];
}

function saveRoutes(routes) {
  localStorage.setItem(KEY_ROUTES, JSON.stringify(routes));
  renderRoutes();
}

function clearRouteForm() {
  document.getElementById('rideTitle').value = '';
  document.getElementById('rideOrigin').value = '';
  document.getElementById('rideDestination').value = '';
  document.getElementById('rideTravelMode').value = 'DRIVING';
  document.getElementById('ridePriority').value = 'traffic_lights';
}

function saveRoute() {
  const routes = loadRoutes();
  const id = Date.now();
  const r = {
    id,
    title: document.getElementById('rideTitle').value || 'unnamed',
    originAddress: document.getElementById('rideOrigin').value,
    destinationAddress: document.getElementById('rideDestination').value,
    travelMode: document.getElementById('rideTravelMode').value,
    priority: document.getElementById('ridePriority').value,
    enabled: true
  };
  routes.push(r);
  saveRoutes(routes);
  clearRouteForm();
}

function deleteRoute(id) {
  const routes = loadRoutes().filter(r => r.id !== id);
  saveRoutes(routes);
}

function loadRouteIntoForm(id) {
  const r = loadRoutes().find(x => x.id === id);
  if (!r) return;
  document.getElementById('rideTitle').value = r.title;
  document.getElementById('rideOrigin').value = r.originAddress;
  document.getElementById('rideDestination').value = r.destinationAddress;
  document.getElementById('rideTravelMode').value = r.travelMode;
  document.getElementById('ridePriority').value = r.priority;
  document.querySelector('.tab-btn[data-tab="routes"]').click();
}

function renderRoutes() {
  const list = document.getElementById('routesList');
  const routes = loadRoutes();
  list.innerHTML = routes.length ? '' : '<div class="muted">Keine Routen</div>';
  for (const r of routes) {
    const el = document.createElement('div');
    el.className = 'ride';
    const left = document.createElement('div');
    left.className = 'meta';
    left.innerHTML = `<strong>${r.title}</strong>
      <div class="sub">${r.originAddress} → ${r.destinationAddress}</div>
      <div class="sub">${r.travelMode === 'DRIVING' ? 'Auto' : 'Fahrrad'} · Priorität: ${r.priority === 'traffic_lights' ? 'Wenigste Ampeln' : r.priority === 'fastest' ? 'Schnellste' : 'Kürzeste'}</div>
      <div class="sub" id="traffic_${r.id}">🚦 Berechne...</div>`;
    const right = document.createElement('div');
    const toggle = document.createElement('button');
    toggle.className = 'action-btn ' + (r.enabled ? 'toggle-enabled' : 'toggle-disabled');
    toggle.textContent = r.enabled ? 'Aktiv' : 'Inaktiv';
    toggle.addEventListener('click', () => {
      r.enabled = !r.enabled;
      saveRoutes(loadRoutes().map(x => x.id === r.id ? r : x));
      renderRoutes();
    });
    const edit = document.createElement('button');
    edit.className = 'action-btn';
    edit.textContent = 'Bearbeiten';
    edit.addEventListener('click', () => loadRouteIntoForm(r.id));
    const del = document.createElement('button');
    del.className = 'action-btn secondary';
    del.textContent = 'Löschen';
    del.addEventListener('click', () => deleteRoute(r.id));
    right.appendChild(toggle);
    right.appendChild(edit);
    right.appendChild(del);
    el.appendChild(left);
    el.appendChild(right);
    list.appendChild(el);

    // Ampel-Berechnung für gespeicherte Routen
    getDirections(r.originAddress, r.destinationAddress, r.travelMode).then(data => {
      const path = data.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      getTrafficLights(path).then(count => {
        const elp = document.getElementById(`traffic_${r.id}`);
        if (elp) elp.innerHTML = `🚦 ${count} Ampeln`;
      });
    }).catch(e => {
      console.error('Fehler bei gespeicherter Route:', e);
      const elp = document.getElementById(`traffic_${r.id}`);
      if (elp) elp.innerHTML = '🚦 Fehler bei Berechnung';
    });
  }
}

// Event-Listener für Buttons
document.getElementById('calculateRouteBtn').addEventListener('click', calculateRoute);
document.getElementById('saveStartBtn').addEventListener('click', saveStart);
document.getElementById('saveDestBtn').addEventListener('click', saveDest);
document.getElementById('saveRouteBtn').addEventListener('click', saveRoute);
document.getElementById('clearRouteFormBtn').addEventListener('click', clearRouteForm);
document.getElementById('reportTrafficLightBtn').addEventListener('click', () => {
  if (!map) {
    showResult('Karte nicht geladen – API-Key oder Billing prüfen.', 'danger');
    return;
  }
  showResult('🚦 Klicke auf der Karte, um eine Ampel zu melden', 'muted');
  const listener = map.addListener('click', (e) => {
    const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    new google.maps.Marker({
      position: pos,
      map: map,
      icon: { url: 'http://maps.google.com/mapfiles/ms/icons/red.png', scaledSize: new google.maps.Size(20, 20) },
      title: 'Gemeldete Ampel'
    });
    showResult(`Ampel bei ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)} gemeldet (zukünftig: an Server senden)`, 'success');
    google.maps.event.removeListener(listener);
  });
});

// Init
renderRoutes();
