// ─────────────────────────────────────────────────────────────────────────────
// THROWAWAY DIAGNOSTIC — not part of the shipping firmware.
//
// Purpose: determine whether the "SPEAK" buzzer (TMB12A05 on GPIO26) is a
// PASSIVE buzzer (can play distinct musical pitches) or an ACTIVE buzzer
// (built-in oscillator, one fixed tone regardless of drive frequency).
//
// It drives the pin with LEDC PWM tones and sweeps the frequency. Listen:
//   - Pitch clearly RISES across the sweep  -> PASSIVE  -> melody is possible.
//   - Pitch stays FLAT / same buzz          -> ACTIVE   -> no melody in software.
//
// This file is compiled ONLY by the [env:buzztest] environment (see
// platformio.ini build_src_filter), so it never collides with main.cpp.
//
// Flash:   pio run --project-dir artifacts/esp32-pos -e buzztest --target upload
// Listen:  pio device monitor --project-dir artifacts/esp32-pos -b 115200
// Revert:  pio run --project-dir artifacts/esp32-pos -e esp32dev  --target upload
// ─────────────────────────────────────────────────────────────────────────────
#include <Arduino.h>

// GPIO26 = CYD "SPEAK" connector. Channel 2 chosen arbitrarily (this test does
// not init the TFT, so LEDC channel 0 / backlight is irrelevant here).
static const uint8_t  BUZZER_PIN = 26;
static const uint8_t  BUZZER_CH  = 2;
static const uint8_t  RES_BITS   = 8;

static void toneOn(uint32_t freq) {
  // Arduino-ESP32 2.0.x channel-based API (matches main.cpp's backlight setup).
  ledcSetup(BUZZER_CH, freq, RES_BITS);
  ledcAttachPin(BUZZER_PIN, BUZZER_CH);
  ledcWriteTone(BUZZER_CH, freq);
}

static void toneOff() {
  ledcWriteTone(BUZZER_CH, 0);
  ledcWrite(BUZZER_CH, 0);
  ledcDetachPin(BUZZER_PIN);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("=== BUZZER TYPE TEST (TMB12A05 on GPIO26) ===");
  Serial.println("PASSIVE -> pitch rises across the sweep (melody possible).");
  Serial.println("ACTIVE  -> same buzz regardless of frequency (no melody).");
  Serial.println();
}

void loop() {
  // 1) Frequency sweep, low -> high. On a passive buzzer this is an audible
  //    rising slide; on an active buzzer it is a roughly constant tone.
  Serial.println("[1] SWEEP 500 Hz -> 4000 Hz ...");
  for (uint32_t f = 500; f <= 4000; f += 250) {
    Serial.printf("    %4lu Hz\n", (unsigned long)f);
    toneOn(f);
    delay(220);
  }
  toneOff();
  delay(700);

  // 2) The proposed "payment confirmed" arpeggio: C6 E6 G6 C7 (major).
  //    Passive -> four distinct rising notes. Active -> four identical blips.
  Serial.println("[2] ARPEGGIO C6-E6-G6-C7 (should sound like 4 rising notes)");
  const uint32_t notes[] = {1046, 1318, 1568, 2093};
  for (uint8_t i = 0; i < 4; i++) {
    toneOn(notes[i]);
    delay(160);
  }
  toneOff();
  delay(700);

  // 3) Two clearly different pitches back-to-back — the easiest A/B check.
  Serial.println("[3] LOW 700 Hz then HIGH 2300 Hz (should sound different)");
  toneOn(700);
  delay(400);
  toneOn(2300);   // near the TMB12A05 rated resonant peak — loudest if passive
  delay(400);
  toneOff();

  Serial.println("--- pause 2 s, then repeat ---");
  Serial.println();
  delay(2000);
}
