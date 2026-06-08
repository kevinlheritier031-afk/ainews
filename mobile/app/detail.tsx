import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, StatusBar,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'

const SIG: Record<string, { code: string; color: string; dim: string }> = {
  'Modèle':    { code: 'MODL', color: '#00e5ff', dim: 'rgba(0,229,255,0.06)' },
  'Framework': { code: 'FRMK', color: '#ff6d3a', dim: 'rgba(255,109,58,0.06)' },
  'Recherche': { code: 'RSCH', color: '#b06fff', dim: 'rgba(176,111,255,0.06)' },
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

  const sig = SIG[params.category] ?? { code: 'DATA', color: '#667788', dim: 'rgba(100,120,140,0.06)' }
  const score = parseInt(params.importance_score ?? '5')

  function timeAgo(iso: string) {
    const d = Date.now() - new Date(iso).getTime()
    const h = Math.floor(d / 3600000)
    const m = Math.floor(d / 60000)
    if (h >= 24) return `il y a ${Math.floor(h / 24)} jour${Math.floor(h / 24) > 1 ? 's' : ''}`
    if (h >= 1)  return `il y a ${h}h`
    return `il y a ${m} min`
  }

  // Sépare les exemples pratiques du reste du résumé (cherche "Avec ça" ou "tu peux")
  const paragraphs = params.summary
    ?.split(/(?<=\.) (?=[A-ZÀ-Ü«"])/)
    .filter(Boolean) ?? []

  return (
    <LinearGradient colors={['#00020a', '#010310']} style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#00020a" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹ RETOUR</Text>
        </TouchableOpacity>
        <View style={[styles.tagBox, { borderColor: sig.color + '60' }]}>
          <Text style={[styles.tagTxt, { color: sig.color }]}>{sig.code}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Signal score */}
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreLabel, { color: sig.color }]}>SIGNAL {score}/10</Text>
          <View style={styles.scoreBars}>
            {['▁','▃','▅','▆','█'].map((c, i) => (
              <Text key={i} style={{ color: i < Math.round(score / 2) ? sig.color : '#0d1525', fontSize: 12 }}>{c}</Text>
            ))}
          </View>
          <Text style={styles.scoreTime}>{params.created_at ? timeAgo(params.created_at) : ''}</Text>
        </View>

        {/* Titre */}
        <Text style={styles.title}>{params.title}</Text>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: sig.color + '30' }]} />

        {/* Label résumé */}
        <Text style={[styles.sectionLabel, { color: sig.color }]}>› SYNTHÈSE COMPLÈTE</Text>

        {/* Résumé paragraphe par paragraphe */}
        <View style={[styles.summaryBox, { backgroundColor: sig.dim, borderLeftColor: sig.color }]}>
          {paragraphs.length > 0
            ? paragraphs.map((p, i) => (
                <Text key={i} style={styles.summaryPara}>{p.trim()}</Text>
              ))
            : <Text style={styles.summaryPara}>{params.summary}</Text>
          }
        </View>

        {/* Code exemple si présent */}
        {params.code_example && params.code_example !== 'N/A' && (
          <>
            <Text style={[styles.sectionLabel, { color: sig.color, marginTop: 24 }]}>› EXEMPLE DE CODE</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeTxt}>{params.code_example.replace(/```\w*\n?/g, '').trim()}</Text>
            </View>
          </>
        )}

        {/* Bouton source */}
        <TouchableOpacity
          style={[styles.sourceBtn, { borderColor: sig.color + '40' }]}
          onPress={() => Linking.openURL(params.source_url)}
          activeOpacity={0.8}
        >
          <Text style={[styles.sourceBtnTxt, { color: sig.color }]}>ACCÉDER À LA SOURCE ORIGINALE ›</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1 },

  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0a1020' },
  backBtn: { paddingVertical: 6, paddingRight: 16 },
  backTxt: { color: '#2a4a6a', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  tagBox:  { borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  tagTxt:  { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },

  content: { padding: 20 },

  scoreRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  scoreLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  scoreBars:  { flexDirection: 'row', gap: 2 },
  scoreTime:  { color: '#1a3040', fontSize: 10, marginLeft: 'auto' },

  title:   { color: '#ddeeff', fontSize: 18, fontWeight: '800', lineHeight: 26, marginBottom: 16 },

  divider: { height: 1, marginBottom: 20 },

  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 2.5, marginBottom: 10 },

  summaryBox:  { borderLeftWidth: 2, borderRadius: 4, padding: 16, gap: 10 },
  summaryPara: { color: '#8aa0b8', fontSize: 14, lineHeight: 22 },

  codeBox:  { backgroundColor: '#020a14', borderRadius: 4, padding: 14, borderWidth: 1, borderColor: '#0a1a2a' },
  codeTxt:  { color: '#4a7a5a', fontSize: 12, lineHeight: 20, fontFamily: 'monospace' },

  sourceBtn:    { marginTop: 32, borderWidth: 1, borderRadius: 4, paddingVertical: 14, alignItems: 'center' },
  sourceBtnTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
})
