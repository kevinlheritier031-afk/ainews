import { readFileSync } from 'fs'
import { SourceMapConsumer } from 'source-map'

const mapPath = './dist/_expo/static/js/android/' +
  (process.argv[2] || 'entry-bf36b93700b9c208a8841fb94206e70e.js.map')

const raw = JSON.parse(readFileSync(mapPath, 'utf8'))

SourceMapConsumer.with(raw, null, consumer => {
  // crash position: line 1, column 192935
  const pos = consumer.originalPositionFor({ line: 1, column: 192935 })
  console.log('Crash at bundle column 192935:')
  console.log('  source:', pos.source)
  console.log('  line:  ', pos.line)
  console.log('  column:', pos.column)
  console.log('  name:  ', pos.name)

  // Also check surrounding calls
  for (const col of [119237, 109028, 192935]) {
    const p = consumer.originalPositionFor({ line: 1, column: col })
    console.log(`\nColumn ${col}: ${p.source}:${p.line}:${p.column} (${p.name})`)
  }
})
