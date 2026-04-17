import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../src/store/authStore';
import { getDocs, query, where, collection, orderBy, limit } from 'firebase/firestore';
import { db } from '../../src/lib/firestore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailPreview {
    id: string;
    subject: string;
    from: string;
    snippet: string;
    threadId: string;
    isImportant: boolean;
}

interface SmartReply {
    label: string;
    body: string;
}

interface Draft {
    subject: string;
    body: string;
}

// Cloud Function URLs — raw fetch consistent with semantic-chat.tsx
const BASE_URL = 'https://us-central1-neuron-bb594.cloudfunctions.net';
const SMART_REPLIES_URL = `${BASE_URL}/generateSmartReplies`;
const GENERATE_DRAFT_URL = `${BASE_URL}/generateDraft`;
const SEND_DRAFT_URL = `${BASE_URL}/sendDraft`;
const EXTRACT_STYLE_URL = `${BASE_URL}/extractStyle`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getIdToken(): Promise<string> {
    const { auth } = require('../../src/lib/firebase');
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    return token;
}

async function callFunction<T>(url: string, data: any): Promise<T> {
    const idToken = await getIdToken();
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ data }),
    });

    if (!response.ok) {
        const text = await response.text();
        let msg = 'Request failed';
        try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
        throw new Error(msg);
    }

    const json = await response.json();
    return json.result as T;
}

// ---------------------------------------------------------------------------
// Screen: Ghostwriter
// ---------------------------------------------------------------------------

type Mode = 'inbox' | 'smartReply' | 'compose' | 'preview';

export default function GhostwriterScreen() {
    const navigation = useNavigation();
    const { user } = useAuthStore();

    // Mode state machine: inbox → smartReply/compose → preview
    const [mode, setMode] = useState<Mode>('inbox');

    // Inbox state
    const [emails, setEmails] = useState<EmailPreview[]>([]);
    const [loadingEmails, setLoadingEmails] = useState(true);

    // Smart reply state
    const [selectedEmail, setSelectedEmail] = useState<EmailPreview | null>(null);
    const [replies, setReplies] = useState<SmartReply[]>([]);
    const [loadingReplies, setLoadingReplies] = useState(false);

    // Compose / draft state
    const [instruction, setInstruction] = useState('');
    const [recipientHint, setRecipientHint] = useState('');
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loadingDraft, setLoadingDraft] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [savedMessage, setSavedMessage] = useState('');

    // Style extraction
    const [extractingStyle, setExtractingStyle] = useState(false);

    // ---- Load recent important emails on mount ----
    useEffect(() => {
        if (!user?.uid) return;
        getDocs(query(
            collection(db, 'users', user.uid, 'gmail_messages'),
            where('isImportant', '==', true),
            orderBy('internalDate', 'desc'),
            limit(20),
        ))
            .then(snap => setEmails(snap.docs.map(d => ({
                id: d.id,
                subject: d.data().subject || '(no subject)',
                from: d.data().from || '',
                snippet: d.data().snippet || '',
                threadId: d.data().threadId || '',
                isImportant: true,
            }))))
            .catch(() => setEmails([]))
            .finally(() => setLoadingEmails(false));
    }, [user?.uid]);

    // ---- Smart Reply flow ----
    const handleSelectEmail = useCallback(async (email: EmailPreview) => {
        setSelectedEmail(email);
        setMode('smartReply');
        setLoadingReplies(true);
        setReplies([]);
        try {
            const result = await callFunction<{ replies: SmartReply[] }>(
                SMART_REPLIES_URL, { messageId: email.id });
            setReplies(result.replies);
        } catch (err: any) {
            setReplies([{ label: 'Error', body: err.message || 'Failed to generate replies.' }]);
        } finally {
            setLoadingReplies(false);
        }
    }, []);

    // Select a smart reply → move to preview for editing
    const handlePickReply = useCallback((reply: SmartReply) => {
        setDraft({
            subject: `Re: ${selectedEmail?.subject || ''}`,
            body: reply.body,
        });
        setMode('preview');
    }, [selectedEmail]);

    // ---- Compose flow ----
    const handleCompose = useCallback(async () => {
        if (!instruction.trim()) return;
        setLoadingDraft(true);
        try {
            const result = await callFunction<{ draft: Draft }>(GENERATE_DRAFT_URL, {
                instruction: instruction.trim(),
                replyToId: selectedEmail?.id,
                recipientHint: recipientHint.trim() || undefined,
            });
            setDraft(result.draft);
            setMode('preview');
        } catch (err: any) {
            setDraft({ subject: 'Error', body: err.message || 'Draft generation failed.' });
            setMode('preview');
        } finally {
            setLoadingDraft(false);
        }
    }, [instruction, selectedEmail, recipientHint]);

    // ---- Save draft to Gmail ----
    const handleSaveDraft = useCallback(async () => {
        if (!draft || !recipientHint.trim()) return;
        setSavingDraft(true);
        setSavedMessage('');
        try {
            await callFunction(SEND_DRAFT_URL, {
                to: recipientHint.trim(),
                subject: draft.subject,
                body: draft.body,
                threadId: selectedEmail?.threadId,
            });
            setSavedMessage('Draft saved to Gmail!');
        } catch (err: any) {
            setSavedMessage(err.message || 'Failed to save draft.');
        } finally {
            setSavingDraft(false);
        }
    }, [draft, recipientHint, selectedEmail]);

    // ---- Style extraction ----
    const handleExtractStyle = useCallback(async () => {
        setExtractingStyle(true);
        try {
            await callFunction(EXTRACT_STYLE_URL, {});
            setSavedMessage('Writing style profile updated!');
        } catch (err: any) {
            setSavedMessage(err.message || 'Style extraction failed.');
        } finally {
            setExtractingStyle(false);
        }
    }, []);

    // ---- Reset to inbox ----
    const resetToInbox = () => {
        setMode('inbox');
        setSelectedEmail(null);
        setReplies([]);
        setDraft(null);
        setInstruction('');
        setRecipientHint('');
        setSavedMessage('');
    };

    // ---- Render ----
    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* App Bar */}
                <View style={styles.appBar}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={mode === 'inbox' ? () => navigation.goBack() : resetToInbox}
                    >
                        <Text style={styles.backText}>
                            {mode === 'inbox' ? '← Back' : '← Inbox'}
                        </Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Ghostwriter</Text>
                    <TouchableOpacity
                        style={styles.styleButton}
                        onPress={handleExtractStyle}
                        disabled={extractingStyle}
                    >
                        <Text style={styles.styleButtonText}>
                            {extractingStyle ? '...' : '✏️ Style'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ---- INBOX MODE ---- */}
                {mode === 'inbox' && (
                    <>
                        {/* Compose new button */}
                        <TouchableOpacity
                            style={styles.composeButton}
                            onPress={() => { setSelectedEmail(null); setMode('compose'); }}
                        >
                            <Text style={styles.composeIcon}>📝</Text>
                            <Text style={styles.composeText}>Compose new email</Text>
                        </TouchableOpacity>

                        {/* Section label */}
                        <Text style={styles.sectionLabel}>📧  IMPORTANT EMAILS</Text>

                        {loadingEmails ? (
                            <View style={styles.centered}>
                                <ActivityIndicator size="small" color={theme.colors.primary} />
                            </View>
                        ) : emails.length === 0 ? (
                            <View style={styles.centered}>
                                <Text style={styles.emptyText}>
                                    No important emails found. Sync your Gmail first.
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={emails}
                                keyExtractor={e => e.id}
                                contentContainerStyle={styles.listContent}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.emailCard}
                                        onPress={() => handleSelectEmail(item)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.emailSubject} numberOfLines={1}>{item.subject}</Text>
                                        <Text style={styles.emailFrom} numberOfLines={1}>{item.from}</Text>
                                        <Text style={styles.emailSnippet} numberOfLines={2}>{item.snippet}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </>
                )}

                {/* ---- SMART REPLY MODE ---- */}
                {mode === 'smartReply' && (
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* Original email context */}
                        <View style={styles.originalCard}>
                            <Text style={styles.originalLabel}>Replying to:</Text>
                            <Text style={styles.originalSubject}>{selectedEmail?.subject}</Text>
                            <Text style={styles.originalFrom}>{selectedEmail?.from}</Text>
                        </View>

                        {loadingReplies ? (
                            <View style={styles.centered}>
                                <ActivityIndicator size="small" color={theme.colors.primary} />
                                <Text style={styles.loadingText}>Generating smart replies...</Text>
                            </View>
                        ) : (
                            <>
                                <Text style={styles.sectionLabel}>💡  SUGGESTED REPLIES</Text>
                                {replies.map((reply, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={styles.replyCard}
                                        onPress={() => handlePickReply(reply)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.replyLabel}>{reply.label}</Text>
                                        <Text style={styles.replyPreview} numberOfLines={3}>{reply.body}</Text>
                                    </TouchableOpacity>
                                ))}

                                {/* Option to write custom instruction instead */}
                                <TouchableOpacity
                                    style={styles.customButton}
                                    onPress={() => setMode('compose')}
                                >
                                    <Text style={styles.customButtonText}>
                                        ✍️ Write custom reply instruction
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </ScrollView>
                )}

                {/* ---- COMPOSE MODE ---- */}
                {mode === 'compose' && (
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {selectedEmail && (
                            <View style={styles.originalCard}>
                                <Text style={styles.originalLabel}>Replying to:</Text>
                                <Text style={styles.originalSubject}>{selectedEmail.subject}</Text>
                            </View>
                        )}

                        {/* Recipient field for new emails */}
                        {!selectedEmail && (
                            <TextInput
                                style={styles.textInput}
                                placeholder="Recipient email"
                                placeholderTextColor={theme.colors.onSurfaceVariant}
                                value={recipientHint}
                                onChangeText={setRecipientHint}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        )}

                        <TextInput
                            style={[styles.textInput, styles.instructionInput]}
                            placeholder={selectedEmail
                                ? 'e.g. "Tell them I can\'t make it but offer next Tuesday"'
                                : 'e.g. "Ask John about the Q3 report deadline"'}
                            placeholderTextColor={theme.colors.onSurfaceVariant}
                            value={instruction}
                            onChangeText={setInstruction}
                            multiline
                            textAlignVertical="top"
                        />

                        <TouchableOpacity
                            style={[styles.primaryButton, (!instruction.trim() || loadingDraft) && styles.buttonDisabled]}
                            onPress={handleCompose}
                            disabled={!instruction.trim() || loadingDraft}
                        >
                            {loadingDraft ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.primaryButtonText}>Generate Draft</Text>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                )}

                {/* ---- PREVIEW MODE ---- */}
                {mode === 'preview' && draft && (
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <Text style={styles.sectionLabel}>📄  DRAFT PREVIEW</Text>

                        <View style={styles.draftCard}>
                            <Text style={styles.draftSubject}>{draft.subject}</Text>
                            <View style={styles.draftDivider} />
                            <Text style={styles.draftBody} selectable>{draft.body}</Text>
                        </View>

                        {/* Recipient for saving to Gmail */}
                        <TextInput
                            style={styles.textInput}
                            placeholder="Recipient email (to save as Gmail draft)"
                            placeholderTextColor={theme.colors.onSurfaceVariant}
                            value={recipientHint || selectedEmail?.from?.match(/<(.+?)>/)?.[1] || ''}
                            onChangeText={setRecipientHint}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />

                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={() => setMode('compose')}
                            >
                                <Text style={styles.secondaryButtonText}>✏️ Revise</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.primaryButton, styles.flex, savingDraft && styles.buttonDisabled]}
                                onPress={handleSaveDraft}
                                disabled={savingDraft || !recipientHint.trim()}
                            >
                                {savingDraft ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>Save to Gmail Drafts</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        {savedMessage !== '' && (
                            <Text style={styles.savedMessage}>{savedMessage}</Text>
                        )}
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ---------------------------------------------------------------------------
// Styles — tonal surface system consistent with the rest of the app
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    flex: { flex: 1 },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.outlineVariant + '33',
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceContainerLow,
    },
    backText: { color: theme.colors.primary, fontSize: 14, fontWeight: 'bold' },
    title: {
        ...theme.typography.styles.titleMD,
        color: theme.colors.onSurface,
        letterSpacing: -0.5,
    },
    styleButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceContainerLow,
    },
    styleButtonText: { color: theme.colors.primary, fontSize: 12, fontWeight: '600' },

    // Inbox
    composeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.primaryFixed,
        borderRadius: theme.roundness.xl,
        gap: theme.spacing.sm,
    },
    composeIcon: { fontSize: 18 },
    composeText: { ...theme.typography.styles.bodyLG, color: theme.colors.primary, fontWeight: '600' },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: theme.colors.primary,
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.sm,
        textTransform: 'uppercase',
    },
    listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xl },
    emailCard: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: theme.roundness.xl,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.sm,
    },
    emailSubject: { ...theme.typography.styles.titleMD, color: theme.colors.onSurface, marginBottom: 2 },
    emailFrom: { fontSize: 13, color: theme.colors.onSurfaceVariant, marginBottom: 4 },
    emailSnippet: { fontSize: 13, color: theme.colors.outline, lineHeight: 18 },

    // Smart Reply
    scrollContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    originalCard: {
        backgroundColor: theme.colors.surfaceContainerLow,
        borderRadius: theme.roundness.xl,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
    },
    originalLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.outline, textTransform: 'uppercase', marginBottom: 4 },
    originalSubject: { ...theme.typography.styles.titleMD, color: theme.colors.onSurface },
    originalFrom: { fontSize: 13, color: theme.colors.onSurfaceVariant, marginTop: 2 },
    replyCard: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: theme.roundness.xl,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.sm,
    },
    replyLabel: { ...theme.typography.styles.titleMD, color: theme.colors.primary, marginBottom: 4 },
    replyPreview: { ...theme.typography.styles.bodyLG, color: theme.colors.onSurfaceVariant, lineHeight: 20 },
    customButton: {
        alignItems: 'center',
        padding: theme.spacing.md,
        marginTop: theme.spacing.sm,
        borderRadius: theme.roundness.xl,
        backgroundColor: theme.colors.surfaceContainerHigh,
    },
    customButtonText: { ...theme.typography.styles.bodyLG, color: theme.colors.onSurface, fontWeight: '600' },

    // Compose
    textInput: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: theme.roundness.xl,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 12,
        fontSize: 16,
        color: theme.colors.onSurface,
        marginBottom: theme.spacing.sm,
    },
    instructionInput: { minHeight: 100, maxHeight: 200 },
    primaryButton: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.roundness.xl,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: theme.spacing.sm,
    },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    buttonDisabled: { opacity: 0.5 },

    // Preview
    draftCard: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderRadius: theme.roundness.xl,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.lg,
    },
    draftSubject: { ...theme.typography.styles.titleMD, color: theme.colors.onSurface, marginBottom: theme.spacing.sm },
    draftDivider: { height: 1, backgroundColor: theme.colors.outlineVariant, marginBottom: theme.spacing.sm },
    draftBody: { ...theme.typography.styles.bodyLG, color: theme.colors.onSurface, lineHeight: 22 },
    actionRow: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.sm,
    },
    secondaryButton: {
        backgroundColor: theme.colors.surfaceContainerHigh,
        borderRadius: theme.roundness.xl,
        paddingVertical: 14,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
    },
    secondaryButtonText: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '600' },
    savedMessage: {
        textAlign: 'center',
        marginTop: theme.spacing.md,
        color: theme.colors.primary,
        fontWeight: '600',
    },

    // Shared
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.xl },
    loadingText: { marginTop: theme.spacing.sm, color: theme.colors.onSurfaceVariant },
    emptyText: { ...theme.typography.styles.bodyLG, color: theme.colors.onSurfaceVariant, textAlign: 'center' },
});
