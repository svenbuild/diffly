#pragma once

#define MODERN_SENSOR_COUNT 6
#define MODERN_SAMPLE_WINDOW_MS 80
#define MODERN_FILTER_ALPHA 8
#define MODERN_FILTER_BETA 3
#define MODERN_OUTPUT_LIMIT 220

int compute_speed(int baseValue);
int compute_profiled_speed(int baseValue, int ambientCelsius, int profileBias);
int build_speed_table(const int *inputValues, int valueCount, int *outputValues);
