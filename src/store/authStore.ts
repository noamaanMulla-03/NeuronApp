import { create } from 'zustand';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthState {
    user: FirebaseUser | null;
    loading: boolean;
    error: string | null;
    setUser: (user: FirebaseUser | null) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    initializeAuth: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    loading: true,
    error: null,

    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    initializeAuth: () => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            set({ user, loading: false });
        });
        return unsubscribe;
    },
}));
