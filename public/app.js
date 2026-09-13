const $ = (selector) => document.querySelector(selector);
const titleCase = (value = '') => String(value).replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  node.classList.remove('empty-state');
}

function textElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function setRunning(running) {
  $('#broken').disabled = running;
  $('#healthy').disabled = running;
  if (running) {
    $('#status').textContent = 'Agent running…';
    $('#badge').textContent = 'RUNNING';
    $('#badge').className = 'status running';
    $('#summary').textContent = 'Inspecting release context, deployment state and production acceptance criteria…';
  }
}

async function runDemo(mode) {
  setRunning(true);
  try {
    const res = await fetch(`/api/demo?mode=${encodeURIComponent(mode)}`, { method: 'POST' });
    const run = await res.json();
    if (!res.ok) throw new Error(run.error || run.errors?.join(' ') || `Request failed (${res.status})`);
    renderRun(run);
    await loadRecentRuns();
  } catch (error) {
    $('#status').textContent = 'Run failed';
    $('#badge').textContent = 'ERROR';
    $('#badge').className = 'status error';
    $('#summary').textContent = error.message;
  } finally {
    setRunning(false);
  }
}

function renderChecks(run) {
  const root = $('#checks');
  clear(root);
  const checks = run.checks || [];
  const passed = checks.filter((check) => check.passed).length;
  $('#checksScore').textContent = checks.length ? `${passed}/${checks.length} PASS` : 'NO CHECKS';
  if (!checks.length) {
    root.classList.add('empty-state');
    root.textContent = 'No acceptance checks were recorded.';
    return;
  }
  for (const check of checks) {
    const card = document.createElement('article');
    card.className = `check-card ${check.passed ? 'pass' : 'fail'}`;
    const top = document.createElement('div');
    top.className = 'check-top';
    top.append(textElement('strong', '', check.name || 'Unnamed check'));
    top.append(textElement('span', 'check-result', check.passed ? 'PASS' : 'FAIL'));
    card.append(top);
    card.append(textElement('p', '', check.detail || ''));
    const facts = document.createElement('div');
    facts.className = 'check-facts';
    if (check.status) facts.append(textElement('span', '', `HTTP ${check.status}`));
    if (Number.isFinite(check.durationMs)) facts.append(textElement('span', '', `${check.durationMs} ms`));
    if (check.critical !== false) facts.append(textElement('span', '', 'authoritative'));
    card.append(facts);
    root.append(card);
  }
}

function renderActions(run) {
  const root = $('#actions');
  clear(root);
  const actions = run.actions || [];
  if (!actions.length) {
    root.classList.add('empty-state');
    root.textContent = run.status === 'verified' ? 'No incident actions were needed.' : 'No actions recorded.';
    return;
  }
  for (const action of actions) {
    const row = document.createElement('div');
    row.className = `action-row ${action.ok ? 'ok' : 'bad'}`;
    const copy = document.createElement('div');
    copy.append(textElement('strong', '', titleCase(action.app)));
    copy.append(textElement('span', '', titleCase(action.action)));
    const mode = action.result?.simulated ? 'SIMULATED' : action.result?.requiresApproval ? 'APPROVAL' : action.result?.skipped ? 'SKIPPED' : action.ok ? 'DONE' : 'FAILED';
    row.append(copy, textElement('span', 'action-mode', mode));
    root.append(row);
  }
}

function renderRecovery(run) {
  const root = $('#recovery');
  clear(root);
  if (!run.recovery) {
    root.classList.add('empty-state');
    root.textContent = run.status === 'verified' ? 'Recovery was not needed.' : 'No automated recovery completed.';
    return;
  }
  root.className = `recovery-box ${run.recovery.verified ? 'recovered' : 'unrecovered'}`;
  root.append(textElement('strong', '', run.recovery.verified ? 'Production restored' : 'Recovery not yet verified'));
  root.append(textElement('p', '', `${run.recovery.attempts} verification attempt${run.recovery.attempts === 1 ? '' : 's'} · ${run.recovery.checks?.filter((check) => check.passed).length || 0}/${run.recovery.checks?.length || 0} checks passing`));
}

function renderTimeline(run) {
  const root = $('#timeline');
  clear(root);
  const events = run.events || [];
  if (!events.length) {
    root.classList.add('empty-state');
    root.textContent = 'No trajectory recorded.';
    return;
  }
  for (const item of events) {
    const row = document.createElement('div');
    row.className = `event ${item.kind || ''}`;
    row.append(textElement('div', 'event-app', String(item.app || 'proofship').toUpperCase()));
    const copy = document.createElement('div');
    copy.className = 'event-copy';
    copy.append(textElement('strong', '', item.message || 'Event'));
    if (item.at) copy.append(textElement('span', '', new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })));
    row.append(copy, textElement('div', 'event-kind', titleCase(item.kind || 'event')));
    root.append(row);
  }
}

function renderRun(run) {
  const statusLabel = run.status === 'verified'
    ? 'Verified in production'
    : run.recovery?.verified
      ? 'Bad release blocked · production restored'
      : run.status === 'failed'
        ? 'Release blocked'
        : titleCase(run.status || 'unknown');
  $('#status').textContent = statusLabel;
  $('#badge').textContent = run.recovery?.verified ? 'RECOVERED' : String(run.status || 'unknown').toUpperCase();
  $('#badge').className = `status ${run.recovery?.verified ? 'recovered' : run.status || 'idle'}`;
  $('#eventCount').textContent = run.events?.length || 0;
  $('#runMode').textContent = String(run.mode || '—').toUpperCase();
  $('#runSource').textContent = titleCase(run.source || 'manual');
  $('#summary').textContent = run.status === 'verified'
    ? run.policy?.reason || 'All release evidence passed.'
    : `${run.policy?.reason || ''}${run.diagnosis?.summary ? ` ${run.diagnosis.summary}` : ''}`.trim() || run.error || 'Release did not pass verification.';

  const meta = $('#meta');
  clear(meta);
  const values = [
    run.input?.sha ? `commit ${String(run.input.sha).slice(0, 7)}` : null,
    run.input?.deploymentId || null,
    run.diagnosis?.source ? `diagnosis: ${run.diagnosis.source}` : null,
    run.duplicate ? 'duplicate event suppressed' : null
  ].filter(Boolean);
  for (const value of values) meta.append(textElement('span', '', value));

  renderChecks(run);
  renderActions(run);
  renderRecovery(run);
  renderTimeline(run);
}

function renderIntegrations(config) {
  const root = $('#integrations');
  clear(root);
  const entries = Object.entries(config.integrations || {});
  for (const [name, info] of entries) {
    const row = document.createElement('div');
    row.className = 'integration-row';
    const copy = document.createElement('div');
    copy.append(textElement('strong', '', titleCase(name)));
    if (info.webhook) copy.append(textElement('span', '', `webhook ${info.webhook}`));
    row.append(copy, textElement('span', `connection ${info.mode === 'live' ? 'live' : 'simulated'}`, String(info.mode || 'unknown').toUpperCase()));
    root.append(row);
  }
  const configured = entries.filter(([, info]) => info.mode === 'live').length;
  const system = $('#systemState');
  clear(system);
  system.append(textElement('span', 'dot', ''));
  system.append(textElement('span', '', `${configured}/${entries.length} live integrations · CI-ready core`));
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    renderIntegrations(await res.json());
  } catch {
    $('#systemState').textContent = 'System state unavailable';
  }
}

async function loadRecentRuns() {
  const root = $('#recentRuns');
  try {
    const res = await fetch('/api/runs');
    const runs = await res.json();
    clear(root);
    if (!runs.length) {
      root.classList.add('empty-state');
      root.textContent = 'No saved runs yet.';
      return;
    }
    for (const run of runs.slice(0, 6)) {
      const row = document.createElement('button');
      row.className = 'run-row';
      row.type = 'button';
      const copy = document.createElement('div');
      copy.append(textElement('strong', '', run.recovery?.verified ? 'RECOVERED' : String(run.status || 'unknown').toUpperCase()));
      copy.append(textElement('span', '', `${String(run.input?.sha || '').slice(0, 7) || 'no-sha'} · ${titleCase(run.source || 'manual')}`));
      row.append(copy, textElement('span', '', run.createdAt ? new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''));
      row.addEventListener('click', () => renderRun(run));
      root.append(row);
    }
  } catch {
    root.classList.add('empty-state');
    root.textContent = 'Run history unavailable.';
  }
}

$('#broken').addEventListener('click', () => runDemo('broken'));
$('#healthy').addEventListener('click', () => runDemo('healthy'));

Promise.all([loadConfig(), loadRecentRuns()]).then(async () => {
  try {
    const res = await fetch('/api/runs');
    const runs = await res.json();
    if (runs[0]) renderRun(runs[0]);
  } catch { /* first load can stay empty */ }
});
