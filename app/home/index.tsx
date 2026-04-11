import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { theme } from '../../src/theme';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
    const { user } = useAuthStore();
    const navigation = useNavigation();

    const getUserName = (): string => {
        if (user?.displayName) {
            return user.displayName.split(' ')[0];
        }
        if (user?.email) {
            return user.email.split('@')[0];
        }
        return 'User';
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* TopAppBar: Displays user avatar, app logo, and search icon. */}
            <View style={styles.appBar}>
                <View style={styles.appBarLeft}>
                    <TouchableOpacity 
                        style={styles.avatarContainer}
                        onPress={() => navigation.navigate('Profile' as never)}
                    >
                        {user?.photoURL ? (
                            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>
                                    {getUserName().charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                        <View style={styles.statusDot} />
                    </TouchableOpacity>
                    <Text style={styles.logoText}>Neuron</Text>
                </View>
                <TouchableOpacity style={styles.iconButton}>
                    <Text style={styles.iconText}>🔍</Text>
                </TouchableOpacity>
            </View>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Welcome Hero: Greets the user and sets the cognitive environment tone. */}
                <View style={styles.hero}>
                    <Text style={styles.welcomeText}>Good morning, {getUserName()}.</Text>
                    <Text style={styles.heroSubtitle}>Your cognitive environment is optimized for deep focus today.</Text>
                </View>

                {/* 
                  Note: The static 'Proactive Daily Briefing', 'Agenda Balancing', and 'Recent Insights'
                  components have been removed to eliminate dummy placeholders. 
                  Future implementation will dynamically render these sections based on synced data.
                */}

                {/* Chat Input Placeholder: Entry point for proactive AI interaction. */}
                <View style={styles.chatAnchor}>
                    <TouchableOpacity 
                        style={styles.chatInput}
                        onPress={() => navigation.navigate('GSuiteConnect' as never)}
                    >
                        <Text style={styles.chatIcon}>💬</Text>
                        <Text style={styles.chatPlaceholder}>What's on your mind?</Text>
                        <View style={styles.chatSend}>
                            <Text style={styles.chatSendIcon}>↑</Text>
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.chatHint}>Ask Neuron to schedule, summarize, or synthesize.</Text>
                </View>

                <View style={styles.spacer} />
            </ScrollView>

            {/* Bottom Nav Shell: Navigation bar for quick access to core features. */}
            <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navItemActive}>
                    <Text style={styles.navIconActive}>🏠</Text>
                    <Text style={styles.navTextActive}>Hub</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('GSuiteData' as never)}>
                    <Text style={styles.navIcon}>📊</Text>
                    <Text style={styles.navText}>Data</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <Text style={styles.navIcon}>✨</Text>
                    <Text style={styles.navText}>Insights</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Profile' as never)}>
                    <Text style={styles.navIcon}>👤</Text>
                    <Text style={styles.navText}>Profile</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    // TopAppBar Styles
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        backgroundColor: theme.colors.background + 'B3', // 70% opacity
    },
    appBarLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    avatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    statusDot: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: theme.colors.primary,
        borderWidth: 2,
        borderColor: theme.colors.background,
    },
    logoText: {
        fontSize: 20,
        fontWeight: '800',
        color: theme.colors.primary,
        fontFamily: theme.typography.fonts.headline,
        letterSpacing: -1,
    },
    iconButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: theme.colors.surfaceContainerLow,
    },
    iconText: {
        fontSize: 18,
    },
    // ScrollContent Styles
    scrollContent: {
        padding: theme.spacing.lg,
    },
    // Hero Styles
    hero: {
        marginTop: theme.spacing.md,
        marginBottom: theme.spacing.xl,
    },
    welcomeText: {
        ...theme.typography.styles.displayLG,
        fontSize: 40,
        lineHeight: 48,
        color: theme.colors.onSurface,
        marginBottom: 8,
    },
    heroSubtitle: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        lineHeight: 24,
    },
    // ChatAnchor Styles
    chatAnchor: {
        marginTop: 40,
        alignItems: 'center',
    },
    chatInput: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceContainerLowest,
        width: '100%',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 4,
    },
    chatIcon: {
        fontSize: 20,
        marginRight: 12,
        color: theme.colors.outline,
    },
    chatPlaceholder: {
        flex: 1,
        fontSize: 16,
        color: theme.colors.onSurfaceVariant,
        opacity: 0.6,
        fontFamily: theme.typography.fonts.body,
    },
    chatSend: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chatSendIcon: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    chatHint: {
        marginTop: 12,
        fontSize: 11,
        color: theme.colors.onSurfaceVariant,
        opacity: 0.6,
        fontWeight: '600',
    },
    spacer: {
        height: 100,
    },
    // BottomNav Styles
    bottomNav: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceContainerLow,
        paddingTop: 12,
        paddingBottom: 24,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    navItem: {
        alignItems: 'center',
        opacity: 0.4,
    },
    navItemActive: {
        alignItems: 'center',
        backgroundColor: theme.colors.primaryFixed,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
    },
    navIcon: {
        fontSize: 20,
        marginBottom: 4,
    },
    navIconActive: {
        fontSize: 20,
        marginBottom: 2,
    },
    navText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.onSurface,
    },
    navTextActive: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.colors.primary,
    },
});
