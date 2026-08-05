const $ = (id) => document.getElementById(id);

const el = {
  lobby: $('lobby'),
  waiting: $('waiting'),
  hud: $('hud'),
  nameInput: $('name-input'),
  codeInput: $('code-input'),
  createBtn: $('create-btn'),
  joinForm: $('join-form'),
  lobbyError: $('lobby-error'),
  optProgress: $('opt-progress'),
  optSudden: $('opt-sudden'),
  codeDisplay: $('code-display'),
  copyBtn: $('copy-btn'),
  lanHint: $('lan-hint'),
  rulesSummary: $('rules-summary'),
  leaveBtn: $('leave-btn'),
  theirCount: $('their-count'),
  missCount: $('miss-count'),
  myMisses: $('my-misses'),
  hudCode: $('hud-code'),
  turnBanner: $('turn-banner'),
  opponentChip: $('opponent-chip'),
  myStanding: $('my-standing'),
  theirStanding: $('their-standing'),
  guessBtn: $('guess-btn'),
  endturnBtn: $('endturn-btn'),
  toast: $('toast'),
  modal: $('modal'),
  modalTitle: $('modal-title'),
  modalBody: $('modal-body'),
  modalOk: $('modal-ok'),
  modalCancel: $('modal-cancel'),
  connection: $('connection'),
};

const NAME_KEY = 'guessrack-name';
const SETTINGS_KEY = 'guessrack-settings';
let toastTimer = null;
let modalHandlers = { ok: null, cancel: null };

el.modalOk.addEventListener('click', () => modalHandlers.ok?.());
el.modalCancel.addEventListener('click', () => modalHandlers.cancel?.());

export function bindLobby({ onCreate, onJoin }) {
  el.nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
  const name = () => {
    const value = el.nameInput.value.trim() || 'Player';
    localStorage.setItem(NAME_KEY, value);
    return value;
  };

  // Remember the host's preferred rules between sessions.
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {};
    el.optProgress.checked = !!saved.showOpponentProgress;
    el.optSudden.checked = !!saved.suddenDeath;
  } catch {
    /* first visit, or corrupted value — the defaults in the markup stand */
  }
  const settings = () => {
    const value = {
      showOpponentProgress: el.optProgress.checked,
      suddenDeath: el.optSudden.checked,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
    return value;
  };

  el.createBtn.addEventListener('click', () => onCreate(name(), settings()));
  el.joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = el.codeInput.value.trim().toUpperCase();
    if (code.length !== 4) return showLobbyError('Room codes are 4 characters.');
    onJoin(code, name());
  });
  el.codeInput.addEventListener('input', () => {
    el.codeInput.value = el.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
}

export function bindGame({ onLeave, onEndTurn, onToggleGuess, onCopy }) {
  el.leaveBtn.addEventListener('click', onLeave);
  el.endturnBtn.addEventListener('click', onEndTurn);
  el.guessBtn.addEventListener('click', onToggleGuess);
  el.copyBtn.addEventListener('click', onCopy);
}

export function showScreen(which) {
  el.lobby.hidden = which !== 'lobby';
  el.waiting.hidden = which !== 'waiting';
  el.hud.hidden = which !== 'game';
  if (which !== 'game') closeModal();
}

export function showLobbyError(msg) {
  el.lobbyError.textContent = msg;
  el.lobbyError.hidden = !msg;
}

/** Both players should be able to see the rules the host picked. */
export function describeRules(settings = {}) {
  return [
    settings.showOpponentProgress
      ? 'Opponent’s progress visible'
      : 'Opponent’s progress hidden',
    settings.suddenDeath
      ? 'Sudden death — one wrong call loses'
      : 'Wrong call costs your turn',
  ];
}

export function showWaiting(code, settings) {
  el.codeDisplay.textContent = code;
  el.rulesSummary.innerHTML = describeRules(settings)
    .map((rule) => `<li>${escapeHtml(rule)}</li>`)
    .join('');
  el.lanHint.textContent =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'On another device? Open this page via your PC’s network address, not localhost.'
      : `They open ${location.host} and enter the code.`;
}

export function copyCode(code) {
  navigator.clipboard?.writeText(code).then(
    () => toast(`Copied ${code}`),
    () => toast(`Code: ${code}`)
  );
}

export function updateHud(state, { guessArmed }) {
  el.hudCode.textContent = state.code;
  const myTurn = state.turn === state.seat;
  const them = state.opponent?.name ?? 'Opponent';

  el.turnBanner.textContent = state.phase === 'over'
    ? 'Match over'
    : myTurn
      ? 'Your turn — ask a question out loud'
      : `${them} is asking…`;
  el.turnBanner.className = `turn-banner ${state.phase === 'over' ? '' : myTurn ? 'mine' : 'theirs'}`;

  const online = state.opponent?.online !== false;
  el.opponentChip.className = `chip ${online ? '' : 'offline'}`;
  el.opponentChip.innerHTML = `vs <b>${escapeHtml(them)}</b>${online ? '' : ' (offline)'}`;

  el.myStanding.textContent = (state.board?.length ?? 0) - state.flipped.length;

  // The server omits opponentStanding entirely when the room hides it.
  const showTheirs = typeof state.opponentStanding === 'number';
  el.theirCount.hidden = !showTheirs;
  if (showTheirs) el.theirStanding.textContent = state.opponentStanding;

  // Only meaningful when misses are survivable, and only once you have one.
  const sudden = !!state.settings?.suddenDeath;
  el.missCount.hidden = sudden || !state.misses;
  el.myMisses.textContent = state.misses ?? 0;

  const active = state.phase === 'playing';
  el.endturnBtn.disabled = !active || !myTurn || guessArmed;
  el.guessBtn.disabled = !active || !myTurn;
  el.guessBtn.textContent = guessArmed
    ? 'Cancel'
    : sudden
      ? 'Final guess'
      : 'Call their word';
  el.guessBtn.classList.toggle('armed', guessArmed);
}

export function toast(msg, ms = 3200) {
  if (!msg) {
    el.toast.hidden = true;
    return;
  }
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

export function openModal({ title, body, okText, cancelText, okDisabled = false, onOk, onCancel }) {
  el.modalTitle.innerHTML = title;
  el.modalBody.innerHTML = body;
  el.modalOk.textContent = okText;
  el.modalOk.disabled = okDisabled;
  el.modalOk.hidden = !okText;
  el.modalCancel.textContent = cancelText ?? 'Cancel';
  el.modalCancel.hidden = !cancelText;
  modalHandlers = { ok: onOk, cancel: onCancel };
  el.modal.hidden = false;
}

export function closeModal() {
  el.modal.hidden = true;
  modalHandlers = { ok: null, cancel: null };
}

export function isModalOpen() {
  return !el.modal.hidden;
}

export function setConnection(connected) {
  el.connection.hidden = connected;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
