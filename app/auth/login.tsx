import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { Button } from '../../src/components/Button';
import { signInWithGoogle } from '../../src/lib/auth';

export default function LoginScreen() {
  const [googleLoading, setGoogleLoading] = useState(false);

  const onGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error handled
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Background Decorative Elements */}
          <View style={styles.decorativeCircle1} />
          <View style={styles.decorativeCircle2} />

          <View style={styles.header}>
            <View style={styles.logoContainer}>
               <View style={styles.logoBox}>
                  <Text style={styles.logoSymbol}>H</Text>
               </View>
               <Text style={styles.logoText}>Neuron</Text>
            </View>
            
            <Text style={styles.headline}>
              Elevate your{'\n'}intelligence.
            </Text>
            <Text style={styles.subtitle}>
              A focused sanctuary for your digital life. Securely sync your ecosystem to unlock proactive insights.
            </Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.securityIconContainer}>
               <Text style={styles.securityIcon}>🔒</Text>
            </View>
            
            <Text style={styles.cardTitle}>Security First</Text>
            <Text style={styles.cardSubtitle}>
              Enterprise-grade AES-256 encryption. Your neural data is local, private, and always yours.
            </Text>

            <Button
              title="Sign in with Google"
              onPress={onGoogleSignIn}
              loading={googleLoading}
              variant="google"
              style={styles.googleButton}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                By continuing, you agree to Neuron's{' '}
                <Text style={styles.linkText}>Privacy Policy</Text> and{' '}
                <Text style={styles.linkText}>Terms of Service</Text>.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    minHeight: '100%',
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: theme.colors.primaryFixed + '33', // 20% opacity
    zIndex: -1,
  },
  decorativeCircle2: {
    position: 'absolute',
    top: '40%',
    right: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: theme.colors.surfaceContainerHigh + '4D', // 30% opacity
    zIndex: -1,
  },
  header: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xxl,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoSymbol: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: theme.typography.fonts.headline,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.primary,
    fontFamily: theme.typography.fonts.headline,
    letterSpacing: -1,
  },
  headline: {
    ...theme.typography.styles.displayLG,
    fontSize: 48,
    color: theme.colors.onSurface,
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    ...theme.typography.styles.bodyLG,
    color: theme.colors.onSurfaceVariant,
    maxWidth: 300,
    lineHeight: 24,
  },
  formCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: 32,
    padding: theme.spacing.xl,
    shadowColor: theme.colors.onSurface,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.04,
    shadowRadius: 40,
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  securityIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
  },
  securityIcon: {
    fontSize: 32,
  },
  cardTitle: {
    ...theme.typography.styles.headlineMD,
    fontSize: 24,
    textAlign: 'center',
    color: theme.colors.onSurface,
    marginBottom: theme.spacing.xs,
  },
  cardSubtitle: {
    ...theme.typography.styles.bodyLG,
    fontSize: 14,
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  googleButton: {
    marginBottom: theme.spacing.md,
  },
  footer: {
    marginTop: theme.spacing.xs,
  },
  footerText: {
    fontSize: 11,
    color: theme.colors.outline,
    textAlign: 'center',
    lineHeight: 16,
    fontFamily: theme.typography.fonts.body,
  },
  linkText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
