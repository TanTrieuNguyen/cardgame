const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ==========================================
// BLACKJACK ENGINE & HELPERS
// ==========================================
const BJ_SUITS = [
  { symbol: '♠', name: 'spades', color: 'black' },
  { symbol: '♥', name: 'hearts', color: 'red' },
  { symbol: '♦', name: 'diamonds', color: 'red' },
  { symbol: '♣', name: 'clubs', color: 'black' }
];

const BJ_VALUES = [
  { display: '2', weight: 2 },
  { display: '3', weight: 3 },
  { display: '4', weight: 4 },
  { display: '5', weight: 5 },
  { display: '6', weight: 6 },
  { display: '7', weight: 7 },
  { display: '8', weight: 8 },
  { display: '9', weight: 9 },
  { display: '10', weight: 10 },
  { display: 'J', weight: 10 },
  { display: 'Q', weight: 10 },
  { display: 'K', weight: 10 },
  { display: 'A', weight: 11 }
];

function createBjDeck(numDecks = 4) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of BJ_SUITS) {
      for (const val of BJ_VALUES) {
        deck.push({
          id: `bj-${suit.name}-${val.display}-${d}-${Math.random().toString(36).substr(2, 5)}`,
          suit: suit.symbol,
          suitName: suit.name,
          color: suit.color,
          display: val.display,
          weight: val.weight
        });
      }
    }
  }
  return shuffleDeck(deck);
}

function calculateBjScore(cards) {
  if (!cards || cards.length === 0) return { score: 0, isBust: false, isBlackjack: false };
  let score = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.display === 'A') {
      aces += 1;
      score += 11;
    } else {
      score += card.weight;
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return { score, isBust: score > 21, isBlackjack: cards.length === 2 && score === 21 };
}

// ==========================================
// UNO ENGINE - OFFICIAL 108 CARDS DECK
// ==========================================
const UNO_COLORS = ['Red', 'Blue', 'Green', 'Yellow'];

function getCardImageName(color, val) {
  if (val === 'wild') return '/assets/uno/Wild.jpg';
  if (val === 'wild4') return '/assets/uno/Wild_Draw_4.jpg';
  
  let valPart = val;
  if (val === 'draw2') valPart = 'Draw_2';
  else if (val === 'skip') valPart = 'Skip';
  else if (val === 'reverse') valPart = 'Reverse';
  
  return `/assets/uno/${color}_${valPart}.jpg`;
}

function createUnoDeck() {
  const deck = [];
  
  UNO_COLORS.forEach(color => {
    // 1 Zero card per color (4 cards)
    deck.push({
      id: `uno-${color}-0-${Math.random().toString(36).substr(2, 5)}`,
      color: color.toLowerCase(),
      value: '0',
      type: 'number',
      image: getCardImageName(color, '0')
    });

    // 2 of each 1-9 per color (72 cards)
    for (let i = 1; i <= 9; i++) {
      for (let k = 0; k < 2; k++) {
        deck.push({
          id: `uno-${color}-${i}-${k}-${Math.random().toString(36).substr(2, 5)}`,
          color: color.toLowerCase(),
          value: `${i}`,
          type: 'number',
          image: getCardImageName(color, `${i}`)
        });
      }
    }

    // 2 of each Action card per color (24 cards)
    ['draw2', 'skip', 'reverse'].forEach(action => {
      for (let k = 0; k < 2; k++) {
        deck.push({
          id: `uno-${color}-${action}-${k}-${Math.random().toString(36).substr(2, 5)}`,
          color: color.toLowerCase(),
          value: action,
          type: 'action',
          image: getCardImageName(color, action)
        });
      }
    });
  });

  // 4 Wild cards (4 cards)
  for (let k = 0; k < 4; k++) {
    deck.push({
      id: `uno-wild-${k}-${Math.random().toString(36).substr(2, 5)}`,
      color: 'wild',
      value: 'wild',
      type: 'wild',
      image: getCardImageName('Wild', 'wild')
    });
  }

  // 4 Wild Draw Four cards (4 cards)
  for (let k = 0; k < 4; k++) {
    deck.push({
      id: `uno-wild4-${k}-${Math.random().toString(36).substr(2, 5)}`,
      color: 'wild',
      value: 'wild4',
      type: 'wild',
      image: getCardImageName('Wild', 'wild4')
    });
  }

  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Global Rooms Store
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function sendSystemMessage(roomCode, message) {
  const room = rooms[roomCode];
  if (!room) return;
  const msgObj = { sender: 'System', text: message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  room.chat.push(msgObj);
  if (room.chat.length > 50) room.chat.shift();
  io.to(roomCode).emit('chat_message', msgObj);
}

function broadcastRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  if (room.gameType === 'blackjack') {
    io.to(roomCode).emit('room_state', {
      gameType: 'blackjack',
      code: room.code,
      status: room.status,
      maxPlayers: room.maxPlayers,
      isSoloMode: room.isSoloMode || false,
      currentTurnSeat: room.currentTurnSeat,
      timerSeconds: room.timerSeconds,
      dealer: {
        hand: room.status === 'PLAYING' || room.status === 'BETTING' || room.status === 'WAITING'
          ? room.dealer.hand.map((card, idx) => idx === 1 && room.status === 'PLAYING' ? { hidden: true } : card)
          : room.dealer.hand,
        score: room.status === 'PLAYING'
          ? calculateBjScore([room.dealer.hand[0]]).score
          : room.dealer.score
      },
      seats: room.seats.map(seat => {
        if (!seat) return null;
        return {
          socketId: seat.socketId,
          name: seat.name,
          chips: seat.chips,
          bet: seat.bet,
          hand: seat.hand,
          score: seat.score,
          status: seat.status,
          result: seat.result,
          winAmount: seat.winAmount,
          pendingRebuy: !!seat.pendingRebuy
        };
      })
    });
  } else if (room.gameType === 'uno') {
    io.to(roomCode).emit('room_state', {
      gameType: 'uno',
      code: room.code,
      status: room.status,
      maxPlayers: 8,
      currentTurnSeat: room.currentTurnSeat,
      turnDirection: room.turnDirection,
      currentColor: room.currentColor,
      pendingDrawCount: room.pendingDrawCount || 0,
      topDiscardCard: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
      drawPileCount: room.deck.length,
      winner: room.winner,
      seats: room.seats.map(seat => {
        if (!seat) return null;
        return {
          socketId: seat.socketId,
          name: seat.name,
          cardCount: seat.hand.length,
          hand: seat.hand, // Hand cards sent to player socket
          status: seat.status,
          hasCalledUno: !!seat.hasCalledUno
        };
      })
    });
  }
}

// ==========================================
// BLACKJACK GAME MACHINE
// ==========================================
function startBjBettingPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const seatedPlayers = room.seats.filter(s => s !== null);
  if (seatedPlayers.length === 0) {
    room.status = 'WAITING';
    broadcastRoomState(roomCode);
    return;
  }

  room.status = 'BETTING';
  room.currentTurnSeat = -1;
  room.dealer = { hand: [], score: 0, hiddenCard: null };
  
  room.seats.forEach(seat => {
    if (seat) {
      if (seat.chips <= 0) seat.pendingRebuy = true;
      seat.hand = [];
      seat.score = 0;
      seat.bet = 0;
      seat.status = 'BETTING';
      seat.result = null;
      seat.winAmount = 0;
    }
  });

  room.timerSeconds = room.isSoloMode ? 10 : 15;
  broadcastRoomState(roomCode);
  sendSystemMessage(roomCode, `Đặt cược để bắt đầu ván mới! (${room.timerSeconds}s)`);

  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timerSeconds--;
    io.to(roomCode).emit('timer_tick', room.timerSeconds);

    const allBet = room.seats.every(s => !s || s.bet > 0 || s.chips <= 0);
    if (room.timerSeconds <= 0 || allBet) {
      clearInterval(room.timer);
      room.timer = null;
      dealBjInitialCards(roomCode);
    }
  }, 1000);
}

function dealBjInitialCards(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const bettingSeats = room.seats.filter(s => s && s.bet > 0);
  if (bettingSeats.length === 0) {
    room.seats.forEach(seat => {
      if (seat && seat.chips >= 10) {
        seat.bet = Math.min(50, seat.chips);
        seat.chips -= seat.bet;
      }
    });
  }

  if (room.deck.length < 52) {
    room.deck = createBjDeck(4);
    sendSystemMessage(roomCode, '🔄 Đã xáo bộ bài 4 bộ mới!');
  }

  room.status = 'PLAYING';

  for (let i = 0; i < 2; i++) {
    room.seats.forEach(seat => {
      if (seat && seat.bet > 0) {
        const card = room.deck.pop();
        seat.hand.push(card);
        const { score, isBlackjack } = calculateBjScore(seat.hand);
        seat.score = score;
        if (isBlackjack) seat.status = 'BLACKJACK';
        else seat.status = 'PLAYING';
      } else if (seat) {
        seat.status = 'WAITING';
      }
    });

    const dealerCard = room.deck.pop();
    room.dealer.hand.push(dealerCard);
  }

  const dealerEval = calculateBjScore(room.dealer.hand);
  room.dealer.score = dealerEval.score;

  broadcastRoomState(roomCode);
  nextBjPlayerTurn(roomCode, 0);
}

function nextBjPlayerTurn(roomCode, startIndex = 0) {
  const room = rooms[roomCode];
  if (!room) return;

  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  let foundSeat = -1;
  for (let i = startIndex; i < room.maxPlayers; i++) {
    const seat = room.seats[i];
    if (seat && seat.bet > 0 && seat.status === 'PLAYING') {
      foundSeat = i;
      break;
    }
  }

  if (foundSeat !== -1) {
    room.currentTurnSeat = foundSeat;
    room.timerSeconds = 15;
    broadcastRoomState(roomCode);
    sendSystemMessage(roomCode, `Lượt chơi của ${room.seats[foundSeat].name}!`);

    room.timer = setInterval(() => {
      room.timerSeconds--;
      io.to(roomCode).emit('timer_tick', room.timerSeconds);
      if (room.timerSeconds <= 0) {
        clearInterval(room.timer);
        room.timer = null;
        const seat = room.seats[foundSeat];
        if (seat && seat.status === 'PLAYING') {
          seat.status = 'STOOD';
          sendSystemMessage(roomCode, `${seat.name} hết giờ và tự động dừng bài.`);
        }
        nextBjPlayerTurn(roomCode, foundSeat + 1);
      }
    }, 1000);
  } else {
    startBjDealerTurn(roomCode);
  }
}

function startBjDealerTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.status = 'DEALER_TURN';
  room.currentTurnSeat = -1;
  if (room.timer) clearInterval(room.timer);

  broadcastRoomState(roomCode);
  sendSystemMessage(roomCode, "Dealer lật lá bài úp!");

  const stepInterval = setInterval(() => {
    let dealerEval = calculateBjScore(room.dealer.hand);
    room.dealer.score = dealerEval.score;

    const hasActivePlayers = room.seats.some(s => s && s.bet > 0 && s.status !== 'BUSTED' && s.status !== 'SURRENDERED');

    if (dealerEval.score < 17 && hasActivePlayers) {
      const card = room.deck.pop();
      room.dealer.hand.push(card);
      dealerEval = calculateBjScore(room.dealer.hand);
      room.dealer.score = dealerEval.score;
      broadcastRoomState(roomCode);
    } else {
      clearInterval(stepInterval);
      resolveBjRoundResults(roomCode);
    }
  }, 1000);
}

function resolveBjRoundResults(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.status = 'ROUND_END';
  const dealerEval = calculateBjScore(room.dealer.hand);
  const dealerScore = dealerEval.score;
  const dealerBust = dealerEval.isBust;
  const dealerBlackjack = dealerEval.isBlackjack;

  room.seats.forEach(seat => {
    if (!seat || seat.bet <= 0) return;

    if (seat.status === 'SURRENDERED' || seat.status === 'BUSTED') {
      seat.result = 'LOSE';
      seat.winAmount = 0;
    } else {
      const { score, isBlackjack } = calculateBjScore(seat.hand);

      if (isBlackjack) {
        if (dealerBlackjack) {
          seat.result = 'PUSH';
          seat.winAmount = seat.bet;
          seat.chips += seat.winAmount;
        } else {
          seat.result = 'BLACKJACK';
          seat.winAmount = Math.floor(seat.bet * 2.5);
          seat.chips += seat.winAmount;
        }
      } else if (dealerBust || score > dealerScore) {
        seat.result = 'WIN';
        seat.winAmount = seat.bet * 2;
        seat.chips += seat.winAmount;
      } else if (score < dealerScore) {
        seat.result = 'LOSE';
        seat.winAmount = 0;
      } else {
        seat.result = 'PUSH';
        seat.winAmount = seat.bet;
        seat.chips += seat.winAmount;
      }
    }

    if (seat.chips <= 0) {
      seat.pendingRebuy = true;
    }
  });

  broadcastRoomState(roomCode);

  room.timerSeconds = room.isSoloMode ? 3 : 5;
  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timerSeconds--;
    io.to(roomCode).emit('timer_tick', room.timerSeconds);
    if (room.timerSeconds <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      startBjBettingPhase(roomCode);
    }
  }, 1000);
}

// ==========================================
// UNO GAME MACHINE (OFFICIAL 108 DECK)
// ==========================================
function startUnoGame(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.gameType !== 'uno') return;

  const activeSeats = room.seats.filter(s => s !== null);
  if (activeSeats.length < 2) {
    sendSystemMessage(roomCode, "Cần tối thiểu 2 người chơi để bắt đầu UNO!");
    return;
  }

  room.deck = createUnoDeck();
  room.discardPile = [];
  room.turnDirection = 1; // 1: Clockwise, -1: Counter-Clockwise
  room.pendingDrawCount = 0;
  room.status = 'PLAYING';
  room.winner = null;

  // Deal 7 cards to each seated player
  room.seats.forEach(seat => {
    if (seat) {
      seat.hand = [];
      seat.status = 'PLAYING';
      seat.hasCalledUno = false;
      for (let c = 0; c < 7; c++) {
        seat.hand.push(room.deck.pop());
      }
    }
  });

  // Flip top card for discard pile (Ensure non-wild start card)
  let topCard = room.deck.pop();
  while (topCard.type === 'wild') {
    room.deck.unshift(topCard);
    topCard = room.deck.pop();
  }

  room.discardPile.push(topCard);
  room.currentColor = topCard.color;

  // First player turn
  room.currentTurnSeat = room.seats.findIndex(s => s !== null);

  sendSystemMessage(roomCode, `🎮 Ván UNO (Bộ 108 lá chuẩn) mới bắt đầu! Lá bài mở đầu: ${topCard.color.toUpperCase()} ${topCard.value}`);
  broadcastRoomState(roomCode);
}

function advanceUnoTurn(roomCode, skipSteps = 1) {
  const room = rooms[roomCode];
  if (!room || room.gameType !== 'uno') return;

  const max = 8;
  let curr = room.currentTurnSeat;

  for (let step = 0; step < skipSteps; step++) {
    do {
      curr = (curr + room.turnDirection + max) % max;
    } while (room.seats[curr] === null);
  }

  room.currentTurnSeat = curr;
  broadcastRoomState(roomCode);
  sendSystemMessage(roomCode, `Lượt chơi của ${room.seats[curr].name}!`);
}

function drawCardForUnoPlayer(room, seatIndex, count = 1) {
  const seat = room.seats[seatIndex];
  if (!seat) return;

  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      if (room.discardPile.length > 1) {
        const topCard = room.discardPile.pop();
        room.deck = shuffleDeck(room.discardPile);
        room.discardPile = [topCard];
        sendSystemMessage(room.code, `🔄 Hết bài rút! Đã xáo lại các lá đã đánh làm bộ bài rút mới.`);
      } else {
        room.deck = createUnoDeck();
        sendSystemMessage(room.code, `🔄 Hết bộ 108 lá! Đã tạo lại bộ bài UNO 108 lá mới.`);
      }
    }
    const drawn = room.deck.pop();
    if (drawn) seat.hand.push(drawn);
  }

  // Reset UNO declaration if player now has > 1 card
  if (seat.hand.length > 1) {
    seat.hasCalledUno = false;
  }
}

// ==========================================
// SOCKET.IO EVENT HANDLERS
// ==========================================
io.on('connection', (socket) => {
  let userRoomCode = null;
  let userSeatIndex = -1;

  // 1. Create Blackjack Room
  socket.on('create_room', ({ playerName, isSolo }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) roomCode = generateRoomCode();

    rooms[roomCode] = {
      gameType: 'blackjack',
      code: roomCode,
      deck: createBjDeck(4),
      maxPlayers: isSolo ? 1 : 6,
      isSoloMode: !!isSolo,
      status: 'WAITING',
      seats: [null, null, null, null, null, null],
      dealer: { hand: [], score: 0 },
      currentTurnSeat: -1,
      timer: null,
      timerSeconds: 0,
      chat: []
    };

    const name = (playerName || 'Player 1').trim().substring(0, 15);
    rooms[roomCode].seats[0] = {
      socketId: socket.id,
      name: name,
      chips: 2000,
      bet: 0,
      hand: [],
      score: 0,
      status: 'WAITING',
      result: null,
      winAmount: 0,
      pendingRebuy: false
    };

    userRoomCode = roomCode;
    userSeatIndex = 0;

    socket.join(roomCode);
    socket.emit('room_joined', { roomCode, seatIndex: 0, isSolo: !!isSolo, gameType: 'blackjack' });
    sendSystemMessage(roomCode, `${name} đã tạo phòng Blackjack.`);
    startBjBettingPhase(roomCode);
  });

  // 2. Create UNO Room (Max 8 players, NO solo)
  socket.on('create_uno_room', ({ playerName }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) roomCode = generateRoomCode();

    rooms[roomCode] = {
      gameType: 'uno',
      code: roomCode,
      deck: [],
      discardPile: [],
      currentColor: 'red',
      turnDirection: 1,
      maxPlayers: 8,
      status: 'WAITING',
      seats: [null, null, null, null, null, null, null, null],
      currentTurnSeat: -1,
      winner: null,
      chat: []
    };

    const name = (playerName || 'Player 1').trim().substring(0, 15);
    rooms[roomCode].seats[0] = {
      socketId: socket.id,
      name: name,
      hand: [],
      status: 'WAITING',
      hasCalledUno: false
    };

    userRoomCode = roomCode;
    userSeatIndex = 0;

    socket.join(roomCode);
    socket.emit('room_joined', { roomCode, seatIndex: 0, isSolo: false, gameType: 'uno' });
    sendSystemMessage(roomCode, `${name} đã tạo phòng UNO (Bộ 108 lá chuẩn, Tối đa 8 người).`);
    broadcastRoomState(roomCode);
  });

  // 3. Join Room
  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      return socket.emit('error_message', 'Không tìm thấy phòng!');
    }

    const emptySeatIndex = room.seats.findIndex(s => s === null);
    if (emptySeatIndex === -1 || (room.isSoloMode && emptySeatIndex > 0)) {
      return socket.emit('error_message', 'Phòng đã đầy!');
    }

    const name = (playerName || `Player ${emptySeatIndex + 1}`).trim().substring(0, 15);
    if (room.gameType === 'blackjack') {
      room.seats[emptySeatIndex] = {
        socketId: socket.id,
        name: name,
        chips: 2000,
        bet: 0,
        hand: [],
        score: 0,
        status: room.status === 'BETTING' ? 'BETTING' : 'WAITING',
        result: null,
        winAmount: 0,
        pendingRebuy: false
      };
    } else {
      room.seats[emptySeatIndex] = {
        socketId: socket.id,
        name: name,
        hand: [],
        status: 'WAITING',
        hasCalledUno: false
      };
    }

    userRoomCode = code;
    userSeatIndex = emptySeatIndex;

    socket.join(code);
    socket.emit('room_joined', { roomCode: code, seatIndex: emptySeatIndex, isSolo: false, gameType: room.gameType });
    sendSystemMessage(code, `${name} đã tham gia phòng.`);

    if (room.gameType === 'blackjack' && room.status === 'WAITING') {
      startBjBettingPhase(code);
    } else {
      broadcastRoomState(code);
    }
  });

  // 4. Claim Rebuy (+200 Chips)
  socket.on('claim_rebuy', () => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType !== 'blackjack') return;

    const seat = room.seats[userSeatIndex];
    if (seat && (seat.chips <= 0 || seat.pendingRebuy)) {
      seat.chips = 200;
      seat.pendingRebuy = false;
      sendSystemMessage(userRoomCode, `🎁 ${seat.name} đã nhận 200 phỉnh và làm lại từ đầu!`);
      broadcastRoomState(userRoomCode);
    }
  });

  // 5. Start UNO Game
  socket.on('start_uno_game', () => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType === 'uno' && (room.status === 'WAITING' || room.status === 'ROUND_END')) {
      startUnoGame(userRoomCode);
    }
  });

  // 6. DECLARE UNO (Self Hô UNO)
  socket.on('declare_uno', () => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType !== 'uno') return;

    const seat = room.seats[userSeatIndex];
    if (seat && seat.hand.length === 1) {
      seat.hasCalledUno = true;
      sendSystemMessage(userRoomCode, `🚨 ${seat.name} đã HÔ UNO! (Còn 1 lá bài)`);
      broadcastRoomState(userRoomCode);
    }
  });

  // 7. CALL UNO (Bắt Quả Tang Ngược Người Chơi Khác Chưa Hô UNO)
  socket.on('call_uno', ({ targetSeatIndex }) => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType !== 'uno') return;

    const callerSeat = room.seats[userSeatIndex];
    const targetSeat = room.seats[targetSeatIndex];

    if (!targetSeat || targetSeat.hand.length !== 1) {
      return socket.emit('error_message', 'Người chơi này không có 1 lá bài!');
    }

    if (targetSeat.hasCalledUno) {
      return socket.emit('error_message', `${targetSeat.name} đã Hô UNO trước đó rồi!`);
    }

    // Penalty: Target player draws 2 cards!
    drawCardForUnoPlayer(room, targetSeatIndex, 2);
    targetSeat.hasCalledUno = false;
    sendSystemMessage(userRoomCode, `🚨 ${callerSeat.name} đã BẮT BÀI ${targetSeat.name} vì không hô UNO! ${targetSeat.name} bị phạt rút +2 lá bài!`);
    broadcastRoomState(userRoomCode);
  });

  // 8. Play UNO Card
  socket.on('play_uno_card', ({ cardId, chosenColor }) => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType !== 'uno' || room.status !== 'PLAYING') return;
    if (room.currentTurnSeat !== userSeatIndex) {
      return socket.emit('error_message', 'Chưa đến lượt chơi của bạn!');
    }

    const seat = room.seats[userSeatIndex];
    if (!seat) return;

    const cardIndex = seat.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return socket.emit('error_message', 'Bài không hợp lệ!');

    const card = seat.hand[cardIndex];
    const topCard = room.discardPile[room.discardPile.length - 1];

    // Check UNO Playable rules
    const isColorMatch = card.color === room.currentColor;
    const isValueMatch = (card.value && topCard && topCard.value && card.value === topCard.value);
    const isWild = card.type === 'wild';

    const pendingDraw = room.pendingDrawCount || 0;

    if (pendingDraw > 0) {
      let isValidCounter = false;
      if (card.value === 'wild4') {
        isValidCounter = true;
      } else if (card.value === 'draw2') {
        if (topCard.value === 'draw2' || isColorMatch) {
          isValidCounter = true;
        }
      } else if (card.value === 'reverse') {
        if (isColorMatch || topCard.value === 'reverse') {
          isValidCounter = true;
        }
      }

      if (!isValidCounter) {
        return socket.emit('error_message', `🔥 Bạn đang bị dồn rút +${pendingDraw} lá! Chỉ có thể đánh +2, +4, Đảo chiều (chuyển lại), hoặc bấm Rút Bài!`);
      }
    } else {
      if (!isColorMatch && !isValueMatch && !isWild) {
        return socket.emit('error_message', 'Lá bài không trùng Màu hoặc Số với lá trên cùng!');
      }
    }

    // Remove card from hand
    seat.hand.splice(cardIndex, 1);
    room.discardPile.push(card);

    // Reset declared UNO status if hand length != 1
    if (seat.hand.length !== 1) {
      seat.hasCalledUno = false;
    }

    // Update Color
    if (isWild) {
      room.currentColor = chosenColor || 'red';
      sendSystemMessage(userRoomCode, `${seat.name} đánh bài Wild và chọn màu ${room.currentColor.toUpperCase()}!`);
    } else {
      room.currentColor = card.color;
      sendSystemMessage(userRoomCode, `${seat.name} đánh ${card.color.toUpperCase()} ${card.value}`);
    }

    // WIN CONDITION
    if (seat.hand.length === 0) {
      room.status = 'ROUND_END';
      room.winner = userSeatIndex;
      sendSystemMessage(userRoomCode, `🏆 ${seat.name} ĐÃ CHIẾN THẮNG VÁN UNO! 🥇`);
      broadcastRoomState(userRoomCode);
      return;
    }

    // Warn if 1 card left
    if (seat.hand.length === 1 && !seat.hasCalledUno) {
      sendSystemMessage(userRoomCode, `⚠️ ${seat.name} chỉ còn 1 lá bài trên tay! (Chưa hô UNO)`);
    }

    // Action Card Effects & Turn advancement
    let skipSteps = 1;

    if (card.value === 'draw2') {
      room.pendingDrawCount = (room.pendingDrawCount || 0) + 2;
      sendSystemMessage(userRoomCode, `⚡ +2! Tổng cộng dồn rút: ${room.pendingDrawCount} lá bài!`);
      skipSteps = 1;
    } else if (card.value === 'wild4') {
      room.pendingDrawCount = (room.pendingDrawCount || 0) + 4;
      sendSystemMessage(userRoomCode, `🔥 +4! Tổng cộng dồn rút: ${room.pendingDrawCount} lá bài! (Màu chọn: ${room.currentColor.toUpperCase()})`);
      skipSteps = 1;
    } else if (card.value === 'reverse') {
      room.turnDirection *= -1;
      skipSteps = 1;
      if (pendingDraw > 0) {
        sendSystemMessage(userRoomCode, `🔄 ĐẢO CHIỀU! ${seat.name} đã PHẢN LẠI dồn rút +${room.pendingDrawCount} lá cho người trước đó!`);
      } else {
        sendSystemMessage(userRoomCode, `🔄 Đã đảo chiều lượt chơi!`);
      }
    } else if (card.value === 'skip') {
      skipSteps = 2;
      sendSystemMessage(userRoomCode, `🚫 Mất lượt người chơi tiếp theo!`);
    }

    advanceUnoTurn(userRoomCode, skipSteps);
  });

  // 9. Draw UNO Card
  socket.on('draw_uno_card', () => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType !== 'uno' || room.status !== 'PLAYING') return;
    if (room.currentTurnSeat !== userSeatIndex) {
      return socket.emit('error_message', 'Chưa đến lượt chơi của bạn!');
    }

    const seat = room.seats[userSeatIndex];
    if (!seat) return;

    const pendingDraw = room.pendingDrawCount || 0;
    if (pendingDraw > 0) {
      drawCardForUnoPlayer(room, userSeatIndex, pendingDraw);
      sendSystemMessage(userRoomCode, `💥 ${seat.name} không thể phản/cộng dồn và phải rút +${pendingDraw} lá bài!`);
      room.pendingDrawCount = 0;
    } else {
      drawCardForUnoPlayer(room, userSeatIndex, 1);
      sendSystemMessage(userRoomCode, `${seat.name} rút 1 lá bài.`);
    }

    advanceUnoTurn(userRoomCode, 1);
  });

  // 10. Blackjack Actions
  socket.on('player_action', ({ action }) => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType !== 'blackjack' || room.status !== 'PLAYING') return;
    if (room.currentTurnSeat !== userSeatIndex) return socket.emit('error_message', 'Chưa đến lượt!');

    const seat = room.seats[userSeatIndex];
    if (!seat || seat.status !== 'PLAYING') return;

    if (action === 'hit') {
      const card = room.deck.pop();
      seat.hand.push(card);
      const { score, isBust } = calculateBjScore(seat.hand);
      seat.score = score;
      sendSystemMessage(userRoomCode, `${seat.name} Rút bài (${score} điểm)`);

      if (isBust) {
        seat.status = 'BUSTED';
        sendSystemMessage(userRoomCode, `${seat.name} QUẮC (BUST) ${score} điểm! 💥`);
        nextBjPlayerTurn(userRoomCode, userSeatIndex + 1);
      } else if (score === 21) {
        seat.status = 'STOOD';
        nextBjPlayerTurn(userRoomCode, userSeatIndex + 1);
      } else {
        broadcastRoomState(userRoomCode);
      }
    } else if (action === 'stand') {
      seat.status = 'STOOD';
      sendSystemMessage(userRoomCode, `${seat.name} Dừng bài ở ${seat.score} điểm.`);
      nextBjPlayerTurn(userRoomCode, userSeatIndex + 1);
    } else if (action === 'double') {
      if (seat.hand.length !== 2 || seat.chips < seat.bet) return;
      seat.chips -= seat.bet;
      seat.bet *= 2;
      const card = room.deck.pop();
      seat.hand.push(card);
      const { score, isBust } = calculateBjScore(seat.hand);
      seat.score = score;
      sendSystemMessage(userRoomCode, `${seat.name} Gấp Đôi cược lên ${seat.bet} 🪙! (${score} điểm)`);

      if (isBust) seat.status = 'BUSTED';
      else seat.status = 'STOOD';
      nextBjPlayerTurn(userRoomCode, userSeatIndex + 1);
    } else if (action === 'surrender') {
      if (seat.hand.length !== 2) return;
      seat.status = 'SURRENDERED';
      const refund = Math.floor(seat.bet / 2);
      seat.chips += refund;
      sendSystemMessage(userRoomCode, `${seat.name} Đầu hàng. Nhận lại ${refund} 🪙.`);
      nextBjPlayerTurn(userRoomCode, userSeatIndex + 1);
    }
  });

  // 11. Blackjack Place Bet
  socket.on('place_bet', ({ amount }) => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    if (room.gameType !== 'blackjack' || room.status !== 'BETTING') return;

    const seat = room.seats[userSeatIndex];
    if (!seat) return;

    const betVal = parseInt(amount, 10);
    if (isNaN(betVal) || betVal < 0) return;

    const totalAvailable = seat.chips + seat.bet;
    if (betVal > totalAvailable) return socket.emit('error_message', `Cược vượt quá số tiền!`);

    seat.chips = totalAvailable - betVal;
    seat.bet = betVal;

    if (betVal > 0) sendSystemMessage(userRoomCode, `${seat.name} đặt cược ${betVal} 🪙`);
    else sendSystemMessage(userRoomCode, `${seat.name} đã hủy tiền cược.`);

    broadcastRoomState(userRoomCode);

    const allPlaced = room.seats.every(s => !s || s.bet > 0 || s.chips <= 0);
    if (allPlaced && room.timerSeconds > 1) room.timerSeconds = 1;
  });

  // 12. Chat Message
  socket.on('send_chat', ({ text }) => {
    if (!userRoomCode || !rooms[userRoomCode]) return;
    const room = rooms[userRoomCode];
    const seat = room.seats[userSeatIndex];
    const senderName = seat ? seat.name : 'Khán giả';

    const cleanText = (text || '').trim().substring(0, 100);
    if (!cleanText) return;

    const msgObj = {
      sender: senderName,
      text: cleanText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    room.chat.push(msgObj);
    if (room.chat.length > 50) room.chat.shift();
    io.to(userRoomCode).emit('chat_message', msgObj);
  });

  // 13. Disconnect
  socket.on('disconnect', () => {
    if (userRoomCode && rooms[userRoomCode]) {
      const room = rooms[userRoomCode];
      const seat = room.seats[userSeatIndex];

      if (seat) {
        sendSystemMessage(userRoomCode, `${seat.name} đã rời phòng.`);
        room.seats[userSeatIndex] = null;
      }

      if (room.gameType === 'blackjack' && room.status === 'PLAYING' && room.currentTurnSeat === userSeatIndex) {
        nextBjPlayerTurn(userRoomCode, userSeatIndex + 1);
      } else if (room.gameType === 'uno' && room.status === 'PLAYING' && room.currentTurnSeat === userSeatIndex) {
        advanceUnoTurn(userRoomCode, 1);
      } else {
        broadcastRoomState(userRoomCode);
      }

      const isRoomEmpty = room.seats.every(s => s === null);
      if (isRoomEmpty) {
        if (room.timer) clearInterval(room.timer);
        delete rooms[userRoomCode];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎴 Card Game Platform running on port ${PORT}`);
});
