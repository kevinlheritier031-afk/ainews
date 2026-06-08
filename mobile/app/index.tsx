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
  'Modèle':    { code: 'MODL', color: '#00e5ff', dim: 'rgba(0,229,255,0.06)',   dimHi: 'rgba(0,229,255,0.13)' },
  'Framework': { code: 'FRMK', color: '#ff6d3a', dim: 'rgba(255,109,58,0.06)',  dimHi: 'rgba(255,109,58,0.13)' },
  'Recherche': { code: 'RSCH', color: '#b06fff', dim: 'rgba(176,111,255,0.06)', dimHi: 'rgba(176,111,255,0.13)' },
}
const DEFAULT_SIG = { code: 'DATA', color: '#667788', dim: 'rgba(100,120,140,0.06)', dimHi: 'rgba(100,120,140,0.12)' }

function getSignal(category: string) {
  return SIG[category as keyof typeof SIG] ?? DEFAULT_SIG
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  const m = Math.floor(d / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}j`
  if (h >= 1)  return `${h}h`
  return `${m}m`
}

function Scanline() {
  const y = useRef(new Animated.Value(-2)).current
  useEffect(() => {
    Animated.loop(
      Animated.timing(y, { toValue: SCREEN_H, duration: 6000, useNativeDriver: true })
    ).start()
  }, [])
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      <Animated.View style={[styles.scanline, { transform: [{ translateY: y }] }]} />
    </Animated.View>
  )
}

const MESSAGES = [
  'SCANNING LIVE FEEDS…',
  'FILTERING NOISE…',
  'GEMINI RANKING SIGNALS…',
  'FLUX SYNCHRONISÉ ✓',
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
        setTimeout(() => setMsgIdx(x => (x + 1) % MESSAGES.length), 2800)
      }
    }, 32)
    return () => clearInterval(iv)
  }, [msgIdx])

  return (
    <View style={styles.twRow}>
      <Text style={styles.twPrompt}>› </Text>
      <Text style={styles.twText}>{txt}</Text>
      <Animated.Text style={[styles.twCursor, { opacity: cursor }]}>▌</Animated.Text>
      <Text style={styles.twCount}> [{String(count).padStart(3, '0')} signaux]</Text>
    </View>
  )
}

function SignalBars({ score, color }: { score: number; color: string }) {
  const filled = Math.round(score / 2)
  const chars = ['▁', '▃', '▅', '▆', '█']
  return (
    <View style={styles.barsRow}>
      {chars.map((c, i) => (
        <Text key={i} style={{ color: i < filled ? color : '#1a2030', fontSize: 11, lineHeight: 15 }}>
          {c}
        </Text>
      ))}
    </View>
  )
}

function Card({ item, index }: { item: NewsItem; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty      = useRef(new Animated.Value(18)).current
  const router  = useRouter()
  const sig = getSignal(item.category)
  const hot = (item.importance_score ?? 0) >= 8

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 60, useNativeDriver: true }),
      Animated.timing(ty,      { toValue: 0, duration: 400, delay: index * 60, useNativeDriver: true }),
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
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>
      <TouchableOpacity onPress={openDetail} activeOpacity={0.84}>
        <LinearGradient
          colors={[sig.dimHi, sig.dim, 'rgba(0,2,10,0.08)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, { borderLeftColor: sig.color }]}
        >
          {/* Reflet verre en haut */}
          <View style={styles.cardGloss} />

          {/* Ligne supérieure */}
          <View style={styles.cardHead}>
            <View style={[styles.tagBox, { borderColor: sig.color + '55', backgroundColor: sig.color + '12' }]}>
              <Text style={[styles.tagTxt, { color: sig.color }]}>{sig.code}</Text>
            </View>
            {hot && (
              <View style={styles.priorityBadge}>
                <Text style={styles.priorityTxt}>◈ PRIORITY</Text>
              </View>
            )}
            <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
          </View>

          {/* Titre */}
          <Text style={styles.cardTitle}>{item.title}</Text>

          {/* Aperçu résumé */}
          <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>

          {/* Pied */}
          <View style={styles.cardFoot}>
            {item.importance_score != null
              ? <SignalBars score={item.importance_score} color={sig.color} />
              : <View />}
            <Text style={[styles.accessBtn, { color: sig.color }]}>LIRE LA SYNTHÈSE ›</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  )
}

export default function Index() {
  const insets = useSafeAreaInsets()
  const [news, setNews]               = useState<NewsItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [urgentItems, setUrgentItems] = useState<NewsItem[]>([])
  const [showAlert, setShowAlert]     = useState(false)

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
          <LinearGradient
            colors={['#080f18', '#04080f']}
            style={styles.modalBox}
          >
            <View style={styles.modalGloss} />
            <Text style={styles.modalIcon}>◈</Text>
            <Text style={styles.modalTitle}>SIGNAL PRIORITAIRE</Text>
            <Text style={styles.modalCount}>
              {urgentItems.length} nouveau{urgentItems.length > 1 ? 'x' : ''} signal{urgentItems.length > 1 ? 's' : ''} critique{urgentItems.length > 1 ? 's' : ''}
            </Text>
            {urgentItems.slice(0, 3).map(item => (
              <Text key={item.id} style={styles.modalItem} numberOfLines={2}>› {item.title}</Text>
            ))}
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowAlert(false)}>
              <Text style={styles.modalBtnTxt}>ACCÉDER AU FLUX</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Header */}
      <LinearGradient
        colors={['#000510', '#00020a', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.logoRow}>
          <Text style={styles.logoIcon}>◈</Text>
          <Text style={styles.logoText}>AI NEWS</Text>
          <Text style={styles.logoSub}>  INTELLIGENCE ARTIFICIELLE</Text>
        </View>

        <TypeWriter count={news.length} />

        <View style={styles.circuitBar}>
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#ff6d3a' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#b06fff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
        </View>

        <View style={styles.legend}>
          {Object.entries(SIG).map(([name, s]) => (
            <View key={name} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={[styles.legendTxt, { color: s.color + 'aa' }]}>{name}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingTxt}>› Connexion aux flux…</Text>
        </View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00e5ff" />
          }
          renderItem={({ item, index }) => <Card item={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucun signal détecté</Text>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#00020a' },

  scanline: {
    position: 'absolute', left: 0, right: 0,
    height: 2,
    backgroundColor: 'rgba(0,229,255,0.04)',
    shadowColor: '#00e5ff', shadowRadius: 6, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 0 },
  },

  header: { paddingHorizontal: 18, paddingBottom: 14 },

  logoRow:  { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  logoIcon: { color: '#00e5ff', fontSize: 18, marginRight: 8 },
  logoText: { color: '#ffffff', fontSize: 24, fontWeight: '900', letterSpacing: 4 },
  logoSub:  { color: '#2a4050', fontSize: 9, letterSpacing: 1.5, fontWeight: '600' },

  twRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  twPrompt: { color: '#00e5ff', fontSize: 12, fontWeight: '700' },
  twText:   { color: '#4a7080', fontSize: 12, letterSpacing: 0.3 },
  twCursor: { color: '#00e5ff', fontSize: 12 },
  twCount:  { color: '#253545', fontSize: 11, letterSpacing: 0.5 },

  circuitBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  circuitDot: { width: 5, height: 5, borderRadius: 3 },
  circuitLine:{ flex: 1, height: 1, backgroundColor: '#0a1520' },

  legend:     { flexDirection: 'row', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 5, height: 5, borderRadius: 3 },
  legendTxt:  { fontSize: 10, letterSpacing: 0.8, fontWeight: '600' },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { color: '#2a5060', fontSize: 14, letterSpacing: 1 },

  list: { padding: 12, gap: 12 },

  card: {
    borderRadius: 16,
    borderLeftWidth: 2,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor:    'rgba(255,255,255,0.05)',
    borderRightColor:  'rgba(255,255,255,0.03)',
    borderBottomColor: 'rgba(0,0,0,0.3)',
    padding: 16,
    overflow: 'hidden',
  },

  cardGloss: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  cardHead:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tagBox:        { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagTxt:        { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  priorityBadge: { backgroundColor: 'rgba(255,50,50,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' },
  priorityTxt:   { color: '#ff5555', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  cardTime:      { marginLeft: 'auto', color: '#3a5060', fontSize: 10, letterSpacing: 0.3 },

  cardTitle:   { color: '#d0e4f0', fontSize: 14, fontWeight: '700', lineHeight: 21, marginBottom: 10, letterSpacing: 0.1 },
  cardSummary: { color: '#5a7888', fontSize: 13, lineHeight: 19, marginBottom: 12 },

  cardFoot:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barsRow:   { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  accessBtn: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  empty: { color: '#2a4050', textAlign: 'center', marginTop: 80, fontSize: 14, letterSpacing: 0.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { borderWidth: 1, borderColor: 'rgba(255,68,68,0.4)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, overflow: 'hidden' },
  modalGloss:   { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  modalIcon:    { color: '#ff5555', fontSize: 34, textAlign: 'center', marginBottom: 10 },
  modalTitle:   { color: '#ff5555', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 4 },
  modalCount:   { color: '#5a2a2a', fontSize: 12, textAlign: 'center', marginBottom: 18, letterSpacing: 0.5 },
  modalItem:    { color: '#bdd0e0', fontSize: 13, lineHeight: 20, marginBottom: 8, paddingLeft: 4 },
  modalBtn:     { marginTop: 22, backgroundColor: '#cc3333', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnTxt:  { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
})
