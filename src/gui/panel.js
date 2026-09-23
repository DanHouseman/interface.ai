'use strict';
const $ = id => document.getElementById(id);
let state, selectedRun, polling = false;
const help = {
  offline: 'Scripted discovery saves a verified capability, then replays it automatically. No model API calls.',
  discover: 'The model discovers the supported goal. Verified steps are saved and replayed automatically.',
  replay: 'Run the selected capability with a new member ID. No model is loaded or called.',
  handoff: 'Replay pauses for human release. Resolve the block in the same application browser, then return control here.'
};
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
async function post(path, input) {
  const response = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gui-Token': state.token }, body: JSON.stringify(input) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error + (data.message ? ': ' + data.message : ''));
  return data;
}
function text(tag, content) { const node = document.createElement(tag); node.textContent = content; return node; }
function modeChanged() {
  const mode = $('mode').value, saved = mode === 'replay' || mode === 'handoff';
  $('saved-fields').hidden = !saved; $('consent-label').hidden = mode !== 'discover';
  $('mode-help').textContent = help[mode]; $('port').disabled = saved;
  $('scenario').disabled = mode === 'handoff';
  if (mode === 'handoff') { $('headed').checked = true; $('scenario').value = 'handoff'; }
  $('start').textContent = saved ? 'Start replay ↗' : 'Start discovery ↗';
  $('unsupported').hidden = $('application').value === 'synthetic-member-desk';
  const capability = state?.capabilities.find(c => c.id === $('artifact').value);
  $('artifact-info').textContent = capability ? `${capability.steps} saved steps · port ${capability.port} · input: memberId` : 'Run discovery first to save a capability.';
  $('start').disabled = !state || !state.setup.browserInstalled || state.runs.some(r => ['running','paused','cancelling'].includes(r.status)) || !$('unsupported').hidden || (saved && !capability);
}
function pickCapability(id) { $('artifact').value = id; $('mode').value = 'replay'; modeChanged(); $('member').focus(); }
function render() {
  $('connection').textContent = '● Connected locally';
  $('ready').textContent = state.setup.browserInstalled ? 'Ready' : 'Install Chromium';
  $('setup-status').textContent = state.setup.browserInstalled ? `${state.setup.node} · Chromium installed · ${state.setup.credentialsConfigured ? 'Live discovery configured' : 'Offline and replay ready'}` : 'Chromium is missing. Run npx playwright install chromium in the project terminal, then refresh.';
  if (!$('model').value) $('model').value = state.setup.modelName;
  const previous = $('artifact').value;
  const signature = JSON.stringify(state.capabilities);
  if ($('library').dataset.signature !== signature) {
    $('library').dataset.signature = signature; $('artifact').replaceChildren(); $('library').replaceChildren();
    for (const entry of state.capabilities) {
      const option = text('option', `${entry.name} · ${entry.created}`); option.value = entry.id; $('artifact').append(option);
      const card = document.createElement('div'); card.className = 'card'; const description = document.createElement('div');
      description.append(text('strong', entry.name), text('small', `${entry.steps} steps · port ${entry.port} · ${entry.created}`));
      const button = text('button', 'Use for replay'); button.className = 'secondary'; button.onclick = () => pickCapability(entry.id);
      card.append(description, button); $('library').append(card);
    }
    if (!state.capabilities.length) $('library').append(text('p', 'No saved capabilities yet. Complete discovery to create your first one.'));
    if (state.capabilities.some(c => c.id === previous)) $('artifact').value = previous;
  }
  const active = state.runs.find(r => ['running','paused','cancelling'].includes(r.status));
  const run = active || state.runs.find(r => r.id === selectedRun) || state.runs[0];
  $('cancel').disabled = !active || active.status === 'cancelling';
  $('handoff').hidden = !run?.handoff; $('resume').disabled = !run?.handoff;
  if (run) {
    $('run-status').textContent = run.status; $('phase').textContent = run.phase;
    $('execution-help').textContent = `${run.mode} · Session ${run.id.slice(0,8)}`;
    $('calls').textContent = run.modelCalls; $('replay-calls').textContent = run.modelCallsDuringReplay;
    $('elapsed').textContent = Math.max(0,Math.round(((run.ended ? Date.parse(run.ended) : Date.now()) - Date.parse(run.started))/1000)) + 's';
    $('result').textContent = run.disposition ? `${run.disposition} / ${run.code}` : run.code || '';
    $('evidence').textContent = run.directory ? 'Saved evidence: ' + run.directory : '';
    if (run.handoff) $('handoff-reason').textContent = 'Reason: ' + run.handoff.reason;
    const eventsKey = run.id + ':' + run.events.length;
    if ($('events').dataset.key !== eventsKey) {
      $('events').dataset.key = eventsKey; $('events').replaceChildren(...run.events.map(event => { const li = document.createElement('li'); li.append(text('time', new Date(event.time).toLocaleTimeString()), text('span', event.message)); return li; }));
    }
  }
  $('history').replaceChildren(...state.runs.map(run => {
    const row = document.createElement('div'); row.className = 'history-row';
    row.append(text('span', `${run.mode} · ${run.status} · ${new Date(run.started).toLocaleTimeString()}`));
    const button = text('button','View'); button.onclick = () => { selectedRun = run.id; render(); }; row.append(button); return row;
  }));
  if (!state.runs.length) $('history').append(text('p','Your runs will appear here.'));
  modeChanged();
}
async function refresh() {
  if (polling) return; polling = true;
  try { const response = await fetch('/api/state'); if (!response.ok) throw new Error('Connection failed'); state = await response.json(); render(); }
  catch { $('connection').textContent = 'Disconnected · retrying'; $('start').disabled = true; $('resume').disabled = true; $('cancel').disabled = true; }
  finally { polling = false; }
}
$('mode').onchange = modeChanged; $('application').onchange = modeChanged; $('artifact').onchange = modeChanged; $('refresh').onclick = refresh;
$('setup').onsubmit = async event => { event.preventDefault(); error(''); try { await post('setup', { apiKey: $('api-key').value, model: $('model').value }); $('api-key').value = ''; $('setup-saved').textContent = ' Saved for this session.'; await refresh(); } catch (e) { error(e.message); } };
$('run-form').onsubmit = async event => {
  event.preventDefault(); error(''); $('start').disabled = true;
  try {
    const mode = $('mode').value;
    if (['handoff','discovery-handoff'].includes($('scenario').value) || mode === 'handoff') $('headed').checked = true;
    const result = await post('run', { application: $('application').value, goal: $('goal').value, mode, memberId: $('member').value, port: Number($('port').value), scenario: $('scenario').value, headed: $('headed').checked, slowMoMs: Number($('slow').value), artifactId: $('artifact').value || undefined, liveConsent: $('consent').checked });
    selectedRun = result.runId; await refresh();
  } catch (e) { error(e.message); modeChanged(); }
};
async function control(action) {
  const run = state.runs.find(r => ['running','paused','cancelling'].includes(r.status)); if (!run) return;
  error(''); $('resume').disabled = true;
  try { await post('control', { runId: run.id, action, handoffId: run.handoff?.id }); await refresh(); } catch (e) { error(e.message); }
}
$('resume').onclick = () => control('resume'); $('cancel').onclick = () => control('cancel');
void refresh(); setInterval(refresh, 1000);
