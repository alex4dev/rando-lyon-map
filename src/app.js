const LYON = { name: "Lyon", lat: 45.764, lon: 4.836 };
const routeLayers = new Map();
const markers = new Map();
let markerBounds = null;
let hikes = [];
let activeFilter = "all";
let activeStartMarker = null;
let activeHikeId = null;
let selectionRequestId = 0;

const map = L.map("map").setView([45.86, 5.2], 8);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const difficultyMeta = {
  "Moyenne": {
    level: "▲",
    className: "difficulty-chip--medium",
    routeColor: "var(--difficulty-medium)"
  },
  "Difficile": {
    level: "▲▲",
    className: "difficulty-chip--hard",
    routeColor: "var(--difficulty-hard)"
  },
  "Très difficile": {
    level: "▲▲▲",
    className: "difficulty-chip--very-hard",
    routeColor: "var(--difficulty-very-hard)"
  }
};

function getDifficultyMeta(hike) {
  return difficultyMeta[hike.difficulty] ?? difficultyMeta.Moyenne;
}

function resolveCssColor(value) {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function buildWarningTags(note) {
  if (!note) return "";

  const normalized = note.toLowerCase();
  const tags = [];

  if (normalized.includes("pluie") || normalized.includes("humide") || normalized.includes("météo")) {
    tags.push("Éviter pluie");
  }

  if (normalized.includes("équip")) {
    tags.push("Passage équipé");
  }

  if (normalized.includes("vertige") || normalized.includes("aérien")) {
    tags.push("Vertige");
  }

  if (tags.length === 0) {
    tags.push("Vigilance");
  }

  return tags.map((tag) => `<span class="warning-chip">⚠ ${tag}</span>`).join("");
}

function createNumberedIcon(hike, isActive = false) {
  const meta = getDifficultyMeta(hike);

  return L.divIcon({
    className: "",
    html: `<div class="numbered-marker${isActive ? " numbered-marker--active" : ""}" style="--marker-color:${meta.routeColor}">${hike.rank}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
}

function buildPopup(hike) {
  const meta = getDifficultyMeta(hike);
  const warning = hike.technicalNote
    ? `<div class="popup__warning">${buildWarningTags(hike.technicalNote)}<div class="popup__warning-note">${hike.technicalNote}</div></div>`
    : "";

  const sourceLink = hike.sourcePageUrl
    ? `<a class="popup__link" href="${hike.sourcePageUrl}" target="_blank" rel="noopener">Ouvrir la source</a>`
    : "";

  return `
    <div class="popup">
      <div class="popup__title">${hike.rank}. ${hike.name}</div>
      <div>${hike.massif}</div>
      <div class="popup__drive">Trajet depuis Lyon : ${hike.driveTimeFromLyon}</div>
      <div class="popup__chips">
        <span class="difficulty-chip ${meta.className}">${meta.level} ${hike.difficulty}</span>
      </div>
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
  const routeColor = resolveCssColor(getDifficultyMeta(hike).routeColor);
  const halo = L.polyline(points, {
    color: resolveCssColor("var(--surface)"),
    weight: 9,
    opacity: 0.65,
    lineJoin: "round",
    lineCap: "round",
    className: "route-line-halo"
  });
  const route = L.polyline(points, {
    color: routeColor,
    weight: 6,
    opacity: 0.95,
    lineJoin: "round",
    lineCap: "round",
    className: "route-line route-line--active"
  }).bindTooltip(`${hike.rank}. ${hike.name}`, { sticky: true });
  const layer = L.layerGroup([halo, route]);

  layer.getBounds = () => route.getBounds();
  layer.activeRoute = route;
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

function clearActiveStartMarker() {
  if (activeStartMarker) {
    map.removeLayer(activeStartMarker);
    activeStartMarker = null;
  }
}

function showActiveStartMarker(hike) {
  const routeColor = resolveCssColor(getDifficultyMeta(hike).routeColor);

  clearActiveStartMarker();

  activeStartMarker = L.circleMarker(hike.startCoordinates, {
    radius: 8,
    color: resolveCssColor("var(--selected)"),
    weight: 3,
    fillColor: routeColor,
    fillOpacity: 1,
    className: "active-start-marker"
  })
    .addTo(map)
    .bindTooltip(`Départ - ${hike.name}`, {
      direction: "top",
      offset: [0, -8]
    });
}

function setActiveMarker(hikeId) {
  hikes.forEach((hike) => {
    markers.get(hike.id)?.setIcon(createNumberedIcon(hike, hike.id === hikeId));
  });
}

function resetCardStatuses() {
  hikes.forEach((hike) => {
    updateCardStatus(hike.id, "idle", "");
  });
}

function activateCard(hikeId) {
  document.querySelectorAll(".hike-card").forEach((card) => {
    const isActive = card.dataset.hikeId === hikeId;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-selected", String(isActive));
  });
}

function updateCardStatus(hikeId, type, text) {
  const card = document.querySelector(`[data-hike-id="${hikeId}"]`);
  if (!card) return;

  const status = card.querySelector(".status");
  status.className = `selection-badge status status--${type}`;
  status.textContent = text;
}

async function selectHike(hikeId) {
  const hike = hikes.find((item) => item.id === hikeId);
  if (!hike) return;

  activeHikeId = hikeId;
  const requestId = ++selectionRequestId;

  resetCardStatuses();
  activateCard(hikeId);
  setActiveMarker(hikeId);
  clearActiveRoutes();
  showActiveStartMarker(hike);
  markers.get(hikeId)?.openPopup();

  try {
    updateCardStatus(hikeId, "loading", "Chargement trace");
    const layer = await loadRouteLayer(hike);
    if (requestId !== selectionRequestId || activeHikeId !== hikeId) return;

    clearActiveRoutes();
    layer.addTo(map);
    revealRouteLayer(layer.activeRoute);
    updateCardStatus(hikeId, "active", "Sélectionnée");
    map.fitBounds(layer.getBounds(), { padding: [54, 54], maxZoom: 15, animate: true, duration: 0.7 });
  } catch (error) {
    if (requestId !== selectionRequestId || activeHikeId !== hikeId) return;

    console.error(error);
    updateCardStatus(hikeId, "error", "Trace indisponible");
    map.fitBounds(L.latLngBounds([hike.startCoordinates]), { padding: [80, 80], maxZoom: 13, animate: true });
  }
}

function revealRouteLayer(layer) {
  requestAnimationFrame(() => {
    const path = layer.getElement();
    if (!path || typeof path.getTotalLength !== "function") return;

    const length = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    path.style.opacity = "0.35";

    requestAnimationFrame(() => {
      path.style.transition = "stroke-dashoffset 700ms cubic-bezier(.2, 0, 0, 1), opacity 240ms ease";
      path.style.strokeDashoffset = "0";
      path.style.opacity = "1";
    });
  });
}

function createHikeList() {
  const list = document.getElementById("hike-list");
  list.replaceChildren();

  hikes.forEach((hike) => {
    const meta = getDifficultyMeta(hike);
    const li = document.createElement("li");
    li.className = "hike-card";
    li.dataset.hikeId = hike.id;
    li.dataset.difficulty = hike.difficulty;
    li.setAttribute("role", "option");
    li.setAttribute("tabindex", "0");
    li.setAttribute("aria-selected", "false");
    li.style.setProperty("--difficulty-color", meta.routeColor);

    li.innerHTML = `
      <div class="hike-card__header">
        <span class="hike-card__number">${hike.rank}</span>
        <div class="hike-card__main">
          <div class="hike-card__name">${hike.name}</div>
          <div class="hike-card__meta">${hike.massif} · ${hike.driveTimeFromLyon}</div>
        </div>
        <span class="selection-badge status status--idle" aria-live="polite"></span>
      </div>
      <div class="hike-card__stats" aria-label="Détails randonnée">
        <span><strong>${hike.duration}</strong><small>Durée</small></span>
        <span><strong>${hike.elevation}</strong><small>D+</small></span>
        <span><strong>${hike.distanceLabel}</strong><small>Distance</small></span>
      </div>
      <div class="hike-card__chips">
        <span class="difficulty-chip ${meta.className}">${meta.level} ${hike.difficulty}</span>
        ${buildWarningTags(hike.technicalNote)}
      </div>
    `;

    li.addEventListener("click", () => selectHike(hike.id));
    li.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectHike(hike.id);
      }
    });
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
  activeHikeId = null;
  selectionRequestId++;
  clearActiveRoutes();
  clearActiveStartMarker();
  resetCardStatuses();
  activateCard(null);
  setActiveMarker(null);
  map.closePopup();
  map.fitBounds(markerBounds, { padding: [44, 44], animate: true, duration: 0.7 });
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
