#include "AmountScreen.h"
#include "../ui/Theme.h"

long   AmountScreen::_whole       = 0;
long   AmountScreen::_frac        = 0;
int    AmountScreen::_fracLen     = 0;
bool   AmountScreen::_decimalMode = false;
int    AmountScreen::_decimals    = 2;
float  AmountScreen::_satsPerUnit = 0.0f;
String AmountScreen::_currencyCode = "usd";
Numpad AmountScreen::_numpad;

bool     AmountScreen::_online       = true;
bool     AmountScreen::_stale        = false;
uint16_t AmountScreen::_lastDotColor = 0xFFFF;  // sentinel → forces first draw
String   AmountScreen::_lastRateStr  = "";

// Most currencies use 2 minor-unit digits; these ISO 4217 currencies use 0.
int AmountScreen::currencyDecimals(const String& code) {
    String c = code;
    c.toUpperCase();
    static const char* ZERO[] = {
        "JPY", "KRW", "VND", "CLP", "ISK", "PYG", "XAF", "XOF",
        "XPF", "RWF", "BIF", "DJF", "GNF", "KMF", "VUV", "UGX",
    };
    for (unsigned i = 0; i < sizeof(ZERO) / sizeof(ZERO[0]); i++)
        if (c == ZERO[i]) return 0;
    return 2;
}

void AmountScreen::setPrice(float satsPerUnit, const String& currencyCode) {
    _satsPerUnit  = satsPerUnit;
    _currencyCode = currencyCode;
    _decimals     = currencyDecimals(currencyCode);
    if (satsPerUnit > 0.0f) { _online = true; _stale = false; }
}

void AmountScreen::setStatus(bool online, bool stale) {
    _online = online;
    _stale  = stale;
}

bool AmountScreen::hasInput() {
    return _whole != 0 || _frac != 0 || _decimalMode;
}

// The typed amount as a real fiat value (whole + fraction).
double AmountScreen::currentValue() {
    double v = (double)_whole;
    if (_fracLen > 0) {
        double scale = 1.0;
        for (int i = 0; i < _fracLen; i++) scale *= 10.0;
        v += (double)_frac / scale;
    }
    return v;
}

// The merchant types the amount in their account currency; the Lightning invoice
// is denominated in sats, so convert here using the current price.
long AmountScreen::getAmountSats() {
    if (_satsPerUnit <= 0.0f) return 0;
    // Clamp in double space BEFORE casting to 32-bit long to avoid overflow.
    double sats = currentValue() * (double)_satsPerUnit + 0.5;
    if (sats > 99000000.0) sats = 99000000.0; // cap ~1 BTC, keeps int32 math safe
    if (sats < 0.0) sats = 0.0;
    return (long)sats;
}

String AmountScreen::groupDigits(long v) {
    String s = String(v);
    String out;
    int len = s.length();
    for (int i = 0; i < len; i++) {
        if (i > 0 && (len - i) % 3 == 0) out += ',';
        out += s[i];
    }
    return out;
}

// The typed amount as on-screen text, e.g. "1,234" or "1,234.5" / "12.30".
String AmountScreen::amountString() {
    String s = groupDigits(_whole);
    if (_decimalMode) {
        s += '.';
        if (_fracLen > 0) {
            char fb[12];
            snprintf(fb, sizeof(fb), "%0*ld", _fracLen, _frac);
            s += fb;
        }
    }
    return s;
}

// The typed amount with its currency code, e.g. "5.00 THB" / "1,234 JPY".
// Mirrors exactly what the merchant entered (same text as the Pay button).
String AmountScreen::fiatLabel() {
    String code = _currencyCode;
    code.toUpperCase();
    return amountString() + " " + code;
}

// Centered header rate, read as sats-per-unit, e.g. "41 sats/THB". "—" when unknown.
String AmountScreen::rateString() {
    if (_satsPerUnit <= 0.0f) return String("-"); // no price yet
    String code = _currencyCode;
    code.toUpperCase();
    char buf[24];
    if (_satsPerUnit >= 10.0f)
        snprintf(buf, sizeof(buf), "%.0f sats/%s", _satsPerUnit, code.c_str());
    else
        snprintf(buf, sizeof(buf), "%.1f sats/%s", _satsPerUnit, code.c_str());
    return String(buf);
}

// Status dot reflects connectivity + price freshness.
uint16_t AmountScreen::dotColor() {
    if (_satsPerUnit <= 0.0f) return COL_MUTED;   // no usable price yet
    if (!_online)             return COL_ERROR;   // offline
    if (_stale)               return COL_ACCENT;  // price gone stale (warning)
    return COL_DOT_OK;                             // online + fresh — bright green
}

void AmountScreen::draw(TFT_eSPI& tft) {
    _whole = 0; _frac = 0; _fracLen = 0; _decimalMode = false;
    tft.fillScreen(COL_BG);
    drawHeader(tft);
    _numpad.draw(tft, NUMPAD_Y, NUMPAD_AMOUNT, NUMPAD_KH);
    drawPayButton(tft, false);
}

void AmountScreen::drawHeader(TFT_eSPI& tft) {
    // Wordmark on the left
    tft.setTextFont(FONT_SMALL);
    tft.setTextColor(COL_TEXT, COL_BG);
    tft.setTextDatum(TL_DATUM);
    tft.drawString("bitPOS", 17, 1);

    // Currency badge on the right
    String badge = _currencyCode;
    badge.toUpperCase();
    tft.setTextColor(COL_ACCENT, COL_BG);
    tft.setTextDatum(TR_DATUM);
    tft.drawString(badge, SCREEN_W - 8, 1);

    // Dynamic parts (status dot + centered rate) — force a fresh draw.
    _lastDotColor = 0xFFFF;
    _lastRateStr  = "";
    updateHeader(tft);
}

void AmountScreen::updateHeader(TFT_eSPI& tft) {
    // Status dot — only repaint when the color actually changes.
    uint16_t dc = dotColor();
    if (dc != _lastDotColor) {
        tft.fillCircle(9, 8, 3, dc);
        _lastDotColor = dc;
    }

    // Centered rate between the wordmark and the currency badge — only repaint
    // on change to keep the header from flickering on every keypress / refresh.
    String rs = rateString();
    if (rs != _lastRateStr) {
        tft.fillRect(88, 0, 184, 16, COL_BG); // clear the center band only
        tft.setTextFont(FONT_SMALL);
        tft.setTextColor(COL_MUTED, COL_BG);
        tft.setTextDatum(TC_DATUM);
        tft.drawString(rs, SCREEN_W / 2, 1);
        _lastRateStr = rs;
    }
}

void AmountScreen::updateAmountDisplay(TFT_eSPI& tft) {
    updateHeader(tft);                          // refresh rate + status dot
    // Payable only when we can produce a positive sats amount (price known).
    drawPayButton(tft, getAmountSats() > 0);
}

void AmountScreen::drawPayButton(TFT_eSPI& tft, bool enabled) {
    uint16_t bg = enabled ? COL_SUCCESS : COL_CARD;
    uint16_t fg = enabled ? TFT_WHITE   : COL_MUTED;
    const int cx = SCREEN_W / 2;
    const int cy = PAY_BTN_Y + PAY_BTN_H / 2;

    tft.fillRoundRect(8, PAY_BTN_Y, SCREEN_W - 16, PAY_BTN_H, 10, bg);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(fg, bg);

    // Idle state — nothing entered yet.
    if (!hasInput()) {
        tft.setTextFont(FONT_MED);
        tft.drawString("Pay", cx, cy);
        return;
    }

    // Predominant line: the amount the merchant typed, in the account currency.
    String code = _currencyCode;
    code.toUpperCase();
    char fiatBuf[48];
    snprintf(fiatBuf, sizeof(fiatBuf), "Pay %s %s", amountString().c_str(), code.c_str());

    tft.setTextFont(FONT_MED);
    tft.drawString(fiatBuf, cx, cy - 11);

    // Secondary reference line: the sats equivalent that will actually be invoiced,
    // or a notice when the price is not yet available (cannot convert / pay).
    tft.setTextFont(FONT_SMALL);
    if (_satsPerUnit > 0.0f) {
        char satsBuf[32];
        snprintf(satsBuf, sizeof(satsBuf), "%s sats", groupDigits(getAmountSats()).c_str());
        tft.drawString(satsBuf, cx, cy + 15);
    } else {
        tft.drawString("Price unavailable", cx, cy + 15);
    }
}

bool AmountScreen::handleTouch(TFT_eSPI& tft, int tx, int ty) {
    // Pay button — only actionable when a positive sats amount can be produced.
    if (ty >= PAY_BTN_Y && ty < PAY_BTN_Y + PAY_BTN_H && getAmountSats() > 0) return true;

    char key = _numpad.handleTouch(tx, ty, NUMPAD_Y, NUMPAD_AMOUNT, NUMPAD_KH);
    if (!key) return false;

    // Immediate visual feedback on the pressed key.
    _numpad.flashKey(tft, tx, ty, NUMPAD_Y, NUMPAD_AMOUNT, NUMPAD_KH);

    const long WHOLE_CAP = 99999999L; // 8 digits of the account currency

    if (key == '\x08') {
        // Backspace steps back across the decimal point naturally.
        if (_decimalMode) {
            if (_fracLen > 0) { _frac /= 10; _fracLen--; }
            else              { _decimalMode = false; }
        } else {
            _whole /= 10;
        }
    } else if (key == '.') {
        // Decimal point — only when the currency has fractional units, ignore a 2nd '.'.
        if (_decimals > 0 && !_decimalMode) _decimalMode = true;
    } else if (key >= '0' && key <= '9') {
        int d = key - '0';
        if (!_decimalMode) {
            long next = _whole * 10L + d;
            if (next <= WHOLE_CAP) _whole = next;
        } else if (_fracLen < _decimals) {
            _frac = _frac * 10L + d;
            _fracLen++;
        }
    }

    updateAmountDisplay(tft);
    return false;
}
