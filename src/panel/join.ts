// Sign-up page for the event (Kyle 11-07): what people leave here is sealed into the owner's vault.
const corgi = new URL('./assets/stage/corgi-wink.webp', import.meta.url).href;
const style = document.createElement('style');
style.textContent = `
:root{--ink:#282939;--cream:#fff3dc;--amber:#efa044;--red:#c4423a}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100svh;font-family:"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;color:var(--ink);background:linear-gradient(#9294ce 0%,#c6a8c3 46%,#ffd1a0 100%);display:grid;place-items:start center;padding:24px 16px 40px}
.card{width:100%;max-width:460px;background:var(--cream);border-radius:28px;padding:28px 22px 24px;box-shadow:0 18px 50px #35324d33}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:26px}
.mark{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--ink);color:var(--cream);font-size:20px}
.brand small{font-size:15px}
h1{font-size:24px;line-height:1.35;margin:18px 0 6px}
.lead{margin:0 0 18px;color:#5d5566;font-size:15px;line-height:1.6}
label{display:block;font-size:14px;font-weight:800;margin:14px 0 6px}
label span{font-weight:500;color:#7a7180}
input,textarea{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1.5px solid #d9cbb4;border-radius:12px;background:#fff}
textarea{min-height:84px;resize:vertical}
input:focus,textarea:focus{outline:3px solid #efa04466;border-color:var(--amber)}
.consent{display:flex;gap:10px;align-items:flex-start;font-size:14px;font-weight:500;line-height:1.5;margin-top:16px}
.consent input{width:20px;height:20px;margin-top:2px;flex:none}
button{margin-top:20px;width:100%;border:0;border-radius:14px;background:var(--ink);color:var(--cream);font:inherit;font-size:18px;font-weight:900;padding:15px}
button:disabled{opacity:.6}
.err{color:var(--red);font-size:14px;min-height:20px;margin:10px 0 0}
.hp{position:absolute;left:-9999px}
.done{text-align:center}.done img{width:150px;display:block;margin:6px auto 0}
.done h1{margin-top:8px}
.foot{margin-top:18px;text-align:center;font-size:12px;color:#7a7180}
`;
document.head.append(style);
const app = document.querySelector<HTMLDivElement>('#app')!;
const brand = '<div class="brand"><span class="mark">▰</span>PassVault <small>推庫</small></div>';
app.innerHTML = `<main class="card">${brand}
<h1>想試用、想合作？<br>留下聯絡方式</h1>
<p class="lead">AI 可以用你的金鑰，卻永遠看不到。開放試用時，我們會用 Email 通知你。你留的資料也會加密收進保險箱。</p>
<form novalidate>
<label for="name">名字</label><input id="name" name="name" autocomplete="name" maxlength="60" required>
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" maxlength="120" required>
<label for="phone">手機 <span>（選填）</span></label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="40">
<label for="note">想用在哪裡？<span>（選填）</span></label><textarea id="note" name="note" maxlength="400" placeholder="例如：讓 AI 幫我寄信，但不想給它 API 金鑰"></textarea>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="consent"><input type="checkbox" name="consent"> 我同意 PassVault 推庫用這些資料聯絡我，資料不會提供給其他人。</label>
<p class="err" role="alert"></p>
<button type="submit">送出</button>
</form>
<p class="foot">每一次使用，都在你的授權之內。</p></main>`;
const form = app.querySelector('form')!;
const err = app.querySelector<HTMLElement>('.err')!;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const body = {
    name: String(data.get('name') ?? ''), email: String(data.get('email') ?? ''), phone: String(data.get('phone') ?? ''),
    note: String(data.get('note') ?? ''), website: String(data.get('website') ?? ''), consent: data.get('consent') === 'on',
  };
  if (!body.name.trim()) { err.textContent = '請填名字'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) { err.textContent = 'Email 格式不正確'; return; }
  if (!body.consent) { err.textContent = '請勾選同意聯絡'; return; }
  const button = form.querySelector('button')!;
  button.disabled = true; err.textContent = '';
  try {
    const res = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || '暫時送不出去，請稍後再試'); }
    app.innerHTML = `<main class="card done">${brand}<img src="${corgi}" alt=""><h1>收到了，謝謝你！</h1><p class="lead">你的資料已經加密收進保險箱。開放試用時，我們會寄 Email 給你。</p><p class="foot">每一次使用，都在你的授權之內。</p></main>`;
  } catch (e) {
    err.textContent = e instanceof Error ? e.message : '暫時送不出去，請稍後再試';
    button.disabled = false;
  }
});
