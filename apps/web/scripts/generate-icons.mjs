/**
 * Regenerates every raster icon from `app/icon.svg`, which is the single source
 * of truth for the mark. Run with `pnpm icons` after editing that file — the
 * binaries below are build output, not artwork to edit by hand.
 */
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(join(root, 'app/icon.svg'))

// Maskable variant: Android crops to a circle, so the mark sits inside the 80%
// safe zone on a full-bleed square instead of the rounded tile.
const maskableSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="#D50400"/>` +
    `<g transform="translate(256,256) scale(0.62) translate(-256,-256)">` +
    `<g transform="translate(167.5,150) skewX(-12)" fill="#FFFFFF">` +
    `<path d="M0 0h118v46H46v38h96v42H46v86H0z"/>` +
    `<path d="M222 212h-46V52l-36 18V26L186 0h36z"/>` +
    `</g></g></svg>`,
)

const png = (src, size) =>
  sharp(src, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

/**
 * ICO container holding PNG-compressed entries — supported everywhere since
 * Windows Vista, and far smaller than the equivalent BMP payloads.
 */
function buildIco(sizes, images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + 16 * images.length
  const directory = images.map((image, i) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(sizes[i], 0) // width  (0 would mean 256)
    entry.writeUInt8(sizes[i], 1) // height
    entry.writeUInt8(0, 2) // palette entries
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(image.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += image.length
    return entry
  })

  return Buffer.concat([header, ...directory, ...images])
}

const icoSizes = [16, 32, 48]
await writeFile(
  join(root, 'app/favicon.ico'),
  buildIco(icoSizes, await Promise.all(icoSizes.map((size) => png(svg, size)))),
)

// iOS ignores transparency and applies its own mask, so the tile stays opaque.
await writeFile(join(root, 'app/apple-icon.png'), await png(svg, 180))

await writeFile(join(root, 'public/icon-192.png'), await png(svg, 192))
await writeFile(join(root, 'public/icon-512.png'), await png(svg, 512))
await writeFile(join(root, 'public/icon-maskable-512.png'), await png(maskableSvg, 512))

console.log('Regenerated favicon.ico, apple-icon.png and the PWA icon set from app/icon.svg')
