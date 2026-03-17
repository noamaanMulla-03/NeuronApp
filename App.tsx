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

import LoginScreen from './app/auth/login';
import RegisterScreen from './app/auth/register';
import ForgotPasswordScreen from './app/auth/forgot-password';
import HomeScreen from './app/home/index';

const Stack = createNativeStackNavigator();

const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
);

const AppStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
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
        });
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
            setUser(user);

            if (user) {
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
    }, []);

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
