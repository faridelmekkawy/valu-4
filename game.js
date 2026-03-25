(() => {
  // Gameplay constants: tweak here for balancing.
  const REEL_SPIN_INTERVAL_MS = 95;
  const REEL_STOP_DELAYS_MS = [900, 1400, 1900];
  const SYMBOL_ODDS = {
    coin_heart: 0.33,
    coin_wink: 0.31,
    coin_token: 0.29,
    coin_card: 0.07, // Rarest symbol
  };
  const SCORE_RULES = {
    MISS: 0,
    MATCH: 20,
    BIG_MATCH: 60,
    JACKPOT: 100,
  };

  const SYMBOLS = [
    { key: 'coin_heart', src: './coin_heart.png', rare: false },
    { key: 'coin_wink', src: './coin_wink.png', rare: false },
    { key: 'coin_token', src: './coin_token.png', rare: false },
    { key: 'coin_card', src: './coin_card.png', rare: true },
  ];

  const ui = {
    startScreen: document.getElementById('startScreen'),
    startForm: document.getElementById('startForm'),
    nameInput: document.getElementById('playerName'),
    gameScreen: document.getElementById('gameScreen'),
    playerName: document.getElementById('playerNameLabel'),
    score: document.getElementById('scoreLabel'),
    best: document.getElementById('bestScoreLabel'),
    spins: document.getElementById('spinCountLabel'),
    streak: document.getElementById('jackpotStreakLabel'),
    reels: [...document.querySelectorAll('.reel')],
    symbols: [0, 1, 2].map((idx) => document.getElementById(`symbol${idx}`)),
    spinButton: document.getElementById('spinButton'),
    muteButton: document.getElementById('muteButton'),
    result: document.getElementById('resultMessage'),
    pointsPopup: document.getElementById('pointsPopup'),
    machinePanel: document.getElementById('machinePanel'),
    fxCanvas: document.getElementById('fxCanvas'),
    appRoot: document.getElementById('appRoot'),
  };

  const state = {
    playerName: '',
    score: 0,
    bestScore: Number(localStorage.getItem('sparkie_best_score') || 0),
    spins: 0,
    jackpotStreak: 0,
    spinning: false,
    muted: true,
    currentSymbols: [SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]],
  };

  const canvasCtx = ui.fxCanvas.getContext('2d');

  function resizeCanvas() {
    ui.fxCanvas.width = window.innerWidth;
    ui.fxCanvas.height = window.innerHeight;
  }

  function weightedPick() {
    const r = Math.random();
    let running = 0;
    for (const sym of SYMBOLS) {
      running += SYMBOL_ODDS[sym.key] || 0;
      if (r <= running) return sym;
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function safeSymbolNode(symbol) {
    const img = document.createElement('img');
    img.className = `symbol ${symbol.rare ? 'rare' : ''}`;
    img.alt = symbol.key;
    img.src = symbol.src;

    const fallback = () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.setAttribute('aria-label', `${symbol.key} placeholder`);
      img.replaceWith(placeholder);
    };

    img.onerror = fallback;
    return img;
  }

  function renderReels() {
    state.currentSymbols.forEach((sym, idx) => {
      const cell = ui.symbols[idx];
      cell.innerHTML = '';
      cell.appendChild(safeSymbolNode(sym));
    });
  }

  function updateScoreUI() {
    ui.playerName.textContent = state.playerName;
    ui.score.textContent = String(state.score);
    ui.best.textContent = String(state.bestScore);
    ui.spins.textContent = String(state.spins);
    ui.streak.textContent = String(state.jackpotStreak);
  }

  function setResult(text, tone = 'normal') {
    ui.result.textContent = text;
    ui.result.style.color = tone === 'win' ? '#57BEB1' : tone === 'big' ? '#EF5F17' : '#f7f7f7';
  }

  function showPoints(points) {
    ui.pointsPopup.textContent = points > 0 ? `+${points}` : '+0';
    ui.pointsPopup.classList.remove('show');
    void ui.pointsPopup.offsetWidth;
    ui.pointsPopup.classList.add('show');
  }

  function playSoundHook(type) {
    // Hook-only, no external assets. Kept silent by default.
    if (state.muted) return;
    console.debug(`Sound hook: ${type}`);
  }

  function evaluateSpin(symbols) {
    const keys = symbols.map((s) => s.key);
    const counts = keys.reduce((acc, key) => {
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const values = Object.values(counts).sort((a, b) => b - a);
    const isAllSame = values[0] === 3;
    const hasPair = values[0] === 2;
    const hasSpecialCombo = keys.includes('coin_card') && keys.includes('coin_token');

    if (isAllSame) {
      const superJackpot = keys[0] === 'coin_card';
      return {
        points: SCORE_RULES.JACKPOT,
        message: superJackpot ? 'SUPER JACKPOT! Triple Coin Card!' : 'JACKPOT! Triple Match!',
        level: superJackpot ? 'super' : 'jackpot',
      };
    }

    if (hasPair) {
      return {
        points: SCORE_RULES.BIG_MATCH,
        message: 'Big Match! Nice spin.',
        level: 'big',
      };
    }

    if (hasSpecialCombo) {
      return {
        points: SCORE_RULES.MATCH,
        message: 'Match Bonus! Special combo hit.',
        level: 'match',
      };
    }

    return { points: SCORE_RULES.MISS, message: 'Miss! Try again.', level: 'miss' };
  }

  function clearWinHighlights() {
    ui.reels.forEach((reel) => reel.classList.remove('win'));
  }

  function markWinningReels(symbols, level) {
    if (level === 'miss') return;
    const keys = symbols.map((s) => s.key);

    if (level === 'match') {
      keys.forEach((k, i) => {
        if (k === 'coin_card' || k === 'coin_token') ui.reels[i].classList.add('win');
      });
      return;
    }

    const target = level === 'big'
      ? Object.entries(keys.reduce((a, key) => ((a[key] = (a[key] || 0) + 1), a), {})).find(([, c]) => c === 2)?.[0]
      : keys[0];

    keys.forEach((k, i) => {
      if (k === target) ui.reels[i].classList.add('win');
    });
  }

  function confettiBurst(intensity = 60, colorA = '#57BEB1', colorB = '#EF5F17') {
    const particles = Array.from({ length: intensity }, () => ({
      x: Math.random() * ui.fxCanvas.width,
      y: -20,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      size: 2 + Math.random() * 5,
      life: 55 + Math.random() * 30,
      color: Math.random() > 0.5 ? colorA : colorB,
    }));

    let frame = 0;
    const animate = () => {
      frame += 1;
      canvasCtx.clearRect(0, 0, ui.fxCanvas.width, ui.fxCanvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        canvasCtx.fillStyle = p.color;
        canvasCtx.fillRect(p.x, p.y, p.size, p.size);
      });

      if (frame < 80) {
        requestAnimationFrame(animate);
      } else {
        canvasCtx.clearRect(0, 0, ui.fxCanvas.width, ui.fxCanvas.height);
      }
    };

    animate();
  }

  function doScreenShake() {
    ui.appRoot.classList.remove('shake');
    void ui.appRoot.offsetWidth;
    ui.appRoot.classList.add('shake');
  }

  async function spin() {
    if (state.spinning) return;

    state.spinning = true;
    clearWinHighlights();
    ui.spinButton.disabled = true;
    setResult('Spinning...');
    playSoundHook('spin');

    const intervals = ui.reels.map((reel, idx) => {
      reel.classList.add('spinning');
      return setInterval(() => {
        state.currentSymbols[idx] = weightedPick();
        renderReels();
      }, REEL_SPIN_INTERVAL_MS);
    });

    for (let i = 0; i < ui.reels.length; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, REEL_STOP_DELAYS_MS[i]));
      clearInterval(intervals[i]);
      ui.reels[i].classList.remove('spinning');
      state.currentSymbols[i] = weightedPick();
      renderReels();
    }

    state.spins += 1;
    const outcome = evaluateSpin(state.currentSymbols);

    state.score += outcome.points;
    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      localStorage.setItem('sparkie_best_score', String(state.bestScore));
    }

    if (outcome.level === 'jackpot' || outcome.level === 'super') {
      state.jackpotStreak += 1;
      confettiBurst(outcome.level === 'super' ? 120 : 80, '#57BEB1', '#ffffff');
      doScreenShake();
      playSoundHook('jackpot');
    } else {
      state.jackpotStreak = 0;
      if (outcome.level === 'big' || outcome.level === 'match') {
        confettiBurst(36);
      }
    }

    markWinningReels(state.currentSymbols, outcome.level);
    setResult(outcome.message, outcome.level === 'miss' ? 'normal' : outcome.level === 'match' ? 'win' : 'big');
    showPoints(outcome.points);
    updateScoreUI();

    state.spinning = false;
    ui.spinButton.disabled = false;
  }

  function bindEvents() {
    ui.startForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ui.nameInput.value.trim();
      if (!name) return;

      state.playerName = name;
      ui.startScreen.classList.add('hidden');
      ui.gameScreen.classList.remove('hidden');
      updateScoreUI();
      renderReels();
      setResult(`Welcome ${name}! Press SPIN.`);
      ui.spinButton.focus();
    });

    ui.spinButton.addEventListener('click', spin);

    ui.muteButton.addEventListener('click', () => {
      state.muted = !state.muted;
      ui.muteButton.textContent = `Sound: ${state.muted ? 'Off' : 'On'}`;
      ui.muteButton.setAttribute('aria-pressed', String(!state.muted));
    });

    window.addEventListener('keydown', (e) => {
      if (ui.gameScreen.classList.contains('hidden')) return;
      if ((e.code === 'Space' || e.code === 'Enter') && !state.spinning) {
        e.preventDefault();
        spin();
      }
    });

    window.addEventListener('resize', resizeCanvas);
  }

  function init() {
    resizeCanvas();
    renderReels();
    updateScoreUI();
    bindEvents();
  }

  init();
})();
