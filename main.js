const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Use the specific folder requested for profiles, flashcards, quests
const PROFILES_DIR = path.join('C:', 'Users', 'war', 'flashquest-data');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false, // create a frameless window so we can render custom controls
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');
  // win.webContents.openDevTools();
}

async function seedFlashcardsIfNeeded() {
  try {
    const target = path.join(PROFILES_DIR, 'flashcards.json');
    let need = false;
    try {
      const stat = await fs.stat(target);
      // if file size is very small or zero, treat as empty
      if (stat.size < 10) need = true;
      else {
        // check if file contains empty flashcards array
        const raw = await fs.readFile(target, 'utf8');
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.flashcards) && parsed.flashcards.length === 0) {
            // attempt to convert local JSX quiz into flashcards
            const converted = await tryConvertJsxQuiz();
            if (converted && converted.length > 0) {
              await fs.writeFile(target, JSON.stringify({ flashcards: converted }, null, 2), 'utf8');
              console.log('Converted JSX quiz into flashcards and wrote to', target);
            }
          }
        } catch (e) {
          // ignore parse error
        }
      }
    } catch (_) {
      // file doesn't exist
      need = true;
    }

    if (need) {
      const bundled = path.join(__dirname, 'data', 'compTIA_core1_core2.json');
      await fs.copyFile(bundled, target);
      console.log('Seeded flashcards to', target);
    }
  } catch (err) {
    console.error('Failed to seed flashcards', err);
  }
}

/**
 * Try to parse a known JSX quiz file from the workspace and extract fact questions.
 * This is a heuristic parser tailored to the comp_tia_a_2025_cables_connectors_halloween_dark_quiz.jsx file.
 */
async function tryConvertJsxQuiz() {
  try {
    const quizPath = path.join('c:', 'Code Directory', 'Comp TIA A+ Pre-tests', 'comp_tia_a_2025_cables_connectors_halloween_dark_quiz.jsx');
    const raw = await fs.readFile(quizPath, 'utf8');
    const questionsMatch = raw.match(/const questions = \[[\s\S]*?\];/m);
    if (!questionsMatch) return null;
    const block = questionsMatch[0];
    // Find fact-type questions with question and answer fields
    const factRegex = /\{[^}]*type:\s*'fact'[^}]*question:\s*'([^']+)'[^}]*answer:\s*([^,}]+)[^}]*\}/g;
    const flashcards = [];
    let m;
    while ((m = factRegex.exec(block)) !== null) {
      const q = m[1].trim();
      let a = m[2].trim();
      // normalize answer (could be true/false or index)
      if (a === 'true' || a === 'false' || /^\d+$/.test(a)) {
        a = a.replace(/\s+$/, '');
        // keep as string
      } else {
        // strip quotes
        a = a.replace(/^['"]|['"]$/g, '').trim();
      }
      flashcards.push({ id: `jsx-${flashcards.length+1}`, question: q, answer: String(a), category: 'CompTIA', difficulty: 'MEDIUM', timesAsked:0, timesCorrect:0 });
    }
    return flashcards;
  } catch (err) {
    console.error('JSX conversion failed', err);
    return null;
  }
}

app.whenReady().then(async () => {
  // seed flashcards and attempt conversion if needed before creating the window
  await seedFlashcardsIfNeeded();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Simple JSON-based profile persistence handlers
ipcMain.handle('list-profiles', async () => {
  try {
    const dir = PROFILES_DIR;
    await fs.mkdir(dir, { recursive: true });

    const results = [];

    // 1) Check root player.json (legacy single-profile layout)
    const rootPlayerPath = path.join(dir, 'player.json');
    if (await exists(rootPlayerPath)) {
      try {
        const raw = await fs.readFile(rootPlayerPath, 'utf8');
        const parsed = JSON.parse(raw);
        results.push({
          id: 'default',
          displayName: parsed.name || 'Default',
          level: parsed.currentLevel ?? parsed.level ?? null,
          totalXp: parsed.totalXp ?? parsed.total_xp ?? null,
          type: 'root',
          path: 'player.json',
          lastModified: (await fs.stat(rootPlayerPath)).mtimeMs
        });
      } catch (err) {
        results.push({ id: 'default', displayName: 'Default', type: 'root', path: 'player.json' });
      }
    }

    // 2) Scan subdirectories for profiles (each profile stored in its own folder with player.json + flashcards.json)
    const children = await fs.readdir(dir, { withFileTypes: true });
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const profileDir = path.join(dir, child.name);
      const playerPath = path.join(profileDir, 'player.json');
      if (await exists(playerPath)) {
        try {
          const raw = await fs.readFile(playerPath, 'utf8');
          const parsed = JSON.parse(raw);
          results.push({
            id: child.name,
            displayName: parsed.name || child.name,
            level: parsed.currentLevel ?? parsed.level ?? null,
            totalXp: parsed.totalXp ?? parsed.total_xp ?? null,
            type: 'folder',
            path: path.join(child.name, 'player.json'),
            lastModified: (await fs.stat(playerPath)).mtimeMs
          });
        } catch (err) {
          results.push({ id: child.name, displayName: child.name, type: 'folder', path: path.join(child.name, 'player.json') });
        }
      }
    }

    // Sort by lastModified when available
    results.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    return results;
  } catch (err) {
    console.error('list-profiles error', err);
    return [];
  }
});

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch (_) {
    return false;
  }
}

ipcMain.handle('save-profile', async (event, { name, data }) => {
  try {
  const dir = PROFILES_DIR;
    await fs.mkdir(dir, { recursive: true });
    const safeName = (name && name.toString().trim().replace(/[\\/:*?"<>|]/g, '-')) || `profile-${Date.now()}`;
    const filePath = path.join(dir, `${safeName}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, name: safeName };
  } catch (err) {
    console.error('save-profile error', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('load-profile', async (event, { name }) => {
  try {
    const dir = PROFILES_DIR;
    // name could be 'default' (root), a folder name, or a filename
    if (!name) return { ok: false, error: 'No profile name provided' };

    // Root default
    if (name === 'default' || name === 'player.json') {
      const playerPath = path.join(dir, 'player.json');
      const flashPath = path.join(dir, 'flashcards.json');
      const playerRaw = await fs.readFile(playerPath, 'utf8');
      const player = JSON.parse(playerRaw);
      let flashcards = [];
      if (await exists(flashPath)) {
        const fRaw = await fs.readFile(flashPath, 'utf8');
        try {
          const parsed = JSON.parse(fRaw);
          // If wrapper structure (FlashcardCollection) has 'flashcards' key
          flashcards = parsed.flashcards || parsed;
        } catch (e) { flashcards = []; }
      }
      return { ok: true, data: { players: [player], flashcards } };
    }

    // Folder profile
    if (name.includes(path.sep) || name.match(/^[^\.\\\/]+$/)) {
      // If it's a path like "folder/player.json" or just folder name
      const parts = name.split(/[\\\/]/).filter(Boolean);
      const folder = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(path.sep);
      const playerPath = path.join(dir, folder, 'player.json');
      const flashPath = path.join(dir, folder, 'flashcards.json');
      if (await exists(playerPath)) {
        const playerRaw = await fs.readFile(playerPath, 'utf8');
        const player = JSON.parse(playerRaw);
        let flashcards = [];
        if (await exists(flashPath)) {
          const fRaw = await fs.readFile(flashPath, 'utf8');
          try {
            const parsed = JSON.parse(fRaw);
            flashcards = parsed.flashcards || parsed;
          } catch (e) { flashcards = []; }
        }
        return { ok: true, data: { players: [player], flashcards } };
      }
    }

    // Fallback: try to load a JSON file by name directly
    const filePath = path.join(dir, name.endsWith('.json') ? name : `${name}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    console.error('load-profile error', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('delete-profile', async (event, { name }) => {
  try {
  const dir = PROFILES_DIR;
  const filePath = path.join(dir, `${name}.json`);
    await fs.unlink(filePath);
    return { ok: true };
  } catch (err) {
    console.error('delete-profile error', err);
    return { ok: false, error: err.message };
  }
});

// Update root player.json (overwrite). Expects a player object.
ipcMain.handle('save-root-player', async (event, { player }) => {
  try {
    const dir = PROFILES_DIR;
    await fs.mkdir(dir, { recursive: true });
    const playerPath = path.join(dir, 'player.json');
    await fs.writeFile(playerPath, JSON.stringify(player, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('save-root-player error', err);
    return { ok: false, error: err.message };
  }
});

// Window control handler: minimize/maximize/toggle/fullscreen/close
ipcMain.handle('window-control', async (event, { action }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: 'No window' };
    switch ((action || '').toString()) {
      case 'minimize':
        win.minimize();
        break;
      case 'toggle-maximize':
        if (win.isMaximized()) win.unmaximize(); else win.maximize();
        break;
      case 'maximize':
        win.maximize();
        break;
      case 'unmaximize':
        win.unmaximize();
        break;
      case 'toggle-fullscreen':
        win.setFullScreen(!win.isFullScreen());
        break;
      case 'close':
        win.close();
        break;
      default:
        return { ok: false, error: 'Unknown action' };
    }
    return { ok: true, maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
  } catch (err) {
    console.error('window-control error', err);
    return { ok: false, error: err.message };
  }
});
