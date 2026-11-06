#if MOTOR_BOOT_TEST
#include "BootTrial.h"
#include <Arduino.h>
#include <driver/rmt.h>
#include <esp32-hal-matrix.h>

#ifndef MOTOR_BOOT_DUAL_TEST
#define MOTOR_BOOT_DUAL_TEST 0
#endif

namespace {
constexpr int FrontButton = 41;
constexpr auto Channel = RMT_CHANNEL_0;
constexpr unsigned HoldMs = 200;
constexpr bool Dual = MOTOR_BOOT_DUAL_TEST == 1;
constexpr unsigned Items = 40;
constexpr unsigned PulseMs = Dual ? 2000 : 100;
constexpr unsigned SegmentUs = Dual ? 25000 : 1250;
static_assert(Items * 2 * SegmentUs == PulseMs * 1000, "Check boot pulse duration");
static_assert(SegmentUs <= 0x7fff, "Fit the duration in the RMT 15-bit field");
static_assert(Items + 1 <= SOC_RMT_MEM_WORDS_PER_CHANNEL, "Fit the waveform and end marker in one block");

bool pressed() {
  return digitalRead(FrontButton) == LOW;
}
}

const char* runBootTrial(int outputPin, int secondOutputPin, bool outputsReady, esp_reset_reason_t reset) {
  if (!outputsReady || reset != ESP_RST_POWERON) return "起動試験なし";
  pinMode(FrontButton, INPUT_PULLUP);
  if (!pressed()) return "起動試験なし";

  const auto heldSince = millis();
  while (millis() - heldSince < HoldMs) {
    if (!pressed()) return "ボタン離し・停止";
    delay(5);
  }

  // The dual trial holds HIGH throughout; the complete pulse and terminator fit in RMT memory.
  rmt_item32_t waveform[Items]{};
  for (auto& item : waveform) {
    item.level0 = 1;
    item.duration0 = SegmentUs;
    item.level1 = Dual;
    item.duration1 = SegmentUs;
  }
  rmt_config_t config = RMT_DEFAULT_CONFIG_TX(static_cast<gpio_num_t>(outputPin), Channel);
  config.clk_div = 80;
  config.tx_config.loop_en = false;
  config.tx_config.idle_output_en = true;
  config.tx_config.idle_level = RMT_IDLE_LEVEL_LOW;

  const bool configured = rmt_config(&config) == ESP_OK;
  const bool installed = configured && rmt_driver_install(Channel, 0, 0) == ESP_OK;
  uint32_t clockHz = 0;
  const bool clockReady = installed && rmt_get_counter_clock(Channel, &clockHz) == ESP_OK && clockHz == 1000000;
  const bool trialReady = clockReady && (!Dual || secondOutputPin >= 0);
  const char* result = "起動試験エラー";
  if (trialReady) {
    // Both sides share one timed signal and stop together.
    if (Dual) pinMatrixOutAttach(secondOutputPin, RMT_SIG_OUT0_IDX, false, false);
    if (!pressed()) {
      result = "ボタン離し・停止";
    } else if (rmt_write_items(Channel, waveform, Items, false) == ESP_OK) {
      const auto started = millis();
      while (pressed() && millis() - started <= PulseMs + 50) {
        const auto status = rmt_wait_tx_done(Channel, 0);
        if (status == ESP_OK) {
          result = "起動出力を送信";
          break;
        }
        if (status != ESP_ERR_TIMEOUT) break;
        delay(1);
      }
      if (!pressed()) result = "ボタン離し・停止";
    }
  }
  if (configured) rmt_tx_stop(Channel);
  // Route the output back to an already-low GPIO before freeing the peripheral.
  digitalWrite(outputPin, LOW);
  pinMatrixOutDetach(outputPin, false, false);
  if (trialReady && Dual) {
    digitalWrite(secondOutputPin, LOW);
    pinMatrixOutDetach(secondOutputPin, false, false);
  }
  if (installed) rmt_driver_uninstall(Channel);
  return result;
}
#endif
