import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { useAuthStore } from '../../src/store/authStore';
import { signOutUser } from '../../src/lib/auth';
import { theme } from '../../src/theme';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
    const { user } = useAuthStore();
    const navigation = useNavigation();
    const [loading, setLoading] = useState(false);

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
            {/* TopAppBar */}
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
                {/* Welcome Hero */}
                <View style={styles.hero}>
                    <Text style={styles.welcomeText}>Good morning, {getUserName()}.</Text>
                    <Text style={styles.heroSubtitle}>Your cognitive environment is optimized for deep focus today.</Text>
                </View>

                {/* Proactive Daily Briefing Card */}
                <View style={styles.briefingCard}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardIcon}>✨</Text>
                        <Text style={styles.cardTitle}>Proactive Daily Briefing</Text>
                    </View>
                    <View style={styles.briefingContent}>
                        <Text style={styles.briefingText}>
                            Your day centers around the <Text style={styles.highlightText}>Q4 Growth Strategy</Text> launch. You have three back-to-back stakeholder syncs starting at 10:00 AM. 
                        </Text>
                        <Text style={styles.briefingText}>
                            I've detected a conflict in your 2:00 PM slot—the Project X review overlaps with the leadership standup. I recommend prioritizing the standup as your input is flagged as critical.
                        </Text>
                        <Text style={styles.briefingText}>
                            I have prepared draft responses for the budget inquiries based on your previous constraints.
                        </Text>
                    </View>
                    <View style={styles.cardActions}>
                        <Button 
                            title="Handle Conflicts" 
                            onPress={() => {}} 
                            style={styles.actionButton}
                        />
                        <Button 
                            title="View GSuite Items" 
                            onPress={() => navigation.navigate('GSuiteStatus' as never)} 
                            variant="secondary"
                            style={styles.actionButtonSecondary}
                        />
                    </View>
                </View>

                {/* Agenda Balancing Card */}
                <View style={styles.agendaCard}>
                    <View style={styles.agendaHeader}>
                        <Text style={styles.agendaIcon}>⚖️</Text>
                        <View style={styles.tag}>
                            <Text style={styles.tagText}>HIGH LOAD</Text>
                        </View>
                    </View>
                    <Text style={styles.agendaTitle}>Agenda Balancing</Text>
                    <Text style={styles.agendaSubtitle}>Today is 85% meetings. Your cognitive capacity for deep work will be depleted by 3:00 PM.</Text>
                    
                    <View style={styles.recommendationBox}>
                        <View style={styles.recHeader}>
                            <Text style={styles.recIcon}>⚡</Text>
                            <Text style={styles.recLabel}>RECOMMENDATION</Text>
                        </View>
                        <Text style={styles.recText}>Protect 2 hours of Deep Work by moving the 'Social Media Sync' to Thursday morning.</Text>
                        <TouchableOpacity style={styles.recButton}>
                            <Text style={styles.recButtonText}>Reschedule & Protect</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Recent Insights */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Insights</Text>
                </View>

                <View style={styles.insightRow}>
                    <TouchableOpacity style={[styles.insightCard, { borderLeftColor: '#1A73E8' }]}>
                        <View style={styles.insightHeader}>
                            <Text style={styles.insightTypeIcon}>📄</Text>
                            <Text style={styles.insightLabel}>DOCUMENT</Text>
                        </View>
                        <Text style={styles.insightTitle}>Summarized Project X proposal</Text>
                        <Text style={styles.insightDesc}>Timeline shifted by 2 weeks to accommodate security audits.</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.insightRow}>
                    <TouchableOpacity style={[styles.insightCard, { borderLeftColor: '#FF9500' }]}>
                        <View style={styles.insightHeader}>
                            <Text style={styles.insightTypeIcon}>🧠</Text>
                            <Text style={styles.insightLabel}>PATTERN</Text>
                        </View>
                        <Text style={styles.insightTitle}>Meeting fatigue detected</Text>
                        <Text style={styles.insightDesc}>Tuesday afternoons show a 30% drop in response speed.</Text>
                    </TouchableOpacity>
                </View>

                {/* Chat Input Placeholder */}
                <View style={styles.chatAnchor}>
                    <TouchableOpacity 
                        style={styles.chatInput}
                        onPress={() => navigation.navigate('GSuiteConnect' as never)} // Placeholder navigation
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

            {/* Bottom Nav Shell Placeholder */}
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
    scrollContent: {
        padding: theme.spacing.lg,
    },
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
    briefingCard: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: 24,
        padding: 24,
        marginBottom: 24,
        shadowColor: theme.colors.onSurface,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    cardIcon: {
        fontSize: 24,
        marginRight: 10,
        color: theme.colors.primary,
    },
    cardTitle: {
        ...theme.typography.styles.headlineMD,
        fontSize: 20,
        color: theme.colors.onSurface,
    },
    briefingContent: {
        marginBottom: 24,
    },
    briefingText: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        lineHeight: 24,
        marginBottom: 16,
    },
    highlightText: {
        color: theme.colors.primary,
        fontWeight: '600',
    },
    cardActions: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        minHeight: 44,
    },
    actionButtonSecondary: {
        flex: 1.2,
        minHeight: 44,
    },
    agendaCard: {
        backgroundColor: theme.colors.primaryFixed,
        borderRadius: 24,
        padding: 24,
        marginBottom: 32,
    },
    agendaHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    agendaIcon: {
        fontSize: 24,
        color: theme.colors.primaryContainer,
    },
    tag: {
        backgroundColor: theme.colors.primaryContainer + '1A',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    tagText: {
        fontSize: 10,
        fontWeight: '800',
        color: theme.colors.primaryContainer,
        letterSpacing: 1,
    },
    agendaTitle: {
        ...theme.typography.styles.headlineMD,
        fontSize: 24,
        color: theme.colors.primaryContainer,
        marginBottom: 12,
    },
    agendaSubtitle: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.primaryContainer,
        lineHeight: 22,
        marginBottom: 24,
        opacity: 0.8,
    },
    recommendationBox: {
        backgroundColor: theme.colors.surfaceContainerLowest + '66', // 40% opacity
        padding: 16,
        borderRadius: 16,
    },
    recHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    recIcon: {
        fontSize: 14,
        marginRight: 6,
    },
    recLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: theme.colors.primaryContainer,
        letterSpacing: 1,
    },
    recText: {
        fontSize: 14,
        color: theme.colors.primaryContainer,
        lineHeight: 20,
        marginBottom: 16,
    },
    recButton: {
        backgroundColor: theme.colors.primaryContainer,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    recButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
    sectionHeader: {
        marginBottom: 16,
        paddingHorizontal: 8,
    },
    sectionTitle: {
        ...theme.typography.styles.headlineMD,
        fontSize: 20,
        color: theme.colors.onSurface,
    },
    insightRow: {
        marginBottom: 16,
    },
    insightCard: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: 16,
        padding: 20,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    insightTypeIcon: {
        fontSize: 20,
    },
    insightLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: theme.colors.outline,
        letterSpacing: 1,
    },
    insightTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.onSurface,
        marginBottom: 4,
        fontFamily: theme.typography.fonts.body,
    },
    insightDesc: {
        fontSize: 14,
        color: theme.colors.onSurfaceVariant,
        lineHeight: 20,
        fontFamily: theme.typography.fonts.body,
    },
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
