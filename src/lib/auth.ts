import {
    signOut,
    GoogleAuthProvider,
    signInWithCredential,
    User,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from './firebase';

export const signInWithGoogle = async (): Promise<User> => {
    await GoogleSignin.hasPlayServices();

    const result = await GoogleSignin.signIn();

    if (!result.data?.idToken) {
        throw new Error('No ID token received from Google');
    }

    const googleCredential = GoogleAuthProvider.credential(result.data.idToken);
    const userCredential = await signInWithCredential(auth, googleCredential);

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
