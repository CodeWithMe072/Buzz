const EmojiPanel = (() => {
  const EMOJI_DATA = {
    "Smileys": ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🫣", "🤭", "🫢", "🫡", "🤫", "🫠", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "😵‍💫", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "🥹", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖"],
    "Gestures": ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋"],
    "Animals": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🐐", "🦌", "🐕", "🐈", "🐓", "🦃", "🦚", "🦜", "🕊️", "🐇", "🦝", "🦡", "🦦", "🦥", "🐿️", "🦔"],
    "Food": ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥔", "🥕", "🌽", "🌶️", "🫑", "🥐", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🥞", "🥓", "🥩", "🍗", "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🌮", "🌯", "🥘", "🍲", "🥣", "🥗", "🍿", "🍱", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍠", "🍢", "🍣", "🍤", "🍥", "🍡", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🍫", "🍬", "🍭", "🍮", "🍯", "🍼", "🥛", "☕", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧋", "🧃", "🧉", "🧊"],
    "Activities": ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🗜️", "🏸", "🏒", "🏑", "🥍", "🏏", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🏋️", "🤼", "🤸", "⛹️", "🤺", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚴", "🚵", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🎫", "🎟️", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮", "🎰"],
    "Travel": ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🛵", "🏍️", "🛺", "🚲", "🛴", "🚏", "🚨", "🚇", "🚀", "🛸", "🚁", "✈️", "🛫", "🛬", "🚢", "⛵", "⚓", "🗺️", "🗼", "🗽", "🏰", "🏯", "🏟️", "🎡", "🎢", "🎠", "⛲", "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🏕️", "⛺", "🏠", "🏡", "🏢", "🏣", "🏥", "🏦", "🏨", "🏪", "🏫", "🏬", "🏭", "教堂", "清真寺", "寺庙", "神社", "🕋", "🏛️", "🛤️", "路", "🌅", "🌄", "🌃", "🏙️", "🌆", "🌇"],
    "Objects": ["⌚", "📱", "💻", "🖥️", "🖨️", "🖱️", "🖲️", "💾", "💿", "DVD", "📼", "📷", "📸", "📹", "🎥", "📽️", "🎞️", "电话", "📟", "📠", "电视", "收音机", "🎙️", "🎚️", "🎛️", "🧭", "⏱️", "⏲️", "⏰", "⏳", "⌛", "🔋", "🔌", "💡", "手电筒", "蜡烛", "垃圾桶", "镜子", "香皂", "安全别针", "扫帚", "篮子", "卫生纸", "皂", "海绵", "浴缸", "淋浴", "钥匙", "🗝️", "锤子", "斧头", "镐", "⚒️", "🛠️", "剑", "盾", "扳手", "螺丝", "齿轮", "天平", "锁链", "拐杖", "磁铁", "枪", "炸弹", "砖", "木头", "水晶球", "念珠", "💈", "眼罩", "花瓶"],
    "Symbols": ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣", "💕", "💞", "💓", "💗", "💖", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "🔀", "🔁", "🔂", "▶️", "⏩", "⏭️", "⏸️", "⏹️", "⏺️", "⏏️", "🎦", "🔅", "🔆", "📶", "📳", "📴", "➕", "➖", "➗", "✖️", "♾️", "💲", "💱", "⚠️", "🚸", "⛔", "🚫", "🚳", "🚭", "🚯", "🚱", "🚷", "🚹", "🚺", "🚼", "🚻", "🚮", "🅰️", "🆃", "🆄", "🆅", "🆆", "🆇", "🆈", "🆉", "💯"],
    "Flags": ["🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️"]
  };

  const CATEGORY_ICONS = {
    "Smileys": "😀",
    "Gestures": "👍",
    "Animals": "🐶",
    "Food": "🍔",
    "Activities": "⚽",
    "Travel": "🌇",
    "Objects": "💡",
    "Symbols": "❤️",
    "Flags": "🏳️"
  };

  const STICKERS_DATA = [
  {
    "id": "sticker_1",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f970/512.webp",
    "name": "Hearts Face"
  },
  {
    "id": "sticker_2",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/512.webp",
    "name": "Heart Eyes"
  },
  {
    "id": "sticker_3",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f618/512.webp",
    "name": "Blow Kiss"
  },
  {
    "id": "sticker_4",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.webp",
    "name": "Red Heart"
  },
  {
    "id": "sticker_5",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f498/512.webp",
    "name": "Heart Arrow"
  },
  {
    "id": "sticker_6",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f495/512.webp",
    "name": "Two Hearts"
  },
  {
    "id": "sticker_7",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1faf6/512.webp",
    "name": "Heart Hands"
  },
  {
    "id": "sticker_8",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f48b/512.webp",
    "name": "Kiss Mark"
  },
  {
    "id": "sticker_9",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f917/512.webp",
    "name": "Hugging"
  },
  {
    "id": "sticker_10",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f49d/512.webp",
    "name": "Gift Heart"
  },
  {
    "id": "sticker_11",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f496/512.webp",
    "name": "Sparkling Heart"
  },
  {
    "id": "sticker_12",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f497/512.webp",
    "name": "Growing Heart"
  },
  {
    "id": "sticker_13",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f493/512.webp",
    "name": "Beating Heart"
  },
  {
    "id": "sticker_14",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f49e/512.webp",
    "name": "Revolving Hearts"
  },
  {
    "id": "sticker_15",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f48c/512.webp",
    "name": "Love Letter"
  },
  {
    "id": "sticker_16",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f339/512.webp",
    "name": "Rose"
  },
  {
    "id": "sticker_17",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f48d/512.webp",
    "name": "Ring"
  },
  {
    "id": "sticker_18",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f9ae/512.webp",
    "name": "Teddy Bear"
  },
  {
    "id": "sticker_19",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f49f/512.webp",
    "name": "Heart Decoration"
  },
  {
    "id": "sticker_20",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f49c/512.webp",
    "name": "Purple Heart"
  },
  {
    "id": "sticker_21",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp",
    "name": "Laughing"
  },
  {
    "id": "sticker_22",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f923/512.webp",
    "name": "Rofl"
  },
  {
    "id": "sticker_23",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f92a/512.webp",
    "name": "Zany Face"
  },
  {
    "id": "sticker_24",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f61c/512.webp",
    "name": "Crazy Wink"
  },
  {
    "id": "sticker_25",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f60f/512.webp",
    "name": "Smirking"
  },
  {
    "id": "sticker_26",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1fae0/512.webp",
    "name": "Melting"
  },
  {
    "id": "sticker_27",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f929/512.webp",
    "name": "Star Eyes"
  },
  {
    "id": "sticker_28",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f973/512.webp",
    "name": "Party"
  },
  {
    "id": "sticker_29",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f60e/512.webp",
    "name": "Cool"
  },
  {
    "id": "sticker_30",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f600/512.webp",
    "name": "Smile"
  },
  {
    "id": "sticker_31",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f603/512.webp",
    "name": "Grinning"
  },
  {
    "id": "sticker_32",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f604/512.webp",
    "name": "Smiling Laugh"
  },
  {
    "id": "sticker_33",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f601/512.webp",
    "name": "Beaming"
  },
  {
    "id": "sticker_34",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f606/512.webp",
    "name": "Squinting"
  },
  {
    "id": "sticker_35",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f605/512.webp",
    "name": "Sweat Grin"
  },
  {
    "id": "sticker_36",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f642/512.webp",
    "name": "Slight Smile"
  },
  {
    "id": "sticker_37",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f643/512.webp",
    "name": "Upside Down"
  },
  {
    "id": "sticker_38",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f609/512.webp",
    "name": "Wink"
  },
  {
    "id": "sticker_39",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f60a/512.webp",
    "name": "Smiling Eyes"
  },
  {
    "id": "sticker_40",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f911/512.webp",
    "name": "Money Mouth"
  },
  {
    "id": "sticker_41",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1fae3/512.webp",
    "name": "Peeking"
  },
  {
    "id": "sticker_42",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f92d/512.webp",
    "name": "Hand over Mouth"
  },
  {
    "id": "sticker_43",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1fae2/512.webp",
    "name": "Open Mouth"
  },
  {
    "id": "sticker_44",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f913/512.webp",
    "name": "Nerd"
  },
  {
    "id": "sticker_45",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f9d0/512.webp",
    "name": "Monocle"
  },
  {
    "id": "sticker_46",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f621/512.webp",
    "name": "Angry"
  },
  {
    "id": "sticker_47",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f620/512.webp",
    "name": "Pouting"
  },
  {
    "id": "sticker_48",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f92c/512.webp",
    "name": "Swearing"
  },
  {
    "id": "sticker_49",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f92f/512.webp",
    "name": "Exploding"
  },
  {
    "id": "sticker_50",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f975/512.webp",
    "name": "Furious Hot"
  },
  {
    "id": "sticker_51",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f62d/512.webp",
    "name": "Sobbing"
  },
  {
    "id": "sticker_52",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f631/512.webp",
    "name": "Screaming"
  },
  {
    "id": "sticker_53",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f622/512.webp",
    "name": "Crying"
  },
  {
    "id": "sticker_54",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f61f/512.webp",
    "name": "Worried"
  },
  {
    "id": "sticker_55",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f615/512.webp",
    "name": "Confused"
  },
  {
    "id": "sticker_56",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f61e/512.webp",
    "name": "Disappointed"
  },
  {
    "id": "sticker_57",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f613/512.webp",
    "name": "Sweat Frown"
  },
  {
    "id": "sticker_58",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f629/512.webp",
    "name": "Weary"
  },
  {
    "id": "sticker_59",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f62b/512.webp",
    "name": "Tired"
  },
  {
    "id": "sticker_60",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f971/512.webp",
    "name": "Yawning"
  },
  {
    "id": "sticker_61",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f612/512.webp",
    "name": "Unamused"
  },
  {
    "id": "sticker_62",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f614/512.webp",
    "name": "Pensive"
  },
  {
    "id": "sticker_63",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f62a/512.webp",
    "name": "Sleepy"
  },
  {
    "id": "sticker_64",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f634/512.webp",
    "name": "Sleeping"
  },
  {
    "id": "sticker_65",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f976/512.webp",
    "name": "Cold Face"
  },
  {
    "id": "sticker_66",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f635/512.webp",
    "name": "Dizzy"
  },
  {
    "id": "sticker_67",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f626/512.webp",
    "name": "Frowning Open"
  },
  {
    "id": "sticker_68",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f616/512.webp",
    "name": "Confounded"
  },
  {
    "id": "sticker_69",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f623/512.webp",
    "name": "Persevering"
  },
  {
    "id": "sticker_70",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f624/512.webp",
    "name": "Steam Nose"
  },
  {
    "id": "sticker_71",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f436/512.webp",
    "name": "Dog Face"
  },
  {
    "id": "sticker_72",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f431/512.webp",
    "name": "Cat Face"
  },
  {
    "id": "sticker_73",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f42f/512.webp",
    "name": "Tiger Face"
  },
  {
    "id": "sticker_74",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f435/512.webp",
    "name": "Monkey Face"
  },
  {
    "id": "sticker_75",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f438/512.webp",
    "name": "Frog Face"
  },
  {
    "id": "sticker_76",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f42c/512.webp",
    "name": "Dolphin"
  },
  {
    "id": "sticker_77",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f9a0/512.webp",
    "name": "Microbe"
  },
  {
    "id": "sticker_78",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f332/512.webp",
    "name": "Pine Tree"
  },
  {
    "id": "sticker_79",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.webp",
    "name": "Fire"
  },
  {
    "id": "sticker_80",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f47b/512.webp",
    "name": "Ghost"
  },
  {
    "id": "sticker_81",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f47d/512.webp",
    "name": "Alien"
  },
  {
    "id": "sticker_82",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f47e/512.webp",
    "name": "Monster"
  },
  {
    "id": "sticker_83",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f916/512.webp",
    "name": "Robot"
  },
  {
    "id": "sticker_84",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a9/512.webp",
    "name": "Poop"
  },
  {
    "id": "sticker_85",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f921/512.webp",
    "name": "Clown"
  },
  {
    "id": "sticker_86",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/512.webp",
    "name": "Thumbs Up"
  },
  {
    "id": "sticker_87",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44e/512.webp",
    "name": "Thumbs Down"
  },
  {
    "id": "sticker_88",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44f/512.webp",
    "name": "Clapping"
  },
  {
    "id": "sticker_89",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f64f/512.webp",
    "name": "Praying"
  },
  {
    "id": "sticker_90",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4aa/512.webp",
    "name": "Bicep"
  },
  {
    "id": "sticker_91",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f596/512.webp",
    "name": "Vulcan Salute"
  },
  {
    "id": "sticker_92",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f91e/512.webp",
    "name": "Fingers Crossed"
  },
  {
    "id": "sticker_93",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1faf5/512.webp",
    "name": "Pointing You"
  },
  {
    "id": "sticker_94",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44c/512.webp",
    "name": "OK Hand"
  },
  {
    "id": "sticker_95",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44b/512.webp",
    "name": "Waving Hand"
  },
  {
    "id": "sticker_96",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1fae1/512.webp",
    "name": "Saluting"
  },
  {
    "id": "sticker_97",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f92b/512.webp",
    "name": "Shushing"
  },
  {
    "id": "sticker_98",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/2728/512.webp",
    "name": "Sparkles"
  },
  {
    "id": "sticker_99",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.webp",
    "name": "Party Popper"
  },
  {
    "id": "sticker_100",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f388/512.webp",
    "name": "Balloon"
  },
  {
    "id": "sticker_101",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4af/512.webp",
    "name": "100"
  },
  {
    "id": "sticker_102",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a5/512.webp",
    "name": "Collision"
  },
  {
    "id": "sticker_103",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a4/512.webp",
    "name": "Sleeping Symbol"
  },
  {
    "id": "sticker_104",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4ac/512.webp",
    "name": "Speech Bubble"
  },
  {
    "id": "sticker_105",
    "url": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4bc/512.webp",
    "name": "Briefcase"
  }
]

  const $ = id => document.getElementById(id);
  let userCustomGifs = [];

  function showCustomConfirm(title, message, onConfirm) {
    const modal = $("custom-confirm-modal");
    const titleEl = $("confirm-modal-title");
    const msgEl = $("confirm-modal-message");
    const cancelBtn = $("confirm-modal-cancel-btn");
    const okBtn = $("confirm-modal-ok-btn");

    if (!modal || !titleEl || !msgEl || !cancelBtn || !okBtn) {
      if (confirm(message)) onConfirm();
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.style.display = "flex";

    const close = () => {
      modal.style.display = "none";
    };

    cancelBtn.onclick = close;
    okBtn.onclick = () => {
      close();
      onConfirm();
    };
  }

  function init() {
    const btn = $("emoji-panel-btn");
    const panel = $("custom-emoji-panel");
    if (!btn || !panel) return;

    // Build tabs and grid
    buildTabs();
    buildGrid();
    buildStickers();

    // Rebuild and load navigation tabs initially
    loadCustomGifsAndTrending();

    const scrollToBottom = () => {
      const container = document.getElementById("messages-container");
      if (container) {
        setTimeout(() => {
          container.scrollTop = 99999;
        }, 150); // delay to let layout transition complete
      }
    };

    // Toggle panel
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isActive = panel.classList.toggle("active");
      scrollToBottom();
      if (typeof window.updateInputContainerState === "function") window.updateInputContainerState();
      if (isActive) {
        // Dismiss the virtual keyboard
        const activeInput = document.activeElement;
        if (activeInput && (activeInput.tagName === "INPUT" || activeInput.tagName === "TEXTAREA")) {
          activeInput.blur();
        }
        // Fetch/refresh custom GIFs when the panel opens
        loadCustomGifsAndTrending();
      } else {
        // Refocus message input to show keyboard
        const input = $("message-input");
        if (input) input.focus();
      }
    });

    // Close panel when clicking the input field to type
    const messageInput = $("message-input");
    if (messageInput) {
      messageInput.addEventListener("click", () => {
        if (panel.classList.contains("active")) {
          panel.classList.remove("active");
          scrollToBottom();
          if (typeof window.updateInputContainerState === "function") window.updateInputContainerState();
        }
      });
    }

    // Close on click outside (but not on input or panel elements, nor custom uploader/confirm modals)
    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && e.target !== btn && !e.target.closest("#emoji-panel-btn") && e.target !== messageInput && !e.target.closest("#custom-gif-upload-modal") && !e.target.closest("#custom-confirm-modal")) {
        if (panel.classList.contains("active")) {
          panel.classList.remove("active");
          scrollToBottom();
          if (typeof window.updateInputContainerState === "function") window.updateInputContainerState();
        }
      }
    });

    // Search functionality with debounce for GIFs
    let gifTimeout = null;
    const searchInput = $("emoji-search-input");
    searchInput.addEventListener("input", (e) => {
      const activeNavBtn = document.querySelector(".panel-nav-btn.active");
      if (!activeNavBtn) return;

      const activeTab = activeNavBtn.dataset.panelTab;
      const q = e.target.value.trim();

      if (activeTab === "gifs") {
        clearTimeout(gifTimeout);
        gifTimeout = setTimeout(() => {
          if (q) searchGifs(q); else loadTrendingGifs();
        }, 300);
      } else if (activeTab === "emojis") {
        filterEmojis(q.toLowerCase());
      } else if (activeTab === "custom-section") {
        const sectionName = activeNavBtn.dataset.sectionName;
        filterCustomSectionGifs(sectionName, q);
      }
    });

    // Event delegation for tab clicks in the panel nav
    const panelNav = $("emoji-panel-nav");
    if (panelNav) {
      panelNav.addEventListener("click", (e) => {
        const navBtn = e.target.closest(".panel-nav-btn");
        if (!navBtn) return;

        const targetTab = navBtn.dataset.panelTab;
        const sectionName = navBtn.dataset.sectionName;

        // "+" button opens the upload modal
        if (targetTab === "upload-gif") {
          openUploadModal();
          return;
        }

        // Toggle active class on nav buttons
        panelNav.querySelectorAll(".panel-nav-btn").forEach(b => b.classList.remove("active"));
        navBtn.classList.add("active");

        // Hide all tab contents
        document.querySelectorAll(".emoji-tab-content").forEach(content => {
          content.style.display = "none";
          content.classList.remove("active");
        });

        const searchContainer = $("emoji-search-container");

        // Show selected tab content and update search input
        if (targetTab === "emojis") {
          const content = $("emoji-tab-content-emojis");
          if (content) {
            content.style.display = "flex";
            content.classList.add("active");
          }
          if (searchContainer) {
            searchContainer.style.display = "block";
            if (searchInput) {
              searchInput.value = "";
              searchInput.placeholder = "Search emojis...";
              filterEmojis("");
            }
          }
        } else if (targetTab === "stickers") {
          const content = $("emoji-tab-content-stickers");
          if (content) {
            content.style.display = "flex";
            content.classList.add("active");
          }
          if (searchContainer) {
            searchContainer.style.display = "none";
          }
        } else if (targetTab === "gifs") {
          const content = $("emoji-tab-content-gifs");
          if (content) {
            content.style.display = "flex";
            content.classList.add("active");
          }
          if (searchContainer) {
            searchContainer.style.display = "block";
            if (searchInput) {
              searchInput.value = "";
              searchInput.placeholder = "Search trending GIFs...";
              loadTrendingGifs();
            }
          }
        } else if (targetTab === "custom-section") {
          const content = $("emoji-tab-content-custom-section");
          if (content) {
            content.style.display = "flex";
            content.classList.add("active");
          }
          if (searchContainer) {
            searchContainer.style.display = "block";
            if (searchInput) {
              searchInput.value = "";
              searchInput.placeholder = `Search in ${sectionName}...`;
            }
          }
          renderCustomSectionGifs(sectionName);
        }
      });
    }

    // Prevent propagation so click inside picker doesn't close it
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Custom GIF/ZIP upload modal controls
    const closeModalBtn = $("close-gif-upload-modal");
    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", closeUploadModal);
    }

    const uploadModal = $("custom-gif-upload-modal");
    if (uploadModal) {
      uploadModal.addEventListener("click", (e) => {
        if (e.target === uploadModal) {
          closeUploadModal();
        }
      });
    }

    // Modal file selection and upload handlers
    const gifFileInput = $("custom-gif-file-input");
    const gifSelectBtn = $("custom-gif-select-btn");
    const gifFileName = $("custom-gif-file-name");
    const gifUploadBtn = $("custom-gif-upload-btn");
    const gifSectionInput = $("custom-gif-section-input");
    const gifSectionSelect = $("custom-gif-section-select");
    const gifSectionInputContainer = $("custom-gif-section-input-container");

    if (gifSectionSelect && gifSectionInputContainer) {
      gifSectionSelect.addEventListener("change", () => {
        if (gifSectionSelect.value === "new") {
          gifSectionInputContainer.style.display = "block";
        } else {
          gifSectionInputContainer.style.display = "none";
        }
      });
    }

    if (gifSelectBtn && gifFileInput) {
      gifSelectBtn.addEventListener("click", () => {
        gifFileInput.click();
      });

      gifFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          gifFileName.textContent = file.name;
          gifUploadBtn.disabled = false;
        } else {
          gifFileName.textContent = "No file chosen";
          gifUploadBtn.disabled = true;
        }
      });
    }

    if (gifUploadBtn) {
      gifUploadBtn.addEventListener("click", async () => {
        const file = gifFileInput.files[0];
        if (!file) return;

        let section = "";
        if (gifSectionSelect && gifSectionSelect.value !== "new") {
          section = gifSectionSelect.value;
        } else {
          section = (gifSectionInput.value || "").trim() || "My GIFs";
        }
        
        gifUploadBtn.disabled = true;
        gifUploadBtn.textContent = "Uploading...";

        const formData = new FormData();
        formData.append("file", file);
        formData.append("section", section);

        try {
          const token = TokenStore.getToken();
          const headers = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;

          const uploadRes = await fetch("/api/gifs/upload", {
            method: "POST",
            headers: headers,
            body: formData
          });

          if (uploadRes.ok) {
            const result = await uploadRes.json();
            // Clear inputs & close modal
            gifFileInput.value = "";
            gifFileName.textContent = "No file chosen";
            gifSectionInput.value = "";
            closeUploadModal();
            showToast("Upload successfully completed!", "success");

            // Reload custom GIFs and highlight the newly uploaded/created section tab
            await loadCustomGifsAndTrending(`custom-section-${section}`);
          } else {
            const errResult = await uploadRes.json().catch(() => ({}));
            showToast(errResult.error || "Upload failed", "error");
          }
        } catch (err) {
          console.error("Custom GIF upload error:", err);
          showToast("Upload failed due to connection error", "error");
        } finally {
          gifUploadBtn.disabled = false;
          gifUploadBtn.textContent = "Upload";
        }
      });
    }
  }

  function buildTabs() {
    const tabsContainer = $("emoji-categories-tabs");
    if (!tabsContainer) return;

    tabsContainer.innerHTML = "";
    Object.keys(EMOJI_DATA).forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "emoji-tab-btn";
      btn.type = "button";
      btn.title = cat;
      btn.innerHTML = CATEGORY_ICONS[cat] || "😀";
      btn.addEventListener("click", () => {
        // Clear search first if active
        const searchInput = $("emoji-search-input");
        if (searchInput && searchInput.value) {
          searchInput.value = "";
          filterEmojis("");
        }

        const catHeader = $(`emoji-header-${cat}`);
        if (catHeader) {
          catHeader.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      tabsContainer.appendChild(btn);
    });
  }

  function buildGrid() {
    const gridContainer = $("emoji-grid-container");
    if (!gridContainer) return;

    gridContainer.innerHTML = "";
    Object.entries(EMOJI_DATA).forEach(([cat, list]) => {
      // Category Section
      const section = document.createElement("div");
      section.className = "emoji-category-section";
      section.id = `emoji-section-${cat}`;

      const header = document.createElement("div");
      header.className = "emoji-category-header";
      header.id = `emoji-header-${cat}`;
      header.textContent = cat;
      section.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "emoji-category-grid";

      list.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.className = "emoji-item";
        btn.type = "button";
        btn.textContent = emoji;
        btn.addEventListener("click", () => insertEmoji(emoji));
        grid.appendChild(btn);
      });

      section.appendChild(grid);
      gridContainer.appendChild(section);
    });
  }

  function buildStickers() {
    const container = $("sticker-grid-container");
    if (!container) return;
    container.innerHTML = "";
    STICKERS_DATA.forEach(sticker => {
      const btn = document.createElement("button");
      btn.className = "sticker-item-btn";
      btn.type = "button";
      btn.title = sticker.name;
      const staticUrl = (sticker.url || "").replace(".webp", ".png");
      btn.innerHTML = `<img src="${staticUrl}" alt="${sticker.name}" loading="lazy">`;
      btn.addEventListener("click", () => sendSpecialTypeMessage("sticker", sticker.url));
      container.appendChild(btn);
    });
  }

  let customGifsLoaded = false;
  async function loadCustomGifsAndTrending(activeTabName, forceRefresh = false) {
    if (customGifsLoaded && !activeTabName && !forceRefresh) {
      return;
    }
    customGifsLoaded = true;
    try {
      const token = TokenStore.getToken();
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const customRes = await fetch(`/api/gifs/custom`, { headers });
      if (customRes.ok) {
        const customJson = await customRes.json();
        userCustomGifs = customJson.data || [];
      }
    } catch (err) {
      console.error("Failed to load custom GIFs:", err);
    }

    // Determine active tab to keep or set
    let tabToSet = activeTabName;
    if (!tabToSet) {
      const activeNavBtn = document.querySelector(".panel-nav-btn.active");
      if (activeNavBtn) {
        const tab = activeNavBtn.dataset.panelTab;
        if (tab === "custom-section") {
          tabToSet = `custom-section-${activeNavBtn.dataset.sectionName}`;
        } else {
          tabToSet = tab;
        }
      } else {
        tabToSet = "emojis";
      }
    }

    updateNavigationTabs(tabToSet);

    // If the active tab was a custom section, render its GIFs
    if (tabToSet.startsWith("custom-section-")) {
      const secName = tabToSet.substring("custom-section-".length);
      // Toggle tab contents
      document.querySelectorAll(".emoji-tab-content").forEach(content => {
        content.style.display = "none";
        content.classList.remove("active");
      });
      const content = $("emoji-tab-content-custom-section");
      if (content) {
        content.style.display = "flex";
        content.classList.add("active");
      }
      renderCustomSectionGifs(secName);
    } else if (tabToSet === "gifs") {
      loadTrendingGifs();
    }
  }

  function updateNavigationTabs(activeTabName = "emojis") {
    const nav = $("emoji-panel-nav");
    if (!nav) return;

    // Get unique section names from userCustomGifs
    const sections = [];
    userCustomGifs.forEach(gif => {
      const sec = gif.section || "My GIFs";
      if (!sections.includes(sec)) {
        sections.push(sec);
      }
    });

    nav.innerHTML = "";

    // 1. Emojis
    const emojisBtn = document.createElement("button");
    emojisBtn.type = "button";
    emojisBtn.className = "panel-nav-btn" + (activeTabName === "emojis" ? " active" : "");
    emojisBtn.dataset.panelTab = "emojis";
    emojisBtn.textContent = "😃 Emojis";
    nav.appendChild(emojisBtn);

    // 2. Stickers
    const stickersBtn = document.createElement("button");
    stickersBtn.type = "button";
    stickersBtn.className = "panel-nav-btn" + (activeTabName === "stickers" ? " active" : "");
    stickersBtn.dataset.panelTab = "stickers";
    stickersBtn.textContent = "🖼️ Stickers";
    nav.appendChild(stickersBtn);

    // 3. GIFs
    const gifsBtn = document.createElement("button");
    gifsBtn.type = "button";
    gifsBtn.className = "panel-nav-btn" + (activeTabName === "gifs" ? " active" : "");
    gifsBtn.dataset.panelTab = "gifs";
    gifsBtn.textContent = "🎬 GIFs";
    nav.appendChild(gifsBtn);

    // 4. Custom Section Tabs
    sections.forEach(secName => {
      const secBtn = document.createElement("button");
      secBtn.type = "button";
      secBtn.className = "panel-nav-btn" + (activeTabName === `custom-section-${secName}` ? " active" : "");
      secBtn.dataset.panelTab = "custom-section";
      secBtn.dataset.sectionName = secName;
      secBtn.textContent = `📂 ${secName}`;
      nav.appendChild(secBtn);
    });

    // 5. Upload Tab (+)
    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.className = "panel-nav-btn" + (activeTabName === "upload-gif" ? " active" : "");
    uploadBtn.dataset.panelTab = "upload-gif";
    uploadBtn.textContent = "➕";
    uploadBtn.title = "Upload Custom GIF";
    nav.appendChild(uploadBtn);
  }

  async function loadTrendingGifs() {
    const container = $("gif-grid-container");
    if (!container) return;
    container.innerHTML = `<div class="emoji-no-results">Loading trending GIFs...</div>`;
    try {
      const res = await getGifs();
      renderGifs(res.Data.data);
    } catch (err) {
      container.innerHTML = `<div class="emoji-no-results">Failed to load GIFs</div>`;
    }
  }

  async function searchGifs(query) {
    const container = $("gif-grid-container");
    if (!container) return;
    container.innerHTML = `<div class="emoji-no-results">Searching...</div>`;
    try {
      const res = await getSearchGif(query);
      renderGifs(res.Data.data, query);
    } catch (err) {
      container.innerHTML = `<div class="emoji-no-results">Failed to search GIFs</div>`;
    }
  }

  function renderGifs(gifs, searchQuery = "") {
    const container = $("gif-grid-container");
    if (!container) return;
    container.innerHTML = "";

    if (gifs && gifs.length > 0) {
      const header = document.createElement("div");
      header.className = "gif-category-header";
      header.textContent = searchQuery ? `Results for "${searchQuery}"` : "Trending GIFs";
      container.appendChild(header);

      gifs.forEach(gif => {
        const url = gif.images.fixed_height_downsampled?.url || gif.images.fixed_height?.url;
        if (!url) return;
        const btn = document.createElement("button");
        btn.className = "gif-item-btn";
        btn.type = "button";
        btn.innerHTML = `<img src="${url}" alt="GIF" loading="lazy">`;
        btn.addEventListener("click", () => sendSpecialTypeMessage("gif", url));
        container.appendChild(btn);
      });
    } else {
      container.innerHTML = `<div class="emoji-no-results">No GIFs found</div>`;
    }
  }

  function renderCustomSectionGifs(sectionName, query = "") {
    const container = $("custom-section-grid-container");
    if (!container) return;
    container.innerHTML = "";

    const titleEl = $("custom-section-title");
    if (titleEl) {
      titleEl.textContent = sectionName;
    }

    // Add to section button (Add More)
    const addBtn = $("add-to-section-btn");
    if (addBtn) {
      const newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      newAddBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openUploadModal(sectionName);
      });
    }

    const delBtn = $("delete-section-btn");
    if (delBtn) {
      const newDelBtn = delBtn.cloneNode(true);
      delBtn.parentNode.replaceChild(newDelBtn, delBtn);
      newDelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showCustomConfirm(
          "Delete Tab",
          `Are you sure you want to delete the "${sectionName}" tab and all its custom GIFs/videos?`,
          async () => {
            try {
              const token = TokenStore.getToken();
              const headers = {};
              if (token) headers["Authorization"] = `Bearer ${token}`;

              const res = await fetch(`/api/gifs/custom/section/${encodeURIComponent(sectionName)}`, {
                method: "DELETE",
                headers
              });

              if (res.ok) {
                showToast(`Deleted section "${sectionName}" successfully`, "success");
                await loadCustomGifsAndTrending("emojis");
              } else {
                showToast("Failed to delete section", "error");
              }
            } catch (err) {
              console.error("Delete section error:", err);
              showToast("Failed to delete section", "error");
            }
          }
        );
      });
    }

    let filtered = userCustomGifs.filter(cg => (cg.section || "My GIFs") === sectionName);

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(cg => (cg.fileName || "").toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="emoji-no-results">No GIFs found in this section</div>`;
      return;
    }

    filtered.forEach(gif => {
      const itemContainer = document.createElement("div");
      itemContainer.className = "gif-item-wrapper";
      itemContainer.style.position = "relative";
      itemContainer.style.display = "inline-block";
      itemContainer.style.width = "100%";
      itemContainer.style.aspectRatio = "1";

      const btn = document.createElement("button");
      btn.className = "gif-item-btn";
      btn.type = "button";
      btn.style.width = "100%";
      btn.style.height = "100%";
      const urlLower = (gif.url || "").toLowerCase();
      const isVideo = urlLower.endsWith(".mp4") || urlLower.endsWith(".m4v") || urlLower.endsWith(".m4bb");
      if (isVideo) {
        btn.innerHTML = `<video src="${gif.url}" muted autoplay loop playsinline style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>`;
      } else {
        btn.innerHTML = `<img src="${gif.url}" alt="GIF" loading="lazy">`;
      }
      btn.addEventListener("click", () => sendSpecialTypeMessage("gif", gif.url));

      const delSingleBtn = document.createElement("button");
      delSingleBtn.type = "button";
      delSingleBtn.className = "gif-delete-single-btn";
      delSingleBtn.innerHTML = `&times;`;
      delSingleBtn.style.position = "absolute";
      delSingleBtn.style.top = "4px";
      delSingleBtn.style.right = "4px";
      delSingleBtn.style.background = "rgba(0, 0, 0, 0.6)";
      delSingleBtn.style.border = "none";
      delSingleBtn.style.color = "#ef4444";
      delSingleBtn.style.fontSize = "16px";
      delSingleBtn.style.width = "18px";
      delSingleBtn.style.height = "18px";
      delSingleBtn.style.borderRadius = "50%";
      delSingleBtn.style.display = "flex";
      delSingleBtn.style.alignItems = "center";
      delSingleBtn.style.justifyContent = "center";
      delSingleBtn.style.cursor = "pointer";
      delSingleBtn.style.lineHeight = "1";
      delSingleBtn.style.zIndex = "2";
      delSingleBtn.style.transition = "all 0.2s";
      delSingleBtn.title = "Delete GIF";

      delSingleBtn.addEventListener("mouseover", () => {
        delSingleBtn.style.background = "#ef4444";
        delSingleBtn.style.color = "#ffffff";
      });
      delSingleBtn.addEventListener("mouseout", () => {
        delSingleBtn.style.background = "rgba(0, 0, 0, 0.6)";
        delSingleBtn.style.color = "#ef4444";
      });

      delSingleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showCustomConfirm(
          "Delete GIF",
          "Are you sure you want to delete this custom GIF/video?",
          async () => {
            try {
              const token = TokenStore.getToken();
              const headers = {};
              if (token) headers["Authorization"] = `Bearer ${token}`;

              const res = await fetch(`/api/gifs/custom/${gif._id}`, {
                method: "DELETE",
                headers
              });

              if (res.ok) {
                showToast("GIF deleted successfully", "success");
                await loadCustomGifsAndTrending(`custom-section-${sectionName}`);
              } else {
                showToast("Failed to delete GIF", "error");
              }
            } catch (err) {
              console.error("Delete GIF error:", err);
              showToast("Failed to delete GIF", "error");
            }
          }
        );
      });

      itemContainer.appendChild(btn);
      itemContainer.appendChild(delSingleBtn);
      container.appendChild(itemContainer);
    });
  }

  function filterCustomSectionGifs(sectionName, query) {
    renderCustomSectionGifs(sectionName, query);
  }

  function openUploadModal(preselectedSection) {
    const modal = $("custom-gif-upload-modal");
    if (modal) {
      modal.style.display = "flex";
      
      const sectionInput = $("custom-gif-section-input");
      const fileInput = $("custom-gif-file-input");
      const fileName = $("custom-gif-file-name");
      const uploadBtn = $("custom-gif-upload-btn");
      const sectionSelect = $("custom-gif-section-select");
      const sectionInputContainer = $("custom-gif-section-input-container");
      
      if (sectionInput) sectionInput.value = "";
      if (fileInput) fileInput.value = "";
      if (fileName) fileName.textContent = "No file chosen";
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Upload";
      }

      if (sectionSelect) {
        sectionSelect.innerHTML = '<option value="new">-- Create New Tab/Section --</option>';
        const sections = [];
        userCustomGifs.forEach(gif => {
          const sec = gif.section || "My GIFs";
          if (!sections.includes(sec)) {
            sections.push(sec);
          }
        });
        sections.forEach(sec => {
          const opt = document.createElement("option");
          opt.value = sec;
          opt.textContent = sec;
          sectionSelect.appendChild(opt);
        });
        
        if (preselectedSection) {
          sectionSelect.value = preselectedSection;
        } else {
          sectionSelect.value = "new";
        }
      }

      if (sectionInputContainer) {
        if (preselectedSection && preselectedSection !== "new") {
          sectionInputContainer.style.display = "none";
        } else {
          sectionInputContainer.style.display = "block";
        }
      }
    }
  }

  function closeUploadModal() {
    const modal = $("custom-gif-upload-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  function sendSpecialTypeMessage(type, content) {
    if (!State.activeChat) return;
    const tempId = generateId();
    const message = {
      tempId,
      id: tempId,
      type: type,
      content: content,
      sender: "me",
      user: State.currentUser.id || State.currentUser._id,
      timestamp: Date.now(),
      replyTo: State.replyingTo || null,
      reactions: {},
      status: { sent: false, delivered: false, seen: false }
    };

    if (!State.messages[State.activeChat]) State.messages[State.activeChat] = [];
    State.messages[State.activeChat].unshift(message);
    State.messageIndex[tempId] = State.activeChat;

    const conv = State.conversations.find(c => c.id === State.activeChat);
    if (conv) {
      conv.lastMessage = type === "sticker" ? "🖼️ Sticker" : "🎬 GIF";
      conv.timestamp = Date.now();
    }
    renderChatList(document.getElementById("chat-search").value.trim().toLowerCase());

    document.getElementById("messages").appendChild(createMessageElement(message));
    document.getElementById("messages-container").scrollTop = 99999;

    // Save to outbox queue for sending
    OutboxQueue.add({
      tempId,
      to: State.activeChat,
      type: type,
      content: content,
      replyTo: State.replyingTo || null,
      clientTime: Date.now()
    });

    // Emit socket event
    socket.emit("private_message", {
      message: {
        tempId,
        to: State.activeChat,
        type: type,
        content: content,
        replyTo: State.replyingTo || null,
        clientTime: Date.now()
      }
    });

    // Close picker drawer
    const panel = $("custom-emoji-panel");
    if (panel) {
      panel.classList.remove("active");
      if (typeof window.updateInputContainerState === "function") window.updateInputContainerState();
    }

    // Reset replyingTo state
    State.replyingTo = null;
    const replyPreview = document.getElementById("reply-preview");
    if (replyPreview) replyPreview.style.display = "none";
  }

  function filterEmojis(query) {
    const sections = document.querySelectorAll("#emoji-tab-content-emojis .emoji-category-section");
    const gridContainer = $("emoji-grid-container");

    // Remove any existing search results container
    const existingSearch = $("emoji-search-results");
    if (existingSearch) existingSearch.remove();

    if (!query) {
      // Show all normal categories
      sections.forEach(s => s.style.display = "block");
      return;
    }

    // Hide categories
    sections.forEach(s => s.style.display = "none");

    // Search and display results
    const resultsContainer = document.createElement("div");
    resultsContainer.className = "emoji-category-section";
    resultsContainer.id = "emoji-search-results";

    const header = document.createElement("div");
    header.className = "emoji-category-header";
    header.textContent = "Search Results";
    resultsContainer.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "emoji-category-grid";

    let matchCount = 0;
    Object.values(EMOJI_DATA).flat().forEach((emoji) => {
      const tags = getEmojiTags(emoji);
      if (tags.some(tag => tag.includes(query))) {
        const btn = document.createElement("button");
        btn.className = "emoji-item";
        btn.type = "button";
        btn.textContent = emoji;
        btn.addEventListener("click", () => insertEmoji(emoji));
        grid.appendChild(btn);
        matchCount++;
      }
    });

    if (matchCount === 0) {
      const empty = document.createElement("div");
      empty.className = "emoji-no-results";
      empty.textContent = "No emojis found";
      resultsContainer.appendChild(empty);
    } else {
      resultsContainer.appendChild(grid);
    }

    gridContainer.appendChild(resultsContainer);
  }

  function insertEmoji(emoji) {
    const input = $("message-input");
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    input.value = before + emoji + after;
    input.selectionStart = input.selectionEnd = start + emoji.length;

    // Do not focus on mobile/touch devices to avoid popping up the system keyboard
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouchDevice) {
      input.focus();
    }

    // Trigger input event to enable send button
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Helper map for common emoji tags
  function getEmojiTags(emoji) {
    const tagMap = {
      "heart": ["heart", "love", "like", "card", "red", "pink", "symbol", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣", "💕", "💞", "💓", "💗", "💖", "💝", "💟"],
      "smile": ["smile", "happy", "laugh", "joy", "grin", "face", "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝"],
      "cry": ["cry", "sad", "tear", "hurt", "grief", "depressed", "😭", "😢", "🥺", "😓", "😿", "💔"],
      "angry": ["angry", "mad", "hate", "rage", "evil", "😡", "😠", "🤬", "😈", "👿"],
      "thumbs": ["thumbs", "up", "down", "like", "agree", "disagree", "ok", "yes", "no", "👍", "👎", "👌"],
      "fire": ["fire", "hot", "burn", "lit", "cool", "🔥"],
      "star": ["star", "sparkle", "shine", "magic", "✨"],
      "laugh": ["laugh", "haha", "😂", "🤣", "😆"],
      "party": ["party", "celebrate", "popper", "balloons", "🎉", "🥳", "🎊", "🎈"],
      "clap": ["clap", "hands", "applause", "👏"],
      "hand": ["hand", "wave", "gesture", "hello", "hi", "👋", "🤚", "🖐️", "✋", "🖖"],
      "dog": ["dog", "puppy", "pet", "animal", "🐶", "🐕", "🐩"],
      "cat": ["cat", "kitten", "pet", "animal", "🐱", "🐈"],
      "car": ["car", "drive", "travel", "vehicle", "🚗", "🚕", "🚙", "🏎️", "🚓"],
      "food": ["food", "eat", "drink", "hungry", "delicious", "🍔", "🍟", "🍕", "🥪", "🌮", "🌯", "🥗", "🍿", "🍱", "🍙", "🍚", "🍛", "🍜", "🍝", "🍣", "🍤", "🥟", "🥡", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "cupcake", "pie", "chocolate", "candy", "lollipop", "pudding", "honey"],
      "coffee": ["coffee", "tea", "drink", "morning", "caffeine", "☕", "🍵", "🧋"],
      "beer": ["beer", "drink", "alcohol", "party", "cheers", "🍺", "🍻"],
      "flag": ["flag", "country", "🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️"]
    };

    const matchedTags = [emoji]; // Always match the emoji character itself
    Object.entries(tagMap).forEach(([tag, list]) => {
      if (list.includes(emoji)) {
        matchedTags.push(tag);
      }
    });
    return matchedTags;
  }

  return { init, loadCustomGifsAndTrending };
})();

document.addEventListener("DOMContentLoaded", () => EmojiPanel.init());
