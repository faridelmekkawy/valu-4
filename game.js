(() => {
  const REEL_SPIN_INTERVAL_MS = 120;
  const REEL_STOP_DELAYS_MS = [900, 1450, 2050];
  const SYMBOL_ODDS = { coin_heart: 0.33, coin_wink: 0.31, coin_token: 0.29, coin_card: 0.07 };
  const SCORE_RULES = { MISS: 0, MATCH: 20, BIG_MATCH: 60, JACKPOT: 100 };
  const PLAYED_KEY = 'sparkie_once_players';

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
    bigWinBar: document.getElementById('bigWinBar'),
    fxCanvas: document.getElementById('fxCanvas'),
    appRoot: document.getElementById('appRoot'),
  };

  const state = {
    playerName: '',
    score: 0,
    bestScore: Number(localStorage.getItem('sparkie_best_score') || 0),
    spinsLeft: 1,
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

  function getPlayedPlayers() {
    try {
      return JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function savePlayedPlayer(name) {
    const id = name.toLowerCase();
    const players = new Set(getPlayedPlayers());
    players.add(id);
    localStorage.setItem(PLAYED_KEY, JSON.stringify([...players]));
  }

  function hasPlayed(name) {
    return getPlayedPlayers().includes(name.toLowerCase());
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
    img.onerror = () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      img.replaceWith(placeholder);
    };
    return img;
  }

  function renderReels() {
    state.currentSymbols.forEach((sym, idx) => {
      ui.symbols[idx].innerHTML = '';
      ui.symbols[idx].appendChild(safeSymbolNode(sym));
    });
  }

  function updateScoreUI() {
    ui.playerName.textContent = state.playerName;
    ui.score.textContent = String(state.score);
    ui.best.textContent = String(state.bestScore);
    ui.spins.textContent = String(state.spinsLeft);
    ui.streak.textContent = String(state.jackpotStreak);
  }

  function setResult(text, tone = 'normal') {
    ui.result.textContent = text;
    ui.result.style.color = tone === 'win' ? '#57BEB1' : tone === 'big' ? '#f5b74e' : '#f7f7f7';
  }

  function showPoints(points) {
    ui.pointsPopup.textContent = points > 0 ? `+${points}` : '+0';
    ui.pointsPopup.classList.remove('show');
    void ui.pointsPopup.offsetWidth;
    ui.pointsPopup.classList.add('show');
  }

  function evaluateSpin(symbols) {
    const keys = symbols.map((s) => s.key);
    const counts = keys.reduce((acc, key) => ({ ...acc, [key]: (acc[key] || 0) + 1 }), {});
    const values = Object.values(counts).sort((a, b) => b - a);

    if (values[0] === 3) {
      const superJackpot = keys[0] === 'coin_card';
      return { points: SCORE_RULES.JACKPOT, message: superJackpot ? 'SUPER JACKPOT!' : 'JACKPOT!', level: superJackpot ? 'super' : 'jackpot' };
    }
    if (values[0] === 2) return { points: SCORE_RULES.BIG_MATCH, message: 'Big Match!', level: 'big' };
    if (keys.includes('coin_card') && keys.includes('coin_token')) return { points: SCORE_RULES.MATCH, message: 'Special Match!', level: 'match' };
    return { points: SCORE_RULES.MISS, message: 'Miss!', level: 'miss' };
  }

  function clearWinHighlights() {
    ui.reels.forEach((reel) => reel.classList.remove('win', 'spinning'));
    ui.bigWinBar.classList.remove('active');
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
      ? Object.keys(keys.reduce((acc, key) => ({ ...acc, [key]: (acc[key] || 0) + 1 }), {})).find((k) => keys.filter((n) => n === k).length === 2)
      : keys[0];
    keys.forEach((k, i) => {
      if (k === target) ui.reels[i].classList.add('win');
    });
  }

  function confettiBurst(intensity = 60) {
    const particles = Array.from({ length: intensity }, () => ({
      x: Math.random() * ui.fxCanvas.width,
      y: -20,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      size: 2 + Math.random() * 5,
      color: Math.random() > 0.5 ? '#f5b74e' : '#57beb1',
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
      if (frame < 80) requestAnimationFrame(animate);
      else canvasCtx.clearRect(0, 0, ui.fxCanvas.width, ui.fxCanvas.height);
    };
    animate();
  }

  function doScreenShake() {
    ui.appRoot.classList.remove('shake');
    void ui.appRoot.offsetWidth;
    ui.appRoot.classList.add('shake');
  }

  async function spin() {
    if (state.spinning || state.spinsLeft <= 0) return;

    state.spinning = true;
    ui.spinButton.disabled = true;
    clearWinHighlights();
    setResult('Rolling...');

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

    const outcome = evaluateSpin(state.currentSymbols);
    state.score += outcome.points;
    state.spinsLeft = 0;
    savePlayedPlayer(state.playerName);

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      localStorage.setItem('sparkie_best_score', String(state.bestScore));
    }

    if (outcome.level === 'jackpot' || outcome.level === 'super') {
      state.jackpotStreak += 1;
      ui.bigWinBar.classList.add('active');
      confettiBurst(outcome.level === 'super' ? 130 : 90);
      doScreenShake();
    } else {
      state.jackpotStreak = 0;
      if (outcome.level === 'big' || outcome.level === 'match') {
        ui.bigWinBar.classList.add('active');
        confettiBurst(45);
      }
    }

    markWinningReels(state.currentSymbols, outcome.level);
    setResult(`${outcome.message} Spin used.`, outcome.level === 'miss' ? 'normal' : 'big');
    showPoints(outcome.points);
    updateScoreUI();

    state.spinning = false;
    ui.spinButton.disabled = true;
  }

  function bindEvents() {
    ui.startForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ui.nameInput.value.trim();
      if (!name) return;

      state.playerName = name;
      state.spinsLeft = hasPlayed(name) ? 0 : 1;

      ui.startScreen.classList.add('hidden');
      ui.gameScreen.classList.remove('hidden');
      updateScoreUI();
      renderReels();

      if (state.spinsLeft === 0) {
        setResult(`Welcome ${name}. You have already used your spin.`);
        ui.spinButton.disabled = true;
      } else {
        setResult(`Welcome ${name}! You have one spin.`);
        ui.spinButton.disabled = false;
      }
    });

    ui.spinButton.addEventListener('click', spin);
    ui.muteButton.addEventListener('click', () => {
      state.muted = !state.muted;
      ui.muteButton.textContent = `Sound: ${state.muted ? 'Off' : 'On'}`;
      ui.muteButton.setAttribute('aria-pressed', String(!state.muted));
    });

    window.addEventListener('keydown', (e) => {
      if (ui.gameScreen.classList.contains('hidden')) return;
      if ((e.code === 'Space' || e.code === 'Enter') && !state.spinning && state.spinsLeft > 0) {
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
    ui.spinButton.disabled = true;
  }

  init();
})();
