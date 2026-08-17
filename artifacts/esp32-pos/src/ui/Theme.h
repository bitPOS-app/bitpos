#pragma once
#include <TFT_eSPI.h>

// Display orientation — landscape (320 wide x 240 tall) fills the full CYD screen.
// The CYD's ILI9341 is physically mounted landscape (320×240 hardware).
// Portrait rotation (2) only draws 240 of the 320 physical columns → right-side static.
// rotation=1: landscape, USB at bottom. If content appears upside-down, try rotation=3.
#define SCREEN_ROTATION 1
#define SCREEN_W        320
#define SCREEN_H        240

// Colour palette (TFT_eSPI 16-bit RGB565). Refreshed for a cleaner, modern
// dark POS look with the authentic Bitcoin orange (#F7931A) as the accent.
#define COL_BG          0x0841   // #0A0A0C — deep neutral black
#define COL_CARD        0x10A3   // #16171B — surface card
#define COL_CARD_HI     0x2105   // #20222A — elevated card / pressed key
#define COL_ACCENT      0xF483   // #F7931A — Bitcoin orange
#define COL_ACCENT_DIM  0x7A41   // #7A4A0D — dim orange (inactive rings)
#define COL_TEXT        TFT_WHITE
#define COL_MUTED       0x8C73   // #8A8F9A — muted grey-blue
#define COL_SUCCESS     0x1509   // #16A34A — green (Pay button, success ring)
#define COL_SUCCESS_DK  0x0BC6   // #0E7A37 — darker green ring
#define COL_DOT_OK      0x07E0   // #00FF00 — bright pure green (health dot, reads clearly on the dim CYD)
#define COL_ERROR       0xD924   // #DC2626 — red
#define COL_ERROR_DK    0x98C3   // #991B1B — darker red ring
#define COL_BORDER      0x2966   // #2A2D36 — subtle border

// CYD touch (XPT2046) raw ADC calibration — tune per unit if needed.
// XPT2046_Touchscreen returns 12-bit values (0-4095).
// With SCREEN_ROTATION=2 (180°), axes are inverted in readTouch().
#define TOUCH_X_MIN  200
#define TOUCH_X_MAX  3800
#define TOUCH_Y_MIN  200
#define TOUCH_Y_MAX  3800

// Font sizes (TFT_eSPI built-in fonts 1-8)
#define FONT_SMALL      2   // ~14px
#define FONT_MED        4   // ~26px
#define FONT_LARGE      6   // ~48px
#define FONT_BODY       2
