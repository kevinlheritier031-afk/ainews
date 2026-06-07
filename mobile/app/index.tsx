import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { supabase } from '../lib/supabase'
import type { NewsItem } from '../types/news'
import { NewsCard } from '../components/NewsCard'
import { EmptyState } from '../components/EmptyState'

type FetchState = 'loading' | 'idle' | 'refreshing' | 'error'

const HEADER_H = 56

function todayLabel(): string {
  return new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function Index() {
  const [news, setNews]   = useState<NewsItem[]>([])
  const [state, setState] = useState<FetchState>('loading')
  const scrollY           = useRef(new Animated.Value(0)).current

  const blurOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const fetchNews = useCallback(async (refresh = false) => {
    setState(refresh ? 'refreshing' : 'loading')
    try {
      const { data, error } = await supabase
        .from('ai_news')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setNews((data as NewsItem[]) ?? [])
      setState('idle')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { fetchNews() }, [fetchNews])

  const renderItem = useCallback(
    ({ item, index }: { item: NewsItem; index: number }) => (
      <NewsCard item={item} index={index} />
    ),
    []
  )

  const isLoading = state === 'loading'
  const isError   = state === 'error'
  const isEmpty   = state === 'idle' && news.length === 0

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { opacity: blurOpacity }]}
          pointerEvents="none"
        >
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, styles.blurOverlay]} />
        </Animated.View>
        <Text style={styles.headerTitle}>ai/news</Text>
        <Text style={styles.headerDate}>{todayLabel()}</Text>
      </View>

      {isLoading ? (
        <EmptyState state="loading" />
      ) : isError ? (
        <EmptyState state="error" onRetry={() => fetchNews()} />
      ) : isEmpty ? (
        <EmptyState state="empty" />
      ) : (
        <Animated.FlatList
          data={news}
          renderItem={renderItem}
          keyExtractor={(item: NewsItem) => item.id}
          contentContainerStyle={styles.list}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={state === 'refreshing'}
              onRefresh={() => fetchNews(true)}
              tintColor="#6366f1"
              colors={['#6366f1']}
              progressBackgroundColor="#111111"
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    zIndex: 10,
  },
  blurOverlay: {
    backgroundColor: 'rgba(10,10,10,0.75)',
  },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  headerDate: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#737373',
    letterSpacing: 0.3,
  },
  list: {
    padding: 12,
    paddingTop: 8,
  },
})
