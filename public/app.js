const socket = io();

// State Variables
let currentGameType = null; // 'blackjack' | 'uno'
let myRoomCode = null;
let mySeatIndex = -1;
let currentBetAmount = 0;
let soundEnabled = true;
let lastRenderedRoundStatus = null;
let pendingWildCardId = null;

// Avatars List for Seats
const AVATAR_ICONS = ['🤖', '👾', '👽', '🎮', '⚡', '🐲', '🦁', '🦊'];

// Web Audio API Sound Generator
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (!soundEnabled) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'card') {
      const bufferSize = audioCtx.sampleRate * 0.08;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 1000;
      noise.connect(filter); filter.connect(gain);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      noise.start(now);
    } else if (type === 'chip') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
      gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'allin') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
      gain.gain.setValueAtTime(0.35, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    } else if (type === 'turn') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1);
      gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    } else if (type === 'win') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2); osc.frequency.setValueAtTime(1046.50, now + 0.3);
      gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'bust') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, now); osc.frequency.linearRampToValueAtTime(110, now + 0.3);
      gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'stack') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(350, now); osc.frequency.exponentialRampToValueAtTime(950, now + 0.25);
      gain.gain.setValueAtTime(0.35, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'reverse') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(900, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.22);
      gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    }
  } catch (e) { console.error('Audio error:', e); }
}

// DOM Screens
const splashScreen = document.getElementById('splash-screen');
const gameSelectScreen = document.getElementById('game-select-screen');
const bjLobbyScreen = document.getElementById('bj-lobby-screen');
const unoLobbyScreen = document.getElementById('uno-lobby-screen');
const bjGameScreen = document.getElementById('bj-game-screen');
const unoGameScreen = document.getElementById('uno-game-screen');

// Hub Buttons
const cardSelectBj = document.getElementById('card-select-bj');
const cardSelectUno = document.getElementById('card-select-uno');
const btnBackHubBj = document.getElementById('btn-back-hub-bj');
const btnBackHubUno = document.getElementById('btn-back-hub-uno');

// Blackjack DOM
const inputBjName = document.getElementById('bj-player-name');
const inputBjRoomCode = document.getElementById('bj-room-code-input');
const btnCreateSolo = document.getElementById('btn-create-solo');
const btnCreateBjRoom = document.getElementById('btn-create-bj-room');
const btnJoinBjRoom = document.getElementById('btn-join-bj-room');
const bjDisplayRoomCode = document.getElementById('bj-display-room-code');
const btnCopyBjCode = document.getElementById('btn-copy-bj-code');
const bjBadgeStatus = document.getElementById('bj-status-badge');
const bjBoxTimer = document.getElementById('bj-timer-box');
const bjCountTimer = document.getElementById('bj-timer-count');
const bjProgressTimer = document.getElementById('bj-timer-progress');
const dealerCardsContainer = document.getElementById('dealer-cards');
const dealerScoreBadge = document.getElementById('dealer-score-badge');
const bettingControls = document.getElementById('betting-controls');
const actionControls = document.getElementById('action-controls');
const displaySelectedBet = document.getElementById('current-selected-bet');
const btnConfirmBet = document.getElementById('btn-confirm-bet');
const btnMinusBet = document.getElementById('btn-minus-bet');
const btnChipHalf = document.getElementById('btn-chip-half');
const btnChipAllIn = document.getElementById('btn-chip-allin');
const btnHit = document.getElementById('btn-hit');
const btnStand = document.getElementById('btn-stand');
const btnDouble = document.getElementById('btn-double');
const btnSurrender = document.getElementById('btn-surrender');

// UNO DOM
const inputUnoName = document.getElementById('uno-player-name');
const inputUnoRoomCode = document.getElementById('uno-room-code-input');
const btnCreateUnoRoom = document.getElementById('btn-create-uno-room');
const btnJoinUnoRoom = document.getElementById('btn-join-uno-room');
const unoDisplayRoomCode = document.getElementById('uno-display-room-code');
const btnCopyUnoCode = document.getElementById('btn-copy-uno-code');
const unoStatusBadge = document.getElementById('uno-status-badge');
const btnStartUno = document.getElementById('btn-start-uno');
const btnLeaveUno = document.getElementById('btn-leave-uno');
const unoCurrentColor = document.getElementById('uno-current-color');
const btnDrawUnoCard = document.getElementById('btn-draw-uno-card');
const unoDiscardCardContainer = document.getElementById('uno-discard-card');
const unoDeckCount = document.getElementById('uno-deck-count');
const unoDirection = document.getElementById('uno-direction');
const unoMyCardsContainer = document.getElementById('uno-my-cards');
const btnDeclareUno = document.getElementById('btn-declare-uno');
const unoColorModal = document.getElementById('uno-color-modal');
const unoStackBadge = document.getElementById('uno-stack-badge');

let lastTopDiscardId = null;
let lastTurnDir = 1;
let lastPendingDraw = 0;
let lastTurnSeat = -1;
let latestUnoState = null;
let unoBgmInterval = null;
let unoBgmGain = null;

// FLY CARD ANIMATION FROM SEAT/HAND TO DISCARD PILE
function flyUnoCard(fromElem, toElem, imgSrc) {
  if (!fromElem || !toElem) return;
  try {
    const fromRect = fromElem.getBoundingClientRect();
    const toRect = toElem.getBoundingClientRect();

    const flyCard = document.createElement('img');
    flyCard.src = imgSrc || '/assets/uno/card_back.jpeg';
    flyCard.className = 'uno-flying-card';

    const startX = fromRect.left + fromRect.width / 2 - 32;
    const startY = fromRect.top + fromRect.height / 2 - 48;
    const endX = toRect.left + toRect.width / 2 - 32;
    const endY = toRect.top + toRect.height / 2 - 48;

    flyCard.style.cssText = `
      position: fixed;
      top: ${startY}px;
      left: ${startX}px;
      width: 64px;
      height: 94px;
      border-radius: 8px;
      border: 2px solid #ffffff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8);
      z-index: 9999;
      pointer-events: none;
      transition: transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s;
      transform: scale(0.85) rotate(${Math.floor(Math.random() * 20 - 10)}deg);
    `;

    document.body.appendChild(flyCard);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        flyCard.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1) rotate(${Math.floor(Math.random() * 12 - 6)}deg)`;
      });
    });

    setTimeout(() => { flyCard.remove(); }, 460);
  } catch (e) { console.error('Fly animation error:', e); }
}

// AMBIENT BACKGROUND MUSIC FOR UNO
function startUnoBGM() {
  if (!soundEnabled || unoBgmInterval) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    unoBgmGain = audioCtx.createGain();
    unoBgmGain.gain.setValueAtTime(0.03, audioCtx.currentTime);
    unoBgmGain.connect(audioCtx.destination);

    const chords = [
      [261.63, 329.63, 392.00, 493.88],
      [220.00, 261.63, 329.63, 392.00],
      [174.61, 220.00, 261.63, 349.23],
      [196.00, 246.94, 293.66, 349.23]
    ];
    let chordIdx = 0;

    const playChord = () => {
      if (!soundEnabled || currentGameType !== 'uno') { stopUnoBGM(); return; }
      const notes = chords[chordIdx % chords.length];
      chordIdx++;
      const now = audioCtx.currentTime;

      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        noteGain.gain.setValueAtTime(0.005, now + i * 0.08);
        noteGain.gain.linearRampToValueAtTime(0.035, now + i * 0.08 + 0.25);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

        osc.connect(noteGain);
        noteGain.connect(unoBgmGain);
        osc.start(now + i * 0.08);
        osc.stop(now + 1.9);
      });
    };

    playChord();
    unoBgmInterval = setInterval(playChord, 2000);
  } catch (e) { console.error('BGM error:', e); }
}

function stopUnoBGM() {
  if (unoBgmInterval) {
    clearInterval(unoBgmInterval);
    unoBgmInterval = null;
  }
}

// HOTKEYS FOR UNO (Phím U: Hô UNO, Phím C: Bắt UNO)
window.addEventListener('keydown', (e) => {
  if (currentGameType !== 'uno') return;
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea') return;

  const key = e.key.toLowerCase();
  if (key === 'u') {
    socket.emit('declare_uno');
    playSound('turn');
  } else if (key === 'c') {
    if (latestUnoState && latestUnoState.seats) {
      const targetIdx = latestUnoState.seats.findIndex((seat, idx) => {
        return idx !== mySeatIndex && seat && seat.cardCount === 1 && !seat.hasCalledUno;
      });
      if (targetIdx !== -1) {
        socket.emit('call_uno', { targetSeatIndex: targetIdx });
        playSound('bust');
      }
    }
  }
});

// Shared DOM
const btnSound = document.getElementById('btn-sound');
const btnChatToggle = document.getElementById('btn-chat-toggle');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const drawerChat = document.getElementById('chat-drawer');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
const rebuyModal = document.getElementById('rebuy-modal');
const btnClaimRebuy = document.getElementById('btn-claim-rebuy');

let activeTotalChips = 2000;

// 1. SPLASH SCREEN SEQUENCE
window.addEventListener('DOMContentLoaded', () => {
  splashScreen.classList.add('active');
  const savedName = localStorage.getItem('bj_player_name');
  if (savedName) {
    inputBjName.value = savedName;
    inputUnoName.value = savedName;
  }
  setTimeout(() => {
    splashScreen.classList.remove('active');
    gameSelectScreen.classList.add('active');
  }, 2500);
});

// 2. GAME SELECTION HUB LISTENERS
cardSelectBj.addEventListener('click', () => {
  gameSelectScreen.classList.remove('active');
  bjLobbyScreen.classList.add('active');
});

cardSelectUno.addEventListener('click', () => {
  gameSelectScreen.classList.remove('active');
  unoLobbyScreen.classList.add('active');
});

btnBackHubBj.addEventListener('click', () => {
  bjLobbyScreen.classList.remove('active');
  gameSelectScreen.classList.add('active');
});

btnBackHubUno.addEventListener('click', () => {
  unoLobbyScreen.classList.remove('active');
  gameSelectScreen.classList.add('active');
});

// 3. BLACKJACK LOBBY LISTENERS
btnCreateSolo.addEventListener('click', () => {
  const name = inputBjName.value.trim() || 'Player 1';
  localStorage.setItem('bj_player_name', name);
  socket.emit('create_room', { playerName: name, isSolo: true });
});

btnCreateBjRoom.addEventListener('click', () => {
  const name = inputBjName.value.trim() || 'Player 1';
  localStorage.setItem('bj_player_name', name);
  socket.emit('create_room', { playerName: name, isSolo: false });
});

btnJoinBjRoom.addEventListener('click', () => {
  const name = inputBjName.value.trim() || 'Player 1';
  const code = inputBjRoomCode.value.trim().toUpperCase();
  if (!code) return alert('Vui lòng nhập mã phòng!');
  localStorage.setItem('bj_player_name', name);
  socket.emit('join_room', { roomCode: code, playerName: name });
});

// 4. UNO LOBBY LISTENERS (MAX 8 PLAYERS, NO SOLO)
btnCreateUnoRoom.addEventListener('click', () => {
  const name = inputUnoName.value.trim() || 'Player 1';
  localStorage.setItem('bj_player_name', name);
  socket.emit('create_uno_room', { playerName: name });
});

btnJoinUnoRoom.addEventListener('click', () => {
  const name = inputUnoName.value.trim() || 'Player 1';
  const code = inputUnoRoomCode.value.trim().toUpperCase();
  if (!code) return alert('Vui lòng nhập mã phòng!');
  localStorage.setItem('bj_player_name', name);
  socket.emit('join_room', { roomCode: code, playerName: name });
});

btnStartUno.addEventListener('click', () => { socket.emit('start_uno_game'); });
btnLeaveUno.addEventListener('click', () => { window.location.href = '/'; });

// DECLARE UNO BUTTON (3D ROUND BUTTON)
btnDeclareUno.addEventListener('click', () => {
  socket.emit('declare_uno');
  playSound('turn');
});

// 5. SHARED LISTENERS
btnSound.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  btnSound.textContent = soundEnabled ? '🔊' : '🔇';
  if (!soundEnabled) stopUnoBGM();
  else if (currentGameType === 'uno' && latestUnoState && latestUnoState.status === 'PLAYING') startUnoBGM();
});

function copyRoomCode() {
  if (myRoomCode) {
    navigator.clipboard.writeText(myRoomCode).then(() => {
      alert(`Đã sao chép mã phòng: ${myRoomCode}`);
    });
  }
}

if (btnCopyBjCode) btnCopyBjCode.addEventListener('click', copyRoomCode);
if (btnCopyUnoCode) btnCopyUnoCode.addEventListener('click', copyRoomCode);

btnLeaveRoom.addEventListener('click', () => { window.location.href = '/'; });
btnChatToggle.addEventListener('click', () => drawerChat.classList.toggle('open'));
btnCloseChat.addEventListener('click', () => drawerChat.classList.remove('open'));

btnSendChat.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('send_chat', { text });
    chatInput.value = '';
  }
}

btnClaimRebuy.addEventListener('click', () => {
  rebuyModal.classList.add('hidden');
  playSound('win');
  socket.emit('claim_rebuy');
});

// 6. BLACKJACK BETTING & ACTIONS
function updateBetUI() {
  displaySelectedBet.textContent = `Cược: ${currentBetAmount} 🪙`;
  if (currentBetAmount > 0) btnMinusBet.classList.remove('hidden');
  else btnMinusBet.classList.add('hidden');

  document.querySelectorAll('.chip[data-val]').forEach(chip => {
    const val = parseInt(chip.getAttribute('data-val'), 10);
    if (currentBetAmount + val > activeTotalChips) chip.classList.add('disabled');
    else chip.classList.remove('disabled');
  });

  if (activeTotalChips <= 0 || currentBetAmount >= activeTotalChips) {
    btnChipHalf.classList.add('disabled');
    btnChipAllIn.classList.add('disabled');
  } else {
    btnChipHalf.classList.remove('disabled');
    btnChipAllIn.classList.remove('disabled');
  }
}

document.querySelectorAll('.chip[data-val]').forEach(chip => {
  chip.addEventListener('click', () => {
    const val = parseInt(chip.getAttribute('data-val'), 10);
    if (currentBetAmount + val <= activeTotalChips) {
      currentBetAmount += val;
      updateBetUI();
      playSound('chip');
    }
  });
});

btnChipHalf.addEventListener('click', () => {
  if (activeTotalChips > 0) {
    currentBetAmount = Math.max(10, Math.floor(activeTotalChips / 2));
    if (currentBetAmount > activeTotalChips) currentBetAmount = activeTotalChips;
    updateBetUI();
    playSound('chip');
  }
});

btnChipAllIn.addEventListener('click', () => {
  if (activeTotalChips > 0) {
    currentBetAmount = activeTotalChips;
    updateBetUI();
    playSound('allin');
  }
});

btnMinusBet.addEventListener('click', () => {
  currentBetAmount = 0;
  updateBetUI();
  socket.emit('place_bet', { amount: 0 });
  playSound('chip');
});

btnConfirmBet.addEventListener('click', () => {
  if (currentBetAmount <= 0) return alert('Vui lòng chọn số tiền cược!');
  if (currentBetAmount > activeTotalChips) return alert(`Vượt quá số dư hiện có (${activeTotalChips} 🪙)!`);
  socket.emit('place_bet', { amount: currentBetAmount });
  playSound('chip');
});

btnHit.addEventListener('click', () => { socket.emit('player_action', { action: 'hit' }); playSound('card'); });
btnStand.addEventListener('click', () => { socket.emit('player_action', { action: 'stand' }); });
btnDouble.addEventListener('click', () => { socket.emit('player_action', { action: 'double' }); playSound('chip'); });
btnSurrender.addEventListener('click', () => { socket.emit('player_action', { action: 'surrender' }); });

// 7. UNO GAME ACTIONS
btnDrawUnoCard.addEventListener('click', () => {
  socket.emit('draw_uno_card');
  playSound('card');
});

document.querySelectorAll('.btn-color').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.getAttribute('data-color');
    unoColorModal.classList.add('hidden');
    if (pendingWildCardId) {
      socket.emit('play_uno_card', { cardId: pendingWildCardId, chosenColor: color });
      playSound('card');
      pendingWildCardId = null;
    }
  });
});

// SOCKET EVENTS
socket.on('room_joined', ({ roomCode, seatIndex, isSolo, gameType }) => {
  myRoomCode = roomCode;
  mySeatIndex = seatIndex;
  currentGameType = gameType;

  bjLobbyScreen.classList.remove('active');
  unoLobbyScreen.classList.remove('active');

  if (gameType === 'blackjack') {
    bjDisplayRoomCode.textContent = roomCode;
    bjGameScreen.classList.add('active');
  } else if (gameType === 'uno') {
    unoDisplayRoomCode.textContent = roomCode;
    unoGameScreen.classList.add('active');
  }
});

socket.on('error_message', (msg) => { alert(msg); });

socket.on('chat_message', (msg) => {
  const div = document.createElement('div');
  div.className = `chat-msg ${msg.sender === 'System' ? 'system' : ''}`;
  div.innerHTML = `<span class="time">${msg.time}</span><div class="sender">${msg.sender}</div><div class="text">${msg.text}</div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('timer_tick', (seconds) => {
  if (currentGameType === 'blackjack') {
    bjCountTimer.textContent = seconds;
    const pct = Math.max(0, (seconds / 15) * 100);
    bjProgressTimer.style.width = `${pct}%`;
  }
});

socket.on('room_state', (state) => {
  if (state.gameType === 'blackjack') {
    renderBjState(state);
  } else if (state.gameType === 'uno') {
    renderUnoState(state);
  }
});

function renderBjState(state) {
  bjBadgeStatus.textContent = getBjStatusText(state.status);
  if (state.status === 'BETTING' || state.status === 'PLAYING') bjBoxTimer.classList.remove('hidden');
  else bjBoxTimer.classList.add('hidden');

  renderDealer(state.dealer);
  renderSeats(state.seats, state.currentTurnSeat, state.status);

  const mySeat = state.seats[mySeatIndex];
  if (mySeat) {
    activeTotalChips = mySeat.chips + mySeat.bet;

    if (mySeat.pendingRebuy || (mySeat.chips <= 0 && mySeat.bet === 0)) {
      rebuyModal.classList.remove('hidden');
    } else {
      rebuyModal.classList.add('hidden');
    }

    if (state.status === 'BETTING') {
      bettingControls.classList.remove('hidden');
      actionControls.classList.add('hidden');
      if (mySeat.bet > 0) currentBetAmount = mySeat.bet;
      updateBetUI();
    } else if (state.status === 'PLAYING' && state.currentTurnSeat === mySeatIndex && mySeat.status === 'PLAYING') {
      bettingControls.classList.add('hidden');
      actionControls.classList.remove('hidden');
      btnDouble.disabled = !(mySeat.hand.length === 2 && mySeat.chips >= mySeat.bet);
      btnDouble.style.opacity = btnDouble.disabled ? '0.5' : '1';
      btnSurrender.disabled = !(mySeat.hand.length === 2);
      btnSurrender.style.opacity = btnSurrender.disabled ? '0.5' : '1';
      playSound('turn');
    } else {
      bettingControls.classList.add('hidden');
      actionControls.classList.add('hidden');
    }
  }
  lastRenderedRoundStatus = state.status;
}

function getBjStatusText(status) {
  switch (status) {
    case 'WAITING': return 'Đang chờ...';
    case 'BETTING': return 'Đang Đặt Cược';
    case 'PLAYING': return 'Đang Chia Bài';
    case 'DEALER_TURN': return 'Lượt Nhà Cái';
    case 'ROUND_END': return 'Kết Thúc Ván';
    default: return status;
  }
}

function renderDealer(dealer) {
  dealerCardsContainer.innerHTML = '';
  if (!dealer || !dealer.hand || dealer.hand.length === 0) {
    dealerScoreBadge.classList.add('hidden'); return;
  }
  dealerScoreBadge.classList.remove('hidden');
  dealerScoreBadge.textContent = dealer.score;
  dealer.hand.forEach(card => dealerCardsContainer.appendChild(createBjCardElement(card)));
}

function renderSeats(seats, currentTurnSeat, roomStatus) {
  seats.forEach((seatData, idx) => {
    const seatElem = document.querySelector(`.seat[data-seat="${idx}"]`);
    if (!seatElem) return;

    const nameElem = seatElem.querySelector('.player-name');
    const chipsElem = seatElem.querySelector('.player-chips');
    const cardsElem = seatElem.querySelector('.cards-container');
    const scoreElem = seatElem.querySelector('.hand-score');
    const betElem = seatElem.querySelector('.bet-amount');
    const statusElem = seatElem.querySelector('.seat-status');
    const popupElem = seatElem.querySelector('.floating-popups');

    cardsElem.innerHTML = '';
    statusElem.className = 'seat-status';
    statusElem.textContent = '';
    seatElem.classList.remove('active-turn', 'empty');

    if (!seatData) {
      seatElem.classList.add('empty');
      nameElem.textContent = 'Ghế Trống'; chipsElem.textContent = '🪙 0';
      scoreElem.classList.add('hidden'); betElem.textContent = '';
    } else {
      nameElem.textContent = (idx === mySeatIndex) ? `⭐ ${seatData.name}` : seatData.name;
      chipsElem.textContent = `🪙 ${seatData.chips}`;
      if (seatData.bet > 0) betElem.textContent = `${seatData.bet} 🪙`;
      else betElem.textContent = '';

      if (currentTurnSeat === idx && roomStatus === 'PLAYING') seatElem.classList.add('active-turn');

      if (seatData.hand && seatData.hand.length > 0) {
        scoreElem.classList.remove('hidden'); scoreElem.textContent = seatData.score;
        seatData.hand.forEach(card => cardsElem.appendChild(createBjCardElement(card)));
      } else scoreElem.classList.add('hidden');

      if (seatData.status === 'BUSTED') {
        statusElem.classList.add('lose'); statusElem.textContent = 'QUẮC';
        seatElem.classList.add('shake-bust');
      } else if (seatData.status === 'STOOD') {
        statusElem.classList.add('push'); statusElem.textContent = 'DỪNG';
      } else if (seatData.status === 'BLACKJACK') {
        statusElem.classList.add('blackjack'); statusElem.textContent = 'BLACKJACK! 🃏';
      } else if (seatData.status === 'SURRENDERED') {
        statusElem.classList.add('lose'); statusElem.textContent = 'ĐẦU HÀNG';
      }

      if (roomStatus === 'ROUND_END' && seatData.result) {
        if (seatData.result === 'WIN' || seatData.result === 'BLACKJACK') {
          const netWin = Math.max(0, seatData.winAmount - seatData.bet);
          statusElem.classList.add('win'); statusElem.textContent = `THẮNG (+${netWin})`;
          if (idx === mySeatIndex && lastRenderedRoundStatus !== 'ROUND_END') {
            playSound('win');
            triggerFloatingText(popupElem, `+${netWin} 🪙`, seatData.result === 'BLACKJACK' ? 'blackjack' : 'win');
          }
        } else if (seatData.result === 'LOSE') {
          statusElem.classList.add('lose'); statusElem.textContent = 'THUA';
          if (idx === mySeatIndex && lastRenderedRoundStatus !== 'ROUND_END') {
            if (seatData.status === 'BUSTED') playSound('bust');
            triggerFloatingText(popupElem, `-${seatData.bet} 🪙`, 'lose');
          }
        } else if (seatData.result === 'PUSH') {
          statusElem.classList.add('push'); statusElem.textContent = 'HÒA';
        }
      }
    }
  });
}

function triggerFloatingText(containerElem, text, typeClass) {
  if (!containerElem) return;
  const floatDiv = document.createElement('div');
  floatDiv.className = `float-text ${typeClass}`;
  floatDiv.textContent = text;
  containerElem.appendChild(floatDiv);
  setTimeout(() => floatDiv.remove(), 1800);
}

function createBjCardElement(card) {
  const cardDiv = document.createElement('div');
  if (card.hidden) { cardDiv.className = 'playing-card hidden-card'; return cardDiv; }
  cardDiv.className = `playing-card ${card.color}`;
  cardDiv.innerHTML = `<div class="card-top"><span>${card.display}</span><span style="font-size:0.7rem">${card.suit}</span></div><div class="card-suit-big">${card.suit}</div>`;
  return cardDiv;
}

// 8. RENDER UNO GAME STATE (MATCHING ATTACHED SCREENSHOTS & STACKING ANIMATIONS)
function renderUnoState(state) {
  latestUnoState = state;
  if (state.status === 'PLAYING') startUnoBGM();

  unoStatusBadge.textContent = state.status === 'WAITING' ? 'Đang chờ (2-8 người)' : state.status === 'PLAYING' ? 'Đang Chơi UNO' : 'Kết Thúc Ván';
  unoCurrentColor.textContent = `MÀU HIỆN TẠI: ${(state.currentColor || 'RED').toUpperCase()}`;
  unoCurrentColor.style.background = state.currentColor === 'blue' ? '#5555ff' : state.currentColor === 'green' ? '#55aa55' : state.currentColor === 'yellow' ? '#ffaa00' : '#ff5555';
  unoCurrentColor.style.color = state.currentColor === 'yellow' ? 'black' : 'white';

  unoDeckCount.textContent = `(${state.drawPileCount || 0})`;
  
  // Render Stack Badge (+2 / +4 Stacking)
  const pendingDraw = state.pendingDrawCount || 0;
  if (unoStackBadge) {
    if (pendingDraw > 0) {
      unoStackBadge.classList.remove('hidden');
      unoStackBadge.textContent = `🔥 DỒN RÚT: +${pendingDraw} LÁ!`;
    } else {
      unoStackBadge.classList.add('hidden');
    }
  }

  // Direction indicator & Animation
  unoDirection.textContent = state.turnDirection === 1 ? 'Chiều: 🔄 Thuận' : 'Chiều: 🔄 Ngược';
  if (state.turnDirection !== lastTurnDir) {
    unoDirection.classList.remove('animate-reverse');
    void unoDirection.offsetWidth; // trigger reflow
    unoDirection.classList.add('animate-reverse');
    if (pendingDraw > 0) playSound('reverse');
  }

  // Render Discard Top Card Image & Play Animation (Card flying from seat to pile)
  unoDiscardCardContainer.innerHTML = '';
  if (state.topDiscardCard) {
    const img = document.createElement('img');
    img.src = state.topDiscardCard.image;
    img.alt = 'Top Discard Card';
    img.className = 'uno-discard-img';

    if (lastTopDiscardId && lastTopDiscardId !== state.topDiscardCard.id) {
      img.classList.add('animate-play');
      
      let fromElem = null;
      if (lastTurnSeat === mySeatIndex) {
        fromElem = unoMyCardsContainer;
      } else if (lastTurnSeat >= 0) {
        fromElem = document.querySelector(`.uno-seat-box[data-uno-seat="${lastTurnSeat}"]`);
      }
      if (fromElem) {
        flyUnoCard(fromElem, unoDiscardCardContainer, state.topDiscardCard.image);
      }

      if (pendingDraw > lastPendingDraw) {
        playSound('stack');
      } else if (state.turnDirection === lastTurnDir) {
        playSound('card');
      }
    }
    unoDiscardCardContainer.appendChild(img);
    lastTopDiscardId = state.topDiscardCard.id;
  }

  lastTurnSeat = state.currentTurnSeat;
  lastTurnDir = state.turnDirection;
  lastPendingDraw = pendingDraw;

  // Render 8 Seats in Ring
  state.seats.forEach((seatData, idx) => {
    const seatElem = document.querySelector(`.uno-seat-box[data-uno-seat="${idx}"]`);
    if (!seatElem) return;

    const nameElem = seatElem.querySelector('.uno-pname');
    const countElem = seatElem.querySelector('.uno-pcount');
    const cardsPreview = seatElem.querySelector('.uno-cards-preview');
    const callUnoBtn = seatElem.querySelector('.btn-call-uno');
    const avatarIconElem = seatElem.querySelector('.avatar-icon');

    if (avatarIconElem) avatarIconElem.textContent = AVATAR_ICONS[idx % AVATAR_ICONS.length];

    seatElem.classList.remove('active-turn', 'pending-draw-warning');
    cardsPreview.innerHTML = '';
    callUnoBtn.classList.add('hidden');

    if (!seatData) {
      nameElem.textContent = `Ghế ${idx + 1}`;
      countElem.textContent = `0`;
    } else {
      nameElem.textContent = (idx === mySeatIndex) ? `⭐ ${seatData.name}` : seatData.name;
      countElem.textContent = `${seatData.cardCount}`;
      if (state.currentTurnSeat === idx && state.status === 'PLAYING') {
        seatElem.classList.add('active-turn');
        if (pendingDraw > 0) {
          seatElem.classList.add('pending-draw-warning');
        }
      }

      // Render Card Back Preview images for opponents
      if (idx !== mySeatIndex && seatData.cardCount > 0) {
        const displayCount = Math.min(seatData.cardCount, 6);
        for (let i = 0; i < displayCount; i++) {
          const backImg = document.createElement('img');
          backImg.src = '/assets/uno/card_back.jpeg';
          backImg.className = 'opp-card-back';
          cardsPreview.appendChild(backImg);
        }
      }

      // Show "BẮT UNO" button for opponents who have 1 card left & HAVEN'T called UNO yet
      if (idx !== mySeatIndex && seatData.cardCount === 1 && !seatData.hasCalledUno && state.status === 'PLAYING') {
        callUnoBtn.classList.remove('hidden');
        callUnoBtn.onclick = () => {
          socket.emit('call_uno', { targetSeatIndex: idx });
          playSound('bust');
        };
      }
    }
  });

  // Render My Hand Cards (Player sees actual card face images)
  unoMyCardsContainer.innerHTML = '';
  const mySeat = state.seats[mySeatIndex];
  if (mySeat && mySeat.hand) {
    if (mySeat.hand.length === 1 && !mySeat.hasCalledUno) {
      btnDeclareUno.style.transform = 'scale(1.1)';
    } else {
      btnDeclareUno.style.transform = 'scale(1)';
    }

    mySeat.hand.forEach(card => {
      const cardImg = document.createElement('img');
      cardImg.src = card.image;
      cardImg.alt = `${card.color} ${card.value}`;
      cardImg.className = 'uno-img-card';

      cardImg.addEventListener('click', () => {
        if (state.currentTurnSeat !== mySeatIndex) return alert('Chưa đến lượt chơi của bạn!');
        if (card.type === 'wild') {
          pendingWildCardId = card.id;
          unoColorModal.classList.remove('hidden');
        } else {
          socket.emit('play_uno_card', { cardId: card.id });
        }
      });
      unoMyCardsContainer.appendChild(cardImg);
    });
  }
}
