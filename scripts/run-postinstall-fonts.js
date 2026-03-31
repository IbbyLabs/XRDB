const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const shouldSkipFontInstall = () =>
  process.env.XRDB_SKIP_FONT_INSTALL === '1' || process.env.CI === 'true';

const getInstallerConfig = () => {
  if (process.platform === 'linux') {
    return {
      scriptPath: join(__dirname, 'setup-linux-fonts.sh'),
      command: 'bash',
      args: [],
      label: 'Linux',
      rerunCommand: 'npm run fonts:install',
    };
  }

  if (process.platform === 'win32') {
    return {
      scriptPath: join(__dirname, 'setup-windows-fonts.ps1'),
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'],
      label: 'Windows',
      rerunCommand: 'npm run fonts:install:win',
    };
  }

  return null;
};

const runInstaller = (config) => {
  if (!existsSync(config.scriptPath)) {
    console.log('[postinstall] fonts script not found, skipping.');
    return;
  }

  console.log(`[postinstall] Installing system fonts for ${config.label}.`);
  const result = spawnSync(config.command, [...config.args, config.scriptPath], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.warn(`[postinstall] Font installation failed. You can rerun: ${config.rerunCommand}`);
  }
};

if (shouldSkipFontInstall()) {
  process.exit(0);
}

const installerConfig = getInstallerConfig();
if (!installerConfig) {
  process.exit(0);
}

runInstaller(installerConfig);
process.exit(0);
