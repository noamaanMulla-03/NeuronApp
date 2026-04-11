import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../src/store/authStore';

interface ChatMessage {
    id: string;
    role: 'user' | 'ai';
    text: string;
    sources?: string[];
}

// Cloud Function URL — matches the sync engine's raw-fetch approach to avoid
// httpsCallable parsing issues in React Native with v2 functions.
const SEMANTIC_CHAT_URL = 'https://us-central1-neuron-bb594.cloudfunctions.net/semanticChat';

// Maps HTTP status or Firebase error codes to user-friendly messages
function getUserErrorMessage(status?: number, serverMessage?: string): string {
    if (status === 401 || serverMessage?.includes('unauthenticated')) {
        return 'Your session has expired. Please sign in again.';
    }
    if (status === 400 || serverMessage?.includes('invalid-argument')) {
        return 'Your query was invalid. Please try rephrasing.';
    }
    if (status === 503) {
        return 'The service is temporarily unavailable. Please try again in a moment.';
    }
    if (status === 504 || serverMessage?.includes('timed out')) {
        return 'The request took too long. Please try a shorter or simpler query.';
    }
    // Include the server message if available — helps diagnose issues
    if (serverMessage) {
        return `Something went wrong: ${serverMessage}`;
    }
    return 'Something went wrong while processing your request. Please try again.';
}

export default function SemanticChatScreen() {
    const navigation = useNavigation();
    const { user } = useAuthStore();
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!query.trim()) return;

        // Guard: must be authenticated before calling the cloud function
        if (!user) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'ai',
                text: 'You need to be signed in to use Semantic Memory.',
            }]);
            return;
        }

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            text: query.trim(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setQuery('');
        setLoading(true);

        try {
            // Get Firebase ID token for Cloud Functions auth
            const { auth } = require('../../src/lib/firebase');
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) throw new Error('Could not get auth token');

            // Call the Cloud Function via raw fetch — consistent with sync-engine.ts
            const response = await fetch(SEMANTIC_CHAT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ data: { query: userMsg.text } }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`semanticChat HTTP ${response.status}:`, errorText);
                // Try to parse the error JSON for a structured message
                let serverMsg: string | undefined;
                try {
                    const parsed = JSON.parse(errorText);
                    serverMsg = parsed?.error?.message || parsed?.error?.status;
                } catch { /* not JSON */ }
                throw { status: response.status, serverMessage: serverMsg };
            }

            const json = await response.json() as any;
            // Firebase onCall responses are wrapped in a "result" field
            const result = json.result;

            const aiMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                text: result.answer,
                sources: result.sources,
            };

            setMessages((prev) => [...prev, aiMsg]);
        } catch (error: any) {
            console.error('Semantic Chat Error:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                text: getUserErrorMessage(error?.status, error?.serverMessage || error?.message),
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.appBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Semantic Memory</Text>
                <View style={{ width: 60 }} />
            </View>

            <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false}>
                    {messages.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>🧠</Text>
                            <Text style={styles.emptyText}>
                                Ask me anything about your digital life. I search across your Docs, Gmail, Keep, and Calendar.
                            </Text>
                        </View>
                    ) : (
                        messages.map((msg) => (
                            <View key={msg.id} style={[
                                styles.messageBubble,
                                msg.role === 'user' ? styles.messageUser : styles.messageAi
                            ]}>
                                <Text style={[
                                    styles.messageText,
                                    msg.role === 'user' ? styles.messageTextUser : styles.messageTextAi
                                ]}>
                                    {msg.text}
                                </Text>
                                {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                                    <View style={styles.sourceContainer}>
                                        <Text style={styles.sourceTitle}>Sources:</Text>
                                        {msg.sources.map((src, i) => (
                                            <Text key={i} style={styles.sourceText}>- {src}</Text>
                                        ))}
                                    </View>
                                )}
                            </View>
                        ))
                    )}
                    {loading && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                            <Text style={styles.loadingText}>Synthesizing response...</Text>
                        </View>
                    )}
                </ScrollView>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="What's on your mind?"
                        placeholderTextColor={theme.colors.onSurfaceVariant}
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={handleSend}
                        returnKeyType="send"
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, !query.trim() && styles.sendButtonDisabled]}
                        onPress={handleSend}
                        disabled={!query.trim() || loading}
                    >
                        <Text style={styles.sendIcon}>↑</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    keyboardAvoid: {
        flex: 1,
    },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.outlineVariant + '33', // 20% opacity ghost border
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceContainerLow,
    },
    backText: {
        color: theme.colors.primary,
        fontSize: 14,
        fontWeight: 'bold',
    },
    title: {
        ...theme.typography.styles.titleMD,
        color: theme.colors.onSurface,
        letterSpacing: -0.5,
    },
    chatScroll: {
        padding: theme.spacing.lg,
        flexGrow: 1,
        justifyContent: 'flex-end',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        ...theme.typography.styles.bodyLG,
        color: theme.colors.onSurfaceVariant,
        textAlign: 'center',
        lineHeight: 24,
    },
    messageBubble: {
        maxWidth: '85%',
        padding: 16,
        borderRadius: 20,
        marginBottom: 16,
    },
    messageUser: {
        alignSelf: 'flex-end',
        backgroundColor: theme.colors.primary,
        borderBottomRightRadius: 4,
    },
    messageAi: {
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant + '33',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        ...theme.typography.styles.bodyLG,
        lineHeight: 24,
    },
    messageTextUser: {
        color: '#FFFFFF',
    },
    messageTextAi: {
        color: theme.colors.onSurface,
    },
    sourceContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.outlineVariant + '33',
    },
    sourceTitle: {
        ...theme.typography.styles.labelMD,
        color: theme.colors.primary,
        marginBottom: 4,
    },
    sourceText: {
        fontSize: 11,
        color: theme.colors.onSurfaceVariant,
        fontStyle: 'italic',
        marginBottom: 4,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.colors.surfaceContainerLowest,
        alignSelf: 'flex-start',
        borderRadius: 20,
        borderBottomLeftRadius: 4,
        marginBottom: 16,
    },
    loadingText: {
        marginLeft: 12,
        color: theme.colors.primary,
        fontSize: 14,
        fontWeight: '500',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: theme.spacing.lg,
        paddingBottom: Platform.OS === 'ios' ? theme.spacing.lg : theme.spacing.md,
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderTopWidth: 1,
        borderTopColor: theme.colors.outlineVariant + '33',
    },
    input: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 12,
        fontSize: 16,
        color: theme.colors.onSurface,
        fontFamily: theme.typography.fonts.body,
    },
    sendButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    sendButtonDisabled: {
        backgroundColor: theme.colors.surfaceContainerHigh,
    },
    sendIcon: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold',
    },
});