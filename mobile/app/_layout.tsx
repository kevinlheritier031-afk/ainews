import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
)

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

async function registerPushToken() {
  if (!Device.isDevice) return

  const { status: existing } = await Notifications.getPermissionsAsync()
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync()

  if (status !== 'granted') return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ainews-alerts', {
      name: 'AI News — Signaux importants',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00e5ff',
    })
  }

  try {
    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({
      projectId: 'ai-news',
    })
    await supabase
      .from('push_tokens')
      .upsert({ token: tokenData, platform: Platform.OS }, { onConflict: 'token' })
  } catch {
    // token non disponible en mode debug sans credentials EAS — silencieux
  }
}

export default function RootLayout() {
  const router = useRouter()
  const notifListener = useRef<Notifications.EventSubscription>()
  const responseListener = useRef<Notifications.EventSubscription>()

  useEffect(() => {
    registerPushToken()

    // Notification reçue pendant que l'app est ouverte
    notifListener.current = Notifications.addNotificationReceivedListener(() => {})

    // Tap sur la notification → ouvre l'app (sur l'index pour l'instant)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/')
    })

    return () => {
      notifListener.current?.remove()
      responseListener.current?.remove()
    }
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0c1830' } }} />
    </SafeAreaProvider>
  )
}
