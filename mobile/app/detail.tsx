import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, StatusBar,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'

const SIG: Record<string, { code: string; color: string; dim: string; dimHi: string }> = {
  'Modèle':    { code: 'MODL', color: '#00e5ff', dim: 'rgba(0,229,255,0.06)',   dimHi: 'rgba(0,229,255,0.12)' },
  'Framework': { code: 'FRMK', color: '#ff6d3a', dim: 'rgba(255,109,58,0.06)',  dimHi: 'rgba(255,109,58,0.12)' },
  'Recherche': { code: 'RSCH', color: '#b06fff', dim: 'rgba(176,111,255,0.06)', dimHi: 'rgba(176,111,255,0.12)' },
}

export default function Detail() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    title: string
    category: string
    summary: string
    code_example: string
    source_url: string
    importance_score: string
    created_at: string
  }>()

  const sig = SIG[params.category] ?? { code: 'DATA', color: '#667788', dim: 'rgba(100,120,140,0.06)', dimHi: 'rgba(100,120,140,0.12)' }
  const score = parseInt(params.importance_score ?? '5')

  function timeAgo(iso: string) {
    const d = Date.now() - new Date(iso).getTime()
    const h = Math.floor(d / 3600000)
    const m = Math.floor(d / 60000)
    if (h >= 24) return `il y a ${Math.floor(h / 24)} jour${Math.floor(h / 24) > 1 ? 's' : ''}`
    if (h >= 1)  return `il y a ${h}h`
    return `il y a ${m} min`
  }

  const paragraphs = params.summary
    ?.split(/(?<=\.) (?=[A-ZÀ-Ü«"])/)
    .filter(Boolean) ?? []

  return (
    <LinearGradient colors={['#000814', '#00020a', '#010210']} style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000814" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹ Retour</Text>
        </TouchableOpacity>
        <View style={[styles.tagBox, { borderColor: sig.color + '55', backgroundColor: sig.color + '12' }]}>
          <Text style={[styles.tagTxt, { color: sig.color }]}>{sig.code}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Score + temps */}
        <View style={styles.scoreRow}>
          <View style={[styles.scorePill, { borderColor: sig.color + '40', backgroundColor: sig.color + '10' }]}>
            <Text style={[styles.scoreLabel, { color: sig.color }]}>SIGNAL {score}/10</Text>
          </View>
          <View style={styles.scoreBars}>
            {['▁', '▃', '▅', '▆', '█'].map((c, i) => (
              <Text key={i} style={{ color: i < Math.round(score / 2) ? sig.color : '#0d1525', fontSize: 13 }}>{c}</Text>
            ))}
          </View>
          <Text style={styles.scoreTime}>{params.created_at ? timeAgo(params.created_at) : ''}</Text>
        </View>

        {/* Titre */}
        <Text style={styles.title}>{params.title}</Text>

        {/* Divider coloré */}
        <LinearGradient
          colors={[sig.color + '60', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.divider}
        />

        {/* Label section */}
        <Text style={[styles.sectionLabel, { color: sig.color }]}>› SYNTHÈSE COMPLÈTE</Text>

        {/* Résumé */}
        <LinearGradient
          colors={[sig.dimHi, sig.dim, 'rgba(0,2,10,0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.summaryBox, { borderLeftColor: sig.color }]}
        >
          <View style={styles.summaryGloss} />
          {paragraphs.length > 0
            ? paragraphs.map((p, i) => (
                <Text key={i} style={styles.summaryPara}>{p.trim()}</Text>
              ))
            : <Text style={styles.summaryPara}>{params.summary}</Text>
          }
        </LinearGradient>

        {/* Code exemple */}
        {params.code_example && params.code_example !== 'N/A' && (
          <>
            <Text style={[styles.sectionLabel, { color: sig.color, marginTop: 28 }]}>› EXEMPLE DE CODE</Text>
            <View style={styles.codeBox}>
              <View style={styles.codeHeader}>
                <View style={[styles.codeDot, { backgroundColor: '#ff5f57' }]} />
                <View style={[styles.codeDot, { backgroundColor: '#febc2e' }]} />
                <View style={[styles.codeDot, { backgroundColor: '#28c840' }]} />
              </View>
              <Text style={styles.codeTxt}>{params.code_example.replace(/```\w*\n?/g, '').trim()}</Text>
            </View>
          </>
        )}

        {/* Bouton source */}
        <TouchableOpacity
          onPress={() => Linking.openURL(params.source_url)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[sig.color + '20', sig.color + '08']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.sourceBtn, { borderColor: sig.color + '35' }]}
          >
            <Text style={[styles.sourceBtnTxt, { color: sig.color }]}>Accéder à la source originale  ›</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { paddingVertical: 6, paddingRight: 16 },
  backTxt: { color: '#6ab0cc', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  tagBox:  { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagTxt:  { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },

  content: { padding: 20 },

  scoreRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  scorePill:  { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  scoreLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  scoreBars:  { flexDirection: 'row', gap: 2 },
  scoreTime:  { color: '#2a4050', fontSize: 11, marginLeft: 'auto' },

  title: { color: '#ddeeff', fontSize: 20, fontWeight: '800', lineHeight: 28, marginBottom: 18, letterSpacing: 0.1 },

  divider: { height: 2, borderRadius: 1, marginBottom: 22 },

  sectionLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 12 },

  summaryBox:   { borderLeftWidth: 2, borderRadius: 16, padding: 18, gap: 12, overflow: 'hidden' },
  summaryGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  summaryPara:  { color: '#8fb8cc', fontSize: 15, lineHeight: 24 },

  codeBox:    { backgroundColor: '#020c18', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#0a1a2a', marginBottom: 28 },
  codeHeader: { flexDirection: 'row', gap: 6, padding: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#0a1a2a' },
  codeDot:    { width: 10, height: 10, borderRadius: 5 },
  codeTxt:    { color: '#4a9a6a', fontSize: 12, lineHeight: 20, fontFamily: 'monospace', padding: 14, paddingTop: 10 },

  sourceBtn:    { marginTop: 4, borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sourceBtnTxt: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
})
