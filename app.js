const GEOAPIFY_KEY = "97e9e59dbe844bafa3cd7de9246a0dbf";
const STORAGE = "vacation_countdown_final";

const $ = (id) => document.getElementById(id);

// UI refs
const placeEl   = $("place");
const dateLine  = $("dateLine");
const daysNum   = $("daysNum");
const timeDate  = $("timeDate");
const timeClock = $("timeClock");

const mapThumb    = $("mapThumb");
const mapImg      = $("mapImg");
const mapBackdrop = $("mapBackdrop");
const mapClose    = $("mapClose");
const mapEmbed    = $("mapEmbed");

const modalBackdrop  = $("modalBackdrop");
const btnSave        = $("btnSave");
const btnCloseAdmin  = $("btnCloseAdmin");
const msg            = $("msg");

const inpLocation = $("location");
const inpDepart   = $("depart");
const inpRadius   = $("radius");
const titleTap    = $("titleTap");

const wxRow = $("wxRow");

// Default state
const DEFAULT = {
  location: "Nederland, Assen",
  depart: null,      // yyyy-mm-dd
  radius: 25,
  center: null,      // {lat, lon}
  timeZoneId: null   // IANA (uit Geoapify reverse geocode)
};

function load(){
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(STORAGE)) || {}) };
  } catch {
    return { ...DEFAULT };
  }
}
function save(d){ localStorage.setItem(STORAGE, JSON.stringify(d)); }

// ---------- helpers ----------
function euDate(iso){
  if(!iso) return "—";
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function updateCountdown(dep){
  if(!dep){
    dateLine.textContent = "Vertrekdatum: —";
    daysNum.textContent = "0";
    return;
  }
  dateLine.textContent = "Vertrekdatum: " + euDate(dep);
  const t = new Date(dep + "T00:00:00").getTime() - Date.now();
  daysNum.textContent = String(Math.max(0, Math.floor(t / 86400000)));
}

/**
 * Als timeZoneId ontbreekt: NIET jouw lokale tijd tonen.
 */
function updateTime(timeZoneId){
  if(!timeZoneId){
    timeDate.textContent = "—";
    timeClock.textContent = "—:—";
    return;
  }

  const now = new Date();
  timeDate.textContent = new Intl.DateTimeFormat("nl-NL", {
    weekday:"short", day:"2-digit", month:"short", timeZone: timeZoneId
  }).format(now).replace(/\./g,"");

  timeClock.textContent = new Intl.DateTimeFormat("nl-NL", {
    hour:"2-digit", minute:"2-digit", hour12:false, timeZone: timeZoneId
  }).format(now);
}

async function geocode(q){
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
    { headers: { "Accept": "application/json" } }
  );
  const j = await r.json();
  if(!j[0]) return null;
  return { lat: +j[0].lat, lon: +j[0].lon };
}

/**
 * Geoapify reverse geocode → timezone name zit in results[0].timezone.name
 */
async function fetchTimeZone(lat, lon){
  const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", GEOAPIFY_KEY);

  const res = await fetch(url.toString());
  if(!res.ok) return null;

  const json = await res.json();
  const tz = json?.results?.[0]?.timezone?.name || null;
  console.log("Geoapify timezone:", tz);
  return tz;
}

function zoomFromRadius(r){
  if(r <= 5) return 13;
  if(r <= 10) return 12;
  if(r <= 25) return 11;
  return 10;
}

function buildGoogle(q, z){
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${z}&output=embed`;
}

function svgPlaceholder(textTop="Kaart", textBottom="Tik voor kaart"){
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="520" height="320">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="rgba(0,90,180,.55)"/>
          <stop offset="1" stop-color="rgba(0,200,195,.38)"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle"
            fill="rgba(255,255,255,.95)" font-family="system-ui,-apple-system" font-size="18" font-weight="800">
        ${textTop}
      </text>
      <text x="50%" y="62%" dominant-baseline="middle" text-anchor="middle"
            fill="rgba(255,255,255,.85)" font-family="system-ui,-apple-system" font-size="14" font-weight="700">
        ${textBottom}
      </text>
    </svg>
  `);
}

/**
 * Geoapify Static map URL
 * marker kleur met '#' wordt door URLSearchParams correct ge-encoded.
 */
function buildStatic(lat, lon, zoom){
  const url = new URL("https://maps.geoapify.com/v1/staticmap");
  const marker = `lonlat:${lon},${lat};size:48;color:#00c8c3`;

  url.searchParams.set("style", "osm-carto");
  url.searchParams.set("width", "520");
  url.searchParams.set("height", "320");
  url.searchParams.set("center", `lonlat:${lon},${lat}`);
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("marker", marker);
  url.searchParams.set("apiKey", GEOAPIFY_KEY);
  url.searchParams.set("_ts", String(Date.now())); // cache-buster

  return url.toString();
}

function updateMap(state){
  const z = zoomFromRadius(state.radius);

  // Fullscreen (Google embed)
  mapEmbed.src = buildGoogle(state.location, z);

  // Mini-map fallback
  mapImg.onerror = null;
  mapImg.src = svgPlaceholder("Kaart", "Tik voor kaart");

  if(!GEOAPIFY_KEY) return;
  if(!state.center || !Number.isFinite(state.center.lat) || !Number.isFinite(state.center.lon)) return;

  const staticUrl = buildStatic(state.center.lat, state.center.lon, z);

  mapImg.onerror = () => {
    mapImg.src = svgPlaceholder("Kaart laden mislukt", "Tik voor fullscreen");
  };
  mapImg.src = staticUrl;
}

// ---------- WEER (Open-Meteo, geen API key nodig) ----------
async function fetchWeather(lat, lon){
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("daily", "weathercode,temperature_2m_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "5");

  const res = await fetch(url.toString());
  if(!res.ok) throw new Error("Weather fetch failed");
  return await res.json();
}

function weatherEmoji(code){
  if(code === 0) return "☀️";
  if([1,2].includes(code)) return "🌤️";
  if(code === 3) return "☁️";
  if([45,48].includes(code)) return "🌫️";
  if([51,53,55].includes(code)) return "🌦️";
  if([61,63,65].includes(code)) return "🌧️";
  if([71,73,75].includes(code)) return "❄️";
  if([80,81,82].includes(code)) return "🌧️";
  if([95,96,99].includes(code)) return "⛈️";
  return "🌡️";
}

function fmtWeekday(isoDate){
  const d = new Date(isoDate + "T00:00:00");
  return new Intl.DateTimeFormat("nl-NL", { weekday:"short" })
    .format(d).replace(/\./g,"").toLowerCase();
}

function renderWeather(wx){
  if(!wxRow) return;

  const times = wx?.daily?.time || [];
  const tmax  = wx?.daily?.temperature_2m_max || [];
  const codes = wx?.daily?.weathercode || [];

  wxRow.innerHTML = "";

  for(let i=0; i<Math.min(5, times.length); i++){
    const item = document.createElement("div");
    item.className = "wxItem";
    item.innerHTML = `
      <div class="wx-day">${fmtWeekday(times[i])}</div>
      <div class="wx-ico">${weatherEmoji(codes[i])}</div>
      <div class="wx-temp">${Math.round(tmax[i])}°</div>
    `;
    wxRow.appendChild(item);
  }
}

async function updateWeather(center){
  if(!wxRow) return;

  wxRow.innerHTML = `<div class="wxLoading">Weer laden…</div>`;

  if(!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)){
    wxRow.innerHTML = `<div class="wxLoading">Geen locatie</div>`;
    return;
  }

  try{
    const wx = await fetchWeather(center.lat, center.lon);
    renderWeather(wx);
  } catch (e){
    console.error(e);
    wxRow.innerHTML = `<div class="wxLoading">Weer laden mislukt</div>`;
  }
}

// ---------- ensure center + timezone ----------
async function ensureGeoAndTZ(state){
  if(!state.center){
    state.center = await geocode(state.location);
  }
  if(state.center && !state.timeZoneId){
    state.timeZoneId = await fetchTimeZone(state.center.lat, state.center.lon);
  }
  save(state);
  return state;
}

// ---------- UI update ----------
function updateUI(state){
  placeEl.textContent = state.location || "—";
  updateCountdown(state.depart);
  updateTime(state.timeZoneId);
  updateMap(state);

  // inputs (admin)
  inpLocation.value = state.location || "";
  inpDepart.value = state.depart || "";
  inpRadius.value = state.radius || 25;
}

// ---------- STATE ----------
let STATE = load();

// ---------- Events ----------
btnSave.onclick = async () => {
  STATE.location = inpLocation.value.trim();
  STATE.depart   = inpDepart.value || null;
  STATE.radius   = +inpRadius.value || 25;

  msg.textContent = "Opslaan…";

  // reset → altijd opnieuw bepalen bij nieuwe locatie
  STATE.center = null;
  STATE.timeZoneId = null;

  await ensureGeoAndTZ(STATE);
  updateUI(STATE);

  // ✅ Cruciaal: weer updaten bij nieuwe locatie
  await updateWeather(STATE.center);

  msg.textContent = "Opgeslagen";
};

btnCloseAdmin.onclick = () => { modalBackdrop.style.display = "none"; };
mapThumb.onclick = () => { mapBackdrop.style.display = "block"; };
mapClose.onclick = () => { mapBackdrop.style.display = "none"; };
mapBackdrop.onclick = (e) => { if(e.target === mapBackdrop) mapBackdrop.style.display = "none"; };

// Desktop admin open + Escape
document.addEventListener("keydown",(e)=>{
  if(e.shiftKey && e.key === ".") modalBackdrop.style.display = "flex";
  if(e.key === "Escape"){
    modalBackdrop.style.display = "none";
    mapBackdrop.style.display = "none";
  }
});

// iPhone: long-press titel opent admin
let pressTimer;
titleTap.onmousedown = () => { pressTimer = setTimeout(()=>modalBackdrop.style.display="flex", 600); };
titleTap.onmouseup = () => clearTimeout(pressTimer);
titleTap.ontouchstart = titleTap.onmousedown;
titleTap.ontouchend = titleTap.onmouseup;

// ---------- Swipe-down om kaart te sluiten ----------
const mapFull = document.querySelector(".map-full");
let startY = null;
let currentY = null;

mapFull.addEventListener("touchstart", (e) => {
  if(e.touches.length !== 1) return;
  startY = e.touches[0].clientY;
  mapFull.classList.add("dragging");
}, { passive: true });

mapFull.addEventListener("touchmove", (e) => {
  if(startY === null) return;
  currentY = e.touches[0].clientY;
  const deltaY = currentY - startY;

  if(deltaY > 0){
    mapFull.style.transform = `translateY(${deltaY}px)`;
    mapFull.style.opacity = `${1 - deltaY / 300}`;
  }
}, { passive: true });

mapFull.addEventListener("touchend", () => {
  const deltaY = (currentY ?? startY) - startY;

  mapFull.classList.remove("dragging");

  if(deltaY > 120){
    mapBackdrop.style.display = "none";
  }

  mapFull.style.transform = "";
  mapFull.style.opacity = "";

  startY = null;
  currentY = null;
}, { passive: true });

// ---------- Init ----------
(async function init(){
  STATE = await ensureGeoAndTZ(STATE);
  updateUI(STATE);
  await updateWeather(STATE.center);

  // live: tijd + countdown
  setInterval(()=>updateTime(STATE.timeZoneId), 1000);
  setInterval(()=>updateCountdown(STATE.depart), 1000);

  // als timezone ooit null blijft (API faalde): elke 60s opnieuw proberen
  setInterval(async ()=>{
    if(STATE.center && !STATE.timeZoneId){
      STATE.timeZoneId = await fetchTimeZone(STATE.center.lat, STATE.center.lon);
      save(STATE);
      updateTime(STATE.timeZoneId);
    }
  }, 60000);

  // optioneel: weer 1x per uur verversen
  setInterval(async ()=>{
    if(STATE.center){
      await updateWeather(STATE.center);
    }
  }, 3600000);
})();
