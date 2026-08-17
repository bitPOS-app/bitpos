#include "ResultScreen.h"
#include "../ui/Theme.h"

ResultType ResultScreen::_type     = RESULT_SUCCESS;
uint32_t   ResultScreen::_drawTime = 0;

void ResultScreen::draw(TFT_eSPI& tft, ResultType type,
                        long amountSats, const String& errorMsg) {
    _type     = type;
    _drawTime = millis();

    if (type == RESULT_SUCCESS) {
        tft.fillScreen(COL_SUCCESS);

        // Circle + tick — centred in upper 2/3 of landscape screen
        int cx = SCREEN_W / 2, cy = SCREEN_H / 2 - 20;
        tft.fillCircle(cx, cy, 46, COL_SUCCESS_DK);
        tft.fillCircle(cx, cy, 40, COL_SUCCESS);
        for (int d = -1; d <= 1; d++) {
            tft.drawLine(cx - 22, cy + d, cx - 6, cy + 18 + d, TFT_WHITE);
            tft.drawLine(cx - 6, cy + 18 + d, cx + 22, cy - 14 + d, TFT_WHITE);
        }

        tft.setTextColor(TFT_WHITE, COL_SUCCESS);
        tft.setTextDatum(TC_DATUM);
        tft.setTextFont(FONT_MED);
        tft.drawString("Payment received", SCREEN_W / 2, cy + 54);

        if (amountSats > 0) {
            char buf[32];
            snprintf(buf, sizeof(buf), "%ld sats", amountSats);
            tft.setTextFont(FONT_SMALL);
            tft.setTextColor(0xC7E0, COL_SUCCESS);
            tft.drawString(buf, SCREEN_W / 2, cy + 76);
        }

    } else {
        tft.fillScreen(COL_ERROR);

        int cx = SCREEN_W / 2, cy = SCREEN_H / 2 - 30;
        tft.fillCircle(cx, cy, 46, COL_ERROR_DK);
        tft.fillCircle(cx, cy, 40, COL_ERROR);
        for (int d = -1; d <= 1; d++) {
            tft.drawLine(cx - 20 + d, cy - 20, cx + 20 + d, cy + 20, TFT_WHITE);
            tft.drawLine(cx + 20 + d, cy - 20, cx - 20 + d, cy + 20, TFT_WHITE);
        }

        tft.setTextColor(TFT_WHITE, COL_ERROR);
        tft.setTextDatum(TC_DATUM);
        tft.setTextFont(FONT_MED);
        tft.drawString("Payment failed", SCREEN_W / 2, cy + 54);

        if (!errorMsg.isEmpty()) {
            String msg = errorMsg;
            if (msg.length() > 26) msg = msg.substring(0, 26) + "...";
            tft.setTextFont(FONT_SMALL);
            tft.setTextColor(0xFBAA, COL_ERROR);
            tft.drawString(msg, SCREEN_W / 2, cy + 74);
        }

        // Retry button
        tft.fillRoundRect(8, RETRY_Y, SCREEN_W - 16, RETRY_H, 12, TFT_WHITE);
        tft.setTextColor(COL_ERROR, TFT_WHITE);
        tft.setTextFont(FONT_MED);
        tft.drawString("Retry", SCREEN_W / 2, RETRY_Y + RETRY_H / 2);
    }
}

bool ResultScreen::handleTouch(int tx, int ty) {
    if (_type != RESULT_ERROR) return false;
    return (ty >= RETRY_Y && ty < RETRY_Y + RETRY_H);
}

bool ResultScreen::shouldAutoDismiss() {
    return (_type == RESULT_SUCCESS && millis() - _drawTime >= 3000);
}
