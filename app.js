const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { leads: [], apiUrl: localStorage.getItem("prospectos_api_url") || window.APP_CONFIG?.API_URL || "" };
const fmtDay = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });
const localISO = (date = new Date()) => { const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); };
const parseDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? new Date() : d; };
const daysSince = value => Math.max(0, Math.floor((new Date(`${localISO()}T12:00:00`) - new Date(`${String(value).slice(0,10)}T12:00:00`)) / 86400000));

function statusOf(lead) {
  if (lead.nextContact && String(lead.nextContact).slice(0, 10) === localISO()) return { key: "today", label: "Contacto hoy" };
  const days = daysSince(lead.lastContact || lead.contactDate || lead.createdAt);
  if (days <= 2) return { key: "ontime", label: "ON time" };
  if (days === 3) return { key: "late", label: "3 días" };
  return { key: "urgent", label: `${days} días` };
}

function api(action = "list", payload = {}) {
  if (!state.apiUrl) return Promise.reject(new Error("Primero conecta tu Google Sheet desde el engrane."));
  return new Promise((resolve, reject) => {
    const callback = `prospectosCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => finish(new Error("Google Sheets tardó demasiado en responder.")), 15000);
    const finish = (error, data) => {
      clearTimeout(timer); delete window[callback]; script.remove();
      if (error) reject(error); else if (!data?.ok) reject(new Error(data?.error || "Ocurrió un error en Google Sheets.")); else resolve(data);
    };
    window[callback] = data => finish(null, data);
    script.onerror = () => finish(new Error("No fue posible leer Google Sheets. Revisa la implementación de Apps Script."));
    const separator = state.apiUrl.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ action, callback, data: JSON.stringify(payload), _: Date.now() });
    script.src = `${state.apiUrl}${separator}${params.toString()}`;
    document.head.appendChild(script);
  });
}

async function loadLeads() {
  if (!state.apiUrl) { state.leads = []; render(); openSettings(); return; }
  $("#leadList").innerHTML = '<div class="loading">Sincronizando con Google Sheets…</div>';
  try { state.leads = (await api("list")).leads || []; render(); }
  catch (error) { showToast(error.message, true); $("#leadList").innerHTML = `<div class="empty"><strong>No se pudo sincronizar</strong>Revisa la URL de conexión e inténtalo de nuevo.</div>`; }
}

function render() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const filter = $("#statusFilter").value;
  const counts = { ontime: 0, today: 0, late: 0, urgent: 0 };
  state.leads.forEach(l => counts[statusOf(l).key]++);
  $("#statOnTime").textContent = counts.ontime; $("#statToday").textContent = counts.today; $("#statLate").textContent = counts.late; $("#statUrgent").textContent = counts.urgent;
  $("#pendingBadge").textContent = counts.late + counts.urgent + counts.today;
  const list = state.leads.filter(l => {
    const status = statusOf(l).key;
    const hay = `${l.name} ${l.phone} ${l.email}`.toLowerCase();
    return (!query || hay.includes(query)) && (filter === "all" || status === filter);
  }).sort((a,b) => ({urgent:0,late:1,today:2,ontime:3}[statusOf(a).key] - {urgent:0,late:1,today:2,ontime:3}[statusOf(b).key]));
  $("#leadList").innerHTML = list.length ? list.map(leadCard).join("") : '<div class="empty"><strong>No hay prospectos aquí</strong>Registra uno nuevo o cambia los filtros.</div>';
}

function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function leadCard(l) {
  const s = statusOf(l); const last = parseDate(l.lastContact || l.contactDate || l.createdAt);
  return `<article class="lead-card"><span class="status-bar ${s.key}"></span><div class="lead-main"><strong>${escapeHtml(l.name)}</strong><small>${escapeHtml(l.phone)} · ${escapeHtml(l.email)}</small><span class="program-pill">${escapeHtml(l.program)}</span></div><div class="lead-data"><small>ÚLTIMO CONTACTO</small><strong>${fmtShort.format(last)}</strong></div><div class="lead-data"><small>ESTATUS</small><span class="status-pill ${s.key}">${s.label}</span></div><div class="lead-actions"><button class="contact-btn" data-touch="${l.id}">✓ Contacté hoy</button><button class="delete-btn" data-delete="${l.id}" aria-label="Eliminar prospecto" title="Eliminar">×</button></div></article>`;
}

function showToast(message, error=false) { const t=$("#toast"); t.textContent=message; t.className=`toast show${error?" error":""}`; clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.className="toast",3500); }
function openSettings(){ $("#apiUrlInput").value=state.apiUrl; $("#connectionStatus").textContent=state.apiUrl?"Conexión guardada en este navegador.":"Aún no hay una URL configurada."; $("#settingsDialog").showModal(); }

$$('.tab').forEach(btn => btn.addEventListener('click', () => { $$('.tab').forEach(x=>x.classList.toggle('active',x===btn)); $$('.view').forEach(v=>v.classList.remove('active')); $(`#${btn.dataset.view}View`).classList.add('active'); if(btn.dataset.view==='followups') loadLeads(); }));
$("#leadForm").addEventListener("submit", async e => { e.preventDefault(); const button=e.submitter; button.disabled=true; const form=Object.fromEntries(new FormData(e.currentTarget)); form.id=crypto.randomUUID(); try { await api("create", { lead: form }); e.currentTarget.reset(); e.currentTarget.program.value="Presencial"; $("#contactDate").value=localISO(); showToast("Prospecto registrado correctamente."); await loadLeads(); $$('.tab')[1].click(); } catch(error){ showToast(error.message,true); if(!state.apiUrl) openSettings(); } finally { button.disabled=false; } });
$("#leadList").addEventListener("click", async e => { const touch=e.target.closest("[data-touch]"); const del=e.target.closest("[data-delete]"); if(touch){ touch.disabled=true; try{ await api("touch",{id:touch.dataset.touch}); await loadLeads(); showToast("Contacto actualizado a hoy."); }catch(error){showToast(error.message,true)}finally{touch.disabled=false} } if(del && confirm("¿Eliminar este prospecto definitivamente?")){ try{await api("delete",{id:del.dataset.delete});await loadLeads();showToast("Prospecto eliminado.")}catch(error){showToast(error.message,true)} } });
$("#refreshBtn").addEventListener("click",loadLeads); $("#searchInput").addEventListener("input",render); $("#statusFilter").addEventListener("change",render); $("#settingsBtn").addEventListener("click",openSettings);
$("#settingsForm").addEventListener("submit", async e => { e.preventDefault(); const url=$("#apiUrlInput").value.trim(); if(!/^https:\/\/script\.google\.com\//.test(url)){ $("#connectionStatus").textContent="Pega una URL válida de script.google.com."; return; } state.apiUrl=url; localStorage.setItem("prospectos_api_url",url); $("#settingsDialog").close(); showToast("Google Sheets conectado."); await loadLeads(); });

$("#contactDate").value=localISO(); $("#todayLabel").textContent=fmtDay.format(new Date()); setInterval(()=>{$("#contactDate").value ||= localISO();$("#todayLabel").textContent=fmtDay.format(new Date())},60000); loadLeads();
