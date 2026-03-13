#include "module.h"

static int clamp_speed(int value, int minimum, int maximum) {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

static int apply_profile_bias(int scaled, int profileBias) {
  if (profileBias < 0) {
    return scaled - 4;
  }

  if (profileBias > 3) {
    return scaled + 9;
  }

  return scaled + profileBias + 1;
}

static int adjust_for_temperature(int currentSpeed, int ambientCelsius) {
  if (ambientCelsius < 5) {
    return currentSpeed + 10;
  }

  if (ambientCelsius > 55) {
    return currentSpeed - 6;
  }

  return currentSpeed;
}

int compute_speed(int baseValue) {
  int scaled = baseValue * 3;
  int offset = scaled + 6;
  return clamp_speed(offset, 24, 220);
}

int compute_profiled_speed(int baseValue, int ambientCelsius, int profileBias) {
  int scaled = baseValue * 3;
  int biased = apply_profile_bias(scaled, profileBias);
  int compensated = adjust_for_temperature(biased + 6, ambientCelsius);
  return clamp_speed(compensated, 24, 220);
}

int build_speed_table(const int *inputValues, int valueCount, int *outputValues) {
  int index = 0;

  if (!inputValues || !outputValues || valueCount <= 0) {
    return 0;
  }

  for (index = 0; index < valueCount; index += 1) {
    outputValues[index] = compute_profiled_speed(inputValues[index], 24, 3);
  }

  return valueCount;
}

static const int modern_profile_table[] = {
  24, 30, 36, 44, 52, 60, 70, 80, 90, 100,
  110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
};

int summarize_profile_table(void) {
  int index = 0;
  int total = 0;

  for (index = 0; index < (int)(sizeof(modern_profile_table) / sizeof(modern_profile_table[0])); index += 1) {
    total += modern_profile_table[index];
  }

  return total;
}

int compute_profile_window(int sampleWindowMs, int sensorCount) {
  int normalizedWindow = sampleWindowMs / 4;
  return clamp_speed(normalizedWindow + sensorCount * 4, 12, 220);
}

int summarize_profile_span(void) {
  return modern_profile_table[0] + modern_profile_table[5] + modern_profile_table[10] + modern_profile_table[15];
}
