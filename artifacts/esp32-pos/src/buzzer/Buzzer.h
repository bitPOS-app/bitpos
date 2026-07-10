#pragma once
#include <Arduino.h>

// CYD "SPEAK" 2-pin JST connector is driven by GPIO26 through an onboard
// transistor buffer. The TMB12A05 is an ACTIVE buzzer (built-in oscillator):
// it sounds whenever the pin is HIGH, so plain digitalWrite HIGH/LOW is all
// that is needed — no PWM/DAC/LEDC (LEDC channel 0 already drives the backlight
// on GPIO21; do not reuse it). Remap here if wired to a different pin.
#define BUZZER_PIN  26

// Non-blocking buzzer driver. Patterns are advanced by tick(), which is driven
// by a high-priority esp_timer set up in init() — NOT from loop(). This is
// deliberate: the tap beep fires right before blocking NFC/TLS work that can
// stall loop() for seconds, so loop-driven timing would leave the pin HIGH the
// whole time. No delay() is used anywhere.
class Buzzer {
public:
    // Configure the pin. Call once from setup().
    static void init();

    // Trigger a pattern. Each call restarts playback from the beginning.
    static void playTap();      // one short crisp beep — card entered the field
    static void playSuccess();  // double beep — payment confirmed settled
    static void playError();    // one long tone — read/limit/LNURL failure
    static void playBoot();     // one short beep — power-on confirmation

    // Advance the active pattern. Driven by the esp_timer callback in Buzzer.cpp;
    // do not call from loop().
    static void tick();

private:
    static const uint8_t MAX_SEG = 8;

    // Segment durations in ms. Even indices = buzzer ON, odd indices = OFF.
    static uint16_t _seg[MAX_SEG];
    static uint8_t  _segCount;
    static uint8_t  _segIndex;
    static uint32_t _segStart;
    static bool     _active;

    static void start(const uint16_t* pattern, uint8_t len);
};
