import { readFileSync, writeFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

writeFileSync('src/version.ts',
  `// Auto-generated from package.json — do not edit. Run npm run build to update.\nexport const PLUGIN_VERSION = '${version}';\n`);

writeFileSync('ios/Sources/CameraMultiCapturePlugin/PluginVersion.swift',
  `// Auto-generated from package.json — do not edit. Run npm run build to update.\nlet pluginVersion = "${version}"\n`);

writeFileSync('android/src/main/java/dev/hemang/cameramulticapture/PluginVersion.java',
  `// Auto-generated from package.json — do not edit. Run npm run build to update.\npackage dev.hemang.cameramulticapture;\n\npublic final class PluginVersion {\n    public static final String VERSION = "${version}";\n}\n`);

console.log(`Version files generated for v${version}`);
