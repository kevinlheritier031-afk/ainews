import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Animated, Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { createClient } from '@supabase/supabase-js'

const { height: SCREEN_H } = Dimensions.get('window')

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
)

type NewsItem = {
  id: string
  title: string
  category: string
  summary: string
  source_url: string
  created_at: string
  importance_score?: number
}

const SIG = {
  'Modèle':    { code: 'MODL', color: '#00e5ff' },
  'Framework': { code: 'FRMK', color: '#ff6d3a' },
  'Recherche': { code: 'RSCH', color: '#b06fff' },
}
const DEFAULT_SIG = { code: 'DATA', color: '#667788' }

function getSignal(category: string) {
  return SIG[category as keyof typeof SIG] ?? DEFAULT_SIG
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const days = Math.floor(d / 86400000)
  const h = Math.floor(d / 3600000)
  if (days >= 1) return `${days}j`
  return `${h}h`
}

function ArchiveCard({ item, index }: { item: NewsItem; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(12)).current
  const router = useRouter()
  const sig = getSignal(item.category)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 40, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 350, delay: index * 40, useNativeDriver: true }),
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
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>
      <TouchableOpacity onPress={openDetail} activeOpacity={0.82}>
        <View style={[styles.card, { borderLeftColor: sig.color + '88' }]}>
          <View style={styles.cardHead}>
            <View style={[styles.tagBox, { borderColor: sig.color + '44', backgroundColor: sig.color + '0e' }]}>
              <Text style={[styles.tagTxt, { color: sig.color + 'bb' }]}>{sig.code}</Text>
            </View>
            <Text style={styles.cardScore}>{item.importance_score ?? '–'}/10</Text>
            <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.groupHeader}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.groupLine} />
      <Text style={styles.groupCount}>{count} signal{count > 1 ? 's' : ''}</Text>
    </View>
  )
}

export default function Archive() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchArchive() {
    const { data } = await supabase
      .from('ai_news')
      .select('id, title, category, summary, source_url, created_at, importance_score')
      .eq('archived', true)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setNews(data)
  }

  useEffect(() => {
    fetchArchive().finally(() => setLoading(false))
  }, [])

  async function onRefresh() {
    setRefreshing(true)
    await fetchArchive()
    setRefreshing(false)
  }

  // Grouper par date (aujourd'hui / hier / il y a X jours)
  function dayLabel(iso: string): string {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (d === 0) return "AUJOURD'HUI"
    if (d === 1) return 'HIER'
    if (d < 7)  return `IL Y A ${d} JOURS`
    if (d < 14) return 'LA SEMAINE DERNIÈRE'
    return `IL Y A ${Math.floor(d / 7)} SEMAINES`
  }

  // Construire la liste avec séparateurs de groupe
  const grouped: { type: 'header'; label: string; count: number } | { type: 'item'; item: NewsItem }[] = []
  const seenLabels = new Map<string, number>()
  const countByLabel = new Map<string, number>()

  for (const item of news) {
    const label = dayLabel(item.created_at)
    countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1)
  }

  let lastLabel = ''
  const flatList: ({ type: 'header'; label: string; count: number } | { type: 'item'; item: NewsItem; index: number })[] = []
  let itemIdx = 0

  for (const item of news) {
    const label = dayLabel(item.created_at)
    if (label !== lastLabel) {
      flatList.push({ type: 'header', label, count: countByLabel.get(label) ?? 0 })
      lastLabel = label
    }
    flatList.push({ type: 'item', item, index: itemIdx++ })
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <LinearGradient
        colors={['#09142a', '#06101f', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>‹ FLUX</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>◫ ARCHIVE</Text>
          <Text style={styles.headerSub}>{news.length} signaux archivés</Text>
        </View>

        <View style={styles.circuitBar}>
          <View style={[styles.circuitDot, { backgroundColor: '#2a4060' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#3a5070' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#2a4060' }]} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingTxt}>› Chargement archive…</Text>
        </View>
      ) : (
        <FlatList
          data={flatList}
          keyExtractor={(item, i) => item.type === 'item' ? item.item.id : `h-${i}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2a5070" />}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <GroupHeader label={item.label} count={item.count} />
            }
            return <ArchiveCard item={item.item} index={item.index} />
          }}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucun signal archivé</Text>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060d1a' },

  header:    { paddingHorizontal: 18, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },

  backBtn: { borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  backTxt: { color: '#00e5ff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  headerTitle: { color: '#5a7888', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  headerSub:   { marginLeft: 'auto', color: '#2a3a4a', fontSize: 10, letterSpacing: 0.5 },

  circuitBar:  { flexDirection: 'row', alignItems: 'center' },
  circuitDot:  { width: 4, height: 4, borderRadius: 2 },
  circuitLine: { flex: 1, height: 1, backgroundColor: '#0e1e30' },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { color: '#2a4050', fontSize: 14, letterSpacing: 1 },

  list: { padding: 12, gap: 8 },

  groupHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginTop: 18, marginBottom: 8, gap: 8 },
  groupLabel:  { color: '#3a5570', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  groupLine:   { flex: 1, height: 1, backgroundColor: '#0e1e2e' },
  groupCount:  { color: '#253545', fontSize: 9, letterSpacing: 0.5 },

  card: {
    borderRadius: 12,
    borderLeftWidth: 2,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor:    'rgba(255,255,255,0.04)',
    borderRightColor:  'rgba(255,255,255,0.02)',
    borderBottomColor: 'rgba(0,0,0,0.3)',
    backgroundColor:   'rgba(10,18,32,0.95)',
    padding: 14,
  },

  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tagBox:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  tagTxt:    { fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  cardScore: { color: '#2a4050', fontSize: 9, letterSpacing: 0.3 },
  cardTime:  { marginLeft: 'auto', color: '#2a3a4a', fontSize: 10 },

  cardTitle:   { color: '#8aa0b0', fontSize: 13, fontWeight: '700', lineHeight: 19, marginBottom: 6, letterSpacing: 0.1 },
  cardSummary: { color: '#3a5060', fontSize: 11, lineHeight: 16 },

  empty: { color: '#2a4050', textAlign: 'center', marginTop: 80, fontSize: 14, letterSpacing: 0.5 },
})
