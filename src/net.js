const PID_KEY = 'word-duel-pid';
const ROOM_KEY = 'word-duel-room';

/**
 * Per-tab, not per-browser: sessionStorage survives a refresh (so a reconnect
 * gets the same seat back) but two tabs on one machine still count as two
 * different players, which is how everyone tests this first.
 */
function playerId() {
  let pid = sessionStorage.getItem(PID_KEY);
  if (!pid) {
    pid = crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now();
    sessionStorage.setItem(PID_KEY, pid);
  }
  return pid;
}

function readRoom() {
  try {
    return JSON.parse(sessionStorage.getItem(ROOM_KEY)) || null;
  } catch {
    return null;
  }
}

function writeRoom(room) {
  if (room) sessionStorage.setItem(ROOM_KEY, JSON.stringify(room));
  else sessionStorage.removeItem(ROOM_KEY);
}

/**
 * Thin WebSocket wrapper. Survives a dropped connection: on reconnect it
 * re-joins the last room with the same player id, and the server hands the
 * seat back with the match intact.
 */
export class Net {
  constructor({ onState, onError, onStatus }) {
    this.pid = playerId();
    this.onState = onState;
    this.onError = onError;
    this.onStatus = onStatus;
    this.ws = null;
    this.queue = [];
    this.attempt = 0;
    this.rejoin = readRoom(); // { code, name } — survives a page refresh
    this.restored = !!this.rejoin; // true until a restored session proves valid
  }

  /** Forget the saved room, e.g. after the server says it is gone. */
  forget() {
    this.rejoin = null;
    this.restored = false;
    writeRoom(null);
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect() {
    this.onStatus?.('connecting');
    const ws = new WebSocket(this.url());
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
      this.onStatus?.('open');
      if (this.rejoin) this.send({ t: 'join', ...this.rejoin });
      for (const msg of this.queue.splice(0)) this.send(msg);

      // Free hosting tiers idle a service out after ~15 minutes without inbound
      // traffic. A long think between questions could cross that, so keep a
      // trickle of real application traffic on the socket.
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.send({ t: 'ping' }), 4 * 60 * 1000);
    });

    ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === 'state') {
        if (msg.code) {
          this.rejoin = { code: msg.code, name: msg.name };
          writeRoom(this.rejoin);
        }
        this.onState?.(msg);
      } else if (msg.t === 'error') {
        this.onError?.(msg.msg, msg.code);
      }
    });

    ws.addEventListener('close', () => {
      clearInterval(this.heartbeat);
      if (ws.intentional) return; // we replaced this socket on purpose
      this.onStatus?.('closed');
      const wait = Math.min(800 * 2 ** this.attempt++, 6000);
      setTimeout(() => this.connect(), wait);
    });

    ws.addEventListener('error', () => ws.close());
  }

  send(msg) {
    const payload = { ...msg, pid: this.pid };
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
    else this.queue.push(msg);
  }

  create(name, settings) {
    this.rejoin = null;
    writeRoom(null);
    this.send({ t: 'create', name, settings });
  }

  join(code, name) {
    this.rejoin = { code, name };
    this.send({ t: 'join', code, name });
  }

  leave() {
    this.rejoin = null;
    writeRoom(null);
    this.queue.length = 0;
    if (this.ws) {
      this.ws.intentional = true;
      this.ws.close();
    }
    this.connect();
  }
}
