import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { signOutUser } from '../../src/lib/auth';
import { theme } from '../../src/theme';
import { useNavigation } from '@react-navigation/native';

export default function ProfileScreen() {
    const { user } = useAuthStore();
    const navigation = useNavigation();

    const handleSignOut = async () => {
        try {
            await signOutUser();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                >
                    <Text style={styles.backIcon}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Cognitive Identity</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.profileHero}>
                    <View style={styles.avatarContainer}>
                        {user?.photoURL ? (
                            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>
                                    {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                                </Text>
                            </View>
                        )}
                        <View style={styles.statusBadge}>
                            <Text style={styles.statusText}>OPTIMIZED</Text>
                        </View>
                    </View>
                    <Text style={styles.userName}>{user?.displayName || 'User'}</Text>
                    <Text style={styles.userEmail}>{user?.email}</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Preferences</Text>
                    <TouchableOpacity style={styles.menuItem}>
                        <View style={styles.menuItemLeft}>
                            <Text style={styles.menuIcon}>🧠</Text>
                            <Text style={styles.menuLabel}>Neural Tuning</Text>
                        </View>
                        <Text style={styles.chevron}>→</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem}>
                        <View style={styles.menuItemLeft}>
                            <Text style={styles.menuIcon}>🔒</Text>
                            <Text style={styles.menuLabel}>Privacy & Security</Text>
                        </View>
                        <Text style={styles.chevron}>→</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem}>
                        <View style={styles.menuItemLeft}>
                            <Text style={styles.menuIcon}>🔔</Text>
                            <Text style={styles.menuLabel}>Focus Notifications</Text>
                        </View>
                        <Text style={styles.chevron}>→</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Connections</Text>
                    <TouchableOpacity 
                        style={styles.menuItem}
                        onPress={() => navigation.navigate('GSuiteConnect' as never)}
                    >
                        <View style={styles.menuItemLeft}>
                            <Text style={styles.menuIcon}>🌐</Text>
                            <Text style={styles.menuLabel}>Google Workspace</Text>
                        </View>
                        <View style={styles.statusTag}>
                            <Text style={styles.statusTagText}>CONNECTED</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                >
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>

                <Text style={styles.versionText}>Neuron v1.0.0 (Alpha)</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.surfaceContainerLow,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backIcon: {
        fontSize: 20,
        color: theme.colors.onSurface,
    },
    headerTitle: {
        ...theme.typography.styles.headlineMD,
        color: theme.colors.onSurface,
    },
    scrollContent: {
        padding: theme.spacing.lg,
        paddingBottom: 40,
    },
    profileHero: {
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 20,
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 20,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: theme.colors.surfaceContainerHigh,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: theme.colors.surfaceContainerHigh,
    },
    avatarText: {
        color: '#fff',
        fontSize: 40,
        fontWeight: 'bold',
    },
    statusBadge: {
        position: 'absolute',
        bottom: -10,
        backgroundColor: theme.colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: theme.colors.background,
    },
    statusText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    userName: {
        ...theme.typography.styles.displaySM,
        color: theme.colors.onSurface,
        marginBottom: 4,
    },
    userEmail: {
        ...theme.typography.styles.bodyMD,
        color: theme.colors.onSurfaceVariant,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        ...theme.typography.styles.labelLG,
        color: theme.colors.outline,
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surfaceContainerLowest,
        padding: 20,
        borderRadius: 20,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuIcon: {
        fontSize: 20,
        marginRight: 16,
    },
    menuLabel: {
        ...theme.typography.styles.bodyLG,
        fontWeight: '600',
        color: theme.colors.onSurface,
    },
    chevron: {
        fontSize: 18,
        color: theme.colors.outline,
        opacity: 0.5,
    },
    statusTag: {
        backgroundColor: theme.colors.primaryFixed,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusTagText: {
        fontSize: 10,
        fontWeight: '800',
        color: theme.colors.primary,
    },
    signOutButton: {
        backgroundColor: theme.colors.errorContainer,
        paddingVertical: 18,
        borderRadius: 20,
        alignItems: 'center',
        marginTop: 20,
    },
    signOutText: {
        color: theme.colors.onErrorContainer,
        fontSize: 16,
        fontWeight: '700',
    },
    versionText: {
        textAlign: 'center',
        marginTop: 40,
        fontSize: 12,
        color: theme.colors.outline,
        opacity: 0.5,
    },
});
