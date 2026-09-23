import { startGui } from './server.js';
const port = Number(process.env.GUI_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('GUI_PORT must be between 1024 and 65535');
startGui({ port }).then(gui => {
  console.log(`Interface.ai control panel: ${gui.url}\nOpen this URL in your browser. Press Ctrl+C to stop.`);
  process.once('SIGINT', () => { void gui.close().then(() => process.exit(0)); });
  process.once('SIGTERM', () => { void gui.close().then(() => process.exit(0)); });
}).catch(() => { console.error('Control panel could not start. Check GUI_PORT is available.'); process.exitCode = 1; });
