#pragma once
#include <TFT_eSPI.h>
#include <Arduino.h>

enum ResultType { RESULT_SUCCESS, RESULT_ERROR };

class ResultScreen {
public:
    // Draw success or error screen
    static void draw(TFT_eSPI& tft, ResultType type,
                     long amountSats = 0, const String& errorMsg = "");

    // Returns true if Retry was tapped (only meaningful for RESULT_ERROR)
    static bool handleTouch(int tx, int ty);

    // Returns true if 3 s auto-dismiss has elapsed (only for RESULT_SUCCESS)
    static bool shouldAutoDismiss();

private:
    static ResultType _type;
    static uint32_t   _drawTime;

    // landscape 320x240 — retry button near bottom
    static const int RETRY_Y = 182;
    static const int RETRY_H = 40;
};
