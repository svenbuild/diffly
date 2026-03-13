#pragma once

#define LEGACY_SENSOR_COUNT 4
#define LEGACY_SAMPLE_WINDOW_MS 125
#define LEGACY_FILTER_ALPHA 6
#define LEGACY_FILTER_BETA 2
#define LEGACY_OUTPUT_LIMIT 180

int compute_speed(int baseValue);
int compute_profiled_speed(int baseValue, int ambientCelsius, int profileBias);
int build_speed_table(const int *inputValues, int valueCount, int *outputValues);

#define LEGACY_PROFILE_QUIET 0
#define LEGACY_PROFILE_BALANCED 1
#define LEGACY_PROFILE_COOLING 2
#define LEGACY_PROFILE_STRESS 3

#define LEGACY_TRACE_FLAG_TREE_VIEW 0x01
#define LEGACY_TRACE_FLAG_INLINE_DIFF 0x02
#define LEGACY_TRACE_FLAG_STATUS_BADGES 0x04
#define LEGACY_TRACE_FLAG_THEME_SWITCH 0x08
#define LEGACY_TRACE_FLAG_REFRESH_LOCK 0x10

typedef struct LegacySpeedConfig {
  int sensorCount;
  int sampleWindowMs;
  int outputLimit;
  int minimumDuty;
  int maximumDuty;
  int recoveryStep;
  int profileBias[4];
} LegacySpeedConfig;

int compute_profile_window(const LegacySpeedConfig *config, int ambientCelsius);
int normalize_trace_flags(int flags);
void fill_profile_bias(const LegacySpeedConfig *config, int *targetValues, int valueCount);

#define LEGACY_TRACE_LABEL "legacy-inline-monitor"
#define LEGACY_TRACE_OWNER "integration-lab"
#define LEGACY_TRACE_CHANNEL "left-only-fixture"
#define LEGACY_TRACE_BUILD "2026.03.13-baseline"

int collect_trace_snapshot(
  const LegacySpeedConfig *config,
  int ambientCelsius,
  int *outputValues,
  int outputCount
);

int summarize_trace_owner(const char *label, const char *owner, const char *channel);
int build_legacy_snapshot_name(const char *prefix, int buildNumber, char *outputBuffer, int outputLength);

int compute_legacy_threshold(int level, int sampleWindowMs, int sensorCount);
int render_legacy_trace_line(const char *label, int lineNumber, char *outputBuffer, int outputLength);
int describe_legacy_fixture(const char *label, char *outputBuffer, int outputLength);
int append_legacy_padding(const char *label, const char *owner, char *outputBuffer, int outputLength);
int legacy_fixture_tail_marker(void);
