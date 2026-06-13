#pragma once
#include <TFT_eSPI.h>
#include "../ui/Numpad.h"

class AmountScreen {
public:
    static void draw(TFT_eSPI& tft);
    static bool handleTouch(TFT_eSPI& tft, int tx, int ty);
    static long getAmountSats();
    static void setPrice(float satsPerUnit, const String& currencyCode);
    static void setStatus(bool online, bool stale);   // header health dot state
    static void updateAmountDisplay(TFT_eSPI& tft);
    static void updateHeader(TFT_eSPI& tft);          // redraw dynamic dot + rate
    static String fiatLabel();                        // typed amount + currency, e.g. "5.00 THB"

private:
    // Entry state — merchant types in the account currency, with optional fraction.
    static long _whole;        // integer part typed
    static long _frac;         // fractional digits typed, as an integer
    static int  _fracLen;      // number of fractional digits entered so far
    static bool _decimalMode;  // '.' has been pressed
    static int  _decimals;     // decimal places for the active currency (0 or 2)

    static float  _satsPerUnit; // sats per 1 unit of the account currency
    static String _currencyCode;
    static Numpad _numpad;

    // Header health state + change-detection (avoids flicker on repeated redraws)
    static bool     _online;
    static bool     _stale;
    static uint16_t _lastDotColor;
    static String   _lastRateStr;

    // Layout (landscape 320x240):
    // Header:    y=0-18  (dot + wordmark | rate | currency badge)
    // Numpad:    y=20, KEY_H=40, 4 rows=160px, ends y=180
    // Pay btn:   y=184, h=54  (two lines: fiat amount + sats reference)
    static const int NUMPAD_Y  = 20;
    static const int NUMPAD_KH = 40;
    static const int PAY_BTN_Y = 184;
    static const int PAY_BTN_H = 54;

    static void   drawHeader(TFT_eSPI& tft);   // full static header
    static void   drawPayButton(TFT_eSPI& tft, bool enabled);
    static String groupDigits(long v);         // comma-group an integer, e.g. 12345 -> "12,345"
    static String amountString();              // typed amount as display text (with decimal)
    static double currentValue();              // typed amount as a fiat value
    static bool   hasInput();                  // any digit / decimal typed
    static uint16_t dotColor();                // status-dot color from health state
    static String rateString();                // centered header rate text
    static int    currencyDecimals(const String& code);
};
