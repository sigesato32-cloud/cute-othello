const EMPTY = 0;
const DARK = 1;
const LIGHT = 2;
const SIZE = 8;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];
const FLIP_DURATION = 920;
const FLIP_GAP = 110;

const TEXT = {
  dark: "\u304f\u308d",
  light: "\u3057\u308d",
  empty: "\u304b\u3089\u3063\u307d",
  row: "\u304e\u3087\u3046",
  col: "\u308c\u3064",
  guide: "\u304a\u3051\u308b\u3068\u3053\u308d\u304c\u3001\u304d\u3089\u304d\u3089\u5149\u308b\u3088\u3002",
  pass: "\u306f\u304a\u3084\u3059\u307f\u3002",
  turn: "\u306e\u3070\u3093\u3060\u3088\u3002",
  draw: "\u304a\u3057\u307e\u3044\u3002\u306a\u304b\u3088\u304f\u3072\u304d\u308f\u3051\uff01",
  end: "\u304a\u3057\u307e\u3044\u3002",
  win: "\u306e\u304b\u3061\uff01",
};

const boardElement = document.querySelector("#board");
const turnLabel = document.querySelector("#turn-label");
const darkScore = document.querySelector("#dark-score");
const lightScore = document.querySelector("#light-score");
const message = document.querySelector("#message");
const resetButton = document.querySelector("#reset-button");
const guideModeSelect = document.querySelector("#guide-mode");

let board = [];
let currentPlayer = DARK;
let gameOver = false;
let flippingKeys = new Set();
let isAnimating = false;
let audioContext = null;
let guideMoveIndex = 0;
let guideTimer = null;

function createBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  board[3][3] = LIGHT;
  board[3][4] = DARK;
  board[4][3] = DARK;
  board[4][4] = LIGHT;
  currentPlayer = DARK;
  gameOver = false;
  flippingKeys = new Set();
  isAnimating = false;
  guideMoveIndex = 0;
  render();
}

function opponentOf(player) {
  return player === DARK ? LIGHT : DARK;
}

function playerName(player) {
  return player === DARK ? TEXT.dark : TEXT.light;
}

function isInside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function getFlips(row, col, player) {
  if (board[row][col] !== EMPTY) return [];

  const opponent = opponentOf(player);
  const flips = [];

  for (const [rowStep, colStep] of DIRECTIONS) {
    const line = [];
    let nextRow = row + rowStep;
    let nextCol = col + colStep;

    while (isInside(nextRow, nextCol) && board[nextRow][nextCol] === opponent) {
      line.push([nextRow, nextCol]);
      nextRow += rowStep;
      nextCol += colStep;
    }

    if (line.length > 0 && isInside(nextRow, nextCol) && board[nextRow][nextCol] === player) {
      flips.push(...line);
    }
  }

  return flips;
}

function getValidMoves(player) {
  const moves = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const flips = getFlips(row, col, player);
      if (flips.length > 0) moves.push({ row, col, flips });
    }
  }

  return moves;
}

function getFlipLines(row, col, player) {
  const opponent = opponentOf(player);
  const lines = [];

  for (const [rowStep, colStep] of DIRECTIONS) {
    const line = [];
    let nextRow = row + rowStep;
    let nextCol = col + colStep;

    while (isInside(nextRow, nextCol) && board[nextRow][nextCol] === opponent) {
      line.push([nextRow, nextCol]);
      nextRow += rowStep;
      nextCol += colStep;
    }

    if (line.length > 0 && isInside(nextRow, nextCol) && board[nextRow][nextCol] === player) {
      const [targetRow, targetCol] = line[line.length - 1];
      lines.push({ from: [row, col], to: [targetRow, targetCol] });
    }
  }

  return lines;
}

async function placePiece(row, col) {
  if (gameOver || isAnimating) return;

  const flips = getFlips(row, col, currentPlayer);
  if (flips.length === 0) return;

  ensureAudioContext();
  isAnimating = true;
  board[row][col] = currentPlayer;
  render();

  for (const [flipRow, flipCol] of flips) {
    await sleep(FLIP_GAP);
    board[flipRow][flipCol] = currentPlayer;
    flippingKeys = new Set([`${flipRow}-${flipCol}`]);
    render();
    playNyanSound();
    await sleep(FLIP_DURATION);
    flippingKeys = new Set();
    render();
  }

  changeTurn();
  isAnimating = false;
  render();
}

function changeTurn() {
  const nextPlayer = opponentOf(currentPlayer);

  if (getValidMoves(nextPlayer).length > 0) {
    currentPlayer = nextPlayer;
    return;
  }

  if (getValidMoves(currentPlayer).length > 0) {
    message.textContent = `${playerName(nextPlayer)}${TEXT.pass}${playerName(currentPlayer)}${TEXT.turn}`;
    return;
  }

  gameOver = true;
}

function countPieces() {
  return board.flat().reduce(
    (score, cell) => {
      if (cell === DARK) score.dark += 1;
      if (cell === LIGHT) score.light += 1;
      return score;
    },
    { dark: 0, light: 0 }
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function playNyanSound() {
  const context = ensureAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
  master.connect(context.destination);

  const notes = [
    { start: 0, frequency: 740, end: 0.16 },
    { start: 0.12, frequency: 980, end: 0.34 },
  ];

  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(note.frequency * 0.92, now + note.start);
    oscillator.frequency.exponentialRampToValueAtTime(note.frequency, now + note.end);
    gain.gain.setValueAtTime(0.0001, now + note.start);
    gain.gain.exponentialRampToValueAtTime(0.65, now + note.start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.end);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now + note.start);
    oscillator.stop(now + note.end + 0.03);
  }
}

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  audioContext ||= new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function renderPiece(value, isFlipping = false) {
  if (value === EMPTY) return "";
  const color = value === DARK ? "dark" : "light";
  const flipClass = isFlipping ? " flipping" : "";

  return `
    <span class="piece ${color}${flipClass}" aria-hidden="true">
      <span class="piece-side"></span>
      <span class="piece-face">
        <span class="ear ear-left"></span>
        <span class="ear ear-right"></span>
        <span class="eye eye-left"></span>
        <span class="eye eye-right"></span>
        <span class="mouth"></span>
      </span>
    </span>
  `;
}

function render() {
  const validMoves = getValidMoves(currentPlayer);
  const validMoveKeys = new Set(validMoves.map((move) => `${move.row}-${move.col}`));
  const guideColor = currentPlayer === DARK ? "dark" : "light";
  const guideMode = guideModeSelect.value;
  const showGuideDots = guideMode !== "off";
  const showGuideLines = guideMode === "full";
  syncGuideCycle(showGuideLines ? validMoves.length : 0);

  boardElement.innerHTML = "";
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const button = document.createElement("button");
      const key = `${row}-${col}`;
      const isValid = validMoveKeys.has(key);
      const cellValue = board[row][col];

      button.className = `cell${
        isValid && !gameOver && !isAnimating && showGuideDots ? ` valid ${guideColor}` : ""
      }`;
      button.type = "button";
      button.role = "gridcell";
      button.ariaLabel = `${row + 1}${TEXT.row} ${col + 1}${TEXT.col} ${
        cellValue === EMPTY ? TEXT.empty : playerName(cellValue)
      }`;
      button.disabled = !isValid || gameOver || isAnimating;
      button.innerHTML = renderPiece(cellValue, flippingKeys.has(key));
      button.addEventListener("click", () => placePiece(row, col));
      boardElement.appendChild(button);
    }
  }
  if (showGuideLines) renderGuideLines(validMoves, guideColor);

  const scores = countPieces();
  darkScore.textContent = scores.dark;
  lightScore.textContent = scores.light;
  turnLabel.innerHTML = `<span class="piece-preview ${guideColor}"></span>${playerName(currentPlayer)}`;

  if (gameOver) {
    if (scores.dark === scores.light) {
      message.textContent = TEXT.draw;
    } else {
      const winner = scores.dark > scores.light ? DARK : LIGHT;
      message.textContent = `${TEXT.end}${playerName(winner)}${TEXT.win}`;
    }
  } else if (message.textContent.includes(TEXT.pass)) {
    setTimeout(() => {
      if (!gameOver) message.textContent = TEXT.guide;
    }, 1300);
  } else {
    message.textContent = TEXT.guide;
  }
}

function renderGuideLines(validMoves, guideColor) {
  if (gameOver || isAnimating || validMoves.length === 0) return;

  const activeMove = validMoves[guideMoveIndex % validMoves.length];
  const lines = getFlipLines(activeMove.row, activeMove.col, currentPlayer);
  if (lines.length === 0) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("guide-lines", guideColor);
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");

  for (const line of lines) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "line");
    element.setAttribute("x1", cellCenter(line.from[1]));
    element.setAttribute("y1", cellCenter(line.from[0]));
    element.setAttribute("x2", cellCenter(line.to[1]));
    element.setAttribute("y2", cellCenter(line.to[0]));
    svg.appendChild(element);
  }

  boardElement.appendChild(svg);
}

function cellCenter(index) {
  return ((index + 0.5) / SIZE) * 100;
}

function syncGuideCycle(validMoveCount) {
  if (gameOver || isAnimating || validMoveCount === 0) {
    stopGuideCycle();
    return;
  }

  guideMoveIndex %= validMoveCount;
  if (guideTimer) return;

  guideTimer = window.setInterval(() => {
    const moves = getValidMoves(currentPlayer);
    if (gameOver || isAnimating || moves.length === 0) {
      stopGuideCycle();
      return;
    }

    guideMoveIndex = (guideMoveIndex + 1) % moves.length;
    render();
  }, 1500);
}

function stopGuideCycle() {
  if (!guideTimer) return;
  window.clearInterval(guideTimer);
  guideTimer = null;
}

resetButton.addEventListener("click", createBoard);
guideModeSelect.addEventListener("change", () => {
  guideMoveIndex = 0;
  render();
});
createBoard();
