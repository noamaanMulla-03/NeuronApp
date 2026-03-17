import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithCredential,
    User,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from './firebase';

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
};

export const signUpWithEmail = async (email: string, password: string): Promise<User> => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await sendVerificationEmail();
    return result.user;
};

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

export const resetPassword = async (email: string): Promise<void> => {
    await sendPasswordResetEmail(auth, email);
};

export const sendVerificationEmail = async (): Promise<void> => {
    const user = auth.currentUser;
    if (user) {
        await sendEmailVerification(user);
    }
};

export const getCurrentUser = (): User | null => {
    return auth.currentUser;
};
