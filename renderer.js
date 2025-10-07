// Minimal converted models (based on Flash-Quest-Alpha Java models)

class Flashcard {
  constructor(question, answer, category = 'General', difficulty = 'EASY') {
    this.id = cryptoRandomId();
    this.question = question;
    this.answer = answer;
    this.category = category;
    this.difficulty = difficulty; // EASY, MEDIUM, HARD
    this.timesAsked = 0;
    this.timesCorrect = 0;
  }

  recordAnswer(correct) {
    this.timesAsked++;
    if (correct) this.timesCorrect++;
  }

  getDifficultyXpBonus() {
    switch (this.difficulty) {
      case 'MEDIUM': return 5;
      case 'HARD': return 10;
      default: return 0;
    }
  }
}

class Player {
  constructor(name = 'Guest') {
    this.name = name;
    this.currentLevel = 1;
    this.totalXp = 0;
    this.currentHp = 3;
    this.maxHp = 3;
  }

  static getXpRequiredForLevel(level) {
    if (level <= 1) return 0;
    const n = level - 1;
    return 75 * n + 25 * n * n;
  }

  getXpRequiredForNextLevel() { return Player.getXpRequiredForLevel(this.currentLevel + 1); }

  addXp(xp) {
    if (xp <= 0) return false;
    const oldLevel = this.currentLevel;
    this.totalXp += xp;
    while (this.totalXp >= this.getXpRequiredForNextLevel()) this.currentLevel++;
    return this.currentLevel > oldLevel;
  }

  takeDamage(dmg) { this.currentHp = Math.max(0, this.currentHp - dmg); return this.currentHp <= 0; }

  restoreFullHp() { this.currentHp = this.maxHp; }
}

class Quest {
  constructor(name = 'Sample Quest', questionCount = 10, customHp = 3) {
    this.name = name;
    this.questionCount = questionCount;
    this.customHp = customHp;
    this.questFlashcards = [];
    this.currentQuestionIndex = 0;
    this.correctAnswers = 0;
    this.totalXpEarned = 0;
    this.isActive = false;
    this.isCompleted = false;
  }

  startQuest(flashcards) {
    this.questFlashcards = flashcards.slice(0, this.questionCount);
    this.currentQuestionIndex = 0;
    this.correctAnswers = 0;
    this.totalXpEarned = 0;
    this.isActive = true;
    this.isCompleted = false;
  }

  processAnswer(correct) {
    if (!this.isActive || this.currentQuestionIndex >= this.questFlashcards.length) return { xp:0, complete:true, error:false };
    const card = this.questFlashcards[this.currentQuestionIndex];
    let xp = 0;
    if (correct) {
      xp = 10 + card.getDifficultyXpBonus();
      this.correctAnswers++;
    }
    card.recordAnswer(correct);
    this.totalXpEarned += xp;
    this.currentQuestionIndex++;
    const complete = this.currentQuestionIndex >= this.questFlashcards.length;
    if (complete) this.completeQuest();
    return { xp, complete, error:false };
  }

  completeQuest() {
    this.isActive = false;
    this.isCompleted = true;
    this.totalXpEarned += 50;
    if (this.correctAnswers === this.questFlashcards.length && this.questFlashcards.length === this.questionCount) this.totalXpEarned += 25;
  }
}

// Utilities
function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

// Basic HTML escaper for question text
function escapeHtml(str){
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Flashcards currently loaded from user's JSON. Start empty; will be populated from profiles/flashcards.json
const cards = [];

// App state
const player = new Player('Player One');
let currentQuest = null;
let currentProfileName = null;

// Profile schema: { players: [{id,name,currentLevel,totalXp,currentHp,maxHp,...}], flashcards: [...], activePlayerId }

// UI wiring
document.getElementById('playerName').textContent = player.name;
document.getElementById('playerLevel').textContent = player.currentLevel;
document.getElementById('playerXp').textContent = player.totalXp;
document.getElementById('playerHp').textContent = player.currentHp;
document.getElementById('playerMaxHp').textContent = player.maxHp;

const startBtn = document.getElementById('startQuest');
const questionArea = document.getElementById('questionArea');

// Profile UI elements
const profilesList = document.getElementById('profilesList');
const createProfileBtn = document.getElementById('createProfile');
const newProfileNameInput = document.getElementById('newProfileName');
const loadProfileBtn = document.getElementById('loadProfile');
const deleteProfileBtn = document.getElementById('deleteProfile');
const reloadProfilesBtn = document.getElementById('reloadProfiles');
const importProfileFileInput = document.getElementById('importProfileFile');
const importProfileBtn = document.getElementById('importProfileBtn');

async function refreshProfilesList() {
  try {
    const items = await window.electronAPI.listProfiles();
    profilesList.innerHTML = '';
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.fileName || it.id || it.displayName;
      opt.textContent = `${it.displayName || opt.value}${it.level ? ` (Lv ${it.level})` : ''}`;
      opt.dataset.raw = JSON.stringify(it);
      profilesList.appendChild(opt);
    }
    return items;
  } catch (err) {
    console.error('Failed to list profiles', err);
    return [];
  }
}

createProfileBtn.addEventListener('click', async () => {
  const name = newProfileNameInput.value && newProfileNameInput.value.trim();
  if (!name) return alert('Enter a profile name');
  const profileData = {
    players: [serializePlayer(player)],
    flashcards: cards.map(c => serializeFlashcard(c)),
    activePlayerId: player.id
  };

  const res = await window.electronAPI.saveProfile(name, profileData);
  if (res && res.ok) {
    currentProfileName = res.name;
    await refreshProfilesList();
    alert('Profile saved: ' + res.name);
  } else {
    alert('Failed to save profile: ' + (res && res.error));
  }
});

loadProfileBtn.addEventListener('click', async () => {
  const opt = profilesList.selectedOptions[0];
  if (!opt) return alert('Select a profile');
  const meta = opt.dataset.raw ? JSON.parse(opt.dataset.raw) : null;
  let loadKey = null;
  if (meta) {
    if (meta.type === 'root') loadKey = 'default';
    else if (meta.type === 'folder') loadKey = meta.path; // folder/player.json
    else if (meta.fileName) loadKey = meta.fileName.replace(/\.json$/i, '');
    else loadKey = meta.id || opt.value;
  } else {
    loadKey = opt.value.replace(/\.json$/i, '');
  }

  const res = await window.electronAPI.loadProfile(loadKey);
  if (!res.ok) return alert('Failed to load: ' + res.error);
  applyProfileData(res.data);
  currentProfileName = loadKey;
  alert('Loaded profile: ' + (meta && meta.displayName ? meta.displayName : loadKey));
});

deleteProfileBtn.addEventListener('click', async () => {
  const name = profilesList.value;
  if (!name) return alert('Select a profile');
  if (!confirm(`Delete profile '${name}'?`)) return;
  const res = await window.electronAPI.deleteProfile(name);
  if (res.ok) {
    await refreshProfilesList();
    alert('Deleted profile: ' + name);
  } else {
    alert('Failed to delete: ' + res.error);
  }
});

importProfileBtn.addEventListener('click', async () => {
  const files = importProfileFileInput.files;
  if (!files || files.length === 0) return alert('Choose a JSON file to import');
  const file = files[0];
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      applyProfileData(data);
      // Save imported profile under its name if it has one, otherwise ask
      const defaultName = data.profileName || `imported-${Date.now()}`;
      const name = prompt('Save imported profile as:', defaultName) || defaultName;
      const res = await window.electronAPI.saveProfile(name, data);
      if (res.ok) {
        await refreshProfilesList();
        alert('Imported and saved profile: ' + res.name);
      } else {
        alert('Failed to save imported profile: ' + res.error);
      }
    } catch (err) {
      alert('Failed to import JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
});

function serializePlayer(p) {
  return {
    id: p.id ?? cryptoRandomId(),
    name: p.name,
    currentLevel: p.currentLevel,
    totalXp: p.totalXp,
    currentHp: p.currentHp,
    maxHp: p.maxHp
  };
}

function serializeFlashcard(c) {
  return {
    id: c.id,
    question: c.question,
    answer: c.answer,
    category: c.category,
    difficulty: c.difficulty,
    timesAsked: c.timesAsked,
    timesCorrect: c.timesCorrect
  };
}

function applyProfileData(data) {
  try {
    if (data.players && data.players.length > 0) {
      const p = data.players[0];
      player.name = p.name || player.name;
      player.currentLevel = p.currentLevel || player.currentLevel;
      player.totalXp = p.totalXp || player.totalXp;
      player.currentHp = p.currentHp || player.currentHp;
      player.maxHp = p.maxHp || player.maxHp;
      document.getElementById('playerName').textContent = player.name;
      updatePlayerUI();
    }

    if (data.flashcards && data.flashcards.length > 0) {
      // Replace current cards with profile cards
      const loaded = data.flashcards.map(fc => {
        const card = new Flashcard(fc.question, fc.answer, fc.category, fc.difficulty);
        card.id = fc.id || card.id;
        card.timesAsked = fc.timesAsked || 0;
        card.timesCorrect = fc.timesCorrect || 0;
        return card;
      });
      // replace cards in memory
      cards.length = 0;
      cards.push(...loaded);
    }
  } catch (err) {
    console.error('applyProfileData error', err);
  }
}

// Initialize profile list on load
async function init() {
  const items = await refreshProfilesList();
  // Auto-load the most recent profile if available
  if (items && items.length > 0) {
    // Select first option
    profilesList.selectedIndex = 0;
    const opt = profilesList.selectedOptions[0];
    if (opt) {
      const meta = opt.dataset.raw ? JSON.parse(opt.dataset.raw) : null;
      let loadKey = null;
      if (meta) {
        if (meta.type === 'root') loadKey = 'default';
        else if (meta.type === 'folder') loadKey = meta.path;
        else if (meta.fileName) loadKey = meta.fileName.replace(/\.json$/i, '');
        else loadKey = meta.id || opt.value;
      } else {
        loadKey = opt.value.replace(/\.json$/i, '');
      }

      try {
        const res = await window.electronAPI.loadProfile(loadKey);
        if (res.ok) {
          applyProfileData(res.data);
          currentProfileName = loadKey;
          console.log('Auto-loaded profile:', (meta && meta.displayName) || loadKey);
        } else {
          console.warn('Auto-load failed:', res.error);
        }
      } catch (err) {
        console.error('Auto-load error', err);
      }
    }
  } else {
    // No profiles detected; attempt to load root flashcards if present
    try {
      const res = await window.electronAPI.loadProfile('default');
      if (res.ok) {
        applyProfileData(res.data);
        currentProfileName = 'default';
        console.log('Loaded default root save');
      }
    } catch (err) {
      // ignore
    }
  }
}

init();

// Profile dropdown toggle (header icon)
const profileToggleBtn = document.getElementById('profileToggle');
const profileDropdown = document.getElementById('profileDropdown');
if (profileToggleBtn && profileDropdown) {
  profileToggleBtn.addEventListener('click', (ev) => {
    const visible = profileDropdown.getAttribute('aria-hidden') === 'false';
    profileDropdown.setAttribute('aria-hidden', visible ? 'true' : 'false');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (ev) => {
    if (!profileDropdown) return;
    const target = ev.target;
    if (profileDropdown.contains(target) || profileToggleBtn.contains(target)) return;
    profileDropdown.setAttribute('aria-hidden', 'true');
  });
}

// Window control buttons (minimize, maximize, close)
const minBtn = document.getElementById('minBtn');
const maxBtn = document.getElementById('maxBtn');
const closeBtn = document.getElementById('closeBtn');
if (minBtn) minBtn.addEventListener('click', () => window.electronAPI.windowControl('minimize'));
if (maxBtn) maxBtn.addEventListener('click', async () => {
  const res = await window.electronAPI.windowControl('toggle-maximize');
  // update maximize glyph if needed (no-op for now)
});
if (closeBtn) closeBtn.addEventListener('click', () => window.electronAPI.windowControl('close'));

reloadProfilesBtn.addEventListener('click', async () => {
  await init();
  alert('Profiles reloaded');
});

startBtn.addEventListener('click', async () => {
  // make quests 10 cards long
  currentQuest = new Quest('Sample Quest', 10, 3);
  // Use only user-loaded cards. If none, show message.
  if (cards.length === 0) {
    questionArea.innerHTML = `<div class="panel" style="padding:10px;background:transparent;border-color:rgba(120,80,140,0.06)">No flashcards available. Please load or import a profile with flashcards.</div>`;
    document.getElementById('questCount').textContent = '0';
    return;
  }
  // Reset player HP at the start of a quest
  const prevHp = player.currentHp;
  player.currentHp = player.maxHp;
  updatePlayerUI();
  // Persist root player.json if available (best effort)
  try {
    await window.electronAPI.saveRootPlayer({
      id: player.id,
      name: player.name,
      currentLevel: player.currentLevel,
      totalXp: player.totalXp,
      currentHp: player.currentHp,
      maxHp: player.maxHp
    });
  } catch (err) {
    console.warn('Failed to persist root player', err);
  }

  currentQuest.startQuest(cards);
  document.getElementById('questCount').textContent = currentQuest.questFlashcards.length;
  renderCurrentQuestion();
});

function renderCurrentQuestion() {
  if (!currentQuest) return;
  const idx = currentQuest.currentQuestionIndex;
  if (idx >= currentQuest.questFlashcards.length) {
    questionArea.innerHTML = `<div>Quest complete! XP earned: ${currentQuest.totalXpEarned}</div>`;
    player.addXp(currentQuest.totalXpEarned);
    updatePlayerUI();
    document.getElementById('questProgress').textContent = '100%';
    return;
  }

  const card = currentQuest.questFlashcards[idx];
  const progressPercent = Math.round((idx / currentQuest.questFlashcards.length) * 100);
  document.getElementById('questProgress').textContent = `${progressPercent}%`;
  // Render question with a reveal button and a hidden answer area
  // Use replace to preserve line breaks in answers
  const escapedAnswer = escapeHtml(card.answer).replace(/\n/g, '<br>');
  questionArea.innerHTML = `
    <div class="question-box">
      <div style="font-size:12px"><strong>Q${idx+1}:</strong></div>
      <div style="margin-top:6px" class="question-text">${escapeHtml(card.question)}</div>

      <div style="margin-top:12px" class="row">
        <button id="revealBtn" class="btn">Reveal Answer</button>
        <div id="answerText" class="answer-text" style="display:none;">${escapedAnswer}</div>
      </div>

      <div style="margin-top:12px" class="row">
        <button id="ansCorrect" class="btn primary">Correct</button>
        <button id="ansWrong" class="btn danger">Wrong</button>
      </div>
    </div>
  `;

  // Wire up reveal/hide toggle
  const revealBtn = document.getElementById('revealBtn');
  const answerText = document.getElementById('answerText');
  if (revealBtn && answerText) {
    revealBtn.addEventListener('click', () => {
      const isHidden = answerText.style.display === 'none' || !answerText.style.display;
      answerText.style.display = isHidden ? 'block' : 'none';
      revealBtn.textContent = isHidden ? 'Hide Answer' : 'Reveal Answer';
    });
  }

  document.getElementById('ansCorrect').addEventListener('click', () => answer(true));
  document.getElementById('ansWrong').addEventListener('click', () => answer(false));
}

function answer(correct) {
  const res = currentQuest.processAnswer(correct);
  if (!correct) {
    const died = player.takeDamage(1);
    if (died) {
      currentQuest.completeWithFailure?.();
      questionArea.innerHTML = '<div>Player died! Quest failed.</div>';
      updatePlayerUI();
      return;
    }
  }
  if (res.complete) {
    renderCurrentQuestion();
  } else {
    renderCurrentQuestion();
  }
  updatePlayerUI();
}

function updatePlayerUI() {
  document.getElementById('playerLevel').textContent = player.currentLevel;
  document.getElementById('playerXp').textContent = player.totalXp;
  document.getElementById('playerHp').textContent = player.currentHp;
  // render hearts
  const heartsWrap = document.getElementById('hpHearts');
  if (heartsWrap) {
    heartsWrap.innerHTML = '';
    const maxHp = player.maxHp || 0;
    const curHp = player.currentHp || 0;
    for (let i = 0; i < maxHp; i++) {
      const h = document.createElement('span');
      h.className = 'heart' + (i < curHp ? '' : ' off');
      heartsWrap.appendChild(h);
    }
  }
}

// Expose some globals for debugging
window.__flashquest = { player, cards };
