const EmojiPanel = (() => {
  const EMOJI_DATA = {
    "Smileys": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🫣","🤭","🫢","🫡","🤫","🫠","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","😵‍💫","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"],
    "Gestures": ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","💋"],
    "Animals": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦗","🕷️","🕸️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🐐","🦌","🐕","🐈","🐓","🦃","🦚","🦜","🕊️","🐇","🦝","🦡","🦦","🦥","🐿️","🦔"],
    "Food": ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🥔","🥕","🌽","🌶️","🫑","🥐","🍞","🥖","🥨","🧀","🥚","🍳","🥞","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🥪","🌮","🌯","🥘","🍲","🥣","🥗","🍿","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🍡","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🍵","🍶","🍾","🍷","🍸","🍹","🍺","🍻","🥂","🥃","🥤","🧋","🧃","🧉","🧊"],
    "Activities": ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🗜️","🏸","🏒","🏑","🥍","🏏","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🏋️","🤼","🤸","⛹️","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🤽","🚣","🧗","🚴","🚵","🏆","🥇","🥈","🥉","🏅","🎖️","🎫","🎟️","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🎲","♟️","🎯","🎳","🎮","🎰"],
    "Travel": ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🛺","🚲","🛴","🚏","🚨","🚇","🚀","🛸","🚁","✈️","🛫","🛬","🚢","⛵","⚓","🗺️","🗼","🗽","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🏕️","⛺","🏠","🏡","🏢","🏣","🏥","🏦","🏨","🏪","🏫","🏬","🏭","教堂","清真寺","寺庙","神社","🕋","🏛️","🛤️","路","🌅","🌄","🌃","🏙️","🌆","🌇"],
    "Objects": ["⌚","📱","💻","🖥️","🖨️","🖱️","🖲️","💾","💿","DVD","📼","📷","📸","📹","🎥","📽️","🎞️","电话","📟","📠","电视","收音机","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","⏳","⌛","🔋","🔌","💡","手电筒","蜡烛","垃圾桶","镜子","香皂","安全别针","扫帚","篮子","卫生纸","皂","海绵","浴缸","淋浴","钥匙","🗝️","锤子","斧头","镐","⚒️","🛠️","剑","盾","扳手","螺丝","齿轮","天平","锁链","拐杖","磁铁","枪","炸弹","砖","木头","水晶球","念珠","💈","眼罩","花瓶"],
    "Symbols": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣","💕","💞","💓","💗","💖","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","🔀","🔁","🔂","▶️","⏩","⏭️","⏸️","⏹️","⏺️","⏏️","🎦","🔅","🔆","📶","📳","📴","➕","➖","➗","✖️","♾️","💲","💱","⚠️","🚸","⛔","🚫","🚳","🚭","🚯","🚱","🚷","🚹","🚺","🚼","🚻","🚮","🅰️","🆃","🆄","🆅","🆆","🆇","🆈","🆉","💯"],
    "Flags": ["🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️"]
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

  const $ = id => document.getElementById(id);

  function init() {
    const btn = $("emoji-panel-btn");
    const panel = $("custom-emoji-panel");
    if (!btn || !panel) return;

    // Build tabs and grid
    buildTabs();
    buildGrid();

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

    // Close on click outside (but not on input or panel elements)
    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && e.target !== btn && !e.target.closest("#emoji-panel-btn") && e.target !== messageInput) {
        if (panel.classList.contains("active")) {
          panel.classList.remove("active");
          scrollToBottom();
          if (typeof window.updateInputContainerState === "function") window.updateInputContainerState();
        }
      }
    });

    // Search functionality
    const searchInput = $("emoji-search-input");
    searchInput.addEventListener("input", (e) => {
      filterEmojis(e.target.value.trim().toLowerCase());
    });

    // Prevent propagation so click inside picker doesn't close it
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
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

  function filterEmojis(query) {
    const sections = document.querySelectorAll(".emoji-category-section");
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
      "heart": ["heart", "love", "like", "card", "red", "pink", "symbol", "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣","💕","💞","💓","💗","💖","💝","💟"],
      "smile": ["smile", "happy", "laugh", "joy", "grin", "face", "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝"],
      "cry": ["cry", "sad", "tear", "hurt", "grief", "depressed", "😭","😢","🥺","😓","😿","💔"],
      "angry": ["angry", "mad", "hate", "rage", "evil", "😡","😠","🤬","😈","👿"],
      "thumbs": ["thumbs", "up", "down", "like", "agree", "disagree", "ok", "yes", "no", "👍","👎","👌"],
      "fire": ["fire", "hot", "burn", "lit", "cool", "🔥"],
      "star": ["star", "sparkle", "shine", "magic", "✨"],
      "laugh": ["laugh", "haha", "😂", "🤣", "😆"],
      "party": ["party", "celebrate", "popper", "balloons", "🎉","🥳","🎊","🎈"],
      "clap": ["clap", "hands", "applause", "👏"],
      "hand": ["hand", "wave", "gesture", "hello", "hi", "👋","🤚","🖐️","✋","🖖"],
      "dog": ["dog", "puppy", "pet", "animal", "🐶","🐕","🐩"],
      "cat": ["cat", "kitten", "pet", "animal", "🐱","🐈"],
      "car": ["car", "drive", "travel", "vehicle", "🚗","🚕","🚙","🏎️","🚓"],
      "food": ["food", "eat", "drink", "hungry", "delicious", "🍔","🍟","🍕","🥪","🌮","🌯","🥗","🍿","🍱","🍙","🍚","🍛","🍜","🍝","🍣","🍤","🥟","🥡","🍦","🍧","🍨","🍩","🍪","🎂","🍰","cupcake","pie","chocolate","candy","lollipop","pudding","honey"],
      "coffee": ["coffee", "tea", "drink", "morning", "caffeine", "☕","🍵","🧋"],
      "beer": ["beer", "drink", "alcohol", "party", "cheers", "🍺","🍻"],
      "flag": ["flag", "country", "🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️"]
    };

    const matchedTags = [emoji]; // Always match the emoji character itself
    Object.entries(tagMap).forEach(([tag, list]) => {
      if (list.includes(emoji)) {
        matchedTags.push(tag);
      }
    });
    return matchedTags;
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => EmojiPanel.init());
