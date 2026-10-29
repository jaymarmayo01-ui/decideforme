
"use strict";

console.log("DecideForMe loaded.");

const PHOTON_URL = "https://photon.komoot.io/api/";
const HISTORY_KEY = "decideForMeHistory";
const MAX_HISTORY = 50;

const modeSettings = {
  eat: {
    title: "Find Somewhere to Eat",
    query: "restaurant",
    suggestions: [
      "Try a new restaurant",
      "Have a coffee date",
      "Order your favorite food",
      "Try a local food spot",
      "Enjoy a dessert",
      "Have a picnic"
    ]
  },
  go: {
    title: "Find Somewhere to Go",
    query: "tourist attraction",
    suggestions: [
      "Visit a park",
      "Explore somewhere new",
      "Visit a museum",
      "Watch the sunset",
      "Visit a local attraction",
      "Go on a short road trip"
    ]
  },
  do: {
    title: "Find Something to Do",
    query: "entertainment",
    suggestions: [
      "Watch a movie",
      "Play a video game",
      "Try a new recipe",
      "Go for a walk",
      "Take photos",
      "Have a game night",
      "Listen to music",
      "Learn something new",
      "Exercise for 20 minutes",
      "Call a friend"
    ]
  }
};

let currentCategory = "eat";
let choices = [];
let history = loadHistory();
let isSpinning = false;
let wheelRotation = 0;
let searchInProgress = false;

document.addEventListener("DOMContentLoaded", setupApp);

/* INITIAL SETUP */

function setupApp() {
  document.querySelectorAll(".category-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectCategory(card.dataset.mode);
    });
  });

  document.getElementById("place-search-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      searchPlaces();
    });

  document.getElementById("find-places")
    ?.addEventListener("click", openGoogleMaps);

  document.getElementById("decide-place")
    ?.addEventListener("click", pickRandomPlace);

  document.getElementById("choice-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      addChoice();
    });

  document.getElementById("spin-button")
    ?.addEventListener("click", spinWheel);

  document.getElementById("clear-choices")
    ?.addEventListener("click", clearChoices);

  createHistorySection();

  renderChoices();
  renderPlaceChoices();
  renderHistory();
  drawWheel();

  selectCategory("eat");
}

/* CATEGORY SELECTION */

function selectCategory(category) {
  if (category !== "pick" && !modeSettings[category]) return;

  currentCategory = category;

  document.querySelectorAll(".category-card").forEach((card) => {
    const selected = card.dataset.mode === category;

    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  });

  const placePanel = document.getElementById("place-panel");
  const pickerPanel = document.getElementById("picker-panel");
  const title = document.getElementById("place-title");
  const queryInput = document.getElementById("place-query");
  const status = document.getElementById("place-status");
  const results = document.getElementById("place-results");
  const winner = document.getElementById("place-winner");

  const isPickMode = category === "pick";

  placePanel.classList.toggle("hidden", isPickMode);
  pickerPanel.classList.toggle("hidden", !isPickMode);

  if (results) results.replaceChildren();
  if (winner) winner.replaceChildren();

  if (isPickMode) {
    renderPlaceChoices();
    return;
  }

  const settings = modeSettings[category];

  title.textContent = settings.title;
  queryInput.value = settings.query;

  status.textContent =
    "Search for places, or enter a location. You can also open Google Maps.";

  if (category === "do") {
    renderActivitySuggestions(settings.suggestions);
  }

  renderPlaceChoices();
}

/* PLACE SEARCH */

async function searchPlaces() {
  if (searchInProgress) return;

  const queryInput = document.getElementById("place-query");
  const areaInput = document.getElementById("place-area");
  const results = document.getElementById("place-results");
  const button = document.getElementById("search-places");
  const winner = document.getElementById("place-winner");

  const query = queryInput.value.trim();
  const area = areaInput.value.trim();

  if (!query) {
    showPlaceMessage("Enter the kind of place you want to find.");
    queryInput.focus();
    return;
  }

  searchInProgress = true;
  button.disabled = true;
  button.textContent = "Searching...";
  results.replaceChildren();
  winner.replaceChildren();

  renderPlaceChoices();
  showPlaceMessage("Looking for places. This may take a few seconds.");

  try {
    let location = null;

    if (area) {
      location = await findLocation(area);
    } else {
      location = await getCurrentLocation();
    }

    const features = await fetchPlaces(query, location);

    if (!features.length) {
      showPlaceMessage(
        "No places were found. Try another search term or open Google Maps."
      );
      return;
    }

    renderPlaceResults(features);
    renderPlaceChoices();

    showPlaceMessage(
      `Found ${features.length} possible result(s). Click Decide for me to pick one.`
    );
  } catch (error) {
    console.error("Place search failed:", error);

    showPlaceMessage(
      "The search service or internet connection failed. Please try again."
    );
  } finally {
    searchInProgress = false;
    button.disabled = false;
    button.textContent = "🔎 Search places inside the app";
    renderPlaceChoices();
  }
}

async function fetchPlaces(query, location) {
  const url = new URL(PHOTON_URL);

  url.searchParams.set("q", query);
  url.searchParams.set("limit", "12");
  url.searchParams.set("lang", "en");

  if (location) {
    url.searchParams.set("lat", String(location.lat));
    url.searchParams.set("lon", String(location.lon));
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Search returned HTTP ${response.status}`);
  }

  const data = await response.json();

  return (data.features || []).filter((feature) => {
    const properties = feature.properties || {};

    return Boolean(
      properties.name ||
      properties.street ||
      properties.city ||
      properties.locality
    );
  });
}

async function findLocation(area) {
  const url = new URL(PHOTON_URL);

  url.searchParams.set("q", area);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "en");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error("Could not find that location.");
  }

  const data = await response.json();
  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates;

  if (!coordinates || coordinates.length < 2) {
    throw new Error("No matching location was found.");
  }

  return {
    lon: coordinates[0],
    lat: coordinates[1]
  };
}

function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 300000
      }
    );
  });
}

/* DISPLAY PLACE RESULTS */

function renderPlaceResults(features) {
  const container = document.getElementById("place-results");
  container.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = "Search results";
  container.appendChild(heading);

  features.forEach((feature) => {
    const properties = feature.properties || {};
    const coordinates = feature.geometry?.coordinates || [];

    const name = properties.name || properties.street || "Unnamed place";

    const addressParts = [
      properties.housenumber,
      properties.street,
      properties.city || properties.locality,
      properties.state,
      properties.country
    ].filter(Boolean);

    const address = [...new Set(addressParts)].join(", ");
    const placeKey = `${name} ${address}`.trim();

    const card = document.createElement("article");
    card.className = "place-card";

    const title = document.createElement("h3");
    title.textContent = name;

    const addressText = document.createElement("p");
    addressText.textContent = address || "Address not available";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-button place-add-button";

    const alreadyAdded = choices.some(
      (choice) => choice.toLowerCase() === placeKey.toLowerCase()
    );

    addButton.textContent = alreadyAdded ? "Added ✓" : "+ Add to choices";
    addButton.disabled = alreadyAdded;

    addButton.addEventListener("click", () => {
      const added = addChoiceByValue(placeKey);

      if (added) {
        addButton.textContent = "Added ✓";
        addButton.disabled = true;
        showPlaceMessage(`${name} added to your choices.`);
      } else {
        showPlaceMessage("That place is already in your choices.");
      }
    });

    const mapLink = document.createElement("a");
    mapLink.href = makeMapsUrl(name, address, coordinates);
    mapLink.target = "_blank";
    mapLink.rel = "noopener noreferrer";
    mapLink.textContent = "View on Google Maps";

    card.append(title, addressText, addButton, mapLink);
    container.appendChild(card);
  });
}

function makeMapsUrl(name, address, coordinates) {
  let query = [name, address].filter(Boolean).join(", ");

  if (coordinates && coordinates.length >= 2) {
    query += ` (${coordinates[1]}, ${coordinates[0]})`;
  }

  return "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(query);
}

function openGoogleMaps() {
  const query = document.getElementById("place-query").value.trim();
  const area = document.getElementById("place-area").value.trim();

  const search = [
    query || modeSettings[currentCategory]?.query || "places",
    area
  ].filter(Boolean).join(" ");

  const url =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(search);

  window.open(url, "_blank", "noopener,noreferrer");
}

/* ACTIVITY SUGGESTIONS */

function renderActivitySuggestions(suggestions) {
  const container = document.getElementById("place-results");

  const heading = document.createElement("h3");
  heading.textContent = "Activity ideas";
  container.appendChild(heading);

  suggestions.forEach((suggestion) => {
    const card = document.createElement("article");
    card.className = "place-card";

    const name = document.createElement("h3");
    name.textContent = suggestion;

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-button place-add-button";
    addButton.textContent = "+ Add to choices";

    addButton.addEventListener("click", () => {
      const added = addChoiceByValue(suggestion);
      addButton.textContent = added ? "Added ✓" : "Already added";
      addButton.disabled = true;
    });

    card.append(name, addButton);
    container.appendChild(card);
  });

  const addAllButton = document.createElement("button");
  addAllButton.type = "button";
  addAllButton.className = "secondary-button";
  addAllButton.textContent = "Add all activity ideas";

  addAllButton.addEventListener("click", () => {
    suggestions.forEach(addChoiceByValue);
    showPlaceMessage("Activity ideas have been added to your choices.");
  });

  container.appendChild(addAllButton);
}

/* CHOICE LIST */

function addChoice() {
  const input = document.getElementById("choice-input");
  const value = input.value.trim();

  if (!value) return;

  if (addChoiceByValue(value)) {
    input.value = "";
    showPickerMessage("Choice added!");
  } else {
    showPickerMessage("That choice is already on your list.");
  }

  input.focus();
}

function addChoiceByValue(value) {
  const cleanedValue = String(value || "").trim();

  if (!cleanedValue) return false;

  const alreadyExists = choices.some(
    (choice) => choice.toLowerCase() === cleanedValue.toLowerCase()
  );

  if (alreadyExists) return false;

  choices.push(cleanedValue);

  renderChoices();
  renderPlaceChoices();
  drawWheel();

  return true;
}

function renderChoices() {
  const list = document.getElementById("choice-list");
  const spinButton = document.getElementById("spin-button");

  list.replaceChildren();

  choices.forEach((choice, index) => {
    const item = document.createElement("li");
    item.className = "choice-item";

    const label = document.createElement("span");
    label.textContent = choice;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-choice";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${choice}`);
    removeButton.disabled = isSpinning;

    removeButton.addEventListener("click", () => {
      if (isSpinning) return;

      choices.splice(index, 1);
      renderChoices();
      renderPlaceChoices();
      drawWheel();
    });

    item.append(label, removeButton);
    list.appendChild(item);
  });

  spinButton.disabled = choices.length < 2 || isSpinning;

  const label = document.getElementById("wheel-label");

  if (label && !isSpinning && choices.length === 0) {
    label.textContent = "YOUR CHOICES";
  }
}

function renderPlaceChoices() {
  const list = document.getElementById("place-choice-list");
  const count = document.getElementById("place-choice-count");
  const decideButton = document.getElementById("decide-place");

  if (!list || !count || !decideButton) return;

  list.replaceChildren();

  choices.forEach((choice, index) => {
    const item = document.createElement("li");
    item.className = "choice-item";

    const label = document.createElement("span");
    label.textContent = choice;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-choice";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${choice}`);
    removeButton.disabled = isSpinning;

    removeButton.addEventListener("click", () => {
      if (isSpinning) return;

      choices.splice(index, 1);
      renderChoices();
      renderPlaceChoices();
      drawWheel();
    });

    item.append(label, removeButton);
    list.appendChild(item);
  });

  count.textContent = `(${choices.length})`;

  const resultCards = Array.from(
    document.querySelectorAll("#place-results .place-card")
  ).filter((card) => card.querySelector("a[href]"));

  const hasEnoughResults = resultCards.length >= 2;
  const hasEnoughChoices = choices.length >= 2;

  decideButton.disabled =
    (!hasEnoughResults && !hasEnoughChoices) ||
    isSpinning ||
    searchInProgress;
}

function clearChoices() {
  if (isSpinning) return;

  choices = [];
  wheelRotation = 0;

  document.getElementById("choice-input").value = "";

  const result = document.getElementById("pick-result");
  const placeWinner = document.getElementById("place-winner");
  const label = document.getElementById("wheel-label");

  if (result) {
    result.textContent = "Add your choices and let the wheel decide!";
  }

  if (placeWinner) placeWinner.replaceChildren();
  if (label) label.textContent = "YOUR CHOICES";

  renderChoices();
  renderPlaceChoices();
  drawWheel();
}

/* AUTOMATIC PLACE DECISION */

function pickRandomPlace() {
  const container = document.getElementById("place-winner");
  const results = document.getElementById("place-results");

  if (!container || isSpinning || searchInProgress) return;

  const resultCards = results
    ? Array.from(results.querySelectorAll(".place-card"))
        .filter((card) => card.querySelector("a[href]"))
    : [];

  let winner;

  if (resultCards.length > 0) {
    const selectedCard =
      resultCards[Math.floor(Math.random() * resultCards.length)];

    winner = {
      name: selectedCard.querySelector("h3")?.textContent ||
        "Selected place",
      address: selectedCard.querySelector("p")?.textContent || "",
      url: selectedCard.querySelector("a[href]")?.href || ""
    };
  } else if (choices.length > 0) {
    const selectedChoice =
      choices[Math.floor(Math.random() * choices.length)];

    winner = {
      name: selectedChoice,
      address: "",
      url: makeMapsUrl(selectedChoice, "", [])
    };
  } else {
    showPlaceMessage("Search for places first, or add choices.");
    return;
  }

  container.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = "🎉 DecideForMe picked:";

  const name = document.createElement("p");
  name.className = "winner-name";
  name.textContent = winner.name;

  container.append(heading, name);

  if (winner.address && winner.address !== "Address not available") {
    const address = document.createElement("p");
    address.className = "muted";
    address.textContent = winner.address;
    container.appendChild(address);
  }

  const link = document.createElement("a");
  link.href = winner.url || makeMapsUrl(winner.name, winner.address, []);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "winner-map-link";
  link.textContent = "📍 Open this place in Google Maps";

  container.appendChild(link);

  saveDecision({
    name: winner.name,
    details: winner.address,
    category: currentCategory,
    type: "Place decision",
    url: link.href
  });

  container.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });

  showPlaceMessage("Your winner has been selected and saved to history!");
}

/* SPINNING WHEEL */

function spinWheel() {
  if (choices.length < 2 || isSpinning) {
    showPickerMessage("Add at least two choices before spinning!");
    return;
  }

  isSpinning = true;
  renderChoices();
  renderPlaceChoices();

  const wheel = document.getElementById("wheel");
  const label = document.getElementById("wheel-label");
  const result = document.getElementById("pick-result");

  const winner = choices[Math.floor(Math.random() * choices.length)];

  result.textContent = "The wheel is spinning...";
  label.textContent = "Spinning...";

  wheelRotation +=
    (5 + Math.floor(Math.random() * 4)) * 360 +
    Math.random() * 360;

  wheel.style.transition =
    "transform 3s cubic-bezier(.15,.75,.15,1)";
  wheel.style.transform = `rotate(${wheelRotation}deg)`;

  window.setTimeout(() => {
    isSpinning = false;

    label.textContent = winner;
    result.textContent = `🎉 The decision is: ${winner}!`;

    saveDecision({
      name: winner,
      details: "",
      category: "pick",
      type: "Wheel decision",
      url: makeMapsUrl(winner, "", [])
    });

    renderChoices();
    renderPlaceChoices();
  }, 3100);
}

/* WHEEL DRAWING */

function drawWheel() {
  const wheel = document.getElementById("wheel");
  if (!wheel) return;

  if (choices.length === 0) {
    wheel.style.background = "";
    wheel.style.transform = "rotate(0deg)";
    wheel.style.transition = "none";
    wheelRotation = 0;
    return;
  }

  const colors = [
    "#FF6B6B",
    "#FFD166",
    "#06D6A0",
    "#118AB2",
    "#9B5DE5",
    "#F15BB5",
    "#00BBF9",
    "#FEE440"
  ];

  const segmentAngle = 360 / choices.length;

  const segments = choices.map((_, index) => {
    const start = index * segmentAngle;
    const end = (index + 1) * segmentAngle;

    return `${colors[index % colors.length]} ${start}deg ${end}deg`;
  });

  wheel.style.background =
    `conic-gradient(${segments.join(", ")})`;
}

/* DECISION HISTORY STORAGE */

function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.name === "string")
      .slice(0, MAX_HISTORY);
  } catch (error) {
    console.warn("Could not load decision history:", error);
    return [];
  }
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error("Could not save decision history:", error);
    showPlaceMessage(
      "Your decision was made, but the browser could not save its history."
    );
    return false;
  }
}

function saveDecision(decision) {
  const record = {
    id: createHistoryId(),
    name: decision.name,
    details: decision.details || "",
    category: decision.category || currentCategory,
    type: decision.type || "Decision",
    url: decision.url || "",
    timestamp: new Date().toISOString()
  };

  history.unshift(record);
  history = history.slice(0, MAX_HISTORY);

  saveHistoryToStorage();
  renderHistory();
}

function createHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* CREATE HISTORY SECTION AUTOMATICALLY */

function createHistorySection() {
  if (document.getElementById("history-panel")) return;

  const placePanel = document.getElementById("place-panel");
  const pickerPanel = document.getElementById("picker-panel");

  if (!placePanel || !pickerPanel) {
    console.warn("Could not find the main app panels for history.");
    return;
  }

  const panel = document.createElement("section");
  panel.id = "history-panel";
  panel.className = "history-panel";

  panel.style.cssText = [
    "margin:24px 0",
    "padding:20px",
    "border:1px solid rgba(255,255,255,0.12)",
    "border-radius:16px",
    "background:rgba(255,255,255,0.035)",
    "color:inherit"
  ].join(";");

  const heading = document.createElement("h2");
  heading.textContent = "🕘 Decision History";
  heading.style.marginTop = "0";

  const description = document.createElement("p");
  description.textContent =
    "Your recent place picks and wheel results are saved on this device.";
  description.style.opacity = "0.8";

  const controls = document.createElement("div");
  controls.style.cssText =
    "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px";

  const total = document.createElement("span");
  total.id = "history-count";
  total.textContent = "0 decisions";
  total.style.marginRight = "auto";

  const clearButton = document.createElement("button");
  clearButton.id = "clear-history";
  clearButton.type = "button";
  clearButton.textContent = "Clear history";
  clearButton.style.cssText =
    "padding:9px 13px;border-radius:9px;cursor:pointer";

  clearButton.addEventListener("click", clearHistory);

  const list = document.createElement("div");
  list.id = "history-list";

  controls.append(total, clearButton);
  panel.append(heading, description, controls, list);

  pickerPanel.insertAdjacentElement("afterend", panel);
}

/* DISPLAY HISTORY */

function renderHistory() {
  const list = document.getElementById("history-list");
  const count = document.getElementById("history-count");
  const clearButton = document.getElementById("clear-history");

  if (!list || !count || !clearButton) return;

  list.replaceChildren();

  count.textContent =
    `${history.length} decision${history.length === 1 ? "" : "s"}`;

  clearButton.disabled = history.length === 0;

  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      "No decisions yet. Use Decide for me or spin the wheel to start your history.";
    empty.style.opacity = "0.75";
    list.appendChild(empty);
    return;
  }

  history.forEach((record) => {
    const card = document.createElement("article");

    card.style.cssText = [
      "padding:14px",
      "margin-bottom:10px",
      "border:1px solid rgba(255,255,255,0.1)",
      "border-radius:12px",
      "background:rgba(255,255,255,0.025)"
    ].join(";");

    const name = document.createElement("h3");
    name.textContent = record.name;
    name.style.margin = "0 0 6px";

    const metadata = document.createElement("p");
    metadata.textContent =
      `${record.type} · ${formatHistoryDate(record.timestamp)}`;
    metadata.style.cssText =
      "font-size:0.88rem;opacity:0.75;margin:0 0 8px";

    card.append(name, metadata);

    if (record.details &&
        record.details !== "Address not available") {
      const details = document.createElement("p");
      details.textContent = record.details;
      details.style.cssText =
        "font-size:0.9rem;opacity:0.85;margin:0 0 10px";
      card.appendChild(details);
    }

    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex;gap:10px;align-items:center;flex-wrap:wrap";

    if (record.url) {
      const mapLink = document.createElement("a");
      mapLink.href = record.url;
      mapLink.target = "_blank";
      mapLink.rel = "noopener noreferrer";
      mapLink.textContent = "Open link";
      actions.appendChild(mapLink);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.style.cssText =
      "padding:5px 9px;border-radius:7px;cursor:pointer";

    removeButton.addEventListener("click", () => {
      history = history.filter((item) => item.id !== record.id);
      saveHistoryToStorage();
      renderHistory();
    });

    actions.appendChild(removeButton);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function formatHistoryDate(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function clearHistory() {
  if (history.length === 0) return;

  const confirmed = window.confirm(
    "Are you sure you want to delete all your decision history?"
  );

  if (!confirmed) return;

  const previousHistory = history;
  history = [];

  if (!saveHistoryToStorage()) {
    history = previousHistory;
  }

  renderHistory();
}

/* STATUS MESSAGES */

function showPickerMessage(message) {
  const result = document.getElementById("pick-result");
  if (result) result.textContent = message;
}

function showPlaceMessage(message) {
  const status = document.getElementById("place-status");
  if (status) status.textContent = message;
}
