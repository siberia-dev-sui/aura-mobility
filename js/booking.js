/**
 * Aura Mobility - Pro Booking Dashboard
 * Features: Leaflet Map, Nominatim Geocoding, OSRM Routing
 */

// Service type pricing
const SERVICE_PRICING = {
  taxi: { name: 'Standard Taxi', baseFee: 10.00, ratePerMile: 2.50 },
  wheelchair: { name: 'Wheelchair Accessible Van', baseFee: 35.00, ratePerMile: 3.50 },
  stretcher: { name: 'Stretcher / Medical Assist', baseFee: 85.00, ratePerMile: 5.00 }
};

// State
let map = null;
let pickupMarker = null;
let dropoffMarker = null;
let routeLayer = null;
let pickupCoords = null; // { lat, lon }
let dropoffCoords = null; // { lat, lon }
let lastRouteData = null; // { distanceMiles, durationMin }

// Initialize the booking widget
function initBookingWidget() {
  const container = document.getElementById('booking-widget');
  if (!container) return;

  // Inject HTML
  container.innerHTML = `
    <div id="booking-split-container">
      <!-- Left Column: Form -->
      <div class="booking-form-column">
        <h2 class="booking-title">Book Your Ride</h2>
        <p class="booking-subtitle">Real-time pricing & routing</p>
        
        <form id="booking-form" class="booking-form" onsubmit="return false;">
          <div class="form-group autocomplete-wrapper">
            <label for="pickup">Pickup Location</label>
            <input type="text" id="pickup" placeholder="Search pickup address..." autocomplete="off" />
            <div id="pickup-results" class="autocomplete-results"></div>
          </div>

          <div class="form-group autocomplete-wrapper">
            <label for="dropoff">Drop-off Location</label>
            <input type="text" id="dropoff" placeholder="Search destination..." autocomplete="off" />
            <div id="dropoff-results" class="autocomplete-results"></div>
          </div>

          <div class="form-group">
            <label for="service-type">Service Type</label>
            <select id="service-type" onchange="updatePriceDisplay()">
              <option value="taxi">Standard Taxi</option>
              <option value="wheelchair">Wheelchair Accessible Van</option>
              <option value="stretcher">Stretcher / Medical Assist</option>
            </select>
          </div>

          <div class="form-group">
             <label for="datetime">Date & Time</label>
             <input type="datetime-local" id="datetime" required />
          </div>

          <button type="button" id="calculate-btn" class="btn-calculate" onclick="calculateRoute()">
            CALCULATE PRICE
          </button>
        </form>
      </div>

      <!-- Right Column: Map -->
      <div class="booking-map-column">
        <div id="booking-map"></div>
        
        <!-- Floating Result Card -->
        <div id="result-card" class="result-card">
          <button class="result-card-close" onclick="closeResultCard()">&times;</button>
          <h3 class="result-card-title">Trip Estimate</h3>
          <div class="result-price">$<span id="result-total">0.00</span></div>
          <div class="result-details">
            <div class="result-detail-item">
              <span class="result-detail-icon">🚗</span>
              <span><span id="result-distance">0</span> miles</span>
            </div>
            <div class="result-detail-item">
              <span class="result-detail-icon">⏱️</span>
              <span><span id="result-time">0</span> min</span>
            </div>
          </div>
          <button id="btn-book" class="btn-book" onclick="handleBooking()">
            Confirm & Pay
          </button>
        </div>
      </div>
    </div>
  `;

  // Initialize Map
  setTimeout(initMap, 100);

  // Setup Autocomplete
  setupAutocomplete('pickup', 'pickup-results', (item) => selectAddress(item, 'pickup'));
  setupAutocomplete('dropoff', 'dropoff-results', (item) => selectAddress(item, 'dropoff'));
}

// Initialize Leaflet Map
function initMap() {
  // Default: New York (fallback)
  const defaultLat = 40.7128;
  const defaultLng = -74.0060;

  map = L.map('booking-map').setView([defaultLat, defaultLng], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Try to get user location
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 15);

      // Reverse geocode to fill pickup
      // Note: Nominatim requires a User-Agent or email. We add a dummy email for dev purposes.
      // In production, use a real email or a paid geocoding service.
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&email=info@auramobility.com`)
        .then(res => {
          if (!res.ok) throw new Error('Nominatim API limit or error');
          return res.json();
        })
        .then(data => {
          if (data && data.display_name) {
            document.getElementById('pickup').value = data.display_name;
            selectAddress({ lat: latitude, lon: longitude, display_name: data.display_name }, 'pickup');
          }
        })
        .catch(err => {
          console.warn('Auto-geolocation failed (likely CORS or rate limit):', err);
          // Fail silently, user can still type address manually
        });
    });
  }
}

// Setup Autocomplete using Nominatim
function setupAutocomplete(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value;

    if (query.length < 3) {
      results.classList.remove('show');
      return;
    }

    debounceTimer = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=5`)
        .then(res => res.json())
        .then(data => {
          results.innerHTML = '';
          if (data.length > 0) {
            data.forEach(item => {
              const div = document.createElement('div');
              div.className = 'autocomplete-item';
              div.textContent = item.display_name;
              div.onclick = () => {
                input.value = item.display_name;
                results.classList.remove('show');
                onSelect(item);
              };
              results.appendChild(div);
            });
            results.classList.add('show');
          } else {
            results.classList.remove('show');
          }
        });
    }, 300); // 300ms debounce
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== results) {
      results.classList.remove('show');
    }
  });
}

// Handle Address Selection
function selectAddress(item, type) {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);
  const coords = { lat, lon };

  if (type === 'pickup') {
    pickupCoords = coords;
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker([lat, lon], {
      icon: createIcon('green')
    }).addTo(map).bindPopup('Pickup');
  } else {
    dropoffCoords = coords;
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker([lat, lon], {
      icon: createIcon('red')
    }).addTo(map).bindPopup('Dropoff');
  }

  // If both set, calculate route
  if (pickupCoords && dropoffCoords) {
    calculateRoute();
  } else {
    map.setView([lat, lon], 14);
  }
}

// Create Custom Marker Icon
function createIcon(color) {
  return L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
}

// Calculate Route with OSRM
function calculateRoute() {
  console.log('Calculating route...');
  if (!pickupCoords || !dropoffCoords) {
    console.warn('Missing coordinates for calculation');
    alert('⚠️ Please select both pickup and drop-off locations from the dropdown suggestions.');
    return;
  }

  // Show loading state
  const btn = document.getElementById('calculate-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Calculating...';
  btn.disabled = true;

  const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lon},${pickupCoords.lat};${dropoffCoords.lon},${dropoffCoords.lat}?overview=full&geometries=geojson`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceMeters = route.distance;
        const durationSeconds = route.duration;

        // Convert to miles and minutes
        const distanceMiles = distanceMeters * 0.000621371;
        const durationMin = Math.round(durationSeconds / 60);

        console.log(`Route found: ${distanceMiles.toFixed(2)} miles, ${durationMin} mins`);

        lastRouteData = { distanceMiles, durationMin };

        // Draw Route
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.geoJSON(route.geometry, {
          style: { color: '#0284C7', weight: 5, opacity: 0.7 }
        }).addTo(map);

        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        // Update UI
        updatePriceDisplay();
      } else {
        console.error('No route found');
        alert('❌ No driving route found between these locations. Are they connected by road?');
      }
    })
    .catch(err => {
      console.error('Routing error:', err);
      alert('❌ Error calculating route. Please try again.');
    })
    .finally(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    });
}

// Update Price Display
function updatePriceDisplay() {
  if (!lastRouteData) return;

  const serviceType = document.getElementById('service-type').value;
  const pricing = SERVICE_PRICING[serviceType];

  const total = pricing.baseFee + (lastRouteData.distanceMiles * pricing.ratePerMile);

  console.log(`Pricing Calculation:`);
  console.log(`Service: ${pricing.name}`);
  console.log(`Base Fee: $${pricing.baseFee}`);
  console.log(`Distance: ${lastRouteData.distanceMiles.toFixed(2)} miles * $${pricing.ratePerMile}/mile`);
  console.log(`Total: $${total.toFixed(2)}`);

  document.getElementById('result-total').textContent = total.toFixed(2);
  document.getElementById('result-distance').textContent = lastRouteData.distanceMiles.toFixed(1);
  document.getElementById('result-time').textContent = lastRouteData.durationMin;

  document.getElementById('result-card').classList.add('show');
}

function closeResultCard() {
  document.getElementById('result-card').classList.remove('show');
}

function handleBooking() {
  if (!lastRouteData) return;
  const total = document.getElementById('result-total').textContent;
  const pickup = document.getElementById('pickup').value;
  const dropoff = document.getElementById('dropoff').value;
  const serviceType = document.getElementById('service-type').value;
  const datetime = document.getElementById('datetime').value;

  showPaymentModal(total, { pickup, dropoff, serviceType, datetime });
}

// Show Payment Modal (Reused logic)
// Show Payment Modal (Reused logic)
function showPaymentModal(amount, details) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `
    <div class="payment-modal">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      
      <div class="modal-header">
        <h2 class="modal-title">Complete Your Booking</h2>
        <p class="modal-subtitle">Secure Payment via Cash App</p>
      </div>

      <div class="modal-body">
        <div class="booking-summary-card">
            <div class="summary-item">
                <span class="label">Service</span>
                <span class="value">${SERVICE_PRICING[details.serviceType].name}</span>
            </div>
            <div class="summary-item">
                <span class="label">Distance</span>
                <span class="value">${lastRouteData.distanceMiles.toFixed(1)} miles</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-total">
                <span class="label">Total Amount</span>
                <span class="value price">$${amount}</span>
            </div>
        </div>

        <div class="payment-action-area">
            <p class="payment-instruction">Scan to pay <strong>$${amount}</strong></p>
            
            <div class="qr-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg" alt="Payment QR Code" class="qr-image">
                <div class="qr-overlay">
                    <span class="cashtag-pill">$AuraMobility</span>
                </div>
            </div>
            
            <p class="payment-note">Or send manually to <span class="highlight">$AuraMobility</span></p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-confirm-payment" onclick="alert('Thank you! Your booking is confirmed. A driver will be assigned shortly.'); this.closest('.modal-overlay').remove();">
          I've Sent Payment
        </button>
      </div>
    </div>
    `;
  document.body.appendChild(overlay);
}

// Init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookingWidget);
} else {
  initBookingWidget();
}
