import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';

// ---------------------------------------------------------------------------
// OAuth2 token management — exchanges auth codes for refresh tokens and
// refreshes access tokens server-side so syncs never depend on client tokens.
// ---------------------------------------------------------------------------

// Web client credentials — ID is public, secret is stored as a Firebase secret
const GOOGLE_CLIENT_ID =
    '793784621156-jpa4tc7g68ap6hdmspi442m9102p46hs.apps.googleusercontent.com';
export const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
}

// ---------------------------------------------------------------------------
// Exchange a one-time server auth code (from GoogleSignin.signIn) for a
// long-lived refresh token. Called once after the user signs in.
// ---------------------------------------------------------------------------
export async function exchangeAuthCode(authCode: string): Promise<{
    accessToken: string;
    refreshToken: string;
}> {
    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code: authCode,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET.value(),
            grant_type: 'authorization_code',
            // Empty redirect_uri — Android native auth codes don't use one
            redirect_uri: '',
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        logger.error('Auth code exchange failed', { status: res.status, err });
        throw new Error(`Token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as TokenResponse;

    if (!data.refresh_token) {
        throw new Error('No refresh_token returned — user may need to re-consent');
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
    };
}

// ---------------------------------------------------------------------------
// Refresh an access token using a stored refresh token. Called before every
// automated sync to guarantee a valid ~60-min access token.
// ---------------------------------------------------------------------------
export async function refreshAccessTokenServer(refreshToken: string): Promise<string> {
    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET.value(),
            grant_type: 'refresh_token',
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        logger.error('Token refresh failed', { status: res.status, err });
        throw new Error(`Token refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as TokenResponse;
    return data.access_token;
}

// ---------------------------------------------------------------------------
// High-level helper — reads the stored refresh token for a user from Firestore
// and returns a fresh access token. Single entry point for all automated syncs.
// ---------------------------------------------------------------------------
export async function getAccessTokenForUser(uid: string): Promise<string> {
    const db = admin.firestore();
    const tokenDoc = await db.doc(`users/${uid}/tokens/google`).get();
    const data = tokenDoc.data();

    if (!data?.refreshToken) {
        throw new Error(`No refresh token stored for user ${uid}`);
    }

    return refreshAccessTokenServer(data.refreshToken);
}

// ---------------------------------------------------------------------------
// Persist the refresh token + email mapping after auth code exchange.
// The email is stored alongside the token so Gmail push notifications
// (which only contain the email address) can resolve back to a UID.
// ---------------------------------------------------------------------------
export async function storeTokens(
    uid: string,
    refreshToken: string,
    email: string,
): Promise<void> {
    const db = admin.firestore();
    await db.doc(`users/${uid}/tokens/google`).set({
        refreshToken,
        email,
        storedAt: new Date().toISOString(),
    });
}
