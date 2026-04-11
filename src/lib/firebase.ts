import { initializeApp, getApps } from 'firebase/app';
import { Auth, Persistence, ReactNativeAsyncStorage, initializeAuth, getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// getReactNativePersistence is available at runtime via Metro's react-native export
// condition on @firebase/auth, but the default TypeScript types don't expose it.
const { getReactNativePersistence } = require('@firebase/auth') as {
    getReactNativePersistence: (storage: ReactNativeAsyncStorage) => Persistence;
};

const firebaseConfig = {
    apiKey: 'AIzaSyCSnaUj81X2uugcGZs3K3xan3DZPYBUD0Y',
    authDomain: 'neuron-bb594.firebaseapp.com',
    projectId: 'neuron-bb594',
    storageBucket: 'neuron-bb594.firebasestorage.app',
    messagingSenderId: '793784621156',
    appId: '1:793784621156:web:2e2c4ada0b0bce353f2771',
};

const app =
    getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let auth: Auth;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });
} catch {
    // Auth already initialized (e.g. during hot reload)
    auth = getAuth(app);
}

export { auth, app };
