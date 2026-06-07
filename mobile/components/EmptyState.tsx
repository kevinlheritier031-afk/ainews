import React from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native'

type State = 'loading' | 'empty' | 'error'

interface Props {
  state: State
  onRetry?: () => void
}

export function EmptyState({ state, onRetry }: Props) {
  return (
    <View style={styles.container}>
      {state === 'loading' && (
        <>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.label}>Chargement...</Text>
        </>
      )}
      {state === 'empty' && (
        <>
          <Text style={styles.icon}>◦</Text>
          <Text style={styles.label}>Aucune news aujourd'hui</Text>
        </>
      )}
      {state === 'error' && (
        <>
          <Text style={styles.errorLabel}>Erreur réseau</Text>
          {onRetry != null && (
            <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
              <Text style={styles.retryLabel}>Réessayer</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  icon: {
    fontSize: 28,
    color: '#374151',
    fontFamily: 'monospace',
  },
  label: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#4b5563',
  },
  errorLabel: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#ef4444',
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 4,
  },
  retryLabel: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#6366f1',
    letterSpacing: 0.4,
  },
})
