import {
    signOut,
    GoogleAuthProvider,
    signInWithCredential,
    User,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from './firebase';

// Cloud Function URL for exchanging the server auth code for a refresh token
const STORE_TOKEN_URL = 'https://us-central1-neuron-bb594.cloudfunctions.net/storeRefreshToken';

export const signInWithGoogle = async (): Promise<User> => {
    await GoogleSignin.hasPlayServices();

    const result = await GoogleSignin.signIn();

    if (!result.data?.idToken) {
        throw new Error('No ID token received from Google');
    }

    // Exchange the Google ID token for a Firebase credential
    const googleCredential = GoogleAuthProvider.credential(result.data.idToken);
    const userCredential = await signInWithCredential(auth, googleCredential);

    // Capture the server auth code (available because offlineAccess: true) and
    // send it to the backend to exchange for a long-lived refresh token. This
    // is what enables fully automated server-side syncing without the client
    // needing to pass access tokens for every sync.
    const serverAuthCode = result.data?.serverAuthCode;
    if (serverAuthCode) {
        const idToken = await userCredential.user.getIdToken();
        // Fire-and-forget — non-critical for the sign-in flow itself
        fetch(STORE_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ data: { authCode: serverAuthCode } }),
        }).catch(e => console.warn('storeRefreshToken call failed:', e));
    }

    return userCredential.user;
};

export const signOutUser = async (): Promise<void> => {
    await signOut(auth);
    try {
        await GoogleSignin.signOut();
    } catch {
        // Not signed in with Google — safe to ignore
    }
};

export const getCurrentUser = (): User | null => {
    return auth.currentUser;
};
