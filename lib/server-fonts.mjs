import path from 'node:path';

let sharpPromise = null;

export function configureServerFonts() {
  const fontDirectory = path.join(process.cwd(), 'public/fonts');
  process.env.FONTCONFIG_PATH = fontDirectory;
  process.env.FONTCONFIG_FILE = path.join(fontDirectory, 'fonts.conf');
}

export function getServerSharp() {
  configureServerFonts();
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((module) => module.default);
  }
  return sharpPromise;
}
