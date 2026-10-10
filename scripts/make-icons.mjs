// Generates simple PNG app icons (teal background, white heart) with no extra dependencies.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [15, 118, 110]
const FG = [255, 255, 255]

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
// Heart curve: (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0, supersampled for smooth edges.
function inHeart(x, y) { const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0 }
function png(size, scale) {
  const rows = []
  const ss = 4
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let px = 0; px < size; px++) {
      let hits = 0
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const x = ((px + (sx + 0.5) / ss) / size - 0.5) * 2 / scale
        const y = -((py + (sy + 0.5) / ss) / size - 0.53) * 2 / scale
        if (inHeart(x * 1.15, y * 1.15)) hits++
      }
      const t = hits / (ss * ss)
      for (let c = 0; c < 3; c++) row[1 + px * 3 + c] = Math.round(BG[c] * (1 - t) + FG[c] * t)
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
  ])
}
mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', png(192, 0.62))
writeFileSync('public/icon-512.png', png(512, 0.62))
writeFileSync('public/icon-maskable-512.png', png(512, 0.48))
writeFileSync('public/apple-touch-icon.png', png(180, 0.62))
console.log('icons written')
