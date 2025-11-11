const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Solo per macOS
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Verifica che le variabili d'ambiente siano configurate
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('\n⚠️  NOTARIZATION SKIPPED');
    console.log('   No Apple Developer credentials found.');
    console.log('   The app will be built but not notarized.');
    console.log('   Users will need to bypass Gatekeeper manually.\n');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`🔐 Notarizing ${appPath}...`);

  try {
    await notarize({
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });

    console.log('✅ Notarization completed successfully!');
  } catch (error) {
    console.error('❌ Notarization failed:', error);
    throw error;
  }
};
