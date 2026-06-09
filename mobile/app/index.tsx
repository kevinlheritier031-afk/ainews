import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ScrollView, RefreshControl, Animated, Dimensions, Modal, Linking,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const CARD_W = Math.round(SCREEN_W * 0.75)

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
  'Modèle':    { code: 'MODL', color: '#00e5ff', dim: 'rgba(0,229,255,0.12)',   dimHi: 'rgba(0,229,255,0.28)' },
  'Framework': { code: 'FRMK', color: '#ff6d3a', dim: 'rgba(255,109,58,0.12)',  dimHi: 'rgba(255,109,58,0.28)' },
  'Recherche': { code: 'RSCH', color: '#b06fff', dim: 'rgba(176,111,255,0.12)', dimHi: 'rgba(176,111,255,0.28)' },
}
const DEFAULT_SIG = { code: 'DATA', color: '#667788', dim: 'rgba(100,120,140,0.12)', dimHi: 'rgba(100,120,140,0.22)' }

const CATEGORIES = ['Modèle', 'Framework', 'Recherche'] as const

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

function pushDetail(router: ReturnType<typeof useRouter>, item: NewsItem) {
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

// ── UI atoms ──────────────────────────────────────────────────────────────────

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

function Ticker({ items }: { items: NewsItem[] }) {
  const tx = useRef(new Animated.Value(SCREEN_W)).current
  const [contentW, setContentW] = useState(0)
  const anim = useRef<Animated.CompositeAnimation | null>(null)

  const top = items.filter(i => (i.importance_score ?? 0) >= 7).slice(0, 10)
  const text = top.length > 0
    ? top.map(i => `[${i.importance_score}/10] ${i.title}`).join('     ·     ')
    : 'Aucun signal fort détecté — prochain scan dans quelques minutes…'

  useEffect(() => {
    if (contentW === 0) return
    anim.current?.stop()
    tx.setValue(SCREEN_W)
    anim.current = Animated.loop(
      Animated.timing(tx, {
        toValue: -contentW,
        duration: (contentW + SCREEN_W) * 28,
        useNativeDriver: true,
      })
    )
    anim.current.start()
    return () => anim.current?.stop()
  }, [contentW, text])

  return (
    <View style={styles.tickerBar}>
      <View style={styles.tickerLabel}>
        <View style={styles.tickerDot} />
        <Text style={styles.tickerLabelTxt}>LIVE</Text>
      </View>
      <View style={styles.tickerTrack}>
        <Animated.Text
          style={[styles.tickerText, { transform: [{ translateX: tx }] }]}
          onLayout={e => setContentW(e.nativeEvent.layout.width)}
          numberOfLines={1}
        >
          {text}
        </Animated.Text>
      </View>
    </View>
  )
}

function SignalBars({ score, color }: { score: number; color: string }) {
  const filled = Math.round(score / 2)
  const chars = ['▁', '▃', '▅', '▆', '█']
  return (
    <View style={styles.barsRow}>
      {chars.map((c, i) => (
        <Text key={i} style={{ color: i < filled ? color : '#1e2d42', fontSize: 11, lineHeight: 15 }}>
          {c}
        </Text>
      ))}
    </View>
  )
}

function CategoryFilter({
  active,
  onSelect,
  counts,
}: {
  active: string | null
  onSelect: (cat: string | null) => void
  counts: Record<string, number>
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      <TouchableOpacity
        onPress={() => onSelect(null)}
        style={[styles.filterChip, active === null && styles.filterChipAll]}
      >
        <Text style={[styles.filterChipTxt, active === null && styles.filterChipTxtAll]}>TOUT</Text>
      </TouchableOpacity>
      {CATEGORIES.map(cat => {
        const sig = getSignal(cat)
        const isActive = active === cat
        const count = counts[cat] ?? 0
        return (
          <TouchableOpacity
            key={cat}
            onPress={() => onSelect(isActive ? null : cat)}
            style={[
              styles.filterChip,
              isActive && { borderColor: sig.color + '88', backgroundColor: sig.color + '18' },
            ]}
          >
            <Text style={[styles.filterChipTxt, isActive && { color: sig.color }]}>
              {sig.code}
            </Text>
            {count > 0 && (
              <Text style={[styles.filterChipCount, isActive && { color: sig.color + 'aa' }]}>
                {count}
              </Text>
            )}
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function BookmarkBtn({ isBookmarked, color, onPress }: { isBookmarked: boolean; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Text style={[styles.bookmarkIcon, isBookmarked && { color }]}>
        {isBookmarked ? '★' : '☆'}
      </Text>
    </TouchableOpacity>
  )
}

function HeroCard({
  item,
  isBookmarked,
  onBookmark,
}: {
  item: NewsItem
  isBookmarked: boolean
  onBookmark: () => void
}) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(24)).current
  const router = useRouter()
  const sig = getSignal(item.category)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }], marginHorizontal: 12, marginBottom: 8 }}>
      <TouchableOpacity onPress={() => pushDetail(router, item)} activeOpacity={0.82}>
        <LinearGradient
          colors={[sig.dimHi, sig.dim, 'rgba(18,30,55,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, { borderLeftColor: sig.color }]}
        >
          <View style={styles.cardGloss} />

          <View style={styles.heroTop}>
            <View style={[styles.heroBadge, { borderColor: sig.color + '66', backgroundColor: sig.color + '18' }]}>
              <Text style={[styles.heroBadgeTxt, { color: sig.color }]}>◈ SIGNAL #1</Text>
            </View>
            {item.urgent && (
              <View style={styles.priorityBadge}>
                <Text style={styles.priorityTxt}>PRIORITY</Text>
              </View>
            )}
            <Text style={styles.heroTime}>{timeAgo(item.created_at)}</Text>
            <BookmarkBtn isBookmarked={isBookmarked} color={sig.color} onPress={onBookmark} />
          </View>

          <Text style={styles.heroTitle}>{item.title}</Text>
          <Text style={styles.heroSummary} numberOfLines={3}>{item.summary}</Text>

          <View style={styles.heroFoot}>
            {item.importance_score != null
              ? <SignalBars score={item.importance_score} color={sig.color} />
              : <View />}
            <View style={[styles.heroReadBtn, { borderColor: sig.color + '55', backgroundColor: sig.color + '14' }]}>
              <Text style={[styles.heroReadTxt, { color: sig.color }]}>LIRE LA SYNTHÈSE ›</Text>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  )
}

function CompactCard({
  item,
  index,
  isBookmarked,
  onBookmark,
}: {
  item: NewsItem
  index: number
  isBookmarked: boolean
  onBookmark: () => void
}) {
  const opacity = useRef(new Animated.Value(0)).current
  const tx = useRef(new Animated.Value(20)).current
  const router = useRouter()
  const sig = getSignal(item.category)
  const hot = (item.importance_score ?? 0) >= 8

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true }),
      Animated.timing(tx, { toValue: 0, duration: 400, delay: index * 80, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateX: tx }] }}>
      <TouchableOpacity onPress={() => pushDetail(router, item)} activeOpacity={0.82}>
        <LinearGradient
          colors={[sig.dimHi, sig.dim, 'rgba(18,30,55,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.compactCard, { borderLeftColor: sig.color, width: CARD_W }]}
        >
          <View style={styles.cardGloss} />

          <View style={styles.compactHead}>
            <View style={[styles.tagBox, { borderColor: sig.color + '55', backgroundColor: sig.color + '12' }]}>
              <Text style={[styles.tagTxt, { color: sig.color }]}>{sig.code}</Text>
            </View>
            {hot && <Text style={styles.hotDot}>◈</Text>}
            <Text style={styles.compactTime}>{timeAgo(item.created_at)}</Text>
            <BookmarkBtn isBookmarked={isBookmarked} color={sig.color} onPress={onBookmark} />
          </View>

          <Text style={styles.compactTitle} numberOfLines={3}>{item.title}</Text>
          <Text style={styles.compactSummary} numberOfLines={2}>{item.summary}</Text>

          <View style={styles.compactFoot}>
            {item.importance_score != null
              ? <SignalBars score={item.importance_score} color={sig.color} />
              : <View />}
            <Text style={[styles.accessBtn, { color: sig.color }]}>LIRE ›</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  )
}

function VerticalCard({
  item,
  index,
  isBookmarked,
  onBookmark,
}: {
  item: NewsItem
  index: number
  isBookmarked: boolean
  onBookmark: () => void
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

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }], marginHorizontal: 12, marginBottom: 10 }}>
      <TouchableOpacity onPress={() => pushDetail(router, item)} activeOpacity={0.82}>
        <LinearGradient
          colors={[sig.dimHi, sig.dim, 'rgba(18,30,55,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.vertCard, { borderLeftColor: sig.color }]}
        >
          <View style={styles.cardGloss} />
          <View style={styles.compactHead}>
            <View style={[styles.tagBox, { borderColor: sig.color + '55', backgroundColor: sig.color + '12' }]}>
              <Text style={[styles.tagTxt, { color: sig.color }]}>{sig.code}</Text>
            </View>
            {(item.importance_score ?? 0) >= 8 && <Text style={styles.hotDot}>◈</Text>}
            <Text style={styles.compactTime}>{timeAgo(item.created_at)}</Text>
            <BookmarkBtn isBookmarked={isBookmarked} color={sig.color} onPress={onBookmark} />
          </View>
          <Text style={styles.vertTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.vertSummary} numberOfLines={3}>{item.summary}</Text>
          <View style={styles.compactFoot}>
            {item.importance_score != null
              ? <SignalBars score={item.importance_score} color={sig.color} />
              : <View />}
            <Text style={[styles.accessBtn, { color: sig.color }]}>LIRE ›</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  )
}

function Section({
  category,
  items,
  bookmarks,
  onBookmark,
}: {
  category: string
  items: NewsItem[]
  bookmarks: Set<string>
  onBookmark: (item: NewsItem) => void
}) {
  if (items.length === 0) return null
  const sig = getSignal(category)

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: sig.color }]} />
        <Text style={[styles.sectionTitle, { color: sig.color }]}>{category.toUpperCase()}</Text>
        <View style={[styles.sectionLine, { backgroundColor: sig.color + '25' }]} />
        <Text style={[styles.sectionCount, { color: sig.color + '88' }]}>{items.length}</Text>
      </View>
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <CompactCard
            item={item}
            index={index}
            isBookmarked={bookmarks.has(item.id)}
            onBookmark={() => onBookmark(item)}
          />
        )}
        contentContainerStyle={styles.hList}
        snapToInterval={CARD_W + 12}
        decelerationRate="fast"
      />
    </View>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? '2026.06.08'
const RELEASES_API = 'https://api.github.com/repos/kevinlheritier031-afk/ainews/releases/latest'

export default function Index() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [urgentItems, setUrgentItems] = useState<NewsItem[]>([])
  const [showAlert, setShowAlert] = useState(false)
  const [updateUrl, setUpdateUrl] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())

  async function loadBookmarks() {
    const stored = await AsyncStorage.getItem('bookmarks')
    if (stored) {
      const items: NewsItem[] = JSON.parse(stored)
      setBookmarks(new Set(items.map(i => i.id)))
    }
  }

  const toggleBookmark = useCallback(async (item: NewsItem) => {
    const stored = await AsyncStorage.getItem('bookmarks')
    const items: NewsItem[] = stored ? JSON.parse(stored) : []
    const exists = items.some(i => i.id === item.id)
    const updated = exists ? items.filter(i => i.id !== item.id) : [item, ...items]
    await AsyncStorage.setItem('bookmarks', JSON.stringify(updated))
    setBookmarks(new Set(updated.map(i => i.id)))
  }, [])

  async function fetchNews() {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('ai_news')
      .select('id, title, category, summary, source_url, created_at, importance_score, urgent')
      .eq('archived', false)
      .gte('created_at', cutoff)
      .order('importance_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(60)
    if (data) setNews(data)
    return data
  }

  async function checkUrgent(data: NewsItem[]) {
    const lastOpen = await AsyncStorage.getItem('last_opened')
    const since = lastOpen ? new Date(lastOpen) : new Date(Date.now() - 3600000)
    const newUrgent = data.filter(item => item.urgent && new Date(item.created_at) > since)
    if (newUrgent.length > 0) {
      setUrgentItems(newUrgent)
      setShowAlert(true)
    }
    await AsyncStorage.setItem('last_opened', new Date().toISOString())
  }

  async function checkUpdate() {
    try {
      const res = await fetch(RELEASES_API)
      if (!res.ok) return
      const json = await res.json()
      const latest = (json.tag_name as string)?.replace(/^v/, '') ?? ''
      if (latest && latest > APP_VERSION) {
        const apk = (json.assets as any[])?.find((a: any) => a.name.endsWith('.apk'))
        if (apk) setUpdateUrl(apk.browser_download_url)
      }
    } catch {}
  }

  useEffect(() => {
    fetchNews().then(data => {
      if (data) checkUrgent(data)
    }).finally(() => setLoading(false))
    checkUpdate()
    loadBookmarks()
  }, [])

  async function onRefresh() {
    setRefreshing(true)
    await fetchNews()
    setRefreshing(false)
  }

  const filtered = activeCategory ? news.filter(n => n.category === activeCategory) : []
  const hero = !activeCategory ? (news[0] ?? null) : null
  const rest = !activeCategory ? news.slice(1) : []
  const sections = ['Modèle', 'Framework', 'Recherche'].map(cat => ({
    category: cat,
    items: rest.filter(n => n.category === cat),
  }))
  const categoryCounts = news.reduce<Record<string, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] ?? 0) + 1
    return acc
  }, {})

  return (
    <View style={styles.root}>
      <Scanline />

      <Modal visible={showAlert} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['#0e1928', '#081018']} style={styles.modalBox}>
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

      <LinearGradient
        colors={['#09142a', '#06101f', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkTxt}>◈</Text>
          </View>
          <View style={{ flexDirection: 'column', gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <Text style={styles.logoAI}>AI</Text>
              <Text style={styles.logoSlash}>/</Text>
              <Text style={styles.logoNEWS}>NEWS</Text>
            </View>
            <Text style={styles.logoVersion}>v{APP_VERSION}</Text>
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={() => router.push('/bookmarks')} style={styles.headerBtn}>
              <Text style={styles.headerBtnTxt}>★ FAV</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/archive')} style={styles.headerBtn}>
              <Text style={styles.headerBtnTxt}>ARCHIVE ›</Text>
            </TouchableOpacity>
          </View>
        </View>
        {updateUrl && (
          <TouchableOpacity style={styles.updateBanner} onPress={() => Linking.openURL(updateUrl)}>
            <Text style={styles.updateBannerTxt}>⬆ MISE À JOUR DISPONIBLE — APPUYER POUR INSTALLER</Text>
          </TouchableOpacity>
        )}
        <Ticker items={news} />
        <CategoryFilter active={activeCategory} onSelect={setActiveCategory} counts={categoryCounts} />
        <View style={styles.circuitBar}>
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#ff6d3a' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#b06fff' }]} />
          <View style={styles.circuitLine} />
          <View style={[styles.circuitDot, { backgroundColor: '#00e5ff' }]} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingTxt}>› Connexion aux flux…</Text>
        </View>
      ) : activeCategory ? (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <VerticalCard
              item={item}
              index={index}
              isBookmarked={bookmarks.has(item.id)}
              onBookmark={() => toggleBookmark(item)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00e5ff" />}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.empty}>Aucun signal dans cette catégorie</Text>}
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00e5ff" />}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          {hero && (
            <HeroCard
              item={hero}
              isBookmarked={bookmarks.has(hero.id)}
              onBookmark={() => toggleBookmark(hero)}
            />
          )}
          {sections.map(s => (
            <Section
              key={s.category}
              category={s.category}
              items={s.items}
              bookmarks={bookmarks}
              onBookmark={toggleBookmark}
            />
          ))}
          {news.length === 0 && (
            <Text style={styles.empty}>Aucun signal détecté</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c1830' },

  updateBanner: {
    backgroundColor: '#00e5ff22',
    borderWidth: 1,
    borderColor: '#00e5ff88',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  updateBannerTxt: {
    color: '#00e5ff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },

  scanline: {
    position: 'absolute', left: 0, right: 0,
    height: 2,
    backgroundColor: 'rgba(0,229,255,0.04)',
    shadowColor: '#00e5ff', shadowRadius: 6, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 0 },
  },

  header: { paddingHorizontal: 18, paddingBottom: 8 },

  logoRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  logoMark:   { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(0,229,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  logoMarkTxt:{ color: '#00e5ff', fontSize: 14, fontWeight: '900' },
  logoAI:     { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  logoSlash:  { color: '#00e5ff', fontSize: 22, fontWeight: '300', opacity: 0.6 },
  logoNEWS:   { color: '#00e5ff', fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  logoVersion:{ color: '#2a4a60', fontSize: 8, letterSpacing: 1, fontWeight: '600' },

  headerBtns: { marginLeft: 'auto', flexDirection: 'row', gap: 6 },
  headerBtn:  { borderWidth: 1, borderColor: 'rgba(0,229,255,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  headerBtnTxt: { color: '#00e5ff', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },

  tickerBar:    { flexDirection: 'row', alignItems: 'center', marginBottom: 8, height: 28, backgroundColor: 'rgba(0,229,255,0.04)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,229,255,0.08)', overflow: 'hidden' },
  tickerLabel:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: 'rgba(0,229,255,0.12)', height: '100%' },
  tickerDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: '#00e5ff' },
  tickerLabelTxt:{ color: '#00e5ff', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  tickerTrack:  { flex: 1, overflow: 'hidden', height: '100%', justifyContent: 'center' },
  tickerText:   { color: '#4a7080', fontSize: 11, letterSpacing: 0.3, paddingLeft: 10, whiteSpace: 'nowrap' } as any,

  filterRow:        { paddingHorizontal: 0, paddingVertical: 8, gap: 8 },
  filterChip:       { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.03)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterChipAll:    { borderColor: '#00e5ff88', backgroundColor: 'rgba(0,229,255,0.12)' },
  filterChipTxt:    { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: '#3a5070' },
  filterChipTxtAll: { color: '#00e5ff' },
  filterChipCount:  { fontSize: 8, fontWeight: '700', color: '#2a4050', letterSpacing: 0.5 },

  circuitBar:  { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  circuitDot:  { width: 5, height: 5, borderRadius: 3 },
  circuitLine: { flex: 1, height: 1, backgroundColor: '#1e3050' },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { color: '#2a5060', fontSize: 14, letterSpacing: 1 },

  scroll: { paddingTop: 16 },

  cardGloss: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  bookmarkIcon: { color: '#2a4050', fontSize: 15, fontWeight: '900' },

  // Hero
  heroCard: {
    borderRadius: 20,
    borderLeftWidth: 3,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor:    'rgba(255,255,255,0.09)',
    borderRightColor:  'rgba(255,255,255,0.04)',
    borderBottomColor: 'rgba(0,0,0,0.4)',
    padding: 20,
    overflow: 'hidden',
    minHeight: 220,
  },

  heroTop:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  heroBadge:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  heroBadgeTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heroTime:     { marginLeft: 'auto', color: '#3a5070', fontSize: 10 },

  heroTitle:   { color: '#e8f4ff', fontSize: 18, fontWeight: '800', lineHeight: 26, marginBottom: 12, letterSpacing: 0.1 },
  heroSummary: { color: '#8ab0c8', fontSize: 13, lineHeight: 20, marginBottom: 16 },

  heroFoot:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroReadBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  heroReadTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  priorityBadge: { backgroundColor: 'rgba(255,50,50,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' },
  priorityTxt:   { color: '#ff5555', fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  // Sections
  section:       { marginTop: 26 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  sectionDot:    { width: 6, height: 6, borderRadius: 3 },
  sectionTitle:  { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  sectionLine:   { flex: 1, height: 1 },
  sectionCount:  { fontSize: 10, fontWeight: '700' },

  hList: { paddingHorizontal: 12, gap: 12 },

  // Compact card
  compactCard: {
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
    minHeight: 190,
  },

  compactHead:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tagBox:        { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagTxt:        { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  hotDot:        { color: '#ff5555', fontSize: 10 },
  compactTime:   { marginLeft: 'auto', color: '#3a5060', fontSize: 10, letterSpacing: 0.3 },

  compactTitle:   { color: '#d0e4f0', fontSize: 14, fontWeight: '700', lineHeight: 21, marginBottom: 8, letterSpacing: 0.1 },
  compactSummary: { color: '#7a98a8', fontSize: 12, lineHeight: 18, marginBottom: 12 },

  compactFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barsRow:     { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  accessBtn:   { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  // Vertical card (filtered view)
  vertCard: {
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
  vertTitle:   { color: '#d0e4f0', fontSize: 15, fontWeight: '700', lineHeight: 22, marginBottom: 8, letterSpacing: 0.1 },
  vertSummary: { color: '#7a98a8', fontSize: 12, lineHeight: 18, marginBottom: 12 },

  empty: { color: '#2a4050', textAlign: 'center', marginTop: 80, fontSize: 14, letterSpacing: 0.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { borderWidth: 1, borderColor: 'rgba(255,68,68,0.4)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, overflow: 'hidden' },
  modalGloss:   { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  modalIcon:    { color: '#ff5555', fontSize: 34, textAlign: 'center', marginBottom: 10 },
  modalTitle:   { color: '#ff5555', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 4 },
  modalCount:   { color: '#7a4a4a', fontSize: 12, textAlign: 'center', marginBottom: 18, letterSpacing: 0.5 },
  modalItem:    { color: '#bdd0e0', fontSize: 13, lineHeight: 20, marginBottom: 8, paddingLeft: 4 },
  modalBtn:     { marginTop: 22, backgroundColor: '#cc3333', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnTxt:  { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
})
