#include <Arduino.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>

#include "config/Config.h"
#include "ble/ProvisionService.h"
#include "api/BitposClient.h"
#include "nfc/NfcReader.h"
#include "screens/ProvisionScreen.h"
#include "screens/AmountScreen.h"
#include "screens/PaymentScreen.h"
#include "screens/PinScreen.h"
#include "screens/ResultScreen.h"
#include "ui/Theme.h"

// ──────────────────────────────────────────────────────────────────────────────
// Global hardware objects
// ──────────────────────────────────────────────────────────────────────────────
TFT_eSPI tft;

// CYD touch — XPT2046 is on VSPI (different bus from display HSPI).
// VSPI: SCK=25, MISO=39, MOSI=32  CS=33  IRQ=36
static SPIClass           touchSpi(VSPI);
static XPT2046_Touchscreen touch(33, 36); // CS=33, IRQ=36

// ──────────────────────────────────────────────────────────────────────────────
// Application state machine
// ──────────────────────────────────────────────────────────────────────────────
enum AppState {
    STATE_PROVISIONING,
    STATE_CONNECTING_WIFI,
    STATE_IDLE_AMOUNT,
    STATE_CREATING_INVOICE,
    STATE_WAITING_PAYMENT,
    STATE_PIN_ENTRY,
    STATE_SUCCESS,
    STATE_ERROR,
};

static AppState state = STATE_PROVISIONING;

// Payment context preserved across NFC → PIN → settle flow
static Invoice  currentInvoice;
static String   currentCardUid;
static String   lastError;
static long     currentAmountSats = 0;

// LNURL-withdraw context — stored separately to avoid URL reconstruction bugs
static String   lnurlCallback;    // raw callback URL (may already contain '?')
static String   lnurlK1;         // k1 value from LNURL-withdraw response

// Set true once callLnurlCallback() succeeds; stops NFC polling,
// continues invoice-status polling until paid/expired/timeout.
static bool lnurlCallbackSent = false;

// Price cache
static float    satsPerUnit       = 0.0f;
static uint32_t priceLastFetched  = 0;
static const uint32_t PRICE_TTL_MS = 5UL * 60UL * 1000UL; // 5 min

// Polling
static uint32_t invoiceCreateTime = 0;
static const uint32_t INVOICE_TIMEOUT_MS = 60000;
static uint32_t lastStatusPoll = 0;
static const uint32_t POLL_INTERVAL_MS = 2000;
static int      pollFailCount      = 0;      // consecutive HTTP errors; resets on good response
static uint32_t currentPollInterval = POLL_INTERVAL_MS; // grows with exponential back-off

// WiFi watchdog — reconnect if connection lost for >5 s in any operational state
static uint32_t wifiConnectStart        = 0;
static uint32_t wifiLostAt             = 0;
static bool     paymentInterruptedByWifi = false; // true when WiFi dropped mid-payment

// WiFi connecting screen animation state (reset by enterConnectingWifi)
static uint32_t wifiAnimLast  = 0;
static int      wifiAnimFrame = 0;

// Price retry interval when price is unknown (shorter than full TTL)
static const uint32_t PRICE_RETRY_MS = 30000; // 30 s between retries when price = 0

// Screen sleep — backlight off after 2 min of no touch in STATE_IDLE_AMOUNT.
// Touch controller stays powered; next touch wakes the screen instantly.
static const uint32_t SCREEN_DIM_MS = 2UL * 60UL * 1000UL; // 2 minutes
static uint32_t lastActivityMs = 0;   // millis() of last touch in idle state
static bool     screenOff      = false;

// Factory reset
static const int BOOT_BTN_PIN       = 0;
static uint32_t bootBtnPressStart   = 0; // millis() when button first went LOW

// ──────────────────────────────────────────────────────────────────────────────
// Touch helpers — XPT2046_Touchscreen on VSPI
// ──────────────────────────────────────────────────────────────────────────────
static bool readTouch(int& tx, int& ty) {
    // Leading-edge detection: only register the FIRST frame of a new touch.
    // This prevents a held finger from firing repeatedly every 50 ms loop.
    // The 200 ms debounce guards against XPT2046 noise between frames.
    static bool  prevTouched  = false;
    static uint32_t lastTouchMs = 0;

    bool isTouched = touch.touched();
    bool isNew     = isTouched && !prevTouched;
    prevTouched    = isTouched;

    if (!isNew)                                 return false;
    if (millis() - lastTouchMs < 200)           return false;
    lastTouchMs = millis();

    TS_Point p = touch.getPoint();
    // CYD (ESP32-2432S028R) rotation=1: XPT2046 p.x increases left→right,
    // p.y increases top→bottom — same direction as screen coords, no inversion.
    tx = map(p.x, TOUCH_X_MIN, TOUCH_X_MAX, 0, SCREEN_W - 1);
    ty = map(p.y, TOUCH_Y_MIN, TOUCH_Y_MAX, 0, SCREEN_H - 1);
    tx = constrain(tx, 0, SCREEN_W - 1);
    ty = constrain(ty, 0, SCREEN_H - 1);
    Serial.printf("Touch: raw(%d,%d) → screen(%d,%d)\n", p.x, p.y, tx, ty);
    return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// State transitions
// ──────────────────────────────────────────────────────────────────────────────
static void enterIdleAmount(); // forward declaration — defined after handleConnectingWifi
static void enterProvisioning() {
    state = STATE_PROVISIONING;
    Config::clear();
    ProvisionService::begin();
    ProvisionScreen::draw(tft);
}

static void enterConnectingWifi() {
    state            = STATE_CONNECTING_WIFI;
    wifiConnectStart = millis();
    wifiLostAt       = 0;               // reset watchdog so it doesn't re-fire immediately
    currentPollInterval = POLL_INTERVAL_MS; // reset back-off for next invoice
    wifiAnimLast     = 0;               // reset animation so dots start immediately
    wifiAnimFrame    = 0;
    ProvisionService::setStatus("connecting");

    tft.fillScreen(COL_BG);
    tft.setTextDatum(MC_DATUM);
    tft.setTextFont(FONT_SMALL);
    tft.setTextColor(COL_MUTED, COL_BG);
    tft.drawString("Connecting to WiFi", SCREEN_W / 2, SCREEN_H / 2 - 22);
    tft.setTextColor(COL_TEXT, COL_BG);
    tft.drawString(Config::ssid, SCREEN_W / 2, SCREEN_H / 2 + 4);
    // Discoverable factory-reset hint — so a stuck device can always be released
    tft.setTextFont(1);
    tft.setTextColor(COL_BORDER, COL_BG);
    tft.drawString("Hold BOOT 5s to reset", SCREEN_W / 2, SCREEN_H - 14);

    WiFi.setAutoReconnect(true);
    WiFi.begin(Config::ssid.c_str(), Config::pass.c_str());
}

static void handleConnectingWifi() {
    wl_status_t s = WiFi.status();
    if (s == WL_CONNECTED) {
        Serial.println("WiFi connected: " + WiFi.localIP().toString());

        BitposClient::init(Config::serverUrl, Config::token);

        // Pre-allocate all String fields that grow during transactions.
        // reserve() grabs memory once here; subsequent String assignments
        // reuse the same physical buffer (no realloc) as long as content fits.
        // Combined with BitposClient's pre-allocated _respBuf and _urlBuf,
        // heap allocation is effectively O(1) after the first transaction.
        currentInvoice.bolt11.reserve(512);      // bolt11: 250-500 chars typical
        currentInvoice.paymentHash.reserve(64);  // sha256 hex: 64 chars
        currentInvoice.expiresAt.reserve(32);
        currentCardUid.reserve(32);
        lnurlCallback.reserve(384);              // LNURL callback URL
        lnurlK1.reserve(64);

        // Step 1 — connectivity: unauthenticated health probe.
        // On failure: reboot and retry — do NOT wipe config. A transient server
        // outage (maintenance, DNS blip) would otherwise factory-reset a deployed
        // device and force the merchant to re-provision it in the field.
        if (!BitposClient::healthCheck()) {
            ProvisionService::setStatus("error:server_unreachable");
            Serial.println("healthCheck failed — rebooting to retry (config preserved)");
            delay(4000);
            ESP.restart();
            return;
        }

        // Step 2 — authentication: confirm the device token is accepted.
        // HTTP 401 = token explicitly rejected by the server. This IS permanent
        // (wrong/revoked token), so wiping config to force re-provisioning is correct.
        if (!BitposClient::validateToken()) {
            ProvisionService::setStatus("error:token_invalid");
            delay(4000);
            Config::clear();
            ESP.restart();
            return;
        }

        // Override currency from the server (merchant's account setting) so the
        // device always follows the web app — not the value baked into NVS at
        // provision time. Falls back to the provisioned currency on any error.
        String serverCurrency = BitposClient::fetchCurrency();
        if (!serverCurrency.isEmpty()) {
            Config::currency = serverCurrency;
            Serial.println("Currency from server: " + Config::currency);
        }

        // Fetch initial price
        satsPerUnit = BitposClient::fetchPrice(Config::currency);
        priceLastFetched = millis();

        if (ProvisionService::isActive()) {
            // Came from BLE provisioning — notify phone then restart cleanly.
            // Do NOT call ProvisionService::stop() / deinit(true): it races with
            // a pending NimBLE callback and crashes with PC=0x00000000.
            // Config is committed to NVS; after restart isProvisioned()=true and
            // the device boots straight into POS mode without touching BLE.
            ProvisionService::setStatus("connected");
            delay(2000);
            ESP.restart();
            return;
        }

        AmountScreen::setPrice(satsPerUnit, Config::currency);
        enterIdleAmount();

    } else {
        // Log WiFi status every 3 s so the serial monitor shows progress
        static uint32_t lastWifiLog = 0;
        if (millis() - lastWifiLog > 3000) {
            lastWifiLog = millis();
            Serial.printf("WiFi status: %d  SSID: %s\n", (int)s, Config::ssid.c_str());
        }
        // 3-dot bounce animation while waiting for WiFi — updates every 500 ms.
        // Only the dot row is redrawn; title + SSID remain from enterConnectingWifi().
        if (millis() - wifiAnimLast > 500) {
            wifiAnimLast  = millis();
            wifiAnimFrame = (wifiAnimFrame + 1) % 3;
            const int dotY = 175, dotR = 10, gap = 44, cx = SCREEN_W / 2;
            tft.fillRect(0, dotY - dotR - 6, SCREEN_W, (dotR + 6) * 2, COL_BG);
            for (int i = 0; i < 3; i++) {
                int  x   = cx + (i - 1) * gap;
                bool lit = (i == wifiAnimFrame);
                int  yOff = lit ? -4 : 0;
                if (lit) tft.fillCircle(x, dotY + yOff, dotR, COL_ACCENT);
                else     tft.drawCircle(x, dotY + yOff, dotR, COL_MUTED);
            }
        }
        if (millis() - wifiConnectStart > 40000) {
            // Don't clear config on timeout — wrong credentials need a factory
            // reset, but slow/temporary failures should survive a reboot.
            ProvisionService::setStatus("error:wifi_timeout");
            delay(4000);
            ESP.restart();
        }
    }
}

// Enter the idle amount screen from any state.
// Guarantees backlight is on, resets idle timer, draws the amount screen.
// Always use this instead of setting state = STATE_IDLE_AMOUNT directly so
// screen-sleep state is consistent regardless of which path returns to idle.
static void enterIdleAmount() {
    screenOff      = false;
    lastActivityMs = millis();
    ledcWrite(0, 255);          // backlight on — may be no-op if already on
    AmountScreen::draw(tft);
    state = STATE_IDLE_AMOUNT;
}

static void handleIdleAmount() {
    int tx, ty;
    if (!readTouch(tx, ty)) return;

    // First touch while screen is dark wakes the backlight but is NOT forwarded
    // as input — the cashier shouldn't accidentally start entering digits in the dark.
    if (screenOff) {
        screenOff      = false;
        lastActivityMs = millis();
        ledcWrite(0, 255);
        AmountScreen::draw(tft);
        return;
    }

    lastActivityMs = millis();  // any successful touch resets the idle timer

    bool pay = AmountScreen::handleTouch(tft, tx, ty);
    if (pay) {
        currentAmountSats = AmountScreen::getAmountSats();
        state = STATE_CREATING_INVOICE;

        tft.fillScreen(COL_BG);
        tft.setTextColor(COL_TEXT, COL_BG);
        tft.setTextDatum(MC_DATUM);
        tft.setTextFont(FONT_SMALL);
        tft.drawString("Creating invoice...", SCREEN_W / 2, SCREEN_H / 2);
    }
}

static void handleCreatingInvoice() {
    // Animated "Creating invoice..." screen — same dot-bounce pattern used by
    // the PIN confirming screen so the UX language is consistent.
    // 3 pre-HTTP frames × 120 ms = 360 ms, then createInvoice() blocks (~1-3 s).
    tft.fillScreen(COL_BG);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(COL_TEXT, COL_BG);
    tft.setTextFont(FONT_MED);
    tft.drawString("Creating", SCREEN_W / 2, 78);
    tft.setTextFont(FONT_SMALL);
    tft.setTextColor(COL_MUTED, COL_BG);
    tft.drawString("invoice...", SCREEN_W / 2, 114);
    {
        const int dotY = 155, dotR = 11, gap = 46, cx = SCREEN_W / 2;
        for (int frame = 0; frame < 4; frame++) {
            tft.fillRect(0, dotY - dotR - 8, SCREEN_W, (dotR + 8) * 2, COL_BG);
            for (int i = 0; i < 3; i++) {
                int  x   = cx + (i - 1) * gap;
                bool lit = (i == frame % 3);
                int  yOff = lit ? -5 : 0;
                if (lit) tft.fillCircle(x, dotY + yOff, dotR, COL_ACCENT);
                else     tft.drawCircle(x, dotY + yOff, dotR, COL_MUTED);
            }
            if (frame < 3) delay(120);   // animate 3 frames; frame 3 holds during HTTP
        }
    }

    String err;
    currentInvoice = BitposClient::createInvoice(currentAmountSats, err);

    if (!err.isEmpty() || currentInvoice.bolt11.isEmpty()) {
        lastError = err.isEmpty() ? "Failed to create invoice" : err;
        ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
        state = STATE_ERROR;
        return;
    }

    invoiceCreateTime   = millis();
    lastStatusPoll      = 0;
    pollFailCount       = 0;
    currentPollInterval = POLL_INTERVAL_MS;
    lnurlCallbackSent   = false;
    lnurlCallback       = "";
    lnurlK1             = "";
    PaymentScreen::draw(tft, currentInvoice.bolt11, currentAmountSats, AmountScreen::fiatLabel(), INVOICE_TIMEOUT_MS / 1000);
    state = STATE_WAITING_PAYMENT;
}

static void handleWaitingPayment() {
    // Timeout
    if (millis() - invoiceCreateTime > INVOICE_TIMEOUT_MS) {
        enterIdleAmount();
        return;
    }

    // Cancel button (only available while waiting; hidden once callback sent)
    int tx, ty;
    if (!lnurlCallbackSent && readTouch(tx, ty)) {
        if (PaymentScreen::handleTouch(tx, ty)) {
            enterIdleAmount();
            return;
        }
    }

    // Animate the appropriate waiting screen.
    // After a PIN callback the QR is replaced by the confirming screen so the
    // cashier never sees the payment screen a second time.
    if (lnurlCallbackSent) {
        PinScreen::updateConfirming(tft);
    } else {
        PaymentScreen::update(tft);
    }

    // Poll invoice status every 2 s — the authoritative settlement signal.
    // This is the only path to STATE_SUCCESS; no shortcut after callback.
    // The HTTPS status check is a blocking call (TLS handshake can take ~1-3 s on
    // the dev URL). Measure the interval from poll END (not start) so the loop
    // gets ~2 s of fast (~300 ms) iterations between polls where the countdown can
    // tick every second, then refresh the timer the instant the poll returns —
    // otherwise update() runs only once per slow iteration and the timer skips.
    if (millis() - lastStatusPoll >= currentPollInterval) {
        String status = BitposClient::pollInvoiceStatus(currentInvoice.paymentHash);
        if (status == "paid") {
            ResultScreen::draw(tft, RESULT_SUCCESS, currentAmountSats);
            state = STATE_SUCCESS;
            return;
        }
        if (status == "expired") {
            enterIdleAmount();
            return;
        }
        if (status == "error") {
            if (++pollFailCount >= 5) {
                lastError = "Network error - reset to retry";
                ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
                state = STATE_ERROR;
                return;
            }
            // Exponential back-off: double the poll interval, cap at 30 s
            currentPollInterval = min((uint32_t)30000, currentPollInterval * 2);
        } else {
            // Server responded — reset failure streak and interval
            pollFailCount       = 0;
            currentPollInterval = POLL_INTERVAL_MS;
        }
        lastStatusPoll = millis();   // restart window from poll completion
        if (!lnurlCallbackSent) PaymentScreen::update(tft);  // QR countdown refresh
    }

    // Skip NFC once the LNURL callback has been accepted — avoid re-tapping
    if (lnurlCallbackSent) return;

    // Phase 1 — detect card (300ms RF window, non-blocking to outer loop)
    String nfcUid;
    if (!NfcReader::detectCard(nfcUid)) return;

    // Card in field — tell user to hold it still while APDU reads the NDEF
    PaymentScreen::showCardDetected(tft);
    currentCardUid = nfcUid;

    // Phase 2 — read NDEF URL via ISO-DEP APDU (~300ms, card must stay still)
    String nfcUrl = NfcReader::readNdef();
    if (nfcUrl.isEmpty()) {
        lastError = "Card read failed - hold flat and try again";
        ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
        state = STATE_ERROR;
        return;
    }

    // Fetch LNURL-withdraw from the card's URL (no device token sent)
    String lnErr;
    auto lw = BitposClient::fetchLnurl(nfcUrl, lnErr);
    if (!lnErr.isEmpty()) {
        lastError = lnErr;
        ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
        state = STATE_ERROR;
        return;
    }

    // Validate amount fits within the card's withdrawal limit
    long maxSats = lw.maxWithdrawable / 1000; // msats → sats
    if (currentAmountSats > maxSats) {
        lastError = "Amount exceeds card limit";
        ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
        state = STATE_ERROR;
        return;
    }

    // Store callback and k1 as separate values — never reconstruct from a URL
    lnurlCallback = lw.callback;
    lnurlK1       = lw.k1;

    // LUD-21: require PIN when pinLimitMsats is present AND amount >= threshold.
    // Mirrors web POS: pinNeeded = (pinLimit !== undefined) && amountSats*1000 >= pinLimit
    bool needPin = (lw.pinLimitMsats >= 0) && (currentAmountSats * 1000 >= lw.pinLimitMsats);
    if (needPin) {
        PinScreen::draw(tft, nfcUid);
        state = STATE_PIN_ENTRY;
        return;
    }

    // No PIN — call callback immediately (third-party host, no device token).
    // Show a processing animation (no mention of PIN) so the customer sees
    // immediate feedback: card tap → dots spin → confirming screen → settled.
    PinScreen::drawProcessing(tft, "Processing", "payment...");

    // Reset the watchdog before the second blocking TLS call in this iteration.
    // fetchLnurl() above was TLS call #1 (up to 10 s); callLnurlCallback() is
    // TLS call #2 (up to 10 s). Without this reset the combined ~20 s could
    // exceed the 30 s WDT window on a slow network connection.
    esp_task_wdt_reset();

    String cbErr = BitposClient::callLnurlCallback(
        lnurlCallback, lnurlK1, currentInvoice.bolt11);

    if (cbErr.isEmpty()) {
        // Callback accepted — show confirming animation and keep polling until settled.
        // Mirrors the PIN path: QR is never shown again after card tap.
        lnurlCallbackSent = true;
        PinScreen::drawConfirming(tft);
    } else {
        lastError = cbErr;
        ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
        state = STATE_ERROR;
    }
}

static void handlePinEntry() {
    PinScreen::update(tft);

    int tx, ty;
    if (!readTouch(tx, ty)) return;

    char action = PinScreen::handleTouch(tft, tx, ty);
    if (action == 'C') {
        // Cancel — return to WAITING_PAYMENT; NFC polling resumes
        lnurlCallback = "";
        lnurlK1       = "";
        PaymentScreen::draw(tft, currentInvoice.bolt11, currentAmountSats, AmountScreen::fiatLabel(), INVOICE_TIMEOUT_MS / 1000);
        state = STATE_WAITING_PAYMENT;
        return;
    }
    if (action == 'O') {
        // Show processing animation — blocks ~1-4 s while the HTTP call runs
        PinScreen::drawProcessing(tft);

        String cbErr = BitposClient::callLnurlCallback(
            lnurlCallback, lnurlK1, currentInvoice.bolt11, PinScreen::getPin());

        if (cbErr.isEmpty()) {
            // Callback accepted — keep polling until invoice settles.
            // Draw the confirming screen instead of the QR payment screen so
            // the cashier never sees the QR a second time after entering the PIN.
            lnurlCallbackSent = true;
            PinScreen::drawConfirming(tft);
            state = STATE_WAITING_PAYMENT;
        } else if (cbErr.indexOf("wrong") >= 0 || cbErr.indexOf("PIN") >= 0 ||
                   cbErr.indexOf("pin") >= 0) {
            // Wrong PIN — redraw the PIN screen (processing screen replaced it), then shake
            PinScreen::draw(tft, currentCardUid);
            PinScreen::setWrongPin(tft);
        } else {
            lastError = cbErr;
            ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
            state = STATE_ERROR;
        }
    }
}

static void handleSuccess() {
    if (ResultScreen::shouldAutoDismiss()) {
        enterIdleAmount();
    }
}

static void handleError() {
    int tx, ty;
    if (!readTouch(tx, ty)) return;
    if (ResultScreen::handleTouch(tx, ty)) {
        if (paymentInterruptedByWifi) {
            // Don't return to AmountScreen yet — reconnect first so the cashier
            // can check the dashboard before starting the next transaction.
            paymentInterruptedByWifi = false;
            enterConnectingWifi();
        } else {
            enterIdleAmount();
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory reset via BOOT button
// ──────────────────────────────────────────────────────────────────────────────
static void checkFactoryReset() {
    static const uint32_t HOLD_MS  = 5000UL;
    static const int      BAR_X    = 20;
    static const int      BAR_Y    = SCREEN_H - 10;
    static const int      BAR_H    = 5;
    static const int      BAR_MAXW = SCREEN_W - 40;
    static bool           barShown = false;

    bool pressed = (digitalRead(BOOT_BTN_PIN) == LOW);
    if (pressed) {
        if (bootBtnPressStart == 0) bootBtnPressStart = millis();

        uint32_t held = millis() - bootBtnPressStart;
        if (held >= HOLD_MS) {
            // Clear bar and flash screen white briefly as confirmation feedback
            tft.fillRect(BAR_X - 2, BAR_Y - 2, BAR_MAXW + 4, BAR_H + 4, COL_BG);
            tft.fillScreen(TFT_WHITE);
            delay(120);
            Serial.println("Factory reset triggered (5 s hold)");
            Config::clear();
            ESP.restart();
        }

        // Draw / update progress bar
        int fillW = (int)((float)held / HOLD_MS * BAR_MAXW);
        fillW = min(fillW, BAR_MAXW);
        tft.fillRect(BAR_X, BAR_Y, fillW, BAR_H, COL_ACCENT);
        // Track bar outline on first press so it appears once
        if (!barShown) {
            tft.drawRect(BAR_X - 1, BAR_Y - 1, BAR_MAXW + 2, BAR_H + 2, COL_MUTED);
            barShown = true;
        }
    } else {
        if (barShown) {
            // Erase bar area when released before threshold
            tft.fillRect(BAR_X - 2, BAR_Y - 2, BAR_MAXW + 4, BAR_H + 4, COL_BG);
            barShown = false;
        }
        bootBtnPressStart = 0;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Loop task stack — must be at file scope (macro expands to a function def)
// Doubles the default 8 KB to 16 KB so mbedTLS has headroom for two
// consecutive TLS handshakes on the no-PIN NFC path without overflowing.
// ──────────────────────────────────────────────────────────────────────────────
SET_LOOP_TASK_STACK_SIZE(16384);

// ──────────────────────────────────────────────────────────────────────────────
// Setup & loop
// ──────────────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    pinMode(BOOT_BTN_PIN, INPUT_PULLUP);

    // Hardware watchdog — auto-reboot if loop() ever stalls for >30 s.
    // HTTP timeout is 10 s so this only fires on a genuine hang (e.g. stuck TLS).
    esp_task_wdt_init(30, true);   // 30 s timeout, panic=true → reboot
    esp_task_wdt_add(NULL);        // watch the main (loop) task

    // TFT backlight — GPIO 21 on CYD via LEDC PWM (full brightness = 255)
    // Using LEDC rather than digitalWrite gives reliable full duty cycle
    // regardless of any TFT_eSPI internal pin state changes.
    ledcSetup(0, 5000, 8);   // channel 0, 5 kHz, 8-bit resolution
    ledcAttachPin(21, 0);    // GPIO 21 → LEDC channel 0
    ledcWrite(0, 255);       // 100% duty cycle → max brightness

    // TFT init — ILI9341_2_DRIVER + USE_HSPI_PORT matches witnessmenow CYD reference.
    // setRotation(1) = landscape, correct orientation on CYD with this driver.
    tft.init();
    tft.setRotation(SCREEN_ROTATION);
    // CYD panel renders colors inverted by default — without this every color
    // shows as its photo-negative (black bg -> white, orange -> blue, etc.).
    tft.invertDisplay(true);
    tft.fillScreen(COL_BG);

    // Touch init — VSPI bus: SCK=25, MISO=39, MOSI=32
    touchSpi.begin(25, 39, 32, 33);
    touch.begin(touchSpi);

    Serial.println("posBOX booting...");

    // NFC init (non-fatal — device works without NFC)
    NfcReader::begin();

    // Load config from NVS
    Config::load();

    if (Config::isProvisioned()) {
        // Already provisioned — connect to WiFi directly
        enterConnectingWifi();
    } else {
        enterProvisioning();
    }
}

void loop() {
    esp_task_wdt_reset();   // feed the watchdog every iteration

    // Heap monitor — log free heap every 30 s for serial visibility.
    // Pre-allocated buffers (BitposClient::_respBuf, _urlBuf, Invoice fields)
    // make heap use O(1) after the first transaction; this log lets you verify
    // that in the serial monitor.  No reboot: fixing the root cause is better
    // than masking fragmentation with a scheduled restart.
    {
        static uint32_t lastHeapCheck = 0;
        if (millis() - lastHeapCheck > 30000) {
            lastHeapCheck = millis();
            Serial.printf("Heap: %u bytes free (largest block: %u)\n",
                          ESP.getFreeHeap(), ESP.getMaxAllocHeap());
        }
    }

    // ── WiFi watchdog ──────────────────────────────────────────────────────
    // If the connection drops in any operational state, give the ESP32's
    // auto-reconnect 5 s to recover on its own, then force a full reconnect.
    if (state != STATE_PROVISIONING && state != STATE_CONNECTING_WIFI) {
        if (WiFi.status() != WL_CONNECTED) {
            if (wifiLostAt == 0) {
                wifiLostAt = millis();
                Serial.println("WiFi lost — waiting for auto-reconnect...");
            } else if (millis() - wifiLostAt > 5000) {
                if (state == STATE_WAITING_PAYMENT || state == STATE_PIN_ENTRY) {
                    // WiFi dropped during a live transaction — don't silently abandon.
                    // Show a clear warning so the cashier knows to check the dashboard.
                    Serial.println("WiFi lost during payment — showing warning");
                    paymentInterruptedByWifi = true;
                    lastError = "WiFi lost — check dashboard if payment completed";
                    ResultScreen::draw(tft, RESULT_ERROR, 0, lastError);
                    state = STATE_ERROR;
                } else {
                    Serial.println("WiFi still down after 5 s — reconnecting");
                    enterConnectingWifi();
                }
                wifiLostAt = 0;
                return;
            }
        } else {
            if (wifiLostAt != 0) {
                Serial.println("WiFi restored");
                wifiLostAt = 0;
            }
        }
    }

    checkFactoryReset();

    // Price refresh when connected.
    // Two retry intervals:
    //   - price = 0 (unknown): retry every 30 s so a boot-time fetch failure
    //     self-heals quickly without hammering the server.
    //   - price > 0 (known): refresh every 5 min (PRICE_TTL_MS).
    if (state == STATE_IDLE_AMOUNT) {
        bool priceUnknown = (satsPerUnit <= 0);
        uint32_t interval = priceUnknown ? PRICE_RETRY_MS : PRICE_TTL_MS;
        if (millis() - priceLastFetched > interval) {
            float fresh = BitposClient::fetchPrice(Config::currency);
            if (fresh > 0) {
                satsPerUnit      = fresh;
                priceLastFetched = millis();
                AmountScreen::setPrice(satsPerUnit, Config::currency);
                AmountScreen::updateAmountDisplay(tft);
            } else if (priceUnknown) {
                // Failed retry — back off 30 s before trying again
                priceLastFetched = millis();
            }
        }
    }

    // Health dot — reflect live connectivity + price freshness while idle.
    if (state == STATE_IDLE_AMOUNT) {
        static uint32_t lastStatusTick = 0;
        if (millis() - lastStatusTick > 2000) {
            lastStatusTick = millis();
            bool online = (WiFi.status() == WL_CONNECTED);
            bool stale  = (priceLastFetched == 0) ||
                          (millis() - priceLastFetched > PRICE_TTL_MS);
            AmountScreen::setStatus(online, stale);
            AmountScreen::updateHeader(tft); // repaints only on actual change
        }
    }

    // Screen sleep — kill backlight after SCREEN_DIM_MS of no touch while idle.
    // The display panel and touch controller stay powered; the next touch wakes
    // it instantly and is consumed (doesn't register as a digit press).
    // Skip when screen is already off to avoid redundant ledcWrite calls.
    if (state == STATE_IDLE_AMOUNT && !screenOff &&
        millis() - lastActivityMs > SCREEN_DIM_MS) {
        screenOff = true;
        ledcWrite(0, 0);    // backlight off
    }

    switch (state) {
        case STATE_PROVISIONING:
            ProvisionScreen::update(tft);
            if (ProvisionService::isComplete()) {
                Config::save(ProvisionService::ssid, ProvisionService::pass,
                             ProvisionService::token, ProvisionService::serverUrl,
                             ProvisionService::currency);
                enterConnectingWifi();
            }
            break;

        case STATE_CONNECTING_WIFI:
            handleConnectingWifi();
            break;

        case STATE_IDLE_AMOUNT:
            handleIdleAmount();
            break;

        case STATE_CREATING_INVOICE:
            handleCreatingInvoice();
            break;

        case STATE_WAITING_PAYMENT:
            handleWaitingPayment();
            break;

        case STATE_PIN_ENTRY:
            handlePinEntry();
            break;

        case STATE_SUCCESS:
            handleSuccess();
            break;

        case STATE_ERROR:
            handleError();
            break;
    }

    delay(50); // ~20 Hz loop — enough for touch responsiveness
}
