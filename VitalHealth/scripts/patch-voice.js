const fs = require('fs');
const path = require('path');

const voiceModulePath = path.join(__dirname, '../node_modules/@react-native-voice/voice/android/src/main/java/com/wenkesj/voice/VoiceModule.java');
const distIndexPath = path.join(__dirname, '../node_modules/@react-native-voice/voice/dist/index.js');
const srcIndexPath = path.join(__dirname, '../node_modules/@react-native-voice/voice/src/index.ts');

if (fs.existsSync(voiceModulePath)) {
  let content = fs.readFileSync(voiceModulePath, 'utf8');
  if (content.includes('return "RCTVoice";')) {
    content = content.replace('return "RCTVoice";', 'return "Voice";');
    fs.writeFileSync(voiceModulePath, content, 'utf8');
    console.log('✅ Patched VoiceModule.java getName() to "Voice"');
  }
}

if (fs.existsSync(distIndexPath)) {
  let content = fs.readFileSync(distIndexPath, 'utf8');
  if (content.includes('const Voice = react_native_1.NativeModules.Voice;')) {
    content = content.replace('const Voice = react_native_1.NativeModules.Voice;', 'const Voice = react_native_1.NativeModules.Voice || react_native_1.NativeModules.RCTVoice;');
    fs.writeFileSync(distIndexPath, content, 'utf8');
    console.log('✅ Patched Voice dist/index.js NativeModules lookup');
  }
}

if (fs.existsSync(srcIndexPath)) {
  let content = fs.readFileSync(srcIndexPath, 'utf8');
  if (content.includes('const Voice = NativeModules.Voice as VoiceModule;')) {
    content = content.replace('const Voice = NativeModules.Voice as VoiceModule;', 'const Voice = (NativeModules.Voice || NativeModules.RCTVoice) as VoiceModule;');
    fs.writeFileSync(srcIndexPath, content, 'utf8');
    console.log('✅ Patched Voice src/index.ts NativeModules lookup');
  }
}
