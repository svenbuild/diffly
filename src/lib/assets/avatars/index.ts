// Character portrait avatars used for diff comments. Dropping more PNGs into
// this folder automatically adds them to the rotation.
const modules = import.meta.glob('./*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// Invented display names per portrait. Falls back to a capitalized file stem.
const NAMES: Record<string, string> = {
  assassin: 'Vesper',
  astronaut: 'Cosmo',
  baker: 'Pol',
  elf: 'Lirael',
  fighter: 'Pixel',
  gothic: 'Raven',
  hacker: 'Nyx',
  healer: 'Seren',
  knight: 'Cedric',
  mechanic: 'Dash',
  pirate: 'Morgan',
  punk: 'Sid',
  ranger: 'Cassia',
  robot: 'Unit-7',
  scientist: 'Ada',
  sorceress: 'Isolde',
  vampire: 'Vlad',
  warrior: 'Bjorn',
  winter: 'Yuki',
  wizard: 'Merlin',
}

export interface Avatar {
  url: string
  name: string
}

export const avatars: Avatar[] = Object.keys(modules)
  .sort()
  .map((key) => {
    const stem = key.replace(/^\.\//, '').replace(/\.png$/i, '')
    return {
      url: modules[key],
      name: NAMES[stem] ?? stem.charAt(0).toUpperCase() + stem.slice(1),
    }
  })

const FALLBACK: Avatar = { url: '', name: 'Anon' }

export function pickAvatar(seed: string): Avatar {
  if (avatars.length === 0) {
    return FALLBACK
  }

  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return avatars[hash % avatars.length]
}
