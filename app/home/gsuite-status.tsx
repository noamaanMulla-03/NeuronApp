import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../../src/components/Button';
import { useAuthStore } from '../../src/store/authStore';
import {
    useGSuiteStore,
    SERVICE_NAMES,
    ServiceName,
    SyncStatus,
} from '../../src/store/gsuiteStore';
import { theme } from '../../src/theme';

const SERVICE_LABELS: Record<ServiceName, { label: string; icon: string }> = {
    gmail: { label: 'Gmail', icon: '✉️' },
    drive: { label: 'Google Drive', icon: '📁' },
    calendar: { label: 'Calendar', icon: '📅' },
    contacts: { label: 'Contacts', icon: '👤' },
    tasks: { label: 'Tasks', icon: '✅' },
    docs: { label: 'Workspace Documents', icon: '📄' },
    keep: { label: 'Google Keep', icon: '📝' },
    chat: { label: 'Google Chat', icon: '💬' },
};

function getStatusColor(status: SyncStatus): string {
    switch (status) {
        case 'syncing': return '#FF9500';
        case 'done': return '#34C759';
        case 'error': return '#FF3B30';
        default: return theme.colors.outline;
    }
}

function getStatusLabel(status: SyncStatus): string {
    switch (status) {
        case 'syncing': return 'Indexing Memory...';
        case 'done': return 'Memory Indexed';
        case 'error': return 'Interrupted';
        default: return 'Idle';
    }
}

function formatDate(iso: string | null): string {
    if (!iso) { return 'Never'; }
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + date.toLocaleDateString();
}

export default function GSuiteStatusScreen() {
    const navigation = useNavigation();
    const { user } = useAuthStore();
    const { permissions, syncMeta, subscribeSyncMeta } = useGSuiteStore();

    const enabledServices = SERVICE_NAMES.filter(s => permissions[s]);
    const isSyncing = enabledServices.some(s => syncMeta[s].status === 'syncing');

    // Subscribe to real-time sync_meta updates from the backend.
    // The backend writes to this document after every push-triggered or
    // scheduled sync, so the UI reflects progress instantly.
    useEffect(() => {
        if (!user?.uid) return;
        const unsubscribe = subscribeSyncMeta(user.uid);
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Memory{'\n'}Index</Text>
                    <Text style={styles.subtitle}>
                        {enabledServices.length} neural paths connected. Syncing happens automatically in the background.
                    </Text>
                </View>

                {/* Live status banner — shows when any service is actively syncing */}
                {isSyncing && (
                    <View style={styles.syncingBanner}>
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                        <Text style={styles.syncingText}>Indexing memory...</Text>
                    </View>
                )}

                <View style={styles.card}>
                    {enabledServices.map((service, index) => {
                        const meta = syncMeta[service];
                        const info = SERVICE_LABELS[service];

                        return (
                            <View
                                key={service}
                                style={[
                                    styles.serviceRow,
                                    index < enabledServices.length - 1 && styles.serviceRowBorder,
                                ]}
                            >
                                <View style={styles.serviceIconContainer}>
                                    <Text style={styles.serviceIcon}>{info.icon}</Text>
                                </View>
                                <View style={styles.serviceInfo}>
                                    <Text style={styles.serviceLabel}>{info.label}</Text>
                                    <View style={styles.statusRow}>
                                        <View
                                            style={[
                                                styles.statusDot,
                                                { backgroundColor: getStatusColor(meta.status) },
                                            ]}
                                        />
                                        <Text style={styles.statusText}>
                                            {getStatusLabel(meta.status)}
                                        </Text>
                                    </View>
                                    {meta.status === 'done' && (
                                        <Text style={styles.metaText}>
                                            {meta.itemCount} entities · {formatDate(meta.lastSync)}
                                        </Text>
                                    )}
                                    {meta.status === 'error' && meta.error && (
                                        <Text style={styles.errorText} numberOfLines={1}>
                                            {meta.error}
                                        </Text>
                                    )}
                                </View>
                                {/* Status indicator: spinner while syncing, checkmark when done */}
                                {meta.status === 'syncing' ? (
                                    <ActivityIndicator size="small" color={theme.colors.primary} />
                                ) : meta.status === 'done' ? (
                                    <Text style={styles.checkMark}>✓</Text>
                                ) : null}
                            </View>
                        );
                    })}
                </View>

                {enabledServices.length === 0 && (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>
                            No neural paths connected. Go back to enable services.
                        </Text>
                    </View>
                )}

                <Button
                    title="Browse Your Data"
                    onPress={() => navigation.navigate('GSuiteData' as never)}
                    variant="secondary"
                    style={styles.browseButton}
                    disabled={!enabledServices.some(s => syncMeta[s].status === 'done')}
                />
                
                <View style={styles.spacer} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    scrollContent: {
        padding: 24,
    },
    header: {
        marginBottom: 32,
    },
    backLink: {
        marginBottom: 24,
    },
    backText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.primary,
        fontFamily: theme.typography.fonts.body,
    },
    title: {
        ...theme.typography.styles.displayLG,
        fontSize: 48,
        color: theme.colors.onSurface,
        marginBottom: 12,
    },
    subtitle: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        lineHeight: 24,
        maxWidth: 280,
    },
    syncingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceContainerLow,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        gap: 12,
    },
    syncingText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.onSurfaceVariant,
        fontFamily: theme.typography.fonts.body,
    },
    card: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: 24,
        padding: 8,
        shadowColor: theme.colors.onSurface,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 16,
        elevation: 2,
        marginBottom: 24,
    },
    serviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    serviceRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.background,
    },
    serviceIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceContainerLow,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    serviceIcon: {
        fontSize: 24,
    },
    serviceInfo: {
        flex: 1,
        marginRight: 12,
    },
    serviceLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: theme.colors.onSurface,
        marginBottom: 2,
        fontFamily: theme.typography.fonts.body,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.onSurfaceVariant,
        fontFamily: theme.typography.fonts.body,
    },
    metaText: {
        fontSize: 11,
        color: theme.colors.outline,
        marginTop: 2,
        fontFamily: theme.typography.fonts.body,
    },
    errorText: {
        fontSize: 11,
        color: theme.colors.error,
        marginTop: 2,
        fontFamily: theme.typography.fonts.body,
    },
    checkMark: {
        fontSize: 18,
        color: '#34C759',
        fontWeight: '700',
    },
    emptyCard: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyText: {
        fontSize: 15,
        color: theme.colors.onSurfaceVariant,
        textAlign: 'center',
        fontFamily: theme.typography.fonts.body,
    },
    browseButton: {
        marginBottom: 40,
    },
    spacer: {
        height: 40,
    },
});
