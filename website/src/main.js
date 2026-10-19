import { content } from './content.js';

const text = (key, replacements = {}) => Object.entries(replacements).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement), content[key] ?? '');
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const words = Object.fromEntries(['patience', 'growth', 'quiet'].map(key => [key, Object.fromEntries(['term', 'phonetic', 'pos', 'meaning', 'kind', 'example', 'translation', 'context', 'contextTranslation'].map(part => [part, text(`word.${key}.${part}`)]))]));
let selectedWord = 'patience';
const savedWords = new Set();
let toastTimer;

function toast(message) {
  const element = $('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 3600);
}

const menu = $('.menu-toggle');
function closeMenu(returnFocus = false) {
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', text('interaction.menuOpen'));
  $('#site-nav').classList.remove('is-open');
  if (returnFocus) menu.focus();
}
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', text(open ? 'interaction.menuClose' : 'interaction.menuOpen'));
  $('#site-nav').classList.toggle('is-open', open);
});
$$('#site-nav a').forEach((link) => link.addEventListener('click', () => closeMenu()));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (menu.getAttribute('aria-expanded') === 'true') closeMenu(true);
    else if (!$('#hero-definition').hidden && $('#hero-definition').contains(document.activeElement)) closeDefinition(true);
  }
});
matchMedia('(min-width: 681px)').addEventListener('change', ({ matches }) => { if (matches) closeMenu(); });

function closeDefinition(returnFocus = false) {
  $('#hero-definition').hidden = true;
  $('.word--hero').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('.word--hero').focus();
}
$('.word--hero').addEventListener('click', () => {
  const open = $('#hero-definition').hidden;
  $('#hero-definition').hidden = !open;
  $('.word--hero').setAttribute('aria-expanded', String(open));
});
$('.definition-close').addEventListener('click', () => closeDefinition(true));

function refreshSaveButtons() {
  $$('[data-save-word]').forEach((button) => {
    const key = button.dataset.saveWord === 'selected' ? selectedWord : button.dataset.saveWord;
    const saved = savedWords.has(key);
    button.setAttribute('aria-pressed', String(saved));
    if (button.classList.contains('reader-step')) {
      button.textContent = text(saved ? 'interaction.savedWord' : 'interaction.saveWord');
    } else if ($('span', button)) {
      $('span', button).textContent = text(saved ? 'interaction.savedWord' : 'interaction.saveWord');
      $('use', button)?.setAttribute('href', saved ? '#i-check' : '#i-plus');
    } else button.textContent = text(saved ? 'interaction.savedWord' : 'interaction.saveWord');
  });
  $('#saved-word-note').textContent = savedWords.has(selectedWord) ? text('interaction.savedNote') : '';
}

function selectWord(key, markStep = true) {
  if (!Object.hasOwn(words, key)) return;
  selectedWord = key;
  const word = words[key];
  $('#definition-word').textContent = word.term;
  $('#definition-phonetic').textContent = word.phonetic;
  $('#definition-pos').textContent = word.pos;
  $('#definition-meaning').textContent = word.meaning;
  $('#definition-sentence').textContent = word.context;
  $('#definition-translation').textContent = word.contextTranslation;
  $$('[data-word]').forEach((button) => {
    const active = button.dataset.word === key;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (markStep) $$('.learning-path li').forEach((step, index) => step.classList.toggle('is-active', index === 1));
  refreshSaveButtons();
}
$$('[data-word]').forEach((button) => button.addEventListener('click', () => selectWord(button.dataset.word)));
$('#dictionary-step').addEventListener('click', () => {
  selectWord(selectedWord);
  const term = $('#definition-word');
  term.setAttribute('tabindex', '-1');
  term.focus({ preventScroll: true });
  $('.context-definition').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
});
$$('[data-focus-dictionary]').forEach((link) => link.addEventListener('click', () => selectWord('patience')));

function setCardFace(flipped) {
  $('#flashcard').classList.toggle('is-flipped', flipped);
  $('#flip-card').setAttribute('aria-pressed', String(flipped));
  $('#flip-card').textContent = text(flipped ? 'interaction.flipBack' : 'interaction.flipFront');
  $('.flashcard-front').inert = flipped;
  $('.flashcard-front').setAttribute('aria-hidden', String(flipped));
  $('.flashcard-back').inert = !flipped;
  $('.flashcard-back').setAttribute('aria-hidden', String(!flipped));
}

function updateCard(key) {
  const word = words[key];
  $('#flashcard-word').textContent = word.term;
  $('#flashcard-phonetic').textContent = word.phonetic;
  $('#flashcard-meaning').textContent = word.meaning;
  $('#flashcard-pos').textContent = word.kind;
  $('#flashcard-translation').textContent = word.translation;
  $('#flashcard-example').replaceChildren();
  const index = word.example.toLowerCase().indexOf(word.term.toLowerCase());
  const segments = index < 0 || !word.term ? [word.example, ''] : [word.example.slice(0, index), word.example.slice(index + word.term.length)];
  $('#flashcard-example').append(document.createTextNode(segments[0]));
  const highlighted = document.createElement('span');
  highlighted.textContent = index < 0 ? '' : word.example.slice(index, index + word.term.length);
  $('#flashcard-example').append(highlighted, document.createTextNode(segments[1] || ''));
  $('#card-caption').textContent = savedWords.has(key) ? text('interaction.savedCaption', { word: word.term }) : text('interaction.cardCaption');
  setCardFace(false);
}
$$('[data-save-word]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.saveWord === 'selected' ? selectedWord : button.dataset.saveWord;
  if (savedWords.has(key)) { toast(text('interaction.alreadySaved', { word: words[key].term })); return; }
  savedWords.add(key);
  updateCard(key);
  refreshSaveButtons();
  toast(text('interaction.savedToast', { word: words[key].term }));
}));
$('#flip-card').addEventListener('click', () => setCardFace(!$('#flashcard').classList.contains('is-flipped')));

function selectPractice(key, focus = false) {
  const target = $(`[data-practice="${key}"]`);
  if (!target) return;
  $$('[data-practice]').forEach((button) => {
    const active = button === target;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`#panel-${button.dataset.practice}`).hidden = !active;
  });
  if (focus) target.focus();
}
$$('[data-practice]').forEach((button) => {
  button.addEventListener('click', () => selectPractice(button.dataset.practice));
  button.addEventListener('keydown', (event) => {
    const tabs = $$('[data-practice]');
    let index = tabs.indexOf(button);
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault();
    selectPractice(tabs[index].dataset.practice, true);
  });
});
$$('[data-open-practice]').forEach((link) => link.addEventListener('click', () => selectPractice(link.dataset.openPractice)));
$('.floating-card').addEventListener('click', () => selectPractice('cards'));

$('#writing-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $('#writing-answer');
  const feedback = $('#writing-feedback');
  feedback.replaceChildren();
  if (!field.value.trim()) {
    field.setAttribute('aria-invalid', 'true');
    feedback.textContent = text('interaction.writingEmpty');
    field.focus();
    return;
  }
  field.removeAttribute('aria-invalid');
  const answer = field.value.trim().toLowerCase();
  const message = document.createElement('span');
  const referenceWords = text('interaction.writingReference').toLowerCase().match(/[a-z]+/g) || [];
  message.textContent = text(referenceWords.length && referenceWords.every(word => answer.includes(word)) ? 'interaction.writingGood' : 'interaction.writingHint');
  const reference = document.createElement('strong');
  reference.lang = 'en';
  reference.textContent = text('interaction.writingReference');
  feedback.append(message, reference);
});

function appendMessage(text, user = false) {
  const message = document.createElement('div');
  message.className = `chat-message chat-message--${user ? 'user' : 'npc'}`;
  const name = document.createElement('span');
  name.textContent = text(user ? 'interaction.userName' : 'interaction.npcName');
  const content = document.createElement('p');
  content.lang = 'en';
  content.textContent = text;
  message.append(name, content);
  $('#chat-messages').append(message);
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
}
function chatChoices(choices) {
  $('#chat-options').replaceChildren();
  choices.forEach(([key, text]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.reply = key;
    button.lang = 'en';
    button.textContent = text;
    $('#chat-options').append(button);
  });
}
$('#chat-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-reply]');
  if (!button) return;
  const reply = button.dataset.reply;
  appendMessage(button.textContent, true);
  if (reply === 'menu') {
    appendMessage(text('interaction.chatMenu'));
    chatChoices([['coffee', text('interaction.replyCoffee')], ['tea', text('interaction.replyTea')]]);
  } else if (reply === 'coffee' || reply === 'tea') {
    appendMessage(text('interaction.chatTemperature'));
    chatChoices([['hot', text('interaction.replyHot')], ['iced', text('interaction.replyIced')]]);
  } else {
    appendMessage(text('interaction.chatFinished'));
    const complete = document.createElement('p');
    complete.className = 'chat-complete';
    complete.textContent = text('interaction.chatComplete');
    $('#chat-options').replaceChildren(complete);
  }
});
$('#reset-chat').addEventListener('click', () => {
  $('#chat-messages').replaceChildren();
  appendMessage(text('interaction.chatGreeting'));
  chatChoices([['coffee', text('interaction.replyCoffee')], ['menu', text('interaction.replyMenu')]]);
});

$('#speak-word').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) { toast(text('interaction.speechUnsupported')); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(words[selectedWord].term);
  utterance.lang = 'en-US';
  utterance.rate = .85;
  utterance.onerror = () => toast(text('interaction.speechError'));
  window.speechSynthesis.speak(utterance);
});
window.addEventListener('pagehide', () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); });

$$('.faq-list details').forEach((detail) => detail.addEventListener('toggle', () => {
  if (detail.open) $$('.faq-list details').forEach((other) => { if (other !== detail) other.open = false; });
}));
refreshSaveButtons();
selectWord(selectedWord, false);
updateCard(selectedWord);
