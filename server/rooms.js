import { WORD_SETS, LANGUAGES, DEFAULT_LANGUAGE } from './words.js';

export const BOARD_SIZE = 24;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const EMPTY_ROOM_TTL = 5 * 60 * 1000; // keep a room alive this long with nobody in it

/**
 * Room rules, chosen by whoever creates the room and fixed for its lifetime.
 * - language: which word pool the rack is drawn from ('en' | 'ar').
 * - showOpponentProgress: reveal how many cards the opponent has left standing.
 * - suddenDeath: a wrong call loses the match outright, instead of costing the turn.
 */
const DEFAULT_SETTINGS = {
  language: DEFAULT_LANGUAGE,
  showOpponentProgress: false,
  suddenDeath: false,
};

function cleanSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.showOpponentProgress === 'boolean') {
      settings.showOpponentProgress = raw.showOpponentProgress;
    }
    if (typeof raw.suddenDeath === 'boolean') settings.suddenDeath = raw.suddenDeath;
    if (LANGUAGES.includes(raw.language)) settings.language = raw.language;
  }
  return settings;
}

/** @type {Map<string, Room>} */
const rooms = new Map();

/*
Room shape:
{
  code, phase: 'lobby' | 'playing' | 'over',
  board: string[BOARD_SIZE],
  round: number,          // bumped every new match so clients know to rebuild
  turn: 0 | 1,
  starter: 0 | 1,
  winner: 0 | 1 | null,
  message: string,
  players: [Player|null, Player|null],
  emptySince: number|null,
}

Player shape:
{ pid, name, ws|null, secret: number, flipped: Set<number>, rematch: boolean }
*/

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function drawBoard(language) {
  const pool = (WORD_SETS[language] ?? WORD_SETS[DEFAULT_LANGUAGE]).words.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, BOARD_SIZE);
}

/**
 * Wrap in Unicode directional isolates. These messages mix an English sentence
 * with a player-chosen name and a board word that may be Arabic; without the
 * isolate the quotes and full stop jump to the wrong end of the run.
 */
function isolate(text) {
  return `⁨${text}⁩`;
}

function cleanName(name) {
  const trimmed = String(name ?? '').trim().slice(0, 14);
  return trimmed || 'Player';
}

function send(ws, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
}

/**
 * `code` lets the client react to the kind of failure rather than parse the
 * message. `no_room` in particular means the room is gone for good — usually
 * because the process restarted — so the client should drop back to the lobby.
 */
function fail(ws, msg, code = null) {
  send(ws, { t: 'error', msg, code });
}

/** Per-player view of the room: never leaks the opponent's secret or board flips. */
function stateFor(room, seat) {
  const me = room.players[seat];
  const them = room.players[1 - seat];
  const view = {
    t: 'state',
    code: room.code,
    phase: room.phase,
    seat,
    round: room.round,
    turn: room.turn,
    name: me?.name ?? '',
    opponent: them ? { name: them.name, online: !!them.ws } : null,
    message: room.message,
    board: room.phase === 'lobby' ? null : room.board,
    secret: me && room.phase !== 'lobby' ? room.board[me.secret] : null,
    flipped: me ? [...me.flipped] : [],
    misses: me?.misses ?? 0,
    settings: room.settings,
    rematchReady: room.players.map((p) => !!p?.rematch),
  };
  // Withheld unless the room was created with the setting on — the client
  // never receives a number it isn't allowed to show.
  if (room.settings.showOpponentProgress) {
    view.opponentStanding = them ? BOARD_SIZE - them.flipped.size : BOARD_SIZE;
  }
  if (room.phase === 'over') {
    view.winner = room.winner;
    view.reveal = {
      yours: me ? room.board[me.secret] : null,
      theirs: them ? room.board[them.secret] : null,
    };
  }
  return view;
}

function broadcast(room) {
  room.players.forEach((p, seat) => {
    if (p?.ws) send(p.ws, stateFor(room, seat));
  });
}

function startMatch(room) {
  room.board = drawBoard(room.settings.language);
  room.round += 1;
  room.phase = 'playing';
  room.winner = null;
  room.starter = 1 - room.starter;
  room.turn = room.starter;
  room.message = '';
  const a = Math.floor(Math.random() * BOARD_SIZE);
  let b = Math.floor(Math.random() * BOARD_SIZE);
  while (b === a) b = Math.floor(Math.random() * BOARD_SIZE); // distinct secrets
  [a, b].forEach((secret, seat) => {
    const p = room.players[seat];
    if (!p) return;
    p.secret = secret;
    p.flipped = new Set();
    p.misses = 0;
    p.rematch = false;
  });
}

function seatOf(room, ws) {
  return room.players.findIndex((p) => p?.ws === ws);
}

function attach(ws, room, seat) {
  ws.roomCode = room.code;
  ws.seat = seat;
  room.emptySince = null;
}

// ---------------------------------------------------------------- commands

function cmdCreate(ws, msg) {
  const room = {
    code: makeCode(),
    phase: 'lobby',
    board: [],
    round: 0,
    turn: 0,
    starter: 1,
    winner: null,
    message: '',
    settings: cleanSettings(msg.settings),
    players: [null, null],
    emptySince: null,
  };
  room.players[0] = {
    pid: msg.pid,
    name: cleanName(msg.name),
    ws,
    secret: 0,
    flipped: new Set(),
    misses: 0,
    rematch: false,
  };
  rooms.set(room.code, room);
  attach(ws, room, 0);
  broadcast(room);
}

function cmdJoin(ws, msg) {
  const code = String(msg.code ?? '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) return fail(ws, `No room called ${code || '????'}.`, 'no_room');

  // Reconnect: same player id, seat still held but socket dropped.
  const mine = room.players.findIndex((p) => p && p.pid === msg.pid);
  if (mine !== -1) {
    room.players[mine].ws = ws;
    room.players[mine].name = cleanName(msg.name);
    room.message = `${isolate(room.players[mine].name)} reconnected.`;
    attach(ws, room, mine);
    broadcast(room);
    return;
  }

  const free = room.players.findIndex((p) => p === null);
  if (free === -1) return fail(ws, `Room ${code} is full.`, 'room_full');

  room.players[free] = {
    pid: msg.pid,
    name: cleanName(msg.name),
    ws,
    secret: 0,
    flipped: new Set(),
    misses: 0,
    rematch: false,
  };
  attach(ws, room, free);
  if (room.players[0] && room.players[1]) startMatch(room);
  broadcast(room);
}

function cmdFlip(room, seat, msg) {
  if (room.phase !== 'playing') return;
  const index = Number(msg.index);
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return;
  const me = room.players[seat];
  if (msg.down) me.flipped.add(index);
  else me.flipped.delete(index);
  broadcast(room);
}

function cmdEndTurn(room, seat) {
  if (room.phase !== 'playing' || room.turn !== seat) return;
  room.turn = 1 - seat;
  room.message = '';
  broadcast(room);
}

function cmdGuess(room, seat, msg) {
  if (room.phase !== 'playing') return;
  const me = room.players[seat];
  const them = room.players[1 - seat];
  if (room.turn !== seat) return fail(me.ws, 'You can only guess on your turn.');
  if (!them) return fail(me.ws, 'Your opponent left.');
  const index = Number(msg.index);
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return;

  const word = room.board[index];

  if (index === them.secret) {
    room.phase = 'over';
    room.winner = seat;
    room.message = `${isolate(me.name)} called "${isolate(word)}" — dead on.`;
    room.players.forEach((p) => p && (p.rematch = false));
    broadcast(room);
    return;
  }

  me.misses += 1;

  if (room.settings.suddenDeath) {
    room.phase = 'over';
    room.winner = 1 - seat;
    room.message = `${isolate(me.name)} called "${isolate(word)}" — wrong.`;
    room.players.forEach((p) => p && (p.rematch = false));
    broadcast(room);
    return;
  }

  // Survivable miss: the card is provably not it, so knock it down for them,
  // and hand the turn over so nobody can brute-force the whole rack at once.
  me.flipped.add(index);
  room.turn = 1 - seat;
  room.message = `${isolate(me.name)} called "${isolate(word)}" — wrong. Turn passes.`;
  broadcast(room);
}

function cmdRematch(room, seat) {
  if (room.phase !== 'over') return;
  room.players[seat].rematch = true;
  if (room.players[0]?.rematch && room.players[1]?.rematch) startMatch(room);
  broadcast(room);
}

// ---------------------------------------------------------------- dispatch

export function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return fail(ws, 'Malformed message.');
  }
  if (!msg || typeof msg.t !== 'string') return;
  if (typeof msg.pid !== 'string' || msg.pid.length > 64) msg.pid = null;

  if (msg.t === 'create') return cmdCreate(ws, msg);
  if (msg.t === 'join') return cmdJoin(ws, msg);

  // Both of these mean the room this socket belonged to no longer exists —
  // after a redeploy or a free-tier spin-down, every room is gone.
  const room = rooms.get(ws.roomCode);
  if (!room) return fail(ws, 'That room no longer exists.', 'no_room');
  const seat = seatOf(room, ws);
  if (seat === -1) return fail(ws, 'You are not seated in this room.', 'no_room');

  switch (msg.t) {
    case 'flip': return cmdFlip(room, seat, msg);
    case 'endTurn': return cmdEndTurn(room, seat);
    case 'guess': return cmdGuess(room, seat, msg);
    case 'rematch': return cmdRematch(room, seat);
    case 'ping': return send(ws, { t: 'pong' });
    default: return fail(ws, `Unknown command "${msg.t}".`);
  }
}

export function handleClose(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const seat = seatOf(room, ws);
  if (seat === -1) return;

  const player = room.players[seat];
  player.ws = null;
  if (room.phase === 'lobby') {
    room.players[seat] = null; // nothing to preserve yet, free the seat
  } else {
    room.message =
      `${isolate(player.name)} dropped — the seat is held, they can rejoin with the code.`;
  }
  if (!room.players[0]?.ws && !room.players[1]?.ws) room.emptySince = Date.now();
  broadcast(room);
}

/** Reap rooms nobody has been connected to for a while. */
export function sweepRooms(now = Date.now()) {
  for (const [code, room] of rooms) {
    if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL) rooms.delete(code);
  }
}

export function roomCount() {
  return rooms.size;
}
