const fs = require('fs')
const { SourceMapConsumer } = require('source-map')

const mapPath = './dist/_expo/static/js/android/entry-bf36b93700b9c208a8841fb94206e70e.js.map'
const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'))

async function main() {
  const consumer = await new SourceMapConsumer(raw)

  const columns = [192935, 119237, 109028]
  for (const col of columns) {
    const pos = consumer.originalPositionFor({ line: 1, column: col })
    console.log(`Column ${col}: ${pos.source}:${pos.line}:${pos.column} (name=${pos.name})`)
  }
  consumer.destroy()
}

main().catch(console.error)
