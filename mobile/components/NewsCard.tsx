import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import type { NewsItem } from '../types/news'
import { CategoryBadge } from './CategoryBadge'
import { CodeBlock } from './CodeBlock'

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(20)).current
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }),
    ]).start()
  }, [])

  const handlePressIn = async () => {
    setPressed(true)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleSourcePress = async () => {
    const ok = await Linking.canOpenURL(item.source_url)
    if (ok) await Linking.openURL(item.source_url)
  }

  return (
    <Animated.View style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={() => setPressed(false)}
        style={[styles.card, pressed && styles.cardActive]}
      >
        <CategoryBadge category={item.category} />
        <Text style={styles.title}>{item.title}</Text>
        <View style={styles.separator} />
        <Text style={styles.summary}>{item.summary}</Text>
        <CodeBlock code={item.code_example} />
        <TouchableOpacity style={styles.sourceRow} onPress={handleSourcePress} activeOpacity={0.6}>
          <Text style={styles.sourceIcon}>↗</Text>
          <Text style={styles.sourceText} numberOfLines={1}>{extractDomain(item.source_url)}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 16,
  },
  cardActive: {
    borderColor: 'rgba(99,102,241,0.4)',
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 21,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 10,
  },
  summary: {
    color: '#a3a3a3',
    fontSize: 13,
    lineHeight: 19,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 5,
  },
  sourceIcon: {
    color: '#4b5563',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  sourceText: {
    color: '#4b5563',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
})
