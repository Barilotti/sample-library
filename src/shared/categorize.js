// Автокатегоризация сэмплов по имени файла и пути папок.
// Работает и в Node (сканер), и в браузере (поиск в интерфейсе), поэтому без зависимостей.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Categorize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES_VERSION = 4;

  // Категории: id, название в интерфейсе, родитель, ключевые слова (en, ru, транслит).
  // Русские слова автоматически дополняются транслитом, поэтому "бочка" ловит и "bochka".
  const CATEGORIES = [
    { id: 'drums', label: 'Ударные', words: ['drum', 'drums', 'drumkit', 'kit', 'percussion', 'барабан', 'ударные', 'ударка'] },
    { id: 'kick', parent: 'drums', label: 'Бочка', words: ['kick', 'kik', 'kck', 'bd', 'bassdrum', 'бочка', 'бочки', 'кик', 'бас-бочка'] },
    { id: 'snare', parent: 'drums', label: 'Малый', words: ['snare', 'snr', 'sd', 'rimshot', 'rim', 'малый', 'снейр', 'снэр', 'рим'] },
    { id: 'clap', parent: 'drums', label: 'Хлопки', words: ['clap', 'claps', 'clp', 'snap', 'snaps', 'хлопок', 'хлопки', 'клэп', 'клап', 'щелчок пальцами'] },
    { id: 'hihat', parent: 'drums', label: 'Хэты', words: ['hihat', 'hat', 'hats', 'hh', 'oh', 'ch', 'openhat', 'closedhat', 'хэт', 'хет', 'хай-хэт', 'хайхэт'] },
    { id: 'cymbal', parent: 'drums', label: 'Тарелки', words: ['cymbal', 'crash', 'ride', 'splash', 'china', 'тарелка', 'тарелки', 'крэш', 'райд'] },
    { id: 'tom', parent: 'drums', label: 'Томы', words: ['tom', 'toms', 'floortom', 'том', 'томы'] },
    { id: 'perc', parent: 'drums', label: 'Перкуссия', words: ['perc', 'shaker', 'tambourine', 'conga', 'bongo', 'cowbell', 'clave', 'woodblock', 'triangle', 'cabasa', 'guiro', 'djembe', 'перкуссия', 'шейкер', 'бубен', 'конга', 'бонго', 'треугольник', 'маракас', 'джембе'] },
    { id: 'drumloop', parent: 'drums', label: 'Лупы ударных', words: ['break', 'breakbeat', 'breaks', 'groove', 'beat', 'topLoop', 'drumloop', 'брейк', 'бит', 'грув'] },

    { id: 'bass', label: 'Бас', words: ['bass', 'sub', 'subbass', '808', 'reese', 'bassline', 'бас', 'саб', 'басы'] },

    { id: 'synth', label: 'Синты и клавиши', words: ['synth', 'syn', 'lead', 'pluck', 'arp', 'arpeggio', 'chord', 'chords', 'stab', 'keys', 'piano', 'rhodes', 'organ', 'epiano', 'синт', 'синтезатор', 'лид', 'пианино', 'рояль', 'аккорд', 'аккорды', 'орган', 'клавиши', 'арпеджио'] },
    { id: 'pad', parent: 'synth', label: 'Пэды', words: ['pad', 'pads', 'пэд', 'пад', 'пэды'] },

    { id: 'instruments', label: 'Живые инструменты', words: ['guitar', 'gtr', 'strings', 'violin', 'cello', 'viola', 'brass', 'trumpet', 'trombone', 'horn', 'sax', 'flute', 'woodwind', 'harp', 'orchestra', 'orchestral', 'bell', 'bells', 'гитара', 'струнные', 'скрипка', 'виолончель', 'духовые', 'труба', 'тромбон', 'саксофон', 'флейта', 'арфа', 'оркестр', 'колокол', 'колокольчик', 'балалайка', 'баян', 'гармонь', 'instrument', 'dj', 'музыка', 'музыкальные', 'литавры', 'горн', 'колокола', 'бубенчики', 'колокольчики'] },

    { id: 'vocal', label: 'Вокал и голос', words: ['vocal', 'vocals', 'vox', 'voice', 'voices', 'choir', 'acapella', 'speech', 'talk', 'whisper', 'scream', 'shout', 'breath', 'laugh', 'вокал', 'голос', 'голоса', 'хор', 'речь', 'шёпот', 'шепот', 'крик', 'дыхание', 'смех', 'разговор', 'фраза', 'risas', 'angry', 'awwww', 'aww', 'romance', 'смех', 'вздох', 'кашель', 'чихание', 'голоса', 'body', 'heartbeat', 'heart', 'cry', 'crying', 'baby', 'scared', 'анатомические', 'сердце', 'сердцебиение', 'икает', 'зевает', 'чихает', 'кашляет', 'отрыжка', 'сморкается', 'урчание', 'желудок', 'плач', 'ребенок', 'младенец', 'человеческие'] },

    { id: 'ambient', label: 'Эмбиент и атмосферы', words: ['ambient', 'ambience', 'ambiance', 'amb', 'atmos', 'atmosphere', 'atmo', 'drone', 'texture', 'soundscape', 'roomtone', 'tone', 'bed', 'background', 'эмбиент', 'эмбиэнт', 'атмосфера', 'атмосферы', 'фон', 'дрон', 'текстура', 'гул', 'саундскейп', 'тишина'] },

    { id: 'field', label: 'Природа и город', words: ['field', 'fieldrec', 'nature', 'rain', 'wind', 'storm', 'thunder', 'forest', 'birds', 'bird', 'water', 'river', 'sea', 'ocean', 'waves', 'stream', 'fire', 'insects', 'night', 'city', 'street', 'traffic', 'crowd', 'market', 'park', 'subway', 'metro', 'station', 'cafe', 'restaurant', 'office', 'природа', 'дождь', 'ветер', 'гроза', 'гром', 'лес', 'птицы', 'птица', 'вода', 'река', 'море', 'океан', 'волны', 'ручей', 'огонь', 'костёр', 'костер', 'насекомые', 'сверчки', 'ночь', 'город', 'улица', 'трафик', 'толпа', 'рынок', 'парк', 'метро', 'вокзал', 'кафе', 'ресторан', 'офис', 'деревня', 'двор', 'environment', 'weather', 'blizzard', 'cave', 'waterfall', 'pond', 'lake', 'leaves', 'jungle', 'farm', 'village', 'sewer', 'bubbles', 'liquid', 'drip', 'drops', 'splash', 'ashes', 'погода', 'метель', 'вьюга', 'пещера', 'водопад', 'пруд', 'озеро', 'листья', 'джунгли', 'ферма', 'пузыри', 'капли', 'капает', 'всплеск', 'ливень', 'поля', 'катаклизмы', 'смолоскип', 'факел', 'пламя'] },

    { id: 'fx', label: 'Эффекты', words: ['fx', 'sfx', 'effect', 'effects', 'эффект', 'эффекты', 'звуковые'] },
    { id: 'transition', parent: 'fx', label: 'Переходы', words: ['riser', 'rise', 'uplifter', 'downlifter', 'sweep', 'whoosh', 'swoosh', 'swish', 'transition', 'reverse', 'rev', 'build', 'buildup', 'fall', 'downer', 'райзер', 'свуш', 'вжух', 'переход', 'реверс', 'подъём', 'подъем', 'нарастание', 'пролёт', 'пролет', 'whooshs', 'whooshes', 'slow', 'transitions', 'свист'] },
    { id: 'impact', parent: 'fx', label: 'Удары и импакты', words: ['impact', 'hit', 'hits', 'boom', 'braam', 'slam', 'thud', 'stinger', 'trailer', 'cinematic', 'импакт', 'удар', 'удары', 'бум', 'хит', 'boom', 'cinematic', 'удары'] },
    { id: 'glitch', parent: 'fx', label: 'Глитч и шумы', words: ['glitch', 'noise', 'static', 'vinyl', 'crackle', 'hiss', 'distortion', 'stutter', 'bitcrush', 'глитч', 'шум', 'шумы', 'помехи', 'треск', 'винил', 'шипение'] },
    { id: 'ui', parent: 'fx', label: 'Интерфейс', words: ['ui', 'interface', 'click', 'button', 'beep', 'notification', 'alert', 'menu', 'hover', 'select', 'confirm', 'error', 'blip', 'интерфейс', 'клик', 'кнопка', 'писк', 'уведомление', 'меню', 'сигнал', 'alerts', 'ding', 'correct', 'achievement', 'award', 'coming', 'completed', 'timer', 'pause', 'rewind', 'pop', 'pops', 'сигналы', 'тревога', 'неправильный', 'правильный', 'таймер', 'гудки', 'звонок', 'chime', 'fail', 'lose', 'win', 'censored', 'censorship', 'bleep', 'cursor'] },
    { id: 'scifi', parent: 'fx', label: 'Sci-fi и магия', words: ['scifi', 'sci', 'laser', 'robot', 'spaceship', 'magic', 'spell', 'portal', 'energy', 'zap', 'teleport', 'лазер', 'робот', 'магия', 'заклинание', 'портал', 'энергия', 'космос', 'magical', 'wand', 'sci-fi', 'cyber', 'futuristic', 'momentum', 'electronic', 'mutate', 'космос', 'волшебство', 'зелье', 'электронные', 'электронное'] },

    { id: 'foley', label: 'Фоли', words: ['foley', 'footstep', 'footsteps', 'steps', 'step', 'door', 'doors', 'cloth', 'clothes', 'fabric', 'glass', 'metal', 'wood', 'paper', 'keys', 'zipper', 'bag', 'cup', 'plate', 'chair', 'handle', 'squeak', 'creak', 'фоли', 'шаги', 'шаг', 'дверь', 'двери', 'одежда', 'ткань', 'стекло', 'металл', 'дерево', 'бумага', 'ключи', 'молния', 'сумка', 'чашка', 'тарелка', 'стул', 'скрип', 'ручка', 'посуда', 'bottle', 'bottles', 'can', 'cans', 'jar', 'food', 'eat', 'drink', 'cups', 'dishes', 'knocking', 'knock', 'luggage', 'bags', 'furniture', 'window', 'windows', 'chalk', 'tiza', 'vidrio', 'paper', 'sheet', 'zip', 'бутылки', 'бутылка', 'банки', 'банка', 'еда', 'пища', 'посуда', 'стук', 'багаж', 'сумки', 'мебель', 'окна', 'окно', 'бумажные', 'канцелярские', 'замки', 'тележки', 'мусор', 'кухня', 'скрипы', 'хруст', 'звон', 'стакан', 'стаканы'] },

    { id: 'weapons', label: 'Оружие и взрывы', words: ['gun', 'guns', 'gunshot', 'shot', 'rifle', 'pistol', 'reload', 'weapon', 'weapons', 'sword', 'blade', 'punch', 'kick-hit', 'explosion', 'explode', 'blast', 'debris', 'bullet', 'ricochet', 'выстрел', 'выстрелы', 'оружие', 'пистолет', 'автомат', 'винтовка', 'перезарядка', 'меч', 'клинок', 'удар кулаком', 'взрыв', 'взрывы', 'обломки', 'пуля', 'рикошет', 'armas', 'arma', 'combat', 'melee', 'medieval', 'arrow', 'bow', 'whip', 'shotgun', 'cannon', 'battle', 'fight', 'violent', 'destruction', 'destroy', 'golpe', 'холодное', 'огнестрельное', 'баталии', 'битва', 'бой', 'драка', 'лук', 'стрела', 'хлыст', 'пушка', 'разрушение'] },

    { id: 'vehicles', label: 'Транспорт', words: ['car', 'cars', 'engine', 'vehicle', 'truck', 'bus', 'train', 'tram', 'plane', 'airplane', 'jet', 'helicopter', 'motorcycle', 'bike', 'boat', 'ship', 'horn', 'brake', 'skid', 'машина', 'автомобиль', 'двигатель', 'мотор', 'грузовик', 'автобус', 'поезд', 'электричка', 'трамвай', 'самолёт', 'самолет', 'вертолёт', 'вертолет', 'мотоцикл', 'лодка', 'корабль', 'гудок', 'тормоз', 'клаксон', 'auto', 'autobus', 'monorail', 'subway', 'railway', 'racing', 'siren', 'sirens', 'авто', 'автомобили', 'мотоциклы', 'поезда', 'паровоз', 'самолеты', 'вертолеты', 'аэропланы', 'железная', 'гонки', 'сирена', 'сирены', 'катера', 'корабли', 'транспорт', 'аварии', 'авария', 'дтп'] },

    { id: 'animals', label: 'Животные и существа', words: ['animal', 'animals', 'dog', 'dogs', 'cat', 'horse', 'horses', 'cow', 'wolf', 'bark', 'meow', 'growl', 'snarl', 'whimper', 'yelp', 'pant', 'panting', 'roar', 'creature', 'creatures', 'monster', 'monsters', 'zombie', 'dragon', 'beast', 'insect', 'insects', 'cicada', 'crow', 'frog', 'perro', 'gato', 'caballo', 'animales', 'животное', 'животные', 'собака', 'пёс', 'пес', 'кошка', 'кот', 'лошадь', 'корова', 'волк', 'лай', 'мяу', 'рычание', 'рык', 'монстр', 'существо', 'существа', 'чудовище', 'зомби', 'дракон', 'лягушки', 'ворона', 'чайки', 'собаки', 'лошади'] },

    { id: 'crowd', label: 'Люди и толпа', words: ['crowd', 'crowds', 'walla', 'people', 'applause', 'clapping', 'cheer', 'cheering', 'audience', 'children', 'kids', 'party', 'stadium', 'tavern', 'aplausos', 'gente', 'люди', 'толпа', 'аплодисменты', 'овации', 'дети', 'зрители', 'публика', 'вечеринка', 'стадион', 'таверна', 'человек'] },
    { id: 'machines', label: 'Техника и быт', words: ['machine', 'machines', 'mechanism', 'mechanical', 'industry', 'industrial', 'factory', 'construction', 'appliance', 'conditioner', 'printer', 'computer', 'keyboard', 'phone', 'telephone', 'camera', 'clock', 'ticking', 'switch', 'electric', 'electricity', 'sparks', 'radio', 'tv', 'tools', 'drill', 'saw', 'hammer', 'toilet', 'fan', 'vacuum', 'battery', 'money', 'coins', 'coin', 'cash', 'механизм', 'механизмы', 'техника', 'индустрия', 'завод', 'фабрика', 'стройка', 'бытовая', 'быт', 'кондиционер', 'принтер', 'компьютер', 'компьютеры', 'клавиатура', 'телефон', 'фотоаппарат', 'фотоаппараты', 'камеры', 'часы', 'тиканье', 'будильник', 'выключатель', 'переключатели', 'электричество', 'электроприборы', 'радио', 'телевизор', 'инструменты', 'дрель', 'пила', 'молоток', 'туалет', 'вентилятор', 'пылесос', 'деньги', 'монеты', 'касса', 'оргтехника', 'винты', 'film', 'projector', 'slot', 'проектор', 'кинопроектор', 'зажигалка', 'зажигалки', 'велосипед'] },
    { id: 'cartoon', label: 'Мультяшные и мемы', words: ['cartoon', 'comic', 'comedy', 'funny', 'meme', 'memes', 'anime', 'toy', 'toys', 'boing', 'squeaky', 'minecraft', 'videogame', 'videogames', 'arcade', 'retro', '8bit', 'caricatura', 'мультяшные', 'мультяшный', 'комические', 'мемы', 'мем', 'игрушки', 'игрушка', 'аниме', 'прикол', 'fofos', 'jingle', 'pickup', 'bonus', 'powerup', 'pokemon', 'mario', 'roblox', 'games', 'game', 'plants', 'zombies', 'momo', 'boing', 'cute', 'roulette', 'spinning'] },
    { id: 'horror', label: 'Ужасы и мистика', words: ['horror', 'terror', 'scary', 'creepy', 'spooky', 'haunted', 'ghost', 'tension', 'suspense', 'ужасы', 'ужас', 'мистика', 'страшный', 'жуткий', 'призрак', 'напряжение', 'саспенс', 'susto', 'asustado', 'scare', 'jumpscare', 'флешбеки'] },

    { id: 'other', label: 'Без категории', words: [] },
  ];

  // Украинские слова в названиях файлов (интерфейс остаётся русским).
  const UK_WORDS = {
    drums: ['барабани', 'ударні'],
    snare: ['малий'],
    clap: ['оплески', 'плескіт'],
    cymbal: ['тарілка', 'тарілки'],
    perc: ['перкусія', 'бубон', 'трикутник'],
    bass: ['баси'],
    synth: ['піаніно', 'фортепіано', 'акорд', 'акорди', 'клавішні'],
    pad: ['пед', 'педи'],
    instruments: ['гітара', 'віолончель', 'струнні', 'духові', 'дзвін', 'дзвони', 'дзвіночок', 'бандура', 'сопілка', 'цимбали', 'трембіта', 'музика'],
    vocal: ['мова', 'мовлення', 'шепіт', 'дихання', 'сміх', 'розмова', 'кашель'],
    crowd: ['люди', 'натовп', 'оплески', 'діти', 'глядачі', 'хлопають', 'аплодують'],
    ambient: ['атмосфери', 'гудіння', 'тиша'],
    field: ['природа', 'дощ', 'вітер', 'гроза', 'грім', 'ліс', 'лісу', 'птахи', 'птах', 'пташки', 'річка', 'хвилі', 'струмок', 'вогонь', 'вогнище', 'полум', 'смолоскип', 'комахи', 'цвіркуни', 'ніч', 'місто', 'вулиця', 'трафік', 'ринок', 'вокзал', 'офіс', 'село', 'ставок', 'ставка', 'озеро', 'заметіль', 'хуртовина', 'сніг', 'підвіконня', 'краплі'],
    fx: ['ефект', 'ефекти'],
    transition: ['перехід', 'наростання', 'проліт'],
    impact: ['імпакт', 'удари'],
    glitch: ['глітч', 'шуми', 'перешкоди', 'тріск', 'шипіння'],
    ui: ['інтерфейс', 'клік', 'сповіщення', 'дзвінок'],
    scifi: ['магія', 'закляття', 'енергія'],
    foley: ['фолі', 'кроки', 'крок', 'двері', 'одяг', 'тканина', 'скло', 'папір', 'ключі', 'блискавка', 'стілець', 'посуд', 'пляшка', 'стукіт'],
    weapons: ['постріл', 'постріли', 'зброя', 'пістолет', 'гвинтівка', 'вибух', 'вибухи', 'уламки', 'куля', 'бійка'],
    vehicles: ['автомобіль', 'двигун', 'вантажівка', 'потяг', 'поїзд', 'літак', 'гелікоптер', 'вертоліт', 'човен', 'корабель', 'гальма', 'сирена'],
    animals: ['тварина', 'тварини', 'цуценя', 'кіт', 'кішка', 'кінь', 'коні', 'вовк', 'гавкіт', 'гавкання', 'нявкання', 'гарчання', 'істота', 'жаби', 'ворона', 'чайки'],
    machines: ['техніка', 'механізм', 'завод', 'будівництво', 'кондиціонер', 'годинник', 'телефон', 'гроші', 'монети', 'електрика', 'гвинти'],
    horror: ['жах', 'жахи', 'страшний', 'моторошний', 'привид'],
  };
  for (const c of CATEGORIES) if (UK_WORDS[c.id]) c.words = c.words.concat(UK_WORDS[c.id]);

  // Слабые слова: встречаются в любых категориях ("Arrow Hit", "Door Hit"), поэтому весят меньше папки.
  const WEAK = new Set(['break', 'breaks', 'foley', 'фоли', 'sounds', 'sound', 'звуки', 'звук', 'library', 'pack', 'hit', 'hits', 'fx', 'sfx', 'effect', 'effects', 'эффект', 'эффекты', 'tone', 'bed', 'background', 'фон', 'kit', 'beat', 'rise', 'fall', 'build', 'reverse', 'rev', 'select', 'error', 'confirm', 'menu', 'hover', 'alert', 'shot', 'keys', 'key', 'can', 'pop', 'step', 'slow', 'звонок', 'удар', 'звон', 'tension', 'electric', 'electronic', 'sheet', 'eat', 'drink', 'zip', 'party', 'retro', 'oh', 'ch', 'bd', 'sd', 'hh', 'rim', 'sub', 'bell', 'bells', 'bus', 'fan', 'saw', 'drill', 'switch']);

  const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  // Транслитерация кириллицы, чтобы "veter" и "ветер" считались одним словом.
  const TR = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
  };
  const CYR = /[а-яёіїєґ]/;

  function translit(s) {
    let out = '';
    for (const ch of s) out += TR[ch] !== undefined ? TR[ch] : ch;
    return out;
  }

  function normalize(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/['’ʼ`]/g, '');
  }

  // Делит "KickDrum_Hard-01 (Бочка).wav" на ["kick", "drum", "hard", "бочка"].
  function tokenize(s) {
    const spaced = String(s)
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/one[\s_\-]?shots?/gi, 'oneshot')
      .replace(/([a-zа-яёіїєґ])([A-ZА-ЯЁІЇЄҐ])/g, '$1 $2')
      .replace(/([a-zA-Zа-яА-ЯёЁіїєґІЇЄҐ])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Zа-яА-ЯёЁіїєґІЇЄҐ])/g, '$1 $2');
    return normalize(spaced)
      .split(/[^a-zа-яіїєґ0-9#]+/)
      .filter((t) => t && !/^\d+$/.test(t) || t === '808');
  }

  // Убирает типичные русские окончания: "бочкой" -> "бочк", "ударные" -> "ударн".
  function ruStem(w) {
    if (w.length <= 4) return w;
    return w.replace(/(ами|ями|ого|его|ому|ему|ой|ей|ий|ый|ая|яя|ое|ее|ые|ие|ов|ев|ам|ям|ах|ях|ом|ем|а|я|ы|и|у|ю|е|о|ь)$/, '');
  }

  // Индекс: слово -> [id категорий]. Многословные ключи ("удар кулаком") ищутся как фраза.
  const exact = new Map();
  const prefixes = []; // [prefix, catId]
  const phrases = []; // [phrase, catId]

  function addKey(key, id) {
    if (!exact.has(key)) exact.set(key, new Set());
    exact.get(key).add(id);
  }

  for (const cat of CATEGORIES) {
    for (const raw of cat.words) {
      const w = normalize(raw);
      if (/[\s-]/.test(w)) {
        phrases.push([w.replace(/-/g, ' '), cat.id]);
        continue;
      }
      addKey(w, cat.id);
      if (CYR.test(w)) {
        const stem = ruStem(w);
        if (stem.length >= 3) prefixes.push([stem, cat.id]);
        const lat = translit(w);
        addKey(lat, cat.id);
        if (lat.length >= 5) prefixes.push([translit(stem), cat.id]);
      } else if (w.length >= 4) {
        prefixes.push([w, cat.id]);
      }
    }
  }
  prefixes.sort((a, b) => b[0].length - a[0].length);

  // Окончания, которые разрешаем после коротких русских основ ("лес" -> "леса", но не "лестница").
  const RU_ENDINGS = /^(а|я|у|ю|е|и|ы|ом|ем|ой|ей|ам|ям|ах|ях|ов|ев|ами|ями)$/;
  function prefixOk(t, p) {
    if (t.length <= p.length || !t.startsWith(p)) return false;
    const rest = t.slice(p.length);
    if (CYR.test(p)) return p.length >= 4 ? RU_ENDINGS.test(rest) || rest.length <= 2 : RU_ENDINGS.test(rest);
    return rest.length <= 4;
  }

  function categoriesForToken(token) {
    const t = normalize(token);
    const hit = new Set(exact.get(t) || []);
    const lat = CYR.test(t) ? translit(t) : null;
    if (lat && exact.has(lat)) for (const id of exact.get(lat)) hit.add(id);
    if (hit.size) return hit;
    for (const [p, id] of prefixes) {
      if (prefixOk(t, p) || (lat && prefixOk(lat, p))) hit.add(id);
    }
    if (!hit.size && CYR.test(t) && t.length >= 7) for (const id of gluedHits(t)) hit.add(id);
    return hit;
  }

  // Слитные русские/украинские названия: «звукилеса», «сукалёгкийдождь», «ахуєнийгул».
  // Длинные основы ищем внутри слова, короткие (гул, лес) — только в конце.
  let gluedKeys = null;
  function gluedHits(t) {
    if (!gluedKeys) {
      gluedKeys = [];
      for (const [w, ids] of exact) if (CYR.test(w) && w.length >= 3) gluedKeys.push([w, ids]);
      for (const [p, id] of prefixes) if (CYR.test(p) && p.length >= 4) gluedKeys.push([p, new Set([id])]);
    }
    const out = new Set();
    for (const [k, ids] of gluedKeys) {
      let ok = false;
      if (k.length >= 5) ok = t.includes(k);
      else if (k.length === 4) ok = t.endsWith(k) || t.slice(0, -1).endsWith(k) || t.slice(0, -2).endsWith(k);
      else ok = t.endsWith(k) || (t.length > 4 && RU_ENDINGS.test(t.slice(t.lastIndexOf(k) + 3)) && t.lastIndexOf(k) > 2 && t.lastIndexOf(k) + 3 >= t.length - 2);
      if (ok) for (const id of ids) out.add(id);
    }
    return out;
  }

  // Словарь переводов для поиска: одно понятие на двух языках. Запрос «dog» найдёт «Лай собаки»,
  // «дождь» найдёт «Rain_Roof», «лай» найдёт «Dog_Bark». Слова внутри группы равноправны.
  const SYNONYMS = [
'dog dogs puppy hound собака собаки пёс пес щенок',
'bark barking woof лай лает гавкает',
'cat cats kitten кошка кот котёнок',
'meow мяу мяуканье нявкання',
'horse конь лошадь',
'wolf волк',
'bird birds птица птицы',
'growl рычание',
'roar рёв рык',
'rain дождь',
'wind ветер',
'storm шторм буря гроза',
'thunder гром',
'forest woods лес',
'water вода',
'river река',
'sea ocean море океан',
'waves волны',
'fire огонь костёр костер',
'night ночь',
'morning утро',
'city town город',
'street улица',
'traffic трафик пробка',
'crowd people толпа люди',
'snow снег',
'ice лёд лед',
'footsteps footstep steps step шаги шаг',
'door doors дверь двери',
'glass стекло',
'metal металл метал',
'wood wooden дерево деревянный',
'paper бумага',
'keys key ключи ключ',
'cloth clothes fabric одежда ткань',
'creak squeak скрип',
'knock стук',
'car cars машина автомобиль',
'engine motor двигатель мотор',
'train поезд электричка',
'plane airplane aircraft самолёт самолет',
'helicopter вертолёт вертолет',
'gun gunshot shot shots выстрел выстрелы',
'pistol пистолет',
'rifle винтовка',
'reload перезарядка',
'explosion explode blast взрыв',
'sword меч',
'punch удар кулаком',
'voice голос',
'vocal vocals vox вокал',
'choir хор',
'whisper шёпот шепот',
'scream shout крик',
'breath breathing дыхание',
'laugh laughter смех',
'talk speech conversation речь разговор',
'kick бочка',
'snare малый',
'clap хлопок хлопки',
'hihat hat хэт',
'cymbal crash тарелка',
'drum drums барабан барабаны ударные',
'bass бас',
'pad пэд пад',
'piano пианино рояль',
'guitar гитара',
'strings струнные',
'violin скрипка',
'bell bells колокол колокольчик',
'synth синт синтезатор',
'chord chords аккорд аккорды',
'loop loops луп лупы петля',
'ambient ambience атмосфера эмбиент фон',
'drone дрон гул',
'noise шум',
'click клик',
'button кнопка',
'beep писк сигнал',
'notification уведомление',
'whoosh swoosh swish свуш вжух',
'riser райзер нарастание',
'impact hit удар импакт',
'glitch глитч',
'laser лазер',
'robot робот',
'magic магия',
'space космос',
'monster монстр чудовище',
'heart сердце',
'phone телефон',
'clock часы',
'kitchen кухня',
'office офис',
  ];

  const synIndex = new Map(); // форма -> индекс группы
  const synPrefixes = []; // [основа, индекс группы] для склонений
  const synGroups = SYNONYMS.map((line, gi) => {
    const words = line.split(' ').map((w) => w.replace(/ё/g, 'е')).filter(Boolean);
    for (const w of words) {
      synIndex.set(w, gi);
      if (CYR.test(w)) {
        synIndex.set(translit(w), gi);
        const st = ruStem(w);
        if (st.length >= 3 && st !== w) synPrefixes.push([st, gi]);
      }
    }
    return words;
  });

  function synonymGroup(word) {
    const n = normalize(word);
    if (synIndex.has(n)) return synIndex.get(n);
    for (const [st, gi] of synPrefixes) if (prefixOk(n, st)) return gi;
    // Английское множественное число: barks -> bark, glasses -> glass.
    if (/^[a-z]+s$/.test(n)) {
      if (synIndex.has(n.slice(0, -1))) return synIndex.get(n.slice(0, -1));
      if (n.endsWith('es') && synIndex.has(n.slice(0, -2))) return synIndex.get(n.slice(0, -2));
    }
    return -1;
  }

  // Формы для поиска по токенам: русские и украинские слова берём основой, чтобы ловить падежи.
  function synonymForms(word) {
    const gi = synonymGroup(word);
    if (gi < 0) return [];
    const out = new Set();
    for (const w of synGroups[gi]) {
      if (w.includes(' ')) continue;
      if (CYR.test(w)) {
        const st = ruStem(w);
        out.add(st.length >= 3 ? st : w);
      } else out.add(w);
    }
    return [...out];
  }

  // Слитные запросы: «dogbark» -> ["dog", "bark"], «rainroof» -> ["rain", "roof"].
  function splitCompound(word) {
    const n = normalize(word);
    if (n.length < 5 || synonymGroup(n) >= 0 || exact.has(n)) return null;
    const known = (w) => synIndex.has(w) || exact.has(w);
    for (let i = n.length - 2; i >= 2; i--) {
      const a = n.slice(0, i), b = n.slice(i);
      if (known(a) && (known(b) || splitCompound(b))) return [a].concat(known(b) ? [b] : splitCompound(b));
    }
    return null;
  }

  // Ищет BPM: "120bpm", "bpm_120", "120 BPM", "_120_" в лупах.
  function detectBpm(name) {
    const s = name.replace(/\.[a-z0-9]{2,4}$/i, '');
    let m = s.match(/(\d{2,3}(?:[.,]\d+)?)\s*-?_?(?:bpm|бпм|уд)/i) || s.match(/(?:bpm|бпм|tempo)\s*-?_?(\d{2,3})/i);
    if (!m && /loop|луп|break|брейк|groove|грув/i.test(s)) m = s.match(/(?:^|[\s_\-])(\d{2,3})(?=[\s_\-]|$)/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    return v >= 50 && v <= 220 ? Math.round(v * 10) / 10 : null;
  }

  // Ищет тональность: "Cmin", "F#m", "A minor", "Ab_maj", "key_Dm", "ля минор".
  // Голую ноту ("Pad_C.wav") принимаем только для мелодических звуков (allowBare).
  const RU_NOTES = { до: 'C', ре: 'D', ми: 'E', фа: 'F', соль: 'G', ля: 'A', си: 'B' };
  const B = '(?:^|[\\s_\\-(\\[])';
  const E = '(?=$|[\\s_\\-)\\].,])';
  const KEY_FULL = new RegExp(B + '([A-G])(#|b|♯|♭)?[\\s_]?([Mm]inor|[Mm]ajor|[Mm]in|[Mm]aj|moll|dur|m)' + E);
  const KEY_TAGGED = new RegExp('(?:key|tonality)[\\s_\\-]?([A-G])(#|b|♯|♭)?(m(?:in(?:or)?)?|maj(?:or)?)?' + E, 'i');
  const KEY_BARE = new RegExp(B + '([A-G])(#|b|♯|♭)?' + E);

  function fmtKey(note, acc, q) {
    const a = acc ? acc.replace('♯', '#').replace('♭', 'b') : '';
    const minor = q && /^(m|min|minor|moll)$/i.test(q) && q !== 'M';
    return note + a + (minor ? 'm' : '');
  }

  function detectKey(name, allowBare) {
    const s = name.replace(/\.[a-z0-9]{2,4}$/i, '');
    let m = s.match(KEY_FULL) || s.match(KEY_TAGGED);
    if (m) return fmtKey(m[1].toUpperCase(), m[2], m[3]);
    m = normalize(s).match(/(?:^|[\s_\-])(до|ре|ми|фа|соль|ля|си)(?:[\s_\-]?(диез|бемоль))?[\s_\-]?(минор|мажор)/);
    if (m) return RU_NOTES[m[1]] + (m[2] === 'диез' ? '#' : m[2] === 'бемоль' ? 'b' : '') + (m[3] === 'минор' ? 'm' : '');
    if (allowBare) {
      m = s.match(KEY_BARE);
      if (m) return fmtKey(m[1], m[2], null);
    }
    return null;
  }

  const MELODIC = new Set(['bass', 'synth', 'instruments', 'vocal']);

  // Названия издателей и сайтов ничего не говорят о звуке ("Boom Library" — не взрыв).
  const VENDORS = /boom\s*library|\bboom\d+(_\d+)?|boom\s*one|krotos|soundmorph|blastwave(\s*fx)?|sound\s*ideas|sfx\s*producer|epidemic|artlist|stock\s*sound|y2mate(\.com)?|rutracker(\.org)?|zapsplat|freesound|pixabay|soundsnap|pro\s*sound\s*effects|just\s*sound\s*effects|^es_|\bes_/gi;
  function stripVendors(text) {
    return String(text).replace(VENDORS, ' ');
  }

  // Жанровые паки («Magic Bundle», «Мистика, ужасы», «Memes»): папка важнее отдельных слов в имени,
  // иначе «Fire Spell» из магической библиотеки уедет в «Природу».
  const GENRE = new Set(['scifi', 'horror', 'cartoon']);

  // Главная функция: путь относительно корня библиотеки -> категория, тип, BPM, тональность.
  // segments: ["Drums", "Kicks", "Kick_01.wav"], последний элемент — имя файла.
  function classify(segments, durationSec) {
    const fileName = segments[segments.length - 1];
    const folders = segments.slice(0, -1);
    const scores = new Map();
    const add = (id, w) => scores.set(id, (scores.get(id) || 0) + w);

    const scoreText = (text, weight, isFolder) => {
      text = stripVendors(text);
      const n = normalize(text).replace(/[_\-.]+/g, ' ');
      for (const [ph, id] of phrases) if (n.includes(ph)) add(id, weight);
      const best = new Map();
      for (const tok of tokenize(text)) {
        const w = WEAK.has(tok) ? weight * 0.35 : weight;
        for (const id of categoriesForToken(tok)) if ((best.get(id) || 0) < w) best.set(id, w);
      }
      for (const [id, w] of best) add(id, isFolder && GENRE.has(id) && w >= weight ? w + 3 : w);
    };

    scoreText(fileName, 3);
    // Ближайшая папка весит больше дальних.
    folders.forEach((f, i) => scoreText(f, 1 + (i + 1) / folders.length, true));

    // Подкатегория тянет за собой родителя.
    for (const [id, s] of [...scores]) {
      const p = BY_ID[id].parent;
      if (p) add(p, s * 0.5);
    }

    let best = 'other';
    let bestScore = 0;
    for (const [id, s] of scores) {
      // При равенстве предпочитаем более узкую подкатегорию.
      const adj = s + (BY_ID[id].parent ? 0.01 : 0);
      if (adj > bestScore) { best = id; bestScore = adj; }
    }

    // Если победила общая категория, но есть сигнал подкатегории ("Эффекты/Свуш"), берём подкатегорию.
    if (!BY_ID[best].parent) {
      let bestChild = null, childScore = 0;
      for (const [id, s] of scores) {
        if (BY_ID[id].parent === best && s > childScore) { bestChild = id; childScore = s; }
      }
      if (bestChild) best = bestChild;
    }

    const lowerAll = normalize(segments.join(' '));
    const bpm = detectBpm(fileName);
    const isLoop = /loop|луп|петля|break|брейк|groove|грув|\bbeat\b/.test(lowerAll) || bpm !== null;
    let type;
    if (isLoop) type = 'loop';
    else if (durationSec != null && durationSec < 3.5) type = 'oneshot';
    else if (/one.?shot|ваншот|oneshot|hit|single/.test(lowerAll)) type = 'oneshot';
    else if (durationSec != null && durationSec >= 20) type = 'long';
    else type = durationSec != null ? 'oneshot' : 'unknown';

    const cat = BY_ID[best];
    return {
      cat: cat.parent || cat.id,
      sub: cat.parent ? cat.id : null,
      type,
      bpm,
      key: detectKey(fileName, MELODIC.has(cat.parent || cat.id)),
    };
  }

  // Для поиска: какие категории означает слово из строки поиска ("бочка" -> kick).
  function categoriesForQueryWord(word) {
    if (normalize(word).length < 2) return new Set();
    return categoriesForToken(word);
  }

  function searchForms(word) {
    const n = normalize(word);
    const forms = new Set([n]);
    if (CYR.test(n)) forms.add(translit(n));
    return [...forms];
  }

  return {
    RULES_VERSION,
    CATEGORIES,
    BY_ID,
    classify,
    tokenize,
    translit,
    normalize,
    detectBpm,
    detectKey,
    categoriesForQueryWord,
    searchForms,
    synonymForms,
    splitCompound,
  };
});
