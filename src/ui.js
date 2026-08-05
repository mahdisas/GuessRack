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
  langInputs: [...document.querySelectorAll('input[name="lang"]')],
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
  qaLast: $('qa-last'),
  historyBtn: $('history-btn'),
  askForm: $('ask-form'),
  askInput: $('ask-input'),
  answerBox: $('answer-box'),
  answerQuestion: $('answer-question'),
  answerYes: $('answer-yes'),
  answerNo: $('answer-no'),
  answerOther: $('answer-other'),
  otherForm: $('other-form'),
  otherInput: $('other-input'),
  qaStatus: $('qa-status'),
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
    const lang = el.langInputs.find((i) => i.value === saved.language);
    if (lang) lang.checked = true;
  } catch {
    /* first visit, or corrupted value — the defaults in the markup stand */
  }
  const settings = () => {
    const value = {
      language: el.langInputs.find((i) => i.checked)?.value ?? 'en',
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

export function bindGame({ onLeave, onEndTurn, onToggleGuess, onCopy, onAsk, onAnswer, onHistory }) {
  el.leaveBtn.addEventListener('click', onLeave);
  el.endturnBtn.addEventListener('click', onEndTurn);
  el.guessBtn.addEventListener('click', onToggleGuess);
  el.copyBtn.addEventListener('click', onCopy);
  el.historyBtn.addEventListener('click', onHistory);

  el.askForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.askInput.value.trim();
    if (!text) return;
    el.askInput.value = ''; // only cleared once it is actually on its way
    onAsk(text);
  });

  el.answerYes.addEventListener('click', () => onAnswer('yes'));
  el.answerNo.addEventListener('click', () => onAnswer('no'));
  el.answerOther.addEventListener('click', () => {
    el.otherForm.hidden = false;
    el.otherInput.focus();
  });
  el.otherForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.otherInput.value.trim();
    if (!text) return;
    el.otherInput.value = '';
    onAnswer('other', text);
  });
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

const LANGUAGE_NAMES = { en: 'English cards', ar: 'بطاقات عربية' };

/** Both players should be able to see the rules the host picked. */
export function describeRules(settings = {}) {
  return [
    LANGUAGE_NAMES[settings.language] ?? LANGUAGE_NAMES.en,
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

  const pending = state.phase === 'playing' ? state.pending : null;
  const answering = !!pending && pending.from !== state.seat;

  el.turnBanner.textContent = state.phase === 'over'
    ? 'Match over'
    : answering
      ? `${them} asked you a question`
      : pending
        ? 'Waiting for their answer…'
        : myTurn
          ? state.asked
            ? 'Your turn — knock cards down, then pass'
            : 'Your turn — ask a question'
          : `${them} is asking…`;
  el.turnBanner.className =
    `turn-banner ${state.phase === 'over' ? '' : answering || (myTurn && !pending) ? 'mine' : 'theirs'}`;

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

  // An unanswered question blocks everything else: resolve it first.
  const active = state.phase === 'playing' && !pending;
  el.endturnBtn.disabled = !active || !myTurn || guessArmed;
  el.guessBtn.disabled = !active || !myTurn;
  el.guessBtn.textContent = guessArmed
    ? 'Cancel'
    : sudden
      ? 'Final guess'
      : 'Call their word';
  el.guessBtn.classList.toggle('armed', guessArmed);
}

const REPLY_LABEL = { yes: 'Yes', no: 'No' };
// The markup ships with the how-to-play hint; keep it so an empty log (a fresh
// match, or a rematch) can fall back to it instead of stranding the last one.
const QA_HINT = el.qaLast.innerHTML;

/** One log line: "Mahdi: Is it alive? — Yes" */
function describeEntry(entry, state) {
  const who = entry.asker === state.seat ? 'You' : state.opponent?.name ?? 'Opponent';
  const answer = entry.reply === 'other' ? entry.note : REPLY_LABEL[entry.reply];
  return { who, question: entry.question, answer, reply: entry.reply };
}

/**
 * Drives the ask/answer strip. Only toggles `hidden` and text — the inputs
 * themselves are never rebuilt, so a state update can't eat what you're typing.
 */
export function renderQA(state) {
  const playing = state.phase === 'playing';
  const pending = playing ? state.pending : null;
  const myTurn = state.turn === state.seat;
  const them = state.opponent?.name ?? 'Opponent';

  const answering = !!pending && pending.from !== state.seat;
  const waitingForThem = !!pending && pending.from === state.seat;
  const canAsk = playing && myTurn && !pending && !state.asked;

  el.askForm.hidden = !canAsk;
  el.answerBox.hidden = !answering;
  if (!answering) el.otherForm.hidden = true;

  if (answering) el.answerQuestion.textContent = pending.text;

  let status = '';
  if (waitingForThem) status = `Waiting for ${them} to answer…`;
  else if (playing && myTurn && state.asked) status = 'Knock cards down, then pass the turn.';
  else if (playing && !myTurn && !pending) {
    status = state.asked
      ? `${them} is knocking cards down…`
      : `${them} is thinking of a question…`;
  }
  el.qaStatus.hidden = !status;
  el.qaStatus.textContent = status;

  const history = state.history ?? [];
  el.historyBtn.textContent = history.length ? `Log (${history.length})` : 'Log';

  if (!history.length) {
    el.qaLast.innerHTML = QA_HINT;
  } else {
    const last = describeEntry(history[history.length - 1], state);
    const tag = last.reply === 'yes' ? 'yes-tag' : last.reply === 'no' ? 'no-tag' : '';
    // Players type in whatever language they like, so isolate every free-text
    // run from the English scaffolding around it.
    el.qaLast.innerHTML =
      `<b><bdi>${escapeHtml(last.who)}</bdi>:</b> <bdi>${escapeHtml(last.question)}</bdi> — ` +
      `<span class="${tag}"><bdi>${escapeHtml(last.answer)}</bdi></span>`;
  }
}

/** The full exchange log, newest last, reusing the modal shell. */
export function showHistory(state, onClose) {
  const history = state.history ?? [];
  const body = history.length
    ? `<ol class="history">${history
        .map((entry) => {
          const e = describeEntry(entry, state);
          return `<li>
            <span class="who"><bdi>${escapeHtml(e.who)}</bdi> asked</span>
            <span class="q" dir="auto">${escapeHtml(e.question)}</span><br />
            <span class="a ${e.reply}" dir="auto">${escapeHtml(e.answer)}</span>
          </li>`;
        })
        .join('')}</ol>`
    : '<p class="history-empty">No questions yet.</p>';

  openModal({
    title: 'Question log',
    body,
    okText: 'Close',
    onOk: onClose,
  });
  const list = el.modalBody.querySelector('.history');
  if (list) list.scrollTop = list.scrollHeight;
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
