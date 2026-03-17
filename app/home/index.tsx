import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { useAuthStore } from '../../src/store/authStore';
import { signOutUser } from '../../src/lib/auth';
import {
    isBiometricAvailable,
    isBiometricEnabled,
    enableBiometric,
    disableBiometric,
    getBiometricType,
} from '../../src/lib/biometric';

export default function HomeScreen() {
    const { user } = useAuthStore();
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [biometricType, setBiometricType] = useState('Biometric');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkBiometricStatus();
    }, []);

    const checkBiometricStatus = async () => {
        const available = await isBiometricAvailable();
        const enabled = await isBiometricEnabled();
        const type = await getBiometricType();
        setBiometricAvailable(available);
        setBiometricEnabled(enabled);
        setBiometricType(type);
    };

    const handleLogout = async () => {
        setLoading(true);
        try {
            await signOutUser();
        } catch (error) {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleBiometricToggle = async () => {
        if (biometricEnabled) {
            try {
                await disableBiometric();
                setBiometricEnabled(false);
                Alert.alert('Success', 'Biometric authentication has been disabled.');
            } catch {
                Alert.alert('Error', 'Failed to disable biometric authentication.');
            }
        } else {
            const success = await enableBiometric();
            if (success) {
                setBiometricEnabled(true);
                Alert.alert('Success', 'Biometric authentication has been enabled.');
            } else {
                Alert.alert('Error', 'Failed to enable biometric authentication.');
            }
        }
    };

    const getProvider = (): string => {
        if (!user?.providerData || user.providerData.length === 0) {
            return 'Email';
        }
        const provider = user.providerData[0];
        switch (provider?.providerId) {
            case 'google.com':
                return 'Google';
            case 'password':
                return 'Email';
            default:
                return provider?.providerId || 'Email';
        }
    };

    const getUserName = (): string => {
        if (user?.displayName) {
            return user.displayName;
        }
        if (user?.email) {
            return user.email.split('@')[0];
        }
        return 'User';
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Home</Text>
                </View>

                <View style={styles.profileCard}>
                    {user?.photoURL ? (
                        <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                                {getUserName().charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}

                    <Text style={styles.userName}>{getUserName()}</Text>
                    <Text style={styles.userEmail}>{user?.email}</Text>

                    <View style={styles.badgeContainer}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{getProvider()}</Text>
                        </View>
                        {user?.emailVerified && (
                            <View style={[styles.badge, styles.verifiedBadge]}>
                                <Text style={[styles.badgeText, styles.verifiedText]}>
                                    Verified
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>Account Information</Text>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>User ID</Text>
                        <Text style={styles.infoValue} numberOfLines={1}>
                            {user?.uid?.substring(0, 12)}...
                        </Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Signed In</Text>
                        <Text style={styles.infoValue}>
                            {user?.metadata?.lastSignInTime
                                ? new Date(user.metadata.lastSignInTime).toLocaleString()
                                : 'Unknown'}
                        </Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Account Created</Text>
                        <Text style={styles.infoValue}>
                            {user?.metadata?.creationTime
                                ? new Date(user.metadata.creationTime).toLocaleString()
                                : 'Unknown'}
                        </Text>
                    </View>
                </View>

                {biometricAvailable && (
                    <View style={styles.biometricSection}>
                        <View style={styles.biometricRow}>
                            <View>
                                <Text style={styles.biometricTitle}>Biometric Login</Text>
                                <Text style={styles.biometricSubtitle}>
                                    {biometricEnabled
                                        ? 'Enabled'
                                        : `Use ${biometricType} to sign in`}
                                </Text>
                            </View>
                            <Button
                                title={biometricEnabled ? 'Disable' : 'Enable'}
                                onPress={handleBiometricToggle}
                                variant={biometricEnabled ? 'outline' : 'primary'}
                                style={styles.biometricButton}
                            />
                        </View>
                    </View>
                )}

                <View style={styles.logoutSection}>
                    <Button
                        title="Sign Out"
                        onPress={handleLogout}
                        loading={loading}
                        variant="outline"
                        style={styles.logoutButton}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    scrollContent: {
        padding: 24,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#333',
    },
    profileCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        marginBottom: 24,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        marginBottom: 16,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarText: {
        fontSize: 40,
        fontWeight: 'bold',
        color: '#fff',
    },
    userName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 16,
        color: '#666',
        marginBottom: 16,
    },
    badgeContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    badge: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    verifiedBadge: {
        backgroundColor: '#34C759',
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    verifiedText: {
        color: '#fff',
    },
    infoSection: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    infoLabel: {
        fontSize: 14,
        color: '#666',
    },
    infoValue: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
        maxWidth: '50%',
        textAlign: 'right',
    },
    biometricSection: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        marginBottom: 24,
    },
    biometricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    biometricTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    biometricSubtitle: {
        fontSize: 14,
        color: '#666',
    },
    biometricButton: {
        paddingHorizontal: 20,
        minHeight: 40,
    },
    logoutSection: {
        marginTop: 8,
    },
    logoutButton: {
        borderColor: '#FF3B30',
    },
});
