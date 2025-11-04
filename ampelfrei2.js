let map;

function initMap() {
  console.log('Initialisiere Karte...');
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 50.73, lng: 7.1 }, // Bonn
    zoom: 13,
  });
}

async function whenMapsReady(callback) {
  if (typeof google !== 'undefined' && google.maps) {
    console.log('Google Maps API geladen (REST Directions wird verwendet):', {
      places: !!google.maps.places,
      geometry: !!google.maps.geometry,
    });
    if (!map) initMap();
    callback();
  } else {
    console.error('Google Maps API nicht geladen.');
    showResult('Fehler: Google Maps API nicht geladen.', 'danger');
  }
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showResult(message, type) {
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

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

async function getTrafficLights(path) {
  if (!path || path.length < 2) return { trafficLights: 0, pedestrianPaths: [] };
  const bounds = path.reduce(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.lat),
      maxLat: Math.max(acc.maxLat, p.lat),
      minLng: Math.min(acc.minLng, p.lng),
      maxLng: Math.max(acc.maxLng, p.lng),
    }),
    { minLat: path[0].lat, maxLat: path[0].lat, minLng: path[0].lng, maxLng: path[0].lng }
  );
  const query = `
    [out:json];
    (
      node["highway"="traffic_signals"](around:50,${path.map(p => `${p.lat},${p.lng}`).join(';')});
      way["highway"~"path|pedestrian"]["bicycle"~"yes|designated"](around:50,${path.map(p => `${p.lat},${p.lng}`).join(';')});
    );
    out body;
  `;
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await response.json();
    const trafficLights = data.elements.filter(el => el.type === 'node' && el.tags.highway === 'traffic_signals').length;
    const pedestrianPaths = data.elements.filter(
      el => el.type === 'way' && ['path', 'pedestrian'].includes(el.tags.highway) && (!el.tags.bicycle || ['yes', 'designated'].includes(el.tags.bicycle))
    );
    console.log('Overpass API Antwort:', { trafficLights, pedestrianPaths });
    return { trafficLights, pedestrianPaths };
  } catch (e) {
    console.error('Overpass API Fehler:', e);
    return { trafficLights: 0, pedestrianPaths: [] };
  }
}

async function getDirections(origin, destination, travelMode, usePedestrianPaths = false) {
  const mode = travelMode === 'BICYCLING' ? 'bicycling' : 'driving';
  const avoid = usePedestrianPaths && travelMode === 'BICYCLING' ? '&avoid=highways' : '';
  const url = `http://localhost:3000/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&alternatives=true${avoid}`;
  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'OK') {
        return data;
      } else {
        throw new Error(`Directions API Status: ${data.status} - ${data.error_message || 'Unbekannter Fehler'}`);
      }
    } else {
      throw new Error(`Proxy-Fehler: ${response.status}`);
    }
  } catch (e) {
    console.error('Directions Proxy-Fehler:', e);
    throw e;
  }
}

async function calculateRoute() {
  showLoading(true);
  const startVal = document.getElementById('startAddress').value.trim();
  const destVal = document.getElementById('destAddress').value.trim();
  const travelMode = document.getElementById('travelMode').value;
  const priority = document.getElementById('routePriority').value;
  const usePedestrianPaths = travelMode === 'BICYCLING' && document.getElementById('usePedestrianPaths').checked;

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
      console.log('Rufe REST Directions API auf...');
      const data = await getDirections(startVal, destVal, travelMode, usePedestrianPaths);
      if (data.status !== 'OK') {
        throw new Error(`Directions API Status: ${data.status} - ${data.error_message || 'Unbekannter Fehler'}`);
      }
      if (!data.routes || data.routes.length === 0) {
        throw new Error('Keine Routen gefunden. Prüfe die Adressen.');
      }

      const routes = data.routes;
      let bestRoute = null;
      let minScore = Infinity;
      const routeDetails = [];

      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        if (!route.overview_polyline || !route.overview_polyline.points) {
          console.warn(`Route ${i} hat kein overview_polyline. Überspringe.`);
          continue;
        }
        const path = decodePolyline(route.overview_polyline.points);
        if (path.length === 0) {
          console.warn(`Route ${i} konnte nicht dekodiert werden. Überspringe.`);
          continue;
        }
        const leg = route.legs[0];
        const { trafficLights, pedestrianPaths } = await getTrafficLights(path);
        const distance = leg.distance.value / 1000; // in km
        const duration = leg.duration.value / 60; // in Minuten
        let pedestrianDistance = 0;

        if (usePedestrianPaths && travelMode === 'BICYCLING') {
          const steps = leg.steps;
          let totalDistance = leg.distance.value;
          pedestrianDistance = steps.reduce((acc, step) => {
            if (step.travel_mode === 'BICYCLING' && step.polyline) {
              const stepPath = decodePolyline(step.polyline.points);
              const stepDistance = step.distance.value;
              const isPedestrian = pedestrianPaths.some(p =>
                stepPath.some(sp => Math.abs(sp.lat - p.nodes[0].lat) < 0.0001 && Math.abs(sp.lng - p.nodes[0].lon) < 0.0001)
              );
              return isPedestrian ? acc + stepDistance : acc;
            }
            return acc;
          }, 0);
          const pedestrianPercentage = (pedestrianDistance / totalDistance) * 100;
          if (pedestrianPercentage > 10) {
            console.warn(`Route ${i} hat ${pedestrianPercentage.toFixed(1)}% Fußgängerwege, überspringe (max 10%).`);
            continue;
          }
        }

        let score = trafficLights; // Priorisiere wenigste Ampeln
        if (priority === 'fastest') {
          score = duration;
        } else if (priority === 'shortest') {
          score = distance;
        }
        routeDetails.push({
          index: i,
          trafficLights,
          distance: distance.toFixed(1),
          duration: Math.round(duration),
          pedestrianPercentage: pedestrianDistance ? ((pedestrianDistance / leg.distance.value) * 100).toFixed(1) : 0,
          score
        });
        if (score < minScore) {
          minScore = score;
          bestRoute = { index: i, trafficLights, distance, duration, pedestrianPercentage: pedestrianDistance ? ((pedestrianDistance / leg.distance.value) * 100).toFixed(1) : 0 };
        }
      }

      if (!bestRoute) {
        throw new Error('Keine gültigen Routen gefunden.');
      }

      const directionsRenderer = new google.maps.DirectionsRenderer();
      directionsRenderer.setMap(map);
      const directionsService = new google.maps.DirectionsService();
      directionsService.route({
        origin: startVal,
        destination: destVal,
        travelMode: google.maps.TravelMode[travelMode],
        provideRouteAlternatives: true,
        avoidHighways: usePedestrianPaths && travelMode === 'BICYCLING'
      }, (result, status) => {
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
          directionsRenderer.setRouteIndex(bestRoute.index);
        } else {
          console.error('DirectionsService Fehler:', status);
          showResult(`Fehler beim Rendern der Route: ${status}`, 'danger');
        }
      });

      let resultHtml = `<strong>Beste Route (Wenigste Ampeln):</strong><br>`;
      resultHtml += `🚦 ${bestRoute.trafficLights} Ampeln<br>`;
      resultHtml += `📏 ${bestRoute.distance} km<br>`;
      resultHtml += `⏱ ${bestRoute.duration} Minuten<br>`;
      if (usePedestrianPaths && travelMode === 'BICYCLING') {
        resultHtml += `🚶‍♂️ Fußgängerwege: ${bestRoute.pedestrianPercentage}%<br>`;
      }
      resultHtml += `<br><strong>Alle Routen:</strong><br>`;
      routeDetails.forEach(r => {
        resultHtml += `Route ${r.index + 1}: ${r.trafficLights} Ampeln, ${r.distance} km, ${r.duration} Min`;
        if (usePedestrianPaths && travelMode === 'BICYCLING') {
          resultHtml += `, ${r.pedestrianPercentage}% Fußgängerwege`;
        }
        resultHtml += `<br>`;
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
