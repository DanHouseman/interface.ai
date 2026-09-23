import { spawn } from 'node:child_process';

const launchGui = process.argv.includes('--launch-gui');
const printOnly = process.argv.includes('--print-only');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const useColor = !process.env.NO_COLOR;
const inPlace = Boolean(process.stdout.isTTY) && !process.env.CI;
const color = (code, value) => useColor ? `\u001b[${code}m${value}\u001b[0m` : value;
const cyan = value => color('36', value);
const blue = value => color('34', value);
const green = value => color('32', value);
const red = value => color('31', value);
const dim = value => color('2', value);
let statusDrawn = false;

const steps = [
  { title: 'Install locked npm dependencies', command: npm, args: ['ci'] },
  { title: 'Install Playwright Chromium', command: npx, args: ['playwright', 'install', 'chromium'] },
  { title: 'Type-check source and tests', command: npm, args: ['run', 'typecheck'] },
  { title: 'Run the test suite', command: npm, args: ['test'] },
  { title: 'Verify 100% configured coverage', command: npm, args: ['run', 'coverage'] },
  { title: 'Build compiled JavaScript', command: npm, args: ['run', 'build'] },
  { title: 'Verify included evidence bundle', command: npm, args: ['run', 'verify:evidence'] },
];

function commandLine(step) {
  return [step.command, ...step.args].join(' ');
}

function renderStatus(step, index, status) {
  if (statusDrawn && inPlace) process.stdout.write('\u001b[2A\u001b[J');
  const suffix = status ? ` ${status}` : '';
  process.stdout.write(`${cyan(`[${index + 1}/${steps.length}] ${step.title}`)}${suffix}\n`);
  process.stdout.write(`${blue(`(${commandLine(step)})`)}\n`);
  statusDrawn = true;
}

function outputFailureLog(text) {
  if (!text.trim()) return;
  process.stderr.write(`\n${red('Command output:')}\n${text.trim()}\n`);
}

function run(step, index) {
  renderStatus(step, index, dim('running'));
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(step.command, step.args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    child.stdout?.on('data', chunk => { output += chunk; });
    child.stderr?.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) {
        renderStatus(step, index, green('Pass'));
        resolve();
      } else {
        renderStatus(step, index, red('Failure'));
        outputFailureLog(output);
        reject(new Error(`${commandLine(step)} exited with status ${code ?? 'unknown'}`));
      }
    });
  });
}

try {
  console.log(cyan('Interface.ai setup'));
  console.log('This script shows each step in place and prints command output only if a step fails.');
  console.log('\nPlan:');
  for (const [index, step] of steps.entries()) console.log(`${cyan(`${index + 1}. ${step.title}`)}\n   ${blue(`(${commandLine(step)})`)}`);
  if (printOnly) {
    console.log(`\n${green('Print-only mode complete.')} Remove --print-only to run the setup.`);
    process.exit(0);
  }
  if (inPlace) process.stdout.write(`\u001b[${4 + steps.length * 2}A\u001b[J`);
  console.log(cyan('Interface.ai setup'));
  console.log(`Running ${steps.length} setup steps in place. Command output appears only if a step fails.\n`);
  for (const [index, step] of steps.entries()) await run(step, index);
  console.log(`\n${green('Setup complete.')}`);
  if (launchGui) {
    console.log('\nLaunching the local GUI. Leave this process running while you use the control panel.');
    console.log(blue('(npm run gui)'));
    await new Promise((resolve, reject) => {
      const child = spawn(npm, ['run', 'gui'], { stdio: 'inherit', shell: false });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`npm run gui exited with status ${code ?? 'unknown'}`)));
    });
  } else {
    console.log('\nNext step:');
    console.log(blue('(npm run gui)'));
    console.log('\nTo have setup launch the GUI automatically, run:');
    console.log(blue('(npm run setup -- --launch-gui)'));
    console.log('\nTo preview the commands without running them, run:');
    console.log(blue('(npm run setup -- --print-only)'));
  }
} catch (error) {
  console.error(`\n${red('Setup failed:')} ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}