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
                <View style={styles.headerSpacer} />
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
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.colors.surfaceContainerLow,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backIcon: {
        fontSize: 20,
        color: theme.colors.onSurface,
        fontFamily: theme.typography.fonts.body,
    },
    headerTitle: {
        ...theme.typography.styles.headlineMD,
        color: theme.colors.onSurface,
    },
    headerSpacer: {
        width: 40,
    },
    scrollContent: {
        padding: theme.spacing.lg,
        paddingBottom: 60,
    },
    profileHero: {
        alignItems: 'center',
        marginBottom: 48,
        marginTop: 24,
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 24,
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        // No-Line Rule: boundaries defined by tonal layering, not solid borders
        backgroundColor: theme.colors.surfaceContainerHigh,
    },
    avatarPlaceholder: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        ...theme.typography.styles.displayLG,
        fontSize: 48,
    },
    statusBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: theme.colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.roundness.full,
        // Ambient shadow for depth without harsh lines
        shadowColor: theme.colors.onSurface,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    statusText: {
        color: '#fff',
        ...theme.typography.styles.labelMD,
        letterSpacing: 1.2,
    },
    userName: {
        ...theme.typography.styles.headlineMD,
        color: theme.colors.onSurface,
        marginBottom: 4,
    },
    userEmail: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        opacity: 0.7,
    },
    section: {
        marginBottom: 40,
    },
    sectionTitle: {
        ...theme.typography.styles.labelMD,
        color: theme.colors.onSurfaceVariant,
        marginBottom: 20,
        paddingHorizontal: 4,
        letterSpacing: 1,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        // Tonal Layering: pure white cards over soft gray background
        backgroundColor: theme.colors.surfaceContainerLowest,
        padding: 24,
        borderRadius: theme.roundness.lg,
        marginBottom: 16,
        // Ambient Shadow Rule: Extra-Diffused shadow using on-surface at 4% opacity
        shadowColor: theme.colors.onSurface,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.04,
        shadowRadius: 20,
        elevation: 0, // Disable native elevation in favor of custom tonal shadow
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuIcon: {
        fontSize: 22,
        marginRight: 20,
    },
    menuLabel: {
        ...theme.typography.styles.titleMD,
        color: theme.colors.onSurface,
    },
    chevron: {
        fontSize: 18,
        color: theme.colors.outline,
        opacity: 0.3,
    },
    statusTag: {
        backgroundColor: theme.colors.primaryFixed,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.roundness.md,
    },
    statusTagText: {
        ...theme.typography.styles.labelMD,
        color: theme.colors.primary,
    },
    signOutButton: {
        backgroundColor: theme.colors.surfaceContainerHighest,
        paddingVertical: 18,
        borderRadius: theme.roundness.lg,
        alignItems: 'center',
        marginTop: 12,
        // Tonal depth instead of border
    },
    signOutText: {
        ...theme.typography.styles.titleMD,
        color: theme.colors.error,
    },
    versionText: {
        textAlign: 'center',
        marginTop: 60,
        ...theme.typography.styles.bodyLG,
        color: theme.colors.outline,
        opacity: 0.5,
    },
});
