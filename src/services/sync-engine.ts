import { auth } from '../lib/firebase';

// Cloud Function URL for server-side initial sync + watch setup
const INITIALIZE_SYNC_URL = 'https://us-central1-neuron-bb594.cloudfunctions.net/initializeSync';

/**
 * Triggers initial sync on the server. The backend reads the user's stored
 * permissions, syncs all enabled services using the stored refresh token,
 * and sets up push notification watches. All subsequent syncs are automatic
 * — this only needs to be called once after permissions are saved/changed.
 */
export async function triggerInitialSync(): Promise<{ success: boolean }> {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const idToken = await user.getIdToken();

    const response = await fetch(INITIALIZE_SYNC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        // onCall expects a { data: {} } wrapper
        body: JSON.stringify({ data: {} }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`initializeSync failed: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as { result?: { success: boolean } };
    return json.result ?? { success: true };
}
