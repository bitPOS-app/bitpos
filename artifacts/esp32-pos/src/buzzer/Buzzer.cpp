#include "Buzzer.h"
#include "esp_timer.h"

uint16_t Buzzer::_seg[Buzzer::MAX_SEG] = {0};
uint8_t  Buzzer::_segCount = 0;
uint8_t  Buzzer::_segIndex = 0;
uint32_t Buzzer::_segStart = 0;
bool     Buzzer::_active   = false;

// Segment timing is driven by a hardware esp_timer, NOT by loop(). This is
// essential: the tap beep is fired immediately before blocking NFC/TLS work
// that can stall loop() for seconds — if the pin were only flipped LOW from
// loop(), a "short beep" would drone on for the whole read. The esp_timer task
// runs at high priority and preempts the blocked loop, so segment durations
// stay accurate under load.
static esp_timer_handle_t _timer = nullptr;

// Guards the shared segment state between the timer task (tick) and the main
// task (start / play*).
static portMUX_TYPE _mux = portMUX_INITIALIZER_UNLOCKED;

static void buzzerTimerCb(void*) { Buzzer::tick(); }

void Buzzer::init() {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
    _active = false;

    if (_timer == nullptr) {
        const esp_timer_create_args_t args = {
            .callback        = &buzzerTimerCb,
            .arg             = nullptr,
            .dispatch_method = ESP_TIMER_TASK,
            .name            = "buzzer",
            .skip_unhandled_events = true,
        };
        esp_timer_create(&args, &_timer);
        esp_timer_start_periodic(_timer, 5000);  // advance every 5 ms
    }
}

void Buzzer::start(const uint16_t* pattern, uint8_t len) {
    portENTER_CRITICAL(&_mux);
    _segCount = (len < MAX_SEG) ? len : MAX_SEG;
    for (uint8_t i = 0; i < _segCount; i++) _seg[i] = pattern[i];
    _segIndex = 0;
    _segStart = millis();
    _active   = true;
    portEXIT_CRITICAL(&_mux);
    // Index 0 is always an ON segment.
    digitalWrite(BUZZER_PIN, HIGH);
}

void Buzzer::playTap() {
    static const uint16_t p[] = {60};
    start(p, sizeof(p) / sizeof(p[0]));
}

void Buzzer::playSuccess() {
    static const uint16_t p[] = {60, 80, 60};
    start(p, sizeof(p) / sizeof(p[0]));
}

void Buzzer::playError() {
    static const uint16_t p[] = {500};
    start(p, sizeof(p) / sizeof(p[0]));
}

void Buzzer::playBoot() {
    static const uint16_t p[] = {80};
    start(p, sizeof(p) / sizeof(p[0]));
}

// Called from the esp_timer task every 5 ms. Do not call from loop().
void Buzzer::tick() {
    bool writePin = false;
    int  level    = LOW;

    portENTER_CRITICAL(&_mux);
    if (_active && (millis() - _segStart >= _seg[_segIndex])) {
        _segIndex++;
        _segStart = millis();
        if (_segIndex >= _segCount) {
            _active  = false;
            writePin = true;
            level    = LOW;
        } else {
            writePin = true;
            level    = (_segIndex % 2 == 0) ? HIGH : LOW;
        }
    }
    portEXIT_CRITICAL(&_mux);

    if (writePin) digitalWrite(BUZZER_PIN, level);
}
