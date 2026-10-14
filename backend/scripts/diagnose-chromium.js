// Diagnóstico local: não acessa voos, banco, credenciais ou notificações.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

async function main() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';
  console.log('Node:', process.version);
  console.log('Playwright:', require('playwright/package.json').version);
  console.log('Chromium:', execFileSync(executablePath, ['--version'], {encoding:'utf8', timeout:10000}).trim());
  for (const name of ['memory.max', 'memory.current', 'memory.events', 'pids.max', 'pids.current']) {
    try { console.log(name + ':', fs.readFileSync('/sys/fs/cgroup/' + name, 'utf8').trim()); } catch (_) {}
  }
  for (const single of [true, false]) {
    let browser;
    try {
      browser = await chromium.launch({executablePath, headless:true, timeout:20000,
        args:['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', ...(single ? ['--single-process'] : [])]});
      const page = await browser.newPage();
      await page.setContent('<p>Chromium OK</p>');
      if (await page.textContent('p') !== 'Chromium OK') throw new Error('Conteúdo inesperado');
      await page.pdf();
      console.log(`OK: navegador e PDF ${single ? 'com' : 'sem'} --single-process`);
    } catch (error) {
      console.log(`FALHA ${single ? 'com' : 'sem'} --single-process:`, error.message);
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
