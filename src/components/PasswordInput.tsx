import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  showStrengthIndicator?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  error,
  containerStyle,
  showStrengthIndicator = false,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const getPasswordStrength = (password: string): number => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 6) strength += 1;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
  };

  const getStrengthColor = (strength: number): string => {
    if (strength <= 1) return '#FF3B30';
    if (strength <= 2) return '#FF9500';
    if (strength <= 3) return '#34C759';
    return '#007AFF';
  };

  const strength = getPasswordStrength(props.value || '');

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, error && styles.inputError]}>
        <TextInput
          style={styles.input}
          secureTextEntry={!showPassword}
          placeholderTextColor="#999"
          {...props}
        />
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Text style={styles.toggleText}>
            {showPassword ? 'Hide' : 'Show'}
          </Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {showStrengthIndicator && props.value && (
        <View style={styles.strengthContainer}>
          <View style={styles.strengthBar}>
            <View
              style={[
                styles.strengthFill,
                {
                  width: `${(strength / 5) * 100}%`,
                  backgroundColor: getStrengthColor(strength),
                },
              ]}
            />
          </View>
          <Text style={[styles.strengthText, { color: getStrengthColor(strength) }]}>
            {strength <= 1 && 'Weak'}
            {strength > 1 && strength <= 2 && 'Fair'}
            {strength > 2 && strength <= 3 && 'Good'}
            {strength > 3 && 'Strong'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toggleText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  error: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    marginRight: 8,
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
