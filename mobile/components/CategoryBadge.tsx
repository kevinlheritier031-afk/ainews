import React from 'react'
import { Text, View, StyleSheet } from 'react-native'
import type { Category } from '../types/news'

type BadgeStyle = { bg: string; border: string; color: string }

const STYLES: Record<Category, BadgeStyle> = {
  'Modèle':    { bg: 'rgba(99,102,241,0.15)',  border: '#6366f1', color: '#6366f1' },
  'Framework': { bg: 'rgba(6,182,212,0.15)',   border: '#06b6d4', color: '#06b6d4' },
  'Recherche': { bg: 'rgba(245,158,11,0.15)',  border: '#f59e0b', color: '#f59e0b' },
}

export function CategoryBadge({ category }: { category: Category }) {
  const s = STYLES[category]
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.label, { color: s.color }]}>{category.toUpperCase()}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  label: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
})
