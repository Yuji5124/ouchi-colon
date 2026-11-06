#pragma once

#include <esp_system.h>

// The returned label reports the waveform, not measured motor rotation.
const char* runBootTrial(int outputPin, int secondOutputPin, bool outputsReady, esp_reset_reason_t reset);
