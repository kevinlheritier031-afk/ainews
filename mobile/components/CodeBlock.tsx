import React, { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'

const KEYWORDS = new Set([
  'import', 'from', 'def', 'class', 'return', 'if', 'else', 'elif',
  'for', 'while', 'with', 'as', 'try', 'except', 'finally', 'async',
  'await', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is',
  'pip', 'install', 'python', 'export', 'echo', 'curl', 'bash',
])

type Token = { text: string; color: string }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  for (const line of source.split('\n')) {
    let rem = line
    while (rem.length > 0) {
      const comment = rem.match(/^(#.*)/)
      if (comment) {
        tokens.push({ text: comment[0], color: '#6b7280' })
        rem = rem.slice(comment[0].length)
        continue
      }
      const str = rem.match(/^(["'])(?:(?!\1)[^\\]|\\.)*\1/)
      if (str) {
        tokens.push({ text: str[0], color: '#06b6d4' })
        rem = rem.slice(str[0].length)
        continue
      }
      const word = rem.match(/^([a-zA-Z_]\w*)/)
      if (word) {
        tokens.push({ text: word[0], color: KEYWORDS.has(word[0]) ? '#818cf8' : '#e5e7eb' })
        rem = rem.slice(word[0].length)
        continue
      }
      const num = rem.match(/^(\d+\.?\d*)/)
      if (num) {
        tokens.push({ text: num[0], color: '#34d399' })
        rem = rem.slice(num[0].length)
        continue
      }
      tokens.push({ text: rem[0], color: '#9ca3af' })
      rem = rem.slice(1)
    }
    tokens.push({ text: '\n', color: '#e5e7eb' })
  }
  return tokens
}

function stripFences(raw: string): string {
  return raw.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim()
}

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const scale = useRef(new Animated.Value(1)).current
  const clean = stripFences(code)
  const tokens = tokenize(clean)

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(clean)
    setCopied(true)
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.0,  duration: 80, useNativeDriver: true }),
    ]).start()
    setTimeout(() => setCopied(false), 2000)
  }, [clean, scale])

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.copyWrap, { transform: [{ scale }] }]}>
        <TouchableOpacity onPress={handleCopy} activeOpacity={0.7} style={styles.copyBtn}>
          <Text style={styles.copyLabel}>{copied ? 'Copié ✓' : 'Copier'}</Text>
        </TouchableOpacity>
      </Animated.View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.code}>
          {tokens.map((t, i) => (
            <Text key={i} style={{ color: t.color }}>{t.text}</Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#0d0d0d',
    borderLeftWidth: 2,
    borderLeftColor: '#6366f1',
    borderRadius: 4,
    paddingTop: 28,
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginTop: 10,
  },
  copyWrap: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  copyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  copyLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#6366f1',
    letterSpacing: 0.4,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
})
