// Character portrait avatars used for diff comments. Dropping more PNGs into
// this folder automatically adds them to the rotation.
const modules = import.meta.glob('./*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const avatarUrls: string[] = Object.keys(modules)
  .sort()
  .map((key) => modules[key])

export function pickAvatar(seed: string): string {
  if (avatarUrls.length === 0) {
    return ''
  }

  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return avatarUrls[hash % avatarUrls.length]
}
