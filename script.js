// public/script.js — ¡Hola Cards! frontend logic
// Loads the deck, lets the user pick a category (or study all), manages the
// study queue, handles card flipping, audio pronunciation, and shuffling.

(() => {
  // --- DOM references ---
  const homeScreen = document.getElementById('home-screen');
  const studyScreen = document.getElementById('study-screen');
  const finishScreen = document.getElementById('finish-screen');

  const startAllBtn = document.getElementById('start-all-btn');
  const restartBtn = document.getElementById('restart-btn');
  const finishBackBtn = document.getElementById('finish-back-btn');
  const knewBtn = document.getElementById('knew-btn');
  const againBtn = document.getElementById('again-btn');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const backToCategoriesBtn = document.getElementById('back-to-categories-btn');
  const categoryGrid = document.getElementById('category-grid');
  const categoryLabel = document.getElementById('category-label');

  const card = document.getElementById('card');
  const cardSpanish = document.getElementById('card-spanish');
  const cardEnglish = document.getElementById('card-english');
  const cardPronunciation = document.getElementById('card-pronunciation');
  const cardExampleEs = document.getElementById('card-example-es');
  const cardExampleEn = document.getElementById('card-example-en');
  const speakBtn = document.getElementById('speak-btn');

  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');

  // --- State ---
  let fullDeck = [];        // every card we ever load
  let activeDeck = [];      // cards selected for the current session (filtered by category)
  let activeCategory = null; // null = all cards; otherwise the category name
  let queue = [];           // cards still to study in this session
  let mastered = 0;         // count of cards marked "knew it"
  let isFlipped = false;
  let hasRevealed = false;
  let isTransitioning = false;

  // CSS flip-back animation duration; keep in sync with style.css.
  const FLIP_DURATION_MS = 600;

  // --- Audio (Web Speech API) ---
  const synth = window.speechSynthesis;

  function pickSpanishVoice() {
    if (!synth) return null;
    const voices = synth.getVoices();
    return (
      voices.find((v) => v.lang === 'es-ES') ||
      voices.find((v) => v.lang === 'es-MX') ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('es')) ||
      null
    );
  }

  function speakSpanish(text) {
    if (!synth || !text) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickSpanishVoice();
    if (voice) utter.voice = voice;
    utter.lang = 'es-ES';
    utter.rate = 0.9;
    utter.pitch = 1;

    speakBtn.classList.add('speaking');
    utter.onend = () => speakBtn.classList.remove('speaking');
    utter.onerror = () => speakBtn.classList.remove('speaking');

    synth.speak(utter);
  }

  if (synth && typeof synth.onvoiceschanged !== 'undefined') {
    synth.onvoiceschanged = pickSpanishVoice;
  }

  // --- Helpers ---
  function showScreen(screen) {
    [homeScreen, studyScreen, finishScreen].forEach((s) => s.classList.add('hidden'));
    screen.classList.remove('hidden');
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function updateProgress() {
    const total = activeDeck.length;
    progressText.textContent = mastered + ' of ' + total + ' mastered';
    const pct = total === 0 ? 0 : (mastered / total) * 100;
    progressFill.style.width = pct + '%';
  }

  function loadCurrentCardContent() {
    if (queue.length === 0) {
      finishSession();
      return;
    }
    const current = queue[0];
    cardSpanish.textContent = current.spanish;
    cardEnglish.textContent = current.english;
    cardPronunciation.textContent = current.pronunciation;
    cardExampleEs.textContent = current.example_es;
    cardExampleEn.textContent = current.example_en;
  }

  function resetCardState() {
    isFlipped = false;
    hasRevealed = false;
    card.classList.remove('flipped');
    knewBtn.disabled = true;
    againBtn.disabled = true;
    speakBtn.classList.remove('speaking');
    if (synth) synth.cancel();
  }

  function flipCard() {
    if (queue.length === 0 || isTransitioning) return;
    isFlipped = !isFlipped;
    card.classList.toggle('flipped', isFlipped);
    if (isFlipped && !hasRevealed) {
      hasRevealed = true;
      knewBtn.disabled = false;
      againBtn.disabled = false;
    }
  }

  function advanceToNextCard() {
    if (isTransitioning) return;
    isTransitioning = true;

    knewBtn.disabled = true;
    againBtn.disabled = true;
    hasRevealed = false;
    speakBtn.classList.remove('speaking');
    if (synth) synth.cancel();

    const wasFlipped = isFlipped;
    isFlipped = false;
    card.classList.remove('flipped');

    const swap = () => {
      loadCurrentCardContent();
      resetCardState();
      isTransitioning = false;
    };

    if (wasFlipped) {
      setTimeout(swap, FLIP_DURATION_MS);
    } else {
      swap();
    }
  }

  function markKnew() {
    if (!hasRevealed || queue.length === 0 || isTransitioning) return;
    queue.shift();
    mastered += 1;
    updateProgress();
    advanceToNextCard();
  }

  function markAgain() {
    if (!hasRevealed || queue.length === 0 || isTransitioning) return;
    const current = queue.shift();
    const insertAt = Math.min(queue.length, 4);
    queue.splice(insertAt, 0, current);
    advanceToNextCard();
  }

  // Re-shuffle the cards still to come, leaving the currently-shown card in place
  // so the user isn't disoriented mid-card.
  function shuffleRemaining() {
    if (isTransitioning || queue.length <= 1) return;
    const current = queue.shift();
    shuffle(queue);
    queue.unshift(current);
    // Brief visual cue on the button.
    shuffleBtn.classList.add('flash');
    setTimeout(() => shuffleBtn.classList.remove('flash'), 350);
  }

  // --- Session management ---
  function startSession(category) {
    activeCategory = category || null;
    activeDeck = activeCategory
      ? fullDeck.filter((c) => c.category === activeCategory)
      : fullDeck.slice();

    if (activeDeck.length === 0) return; // safety net

    queue = shuffle(activeDeck.slice());
    mastered = 0;
    isTransitioning = false;
    categoryLabel.textContent = activeCategory || 'All Cards';
    updateProgress();
    showScreen(studyScreen);
    resetCardState();
    loadCurrentCardContent();
  }

  function finishSession() {
    if (synth) synth.cancel();
    showScreen(finishScreen);
  }

  function goHome() {
    if (synth) synth.cancel();
    showScreen(homeScreen);
  }

  // --- Category chip rendering ---
  // Pulls the unique category list from the loaded deck and renders chips.
  function renderCategoryChips() {
    const categories = [];
    const counts = {};
    fullDeck.forEach((c) => {
      if (!counts[c.category]) {
        counts[c.category] = 0;
        categories.push(c.category);
      }
      counts[c.category] += 1;
    });

    categoryGrid.innerHTML = '';
    categories.forEach((name) => {
      const btn = document.createElement('button');
      btn.className = 'category-chip';
      btn.type = 'button';
      btn.setAttribute('data-category', name);

      const nameEl = document.createElement('span');
      nameEl.className = 'chip-name';
      nameEl.textContent = name;

      const countEl = document.createElement('span');
      countEl.className = 'chip-count';
      countEl.textContent = counts[name] + ' cards';

      btn.appendChild(nameEl);
      btn.appendChild(countEl);
      btn.addEventListener('click', () => startSession(name));
      categoryGrid.appendChild(btn);
    });
  }

  // --- Event listeners ---
  card.addEventListener('click', flipCard);
  card.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flipCard();
    }
  });

  speakBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (queue.length === 0 || isTransitioning) return;
    speakSpanish(queue[0].spanish);
  });

  knewBtn.addEventListener('click', markKnew);
  againBtn.addEventListener('click', markAgain);

  startAllBtn.addEventListener('click', () => startSession(null));
  restartBtn.addEventListener('click', () => startSession(activeCategory));
  finishBackBtn.addEventListener('click', goHome);
  backToCategoriesBtn.addEventListener('click', goHome);
  shuffleBtn.addEventListener('click', shuffleRemaining);

  document.addEventListener('keydown', (e) => {
    if (studyScreen.classList.contains('hidden')) return;
    if ((e.key === 'p' || e.key === 'P') && hasRevealed && queue.length > 0 && !isTransitioning) {
      e.preventDefault();
      speakSpanish(queue[0].spanish);
    }
  });

  // --- Load the deck on page load ---
  fetch('/api/deck')
    .then((res) => {
      if (!res.ok) throw new Error('Server returned ' + res.status);
      return res.json();
    })
    .then((data) => {
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Deck is empty.');
      }
      fullDeck = data;
      renderCategoryChips();
      startAllBtn.disabled = false;
      startAllBtn.textContent = 'Study All ' + fullDeck.length + ' Cards';
    })
    .catch((err) => {
      console.error('Failed to load deck:', err);
      startAllBtn.disabled = true;
      startAllBtn.textContent = 'Could not load deck';
    });
})();
