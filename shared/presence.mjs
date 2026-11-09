// Cursor coordinates are relative to the full viewport, including its fixed header.
export function normalizedCursor(clientX, clientY, width, height) {
  if (![clientX, clientY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  if (clientX < 0 || clientX > width || clientY < 0 || clientY > height) return null
  return { x: clientX / width, y: clientY / height }
}
