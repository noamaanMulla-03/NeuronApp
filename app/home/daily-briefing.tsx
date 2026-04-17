import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { getDocs, query, where, collection, doc, updateDoc } from 'firebase/firestore';
import { useAuthStore } from '../../src/store/authStore';
import { readUserDoc, db } from '../../src/lib/firestore';
import { theme } from '../../src/theme';

// ---------------------------------------------------------------------------
// Types — mirror the Firestore document written by generateDailyBriefings
// ---------------------------------------------------------------------------
interface DailyBrief {
    date: string;
    greeting: string;
    summary: string;
    eventHighlights: string[];
    priorityTasks: string[];
    importantEmails: string[];
    generatedAt: string;
    contextStats: { events: number; tasks: number; emails: number };
}

// Conflict detected by the backend after calendar sync
interface ConflictResolution {
    id: string;
    highPriorityEvent: { id: string; summary: string; start: string; end: string };
    lowPriorityEvent: { id: string; summary: string; start: string; end: string };
    reason: string;
    suggestedAction: string;
    status: 'pending' | 'acknowledged' | 'dismissed';
}

/** Returns today's date as YYYY-MM-DD in the device's local timezone — matches the key written by the backend */
function localDateStr(): string {
    // sv-SE locale produces 'YYYY-MM-DD' natively; no timeZone option means
    // Intl uses the device's system timezone, consistent with what the backend
    // reads from users/{uid}/settings/timezone (written by App.tsx on sign-in).
    return new Intl.DateTimeFormat('sv-SE').format(new Date());
}

// ---------------------------------------------------------------------------
// DailyBriefingCard — self-contained; performs a one-time Firestore read on
// mount. No real-time listener needed (brief is static for the day).
// ---------------------------------------------------------------------------
export default function DailyBriefingCard() {
    const { user } = useAuthStore();
    const [brief, setBrief] = useState<DailyBrief | null>(null);
    const [loading, setLoading] = useState(true);
    const [conflicts, setConflicts] = useState<ConflictResolution[]>([]);

    useEffect(() => {
        if (!user?.uid) { setLoading(false); return; }

        const dateStr = localDateStr();

        // Fetch brief + pending conflicts in parallel
        Promise.all([
            readUserDoc(user.uid, ['daily_briefings', dateStr])
                .then(data => setBrief(data as DailyBrief | null))
                .catch(() => setBrief(null)),
            getDocs(query(
                collection(db, 'users', user.uid, 'conflict_resolutions'),
                where('status', '==', 'pending'),
            ))
                .then(snap => setConflicts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConflictResolution))))
                .catch(() => setConflicts([])),
        ]).finally(() => setLoading(false));
    }, [user?.uid]);

    // Resolve a conflict by updating its status directly in Firestore
    const handleResolve = async (conflictId: string, action: 'acknowledged' | 'dismissed') => {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, 'users', user.uid, 'conflict_resolutions', conflictId), {
                status: action,
                resolvedAt: new Date().toISOString(),
            });
            // Remove from local state immediately
            setConflicts(prev => prev.filter(c => c.id !== conflictId));
        } catch { /* Non-critical — silent fail */ }
    };

    // ---- Loading state: inline spinner matching the card footprint ----
    if (loading) {
        return (
            <View style={[styles.card, styles.cardLoading]}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
        );
    }

    // ---- Empty state: brief not yet generated (before 07:00 UTC) ----
    if (!brief) {
        return (
            <View style={styles.card}>
                <Text style={styles.sectionLabel}>☀️  MORNING BRIEF</Text>
                <Text style={styles.emptyText}>
                    Your daily brief isn't ready yet — check back after 7 AM.
                </Text>
            </View>
        );
    }

    // ---- Rendered brief ----
    return (
        <View style={styles.card}>
            {/* Header label — consistent with the tonal section pattern used across the app */}
            <Text style={styles.sectionLabel}>☀️  MORNING BRIEF</Text>

            {/* Greeting */}
            <Text style={styles.greeting}>{brief.greeting}</Text>

            {/* 2-3 sentence synthesis of the day */}
            <Text style={styles.summary}>{brief.summary}</Text>

            {/* Calendar highlights */}
            {brief.eventHighlights.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.subsectionLabel}>📅  Today</Text>
                    {brief.eventHighlights.map((item, i) => (
                        <Text key={i} style={styles.bullet}>• {item}</Text>
                    ))}
                </View>
            )}

            {/* Priority tasks */}
            {brief.priorityTasks.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.subsectionLabel}>✅  Tasks</Text>
                    {brief.priorityTasks.map((item, i) => (
                        <Text key={i} style={styles.bullet}>• {item}</Text>
                    ))}
                </View>
            )}

            {/* Important emails */}
            {brief.importantEmails.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.subsectionLabel}>📧  Inbox</Text>
                    {brief.importantEmails.map((item, i) => (
                        <Text key={i} style={styles.bullet}>• {item}</Text>
                    ))}
                </View>
            )}

            {/* Schedule conflicts detected by the conflict resolver */}
            {conflicts.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.subsectionLabel}>⚠️  Conflicts</Text>
                    {conflicts.map(c => (
                        <View key={c.id} style={styles.conflictItem}>
                            <Text style={styles.conflictText}>
                                {c.highPriorityEvent.summary} overlaps with {c.lowPriorityEvent.summary}
                            </Text>
                            <Text style={styles.conflictReason}>{c.suggestedAction}</Text>
                            <View style={styles.conflictActions}>
                                <TouchableOpacity
                                    style={styles.conflictBtn}
                                    onPress={() => handleResolve(c.id, 'acknowledged')}
                                >
                                    <Text style={styles.conflictBtnText}>Acknowledge</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.conflictBtnDismiss}
                                    onPress={() => handleResolve(c.id, 'dismissed')}
                                >
                                    <Text style={styles.conflictBtnDismissText}>Dismiss</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

// ---------------------------------------------------------------------------
// Styles — follows the tonal surface system used throughout the app
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: theme.roundness.xl,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.lg,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
    },
    cardLoading: {
        // Fixed height so the card doesn't collapse to nothing during load
        minHeight: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: theme.colors.primary,
        marginBottom: theme.spacing.md,
        textTransform: 'uppercase',
        fontFamily: theme.typography.fonts.body,
    },
    greeting: {
        ...theme.typography.styles.titleMD,
        color: theme.colors.onSurface,
        marginBottom: theme.spacing.sm,
    },
    summary: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        lineHeight: 24,
        marginBottom: theme.spacing.md,
    },
    section: {
        marginTop: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.outlineVariant,
    },
    subsectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        color: theme.colors.outline,
        marginBottom: theme.spacing.xs,
        textTransform: 'uppercase',
        fontFamily: theme.typography.fonts.body,
    },
    bullet: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurface,
        lineHeight: 22,
        marginTop: 2,
    },
    emptyText: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        opacity: 0.6,
    },
    conflictItem: {
        backgroundColor: theme.colors.surfaceContainerLow,
        borderRadius: theme.roundness.md,
        padding: theme.spacing.sm,
        marginTop: theme.spacing.xs,
    },
    conflictText: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurface,
        fontWeight: '600',
    },
    conflictReason: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        fontSize: 13,
        marginTop: 2,
    },
    conflictActions: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.sm,
    },
    conflictBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: theme.colors.primary,
    },
    conflictBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    conflictBtnDismiss: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceContainerHigh,
    },
    conflictBtnDismissText: {
        color: theme.colors.onSurfaceVariant,
        fontSize: 12,
        fontWeight: '600',
    },
});
