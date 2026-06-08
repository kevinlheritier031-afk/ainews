import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createClient } from '@supabase/supabase-js'

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
}

const CATEGORY_COLORS: Record<string, string> = {
  'Modèle':    '#7c3aed',
  'Framework': '#0ea5e9',
  'Recherche': '#059669',
}

export default function Index() {
  const insets = useSafeAreaInsets()
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchNews() {
    const { data } = await supabase
      .from('ai_news')
      .select('id, title, category, summary, source_url, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNews(data)
  }

  useEffect(() => {
    fetchNews().finally(() => setLoading(false))
  }, [])

  async function onRefresh() {
    setRefreshing(true)
    await fetchNews()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>AI News</Text>
        <Text style={styles.headerSub}>{news.length} articles</Text>
      </View>
      <FlatList
        data={news}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => Linking.openURL(item.source_url)}
            activeOpacity={0.7}
          >
            <View style={[styles.badge, { backgroundColor: CATEGORY_COLORS[item.category] ?? '#444' }]}>
              <Text style={styles.badgeText}>{item.category}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.summary}>{item.summary}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
        ListEmptyComponent={<Text style={styles.empty}>Aucune news pour l'instant.</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0a0a0a' },
  centered:    { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  header:      { paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1c1c1c' },
  headerTitle: { color: '#ffffff', fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  headerSub:   { color: '#555', fontSize: 12, marginTop: 2 },
  list:        { padding: 12, gap: 10 },
  card:        { backgroundColor: '#111', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1e1e1e' },
  badge:       { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10 },
  badgeText:   { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  title:       { color: '#f0f0f0', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 6 },
  summary:     { color: '#888', fontSize: 13, lineHeight: 20 },
  empty:       { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 15 },
})
