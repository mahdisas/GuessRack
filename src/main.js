import './style.css';
import { Stage } from './scene.js';
import { Net } from './net.js';
import * as ui from './ui.js';

const stage = new Stage(document.getElementById('stage'));

let state = null;
let round = -1;
let guessArmed = false;

const net = new Net({
  onState: handleState,
  onError: handleError,
  onStatus: (status) => ui.setConnection(status === 'open'),
});

// ------------------------------------------------------------------ input

ui.bindLobby({
  onCreate: (name, settings) => {
    ui.showLobbyError('');
    net.create(name, settings);
  },
  onJoin: (code, name) => {
    ui.showLobbyError('');
    net.join(code, name);
  },
});

function returnToLobby() {
  state = null;
  round = -1;
  guessArmed = false;
  stage.setSecret(null);
  stage.setGuessMode(false);
  stage.setInteractive(false);
  ui.showScreen('lobby');
}

ui.bindGame({
  onLeave: () => {
    net.leave();
    returnToLobby();
  },
  onEndTurn: () => net.send({ t: 'endTurn' }),
  onToggleGuess: () => setGuessArmed(!guessArmed),
  onCopy: () => state && ui.copyCode(state.code),
});

stage.onCardClick = (index) => {
  if (!state || state.phase !== 'playing') return;
  guessArmed ? attemptGuess(index) : toggleCard(index);
};

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && guessArmed) setGuessArmed(false);
});

// ------------------------------------------------------------------- game

function toggleCard(index) {
  const down = !state.flipped.includes(index);
  // Optimistic: the tile moves the instant you click, the server confirms next tick.
  state.flipped = down
    ? [...state.flipped, index]
    : state.flipped.filter((i) => i !== index);
  stage.setFlipped(state.flipped);
  ui.updateHud(state, { guessArmed });
  net.send({ t: 'flip', index, down });
}

function attemptGuess(index) {
  if (!stage.board.isSelectable(index)) {
    ui.toast('That one is already knocked down — stand it back up first.');
    return;
  }
  const word = state.board[index];
  const them = state.opponent?.name ?? 'their';
  const stake = state.settings?.suddenDeath
    ? 'Get it wrong and you lose the match.'
    : 'Get it wrong and the card goes down and your turn passes.';
  ui.openModal({
    title: 'Call it?',
    // <bdi> keeps an Arabic word from dragging the surrounding punctuation to
    // the wrong side of the sentence.
    body: `You are declaring that <bdi>${ui.escapeHtml(them)}</bdi>’s secret word is
           <b><bdi>${ui.escapeHtml(word)}</bdi></b>.<br />${stake}`,
    okText: 'Yes — call it',
    cancelText: 'Wait, no',
    onOk: () => {
      ui.closeModal();
      setGuessArmed(false);
      net.send({ t: 'guess', index });
    },
    onCancel: () => ui.closeModal(),
  });
}

function setGuessArmed(on) {
  guessArmed = on && state?.phase === 'playing' && state.turn === state.seat;
  stage.setGuessMode(guessArmed);
  if (guessArmed) {
    ui.toast(
      state?.settings?.suddenDeath
        ? 'Pick their word — one shot, wrong loses the match.'
        : 'Pick the card you think is their word.',
      5000
    );
  }
  else ui.closeModal();
  if (state) ui.updateHud(state, { guessArmed });
}

// -------------------------------------------------------------- server io

function handleState(next) {
  const previous = state;
  state = next;
  net.restored = false;

  if (next.phase === 'lobby') {
    ui.showScreen('waiting');
    ui.showWaiting(next.code, next.settings);
    stage.setInteractive(false);
    stage.setSecret(null);
    round = -1;
    return;
  }

  const lang = next.settings?.language ?? 'en';

  if (next.round !== round) {
    round = next.round;
    stage.buildBoard(next.board, lang);
    guessArmed = false;
    stage.setGuessMode(false);
    ui.closeModal();
  }

  stage.setSecret(next.secret, lang);
  stage.setFlipped(next.flipped);
  stage.setInteractive(next.phase === 'playing');
  ui.showScreen('game');

  if (guessArmed && (next.phase !== 'playing' || next.turn !== next.seat)) setGuessArmed(false);
  ui.updateHud(next, { guessArmed });
  // The HUD is what the rack has to fit around, and its height changes with the
  // tiles on show, so re-measure once it reflects the current state.
  stage.resize();

  announce(previous, next);

  if (next.phase === 'over') showResult(next);
  else if (previous?.phase === 'over') ui.closeModal();
}

function announce(previous, next) {
  if (next.message && next.message !== previous?.message) {
    ui.toast(next.message, 4500);
    return;
  }
  if (!previous || previous.phase !== 'playing' || next.phase !== 'playing') return;
  if (previous.turn !== next.turn && next.turn === next.seat) {
    ui.toast('Your turn — ask away.', 2600);
  }
}

function showResult(next) {
  const won = next.winner === next.seat;
  const them = next.opponent?.name ?? 'Opponent';
  const ready = next.rematchReady?.[next.seat];
  ui.openModal({
    title: won
      ? '<span class="win">You win</span>'
      : '<span class="lose">You lose</span>',
    body: `${ui.escapeHtml(next.message)}<br /><br />
           Your word was <b><bdi>${ui.escapeHtml(next.reveal?.yours ?? '?')}</bdi></b>.<br />
           <bdi>${ui.escapeHtml(them)}</bdi>’s word was
           <b><bdi>${ui.escapeHtml(next.reveal?.theirs ?? '?')}</bdi></b>.`,
    okText: ready ? 'Waiting for them…' : 'Rematch',
    okDisabled: !!ready,
    cancelText: 'Leave',
    onOk: () => net.send({ t: 'rematch' }),
    onCancel: () => document.getElementById('leave-btn').click(),
  });
}

function handleError(msg, code) {
  // The room is gone — the server restarted, or it was reaped. Leaving the dead
  // board on screen would be worse than saying so plainly.
  if (code === 'no_room') {
    const wasInAMatch = !!state;
    const restoring = net.restored;
    net.forget();
    returnToLobby();
    if (wasInAMatch) {
      ui.showLobbyError('That match ended — the server restarted. Start a new room.');
    } else if (!restoring) {
      ui.showLobbyError(msg);
    }
    return;
  }

  if (state) {
    ui.toast(msg, 4000);
    return;
  }
  // A stale room saved from a previous visit shouldn't greet you with an error.
  const restoring = net.restored;
  net.forget();
  if (!restoring) ui.showLobbyError(msg);
}

ui.showScreen('lobby');
net.connect();
