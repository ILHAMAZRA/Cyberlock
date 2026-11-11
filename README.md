# Secure Access System - IoT Security Access Control Dashboard

A modern, visually polished IoT Security Access Control Dashboard built using **HTML5**, **CSS3**, and **Vanilla JavaScript**. Designed with the **Catppuccin Mocha** color palette and engineered for direct integration with **ThingSpeak REST API** and **Wokwi ESP32 simulations**.

---

## 🎨 Design & Theme Palettes (Interactive Switcher)

The dashboard includes a real-time theme selector in the header supporting three dynamic themes:

### 1. Cyber Lime (Default)
| Element | Hex Code |
| :--- | :--- |
| **Background (Base)** | `#171717` |
| **Surfaces / Insets** | `#262626` |
| **Cards & Containers** | `#1e1e1e` |
| **Primary Accent (Granted / Neon)** | `#B4F000` |
| **Secondary Accent / Highlight** | `#E5FF00` |
| **Muted Text / Subtext** | `#A3A3A3` |

### 2. Matrix Green (Terminal)
| Element | Hex Code |
| :--- | :--- |
| **Background (Base)** | `#000000` |
| **Surfaces / Insets** | `#002400` |
| **Cards & Containers** | `#003B00` |
| **Borders & Secondary** | `#008F00` |
| **Primary Accent (Neon Matrix)** | `#00FF00` |
| **Text / Highlights** | `#B6FFB6` |

### 3. Catppuccin Mocha
| Element | Hex Code |
| :--- | :--- |
| **Background (Base)** | `#1e1e2e` |
| **Surfaces / Insets** | `#313244` |
| **Cards & Containers** | `#45475a` |
| **Primary Accent** | `#cba6f7` |
| **Success / Granted** | `#a6e3a1` |

---

## 🚀 Key Dashboard Features

1. **Header & System Telemetry**
   - Project title: **Secure Access System** with cyber glowing shield badge.
   - Live **ESP32 Connection Status** with pulsating health beacon.
   - **Last data update timestamp** with dynamic relative ticker.
   - **On-Demand Manual Refresh**: Instant trigger button ("Actualiser") with spinning feedback and auto-resetting 15s polling timer.
   - Data mode indicator (**DEMO SIMULATION** vs. **THINGSPEAK LIVE**).
   - In-app **ThingSpeak Configuration Modal** with credential storage.
   - Built-in **Hardware Event Simulator**: Available in Demo mode. Automatically disabled when ThingSpeak is connected (telemetry read-only mode).

2. **Statistics Cards (Top Grid)**
   - **Total Access Attempts**: Aggregated count of all logged RFID and Keypad events.
   - **Successful Accesses**: Authorized entries with dynamic % rate badge.
   - **Denied Accesses**: Blocked attempts with % rejection rate.
   - **Failed PIN Attempts**: Monitored count with adaptive threshold alert.

3. **Hardware & Lock Telemetry Panel (État du Dispositif)**
   - Real-time snapshot of the physical ESP32 hardware and door mechanism:
     - **Door Lock Visual Actuator**: Current solenoid bolt / relay status on GPIO 18 (Locked = Red glow, Unlocked = Green glow).
     - **ESP32 Connection Health**: Online / Offline indicator based on ThingSpeak feeds.
     - **Failed PIN Buffer (Field 2)**: Consecutive bad PIN attempts before lockout.
     - **Door State Telemetry (Field 3)**: Raw digital state (`1` = Solenoid engaged, `0` = Bolt open).
     - **Active Data Mode**: Indicates whether telemetry is simulated or live from ThingSpeak.

4. **Visual Analytics (Chart.js)**
   - **Attempts Timeline**: Smooth multi-series area chart tracking authorized vs. unauthorized entries across recent events.
   - **Granted vs. Denied Ratio**: Donut chart with centered total count and percentage breakdown.
   - Fully themed with Catppuccin Mocha colors, custom tooltips, and gridlines.

5. **Access Activity & Security Audit Log**
   - Live chronological event history stream.
   - Filter pills: **All Events**, **Granted**, **Denied**, and **Alerts / Failed &ge; 2**.
   - Real-time search by credential token, status, user, or date.
   - **Export CSV** feature for security auditing and forensic reporting.

6. **Automated Security Lockout Alert**
   - Visual alert banner triggered if consecutive failed PIN attempts reach &ge; 3.
   - Interactive "Acknowledge & Reset" defense mechanism.

---

## 📡 ThingSpeak Channel Field Mapping

The dashboard communicates directly with ThingSpeak via its REST API:

```
GET https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json?api_key={READ_API_KEY}&results={LIMIT}
```

| Field | Parameter | Values / Description |
| :--- | :--- | :--- |
| **Field 1** | Access Status | `1` = Access Granted (Authorized), `0` = Access Denied |
| **Field 2** | Failed Attempts | Integer counter (e.g., `0`, `1`, `2`, `3+`) |
| **Field 3** | Door Lock State | `1` = Locked (Solenoid engaged), `0` = Unlocked (Bolt open) |

---

## ⚙️ How to Configure ThingSpeak

### Method 1: Using the In-Dashboard Modal (Recommended)
1. Open `index.html` in any web browser.
2. Click the **ThingSpeak Config** button in the top right of the header.
3. Enter your **ThingSpeak Channel ID** and **Read API Key** (if private).
4. Choose your preferred polling interval (15s recommended for ThingSpeak Free Tier).
5. Click **Test Connection** to verify live HTTP connectivity.
6. Click **Save & Connect**. Settings are saved locally in `localStorage`.

### Method 2: In Code (`script.js`)
Edit lines 18-20 in `script.js`:
```javascript
const CONFIG = {
  THINGSPEAK_CHANNEL_ID: 'YOUR_CHANNEL_ID_HERE',
  THINGSPEAK_READ_API_KEY: 'YOUR_READ_API_KEY_HERE',
  POLL_INTERVAL_MS: 15000,
  RESULTS_LIMIT: 30,
  ...
};
```

---

## 🔌 Example Wokwi / ESP32 Arduino Sketch

Below is a reference Arduino C++ sketch to deploy on an **ESP32** in **Wokwi** or physical hardware to stream data to your ThingSpeak channel:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

// WiFi Credentials (for Wokwi simulation use "Wokwi-GUEST", "")
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// ThingSpeak Configuration
const char* server = "http://api.thingspeak.com";
const char* writeAPIKey = "YOUR_THINGSPEAK_WRITE_API_KEY";

// Pin Definitions
const int RELAY_LOCK_PIN = 18;  // Solenoid / Servo Lock Relay
const int LED_GRANTED_PIN = 2;  // Green LED
const int LED_DENIED_PIN = 4;   // Red LED
const int BTN_RFID_AUTH = 14;   // Pushbutton simulating valid RFID
const int BTN_PIN_FAIL = 12;    // Pushbutton simulating failed PIN

int failedAttempts = 0;
int doorLockState = 1; // 1 = Locked, 0 = Unlocked

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_LOCK_PIN, OUTPUT);
  pinMode(LED_GRANTED_PIN, OUTPUT);
  pinMode(LED_DENIED_PIN, OUTPUT);
  pinMode(BTN_RFID_AUTH, INPUT_PULLUP);
  pinMode(BTN_PIN_FAIL, INPUT_PULLUP);

  // Initial State: Locked
  digitalWrite(RELAY_LOCK_PIN, HIGH);
  digitalWrite(LED_GRANTED_PIN, LOW);
  digitalWrite(LED_DENIED_PIN, LOW);

  Serial.println("[ESP32] Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[ESP32] WiFi Connected. IP: " + WiFi.localIP().toString());
}

void sendThingSpeakUpdate(int accessStatus, int failedCount, int lockState) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(server) + "/update?api_key=" + writeAPIKey +
                 "&field1=" + String(accessStatus) +
                 "&field2=" + String(failedCount) +
                 "&field3=" + String(lockState);

    http.begin(url);
    int httpCode = http.GET();
    if (httpCode > 0) {
      Serial.printf("[ThingSpeak] Update sent. HTTP Code: %d\n", httpCode);
    } else {
      Serial.printf("[ThingSpeak] HTTP Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }
}

void loop() {
  // Check for Authorized RFID scan simulation
  if (digitalRead(BTN_RFID_AUTH) == LOW) {
    Serial.println("[AUTH] Valid RFID Badge detected. Unlocking door...");
    digitalWrite(LED_GRANTED_PIN, HIGH);
    digitalWrite(RELAY_LOCK_PIN, LOW); // Unlock
    doorLockState = 0;
    failedAttempts = 0;

    sendThingSpeakUpdate(1, failedAttempts, doorLockState);

    delay(4000); // Door held open for 4 seconds
    digitalWrite(RELAY_LOCK_PIN, HIGH); // Re-lock
    digitalWrite(LED_GRANTED_PIN, LOW);
    doorLockState = 1;
    sendThingSpeakUpdate(1, failedAttempts, doorLockState);
  }

  // Check for Failed PIN simulation
  if (digitalRead(BTN_PIN_FAIL) == LOW) {
    failedAttempts++;
    Serial.printf("[DENIED] Invalid PIN entered. Failed count: %d\n", failedAttempts);
    digitalWrite(LED_DENIED_PIN, HIGH);
    doorLockState = 1;

    sendThingSpeakUpdate(0, failedAttempts, doorLockState);

    delay(1500);
    digitalWrite(LED_DENIED_PIN, LOW);
  }

  delay(200);
}
```

---

## 📁 Project Structure

```
CyberLock/
├── index.html       # Semantic HTML5 dashboard structure & modal dialogs
├── style.css        # Responsive styling based on Catppuccin Mocha palette
├── script.js        # Controller, Chart.js setup, REST API engine & simulator
└── README.md        # Documentation, field mapping & ESP32 firmware guide
```

---

## 👤 Author Attribution

**Created By Ilham Azra**
