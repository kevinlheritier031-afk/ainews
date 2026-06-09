import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'

type NewsItem = {
  id: string
  title: string
  category: string
  summary: string
  source_url: string
  created_at: string
  importance_score?: number
  urgent?: boolean
}

const SIG: Record<string, { code: string; color: string; dim: string; dimHi: string }> = {
  'Modèle':    { code: 'MODL', color: '#00e5ff', dim: 'rgba(0,229,255,0.12)',   dimHi: 'rgba(0,229,255,0.28)' },
  'Framework': { code: 'FRMK', color: '#ff6d3a', dim: 'rgba(255,109,58,0.12)',  dimHi: 'rgba(255,109,58,0.28)' },
  'Recherche': { code: 'RSCH', color: '#b06fff', dim: 'rgba(176,111,255,0.12)', dimHi: 'rgba(176,111,255,0.28)' },
}
const DEFAULT_SIG = { code: 'DATA', color: '#667788', dim: 'rgba(100,120,140,0.12)', dimHi: 'rgba(100,120,140,0.22)' }

function getSignal(category: string) {
  return SIG[category] ?? DEFAULT_SIG
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  const m = Math.floor(d / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}j`
  if (h >= 1)  return `${h}h`
  return `${m}m`
}

function BookmarkCard({
  item,
  index,
  onRemove,
}: {
  item: NewsItem
  index: number
  onRemove: () => void
}) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(16)).current
  const router = useRouter()
  const sig = getSignal(item.category)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: Math.min(index * 60, 300), useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 400, delay: Math.min(index * 60, 300), useNativeDriver: true }),
    ]).start()
  }, [])

  function openDetail() {
    router.push({
      pathname: '/detail',
      params: {
        title: item.title,
        category: item.category,
        summary: item.summary,
        code_example: '',
        source_url: item.source_url,
        importance_score: String(item.importance_score ?? 5),
        created_at: item.created_at,
      },
    })
  }

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }], marginHorizontal: 12, marginBottom: 10 }}>
      <TouchableOpacity onPress={openDetail} activeOpacity={0.82}>
        <LinearGradient
          colors={[sig.dimHi, sig.dim, 'rgba(18,30,55,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, { borderLeftColor: sig.color }]}
        >
          <View style={styles.cardGloss} />
          <View style={styles.cardHead}>
            <View style={[styles.tagBox, { borderColor: sig.color + '55', backgroundColor: sig.color + '12' }]}>
              <Text style={[styles.tagTxt, { color: sig.color }]}>{sig.code}</Text>
            </View>
            {(item.importance_score ?? 0) >= 8 && <Text style={[styles.hotDot, { color: sig.color }]}>◈</Text>}
            <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
            <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.bookmarkIcon, { color: sig.color }]}>★</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>
          <Text style={[styles.readBtn, { color: sig.color }]}>LIRE ›</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  )
}

export default function Bookmarks() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  async function loadBookmarks() {
    const stored = await AsyncStorage.getItem('bookmarks')
    if (stored) setItems(JSON.parse(stored))
    setLoading(false)
  }

  async function removeBookmark(id: string) {
    const updated = items.filter(i => i.id !== id)
    setItems(updated)
    await AsyncStorage.setItem('bookmarks', JSON.stringify(updated))
  }

  useEffect(() => { loadBookmarks() }, [])

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#09142a', '#06101f', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>‹ FLUX</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>★ FAVORIS</Text>
          <Text style={styles.headerCount}>{items.length} signal{items.length > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.circuitBar}>
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#b06fff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingTxt}>› Chargement…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <BookmarkCard
              item={item}
              index={index}
              onRemove={() => removeBookmark(item.id)}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>☆</Text>
              <Text style={styles.emptyTxt}>Aucun favori enregistré</Text>
              <Text style={styles.emptyHint}>Appuie sur ☆ sur un article pour le sauvegarder</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c1830' },

  header:    { paddingHorizontal: 18, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  backBtn:   { borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  backTxt:   { color: '#00e5ff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  headerTitle: { color: '#00e5ff', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  headerCount: { marginLeft: 'auto', color: '#2a4050', fontSize: 10, letterSpacing: 0.5 },

  circuitBar:  { flexDirection: 'row', alignItems: 'center' },
  circuitDot:  { width: 5, height: 5, borderRadius: 3 },
  circuitLine: { flex: 1, height: 1, backgroundColor: '#1e3050' },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { color: '#2a5060', fontSize: 14, letterSpacing: 1 },

  list: { paddingTop: 16 },

  card: {
    borderRadius: 16,
    borderLeftWidth: 2,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor:    'rgba(255,255,255,0.07)',
    borderRightColor:  'rgba(255,255,255,0.03)',
    borderBottomColor: 'rgba(0,0,0,0.35)',
    padding: 16,
    overflow: 'hidden',
  },
  cardGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tagBox:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagTxt:    { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  hotDot:    { fontSize: 10 },
  cardTime:  { marginLeft: 'auto', color: '#3a5060', fontSize: 10, letterSpacing: 0.3 },
  bookmarkIcon: { fontSize: 15, fontWeight: '900' },

  cardTitle:   { color: '#d0e4f0', fontSize: 15, fontWeight: '700', lineHeight: 22, marginBottom: 8, letterSpacing: 0.1 },
  cardSummary: { color: '#7a98a8', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  readBtn:     { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textAlign: 'right' },

  emptyBox:  { alignItems: 'center', paddingTop: 120, paddingHorizontal: 40 },
  emptyIcon: { color: '#2a4050', fontSize: 52, marginBottom: 16 },
  emptyTxt:  { color: '#3a5060', fontSize: 16, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
  emptyHint: { color: '#2a4050', fontSize: 13, textAlign: 'center', lineHeight: 20 },
})
