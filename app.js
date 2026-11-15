/* Железный Эксперт — Telegram Mini App */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor("#0B0D18"); tg.setBackgroundColor("#0B0D18"); tg.setBottomBarColor?.("#0B0D18"); } catch (e) {}
}
const haptic = (t = "light") => { try { tg?.HapticFeedback?.impactOccurred(t); } catch (e) {} };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rub = n => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ") + " ₽";
// Перерисовка блока: анимируем появление только когда меняется «что показываем», а не каждое число
function paint(out, html, key) {
  out.innerHTML = html;
  if (out.dataset.k !== key) {
    out.dataset.k = key;
    out.classList.toggle("enter", false); void out.offsetWidth; out.classList.toggle("enter", true);
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let DB = null;
const state = { part: null, build: null, purpose: "games", mode: "new" };

/* ---------- Оценка цены ---------- */
const TIPS = {
  gpu: [
    "Видео стресс-теста FurMark или OCCT 10–15 минут с температурами",
    "Проверить модель в GPU-Z — бывают перепрошитые подделки",
    "Посмотреть, ровно ли крутятся вентиляторы, нет ли следов вскрытия",
  ],
  cpu: [
    "Фото ножек: у AM4 они на процессоре, у Intel и AM5 — в сокете платы",
    "Скрин CPU-Z — модель должна совпадать с заявленной",
  ],
};
const ZONES = [ // доля от рыночной цены б/у
  { to: 0.6, color: "#F08091", key: "sus" },
  { to: 0.85, color: "#69D5AD", key: "great" },
  { to: 1.1, color: "#91A8F2", key: "ok" },
  { to: 1.3, color: "#F1BB78", key: "pricey" },
  { to: 1.6, color: "#F08091", key: "over" },
];

function verdict(price, used, nw) {
  if (nw && price >= nw * 0.95)
    return { key: "over", emoji: "❌", title: "Переплата", note: `Это уже цена новой с гарантией — бери в магазине (~${rub(nw)}).` };
  const r = price / used;
  if (r < 0.6) return { key: "sus", emoji: "🚩", title: "Подозрительно дёшево", note: "Так продают нерабочее, краденое или это развод с предоплатой. Только встреча и проверка на месте, никаких предоплат." };
  if (r < 0.85) return { key: "great", emoji: "🔥", title: "Отличная цена", note: "Ниже рынка. Если проверка ок — забирай, пока не ушла." };
  if (r <= 1.1) return { key: "ok", emoji: "✅", title: "Нормальная цена", note: "В рынке. Можно поторговаться на 5–10%." };
  if (r <= 1.3) return { key: "pricey", emoji: "⚠️", title: "Дороговато", note: `Предложи около ${rub(used)} — это рынок.` };
  return { key: "over", emoji: "❌", title: "Переплата", note: `Рынок около ${rub(used)}. Ищи другие объявления.` };
}
const zoneColor = k => ({ sus: "#F08091", great: "#69D5AD", ok: "#91A8F2", pricey: "#F1BB78", over: "#F08091" }[k]);

function allPriceParts() {
  return [...DB.gpu.map(p => ({ ...p, cat: "gpu" })), ...DB.cpu.map(p => ({ ...p, cat: "cpu" }))];
}
const norm = s => " " + s.toLowerCase().replace(/ё/g, "е").replace(/[^a-z0-9а-я]+/g, " ").trim() + " ";

function searchParts(q) {
  const nq = norm(q).trim();
  if (!nq) return [];
  const words = nq.split(" ");
  return allPriceParts()
    .map(p => {
      const hay = norm(p.name + " " + p.aliases.join(" "));
      const hit = words.every(w => hay.includes(w));
      const exact = p.aliases.some(a => norm(a).trim() === nq);
      return hit ? { p, s: (exact ? 10 : 0) - p.name.length / 100 } : null;
    })
    .filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.p);
}

function renderSuggest(list) {
  const box = $("#suggest");
  if (!list.length) { box.classList.remove("open"); return; }
  box.innerHTML = list.map((p, i) => `<button data-i="${i}">${esc(p.name)}<small>${p.cat === "gpu" ? "видеокарта" : "процессор"}</small></button>`).join("");
  box.classList.add("open");
  $$("button", box).forEach(b => b.onclick = () => pickPart(list[+b.dataset.i]));
}

function pickPart(p) {
  state.part = p; haptic();
  $("#q").value = p.name; $(".search").classList.add("has");
  $("#suggest").classList.remove("open");
  $$("#popular button").forEach(b => b.classList.toggle("on", b.dataset.id === p.id));
  if (!$("#price").value) $("#price").focus();
  renderVerdict();
}

function parsePrice(s) {
  s = String(s).toLowerCase().replace(/\s| /g, "").replace(",", ".");
  const m = s.match(/(\d+(?:\.\d+)?)(к|k|тыс)?/);
  if (!m) return null;
  let v = parseFloat(m[1]); if (m[2]) v *= 1000;
  return v >= 500 ? Math.round(v) : null;
}

function renderVerdict() {
  const out = $("#verdict"), p = state.part;
  if (!p) { paint(out, `<div class="empty">Начни вводить модель — например <b>3070</b> или <b>5600</b></div>`, "empty"); return; }
  const price = parsePrice($("#price").value);
  const used = p.price_used, nw = p.price_new;
  const src = DB.sources || {};
  const rows = `
    <div class="rows">
      <div class="row"><span>Рынок б/у</span><b>~${rub(used)}<em>${esc(src.used || "Авито")}</em></b></div>
      ${nw ? `<div class="row"><span>Новая в магазине</span><b>${rub(nw)}<em>${esc(src.new || "DNS")}</em></b></div>` : `<div class="row"><span>Новая</span><b style="color:var(--muted)">не продаётся</b></div>`}
    </div>`;
  const links = `
    <div class="links">
      <a class="btn" href="https://www.avito.ru/rossiya?q=${encodeURIComponent(p.name)}" target="_blank">Найти на Авито</a>
      <a class="btn" href="${esc(shopLink(p))}" target="_blank">Новая в DNS</a>
    </div>`;
  if (!price) {
    paint(out, `<div class="card"><div class="v-name">${esc(p.name)}</div>
      <div class="v-title">Вбей цену из объявления</div>
      <p class="v-note">Сравню с рынком и скажу, стоит ли брать.</p>${rows}${links}</div>`, p.id + ":wait");
    return;
  }
  const v = verdict(price, used, nw);
  const ratio = Math.min(Math.max(price / used, 0.35), 1.6);
  const pos = ((ratio - 0.35) / (1.6 - 0.35)) * 100;
  let prev = 0.35;
  const bars = ZONES.map(z => { const w = (z.to - prev) / 1.25 * 100; prev = z.to; return `<i style="width:${w}%;background:${z.color};opacity:${z.key === v.key ? 1 : .28}"></i>`; }).join("");
  const tips = [...TIPS[p.cat]];
  if (p.mining_risk) tips.unshift("Спросить про майнинг и проверить температуру памяти (Memory Junction)");
  const c = zoneColor(v.key);
  paint(out, `
    <div class="card">
      <div class="verdict-top">
        <div class="v-name">${esc(p.name)}</div>
        <div class="pill" style="background:${c}22;color:${c}">${v.emoji} ${Math.round(price / used * 100)}% рынка</div>
      </div>
      <div class="v-title" style="color:${c}">${v.title}</div>
      <p class="v-note">${v.note}</p>
      <div class="scale"><div class="scale-bar">${bars}</div><div class="scale-marker" style="left:calc(${pos}% - 2px)"></div>
        <div class="scale-labels"><span>подозрительно</span><span>рынок</span><span>переплата</span></div></div>
      ${rows}
      <div class="checks"><h3>Проверь перед покупкой</h3>
        ${tips.map(t => `<div class="check"><div class="box"></div><span>${esc(t)}</span></div>`).join("")}
      </div>
      ${links}
      <button class="btn primary" style="margin-top:8px" id="v-pro">⭐ Проверить объявление с мастером</button>
    </div>`, p.id + ":v");
  $$(".check", out).forEach(el => el.onclick = () => { el.classList.toggle("done"); haptic("soft"); });
  $("#v-pro").onclick = () => sendToBot({ type: "pro_check", part: p.name, price });
  haptic(v.key === "sus" || v.key === "over" ? "heavy" : "medium");
}

/* Ссылки на магазин. Когда появится партнёрская программа — подставь шаблон в parts.json → affiliate.dns */
function shopLink(p) {
  const url = `https://www.dns-shop.ru/search/?q=${encodeURIComponent(p.name)}`;
  const aff = DB.affiliate?.dns;
  return aff ? aff.replace("{url}", encodeURIComponent(url)) : url;
}

/* ---------- Подбор сборки (порт core/builder.py) ---------- */
function priceOf(part, used) {
  if (used && part.price_used) return part.price_used;
  return part.price_new;
}
function cheapest(items, used = false) {
  let best = null;
  for (const i of items) { const p = priceOf(i, used); if (p && (!best || p < best[1])) best = [i, p]; }
  return best || [null, null];
}
function build(budget, purpose, used) {
  let best = null;
  for (const cpu of DB.cpu) {
    const cp = priceOf(cpu, used); if (!cp) continue;
    for (const gpu of DB.gpu) {
      const gp = priceOf(gpu, used); if (!gp) continue;
      if (purpose === "games" && cpu.score < gpu.score * 0.8) continue;
      for (const ramType of cpu.ram) {
        const minTier = cpu.score >= 70 || cpu.tdp >= 120 ? 2 : 1;
        const [mobo, mp] = cheapest(DB.mobo.filter(m => m.socket === cpu.socket && m.ram === ramType && m.tier >= minTier), used);
        if (!mobo) continue;
        const need = gpu.psu_min + (cpu.tdp >= 120 ? 100 : 0);
        const [psu, pp] = cheapest(DB.psu.filter(p => p.watt >= need));
        if (!psu) continue;
        const cases = DB.case.filter(c => c.airflow === (gpu.score >= 50));
        const [cs, csp] = cheapest(cases.length ? cases : DB.case);
        const cooler = cpu.box_cooler ? null : DB.cooler[0];
        const clp = cooler ? cooler.price_new : 0;
        for (const ram of DB.ram.filter(r => r.type === ramType)) {
          const rp = priceOf(ram, used);
          for (const ssd of DB.ssd) {
            const total = cp + gp + mp + rp + pp + ssd.price_new + csp + clp;
            if (total > budget) continue;
            let score = purpose === "games"
              ? gpu.score * 0.75 + cpu.score * 0.25 + (ram.size >= 32 ? 3 : 0)
              : cpu.mt * 0.6 + gpu.score * 0.25 + (ram.size >= 32 ? 12 : 0);
            score += ssd.size >= 1000 ? 2 : 0;
            if (!best || score > best.score || (score === best.score && total < best.total)) {
              const u = x => used && !!x.price_used;
              best = {
                score, total, budget, purpose, used, gpu, cpu,
                items: [
                  ["cpu", "Процессор", cpu.name, cp, u(cpu)],
                  ["gpu", "Видеокарта", gpu.name, gp, u(gpu)],
                  ["mobo", "Материнская плата", mobo.name, mp, u(mobo)],
                  ["ram", "Память", ram.name, rp, u(ram)],
                  ["ssd", "Накопитель", ssd.name, ssd.price_new, false],
                  ["psu", "Блок питания", psu.name, pp, false],
                  ["case", "Корпус", cs.name, csp, false],
                  ...(cooler ? [["cooler", "Кулер", cooler.name, clp, false]] : []),
                ],
              };
            }
          }
        }
      }
    }
  }
  return best;
}
const ICONS = { cpu: "🧠", gpu: "🎮", mobo: "🔌", ram: "📏", ssd: "💾", psu: "⚡", case: "🗄", cooler: "🌀" };
function perfLabel(b) {
  const s = b.gpu.score;
  if (b.purpose === "work") {
    const m = b.cpu.mt;
    return m >= 70 ? "Тяжёлый монтаж 4K, 3D" : m >= 50 ? "Монтаж 1080p–4K, стримы" : m >= 35 ? "Монтаж 1080p, офис" : "Офис и учёба";
  }
  return s >= 90 ? "4K на высоких" : s >= 70 ? "1440p ультра, 4K средние" : s >= 50 ? "1440p на высоких" : s >= 35 ? "1080p ультра" : s >= 20 ? "1080p высокие" : "1080p средние";
}
function meter(pct) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - pct);
  return `<svg class="meter" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/>
    <circle class="arc" cx="32" cy="32" r="${r}" fill="none" stroke="#B8A6F5" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 32 32)"/>
    <text x="32" y="37" text-anchor="middle" fill="#F3F1FA" font-family="Manrope" font-weight="700" font-size="16">${Math.round(pct * 100)}</text></svg>`;
}

function renderBuild() {
  const range = $("#budget"), budget = +range.value;
  range.style.setProperty("--fill", ((budget - range.min) / (range.max - range.min) * 100) + "%");
  $("#budget-num").textContent = budget.toLocaleString("ru-RU").replace(/,/g, " ");
  $$("#budget-chips button").forEach(b => b.classList.toggle("on", +b.dataset.v === budget));
  const b = build(budget, state.purpose, state.mode === "used");
  state.build = b;
  const out = $("#build-out");
  if (!b) {
    paint(out, `<div class="empty">На ${rub(budget)} нормальную сборку не собрать.<br>Подвинь бюджет вправо${state.mode === "new" ? " или включи «С б/у»" : ""}.</div>`, "empty");
    return;
  }
  const pct = Math.min(1, (state.purpose === "games" ? b.gpu.score : b.cpu.mt) / 100);
  const left = b.budget - b.total;
  paint(out, `
    <div class="card">
      <div class="perf"><div><div class="perf-label">Потянет</div><div class="perf-val">${perfLabel(b)}</div></div>${meter(pct)}</div>
      <div class="parts">
        ${b.items.map(([k, role, name, price, u]) => `
          <div class="part"><div class="ic">${ICONS[k]}</div>
            <div class="nm"><small>${role}${u ? '<span class="tag">Б/У</span>' : ""}</small><div>${esc(name)}</div></div>
            <div class="pr">${rub(price)}</div></div>`).join("")}
      </div>
      <div class="total"><span>Итого</span><b>${rub(b.total)}</b></div>
      ${left >= 3000 ? `<p class="note">Остаётся ${rub(left)} — ${left >= 25000 ? "это потолок по мощности, остаток лучше пустить на монитор или SSD на 2 ТБ" : "можно взять SSD побольше или кулер потише"}.</p>` : ""}
      ${b.used ? `<p class="note">⚠️ Б/у детали проверяй перед покупкой — оценивай объявления во вкладке «Оценка».</p>` : ""}
      <button class="btn primary" style="margin-top:14px" id="b-order">🔧 Собрать мне это под ключ</button>
    </div>
    <p class="hint">Цены ориентировочные: новое — ${esc(DB.sources?.new || "DNS")}, б/у — ${esc(DB.sources?.used || "Авито")}</p>`, "b:" + state.purpose + state.mode);
  $("#b-order").onclick = () => { haptic("medium"); showScreen("s-order"); };
}

function buildSummary(b) {
  return `${b.purpose === "games" ? "Игры" : "Работа"}, ${b.used ? "с б/у" : "новое"}, ${rub(b.total)}\n` +
    b.items.map(([, role, name, price, u]) => `• ${role}: ${name}${u ? " (б/у)" : ""} — ${rub(price)}`).join("\n");
}

/* ---------- Заказ ---------- */
function renderOrder() {
  const b = state.build;
  $("#order-build").innerHTML = b ? `<div class="attached"><b>Прикреплена сборка:</b> ${esc(b.cpu.name)} + ${esc(b.gpu.name)}, ${rub(b.total)}</div>` : "";
}

function sendToBot(payload) {
  const data = JSON.stringify(payload);
  if (tg && tg.initData !== undefined && tg.sendData) {
    try { tg.sendData(data); return; } catch (e) { /* открыто не через кнопку клавиатуры */ }
  }
  toast("Открой приложение кнопкой в чате с ботом, чтобы отправить");
}

function toast(text) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- Навигация ---------- */
function showScreen(id) {
  $$(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  $$(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.s === id));
  if (id === "s-build") renderBuild();
  if (id === "s-order") renderOrder();
  window.scrollTo(0, 0);
}

async function init() {
  DB = await fetch("parts.json?v=" + Date.now()).then(r => r.json());
  $("#updated").textContent = `цены обновлены ${DB.updated || ""}`;

  // Оценка
  const popular = ["rtx3060", "rtx3070", "rtx4060", "rx6600", "r5-5600", "i5-12400f"];
  $("#popular").innerHTML = popular.map(id => allPriceParts().find(p => p.id === id)).filter(Boolean)
    .map(p => `<button data-id="${p.id}">${esc(p.name.replace(/^(NVIDIA|AMD Radeon|AMD|Intel Core) /, ""))}</button>`).join("");
  $$("#popular button").forEach(b => b.onclick = () => pickPart(allPriceParts().find(p => p.id === b.dataset.id)));
  $("#q").addEventListener("input", e => {
    $(".search").classList.toggle("has", !!e.target.value);
    state.part = null; renderVerdict(); renderSuggest(searchParts(e.target.value));
  });
  $("#q-clear").onclick = () => { $("#q").value = ""; $(".search").classList.remove("has"); state.part = null; $("#suggest").classList.remove("open"); renderVerdict(); $("#q").focus(); };
  document.addEventListener("click", e => { if (!e.target.closest(".field")) $("#suggest").classList.remove("open"); });
  $("#price").addEventListener("input", e => {
    const digits = e.target.value.replace(/[^\d]/g, "");
    e.target.value = digits ? (+digits).toLocaleString("ru-RU").replace(/,/g, " ") : "";
    renderVerdict();
  });
  renderVerdict();

  // Сборка
  $("#budget-chips").innerHTML = [50000, 80000, 100000, 150000, 200000].map(v => `<button data-v="${v}">${v / 1000}к</button>`).join("");
  $$("#budget-chips button").forEach(b => b.onclick = () => { $("#budget").value = b.dataset.v; haptic(); renderBuild(); });
  $("#budget").addEventListener("input", () => { renderBuild(); });
  $("#budget").addEventListener("change", () => haptic("soft"));
  $$(".seg").forEach(seg => $$("button", seg).forEach(btn => btn.onclick = () => {
    $$("button", seg).forEach(x => x.classList.toggle("on", x === btn));
    seg.classList.toggle("right", btn === $$("button", seg)[1]);
    state[seg.dataset.name] = btn.dataset.v; haptic(); renderBuild();
  }));

  // Заказ
  $("#o-send").onclick = () => {
    const city = $("#o-city").value.trim(), text = $("#o-text").value.trim();
    if (!text && !state.build) { toast("Опиши, что нужно, или собери ПК во вкладке «Сборка»"); return; }
    haptic("heavy");
    sendToBot({ type: "order", city, text, build: state.build ? buildSummary(state.build) : "" });
  };

  $$(".tabs button").forEach(b => b.onclick = () => { haptic(); showScreen(b.dataset.s); });
  const start = new URLSearchParams(location.search).get("tab");
  if (start) showScreen("s-" + start);
}
init();
