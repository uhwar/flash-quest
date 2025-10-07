const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');
const Jimp = require('jimp');

(async function(){
  try {
    const src = path.join(__dirname, '..', 'icon', 'pngwing.com.png');
    const out = path.join(__dirname, '..', 'icon', 'app.ico');
    const tmp = path.join(__dirname, '..', 'icon', '_tmp_256.png');
    if (!fs.existsSync(src)) {
      console.error('Source PNG not found:', src);
      process.exit(1);
    }
    // Load and resize to 256x256 for ico generation
    const img = await Jimp.read(src);
    await img.resize(256, 256).writeAsync(tmp);
    const buf = await pngToIco(tmp);
    fs.writeFileSync(out, buf);
    // cleanup tmp
    try { fs.unlinkSync(tmp); } catch (e) {}
    console.log('Wrote ICO:', out);
  } catch (err) {
    console.error('Icon generation failed', err);
    process.exit(1);
  }
})();
