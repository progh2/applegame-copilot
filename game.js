const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const missEl = document.getElementById("miss");

const startOverlay = document.getElementById("startOverlay");
const endOverlay = document.getElementById("endOverlay");
const endTitle = document.getElementById("endTitle");
const endMessage = document.getElementById("endMessage");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const GAME_TIME = 45;
const MAX_MISS = 5;

let player;
let apples;
let score;
let miss;
let timeLeft;
let running = false;
let keys = {
  left: false,
  right: false,
};

let lastFrameTime = 0;
let spawnCooldown = 0;

function resetGame() {
  player = {
    x: canvas.width / 2 - 45,
    y: canvas.height - 52,
    width: 90,
    height: 18,
    speed: 360,
  };

  apples = [];
  score = 0;
  miss = 0;
  timeLeft = GAME_TIME;
  spawnCooldown = 0;
  lastFrameTime = 0;

  updateHud();
  drawScene();
}

function startGame() {
  resetGame();
  running = true;
  startOverlay.classList.add("hidden");
  endOverlay.classList.add("hidden");
  requestAnimationFrame(gameLoop);
}

function endGame(reason) {
  running = false;
  endTitle.textContent = reason === "time" ? "시간 종료" : "실수 한도 초과";
  endMessage.textContent = `최종 점수 ${score}점! 다시 도전해 보세요.`;
  endOverlay.classList.remove("hidden");
}

function updateHud() {
  scoreEl.textContent = String(score);
  timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
  missEl.textContent = `${miss} / ${MAX_MISS}`;
}

function update(dt) {
  const intensity = 1 + (GAME_TIME - timeLeft) * 0.018;

  if (keys.left) {
    player.x -= player.speed * dt;
  }
  if (keys.right) {
    player.x += player.speed * dt;
  }

  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) {
    player.x = canvas.width - player.width;
  }

  spawnCooldown -= dt;
  if (spawnCooldown <= 0) {
    apples.push(createApple(intensity));
    spawnCooldown = Math.max(0.18, 0.75 / intensity);
  }

  const catchY = player.y - 4;

  apples.forEach((apple) => {
    apple.y += apple.speed * dt;
    apple.rotation += apple.spin * dt;
  });

  apples = apples.filter((apple) => {
    const caughtHorizontally =
      apple.x + apple.radius > player.x && apple.x - apple.radius < player.x + player.width;
    const caughtVertically = apple.y + apple.radius >= catchY && apple.y - apple.radius <= player.y + player.height;

    if (caughtHorizontally && caughtVertically) {
      score += 10;
      return false;
    }

    if (apple.y - apple.radius > canvas.height) {
      miss += 1;
      return false;
    }

    return true;
  });

  timeLeft -= dt;

  updateHud();

  if (miss >= MAX_MISS) {
    endGame("miss");
  } else if (timeLeft <= 0) {
    endGame("time");
  }
}

function createApple(intensity) {
  const radius = 14 + Math.random() * 6;
  return {
    x: radius + Math.random() * (canvas.width - radius * 2),
    y: -radius - 6,
    radius,
    speed: (150 + Math.random() * 110) * intensity,
    spin: (Math.random() * 3 + 2) * (Math.random() > 0.5 ? 1 : -1),
    rotation: Math.random() * Math.PI,
  };
}

function drawPlayer() {
  const basketX = player.x;
  const basketY = player.y;

  ctx.fillStyle = "#915529";
  ctx.fillRect(basketX, basketY, player.width, player.height);

  ctx.strokeStyle = "#6f3f1d";
  ctx.lineWidth = 2;
  for (let i = 8; i < player.width; i += 12) {
    ctx.beginPath();
    ctx.moveTo(basketX + i, basketY);
    ctx.lineTo(basketX + i, basketY + player.height);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.strokeStyle = "#5f3f2a";
  ctx.lineWidth = 4;
  ctx.arc(basketX + player.width / 2, basketY, player.width * 0.4, Math.PI, 2 * Math.PI);
  ctx.stroke();
}

function drawApple(apple) {
  ctx.save();
  ctx.translate(apple.x, apple.y);
  ctx.rotate(apple.rotation);

  ctx.beginPath();
  ctx.fillStyle = "#d7352a";
  ctx.arc(0, 0, apple.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.arc(-apple.radius * 0.3, -apple.radius * 0.35, apple.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5d3a1f";
  ctx.fillRect(-1.5, -apple.radius - 6, 3, 10);

  ctx.beginPath();
  ctx.fillStyle = "#2e8d3f";
  ctx.ellipse(4, -apple.radius - 6, 8, 4, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#dff3ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.65);

  ctx.fillStyle = "#7ac95a";
  ctx.fillRect(0, canvas.height * 0.65, canvas.width, canvas.height * 0.35);

  ctx.fillStyle = "#c9e8fa";
  for (let i = 0; i < 4; i += 1) {
    const cx = 80 + i * 110;
    const cy = 90 + (i % 2) * 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.arc(cx + 24, cy + 8, 20, 0, Math.PI * 2);
    ctx.arc(cx - 22, cy + 10, 17, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawScene() {
  drawBackground();
  apples.forEach(drawApple);
  drawPlayer();
}

function gameLoop(timestamp) {
  if (!running) return;

  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  const dt = Math.min(0.033, (timestamp - lastFrameTime) / 1000);
  lastFrameTime = timestamp;

  update(dt);
  drawScene();

  if (running) {
    requestAnimationFrame(gameLoop);
  }
}

function handleKeyDown(event) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = true;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = true;
  }
}

function handleKeyUp(event) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = false;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = false;
  }
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

resetGame();
