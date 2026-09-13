const $ = (s) => document.querySelector(s);
async function run(mode){
  $('#status').textContent='Agent running…'; $('#badge').textContent='RUNNING'; $('#badge').className='status running'; $('#timeline').innerHTML=''; $('#summary').textContent='Inspecting commit, deployment, and production acceptance criteria…';
  const res=await fetch(`/api/demo?mode=${mode}`,{method:'POST'}); const run=await res.json(); render(run);
}
function render(run){
  $('#status').textContent = run.status === 'verified' ? 'Verified in production' : run.status === 'failed' ? 'Release blocked' : run.status;
  $('#badge').textContent=run.status.toUpperCase(); $('#badge').className=`status ${run.status}`; $('#eventCount').textContent=run.events?.length||0;
  $('#summary').textContent = run.status === 'verified' ? run.policy?.reason : `${run.policy?.reason||''} ${run.diagnosis?.summary||''}`;
  $('#timeline').innerHTML=(run.events||[]).map(e=>`<div class="event ${e.kind}"><div class="app">${e.app}</div><div class="message">${e.message}</div><div class="kind">${e.kind}</div></div>`).join('');
}
$('#broken').onclick=()=>run('broken'); $('#healthy').onclick=()=>run('healthy');
fetch('/api/runs').then(r=>r.json()).then(r=>r[0]&&render(r[0]));
