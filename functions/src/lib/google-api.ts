const BASE_URLS: Record<string, string> = {
  gmail: 'https://gmail.googleapis.com',
  drive: 'https://www.googleapis.com',
  calendar: 'https://www.googleapis.com',
  people: 'https://people.googleapis.com',
  tasks: 'https://tasks.googleapis.com',
  docs: 'https://docs.googleapis.com',
  sheets: 'https://sheets.googleapis.com',
  slides: 'https://slides.googleapis.com',
  keep: 'https://keep.googleapis.com',
  chat: 'https://chat.googleapis.com',
};

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface GoogleFetchOptions extends Omit<RequestInit, 'headers'> {
    headers?: Record<string, string>;
    responseType?: 'json' | 'text';
}

export async function googleFetch<T = any>(
  accessToken: string,
  url: string,
  options: GoogleFetchOptions = {},
  retryCount = 0,
): Promise<T> {
  const { headers = {}, responseType = 'json', ...rest } = options;

  const response = await fetch(url, {
    ...rest,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  // Note: On the server, we don't handle token refresh directly — the client
  // should ideally pass a fresh token or we would use a refresh token here.
  // For now, if the token is 401, we just throw and let the client retry.
  if (response.status === 401) {
    throw new Error('UNAUTHENTICATED');
  }

  // Handle rate limiting with exponential backoff (max 3 retries)
  if (response.status === 429 && retryCount < 3) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ?
      parseInt(retryAfter, 10) * 1000 :
      Math.pow(2, retryCount + 1) * 1000;
    await delay(waitMs);
    return googleFetch<T>(accessToken, url, options, retryCount + 1);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google API error ${response.status}: ${errorBody}`,
    );
  }

  if (responseType === 'text') {
    return (await response.text()) as any;
  }

  return response.json() as Promise<T>;
}

export function buildUrl(
  base: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export { BASE_URLS };
