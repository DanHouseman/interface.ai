import { createServer } from "node:http";

// Milestone 12 | Assignment §3.1, §3.3, §3.6 | REQ-SRF-003
// A real local UI with synthetic data, legacy table layout, multi-step navigation,
// delayed responses, domain outcomes, expired sessions and an operator-only unblock.
export const demoHtml = `<!doctype html><html><head><title>Synthetic Member Desk</title>
<style>body{font:18px system-ui;max-width:900px;margin:60px auto;background:#edf1f4;color:#162838}table{background:white;padding:24px;width:100%}td{padding:12px}input,button{font:inherit;padding:10px}#operator{padding:20px;background:#ffe9b5}#detail{padding:24px;background:white}</style></head>
<body><h1>Synthetic Member Desk</h1><p>Local demonstration. All member data is fictional.</p>
<div id="operator" hidden>Operator approval required <button id="unblock">Release session</button></div>
<p id="ready">Ready</p><table id="search"><tr><td><label for="member">Member ID</label></td><td><input id="member" autocomplete="off"></td></tr>
<tr><td></td><td><button id="find">Find member</button></td></tr></table><div id="result"></div><div id="detail" hidden></div>
<script>
const mode=new URLSearchParams(location.search).get('scenario');
const balances={'DEMO-001':'$123.45','DEMO-002':'$678.90'};
if(mode==='handoff'){document.querySelector('#operator').hidden=false;document.querySelector('#ready').textContent='Waiting for operator';}
document.querySelector('#unblock').onclick=()=>{document.querySelector('#operator').hidden=true;document.querySelector('#ready').textContent='Ready';};
document.querySelector('#find').onclick=()=>{
 if(!document.querySelector('#operator').hidden)return;
 const id=document.querySelector('#member').value;
 const result=document.querySelector('#result');result.textContent='Loading';
 setTimeout(()=>{
 if(mode==='expired'){document.body.dataset.sessionState='expired';result.textContent='Session expired';return;}
 if(mode==='denied'){result.textContent='Permission denied';return;}
 if(!/^DEMO-\\d{3}$/.test(id)){result.textContent='Invalid member ID';return;}
 if(!balances[id]){result.textContent='Member not found';return;}
 result.replaceChildren();const button=document.createElement('button');button.id='open';button.textContent='Open member';result.append(button);
 button.onclick=()=>{const detail=document.querySelector('#detail');detail.hidden=false;detail.innerHTML='<h2>Member detail</h2><p>Member <span id="selected"></span></p><p>Savings balance <span id="balance"></span></p>';detail.querySelector('#selected').textContent=id;detail.querySelector('#balance').textContent=balances[id];};
 },mode==='slow'?150:0);
};
</script></body></html>`;

export async function startDemoApp(port = 0): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.url?.split("?")[0] !== "/") { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(demoHtml);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}/`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
