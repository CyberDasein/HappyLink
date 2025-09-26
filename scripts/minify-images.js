const path = require('path');
const fs = require('fs');
const glob = require('glob');
const imageminPkg = require('imagemin');
const imagemin = imageminPkg && imageminPkg.default ? imageminPkg.default : imageminPkg;
const imageminPngquantPkg = require('imagemin-pngquant');
const imageminMozjpegPkg = require('imagemin-mozjpeg');
const imageminWebpPkg = require('imagemin-webp');

// Some versions export the plugin factory as .default
const imageminPngquant = imageminPngquantPkg && imageminPngquantPkg.default ? imageminPngquantPkg.default : imageminPngquantPkg;
const imageminMozjpeg = imageminMozjpegPkg && imageminMozjpegPkg.default ? imageminMozjpegPkg.default : imageminMozjpegPkg;
const imageminWebp = imageminWebpPkg && imageminWebpPkg.default ? imageminWebpPkg.default : imageminWebpPkg;

async function run() {
  const srcPattern = path.resolve(__dirname, '../src/templates/**/images/*.{png,jpg,jpeg,webp,gif,svg}');
  const files = glob.sync(srcPattern, { nodir: true });
  if (!files.length) {
    console.log('No template images found to minify.');
    return;
  }

  const outDir = path.resolve(__dirname, '../docs/assets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`Minifying ${files.length} images to ${outDir} ...`);

  try {
    const pngOrJpeg = files.filter(f => /\.(png|jpe?g)$/i.test(f));
    const webpFiles = files.filter(f => /\.webp$/i.test(f));
    const otherFiles = files.filter(f => /\.(gif|svg)$/i.test(f));

    // Process PNG/JPEG with pngquant + mozjpeg via imagemin
    if (pngOrJpeg.length) {
      try {
        const plugins = [];
        if (imageminMozjpeg) plugins.push(imageminMozjpeg({ quality: 80 }));
        if (imageminPngquant) plugins.push(imageminPngquant({ quality: [0.6, 0.8] }));
        if (plugins.length) {
          await imagemin(pngOrJpeg, {
            destination: outDir,
            plugins,
          });
        } else {
          // fallback: copy files as-is
          pngOrJpeg.forEach(src => fs.copyFileSync(src, path.join(outDir, path.basename(src))));
        }
      } catch (e) {
        console.warn('Warning: error while minifying PNG/JPEG, copying as-is:', e && e.message ? e.message : e);
        pngOrJpeg.forEach(src => fs.copyFileSync(src, path.join(outDir, path.basename(src))));
      }
    }

    if (webpFiles.length) {
      try {
        if (imageminWebp) {
          await imagemin(webpFiles, {
            destination: outDir,
            plugins: [imageminWebp({ quality: 80 })],
          });
        } else {
          webpFiles.forEach(src => fs.copyFileSync(src, path.join(outDir, path.basename(src))));
        }
      } catch (e) {
        console.warn('Warning: error while minifying WebP, copying as-is:', e && e.message ? e.message : e);
        webpFiles.forEach(src => fs.copyFileSync(src, path.join(outDir, path.basename(src))));
      }
    }

    // Copy other files (gif, svg) as-is
    otherFiles.forEach(src => {
      const dest = path.join(outDir, path.basename(src));
      fs.copyFileSync(src, dest);
    });

    console.log('Images minified and copied.');
  } catch (err) {
    console.error('Error while minifying images:', err);
    process.exit(1);
  }
}

run();
