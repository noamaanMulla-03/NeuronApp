import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../src/store/authStore';
import { useGSuiteStore, SERVICE_NAMES, ServiceName } from '../../src/store/gsuiteStore';
import { db } from '../../src/lib/firestore';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { theme } from '../../src/theme';

const TAB_CONFIG: Record<ServiceName, { label: string; icon: string }> = {
    gmail: { label: 'Mail', icon: '✉️' },
    drive: { label: 'Drive', icon: '📁' },
    calendar: { label: 'Calendar', icon: '📅' },
    contacts: { label: 'People', icon: '👤' },
    tasks: { label: 'Tasks', icon: '✅' },
    docs: { label: 'Workspace', icon: '📄' },
    keep: { label: 'Notes', icon: '📝' },
    chat: { label: 'Chat', icon: '💬' },
};

interface DataItem {
    id: string;
    title: string;
    subtitle: string;
    meta?: string;
}

export default function GSuiteDataScreen() {
    const navigation = useNavigation();
    const { user } = useAuthStore();
    const { permissions, syncMeta } = useGSuiteStore();

    const enabledServices = SERVICE_NAMES.filter(
        s => permissions[s] && syncMeta[s].status === 'done',
    );

    const [activeTab, setActiveTab] = useState<ServiceName>(
        enabledServices[0] ?? 'gmail',
    );
    const [items, setItems] = useState<DataItem[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async (service: ServiceName) => {
        if (!user?.uid) { return; }
        setLoading(true);
        setItems([]);

        try {
            const collectionPath = getCollectionPath(service);
            const ref = collection(db, 'users', user.uid, ...collectionPath);
            const q = query(ref, limit(50));
            const snapshot = await getDocs(q);

            const mapped = snapshot.docs.map(doc => {
                const data = doc.data();
                return mapToDataItem(service, doc.id, data);
            });

            setItems(mapped);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        if (enabledServices.includes(activeTab)) {
            fetchData(activeTab);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, enabledServices.length]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Your Data</Text>
            </View>

            {/* Tonal Tab bar */}
            <View style={styles.tabBarContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tabBar}
                    contentContainerStyle={styles.tabBarContent}
                >
                    {enabledServices.map(service => {
                        const tab = TAB_CONFIG[service];
                        const isActive = activeTab === service;
                        return (
                            <TouchableOpacity
                                key={service}
                                style={[styles.tab, isActive && styles.tabActive]}
                                onPress={() => setActiveTab(service)}
                            >
                                <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{tab.icon}</Text>
                                <Text
                                    style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                                >
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Content */}
            <View style={styles.content}>
                {loading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color={theme.colors.primary} />
                    </View>
                ) : items.length === 0 ? (
                    <View style={styles.centered}>
                        <Text style={styles.emptyText}>No data indexed for this path yet.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <View style={styles.itemCard}>
                                <Text style={styles.itemTitle} numberOfLines={1}>
                                    {item.title}
                                </Text>
                                <Text style={styles.itemSubtitle} numberOfLines={2}>
                                    {item.subtitle}
                                </Text>
                                {item.meta && (
                                    <View style={styles.metaBadge}>
                                        <Text style={styles.itemMeta}>{item.meta}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

function getCollectionPath(service: ServiceName): string[] {
    switch (service) {
        case 'gmail': return ['gmail_messages'];
        case 'drive': return ['drive_files'];
        case 'calendar': return ['calendar_events'];
        case 'contacts': return ['contacts_people'];
        case 'tasks': return ['tasks_items'];
        case 'docs': return ['docs_content'];
        case 'keep': return ['keep_notes'];
        case 'chat': return ['chat_messages'];
    }
}

function mapToDataItem(
    service: ServiceName,
    id: string,
    data: Record<string, any>,
): DataItem {
    switch (service) {
        case 'gmail':
            return {
                id,
                title: data.subject || '(No subject)',
                subtitle: `From: ${data.from ?? 'Unknown'}`,
                meta: data.date ? new Date(data.date).toLocaleDateString() : undefined,
            };
        case 'drive':
            return {
                id,
                title: data.name || 'Untitled',
                subtitle: data.mimeType ?? '',
                meta: data.modifiedTime
                    ? new Date(data.modifiedTime).toLocaleDateString()
                    : undefined,
            };
        case 'calendar':
            return {
                id,
                title: data.summary || '(No title)',
                subtitle: data.location || data.description || '',
                meta: data.start?.dateTime
                    ? new Date(data.start.dateTime).toLocaleDateString()
                    : data.start?.date ?? '',
            };
        case 'contacts':
            return {
                id,
                title: data.name || 'Unknown',
                subtitle: data.emails?.[0]?.value ?? '',
                meta: data.phones?.[0]?.value,
            };
        case 'tasks':
            return {
                id,
                title: data.title || '(No title)',
                subtitle: data.status === 'completed' ? 'Completed' : 'Pending',
                meta: data.due
                    ? new Date(data.due).toLocaleDateString()
                    : undefined,
            };
        case 'docs':
            return {
                id,
                title: data.title || 'Untitled',
                subtitle: data.extractedText?.slice(0, 80) ?? '',
                meta: 'Document',
            };
        default:
            return { id, title: id, subtitle: '' };
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 24,
    },
    backLink: {
        marginBottom: 16,
    },
    backText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.primary,
    },
    title: {
        ...theme.typography.styles.headlineMD,
        fontSize: 32,
        color: theme.colors.onSurface,
    },
    tabBarContainer: {
        backgroundColor: theme.colors.surfaceContainerLow,
        paddingVertical: 12,
    },
    tabBar: {
        maxHeight: 44,
    },
    tabBarContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: theme.colors.surfaceContainerLowest,
        gap: 8,
    },
    tabActive: {
        backgroundColor: theme.colors.primary,
    },
    tabIcon: {
        fontSize: 14,
    },
    tabIconActive: {
        color: '#fff',
    },
    tabLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.onSurfaceVariant,
        fontFamily: theme.typography.fonts.body,
    },
    tabLabelActive: {
        color: '#fff',
    },
    content: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 15,
        color: theme.colors.onSurfaceVariant,
        fontFamily: theme.typography.fonts.body,
    },
    listContent: {
        padding: 20,
        gap: 12,
    },
    itemCard: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: 20,
        padding: 20,
        shadowColor: theme.colors.onSurface,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 12,
        elevation: 1,
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.onSurface,
        marginBottom: 4,
        fontFamily: theme.typography.fonts.body,
    },
    itemSubtitle: {
        fontSize: 14,
        color: theme.colors.onSurfaceVariant,
        lineHeight: 20,
        fontFamily: theme.typography.fonts.body,
    },
    metaBadge: {
        marginTop: 12,
        backgroundColor: theme.colors.surfaceContainerLow,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    itemMeta: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.colors.outline,
        fontFamily: theme.typography.fonts.body,
    },
});
