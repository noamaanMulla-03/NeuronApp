import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { useNavigation } from '@react-navigation/native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../src/lib/firebase';

interface ChatMessage {
    id: string;
    role: 'user' | 'ai';
    text: string;
    sources?: string[];
}

export default function SemanticChatScreen() {
    const navigation = useNavigation();
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!query.trim()) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            text: query.trim(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setQuery('');
        setLoading(true);

        try {
            const functions = getFunctions(app, 'us-central1');
            const semanticChat = httpsCallable<{ query: string }, { answer: string; sources: string[] }>(functions, 'semanticChat');
            
            const response = await semanticChat({ query: userMsg.text });
            const data = response.data;

            const aiMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                text: data.answer,
                sources: data.sources,
            };

            setMessages((prev) => [...prev, aiMsg]);
        } catch (error: any) {
            console.error('Semantic Chat Error:', error);
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                text: `I encountered an error trying to process your request: ${error.message || 'Unknown error'}`,
            };
            setMessages((prev) => [...prev, errorMsg]);
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