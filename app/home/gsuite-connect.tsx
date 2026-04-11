import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Switch,
    Alert,
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
} from '../../src/store/gsuiteStore';
import { theme } from '../../src/theme';

interface ServiceInfo {
    key: ServiceName;
    label: string;
    description: string;
    icon: string;
}

const SERVICES: ServiceInfo[] = [
    {
        key: 'gmail',
        label: 'Gmail',
        description: 'Emails, threads, and messages',
        icon: '✉️',
    },
    {
        key: 'drive',
        label: 'Google Drive',
        description: 'Files, folders, and metadata',
        icon: '📁',
    },
    {
        key: 'calendar',
        label: 'Calendar',
        description: 'Events and schedules',
        icon: '📅',
    },
    {
        key: 'contacts',
        label: 'Contacts',
        description: 'People and phone numbers',
        icon: '👤',
    },
    {
        key: 'tasks',
        label: 'Tasks',
        description: 'Task lists and to-do items',
        icon: '✅',
    },
    {
        key: 'docs',
        label: 'Docs / Workspace',
        description: 'Text content from documents',
        icon: '📄',
    },
    {
        key: 'keep',
        label: 'Google Keep',
        description: 'Notes and lists',
        icon: '📝',
    },
    {
        key: 'chat',
        label: 'Google Chat',
        description: 'Direct messages and spaces',
        icon: '💬',
    },
];

export default function GSuiteConnectScreen() {
    const navigation = useNavigation();
    const { user } = useAuthStore();
    const {
        permissions,
        setPermission,
        loadPermissions,
        savePermissions,
    } = useGSuiteStore();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (user?.uid) {
            loadPermissions(user.uid).finally(() => setLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    const handleSave = async () => {
        if (!user?.uid) { return; }
        setSaving(true);
        try {
            await savePermissions(user.uid);
            const enabledCount = SERVICE_NAMES.filter(s => permissions[s]).length;
            if (enabledCount > 0) {
                navigation.navigate('GSuiteStatus' as never);
            } else {
                navigation.goBack();
            }
        } catch {
            Alert.alert('Error', 'Failed to save preferences.');
        } finally {
            setSaving(false);
        }
    };

    const enabledCount = SERVICE_NAMES.filter(s => permissions[s]).length;

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Connect{'\n'}Google</Text>
                    <Text style={styles.subtitle}>
                        Choose which services to sync with your AI assistant. Data is processed locally and securely.
                    </Text>
                </View>

                {/* AI Insight Style Banner */}
                <View style={styles.insightBanner}>
                    <View style={styles.bannerContent}>
                        <Text style={styles.bannerIcon}>✨</Text>
                        <View>
                            <Text style={styles.bannerTitle}>Proactive Discovery</Text>
                            <Text style={styles.bannerSubtitle}>Enable all services for the best agentic experience.</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    {SERVICES.map((service, index) => (
                        <View
                            key={service.key}
                            style={[
                                styles.serviceRow,
                                index < SERVICES.length - 1 && styles.serviceRowBorder,
                            ]}
                        >
                            <View style={styles.serviceIconContainer}>
                                <Text style={styles.serviceIcon}>{service.icon}</Text>
                            </View>
                            <View style={styles.serviceInfo}>
                                <Text style={styles.serviceLabel}>{service.label}</Text>
                                <Text style={styles.serviceDesc}>{service.description}</Text>
                            </View>
                            <Switch
                                value={permissions[service.key]}
                                onValueChange={val => setPermission(service.key, val)}
                                trackColor={{ false: theme.colors.surfaceContainerHigh, true: theme.colors.primaryFixed }}
                                thumbColor={permissions[service.key] ? theme.colors.primary : theme.colors.surfaceContainerLowest}
                            />
                        </View>
                    ))}
                </View>

                <View style={styles.infoCard}>
                    <Text style={styles.infoText}>
                        🔒 All data is read-only. Neuron treats your workspace as a physical sanctuary—we never modify or delete your data.
                    </Text>
                </View>

                <Button
                    title={
                        enabledCount > 0
                            ? `Save & Sync ${enabledCount} Service${enabledCount > 1 ? 's' : ''}`
                            : 'Save Preferences'
                    }
                    onPress={handleSave}
                    loading={saving}
                    style={styles.saveButton}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    insightBanner: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: theme.colors.primary + '1A', // 10% primary
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    bannerIcon: {
        fontSize: 24,
    },
    bannerTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.onSurface,
        fontFamily: theme.typography.fonts.body,
    },
    bannerSubtitle: {
        fontSize: 12,
        color: theme.colors.onSurfaceVariant,
        fontFamily: theme.typography.fonts.body,
    },
    card: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: 24,
        padding: 8,
        shadowColor: theme.colors.onSurface,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
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
        width: 48,
        height: 48,
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
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.onSurface,
        marginBottom: 2,
        fontFamily: theme.typography.fonts.body,
    },
    serviceDesc: {
        fontSize: 13,
        color: theme.colors.onSurfaceVariant,
        fontFamily: theme.typography.fonts.body,
    },
    infoCard: {
        backgroundColor: theme.colors.surfaceContainerLow,
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
    },
    infoText: {
        fontSize: 13,
        color: theme.colors.onSurfaceVariant,
        lineHeight: 20,
        fontFamily: theme.typography.fonts.body,
    },
    saveButton: {
        marginBottom: 40,
    },
});
