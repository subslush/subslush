const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const unwrapApiData = <T>(response: { data?: unknown }): T => {
  const payload = response?.data;
  if (isRecord(payload) && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export const unwrapApiItems = <T>(
  response: { data?: unknown },
  fallbackKey: string
): T[] => {
  const payload = unwrapApiData<unknown>(response);

  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (isRecord(payload)) {
    const items = payload.items;
    if (Array.isArray(items)) {
      return items as T[];
    }
    const fallbackItems = payload[fallbackKey];
    if (Array.isArray(fallbackItems)) {
      return fallbackItems as T[];
    }
  }

  return [];
};
