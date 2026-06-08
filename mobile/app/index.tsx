import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Linking, RefreshControl, Animated, Dimensions, Modal,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

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
  urgent?: boolean
}

const SIG = {
  'Modèle':    { code: 'MODL', color: '#00e5ff', dim: 'rgba(0,229,255,0.08)' },
  'Framework': { code: 'FRMK', color: '#ff6d3a', dim: 'rgba(255,109,58,0.08)' },
  'Recherche': { code: 'RSCH', color: '#b06fff', dim: 'rgba(176,111,255,0.08)' },
}
const DEFAULT_SIG = { code: 'DATA', color: '#667788', dim: 'rgba(100,120,140,0.08)' }

function getSignal(category: string) {
  return SIG[category as keyof typeof SIG] ?? DEFAULT_SIG
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  const m = Math.floor(d / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d`
  if (h >= 1)  return `${h}h`
  return `${m}m`
}

// ── Scanline qui balaie l'écran en boucle ─────────────────────────────────────
function Scanline() {
  const y = useRef(new Animated.Value(-2)).current
  useEffect(() => {
    Animated.loop(
      Animated.timing(y, { toValue: SCREEN_H, duration: 5000, useNativeDriver: true })
    ).start()
  }, [])
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
    >
      <Animated.View style={[styles.scanline, { transform: [{ translateY: y }] }]} />
    </Animated.View>
  )
}

// ── Titre qui tape caractère par caractère ────────────────────────────────────
const MESSAGES = [
  'SCANNING 9 LIVE FEEDS…',
  'FILTERING NOISE…',
  'GEMINI RANKING SIGNALS…',
  'STREAM SYNCHRONIZED ✓',
]
function TypeWriter({ count }: { count: number }) {
  const [txt, setTxt] = useState('')
  const [msgIdx, setMsgIdx] = useState(0)
  const cursor = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursor, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursor, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  useEffect(() => {
    const msg = MESSAGES[msgIdx]
    let i = 0
    setTxt('')
    const iv = setInterval(() => {
      i++
      setTxt(msg.slice(0, i))
      if (i >= msg.length) {
        clearInterval(iv)
        setTimeout(() => setMsgIdx(x => (x + 1) % MESSAGES.length), 2500)
      }
    }, 35)
    return () => clearInterval(iv)
  }, [msgIdx])

  return (
    <View style={styles.twRow}>
      <Text style={styles.twPrompt}>{'›'} </Text>
      <Text style={styles.twText}>{txt}</Text>
      <Animated.Text style={[styles.twCursor, { opacity: cursor }]}>▌</Animated.Text>
      <Text style={styles.twCount}> [{String(count).padStart(3, '0')}]</Text>
    </View>
  )
}

// ── Barres de signal unicode ──────────────────────────────────────────────────
function SignalBars({ score, color }: { score: number; color: string }) {
  const filled = Math.round(score / 2)
  const chars = ['▁','▃','▅','▆','█']
  return (
    <View style={styles.barsRow}>
      {chars.map((c, i) => (
        <Text key={i} style={{ color: i < filled ? color : '#1a1f2e', fontSize: 10, lineHeight: 14 }}>
          {c}
        </Text>
      ))}
    </View>
  )
}

// ── Carte article ─────────────────────────────────────────────────────────────
function Card({ item, index }: { item: NewsItem; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current
  const tx      = useRef(new Animated.Value(30)).current
  const router  = useRouter()
  const sig = getSignal(item.category)
  const hot = (item.importance_score ?? 0) >= 8

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 70, useNativeDriver: true }),
      Animated.timing(tx,      { toValue: 0, duration: 350, delay: index * 70, useNativeDriver: true }),
    ]).start()
  }, [])

  function openDetail() {
    router.push({
      pathname: '/detail',
      params: {
        title:            item.title,
        category:         item.category,
        summary:          item.summary,
        code_example:     '',
        source_url:       item.source_url,
        importance_score: String(item.importance_score ?? 5),
        created_at:       item.created_at,
      },
    })
  }

  return (
    <Animated.View style={{ opacity, transform: [{ translateX: tx }] }}>
      <TouchableOpacity
        onPress={openDetail}
        activeOpacity={0.82}
        style={[styles.card, { borderLeftColor: sig.color, backgroundColor: sig.dim }]}
      >
        {/* Ligne supérieure */}
        <View style={styles.cardHead}>
          <View style={[styles.tagBox, { borderColor: sig.color + '60' }]}>
            <Text style={[styles.tagTxt, { color: sig.color }]}>{sig.code}</Text>
          </View>
          {hot && (
            <View style={styles.priorityBadge}>
              <Text style={styles.priorityTxt}>◈ PRIORITY</Text>
            </View>
          )}
          <Text style={styles.cardTime}>{timeAgo(item.created_at)} AGO</Text>
        </View>

        {/* Titre */}
        <Text style={styles.cardTitle}>{item.title}</Text>

        {/* Aperçu résumé — 3 lignes max */}
        <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>

        {/* Pied */}
        <View style={styles.cardFoot}>
          {item.importance_score != null
            ? <SignalBars score={item.importance_score} color={sig.color} />
            : <View />}
          <Text style={[styles.accessBtn, { color: sig.color }]}>LIRE LA SYNTHÈSE ›</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Écran principal ───────────────────────────────────────────────────────────
export default function Index() {
  const insets = useSafeAreaInsets()
  const [news, setNews]             = useState<NewsItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [urgentItems, setUrgentItems] = useState<NewsItem[]>([])
  const [showAlert, setShowAlert]   = useState(false)

  async function fetchNews() {
    const { data } = await supabase
      .from('ai_news')
      .select('id, title, category, summary, source_url, created_at, importance_score, urgent')
      .order('importance_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNews(data)
    return data
  }

  async function checkUrgent(data: NewsItem[]) {
    const lastOpen = await AsyncStorage.getItem('last_opened')
    const since = lastOpen ? new Date(lastOpen) : new Date(Date.now() - 3600000)
    const newUrgent = data.filter(
      item => item.urgent && new Date(item.created_at) > since
    )
    if (newUrgent.length > 0) {
      setUrgentItems(newUrgent)
      setShowAlert(true)
    }
    await AsyncStorage.setItem('last_opened', new Date().toISOString())
  }

  useEffect(() => {
    fetchNews().then(data => {
      if (data) checkUrgent(data)
    }).finally(() => setLoading(false))
  }, [])

  async function onRefresh() {
    setRefreshing(true)
    await fetchNews()
    setRefreshing(false)
  }

  return (
    <View style={styles.root}>
      <Scanline />

      {/* Alerte signaux urgents */}
      <Modal visible={showAlert} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalIcon}>◈</Text>
            <Text style={styles.modalTitle}>PRIORITY SIGNAL{urgentItems.length > 1 ? 'S' : ''} DETECTED</Text>
            <Text style={styles.modalCount}>{urgentItems.length} nouveau{urgentItems.length > 1 ? 'x' : ''} signal{urgentItems.length > 1 ? 's' : ''} critique{urgentItems.length > 1 ? 's' : ''}</Text>
            {urgentItems.slice(0, 3).map(item => (
              <Text key={item.id} style={styles.modalItem} numberOfLines={2}>› {item.title}</Text>
            ))}
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowAlert(false)}>
              <Text style={styles.modalBtnTxt}>ACCÉDER AU FLUX</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <LinearGradient
        colors={['#00050f', '#00020a', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logoIcon}>◈</Text>
          <Text style={styles.logoText}>NEXUS</Text>
          <Text style={styles.logoSub}> // AI SIGNAL FEED</Text>
        </View>

        {/* Typewriter status */}
        <TypeWriter count={news.length} />

        {/* Séparateur "circuit" */}
        <View style={styles.circuitBar}>
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#ff6d3a' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#b06fff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
        </View>

        {/* Légende catégories */}
        <View style={styles.legend}>
          {Object.entries(SIG).map(([name, s]) => (
            <View key={name} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendTxt}>{name.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Feed */}
      {loading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingTxt}>{'> CONNECTING TO NEURAL FEEDS…'}</Text>
        </View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00e5ff"
            />
          }
          renderItem={({ item, index }) => <Card item={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ListEmptyComponent={
            <Text style={styles.empty}>{'> NO SIGNALS DETECTED'}</Text>
          }
        />
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#00020a' },

  // Scanline
  scanline: {
    position: 'absolute', left: 0, right: 0,
    height: 2,
    backgroundColor: 'rgba(0,229,255,0.06)',
    shadowColor: '#00e5ff', shadowRadius: 8, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 0 },
  },

  // Header
  header: { paddingHorizontal: 16, paddingBottom: 12 },

  logoRow:  { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  logoIcon: { color: '#00e5ff', fontSize: 20, marginRight: 6 },
  logoText: { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: 6 },
  logoSub:  { color: '#2a3a4a', fontSize: 10, letterSpacing: 2, fontWeight: '600' },

  twRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  twPrompt: { color: '#00e5ff', fontSize: 11, fontWeight: '700' },
  twText:   { color: '#3a6070', fontSize: 11, letterSpacing: 0.5 },
  twCursor: { color: '#00e5ff', fontSize: 11 },
  twCount:  { color: '#1a2a3a', fontSize: 11, letterSpacing: 1 },

  circuitBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  circuitDot: { width: 5, height: 5, borderRadius: 2.5 },
  circuitLine:{ flex: 1, height: 1, backgroundColor: '#0a1520' },

  legend:     { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 4, height: 4, borderRadius: 2 },
  legendTxt:  { color: '#2a3a4a', fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },

  // Loading
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { color: '#1a3a4a', fontSize: 13, letterSpacing: 1 },

  // List
  list: { padding: 10, gap: 8 },

  // Card
  card: {
    borderRadius: 4,
    borderLeftWidth: 2,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor:    '#0d1525',
    borderRightColor:  '#0d1525',
    borderBottomColor: '#0d1525',
    padding: 14,
  },
  cardHead:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tagBox:      { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  tagTxt:      { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  priorityBadge: { backgroundColor: 'rgba(255,50,50,0.15)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  priorityTxt:   { color: '#ff4444', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  cardTime:    { marginLeft: 'auto', color: '#1a2a3a', fontSize: 10, letterSpacing: 0.5 },

  cardTitle:   { color: '#c8d8e8', fontSize: 13, fontWeight: '700', lineHeight: 20, marginBottom: 8, letterSpacing: 0.2 },
  cardSummary: { color: '#304050', fontSize: 11, lineHeight: 17, marginBottom: 10 },

  expandHint:  { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 6, marginBottom: 4 },
  cardFoot:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  barsRow:     { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  accessBtn:   { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  empty: { color: '#1a3a4a', textAlign: 'center', marginTop: 80, fontSize: 13, letterSpacing: 1.5 },

  // Modal urgente
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { backgroundColor: '#04080f', borderWidth: 1, borderColor: '#ff4444', borderRadius: 8, padding: 24, width: '100%', maxWidth: 380 },
  modalIcon:    { color: '#ff4444', fontSize: 32, textAlign: 'center', marginBottom: 8 },
  modalTitle:   { color: '#ff4444', fontSize: 13, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 4 },
  modalCount:   { color: '#3a1a1a', fontSize: 11, textAlign: 'center', marginBottom: 16, letterSpacing: 1 },
  modalItem:    { color: '#c8d8e8', fontSize: 12, lineHeight: 18, marginBottom: 6, paddingLeft: 4 },
  modalBtn:     { marginTop: 20, backgroundColor: '#ff4444', borderRadius: 4, paddingVertical: 12, alignItems: 'center' },
  modalBtnTxt:  { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
})
