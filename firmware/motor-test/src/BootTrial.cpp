#if MOTOR_BOOT_TEST
#include "BootTrial.h"
#include <Arduino.h>
#include <driver/rmt.h>
#include <esp32-hal-matrix.h>

namespace {
constexpr int FrontButton = 41;
constexpr auto Channel = RMT_CHANNEL_0;
constexpr unsigned HoldMs = 200;
constexpr unsigned Periods = 40;
constexpr unsigned HalfPeriodUs = 1250;
static_assert(Periods * 2 * HalfPeriodUs == 100000, "Boot pulse must end at 100ms");
static_assert(Periods + 1 <= 48, "ESP32-S3 waveform and end marker must fit in one RMT block");

bool pressed() {
  return digitalRead(FrontButton) == LOW;
}
}

const char* runBootTrial(int outputPin, bool outputsReady, esp_reset_reason_t reset) {
  if (!outputsReady || reset != ESP_RST_POWERON) return "起動試験なし";
  pinMode(FrontButton, INPUT_PULLUP);
  if (!pressed()) return "起動試験なし";

  const auto heldSince = millis();
  while (millis() - heldSince < HoldMs) {
    if (!pressed()) return "ボタン離し・停止";
    delay(5);
  }

  // Store the entire waveform in peripheral memory so it ends even if CPU work stalls.
  rmt_item32_t waveform[Periods]{};
  for (auto& period : waveform) {
    period.level0 = 1;
    period.duration0 = HalfPeriodUs;
    period.level1 = 0;
    period.duration1 = HalfPeriodUs;
  }
  rmt_config_t config = RMT_DEFAULT_CONFIG_TX(static_cast<gpio_num_t>(outputPin), Channel);
  config.clk_div = 80;
  config.tx_config.loop_en = false;
  config.tx_config.idle_output_en = true;
  config.tx_config.idle_level = RMT_IDLE_LEVEL_LOW;

  const bool configured = rmt_config(&config) == ESP_OK;
  const bool installed = configured && rmt_driver_install(Channel, 0, 0) == ESP_OK;
  uint32_t clockHz = 0;
  const char* result = "起動試験エラー";
  if (installed && rmt_get_counter_clock(Channel, &clockHz) == ESP_OK && clockHz == 1000000) {
    if (!pressed()) {
      result = "ボタン離し・停止";
    } else if (rmt_write_items(Channel, waveform, Periods, false) == ESP_OK) {
      const auto started = millis();
      while (pressed() && millis() - started <= 150) {
        const auto status = rmt_wait_tx_done(Channel, 1);
        if (status == ESP_OK) {
          result = "起動出力を送信";
          break;
        }
        if (status != ESP_ERR_TIMEOUT) break;
      }
      if (!pressed()) result = "ボタン離し・停止";
    }
  }
  if (configured) rmt_tx_stop(Channel);
  // Route the output back to an already-low GPIO before freeing the peripheral.
  digitalWrite(outputPin, LOW);
  pinMatrixOutDetach(outputPin, false, false);
  if (installed) rmt_driver_uninstall(Channel);
  return result;
}
#endif
