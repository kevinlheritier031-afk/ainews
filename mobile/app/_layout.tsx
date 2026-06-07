import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, StyleSheet } from 'react-native'

export default function RootLayout() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a0a' },
          animation: 'fade',
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
})
