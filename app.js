const GEOAPIFY_KEY = "97e9e59dbe844bafa3cd7de9246a0dbf";
const STORAGE = "vacation_countdown_final";

const $ = (id) => document.getElementById(id);

const placeEl = $("place");
const dateLine = $("dateLine");
const daysNum  = $("daysNum");
const timeDate = $("timeDate");
const timeClock= $("timeClock");

const mapThumb = $("mapThumb");
const mapImg   = $("mapImg");
const mapBackdrop = $("mapBackdrop");
const mapClose = $("mapClose");
const mapEmbed = $("mapEmbed");

const modalBackdrop = $("modalBackdrop");
const btnSave = $("btnSave");
const btnCloseAdmin = $("btnCloseAdmin");
const msg = $("msg");

const inpLocation = $("location");
const inpDepart   = $("depart");
const inpRadius   = $("radius");
const titleTap    = $("titleTap");

const wxRow = $("wxRow");

const DEFAULT = {
  location: "Nederland, Assen",
  depart: null,      // yyyy-mm-dd
  radius: 25,
  center: null,      // {lat, lon}
  timeZoneId: null   // IANA, bv "America/Curacao"
};

function load(){
  try { return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(STORAGE)) || {}) }; }
  catch { return { ...DEFAULT }; }
}
function save(d){ localStorage.setItem(STORAGE, JSON.stringify(d)); }

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
 * Belangrijk: als timeZoneId ontbreekt, tonen we NIET jouw lokale tijd,
 * maar placeholders. Zo zie je meteen dat TZ nog niet is opgehaald.
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

  // Debug (tijdelijk laten staan om zeker te zijn)
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
 * Fix: marker kleur met '#' wordt door URLSearchParams correct ge-encoded.
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
  url.searchParams.set("_ts", String(Date.now()));
  return url.toString();
}

function updateMap(d){
  const z = zoomFromRadius(d.radius);

  mapEmbed.src = buildGoogle(d.location, z);

  mapImg.onerror = null;
  mapImg.src = svgPlaceholder("Kaart", "Tik voor kaart");

  if(!GEOAPIFY_KEY) return;
  if(!d.center || !Number.isFinite(d.center.lat) || !Number.isFinite(d.center.lon)) return;

  const staticUrl = buildStatic(d.center.lat, d.center.lon, z);
  mapImg.onerror = () => {
    mapImg.src = svgPlaceholder("Kaart laden mislukt", "Tik voor fullscreen");
  };
  mapImg.src = staticUrl;
}

// demo forecast (later echte API)
function renderForecast(){
  const icons = ["☀️","🌤️","🌦️","☀️","🌤️"];
  const temps = [29,29,28,30,30];

  wxRow.innerHTML = "";
  for(let i=0;i<5;i++){
    const d = new Date(Date.now() + i*86400000);
    const day = new Intl.DateTimeFormat("nl-NL", { weekday:"short" })
      .format(d).replace(/\./g,"").toLowerCase();

    const item = document.createElement("div");
    item.className = "wxItem";
    item.innerHTML = `
      <div class="wx-day">${day}</div>
      <div class="wx-ico">${icons[i]}</div>
      <div class="wx-temp">${temps[i]}°</div>
    `;
    wxRow.appendChild(item);
  }
}

/**
 * Cruciaal: we garanderen dat center + timeZoneId er komen.
 * Als TZ faalt (quota/CORS), herproberen we later.
 */
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

function updateUI(state){
  placeEl.textContent = state.location || "—";
  updateCountdown(state.depart);
  updateTime(state.timeZoneId);     // <-- NOOIT meer lokaal fallback
  updateMap(state);
  renderForecast();

  inpLocation.value = state.location || "";
  inpDepart.value = state.depart || "";
  inpRadius.value = state.radius || 25;
}

// ====== STATE (niet elke seconde load() doen) ======
let STATE = load();

btnSave.onclick = async () => {
  STATE.location = inpLocation.value.trim();
  STATE.depart   = inpDepart.value || null;
  STATE.radius   = +inpRadius.value || 25;

  msg.textContent = "Opslaan…";

  // reset zodat nieuwe locatie altijd opnieuw bepaalt
  STATE.center = null;
  STATE.timeZoneId = null;

  await ensureGeoAndTZ(STATE);
  updateUI(STATE);

  msg.textContent = "Opgeslagen";
};

btnCloseAdmin.onclick = () => { modalBackdrop.style.display = "none"; };
mapThumb.onclick = () => { mapBackdrop.style.display = "block"; };
mapClose.onclick = () => { mapBackdrop.style.display = "none"; };
mapBackdrop.onclick = (e) => { if(e.target === mapBackdrop) mapBackdrop.style.display = "none"; };

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

(async function init(){
  STATE = await ensureGeoAndTZ(STATE);
  updateUI(STATE);

  // Live updates: TZ blijft uit STATE komen
  setInterval(()=>updateTime(STATE.timeZoneId), 1000);
  setInterval(()=>updateCountdown(STATE.depart), 1000);

  // Als timezone ooit null blijft (API faalde): elke 60s opnieuw proberen
  setInterval(async ()=>{
    if(STATE.center && !STATE.timeZoneId){
      STATE.timeZoneId = await fetchTimeZone(STATE.center.lat, STATE.center.lon);
      save(STATE);
      updateTime(STATE.timeZoneId);
    }
  }, 60000);
})();
