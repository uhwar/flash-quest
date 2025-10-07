# FlashQuest Electron Port (Skeleton)

This folder contains a minimal Electron port of the FlashQuest app adapted from the Java/JavaFX original.

What it includes:
- Converted core models: Player, Flashcard, Quest (simplified) in `renderer.js`
- Minimal UI in `index.html` that allows starting a sample quest and answering questions
- `main.js` Electron entry and `preload.js` for a safe renderer bridge
- `package.json` for starting the app

How to run
1. From PowerShell in this folder run:

   npm install
   npm start

Notes and next steps
- This is an initial playable skeleton to iterate on. The Java source contains more features (H2 persistence, FXML views, quest designer). We can progressively port additional views and services.
- I intentionally kept the UI minimal and inline for quick iteration. We can migrate to a framework (React/Vue) later.
