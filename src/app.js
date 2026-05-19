const LYON = { name: "Lyon", lat: 45.764, lon: 4.836 };
const routeLayers = new Map();
const markers = new Map();
let markerBounds = null;
let hikes = [];
let activeFilter = "all";

const map = L.map("map").setView([45.86, 5.2], 8);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

function createNumberedIcon(hike) {
  return L.divIcon({
    className: "",
    html: `<div class="numbered-marker" style="--marker-color:${hike.color}">${hike.rank}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
}

function buildPopup(hike) {
  const warning = hike.technicalNote
    ? `<div class="popup__warning">⚠️ ${hike.technicalNote}</div>`
    : "";

  const sourceLink = hike.sourcePageUrl
    ? `<a class="popup__link" href="${hike.sourcePageUrl}" target="_blank" rel="noopener">Ouvrir la source</a>`
    : "";

  return `
    <div class="popup">
      <div class="popup__title">${hike.rank}. ${hike.name}</div>
      <div>${hike.massif}</div>
      <div class="popup__drive" style="background:${hike.color}">🚗 Trajet depuis Lyon : ${hike.driveTimeFromLyon}</div>
      <div class="popup__meta">
        <div class="popup__row"><span class="popup__label">Départ</span><span class="popup__value">${hike.start}</span></div>
        <div class="popup__row"><span class="popup__label">Durée rando</span><span class="popup__value">${hike.duration}</span></div>
        <div class="popup__row"><span class="popup__label">Distance fiche</span><span class="popup__value">${hike.distanceLabel}</span></div>
        <div class="popup__row"><span class="popup__label">Distance GPX</span><span class="popup__value">${hike.computedDistanceKm} km</span></div>
        <div class="popup__row"><span class="popup__label">Dénivelé fiche</span><span class="popup__value">${hike.elevation}</span></div>
        <div class="popup__row"><span class="popup__label">Trace</span><span class="popup__value">${hike.pointCount} points</span></div>
      </div>
      ${warning}
      ${sourceLink}
    </div>
  `;
}

function parseGpxText(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const parserError = xml.querySelector("parsererror");

  if (parserError) {
    throw new Error("GPX invalide");
  }

  const trackPoints = [...xml.querySelectorAll("trkpt")]
    .map((node) => {
      const lat = Number(node.getAttribute("lat"));
      const lon = Number(node.getAttribute("lon"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return [lat, lon];
    })
    .filter(Boolean);

  if (trackPoints.length < 2) {
    throw new Error("Trace GPX trop courte");
  }

  return trackPoints;
}

async function loadRouteLayer(hike) {
  if (routeLayers.has(hike.id)) {
    return routeLayers.get(hike.id);
  }

  const response = await fetch(hike.gpx);

  if (!response.ok) {
    throw new Error(`Impossible de charger ${hike.gpx}`);
  }

  const points = parseGpxText(await response.text());
  const layer = L.polyline(points, {
    color: hike.color,
    weight: 5,
    opacity: 0.92,
    lineJoin: "round",
    lineCap: "round"
  }).bindTooltip(`${hike.rank}. ${hike.name}`, { sticky: true });

  routeLayers.set(hike.id, layer);
  return layer;
}

function clearActiveRoutes() {
  routeLayers.forEach((layer) => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
}

function activateCard(hikeId) {
  document.querySelectorAll(".hike-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.hikeId === hikeId);
  });
}

function updateCardStatus(hikeId, type, text) {
  const card = document.querySelector(`[data-hike-id="${hikeId}"]`);
  if (!card) return;

  const status = card.querySelector(".status");
  status.className = `status status--${type}`;
  status.textContent = text;
}

async function selectHike(hikeId) {
  const hike = hikes.find((item) => item.id === hikeId);
  if (!hike) return;

  activateCard(hikeId);
  clearActiveRoutes();
  markers.get(hikeId)?.openPopup();

  try {
    updateCardStatus(hikeId, "loading", "Chargement…");
    const layer = await loadRouteLayer(hike);
    layer.addTo(map);
    updateCardStatus(hikeId, "loaded", `${hike.pointCount} points`);
    map.fitBounds(layer.getBounds(), { padding: [54, 54], maxZoom: 15 });
  } catch (error) {
    console.error(error);
    updateCardStatus(hikeId, "error", "Trace indisponible");
    map.fitBounds(L.latLngBounds([hike.startCoordinates]), { padding: [80, 80], maxZoom: 13 });
  }
}

function createHikeList() {
  const list = document.getElementById("hike-list");
  list.replaceChildren();

  hikes.forEach((hike) => {
    const li = document.createElement("li");
    li.className = "hike-card";
    li.dataset.hikeId = hike.id;
    li.dataset.difficulty = hike.difficulty;
    li.style.setProperty("--card-color", hike.color);

    li.innerHTML = `
      <div class="hike-card__top">
        <span class="hike-card__number">${hike.rank}</span>
        <div class="hike-card__main">
          <div class="hike-card__name">${hike.name}</div>
          <div class="hike-card__meta">${hike.massif} · 🚗 ${hike.driveTimeFromLyon} · 🥾 ${hike.duration} · ${hike.elevation}</div>
          <div class="hike-card__status">
            <span class="status status--loaded">${hike.pointCount} points</span>
            <span>${hike.computedDistanceKm} km GPX</span>
          </div>
        </div>
      </div>
    `;

    li.addEventListener("click", () => selectHike(hike.id));
    list.appendChild(li);
  });
}

function applyFilter(filter) {
  activeFilter = filter;

  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.filter === filter);
  });

  document.querySelectorAll(".hike-card").forEach((card) => {
    const shouldShow = filter === "all" || card.dataset.difficulty === filter;
    card.classList.toggle("is-hidden", !shouldShow);
  });
}

function resetMap() {
  clearActiveRoutes();
  activateCard(null);
  map.fitBounds(markerBounds, { padding: [44, 44] });
}

function setPanelCollapsed(collapsed) {
  document.body.classList.toggle("panel-collapsed", collapsed);
  document.getElementById("expand-panel-button").setAttribute("aria-expanded", String(!collapsed));
}

function createMarkers() {
  markerBounds = L.latLngBounds([[LYON.lat, LYON.lon]]);

  L.marker([LYON.lat, LYON.lon])
    .addTo(map)
    .bindPopup("<b>Lyon</b>")
    .bindTooltip("Lyon", { permanent: true, direction: "right" });

  hikes.forEach((hike) => {
    const marker = L.marker(hike.startCoordinates, { icon: createNumberedIcon(hike) })
      .addTo(map)
      .bindPopup(buildPopup(hike));

    marker.on("click", () => selectHike(hike.id));
    markers.set(hike.id, marker);
    markerBounds.extend(hike.startCoordinates);
  });

  map.fitBounds(markerBounds, { padding: [44, 44] });
}

async function init() {
  const response = await fetch("data/hikes.json");
  hikes = await response.json();

  createMarkers();
  createHikeList();

  document.getElementById("collapse-panel-button").addEventListener("click", () => setPanelCollapsed(true));
  document.getElementById("expand-panel-button").addEventListener("click", () => setPanelCollapsed(false));
  document.getElementById("reset-button").addEventListener("click", resetMap);

  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => applyFilter(chip.dataset.filter));
  });

  const initialId = new URLSearchParams(window.location.search).get("rando");
  if (initialId && hikes.some((hike) => hike.id === initialId)) {
    await selectHike(initialId);
  }
}

init().catch((error) => {
  console.error(error);
  alert("Impossible de charger la carte des randonnées.");
});
