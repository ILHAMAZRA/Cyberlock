/**
 * ============================================================================
 * SECURE ACCESS SYSTEM - CONTRÔLE D'ACCÈS IOT EN DIRECT
 * Intégration ThingSpeak REST API en temps réel
 * Palette : Catppuccin Mocha
 * Mention obligatoire : Created By Ilham Azra
 * ============================================================================
 */

// ============================================================================
// 1. CONFIGURATION DU CANAL THINGSPEAK (SAUVEGARDÉE DANS LOCALSTORAGE)
// ============================================================================
// Les identifiants sont saisis par l'utilisateur via le bouton "Config ThingSpeak"
// et stockés localement dans son navigateur (localStorage), sans exposer de clé dans le code.
const DEFAULT_CHANNEL_ID = '';
const DEFAULT_READ_KEY   = '';
const POLL_INTERVAL_SECONDS = 15; // Cycle de synchronisation ThingSpeak (15 secondes)

// Variables pour le compte à rebours et l'état de récupération
let countdownSeconds = POLL_INTERVAL_SECONDS;
let countdownTimer = null;
let isFetching = false;

// Mappage des champs télémétriques de l'ESP32
const FIELD_STATUS = 'field1'; // 1 = Autorisé, 0 = Refusé
const FIELD_FAILED = 'field2'; // Nombre de tentatives échouées
const FIELD_LOCK   = 'field3'; // 1 = Verrouillé (Relais actif), 0 = Déverrouillé

// Palettes pour Chart.js selon le thème sélectionné
const THEME_PALETTES = {
  'cyber-lime': {
    green: '#b4f000',
    greenFill: 'rgba(180, 240, 0, 0.15)',
    red: '#ff4d4d',
    redFill: 'rgba(255, 77, 77, 0.15)',
    mauve: '#e5ff00',
    text: '#ffffff',
    surface0: '#262626',
    grid: 'rgba(163, 163, 163, 0.2)'
  },
  'matrix': {
    green: '#00ff00',
    greenFill: 'rgba(0, 255, 0, 0.18)',
    red: '#ff3355',
    redFill: 'rgba(255, 51, 85, 0.18)',
    mauve: '#00ff00',
    text: '#b6ffb6',
    surface0: '#003b00',
    grid: 'rgba(0, 143, 0, 0.3)'
  },
  'mocha': {
    green: '#a6e3a1',
    greenFill: 'rgba(166, 227, 161, 0.15)',
    red: '#f38ba8',
    redFill: 'rgba(243, 139, 168, 0.15)',
    mauve: '#cba6f7',
    text: '#cdd6f4',
    surface0: '#313244',
    grid: 'rgba(69, 71, 90, 0.4)'
  }
};

/**
 * Fonctions de stockage sécurisées
 */
function safeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) {}
}

let currentTheme = safeGet('cyberlock_theme') || 'cyber-lime';

/**
 * Applique le thème de couleurs sélectionné à la page et aux graphiques
 */
function applyTheme(themeName) {
  if (!THEME_PALETTES[themeName]) themeName = 'cyber-lime';
  currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  safeSet('cyberlock_theme', themeName);

  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect && themeSelect.value !== themeName) {
    themeSelect.value = themeName;
  }

  const pal = THEME_PALETTES[themeName];
  if (timelineChart) {
    try {
      timelineChart.data.datasets[0].borderColor = pal.green;
      timelineChart.data.datasets[0].backgroundColor = pal.greenFill;
      timelineChart.data.datasets[1].borderColor = pal.red;
      timelineChart.data.datasets[1].backgroundColor = pal.redFill;
      if (timelineChart.options.scales && timelineChart.options.scales.x) {
        timelineChart.options.scales.x.ticks.color = pal.text;
        timelineChart.options.scales.x.grid.color = pal.grid;
      }
      if (timelineChart.options.scales && timelineChart.options.scales.y) {
        timelineChart.options.scales.y.ticks.color = pal.text;
        timelineChart.options.scales.y.grid.color = pal.grid;
      }
      if (timelineChart.options.plugins && timelineChart.options.plugins.legend) {
        timelineChart.options.plugins.legend.labels.color = pal.text;
      }
      timelineChart.update();
    } catch (e) {}
  }

  if (ratioChart) {
    try {
      ratioChart.data.datasets[0].backgroundColor = [pal.green, pal.red];
      ratioChart.data.datasets[0].borderColor = pal.surface0;
      if (ratioChart.options.plugins && ratioChart.options.plugins.legend) {
        ratioChart.options.plugins.legend.labels.color = pal.text;
      }
      ratioChart.update();
    } catch (e) {}
  }
}

/**
 * Nettoie et extrait le Channel ID et la clé API
 * Accepte un ID simple ou une URL complète ThingSpeak
 */
function parseThingSpeakInput(channelInput, keyInput) {
  let channelId = (channelInput || '').trim();
  let apiKey = (keyInput || '').trim();

  if (channelId.includes('thingspeak.com')) {
    const matchId = channelId.match(/channels\/(\d+)/i);
    if (matchId && matchId[1]) {
      const matchKey = channelId.match(/[?&]api_key=([a-zA-Z0-9_-]+)/i);
      if (matchKey && matchKey[1] && !apiKey) {
        apiKey = matchKey[1];
      }
      channelId = matchId[1];
    }
  }

  if (apiKey.includes('api_key=')) {
    const matchKey = apiKey.match(/api_key=([a-zA-Z0-9_-]+)/i);
    if (matchKey && matchKey[1]) {
      apiKey = matchKey[1];
    }
  }

  return { channelId, apiKey };
}

// Initialisation des identifiants (récupérés depuis le stockage local sécurisé du navigateur)
const savedChannel = safeGet('ts_channel_id');
const savedKey = safeGet('ts_read_key');

const sanitized = parseThingSpeakInput(savedChannel || '', savedKey || '');

let THINGSPEAK_CHANNEL_ID = sanitized.channelId;
let THINGSPEAK_READ_API_KEY = sanitized.apiKey;

if (THINGSPEAK_CHANNEL_ID) {
  safeSet('ts_channel_id', THINGSPEAK_CHANNEL_ID);
}
if (THINGSPEAK_READ_API_KEY) {
  safeSet('ts_read_key', THINGSPEAK_READ_API_KEY);
}

// Variables globales d'état
let timelineChart = null;
let ratioChart = null;
let currentFeeds = [];
let pollTimer = null;
let activeFilter = 'all';
let alertAcknowledged = false;
let clearedUntilEntryId = parseInt(safeGet('cleared_until_entry') || '0', 10);

// ============================================================================
// 2. INITIALISATION DES GRAPHIQUES (CHART.JS)
// ============================================================================
function initCharts() {
  if (typeof Chart === 'undefined') {
    console.warn("Chart.js n'a pas pu être chargé depuis le CDN.");
    return;
  }

  try {
    const pal = THEME_PALETTES[currentTheme] || THEME_PALETTES['cyber-lime'];
    const canvasTimeline = document.getElementById('timelineChart');
    if (canvasTimeline) {
      const ctxTimeline = canvasTimeline.getContext('2d');
      timelineChart = new Chart(ctxTimeline, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Autorisés',
              data: [],
              borderColor: pal.green,
              backgroundColor: pal.greenFill,
              fill: true,
              tension: 0.3
            },
            {
              label: 'Refusés',
              data: [],
              borderColor: pal.red,
              backgroundColor: pal.redFill,
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: pal.text, boxWidth: 12 } }
          },
          scales: {
            x: { ticks: { color: pal.text, font: { size: 10 } }, grid: { color: pal.grid } },
            y: { ticks: { color: pal.text, stepSize: 1 }, grid: { color: pal.grid }, beginAtZero: true }
          }
        }
      });
    }

    const canvasRatio = document.getElementById('ratioChart');
    if (canvasRatio) {
      const ctxRatio = canvasRatio.getContext('2d');
      ratioChart = new Chart(ctxRatio, {
        type: 'doughnut',
        data: {
          labels: ['Autorisés', 'Refusés'],
          datasets: [{
            data: [0, 0],
            backgroundColor: [pal.green, pal.red],
            borderColor: pal.surface0,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: pal.text, boxWidth: 12 } }
          }
        }
      });
    }
  } catch (err) {
    console.warn("Erreur lors de l'initialisation des graphiques :", err);
  }
}

// ============================================================================
// 3. RÉCUPÉRATION DES DONNÉES EN DIRECT DEPUIS THINGSPEAK
// ============================================================================
async function fetchData() {
  if (isFetching) return;

  // Si aucun canal n'est configuré dans le navigateur, inviter l'utilisateur à le configurer
  if (!THINGSPEAK_CHANNEL_ID) {
    const elSource = document.getElementById('detailSourceMode');
    if (elSource) elSource.textContent = "Non configuré (cliquez sur Config ThingSpeak)";
    setESP32Status(false);
    updateTable([]);
    return;
  }

  isFetching = true;

  let url = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?results=30`;
  if (THINGSPEAK_READ_API_KEY) {
    url += `&api_key=${THINGSPEAK_READ_API_KEY}`;
  }
  url += `&_=${Date.now()}`; // Évite tout cache navigateur

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    let feeds = [];
    if (data && Array.isArray(data.feeds)) {
      feeds = data.feeds;
    } else if (data && data.entry_id) {
      feeds = [data];
    }

    if (feeds.length > 0) {
      currentFeeds = feeds;
      updateUI(currentFeeds);
      setESP32Status(true);
    } else {
      // Secours : interroger directement feeds/last.json si feeds.json est vide
      const lastUrl = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds/last.json?api_key=${THINGSPEAK_READ_API_KEY}&_=${Date.now()}`;
      const lastRes = await fetch(lastUrl, { cache: 'no-store' });
      if (lastRes.ok) {
        const lastEntry = await lastRes.json();
        if (lastEntry && lastEntry.entry_id) {
          currentFeeds = [lastEntry];
          updateUI(currentFeeds);
          setESP32Status(true);
          return;
        }
      }
      updateUI([]);
      setESP32Status(true);
    }
  } catch (error) {
    console.warn("Erreur de connexion ThingSpeak Live :", error);
    setESP32Status(false);
    const now = new Date();
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl) lastUpdateEl.textContent = now.toLocaleTimeString('fr-FR');
  } finally {
    isFetching = false;
  }
}

// ============================================================================
// 4. MISE À JOUR DE L'INTERFACE UTILISATEUR EN DIRECT
// ============================================================================
function updateUI(feeds) {
  let total = 0;
  let granted = 0;
  let denied = 0;
  let failedPins = 0;

  feeds.forEach(f => {
    if (!f) return;
    // Ignorer les pings où tous les champs sont nuls
    if (f[FIELD_STATUS] === null && f[FIELD_FAILED] === null && f[FIELD_LOCK] === null) {
      return;
    }
    total++;
    const rawStatus = f[FIELD_STATUS];
    const failed = parseInt(f[FIELD_FAILED], 10) || 0;
    failedPins += failed;

    if (rawStatus === '1' || rawStatus === 1) {
      granted++;
    } else if (rawStatus === '0' || rawStatus === 0) {
      denied++;
    }
  });

  // 1. Cartes de statistiques en direct
  const elTotal = document.getElementById('statTotal');
  const elGranted = document.getElementById('statGranted');
  const elDenied = document.getElementById('statDenied');
  const elFailed = document.getElementById('statFailed');

  if (elTotal) elTotal.textContent = total;
  if (elGranted) elGranted.textContent = granted;
  if (elDenied) elDenied.textContent = denied;
  if (elFailed) elFailed.textContent = failedPins;

  const grantedPct = total > 0 ? Math.round((granted / total) * 100) : 0;
  const deniedPct = total > 0 ? Math.round((denied / total) * 100) : 0;

  const elGrantedRate = document.getElementById('statGrantedRate');
  const elDeniedRate = document.getElementById('statDeniedRate');
  if (elGrantedRate) elGrantedRate.textContent = `${grantedPct}% de réussite`;
  if (elDeniedRate) elDeniedRate.textContent = `${deniedPct}% de rejets`;

  // 2. État du matériel ESP32 & serrure (Dernière télémétrie reçue)
  const validFeeds = feeds.filter(f => f && (f[FIELD_STATUS] !== null || f[FIELD_FAILED] !== null || f[FIELD_LOCK] !== null));
  const latest = validFeeds.length > 0 ? validFeeds[validFeeds.length - 1] : (feeds[feeds.length - 1] || {});

  const lockVal = parseInt(latest[FIELD_LOCK], 10);
  const isLocked = isNaN(lockVal) ? true : lockVal !== 0; // 1 = Verrouillé, 0 = Déverrouillé
  const lastFailed = parseInt(latest[FIELD_FAILED], 10) || 0;

  updateLockDisplay(isLocked);
  updateLockdownAlert(lastFailed, latest);

  const elDetailFailed = document.getElementById('detailFailedCount');
  const elDetailLock = document.getElementById('detailLockField');
  const elDetailSource = document.getElementById('detailSourceMode');

  if (elDetailFailed) elDetailFailed.textContent = `${lastFailed} échec(s)`;
  if (elDetailLock) elDetailLock.textContent = `${isLocked ? '1 (Verrouillé)' : '0 (Déverrouillé)'}`;
  if (elDetailSource) elDetailSource.textContent = `ThingSpeak Live #${THINGSPEAK_CHANNEL_ID}`;

  // Horodatage de la dernière réception
  const now = new Date();
  const lastUpdateEl = document.getElementById('lastUpdate');
  if (lastUpdateEl) lastUpdateEl.textContent = now.toLocaleTimeString('fr-FR');

  // 3. Graphiques en direct
  updateCharts(feeds, granted, denied);

  // 4. Tableau d'historique en direct
  updateTable(feeds);

  // Icônes Lucide
  if (window.lucide) {
    try { window.lucide.createIcons(); } catch (e) {}
  }
}

// Gestion de l'alerte de sécurité Lockdown (DEFCON 3)
function updateLockdownAlert(failedCount, latestFeed) {
  const banner = document.getElementById('lockdownBanner');
  const title = document.getElementById('lockdownTitle');
  const desc = document.getElementById('lockdownDesc');

  if (!banner) return;

  // Si l'accès vient d'être accordé (field1 === 1), l'alerte est automatiquement levée
  if (latestFeed && (latestFeed[FIELD_STATUS] === '1' || latestFeed[FIELD_STATUS] === 1)) {
    alertAcknowledged = false;
    banner.style.display = 'none';
    return;
  }

  // Seuil d'alerte : à partir de 2 échecs on prévient, à >= 3 c'est DEFCON 3 Verrouillage
  if (failedCount >= 2 && !alertAcknowledged) {
    banner.style.display = 'flex';
    if (failedCount >= 3) {
      title.textContent = `🚨 ALERTE CRITIQUE DEFCON 3 • ${failedCount} ÉCHECS CONSECUTIFS • SERRURE BLOQUÉE`;
      desc.textContent = `Alerte sécurité maximale déclenchée par l'ESP32. La serrure est maintenue verrouillée par sécurité.`;
    } else {
      title.textContent = `⚠️ AVERTISSEMENT SÉCURITÉ • ${failedCount} ÉCHECS DÉTECTÉS`;
      desc.textContent = `Tentatives de code PIN invalides détectées. Le seuil de verrouillage est fixé à 3 échecs.`;
    }
  } else {
    banner.style.display = 'none';
  }
}

// Affichage visuel de la serrure physique
function updateLockDisplay(isLocked) {
  const lockBox = document.getElementById('lockBox');
  const label = document.getElementById('lockStateLabel');
  const sub = document.getElementById('lockStateSub');
  const icon = document.getElementById('lockIcon');

  if (!lockBox || !label || !sub || !icon) return;

  if (isLocked) {
    lockBox.classList.remove('unlocked');
    label.textContent = 'VERROUILLÉ';
    sub.textContent = 'Relais GPIO 18 actif (Serrure fermée)';
    icon.setAttribute('data-lucide', 'lock');
  } else {
    lockBox.classList.add('unlocked');
    label.textContent = 'DÉVERROUILLÉ';
    sub.textContent = 'Relais GPIO 18 inactif (Accès libre / Déverrouillé)';
    icon.setAttribute('data-lucide', 'unlock');
  }
}

// État de connexion ESP32
function setESP32Status(isOnline) {
  const dot = document.getElementById('esp32Dot');
  const statusText = document.getElementById('esp32Status');
  const detail = document.getElementById('detailEsp32');

  if (!dot || !statusText || !detail) return;

  if (isOnline) {
    dot.className = 'status-dot online';
    statusText.textContent = 'EN LIGNE';
    detail.textContent = 'Actif (Connecté en direct)';
    detail.className = 'detail-value text-green';
  } else {
    dot.className = 'status-dot offline';
    statusText.textContent = 'HORS LIGNE';
    detail.textContent = 'Déconnecté / Erreur ThingSpeak';
    detail.className = 'detail-value text-red';
  }
}

// Mise à jour des graphiques Chart.js
function updateCharts(feeds, granted, denied) {
  if (ratioChart) {
    try {
      ratioChart.data.datasets[0].data = [granted, denied];
      ratioChart.update();
    } catch (e) {}
  }

  if (timelineChart) {
    try {
      const recent = feeds.slice(-10);
      const labels = recent.map((f, i) => {
        const d = new Date(f.created_at);
        return !isNaN(d.getTime()) ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : `#${i + 1}`;
      });
      const grantedData = recent.map(f => (f && (f[FIELD_STATUS] === '1' || f[FIELD_STATUS] === 1)) ? 1 : 0);
      const deniedData = recent.map(f => (f && (f[FIELD_STATUS] === '0' || f[FIELD_STATUS] === 0)) ? 1 : 0);

      timelineChart.data.labels = labels;
      timelineChart.data.datasets[0].data = grantedData;
      timelineChart.data.datasets[1].data = deniedData;
      timelineChart.update();
    } catch (e) {}
  }
}

// Tableau d'activité en temps réel avec support du filtre et de l'effacement
function updateTable(feeds) {
  const tbody = document.getElementById('activityTableBody');
  const badgeCount = document.getElementById('eventCountBadge');
  if (!tbody) return;
  tbody.innerHTML = '';

  // 1. Filtrer les entrées effacées manuellement par l'utilisateur
  let visibleFeeds = feeds.filter(f => f && (!f.entry_id || f.entry_id > clearedUntilEntryId));

  // 2. Appliquer les pilules de filtre (Tous / Autorisés / Refusés / Alertes >= 2)
  if (activeFilter === 'granted') {
    visibleFeeds = visibleFeeds.filter(f => f[FIELD_STATUS] === '1' || f[FIELD_STATUS] === 1);
  } else if (activeFilter === 'denied') {
    visibleFeeds = visibleFeeds.filter(f => f[FIELD_STATUS] === '0' || f[FIELD_STATUS] === 0);
  } else if (activeFilter === 'alerts') {
    visibleFeeds = visibleFeeds.filter(f => (parseInt(f[FIELD_FAILED], 10) || 0) >= 2);
  }

  const reversed = [...visibleFeeds].reverse();
  if (badgeCount) badgeCount.textContent = `${reversed.length} événements`;

  if (reversed.length === 0) {
    const tr = document.createElement('tr');
    const msg = clearedUntilEntryId > 0 && feeds.length > 0
      ? "Historique effacé du tableau de bord. En attente de nouveaux événements..."
      : "En attente des premiers événements de l'ESP32...";
    tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--subtext); padding: 2rem;">${msg}</td>`;
    tbody.appendChild(tr);
    return;
  }

  reversed.forEach(feed => {
    if (!feed) return;
    const rawStatus = feed[FIELD_STATUS];
    const isGranted = rawStatus === '1' || rawStatus === 1;
    const isDenied = rawStatus === '0' || rawStatus === 0;
    const failed = parseInt(feed[FIELD_FAILED], 10) || 0;
    const lockVal = parseInt(feed[FIELD_LOCK], 10);
    const isLocked = isNaN(lockVal) ? true : lockVal !== 0;

    const date = new Date(feed.created_at);
    const timeFormatted = !isNaN(date.getTime()) ? date.toLocaleTimeString('fr-FR') : '--:--';

    let statusPillHtml = '';
    let detailText = feed.detail;

    if (isGranted) {
      statusPillHtml = '<span class="status-pill granted">AUTORISÉ</span>';
      if (!detailText) detailText = 'Accès badge RFID validé (Relais ouvert)';
    } else if (isDenied) {
      statusPillHtml = '<span class="status-pill denied">REFUSÉ</span>';
      if (!detailText) {
        detailText = (failed >= 3) ? 'Alerte sécurité : Tentatives maximales atteintes' : 'Code PIN / Badge non reconnu';
      }
    } else {
      statusPillHtml = '<span class="status-pill" style="background: rgba(166, 173, 200, 0.15); color: var(--subtext); border: 1px solid rgba(166, 173, 200, 0.3);">PING</span>';
      if (!detailText) detailText = 'Télémétrie brute reçue de l\'ESP32';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-mono text-mauve">#${feed.entry_id}</td>
      <td class="font-mono">${timeFormatted}</td>
      <td>${statusPillHtml}</td>
      <td>${failed > 0 ? `${failed} échec(s)` : (isDenied ? '1re tentative' : '0')}</td>
      <td class="${isLocked ? 'text-red' : 'text-green'}">${isLocked ? 'Verrouillé' : 'Déverrouillé'}</td>
      <td>${detailText}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Fonction d'exportation au format CSV
function exportLogsToCsv() {
  if (!currentFeeds || currentFeeds.length === 0) {
    alert("Aucune donnée télémétrique à exporter.");
    return;
  }

  const visibleFeeds = currentFeeds.filter(f => f && (!f.entry_id || f.entry_id > clearedUntilEntryId));
  if (visibleFeeds.length === 0) {
    alert("L'historique actuel est vide ou a été effacé.");
    return;
  }

  const headers = ['ID', 'Horodatage_ISO', 'Horodatage_Local', 'Statut_Acces', 'Tentatives_Echouees', 'Etat_Serrure', 'Details'];
  const rows = visibleFeeds.map(feed => {
    const rawStatus = feed[FIELD_STATUS];
    const isGranted = rawStatus === '1' || rawStatus === 1;
    const isDenied = rawStatus === '0' || rawStatus === 0;
    const failed = parseInt(feed[FIELD_FAILED], 10) || 0;
    const lockVal = parseInt(feed[FIELD_LOCK], 10);
    const isLocked = isNaN(lockVal) ? true : lockVal !== 0;
    const date = new Date(feed.created_at);

    const statusText = isGranted ? 'AUTORISE' : (isDenied ? 'REFUSE' : 'PING');
    const lockText = isLocked ? 'VERROUILLE' : 'DEVERROUILLE';
    const detail = feed.detail || (isGranted ? 'Badge RFID valide' : (failed >= 3 ? 'Alerte tentatives max' : 'Code PIN rejete'));

    return [
      feed.entry_id,
      feed.created_at,
      date.toLocaleString('fr-FR'),
      statusText,
      failed,
      lockText,
      `"${detail.replace(/"/g, '""')}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `CyberLock_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Fonction pour effacer les logs du tableau de bord
function clearDashboardLogs() {
  if (currentFeeds.length === 0) return;
  const lastFeed = currentFeeds[currentFeeds.length - 1];
  if (lastFeed && lastFeed.entry_id) {
    clearedUntilEntryId = lastFeed.entry_id;
    safeSet('cleared_until_entry', clearedUntilEntryId.toString());
    updateTable(currentFeeds);
  }
}

// ============================================================================
// 5. GESTION DU COMPTE À REBOURS ET DE LA SYNCHRONISATION
// ============================================================================
function updateCountdownUI() {
  const elCountdown = document.getElementById('pollCountdown');
  const elBar = document.getElementById('countdownBar');

  if (elCountdown) {
    elCountdown.textContent = `${countdownSeconds}s`;
  }
  if (elBar) {
    const pct = Math.max(0, Math.min(100, (countdownSeconds / POLL_INTERVAL_SECONDS) * 100));
    elBar.style.width = `${pct}%`;
  }
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownSeconds = POLL_INTERVAL_SECONDS;
  updateCountdownUI();

  countdownTimer = setInterval(async () => {
    countdownSeconds--;
    if (countdownSeconds <= 0) {
      // Reached zero: reset countdown and fetch fresh live telemetry
      countdownSeconds = POLL_INTERVAL_SECONDS;
      updateCountdownUI();
      if (!isFetching) {
        await fetchData();
      }
    } else {
      updateCountdownUI();
    }
  }, 1000);
}

function resetCountdown() {
  startCountdown();
}

// ============================================================================
// 6. GESTION DES ÉVÉNEMENTS UTILISATEUR
// ============================================================================
// Panneau de configuration
const btnToggleConfig = document.getElementById('btnToggleConfig');
const configPanel = document.getElementById('configPanel');
const inputChannelId = document.getElementById('inputChannelId');
const inputReadKey = document.getElementById('inputReadKey');

if (inputChannelId && inputReadKey) {
  inputChannelId.value = THINGSPEAK_CHANNEL_ID;
  inputReadKey.value = THINGSPEAK_READ_API_KEY;
}

if (btnToggleConfig && configPanel) {
  btnToggleConfig.addEventListener('click', () => {
    const isHidden = configPanel.style.display === 'none';
    configPanel.style.display = isHidden ? 'flex' : 'none';
  });
}

// Enregistrer les nouveaux identifiants
const btnSaveConfig = document.getElementById('btnSaveConfig');
if (btnSaveConfig) {
  btnSaveConfig.addEventListener('click', async () => {
    const parsed = parseThingSpeakInput(inputChannelId.value, inputReadKey.value);
    THINGSPEAK_CHANNEL_ID = parsed.channelId || DEFAULT_CHANNEL_ID;
    THINGSPEAK_READ_API_KEY = parsed.apiKey || DEFAULT_READ_KEY;

    inputChannelId.value = THINGSPEAK_CHANNEL_ID;
    inputReadKey.value = THINGSPEAK_READ_API_KEY;

    safeSet('ts_channel_id', THINGSPEAK_CHANNEL_ID);
    safeSet('ts_read_key', THINGSPEAK_READ_API_KEY);

    if (configPanel) configPanel.style.display = 'none';
    currentFeeds = [];
    await fetchData();
    resetCountdown();
  });
}

// Bouton : Actualisation manuelle immédiate
const btnRefresh = document.getElementById('btnRefresh');
const refreshLabel = document.getElementById('refreshLabel');

if (btnRefresh) {
  btnRefresh.addEventListener('click', async () => {
    if (btnRefresh.classList.contains('refreshing')) return;

    btnRefresh.classList.add('refreshing');
    btnRefresh.disabled = true;
    if (refreshLabel) refreshLabel.textContent = 'Actualisation...';

    try {
      await fetchData();
    } catch (err) {
      console.error('Erreur lors du rafraîchissement manuel :', err);
    } finally {
      resetCountdown();
      setTimeout(() => {
        btnRefresh.classList.remove('refreshing');
        btnRefresh.disabled = false;
        if (refreshLabel) refreshLabel.textContent = 'Actualiser';
      }, 400);
    }
  });
}

// Bouton : Acquitter l'alerte DEFCON 3
const btnAcknowledgeAlert = document.getElementById('btnAcknowledgeAlert');
if (btnAcknowledgeAlert) {
  btnAcknowledgeAlert.addEventListener('click', () => {
    alertAcknowledged = true;
    const banner = document.getElementById('lockdownBanner');
    if (banner) banner.style.display = 'none';
  });
}

// Bouton : Exporter CSV
const btnExportCsv = document.getElementById('btnExportCsv');
if (btnExportCsv) {
  btnExportCsv.addEventListener('click', exportLogsToCsv);
}

// Bouton : Effacer l'affichage des logs
const btnClearLogs = document.getElementById('btnClearLogs');
if (btnClearLogs) {
  btnClearLogs.addEventListener('click', () => {
    if (confirm("Voulez-vous effacer l'historique affiché sur le tableau de bord ?\n(Les données distantes sur ThingSpeak restent conservées)")) {
      clearDashboardLogs();
    }
  });
}

// Boutons de filtres d'activité
const filterPills = document.querySelectorAll('.filter-pill');
filterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    filterPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter') || 'all';
    updateTable(currentFeeds);
  });
});

// ============================================================================
// 7. DÉMARRAGE IMMÉDIAT AU CHARGEMENT DE LA PAGE
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Appliquer le thème actif
  applyTheme(currentTheme);

  // 2. Initialiser les graphiques
  initCharts();
  applyTheme(currentTheme);

  // 3. Récupérer les données ThingSpeak Live & lancer le compte à rebours
  fetchData();
  startCountdown();

  // 4. Écouteur pour le changement de thème
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.value = currentTheme;
    themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }
});
