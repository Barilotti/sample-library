// Автор (издатель) библиотеки звуков по пути файла: «Boom Library - Guns Bundle», «[SoundMorph]», «KROTOS».
// Ищем по папкам от ближней к дальней, потом по имени файла. Файлы на диске не трогаем.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vendors = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [название, как его пишут в папках и файлах]
  const KNOWN = [
    ['Boom Library', /boom[\s._-]*library|\bboom[\s._-]*one\b|\bb00m\b/i],
    ['Krotos', /krotos/i],
    ['SoundMorph', /sound[\s._-]*morph/i],
    ['Sound Ideas', /sound[\s._-]*ideas/i],
    ['Ocular Sound', /ocular[\s._-]*sounds?/i],
    ['Blastwave FX', /blast[\s._-]*wave/i],
    ['Pro Sound Effects', /pro[\s._-]*sound[\s._-]*effects/i],
    ['Hollywood Edge', /hollywood[\s._-]*edge/i],
    ['BBC Sound Effects', /\bbbc\b/i],
    ['Epidemic Sound', /epidemic[\s._-]*sound/i],
    ['Artlist', /artlist/i],
    ['Envato', /envato|audio[\s._-]*jungle/i],
    ['Motion Array', /motion[\s._-]*array/i],
    ['Storyblocks', /story[\s._-]*blocks|audio[\s._-]*blocks/i],
    ['Zapsplat', /zap[\s._-]*splat/i],
    ['Freesound', /freesound/i],
    ['Pixabay', /pixabay/i],
    ['Soundsnap', /soundsnap/i],
    ['Soundly', /\bsoundly\b/i],
    ['Sonniss', /sonniss|\bgdc\b/i],
    ['A Sound Effect', /asoundeffect|\bA Sound Effect\b/],
    ['Splice', /\bsplice\b/i],
    ['Black Octopus', /black[\s._-]*octopus/i],
    ['Glitchmachines', /glitch[\s._-]*machines/i],
    ['Tonsturm', /tonsturm/i],
    ['Bluezone', /blue[\s._-]*zone/i],
    ['SoundBits', /sound[\s._-]*bits/i],
    ['Rabbit Ears Audio', /rabbit[\s._-]*ears/i],
    ['HISS and a ROAR', /hiss[\s._-]*and[\s._-]*a[\s._-]*roar/i],
    ['Articulated Sounds', /articulated[\s._-]*sounds?/i],
    ['Cinematic Samples', /cinematic[\s._-]*samples/i],
    ['Sound Response', /sound[\s._-]*response/i],
    ['SoundIron', /sound[\s._-]*iron/i],
    ['99Sounds', /99[\s._-]*sounds/i],
    ['Ghosthack', /ghost[\s._-]*hack/i],
    ['Big Room Sound', /big[\s._-]*room[\s._-]*sound/i],
    ['Chuck Russom FX', /chuck[\s._-]*russom/i],
    ['Airborne Sound', /airborne[\s._-]*sound/i],
    ['Sound Spark', /sound[\s._-]*spark/i],
  ];

  // Квадратные скобки в конце папки обычно содержат автора: «Element Series - Water [SoundMorph]».
  // Но не формат и не качество: «[WAV]», «[48kHz 24bit]».
  const BRACKET = /\[([^\]]{2,40})\]\s*$/;
  const NOT_VENDOR = /^(wav|mp3|flac|aiff?|ogg|hq|hd|lq|\d+\s*(k|khz|bit|bits|kbps)\b.*|\d+[\s_-]*\d*\s*(k|khz)?|stereo|mono|full|lite|update.*|v?\d+(\.\d+)*|ucs|designed|source|sfx|fx|wav\s*\d.*)$/i;

  // pixabay: «calming-rain-257596.mp3»
  const PIXABAY_NAME = /^[a-z0-9]+(-[a-z0-9]+)+-\d{5,7}\.(mp3|wav)$/;

  const cache = new Map();

  // Одного автора могут писать по-разному: «[Ocular]» и «[OCULAR]» — показываем как встретили впервые.
  const seen = new Map();
  function canonical(name) {
    const k = name.toLowerCase().replace(/[\s._-]+/g, ' ');
    if (!seen.has(k)) seen.set(k, name);
    return seen.get(k);
  }

  function known(text) {
    for (const [name, re] of KNOWN) if (re.test(text)) return name;
    return null;
  }

  /** Автор по полному пути файла или null, если не понятно. */
  function vendorOf(path) {
    const segs = path.split(/[\\/]/).filter(Boolean);
    const file = segs.pop() || '';
    const dirKey = segs.join('/');
    let v = cache.get(dirKey);
    if (v === undefined) {
      v = null;
      for (let i = segs.length - 1; i >= 0 && !v; i--) {
        v = known(segs[i]);
        if (!v) {
          const m = segs[i].match(BRACKET);
          if (m && !NOT_VENDOR.test(m[1].trim())) v = canonical(m[1].trim());
        }
      }
      cache.set(dirKey, v);
    }
    if (v) return v;
    return known(file) || (PIXABAY_NAME.test(file) ? 'Pixabay' : null);
  }

  return { vendorOf, KNOWN: KNOWN.map(([n]) => n) };
});
