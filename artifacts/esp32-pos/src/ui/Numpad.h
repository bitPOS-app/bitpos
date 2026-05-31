#pragma once
#include <TFT_eSPI.h>
#include "../ui/Theme.h"

enum NumpadMode { NUMPAD_AMOUNT, NUMPAD_PIN };

class Numpad {
public:
    // Draw numpad at originY. keyH overrides the default key height (50px).
    void draw(TFT_eSPI& tft, int originY,
              NumpadMode mode = NUMPAD_AMOUNT, int keyH = 50);

    // Returns key char or 0 if no hit.
    // NUMPAD_AMOUNT: '0'-'9', '.' (decimal point), 0x08 (backspace)
    // NUMPAD_PIN:    '0'-'9', 0x08 (backspace)
    char handleTouch(int tx, int ty, int originY,
                     NumpadMode mode = NUMPAD_AMOUNT, int keyH = 50);

    // Briefly highlight the key under (tx,ty) for tactile press feedback.
    void flashKey(TFT_eSPI& tft, int tx, int ty, int originY,
                  NumpadMode mode = NUMPAD_AMOUNT, int keyH = 50);

private:
    static const int COLS = 3;

    void drawKey(TFT_eSPI& tft, int col, int row, int originY,
                 const char* label, int keyH, bool highlight = false);
};
