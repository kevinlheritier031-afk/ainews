import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import messaging from '@react-native-firebase/messaging'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
)

async function setupPushNotifications() {
  const authStatus = await messaging().requestPermission()
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL

  if (!enabled) return

  const token = await messaging().getToken()
  if (token) {
    await supabase
      .from('push_tokens')
      .upsert({ token, platform: Platform.OS }, { onConflict: 'token' })
  }

}

export default function RootLayout() {
  const router = useRouter()

  useEffect(() => {
    setupPushNotifications()

    // Notification reçue en foreground
    const unsubFg = messaging().onMessage(async remoteMessage => {
      console.log('Notification foreground:', remoteMessage.notification?.title)
    })

    // Tap sur notification depuis background
    const unsubBg = messaging().onNotificationOpenedApp(() => {
      router.push('/')
    })

    // App lancée depuis une notification (fermée)
    messaging().getInitialNotification().then(remoteMessage => {
      if (remoteMessage) router.push('/')
    })

    return () => {
      unsubFg()
      unsubBg()
    }
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0c1830' } }} />
    </SafeAreaProvider>
  )
}
