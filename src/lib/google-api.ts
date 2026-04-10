import { GoogleSignin } from '@react-native-google-signin/google-signin';

const BASE_URLS: Record<string, string> = {
    gmail: 'https://gmail.googleapis.com',
    drive: 'https://www.googleapis.com',
    calendar: 'https://www.googleapis.com',
    people: 'https://people.googleapis.com',
    tasks: 'https://tasks.googleapis.com',
    docs: 'https://docs.googleapis.com',
    sheets: 'https://sheets.googleapis.com',
    slides: 'https://slides.googleapis.com',
};

// --- Token cache ---
// Google access tokens are valid for ~1 hour. We refresh 5 minutes early.
// RNGoogleSignin's native Android bridge does NOT support concurrent promise
// invocations — calling getTokens() or signInSilently() from multiple JS
// callsites simultaneously causes "cannot resolve promise because it's null".
// We prevent this by (a) caching the token and (b) funnelling all token
// fetches through a single in-flight promise at a time.

let cachedToken: string | null = null;
let tokenExpiry = 0; // epoch ms
let tokenInflight: Promise<string> | null = null;
let refreshInflight: Promise<string> | null = null;

function invalidateTokenCache(): void {
    cachedToken = null;
    tokenExpiry = 0;
    tokenInflight = null;
}

export async function getAccessToken(): Promise<string> {
    // Serve from cache while token is still fresh
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    // Serialize concurrent calls: if a fetch is already in-flight, reuse it
    if (tokenInflight) {
        return tokenInflight;
    }

    tokenInflight = GoogleSignin.getTokens()
        .then(tokens => {
            cachedToken = tokens.accessToken;
            // Buffer 5 min before actual expiry
            tokenExpiry = Date.now() + 55 * 60 * 1000;
            tokenInflight = null;
            return tokens.accessToken;
        })
        .catch(err => {
            tokenInflight = null;
            throw err;
        });

    return tokenInflight;
}

async function refreshAccessToken(): Promise<string> {
    // Prevent concurrent refresh calls — they all share one signInSilently()
    if (refreshInflight) {
        return refreshInflight;
    }

    refreshInflight = (async () => {
        try {
            invalidateTokenCache();
            await GoogleSignin.signInSilently();
            return getAccessToken();
        } finally {
            refreshInflight = null;
        }
    })();

    return refreshInflight;
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

interface GoogleFetchOptions extends Omit<RequestInit, 'headers'> {
    headers?: Record<string, string>;
}

export async function googleFetch<T = any>(
    url: string,
    options: GoogleFetchOptions = {},
    retryCount = 0,
): Promise<T> {
    const token = await getAccessToken();
    const { headers = {}, ...rest } = options;

    const response = await fetch(url, {
        ...rest,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...headers,
        },
    });

    // Handle token expiry — refresh and retry once
    if (response.status === 401 && retryCount === 0) {
        await refreshAccessToken();
        return googleFetch<T>(url, options, 1);
    }

    // Handle rate limiting with exponential backoff (max 3 retries)
    if (response.status === 429 && retryCount < 3) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, retryCount + 1) * 1000;
        await delay(waitMs);
        return googleFetch<T>(url, options, retryCount + 1);
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Google API error ${response.status}: ${errorBody}`,
        );
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

export interface PaginatedResponse<T> {
    items: T[];
    nextPageToken?: string;
}

/**
 * Fetches all pages of a paginated Google API endpoint.
 * `extractItems` maps each response page to an array of items.
 * `getNextPageToken` extracts the next page token from the response.
 */
export async function fetchAllPages<TResponse, TItem>(
    url: string,
    extractItems: (response: TResponse) => TItem[],
    getNextPageToken: (response: TResponse) => string | undefined,
    maxPages = 100,
): Promise<TItem[]> {
    const allItems: TItem[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
        const separator = url.includes('?') ? '&' : '?';
        const pageUrl = pageToken
            ? `${url}${separator}pageToken=${encodeURIComponent(pageToken)}`
            : url;

        const response = await googleFetch<TResponse>(pageUrl);
        const items = extractItems(response);
        allItems.push(...items);

        pageToken = getNextPageToken(response);
        pageCount++;
    } while (pageToken && pageCount < maxPages);

    return allItems;
}

export { BASE_URLS };
