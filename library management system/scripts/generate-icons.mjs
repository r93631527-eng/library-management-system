import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDirectory = resolve(directory, 'public')
const source = await readFile(resolve(publicDirectory, 'libraai-icon.svg'))

for (const size of [32, 180, 192, 512]) {
  await sharp(source).resize(size, size).png().toFile(resolve(publicDirectory, `libraai-icon-${size}.png`))
}

const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#246b52"/>
  <rect x="92" y="92" width="328" height="328" rx="52" fill="#f5f7f4"/>
  <path d="M256 180v152M256 332c-36-25-70-38-112-38V180c42 0 76 13 112 38c36-25 70-38 112-38v114c-42 0-76 13-112 38z"
    fill="none" stroke="#246b52" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

await sharp(Buffer.from(maskableSvg)).png().toFile(resolve(publicDirectory, 'libraai-icon-maskable-512.png'))
