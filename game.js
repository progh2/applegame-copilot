const scoreEl = document.getElementById("score");
const sumEl = document.getElementById("sum");
const bestEl = document.getElementById("best");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const muteBtn = document.getElementById("muteBtn");

const BEST_KEY = "apple10-best-score";
const COLS = 6;
const ROWS = 8;
const CELL_SIZE = 74;
const GAME_WIDTH = 540;
const GAME_HEIGHT = 760;
const BOARD_X = (GAME_WIDTH - COLS * CELL_SIZE) / 2;
const BOARD_Y = 102;
const APPLE_RADIUS = 27;
const NUMBER_WEIGHTS = [
  { value: 1, weight: 7 },
  { value: 2, weight: 10 },
  { value: 3, weight: 12 },
  { value: 4, weight: 14 },
  { value: 5, weight: 10 },
  { value: 6, weight: 14 },
  { value: 7, weight: 12 },
  { value: 8, weight: 10 },
  { value: 9, weight: 7 },
];

class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.started = false;
    this.muted = false;
    this.paused = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.bgmIntervalMs = 240;
    this.bgmPattern = [
      { lead: 261.63, bass: 130.81 },
      { lead: 329.63, bass: 164.81 },
      { lead: 392.0, bass: 196.0 },
      { lead: 329.63, bass: 164.81 },
      { lead: 293.66, bass: 146.83 },
      { lead: 369.99, bass: 184.99 },
      { lead: 440.0, bass: 220.0 },
      { lead: 392.0, bass: 196.0 },
    ];
    this.sfxBase = 0.22;
    this.bgmBase = 0.12;
  }

  ensureContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxBase;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmBase;

    this.sfxGain.connect(this.master);
    this.bgmGain.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  unlock() {
    this.ensureContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    if (!this.started) {
      this.started = true;
      this.startBgmLoop();
    }
  }

  setMuted(nextMuted) {
    this.muted = nextMuted;
    if (!this.sfxGain || !this.bgmGain) return;
    this.sfxGain.gain.value = this.muted ? 0 : this.sfxBase;
    this.bgmGain.gain.value = this.muted ? 0 : this.paused ? 0 : this.bgmBase;
  }

  setPaused(nextPaused, fadeSec = 0.36) {
    this.paused = nextPaused;
    if (!this.ctx || !this.bgmGain || this.muted) return;

    const now = this.ctx.currentTime;
    const target = this.paused ? 0.0001 : this.bgmBase;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setValueAtTime(Math.max(0.0001, this.bgmGain.gain.value), now);
    this.bgmGain.gain.exponentialRampToValueAtTime(target, now + fadeSec);
  }

  playTone(freq, duration, type, volume, targetGain) {
    if (!this.ctx || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(targetGain || this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playSuccess(pathLength) {
    const boost = Math.min(0.25, 0.12 + pathLength * 0.02);
    this.playTone(523.25, 0.09, "triangle", boost, this.sfxGain);
    this.playTone(659.25, 0.11, "triangle", boost * 0.9, this.sfxGain);
    this.playTone(783.99, 0.15, "triangle", boost * 0.7, this.sfxGain);
  }

  playFail() {
    this.playTone(170.0, 0.14, "sawtooth", 0.13, this.sfxGain);
  }

  startBgmLoop() {
    if (!this.ctx || this.bgmTimer) return;

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || this.muted) return;
      const step = this.bgmPattern[this.bgmStep % this.bgmPattern.length];
      const swingOffset = this.bgmStep % 2 === 0 ? 0 : 0.015;

      this.playTone(step.lead, 0.16, "triangle", 0.06, this.bgmGain);
      this.playTone(step.bass, 0.13, "sine", 0.045, this.bgmGain);

      if (this.bgmStep % 4 === 1 || this.bgmStep % 4 === 3) {
        window.setTimeout(() => {
          if (!this.ctx || this.muted) return;
          this.playTone(step.lead * 1.5, 0.11 + swingOffset, "sine", 0.03, this.bgmGain);
        }, 70);
      }

      this.bgmStep += 1;
    }, this.bgmIntervalMs);
  }
}

class AppleTenScene extends Phaser.Scene {
  constructor() {
    super("AppleTenScene");

    this.grid = [];
    this.selected = [];
    this.selectedSet = new Set();
    this.currentSum = 0;
    this.score = 0;
    this.combo = 0;
    this.bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
    this.dragging = false;
    this.busy = false;
    this.isStarted = false;
    this.isPaused = false;

    this.audioEngine = new SynthAudio();
    this.popEmitter = null;
    this.comboBadge = null;
    this.statusBadge = null;
    this.statusText = null;
    this.tutorialOverlay = null;
  }

  preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture("spark", 8, 8);
    g.destroy();
  }

  create() {
    this.drawBackground();
    this.createBoardFrame();

    this.popEmitter = this.add.particles(0, 0, "spark", {
      lifespan: 360,
      speed: { min: 70, max: 230 },
      scale: { start: 1, end: 0 },
      quantity: 0,
      blendMode: "ADD",
      gravityY: 360,
    });

    this.initBoard();

    this.comboBadge = this.add.rectangle(GAME_WIDTH / 2, 86, 360, 52, 0x2f2016, 0.82);
    this.comboBadge.setStrokeStyle(3, 0xffdc9f, 0.95);
    this.comboBadge.setVisible(false);

    this.comboText = this.add.text(GAME_WIDTH / 2, 88, "", {
      fontFamily: "Black Han Sans",
      fontSize: "30px",
      color: "#fff6d8",
      stroke: "#6f2a19",
      strokeThickness: 6,
    });
    this.comboText.setOrigin(0.5);
    this.comboText.setAlpha(0);

    this.createTutorialOverlay();

    this.statusBadge = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 360, 70, 0x2d1e15, 0.8);
    this.statusBadge.setStrokeStyle(3, 0xffd79d, 0.95);

    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "게임 시작 버튼을 눌러주세요", {
      fontFamily: "Black Han Sans",
      fontSize: "34px",
      color: "#fff4d1",
      stroke: "#5f2a18",
      strokeThickness: 6,
      align: "center",
    });
    this.statusText.setOrigin(0.5);
    this.hideStatusOverlay();

    this.bindInput();
    this.hookDomControls();
    this.syncButtonStates();
    this.refreshHud();
  }

  createTutorialOverlay() {
    this.tutorialOverlay = this.add.container(0, 0);

    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x20120a, 0.5);
    const card = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 430, 250, 0xfff5e6, 0.96);
    card.setStrokeStyle(4, 0xb96d34, 1);

    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 78, "플레이 방법", {
      fontFamily: "Black Han Sans",
      fontSize: "40px",
      color: "#7b2b1a",
      stroke: "#fffaf0",
      strokeThickness: 6,
    });
    title.setOrigin(0.5);

    const guide = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 8, "1) 숫자 사과를 드래그해서 연결\n2) 합이 10이면 사과가 터짐\n3) 위 사과가 내려와 빈칸 채움", {
      fontFamily: "Gowun Dodum",
      fontSize: "28px",
      color: "#3d2a22",
      align: "center",
      lineSpacing: 10,
    });
    guide.setOrigin(0.5);

    const hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 92, "상단 '게임 시작' 버튼으로 시작", {
      fontFamily: "Black Han Sans",
      fontSize: "26px",
      color: "#cf3f29",
      stroke: "#fff3df",
      strokeThickness: 5,
    });
    hint.setOrigin(0.5);

    this.tutorialOverlay.add([dim, card, title, guide, hint]);
    this.tutorialOverlay.setDepth(90);
  }

  drawBackground() {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xdff4ff, 0xdff4ff, 0xf6ffd6, 0xf6ffd6, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const stripe = this.add.graphics();
    stripe.fillStyle(0xffffff, 0.2);
    for (let i = 0; i < 12; i += 1) {
      stripe.fillRoundedRect(-160 + i * 78, 60, 58, 640, 16);
    }
  }

  createBoardFrame() {
    const frame = this.add.graphics();
    frame.fillStyle(0xfff4dd, 0.94);
    frame.lineStyle(6, 0xb96d34, 1);
    frame.fillRoundedRect(BOARD_X - 16, BOARD_Y - 16, COLS * CELL_SIZE + 32, ROWS * CELL_SIZE + 32, 24);
    frame.strokeRoundedRect(BOARD_X - 16, BOARD_Y - 16, COLS * CELL_SIZE + 32, ROWS * CELL_SIZE + 32, 24);
  }

  initBoard() {
    this.clearSelection();

    if (this.grid.length > 0) {
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const cell = this.grid[row][col];
          if (cell) {
            cell.container.destroy();
          }
        }
      }
    }

    this.grid = [];

    for (let row = 0; row < ROWS; row += 1) {
      this.grid[row] = [];
      for (let col = 0; col < COLS; col += 1) {
        this.grid[row][col] = this.createCell(row, col, this.getWeightedValue(), false);
      }
    }

    this.cameras.main.flash(250, 255, 250, 240, false);
  }

  createCell(row, col, value, dropFromTop) {
    const pos = this.getCellPosition(row, col);
    const startY = dropFromTop ? BOARD_Y - Phaser.Math.Between(1, 5) * CELL_SIZE : pos.y;

    const body = this.add.circle(0, 0, APPLE_RADIUS, 0xda3d2d);
    body.setStrokeStyle(3, 0x992014, 1);

    const shine = this.add.circle(-10, -10, 8, 0xffffff, 0.35);
    const stem = this.add.rectangle(0, -APPLE_RADIUS - 6, 4, 14, 0x6f401e);
    const leaf = this.add.ellipse(10, -APPLE_RADIUS - 10, 16, 9, 0x3ea94f);

    const ring = this.add.circle(0, 0, APPLE_RADIUS + 7);
    ring.setStrokeStyle(4, 0xffd86e, 1);
    ring.setVisible(false);

    const valueText = this.add.text(0, 2, String(value), {
      fontFamily: "Black Han Sans",
      fontSize: "28px",
      color: "#fff6ec",
      stroke: "#7a1b11",
      strokeThickness: 6,
    });
    valueText.setOrigin(0.5);

    const container = this.add.container(pos.x, startY, [body, shine, stem, leaf, ring, valueText]);
    container.setSize(CELL_SIZE, CELL_SIZE);
    container.setDepth(5 + row);

    if (dropFromTop) {
      container.alpha = 0;
      this.tweens.add({
        targets: container,
        y: pos.y,
        alpha: 1,
        duration: 260,
        ease: "Back.Out",
      });
    }

    return {
      row,
      col,
      value,
      container,
      ring,
    };
  }

  bindInput() {
    this.input.on("pointerdown", (pointer) => {
      if (this.busy || !this.isStarted || this.isPaused) return;
      this.audioEngine.unlock();

      this.dragging = true;
      this.clearSelection();
      this.trySelectAt(pointer);
    });

    this.input.on("pointermove", (pointer) => {
      if (!this.dragging || this.busy || !this.isStarted || this.isPaused) return;
      this.trySelectAt(pointer);
    });

    this.input.on("pointerup", () => {
      if (!this.dragging || this.busy) return;
      this.dragging = false;
      this.finalizeSelection();
    });

    this.input.on("pointerupoutside", () => {
      if (!this.dragging || this.busy) return;
      this.dragging = false;
      this.finalizeSelection();
    });
  }

  hookDomControls() {
    startBtn.addEventListener("click", () => {
      this.audioEngine.unlock();
      this.audioEngine.setPaused(false);
      this.isStarted = true;
      this.isPaused = false;
      this.hideStatusOverlay();
      this.hideTutorialOverlay();
      this.syncButtonStates();
    });

    pauseBtn.addEventListener("click", () => {
      if (!this.isStarted) return;

      this.isPaused = !this.isPaused;
      if (this.isPaused) {
        this.audioEngine.setPaused(true);
        this.dragging = false;
        this.clearSelection();
        this.showStatusOverlay("일시 정지");
      } else {
        this.audioEngine.setPaused(false);
        this.hideStatusOverlay();
      }
      this.syncButtonStates();
    });

    restartBtn.addEventListener("click", () => {
      this.audioEngine.unlock();
      this.restartGame();
    });

    muteBtn.addEventListener("click", () => {
      this.audioEngine.unlock();
      this.audioEngine.setMuted(!this.audioEngine.muted);
      muteBtn.textContent = this.audioEngine.muted ? "사운드 켜기" : "사운드 끄기";
    });
  }

  restartGame() {
    if (this.busy) return;

    this.clearSelection();
    this.currentSum = 0;
    this.score = 0;
    this.combo = 0;
    this.isStarted = true;
    this.isPaused = false;
    this.audioEngine.setPaused(false);
    this.initBoard();
    this.hideStatusOverlay();
    this.hideTutorialOverlay();
    this.syncButtonStates();
    this.refreshHud();
  }

  syncButtonStates() {
    startBtn.disabled = this.isStarted && !this.isPaused;
    pauseBtn.disabled = !this.isStarted;
    pauseBtn.textContent = this.isPaused ? "계속" : "멈추기";
  }

  showStatusOverlay(message) {
    this.statusText.setText(message);
    this.statusBadge.setVisible(true);
    this.statusText.setVisible(true);
  }

  hideStatusOverlay() {
    this.statusBadge.setVisible(false);
    this.statusText.setVisible(false);
  }

  hideTutorialOverlay() {
    if (!this.tutorialOverlay) return;

    if (!this.tutorialOverlay.visible) return;

    this.tweens.add({
      targets: this.tutorialOverlay,
      alpha: 0,
      duration: 220,
      ease: "Sine.Out",
      onComplete: () => {
        this.tutorialOverlay.setVisible(false);
      },
    });
  }

  refreshHud() {
    scoreEl.textContent = String(this.score);
    sumEl.textContent = String(this.currentSum);
    bestEl.textContent = String(this.bestScore);
  }

  getCellPosition(row, col) {
    return {
      x: BOARD_X + col * CELL_SIZE + CELL_SIZE / 2,
      y: BOARD_Y + row * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  getCellAtPointer(pointer) {
    const col = Math.floor((pointer.x - BOARD_X) / CELL_SIZE);
    const row = Math.floor((pointer.y - BOARD_Y) / CELL_SIZE);

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    return this.grid[row][col];
  }

  trySelectAt(pointer) {
    const cell = this.getCellAtPointer(pointer);
    if (!cell) return;

    const key = `${cell.row}-${cell.col}`;
    if (this.selectedSet.has(key)) return;

    this.selected.push(cell);
    this.selectedSet.add(key);
    this.currentSum += cell.value;

    cell.ring.setVisible(true);
    this.tweens.add({
      targets: cell.container,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 90,
      ease: "Quad.Out",
    });

    this.drawTrail();
    this.refreshHud();
  }

  drawTrail() {
    if (this.selected.length < 2) return;

    const from = this.selected[this.selected.length - 2].container;
    const to = this.selected[this.selected.length - 1].container;

    const trail = this.add.line(0, 0, from.x, from.y, to.x, to.y, 0xffd86e, 0.95);
    trail.setLineWidth(7, 7);
    trail.setDepth(20);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 260,
      ease: "Sine.Out",
      onComplete: () => trail.destroy(),
    });
  }

  clearSelection() {
    for (const cell of this.selected) {
      if (!cell.container.active) continue;
      cell.ring.setVisible(false);
      this.tweens.add({
        targets: cell.container,
        scaleX: 1,
        scaleY: 1,
        duration: 70,
      });
    }

    this.selected.length = 0;
    this.selectedSet.clear();
    this.currentSum = 0;
    this.refreshHud();
  }

  finalizeSelection() {
    if (this.selected.length === 0) {
      this.clearSelection();
      return;
    }

    if (this.currentSum !== 10) {
      this.audioEngine.playFail();
      this.cameras.main.shake(90, 0.002);
      this.combo = 0;
      this.clearSelection();
      return;
    }

    this.busy = true;
    this.combo += 1;
    this.audioEngine.playSuccess(this.selected.length + this.combo);
    const comboMultiplier = 1 + Math.min(4, this.combo - 1) * 0.25;
    const earnedScore = Math.round(this.selected.length * 10 * comboMultiplier);
    this.score += earnedScore;
    this.bestScore = Math.max(this.bestScore, this.score);
    localStorage.setItem(BEST_KEY, String(this.bestScore));

    const removed = [...this.selected];
    this.currentSum = 0;
    this.showComboFeedback(earnedScore, this.combo);
    this.refreshHud();

    this.removeCellsWithFx(removed, () => {
      this.collapseAndRefill(() => {
        this.clearSelection();
        this.busy = false;
      });
    });
  }

  removeCellsWithFx(cells, done) {
    if (cells.length === 0) {
      done();
      return;
    }

    let finished = 0;
    const target = cells.length;

    this.cameras.main.shake(130, 0.004);

    for (const cell of cells) {
      this.grid[cell.row][cell.col] = null;
      this.popEmitter.emitParticleAt(cell.container.x, cell.container.y, 20);

      this.tweens.add({
        targets: cell.container,
        angle: Phaser.Math.Between(-35, 35),
        scale: 1.5,
        alpha: 0,
        duration: 220,
        ease: "Back.In",
        onComplete: () => {
          cell.container.destroy();
          finished += 1;
          if (finished >= target) {
            done();
          }
        },
      });
    }

    const pop = this.add.text(270, 92, `+${Math.round(cells.length * 10 * (1 + Math.min(4, this.combo - 1) * 0.25))}`, {
      fontFamily: "Black Han Sans",
      fontSize: "38px",
      color: "#cb3b27",
      stroke: "#fff3d7",
      strokeThickness: 8,
    });
    pop.setOrigin(0.5);

    this.tweens.add({
      targets: pop,
      y: 52,
      alpha: 0,
      duration: 460,
      ease: "Cubic.Out",
      onComplete: () => pop.destroy(),
    });
  }

  collapseAndRefill(done) {
    let tweenCount = 0;
    let completeCount = 0;
    const onTweenDone = () => {
      completeCount += 1;
      if (completeCount >= tweenCount) {
        done();
      }
    };

    for (let col = 0; col < COLS; col += 1) {
      const survivors = [];
      for (let row = ROWS - 1; row >= 0; row -= 1) {
        const cell = this.grid[row][col];
        if (cell) survivors.push(cell);
      }

      let writeRow = ROWS - 1;
      for (const cell of survivors) {
        const previousRow = cell.row;
        this.grid[writeRow][col] = cell;
        cell.row = writeRow;
        cell.col = col;
        cell.container.setDepth(5 + writeRow);

        if (previousRow !== writeRow) {
          const targetY = this.getCellPosition(writeRow, col).y;
          tweenCount += 1;
          this.tweens.add({
            targets: cell.container,
            y: targetY,
            duration: 180 + (writeRow - previousRow) * 28,
            ease: "Cubic.Out",
            onComplete: onTweenDone,
          });
        }

        writeRow -= 1;
      }

      while (writeRow >= 0) {
        const value = this.getWeightedValue();
        const newCell = this.createCell(writeRow, col, value, true);
        this.grid[writeRow][col] = newCell;
        tweenCount += 1;
        this.tweens.add({
          targets: newCell.container,
          y: this.getCellPosition(writeRow, col).y,
          alpha: 1,
          duration: 240 + (writeRow + 1) * 26,
          ease: "Bounce.Out",
          onComplete: onTweenDone,
        });
        writeRow -= 1;
      }
    }

    if (tweenCount === 0) {
      done();
    }
  }

  getWeightedValue() {
    const totalWeight = NUMBER_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const item of NUMBER_WEIGHTS) {
      roll -= item.weight;
      if (roll <= 0) {
        return item.value;
      }
    }

    return 5;
  }

  showComboFeedback(earnedScore, combo) {
    if (combo <= 1) {
      this.comboText.setText("좋아!");
    } else {
      this.comboText.setText(`${combo} COMBO x${(1 + Math.min(4, combo - 1) * 0.25).toFixed(2)} (+${earnedScore})`);
    }

    this.comboText.setY(86);
    this.comboText.setAlpha(1);
    this.comboText.setScale(0.65);
    this.comboBadge.setY(86);
    this.comboBadge.setAlpha(1);
    this.comboBadge.setScale(0.65);
    this.comboBadge.setVisible(true);

    this.tweens.add({
      targets: this.comboBadge,
      y: 64,
      alpha: 0,
      scale: 1,
      duration: 620,
      ease: "Cubic.Out",
      onComplete: () => {
        this.comboBadge.setVisible(false);
      },
    });

    this.tweens.add({
      targets: this.comboText,
      y: 64,
      alpha: 0,
      scale: 1,
      duration: 620,
      ease: "Cubic.Out",
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "game-root",
  backgroundColor: "#eef8ff",
  scene: [AppleTenScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

window.addEventListener("beforeunload", () => {
  if (game && game.destroy) {
    game.destroy(true);
  }
});
