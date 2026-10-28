/**
 * Compact built-in emoji set for the composer's emoji picker. Each line is
 * `emoji name: extra keywords`. Kept in its own module so bundlers drop it
 * when no picker is used.
 */

export const EMOJI_CATEGORIES = [
  "smileys",
  "people",
  "nature",
  "food",
  "activities",
  "travel",
  "objects",
  "symbols",
  "flags",
] as const;

export type EmojiCategory = (typeof EMOJI_CATEGORIES)[number];

export const EMOJI_SOURCE: Readonly<Record<EmojiCategory, string>> = {
  smileys: `😀 grinning face: smile happy
😃 grinning face with big eyes: smile happy joy
😄 grinning face with smiling eyes: smile happy laugh
😁 beaming face: grin smile teeth
😆 grinning squinting face: laugh happy
😅 grinning face with sweat: relief nervous
🤣 rolling on the floor laughing: lol rofl
😂 face with tears of joy: lol laugh cry
🙂 slightly smiling face: smile
🙃 upside-down face: silly sarcasm
😉 winking face: wink flirt
😊 smiling face with smiling eyes: blush happy
😇 smiling face with halo: angel innocent
🥰 smiling face with hearts: love adore
😍 smiling face with heart-eyes: love crush
🤩 star-struck: wow amazing
😘 face blowing a kiss: kiss love
😋 face savoring food: yum tasty
😛 face with tongue: playful
😜 winking face with tongue: crazy playful
🤪 zany face: crazy goofy
🤑 money-mouth face: rich money
🤗 smiling face with open hands: hug
🤭 face with hand over mouth: oops giggle
🤫 shushing face: quiet secret
🤔 thinking face: hmm think
🤨 face with raised eyebrow: suspicious doubt
😐 neutral face: meh
😶 face without mouth: speechless
😏 smirking face: smirk smug
😒 unamused face: meh annoyed
🙄 face with rolling eyes: eyeroll whatever
😬 grimacing face: awkward nervous
😌 relieved face: calm relief
😔 pensive face: sad thoughtful
😴 sleeping face: sleep zzz tired
😷 face with medical mask: sick ill
🤒 face with thermometer: sick fever
🤢 nauseated face: sick gross
🥵 hot face: heat sweat
🥶 cold face: freezing
🤯 exploding head: mind blown shock
🥳 partying face: party celebrate birthday
😎 smiling face with sunglasses: cool
🤓 nerd face: geek
🧐 face with monocle: inspect curious
😕 confused face: unsure
😟 worried face: concerned
🙁 slightly frowning face: sad
😮 face with open mouth: surprised wow
😲 astonished face: shocked
😳 flushed face: embarrassed
🥺 pleading face: puppy eyes please
😨 fearful face: scared
😰 anxious face with sweat: nervous
😢 crying face: sad tear
😭 loudly crying face: sob sad
😱 face screaming in fear: scream shock
😞 disappointed face: sad
😩 weary face: tired frustrated
🥱 yawning face: bored tired
😤 face with steam from nose: frustrated triumph
😡 enraged face: angry mad
🤬 face with symbols on mouth: swear angry
😈 smiling face with horns: devil
💀 skull: dead lol
💩 pile of poo: poop
🤡 clown face: clown
👻 ghost: halloween spooky
👽 alien: ufo space
🤖 robot: bot
😹 cat with tears of joy: cat laugh
😻 smiling cat with heart-eyes: cat love
🙈 see-no-evil monkey: monkey shy
🙊 speak-no-evil monkey: monkey oops
💋 kiss mark: lips
💯 hundred points: perfect score 100
💥 collision: boom
💨 dashing away: fast wind
💬 speech balloon: chat message comment
💭 thought balloon: think
💤 zzz: sleep`,
  people: `👋 waving hand: hello hi bye wave
✋ raised hand: high five stop
👌 ok hand: okay perfect
✌️ victory hand: peace
🤞 crossed fingers: luck hope
🤙 call me hand: shaka phone
☝️ index pointing up: one
👍 thumbs up: like yes approve good
👎 thumbs down: dislike no bad
👊 oncoming fist: punch bump
👏 clapping hands: applause bravo clap
🙌 raising hands: hooray celebrate
🤝 handshake: deal agreement
🙏 folded hands: please thanks pray
💪 flexed biceps: strong muscle
🧠 brain: smart
👀 eyes: look see watching
👶 baby: child
🙅 person gesturing no: no stop
🙋 person raising hand: question hello
🤦 person facepalming: facepalm ugh
🤷 person shrugging: shrug dunno whatever
🧑‍💻 technologist: developer coder computer
🦸 superhero: hero
🎅 santa claus: christmas
💃 woman dancing: dance party
🕺 man dancing: dance party
🧘 person in lotus position: yoga meditate
🗣️ speaking head: talk speak
👤 bust in silhouette: user profile
👥 busts in silhouette: users group`,
  nature: `🐶 dog face: puppy pet
🐱 cat face: kitten pet
🐰 rabbit face: bunny
🦊 fox: animal
🐻 bear: animal
🐼 panda: animal
🐯 tiger face: animal
🦁 lion: animal king
🐷 pig face: animal
🐸 frog: animal
🐔 chicken: bird
🐧 penguin: bird
🐦 bird: tweet
🦉 owl: bird night
🦄 unicorn: magic
🐝 honeybee: bee insect
🦋 butterfly: insect
🐢 turtle: slow
🐙 octopus: sea
🐬 dolphin: sea
🐳 spouting whale: whale sea
🐘 elephant: animal
🐾 paw prints: pet
💐 bouquet: flowers
🌸 cherry blossom: flower spring
🌹 rose: flower love
🌺 hibiscus: flower
🌻 sunflower: flower
🌷 tulip: flower
🌱 seedling: plant grow
🪴 potted plant: plant
🌳 deciduous tree: tree
🌴 palm tree: beach tropical
🌵 cactus: desert
🍀 four leaf clover: luck
🍁 maple leaf: autumn fall
🍂 fallen leaf: autumn
🌍 globe showing europe-africa: earth world
🌙 crescent moon: night
🌕 full moon: night
⭐ star: favorite
🌟 glowing star: sparkle
✨ sparkles: magic shiny new
⚡ high voltage: lightning zap
🔥 fire: hot lit flame
🌈 rainbow: pride
☀️ sun: sunny weather
⛅ sun behind cloud: weather
☁️ cloud: weather
🌧️ cloud with rain: rain weather
❄️ snowflake: cold winter
🌊 water wave: ocean sea
💧 droplet: water`,
  food: `🍏 green apple: fruit
🍎 red apple: fruit
🍊 tangerine: orange fruit
🍋 lemon: fruit sour
🍌 banana: fruit
🍉 watermelon: fruit summer
🍇 grapes: fruit
🍓 strawberry: fruit
🍑 peach: fruit
🥭 mango: fruit
🍍 pineapple: fruit
🍅 tomato: vegetable
🥑 avocado: vegetable
🥦 broccoli: vegetable
🥕 carrot: vegetable
🌶️ hot pepper: spicy
🥐 croissant: bread breakfast
🍞 bread: loaf
🧀 cheese wedge: cheese
🥚 egg: breakfast
🍳 cooking: fried egg breakfast
🥞 pancakes: breakfast
🥓 bacon: breakfast
🍔 hamburger: burger fast food
🍟 french fries: fries chips
🍕 pizza: slice
🥪 sandwich: lunch
🌮 taco: mexican
🥗 green salad: salad healthy
🍝 spaghetti: pasta
🍜 steaming bowl: ramen noodles
🍣 sushi: japanese
🍦 soft ice cream: dessert
🍩 doughnut: donut dessert
🍪 cookie: dessert
🎂 birthday cake: party
🍰 shortcake: cake dessert
🧁 cupcake: dessert
🍫 chocolate bar: dessert
🍿 popcorn: movie
☕ hot beverage: coffee tea
🍵 teacup without handle: tea
🧋 bubble tea: boba
🥤 cup with straw: soda drink
🍺 beer mug: beer drink
🍻 clinking beer mugs: cheers drinks
🥂 clinking glasses: cheers celebrate
🍷 wine glass: wine drink
🍸 cocktail glass: drink
🍾 bottle with popping cork: champagne celebrate
🍽️ fork and knife with plate: dinner meal`,
  activities: `⚽ soccer ball: football sport
🏀 basketball: sport
🎾 tennis: sport
🥊 boxing glove: sport fight
⛳ flag in hole: golf
🏋️ person lifting weights: gym workout
🚴 person biking: bike cycling
🏊 person swimming: swim
🏄 person surfing: surf
🏆 trophy: win award champion
🥇 1st place medal: gold winner
🏅 sports medal: award
🎟️ admission tickets: event
🎭 performing arts: theater
🎨 artist palette: art paint
🎬 clapper board: movie film
🎤 microphone: sing karaoke
🎧 headphone: music listen
🎸 guitar: music rock
🎲 game die: dice game
🎯 bullseye: target goal
🎮 video game: controller gaming
🧩 puzzle piece: jigsaw
🎉 party popper: celebrate congrats tada
🎊 confetti ball: celebrate party
🎈 balloon: party birthday
🎁 wrapped gift: present birthday
🎄 christmas tree: holiday
🎃 jack-o-lantern: halloween
🎆 fireworks: celebrate`,
  travel: `🚗 automobile: car drive
🚕 taxi: cab
🚌 bus: transit
🚑 ambulance: emergency
🚚 delivery truck: shipping delivery
🚲 bicycle: bike
🚨 police car light: siren alert
⛵ sailboat: boat
🚢 ship: boat
✈️ airplane: flight travel plane
🛫 airplane departure: flight takeoff
🛬 airplane arrival: flight landing
🚁 helicopter: flight
🚀 rocket: launch space ship
🚆 train: rail
🗺️ world map: travel
🏔️ snow-capped mountain: mountain
⛰️ mountain: hike
🏖️ beach with umbrella: vacation
🏠 house: home
🏢 office building: work
🏥 hospital: health
🏦 bank: money
🏨 hotel: travel
🏫 school: education
🏰 castle: palace
🌅 sunrise: morning
🌇 sunset: evening
⏰ alarm clock: time wake
⏳ hourglass not done: time wait loading`,
  objects: `⌚ watch: time
📱 mobile phone: cell smartphone
💻 laptop: computer
🖥️ desktop computer: computer
📷 camera: photo picture
📸 camera with flash: photo
📞 telephone receiver: call phone
📺 television: tv
🎙️ studio microphone: podcast record
⏱️ stopwatch: timer
🔋 battery: power
🔌 electric plug: power
💡 light bulb: idea
💸 money with wings: spend
💵 dollar banknote: money cash
💰 money bag: rich
💳 credit card: payment card
🧾 receipt: invoice bill
💎 gem stone: diamond jewel
⚖️ balance scale: law justice
🔧 wrench: tool fix
🔨 hammer: tool build
🛠️ hammer and wrench: tools settings
⚙️ gear: settings cog
💣 bomb: explode
🛡️ shield: protect security
💊 pill: medicine
💉 syringe: vaccine shot
🛒 shopping cart: shop buy
🛋️ couch and lamp: sofa home
🔑 key: lock password
🔒 locked: secure private
🔔 bell: notification
📣 megaphone: announce
📢 loudspeaker: announce
📦 package: box shipping delivery
✉️ envelope: email mail letter
📧 e-mail: email
📝 memo: note write
📄 page facing up: document file
📊 bar chart: stats graph
📈 chart increasing: growth trend up
📉 chart decreasing: decline trend down
📅 calendar: date schedule
🗓️ spiral calendar: date schedule
📋 clipboard: list
📁 file folder: directory
📌 pushpin: pin
📍 round pushpin: location pin
📎 paperclip: attach attachment
✂️ scissors: cut
✏️ pencil: write edit
🔎 magnifying glass tilted right: search find
📚 books: read library
🔗 link: url chain
🏷️ label: tag
🎓 graduation cap: school education
🕶️ sunglasses: cool
👕 t-shirt: clothes
👗 dress: clothes
👟 running shoe: sneaker
🎒 backpack: bag school
💼 briefcase: work business
🧳 luggage: travel suitcase
💍 ring: wedding engagement
👑 crown: king queen royal`,
  symbols: `❤️ red heart: love like
🧡 orange heart: love
💛 yellow heart: love
💚 green heart: love
💙 blue heart: love
💜 purple heart: love
🖤 black heart: love
🤍 white heart: love
💔 broken heart: sad breakup
💕 two hearts: love
💖 sparkling heart: love
💘 heart with arrow: love cupid
💝 heart with ribbon: love gift
✅ check mark button: done yes ok
✔️ check mark: done yes
☑️ check box with check: done
❌ cross mark: no wrong cancel
➕ plus: add
➖ minus: subtract
❓ red question mark: question
❗ red exclamation mark: important
‼️ double exclamation mark: important
⁉️ exclamation question mark: what
⚠️ warning: caution alert
🚫 prohibited: forbidden no
⛔ no entry: forbidden stop
💢 anger symbol: angry
♻️ recycling symbol: recycle
🆗 ok button: okay
🆕 new button: new
⬆️ up arrow: up
⬇️ down arrow: down
⬅️ left arrow: left
➡️ right arrow: right
↩️ right arrow curving left: reply return
↪️ left arrow curving right: forward
🔄 counterclockwise arrows button: refresh sync
🔁 repeat button: repeat loop
▶️ play button: play start
⏸️ pause button: pause
⏹️ stop button: stop
⏩ fast-forward button: skip
🔊 speaker high volume: sound loud
🔇 muted speaker: mute
🎵 musical note: music
🎶 musical notes: music
💲 heavy dollar sign: money
1️⃣ keycap 1: one number
ℹ️ information: info
🔴 red circle: dot
🟢 green circle: dot online
🔵 blue circle: dot
⚫ black circle: dot
☮️ peace symbol: peace
☯️ yin yang: balance
♿ wheelchair symbol: accessibility
📡 satellite antenna: wifi signal
📶 antenna bars: signal
🌐 globe with meridians: web internet
🆘 sos button: help emergency
🏁 chequered flag: finish race`,
  flags: `🏳️ white flag: surrender
🚩 triangular flag: red flag
🏳️‍🌈 rainbow flag: pride lgbt
🇪🇺 flag european union: eu
🇦🇪 flag united arab emirates: uae
🇦🇺 flag australia: au
🇧🇷 flag brazil: br
🇨🇦 flag canada: ca
🇨🇳 flag china: cn
🇩🇪 flag germany: de
🇪🇬 flag egypt: eg
🇪🇸 flag spain: es
🇫🇷 flag france: fr
🇬🇧 flag united kingdom: uk gb britain
🇮🇱 flag israel: il
🇮🇳 flag india: in
🇮🇹 flag italy: it
🇯🇵 flag japan: jp
🇰🇷 flag south korea: kr
🇲🇽 flag mexico: mx
🇳🇬 flag nigeria: ng
🇳🇱 flag netherlands: nl
🇵🇸 flag palestinian territories: ps palestine
🇸🇦 flag saudi arabia: sa ksa
🇹🇷 flag turkey: tr türkiye
🇺🇦 flag ukraine: ua
🇺🇸 flag united states: us usa america
🇿🇦 flag south africa: za`,
};
