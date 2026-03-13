#pragma once

#define LEGACY_SENSOR_COUNT 4
#define LEGACY_SAMPLE_WINDOW_MS 125
#define LEGACY_FILTER_ALPHA 6
#define LEGACY_FILTER_BETA 2
#define LEGACY_OUTPUT_LIMIT 180

int compute_speed(int baseValue);
int compute_profiled_speed(int baseValue, int ambientCelsius, int profileBias);
int build_speed_table(const int *inputValues, int valueCount, int *outputValues);
