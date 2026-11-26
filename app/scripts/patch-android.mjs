// After `npx cap add android`: the game plays sideways and full screen, voice chat can use the microphone,
// and each build gets a higher version number. Usage: node scripts/patch-android.mjs <build number>
import fs from 'node:fs';

const build = Math.max(1, parseInt(process.argv[2], 10) || 1);
const edit = (file, change) => {
  const before = fs.readFileSync(file, 'utf8');
  const after = change(before);
  if (after === before) throw new Error(`nothing changed in ${file}`);
  fs.writeFileSync(file, after);
  console.log('patched', file);
};

edit('android/app/src/main/AndroidManifest.xml', (s) => s
  // landscape either way round
  .replace(/<activity\b(?![^>]*screenOrientation)/, '<activity\n            android:screenOrientation="sensorLandscape"')
  // voice chat
  .replace('</manifest>', '    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n</manifest>'));

// no status bar over the game
edit('android/app/src/main/res/values/styles.xml', (s) => s.replace(
  /(<style name="AppTheme\.NoActionBar"[^>]*>)/,
  '$1\n        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>',
));

edit('android/app/build.gradle', (s) => s
  .replace(/versionCode \d+/, `versionCode ${build}`)
  .replace(/versionName "[^"]*"/, `versionName "1.0.${build}"`));
