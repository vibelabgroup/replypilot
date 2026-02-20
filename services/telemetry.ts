export const trackEvent = (event: string, properties: Record<string, unknown> = {}) => {
  const payload = {
    event,
    properties,
    timestamp: new Date().toISOString(),
  };
  // Placeholder transport until analytics SDK is selected.
  console.info('[telemetry]', payload);
};

