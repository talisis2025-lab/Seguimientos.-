const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { leads: [], apiUrl: localStorage.getItem("prospectos_api_url") || window.APP_CONFIG?.API_URL || "" };
const fmtDay = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });
const localISO = (date = new Date()) => { const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); };
const parseDate = value => { const text=String(value||""); const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text); return Number.isNaN(d.getTime()) ? new Date() : d; };
const daysSince = value => {
  const start = new Date(`${String(value).slice(0,10)}T12:00:00`);
  const end = new Date(`${localISO()}T12:00:00`);
  if (Number.isNaN(start.getTime()) || start >= end) return 0;
  let days = 0;
  for (const cursor = new Date(start.getTime() + 86400000); cursor <= end; cursor.setDate(cursor.getDate() + 1)) if (cursor.getDay() !== 0) days++;
  return days;
};
const timeValueOf = value => { const match=String(value||"").match(/(?:T|^)(\d{2}):(\d{2})/); return match?`${match[1]}:${match[2]}`:""; };
const formatTime = value => { const time=timeValueOf(value); if (!time) return "Hora por definir"; const [hour,minute]=time.split(":").map(Number); return new Intl.DateTimeFormat("es-MX",{hour:"numeric",minute:"2-digit"}).format(new Date(2000,0,1,hour,minute)); };
const scheduleOf = lead => lead.nextContact ? `${fmtShort.format(parseDate(lead.nextContact))}${lead.nextContactTime?` · ${formatTime(lead.nextContactTime)}`:""}${lead.contactMethod?` · ${lead.contactMethod}`:""}` : "Sin programar";

function statusOf(lead) {
  const nextContact=String(lead.nextContact||"").slice(0,10); const today=localISO();
  if (nextContact === today) return { key: "today", label: "Contacto hoy" };
  if (nextContact && nextContact < today) { const overdue=daysSince(nextContact); return { key: "urgent", label: overdue===1?"Cita vencida · 1 día":`Cita vencida · ${overdue} días` }; }
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
    const hay = `${l.name} ${l.phone} ${l.email} ${l.program} ${l.contactMethod} ${l.nextContact}`.toLowerCase();
    return (!query || hay.includes(query)) && (filter === "all" || status === filter);
  }).sort((a,b) => ({urgent:0,late:1,today:2,ontime:3}[statusOf(a).key] - {urgent:0,late:1,today:2,ontime:3}[statusOf(b).key]));
  $("#leadList").innerHTML = list.length ? list.map(leadCard).join("") : '<div class="empty"><strong>No hay prospectos aquí</strong>Registra uno nuevo o cambia los filtros.</div>';
}

function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function leadCard(l) {
  const s = statusOf(l); const last = parseDate(l.lastContact || l.contactDate || l.createdAt);
  return `<article class="lead-card"><span class="status-bar ${s.key}"></span><div class="lead-main"><strong>${escapeHtml(l.name)}</strong><small>${escapeHtml(l.phone)} · ${escapeHtml(l.email)}</small><span class="program-pill">${escapeHtml(l.program)}</span></div><div class="lead-data"><small>ÚLTIMO CONTACTO</small><strong>${fmtShort.format(last)}</strong></div><div class="lead-data"><small>ESTATUS · PRÓXIMO CONTACTO</small><span class="status-pill ${s.key}">${escapeHtml(s.label)}</span><span class="schedule-detail">${escapeHtml(scheduleOf(l))}</span></div><div class="lead-actions"><button class="contact-btn" data-touch="${l.id}">✓ Contacté hoy</button><button class="edit-btn" data-edit="${l.id}" aria-label="Editar prospecto" title="Editar">✎</button><button class="delete-btn" data-delete="${l.id}" aria-label="Eliminar prospecto" title="Eliminar">×</button></div></article>`;
}

function showToast(message, error=false) { const t=$("#toast"); t.textContent=message; t.className=`toast show${error?" error":""}`; clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.className="toast",3500); }
function openSettings(){ $("#apiUrlInput").value=state.apiUrl; $("#connectionStatus").textContent=state.apiUrl?"Conexión guardada en este navegador.":"Aún no hay una URL configurada."; $("#settingsDialog").showModal(); }
function openEdit(lead){ const form=$("#editForm"); form.elements.id.value=lead.id||""; form.elements.program.value=lead.program||"Presencial"; form.elements.contactDate.value=String(lead.contactDate||lead.lastContact||"").slice(0,10); form.elements.lastContact.value=String(lead.lastContact||lead.contactDate||"").slice(0,10); form.elements.name.value=lead.name||""; form.elements.phone.value=lead.phone||""; form.elements.email.value=lead.email||""; form.elements.nextContact.value=String(lead.nextContact||"").slice(0,10); form.elements.nextContactTime.value=timeValueOf(lead.nextContactTime); form.elements.contactMethod.value=lead.contactMethod||""; syncEditScheduleFields(); $("#editDialog").showModal(); }

$$('.tab').forEach(btn => btn.addEventListener('click', () => { $$('.tab').forEach(x=>x.classList.toggle('active',x===btn)); $$('.view').forEach(v=>v.classList.remove('active')); $(`#${btn.dataset.view}View`).classList.add('active'); if(btn.dataset.view==='followups') loadLeads(); }));
$("#leadForm").addEventListener("submit", async e => { e.preventDefault(); const button=e.submitter; button.disabled=true; const formElement=$("#leadForm"); const form=Object.fromEntries(new FormData(formElement)); form.id=crypto.randomUUID(); try { await api("create", { lead: form }); formElement.reset(); formElement.querySelector('[name="program"][value="Presencial"]').checked=true; $("#contactDate").value=localISO(); syncScheduleFields(); showToast("Prospecto registrado correctamente."); await loadLeads(); $$('.tab')[1].click(); } catch(error){ showToast(error.message,true); if(!state.apiUrl) openSettings(); } finally { button.disabled=false; } });
$("#leadList").addEventListener("click", async e => { const touch=e.target.closest("[data-touch]"); const edit=e.target.closest("[data-edit]"); const del=e.target.closest("[data-delete]"); if(edit){ const lead=state.leads.find(item=>String(item.id)===String(edit.dataset.edit)); if(lead) openEdit(lead); return; } if(touch){ touch.disabled=true; try{ await api("touch",{id:touch.dataset.touch}); await loadLeads(); showToast("Contacto actualizado a hoy."); }catch(error){showToast(error.message,true)}finally{touch.disabled=false} } if(del && confirm("¿Eliminar este prospecto definitivamente?")){ try{await api("delete",{id:del.dataset.delete});await loadLeads();showToast("Prospecto eliminado.")}catch(error){showToast(error.message,true)} } });
$("#refreshBtn").addEventListener("click",loadLeads); $("#searchInput").addEventListener("input",render); $("#statusFilter").addEventListener("change",render); $("#settingsBtn").addEventListener("click",openSettings);
$("#settingsForm").addEventListener("submit", async e => { e.preventDefault(); const url=$("#apiUrlInput").value.trim(); if(!/^https:\/\/script\.google\.com\//.test(url)){ $("#connectionStatus").textContent="Pega una URL válida de script.google.com."; return; } state.apiUrl=url; localStorage.setItem("prospectos_api_url",url); $("#settingsDialog").close(); showToast("Google Sheets conectado."); await loadLeads(); });

function syncScheduleFields(){ const date=$("#nextContact").value; const isSunday=date && new Date(`${date}T12:00:00`).getDay()===0; $("#nextContact").setCustomValidity(isSunday?"El domingo no cuenta como día de seguimiento. Selecciona otra fecha.":""); const enabled=Boolean(date)&&!isSunday; $("#nextContactTime").disabled=!enabled; $("#contactMethod").disabled=!enabled; if(!date){$("#nextContactTime").value="";$("#contactMethod").value="";} }
function syncEditScheduleFields(){ const date=$("#editNextContact").value; const isSunday=date && new Date(`${date}T12:00:00`).getDay()===0; $("#editNextContact").setCustomValidity(isSunday?"El domingo no cuenta como día de seguimiento. Selecciona otra fecha.":""); const enabled=Boolean(date)&&!isSunday; $("#editNextContactTime").disabled=!enabled; $("#editContactMethod").disabled=!enabled; if(!date){$("#editNextContactTime").value="";$("#editContactMethod").value="";} }
$("#nextContact").addEventListener("change",syncScheduleFields);
$("#editNextContact").addEventListener("change",syncEditScheduleFields);
$("#editClose").addEventListener("click",()=>$("#editDialog").close()); $("#editCancel").addEventListener("click",()=>$("#editDialog").close());
$("#editForm").addEventListener("submit",async e=>{ e.preventDefault(); const button=e.submitter; button.disabled=true; const lead=Object.fromEntries(new FormData(e.currentTarget)); try{ await api("update",{lead}); $("#editDialog").close(); await loadLeads(); showToast("Cambios guardados correctamente."); }catch(error){showToast(error.message,true)}finally{button.disabled=false} });
$("#contactDate").value=localISO(); $("#todayLabel").textContent=fmtDay.format(new Date()); syncScheduleFields(); setInterval(()=>{$("#contactDate").value ||= localISO();$("#todayLabel").textContent=fmtDay.format(new Date())},60000); loadLeads();
