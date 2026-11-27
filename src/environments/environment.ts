/** Production / Docker demo build. */
export const environment = {
  production: true,
  apiBaseUrl: '/api',
  simulateLatency: false,
  simulateErrorRate: 0,
  /** Enables ?now=2026-12-16T10:30. On for the demo image so any date can be tried during review. Turn it off for real production use. */
  allowClockOverride: true,
};
