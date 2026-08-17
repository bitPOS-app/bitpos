#include "Numpad.h"

// AMOUNT layout (4 rows x 3 cols):
// Row 0: 1  2  3
// Row 1: 4  5  6
// Row 2: 7  8  9
// Row 3: .  0  <        ('.' = decimal point for fractional fiat; '<' = backspace)
static const char* KEYS_AMOUNT[4][3] = {
    { "1", "2", "3"    },
    { "4", "5", "6"    },
    { "7", "8", "9"    },
    { ".", "0", "\x08" },
};

// PIN layout (4 rows x 3 cols):
// Row 0: 1  2  3
// Row 1: 4  5  6
// Row 2: 7  8  9
// Row 3:    0  <
static const char* KEYS_PIN[4][3] = {
    { "1", "2", "3"    },
    { "4", "5", "6"    },
    { "7", "8", "9"    },
    { " ", "0", "\x08" },
};

static const int KEY_W   = SCREEN_W / 3;
static const int KEY_GAP = 2;

void Numpad::draw(TFT_eSPI& tft, int originY, NumpadMode mode, int keyH) {
    const char* (*keys)[3] = (mode == NUMPAD_PIN) ? KEYS_PIN : KEYS_AMOUNT;
    for (int r = 0; r < 4; r++)
        for (int c = 0; c < 3; c++)
            drawKey(tft, c, r, originY, keys[r][c], keyH);
}

void Numpad::drawKey(TFT_eSPI& tft, int col, int row, int originY,
                     const char* label, int keyH, bool highlight) {
    int x = col * KEY_W + KEY_GAP;
    int y = originY + row * keyH + KEY_GAP;
    int w = KEY_W - KEY_GAP * 2;
    int h = keyH  - KEY_GAP * 2;

    if (label[0] == ' ') return; // blank slot

    bool isBack = (label[0] == '\x08');

    // Pressed keys flash on the accent color; backspace reads as a muted utility key.
    uint16_t bg, fg;
    if (highlight) {
        bg = COL_ACCENT;
        fg = COL_BG;
    } else {
        bg = isBack ? COL_CARD_HI : COL_CARD;
        fg = isBack ? COL_MUTED   : COL_TEXT;
    }

    tft.fillRoundRect(x, y, w, h, 6, bg);
    tft.drawRoundRect(x, y, w, h, 6, COL_BORDER);

    tft.setTextColor(fg, bg);
    tft.setTextDatum(MC_DATUM);
    tft.setTextFont(FONT_MED);
    tft.drawString(isBack ? "<" : label, x + w / 2, y + h / 2);
}

char Numpad::handleTouch(int tx, int ty, int originY, NumpadMode mode, int keyH) {
    const char* (*keys)[3] = (mode == NUMPAD_PIN) ? KEYS_PIN : KEYS_AMOUNT;
    for (int r = 0; r < 4; r++) {
        for (int c = 0; c < 3; c++) {
            int x = c * KEY_W;
            int y = originY + r * keyH;
            if (tx >= x && tx < x + KEY_W && ty >= y && ty < y + keyH) {
                const char* label = keys[r][c];
                if (label[0] == ' ') return 0;
                if (label[0] == '\x08') return '\x08';
                return label[0]; // single digit or '.'
            }
        }
    }
    return 0;
}

// Briefly highlight the key under (tx,ty) to give tactile press feedback,
// then restore it to its idle appearance.
void Numpad::flashKey(TFT_eSPI& tft, int tx, int ty, int originY,
                      NumpadMode mode, int keyH) {
    const char* (*keys)[3] = (mode == NUMPAD_PIN) ? KEYS_PIN : KEYS_AMOUNT;
    for (int r = 0; r < 4; r++) {
        for (int c = 0; c < 3; c++) {
            int x = c * KEY_W;
            int y = originY + r * keyH;
            if (tx >= x && tx < x + KEY_W && ty >= y && ty < y + keyH) {
                const char* label = keys[r][c];
                if (label[0] == ' ') return;
                drawKey(tft, c, r, originY, label, keyH, true);
                delay(70);
                drawKey(tft, c, r, originY, label, keyH, false);
                return;
            }
        }
    }
}
