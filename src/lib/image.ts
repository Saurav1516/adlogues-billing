// Shrinks an uploaded image in the browser before it's saved, so logos and signatures stay small.
export async function fileToDataUrl(file: File, maxSide = 800): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Please choose a PNG, JPG or WebP image.')
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is over 8 MB. Please choose a smaller one.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that image.'))
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that image.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    // PNG keeps transparency (logos, signatures). Fall back to WebP if it's still too large.
    let out = canvas.toDataURL('image/png')
    if (out.length > 1_400_000) out = canvas.toDataURL('image/webp', 0.88)
    if (out.length > 1_400_000) throw new Error('That image is still too large after resizing. Try a smaller one.')
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}
