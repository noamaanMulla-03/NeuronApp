import React, { useEffect, useCallback } from 'react';
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
import { runFullSync, syncService } from '../../src/services/sync-engine';
import { theme } from '../../src/theme';

const SERVICE_LABELS: Record<ServiceName, { label: string; icon: string }> = {
    gmail: { label: 'Gmail', icon: '✉️' },
    drive: { label: 'Google Drive', icon: '📁' },
    calendar: { label: 'Calendar', icon: '📅' },
    contacts: { label: 'Contacts', icon: '👤' },
    tasks: { label: 'Tasks', icon: '✅' },
    docs: { label: 'Workspace Documents', icon: '📄' },
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
    const { permissions, syncMeta, loadSyncMeta } = useGSuiteStore();

    const enabledServices = SERVICE_NAMES.filter(s => permissions[s]);
    const isSyncing = enabledServices.some(s => syncMeta[s].status === 'syncing');

    useEffect(() => {
        if (user?.uid) {
            loadSyncMeta(user.uid);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    const handleSyncAll = useCallback(async () => {
        if (!user?.uid || isSyncing) { return; }
        await runFullSync(user.uid);
    }, [user?.uid, isSyncing]);

    const handleSyncOne = useCallback(async (service: ServiceName) => {
        if (!user?.uid) { return; }
        await syncService(user.uid, service);
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
                        {enabledServices.length} neural paths connected. Assistant accuracy increases as more memory is indexed.
                    </Text>
                </View>

                <Button
                    title={isSyncing ? 'Indexing...' : 'Refresh All Memory'}
                    onPress={handleSyncAll}
                    loading={isSyncing}
                    disabled={isSyncing || enabledServices.length === 0}
                    style={styles.syncAllButton}
                />

                <View style={styles.card}>
                    {enabledServices.map((service, index) => {
                        const meta = syncMeta[service];
                        const info = SERVICE_LABELS[service];
                        const isServiceSyncing = meta.status === 'syncing';

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
                                <TouchableOpacity
                                    onPress={() => handleSyncOne(service)}
                                    disabled={isServiceSyncing}
                                    style={styles.retryButton}
                                >
                                    {isServiceSyncing ? (
                                        <ActivityIndicator size="small" color={theme.colors.primary} />
                                    ) : (
                                        <Text style={styles.retryText}>
                                            {meta.status === 'error' ? 'Retry' : 'Sync'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
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
    syncAllButton: {
        marginBottom: 24,
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
    retryButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceContainerLow,
        minWidth: 60,
        alignItems: 'center',
    },
    retryText: {
        fontSize: 12,
        color: theme.colors.primary,
        fontWeight: '700',
        fontFamily: theme.typography.fonts.body,
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
