#pragma once

#define MODERN_SENSOR_COUNT 6
#define MODERN_SAMPLE_WINDOW_MS 80
#define MODERN_FILTER_ALPHA 8
#define MODERN_FILTER_BETA 3
#define MODERN_OUTPUT_LIMIT 220

int compute_speed(int baseValue);
int compute_profiled_speed(int baseValue, int ambientCelsius, int profileBias);
int build_speed_table(const int *inputValues, int valueCount, int *outputValues);

#define MODERN_PROFILE_QUIET 0
#define MODERN_PROFILE_BALANCED 1
#define MODERN_PROFILE_COOLING 2
#define MODERN_PROFILE_STRESS 3

#define MODERN_TRACE_FLAG_TREE_VIEW 0x01
#define MODERN_TRACE_FLAG_INLINE_DIFF 0x02
#define MODERN_TRACE_FLAG_STATUS_BADGES 0x04
#define MODERN_TRACE_FLAG_THEME_SWITCH 0x08
#define MODERN_TRACE_FLAG_REFRESH_LOCK 0x10

typedef struct ModernSpeedConfig {
  int sensorCount;
  int sampleWindowMs;
  int outputLimit;
  int minimumDuty;
  int maximumDuty;
  int recoveryStep;
  int profileBias[4];
} ModernSpeedConfig;

int compute_profile_window(const ModernSpeedConfig *config, int ambientCelsius);
int normalize_trace_flags(int flags);
void fill_profile_bias(const ModernSpeedConfig *config, int *targetValues, int valueCount);

#define MODERN_TRACE_LABEL "modern-inline-monitor"
#define MODERN_TRACE_OWNER "release-lab"
#define MODERN_TRACE_CHANNEL "right-only-fixture"
#define MODERN_TRACE_BUILD "2026.03.13-refined"

int collect_trace_snapshot(
  const ModernSpeedConfig *config,
  int ambientCelsius,
  int *outputValues,
  int outputCount
);

int summarize_trace_owner(const char *label, const char *owner, const char *channel);
int build_modern_snapshot_name(const char *prefix, int buildNumber, char *outputBuffer, int outputLength);

int compute_modern_threshold(int level, int sampleWindowMs, int sensorCount);
int render_modern_trace_line(const char *label, int lineNumber, char *outputBuffer, int outputLength);
int describe_modern_fixture(const char *label, char *outputBuffer, int outputLength);
int append_modern_padding(const char *label, const char *owner, char *outputBuffer, int outputLength);
int modern_fixture_tail_marker(void);
int modern_fixture_tail_marker_2(void);
