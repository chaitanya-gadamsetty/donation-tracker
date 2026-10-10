const MAX_SIDE = 1600
const MAX_BYTES = 10 * 1024 * 1024

/** Shrinks phone photos (often 3–5 MB) to ~200–400 KB JPEGs. PDFs and other files are kept as-is. */
export async function prepareReceipt(file: File): Promise<{ blob: Blob; fileName: string }> {
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.75))
      if (blob && blob.size < file.size) {
        return { blob, fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg' }
      }
    } catch {
      // fall through and keep the original
    }
  }
  if (file.size > MAX_BYTES) throw new Error('File is larger than 10 MB. Please attach a smaller file.')
  return { blob: file, fileName: file.name }
}

export function extensionFor(mimeType: string, fileName: string): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]
  if (fromName) return fromName.toLowerCase()
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return mimeType.slice(6)
  return 'bin'
}
