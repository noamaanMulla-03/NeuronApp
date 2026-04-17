import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from './src/lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { useAuthStore } from './src/store/authStore';
import {
    isBiometricEnabled,
    authenticateWithBiometric,
} from './src/lib/biometric';

import { writeUserDoc } from './src/lib/firestore';
import LoginScreen from './app/auth/login';
import HomeScreen from './app/home/index';
import ProfileScreen from './app/home/profile';
import GSuiteConnectScreen from './app/home/gsuite-connect';
import GSuiteStatusScreen from './app/home/gsuite-status';
import GSuiteDataScreen from './app/home/gsuite-data';
import SemanticChatScreen from './app/home/semantic-chat';
import GhostwriterScreen from './app/home/ghostwriter';

const Stack = createNativeStackNavigator();

const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
);

const AppStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="GSuiteConnect" component={GSuiteConnectScreen} />
        <Stack.Screen name="GSuiteStatus" component={GSuiteStatusScreen} />
        <Stack.Screen name="GSuiteData" component={GSuiteDataScreen} />
        <Stack.Screen name="SemanticChat" component={SemanticChatScreen} />
        <Stack.Screen name="Ghostwriter" component={GhostwriterScreen} />
    </Stack.Navigator>
);

function AppNavigator() {
    const { user, setUser } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [authLoading, setAuthLoading] = useState(false);
    const [biometricVerified, setBiometricVerified] = useState(false);
    const [biometricEnabled, setBiometricEnabled] = useState(false);

    const isFirstAuthCheck = useRef(true);

    useEffect(() => {
        GoogleSignin.configure({
            webClientId:
                '793784621156-jpa4tc7g68ap6hdmspi442m9102p46hs.apps.googleusercontent.com',
            offlineAccess: true,
            scopes: [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/contacts.readonly',
                'https://www.googleapis.com/auth/tasks.readonly',
                'https://www.googleapis.com/auth/documents.readonly',
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/presentations.readonly',
            ],
        });
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Persist the device timezone so backend briefing generation can use it.
                // Fire-and-forget — non-critical, silent on failure.
                writeUserDoc(firebaseUser.uid, ['settings', 'timezone'], {
                    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }).catch(e => console.warn('Timezone write failed:', e));

                const enabled = await isBiometricEnabled();
                setBiometricEnabled(enabled);

                if (isFirstAuthCheck.current) {
                    isFirstAuthCheck.current = false;

                    if (enabled) {
                        setAuthLoading(true);
                        const success = await authenticateWithBiometric();
                        setAuthLoading(false);

                        if (success) {
                            setBiometricVerified(true);
                            setLoading(false);
                        } else {
                            await signOut(auth);
                            setUser(null);
                            setBiometricVerified(false);
                            setLoading(false);
                        }
                    } else {
                        setLoading(false);
                    }
                } else {
                    setLoading(false);
                }
            } else {
                // Reset so the next sign-in triggers the biometric check again
                isFirstAuthCheck.current = true;
                setLoading(false);
                setBiometricVerified(false);
                setBiometricEnabled(false);
            }
        });

        return () => unsubscribe();
    }, [setUser]);

    if (loading || authLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>
                    {authLoading ? 'Authenticating...' : 'Loading...'}
                </Text>
            </View>
        );
    }

    const showApp = user && (!biometricEnabled || biometricVerified);

    return (
        <NavigationContainer>
            {showApp ? <AppStack /> : <AuthStack />}
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <SafeAreaProvider>
            <AppNavigator />
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666',
    },
});
