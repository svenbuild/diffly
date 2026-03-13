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
    return scaled - 3;
  }

  if (profileBias > 3) {
    return scaled + 6;
  }

  return scaled + profileBias;
}

static int adjust_for_temperature(int currentSpeed, int ambientCelsius) {
  if (ambientCelsius < 5) {
    return currentSpeed + 8;
  }

  if (ambientCelsius > 55) {
    return currentSpeed - 5;
  }

  return currentSpeed;
}

int compute_speed(int baseValue) {
  int scaled = baseValue * 2;
  int offset = scaled + 4;
  return clamp_speed(offset, 24, 180);
}

int compute_profiled_speed(int baseValue, int ambientCelsius, int profileBias) {
  int scaled = baseValue * 2;
  int biased = apply_profile_bias(scaled, profileBias);
  int compensated = adjust_for_temperature(biased + 4, ambientCelsius);
  return clamp_speed(compensated, 24, 180);
}

int build_speed_table(const int *inputValues, int valueCount, int *outputValues) {
  int index = 0;

  if (!inputValues || !outputValues || valueCount <= 0) {
    return 0;
  }

  for (index = 0; index < valueCount; index += 1) {
    outputValues[index] = compute_profiled_speed(inputValues[index], 24, 2);
  }

  return valueCount;
}
