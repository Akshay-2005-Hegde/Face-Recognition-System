// frontend/app.js
const API_BASE = "";

let webcamStream = null;
let enrollStream = null;
let bulkGroups = {};

// ---------------------------------------------------------------- nav ----
const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll(".nav-item");

navItems.forEach(btn => {
  btn.addEventListener("click", () => {
    stopAllStreams();
    
    document.querySelectorAll("#view-identify .identify-source-tabs .tab[data-source='upload']").forEach(t => t.click());
    document.querySelectorAll(".tab-ui[data-source='upload']").forEach(t => t.click());

    navItems.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.view;
    views.forEach(v => v.classList.toggle("hidden", v.id !== `view-${target}`));
    
    if (target === "dashboard") loadDashboard();
    if (target === "people") loadPeople();
    if (target === "evaluation") loadEvaluation();
  });
});

// ------------------------------------------------------------- privacy --
document.getElementById("privacy-link").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("privacy-modal").classList.remove("hidden");
});
document.getElementById("privacy-close").addEventListener("click", () => {
  document.getElementById("privacy-modal").classList.add("hidden");
});

// -------------------------------------------------------------- toast ---
function toast(message, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = message;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail?.message || body.detail || JSON.stringify(body);
    } catch (_) {}
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json();
}

function stopAllStreams() {
  if (webcamStream) { webcamStream.getTracks().forEach(t => t.stop()); webcamStream = null; }
  if (enrollStream) { enrollStream.getTracks().forEach(t => t.stop()); enrollStream = null; }
}

// ---------------------------------------------------------- dashboard ---
async function loadDashboard() {
  try {
    const d = await apiFetch("/dashboard");
    document.querySelectorAll("[data-stat]").forEach(el => {
      const key = el.dataset.stat;
      el.textContent = key === "match_threshold" ? Number(d[key]).toFixed(3) : d[key];
    });
  } catch (e) {
    toast("Could not load dashboard: " + e.message, true);
  }
}

// -------------------------------------------------------------- enroll --
let enrollFiles = [];
const enrollDropzone = document.getElementById("enroll-dropzone");
const enrollFileInput = document.getElementById("enroll-files");
const enrollPreview = document.getElementById("enroll-preview");
const enrollSubmit = document.getElementById("enroll-submit");
const enrollName = document.getElementById("enroll-name");

const enrollUiTabs = document.querySelectorAll(".tab-ui");
const enrollLogicTabs = document.querySelectorAll("#view-enroll .identify-source-tabs .tab");

const enrollManualWrap = document.getElementById("enroll-manual-wrapper");
const enrollBulkWrap = document.getElementById("enroll-bulk-wrapper");
const enrollUploadPanel = document.getElementById("enroll-upload-panel");
const enrollCameraPanel = document.getElementById("enroll-camera-panel");
const enrollResults = document.getElementById("enroll-results");

enrollUiTabs.forEach(uiTab => {
  uiTab.addEventListener("click", () => {
    enrollUiTabs.forEach(t => t.classList.remove("active"));
    uiTab.classList.add("active");
    document.querySelector(`#view-enroll .identify-source-tabs .tab[data-source='${uiTab.dataset.source}']`).click();
  });
});

enrollLogicTabs.forEach(tab => {
  tab.addEventListener("click", async () => {
    enrollLogicTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.source;
    
    // Clear previous enrollment data
    enrollFiles = [];
    renderEnrollPreview();
    enrollName.value = "";
    enrollResults.classList.add("hidden");
    document.getElementById("enroll-results-body").innerHTML = "";
    updateEnrollButton();
    
    if (mode === "bulk") {
        enrollManualWrap.classList.add("hidden");
        enrollBulkWrap.classList.remove("hidden");
        if (enrollStream) {
          enrollStream.getTracks().forEach(t => t.stop());
          enrollStream = null;
        }
    } else {
        enrollManualWrap.classList.remove("hidden");
        enrollBulkWrap.classList.add("hidden");
        
        const isCamera = mode === "camera";
        enrollUploadPanel.classList.toggle("hidden", isCamera);
        enrollCameraPanel.classList.toggle("hidden", !isCamera);
        
        if (isCamera) {
          try {
            enrollStream = await navigator.mediaDevices.getUserMedia({ video: true });
            document.getElementById("enroll-webcam-video").srcObject = enrollStream;
          } catch (e) {
            toast("Could not access webcam: " + e.message, true);
          }
        } else if (enrollStream) {
          enrollStream.getTracks().forEach(t => t.stop());
          enrollStream = null;
        }
    }
  });
});

document.getElementById("enroll-webcam-capture").addEventListener("click", () => {
  const video = document.getElementById("enroll-webcam-video");
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  
  c.toBlob(blob => {
    if (enrollFiles.length >= 10) { toast("Maximum 10 images per enrollment.", true); return; }
    const f = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
    enrollFiles.push(f);
    renderEnrollPreview();
    updateEnrollButton();
  }, "image/jpeg", 0.92);
});

document.getElementById("enroll-browse").addEventListener("click", () => enrollFileInput.click());
enrollFileInput.addEventListener("change", e => addEnrollFiles(e.target.files));

["dragover", "dragenter"].forEach(evt =>
  enrollDropzone.addEventListener(evt, e => { e.preventDefault(); enrollDropzone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach(evt =>
  enrollDropzone.addEventListener(evt, e => { e.preventDefault(); enrollDropzone.classList.remove("dragover"); })
);
enrollDropzone.addEventListener("drop", e => addEnrollFiles(e.dataTransfer.files));

function addEnrollFiles(fileList) {
  for (const f of fileList) {
    if (!f.type.startsWith("image/")) continue;
    if (enrollFiles.length >= 10) { toast("Maximum 10 images per enrollment.", true); break; }
    enrollFiles.push(f);
  }
  renderEnrollPreview();
  updateEnrollButton();
}

function renderEnrollPreview() {
  enrollPreview.innerHTML = "";
  enrollFiles.forEach((f, idx) => {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(f);
    const rm = document.createElement("button");
    rm.className = "remove";
    rm.textContent = "×";
    rm.onclick = () => { enrollFiles.splice(idx, 1); renderEnrollPreview(); updateEnrollButton(); };
    div.appendChild(img);
    div.appendChild(rm);
    enrollPreview.appendChild(div);
  });
}

function updateEnrollButton() {
  enrollSubmit.disabled = !(enrollName.value.trim() && enrollFiles.length > 0);
}
enrollName.addEventListener("input", updateEnrollButton);

enrollSubmit.addEventListener("click", async () => {
  const form = new FormData();
  form.append("name", enrollName.value.trim());
  enrollFiles.forEach(f => form.append("files", f));

  enrollSubmit.disabled = true;
  enrollSubmit.innerHTML = '<span class="spinner"></span> Processing...';

  try {
    const res = await fetch(API_BASE + "/enroll", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) {
      renderEnrollResults(body.detail?.per_image_results || [], null);
      toast(body.detail?.message || body.detail || "Enrollment failed.", true);
    } else {
      renderEnrollResults(body.per_image_results, body);
      toast(`Enrolled "${body.name}" successfully`);
      enrollFiles = [];
      enrollName.value = "";
      renderEnrollPreview();
    }
  } catch (e) {
    toast("Error: " + e.message, true);
  } finally {
    enrollSubmit.innerHTML = "Commit Identity to Database";
    updateEnrollButton();
  }
});

function renderEnrollResults(perImage, summary) {
  const panel = document.getElementById("enroll-results");
  const body = document.getElementById("enroll-results-body");
  panel.classList.remove("hidden");
  body.innerHTML = "";
  if (summary) {
    const h = document.createElement("p");
    h.className = "text-sm text-muted mb-sm";
    h.innerHTML = `<strong>${summary.accepted_samples}</strong> accepted, <strong>${summary.rejected_samples}</strong> rejected.`;
    body.appendChild(h);
  }
  perImage.forEach(r => {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span class="font-mono text-sm">${r.filename}</span>
      <span class="badge ${r.accepted ? "ok" : "bad"}">${r.accepted ? "accepted" : r.reason}</span>`;
    body.appendChild(row);
  });
}

// Bulk Enrollment Logic
document.getElementById("enroll-bulk-browse").addEventListener("click", () => document.getElementById("enroll-bulk-dir").click());
document.getElementById("enroll-bulk-dir").addEventListener("change", e => {
  bulkGroups = {};
  const files = e.target.files;
  let imgCount = 0;
  for(let f of files) {
     if(!f.type.startsWith("image/")) continue;
     const pathParts = f.webkitRelativePath.split('/');
     if(pathParts.length >= 2) {
        const personName = pathParts[pathParts.length - 2].replace(/_/g, " ");
        if(!bulkGroups[personName]) bulkGroups[personName] = [];
        if(bulkGroups[personName].length < 10) { 
           bulkGroups[personName].push(f);
           imgCount++;
        }
     }
  }
  const names = Object.keys(bulkGroups);
  if(names.length === 0) return toast("No valid image folders found in the selected directory.", true);
  
  document.getElementById("bulk-summary").classList.remove("hidden");
  document.getElementById("bulk-summary-text").innerHTML = `Found <strong>${names.length}</strong> structured identities and <strong>${imgCount}</strong> total signals ready for bulk processing.`;
  document.getElementById("bulk-log").innerHTML = "";
  document.getElementById("bulk-progress-fill").style.width = "0%";
});

document.getElementById("bulk-enroll-start").addEventListener("click", async () => {
   const btn = document.getElementById("bulk-enroll-start");
   btn.disabled = true;
   const names = Object.keys(bulkGroups);
   let success = 0;
   
   for(let i=0; i<names.length; i++) {
      const name = names[i];
      const files = bulkGroups[name];
      
      document.getElementById("bulk-progress-fill").style.width = `${((i)/names.length)*100}%`;
      
      const form = new FormData();
      form.append("name", name);
      files.forEach(f => form.append("files", f));
      
      try {
         const res = await fetch(API_BASE + "/enroll", { method: "POST", body: form });
         const data = await res.json();
         if(res.ok) {
            logBulk(`[SUCCESS] Registered ${name} (${data.accepted_samples} vectors)`);
            success++;
         } else {
            let msg = data.detail?.message || data.detail || 'Quality checks failed.';
            logBulk(`[REJECTED] ${name}: ${msg}`);
         }
      } catch(e) {
         logBulk(`[ERROR] ${name}: Network exception`);
      }
   }
   document.getElementById("bulk-progress-fill").style.width = `100%`;
   btn.disabled = false;
   toast(`Pipeline complete. Successfully processed ${success}/${names.length} identities.`);
   loadDashboard();
   loadPeople();
});

function logBulk(msg) {
   const log = document.getElementById("bulk-log");
   const p = document.createElement("div");
   p.style.marginBottom = "4px";
   if (msg.includes("[REJECTED]") || msg.includes("[ERROR]")) p.classList.add("text-red");
   else p.classList.add("text-green");
   p.textContent = msg;
   log.appendChild(p);
   log.scrollTop = log.scrollHeight;
}

// ------------------------------------------------------------ identify --
const identifyTabs = document.querySelectorAll("#view-identify .identify-source-tabs .tab");
const uploadPanel = document.getElementById("identify-upload-panel");
const cameraPanel = document.getElementById("identify-camera-panel");
const identifyDropzone = document.getElementById("identify-dropzone");
const identifyFileInput = document.getElementById("identify-file");
const identifyBrowseBtn = document.getElementById("identify-browse");

if (identifyDropzone) {
  identifyDropzone.addEventListener("click", (e) => {
    if (e.target.id === "identify-file") return;
    identifyFileInput.click();
  });
}

if (identifyBrowseBtn) {
  identifyBrowseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    identifyFileInput.click();
  });
}

if (identifyFileInput) {
  identifyFileInput.addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) {
      runIdentify(e.target.files[0]);
      e.target.value = "";
    }
  });
}

["dragover", "dragenter"].forEach(evt =>
  identifyDropzone.addEventListener(evt, e => { e.preventDefault(); identifyDropzone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach(evt =>
  identifyDropzone.addEventListener(evt, e => { e.preventDefault(); identifyDropzone.classList.remove("dragover"); })
);
identifyDropzone.addEventListener("drop", e => {
  e.preventDefault();
  identifyDropzone.classList.remove("dragover");
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith("image/")) runIdentify(f);
});

identifyTabs.forEach(tab => {
  tab.addEventListener("click", async () => {
    identifyTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const isCamera = tab.dataset.source === "camera";
    uploadPanel.classList.toggle("hidden", isCamera);
    cameraPanel.classList.toggle("hidden", !isCamera);
    document.getElementById("identify-canvas-wrap").classList.add("hidden");
    
    const resEl = document.getElementById("identify-results");
    resEl.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-sm opacity-50"><path d="M14.5 4h5v5m-5 11h5v-5M4 9V4h5M4 15v5h5"/><circle cx="12" cy="12" r="3"/></svg>
      <h4>Awaiting an input signal</h4>
      <p>Your decision output will appear here.</p>`;
    resEl.classList.add("empty-state");
    
    if (isCamera) {
      try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById("webcam-video").srcObject = webcamStream;
      } catch (e) {
        toast("Could not access webcam: " + e.message, true);
      }
    } else if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      webcamStream = null;
    }
  });
});

document.getElementById("webcam-capture").addEventListener("click", () => {
  const video = document.getElementById("webcam-video");
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  c.toBlob(blob => runIdentify(blob), "image/jpeg", 0.92);
});

document.getElementById("identify-reset").addEventListener("click", () => {
  document.getElementById("identify-canvas-wrap").classList.add("hidden");
  const resEl = document.getElementById("identify-results");
  resEl.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-sm opacity-50"><path d="M14.5 4h5v5m-5 11h5v-5M4 9V4h5M4 15v5h5"/><circle cx="12" cy="12" r="3"/></svg>
      <h4>Awaiting an input signal</h4>
      <p>Your decision output will appear here.</p>`;
  resEl.classList.add("empty-state");
  
  const isCamera = document.querySelector("#view-identify .identify-source-tabs .tab[data-source='camera']").classList.contains("active");
  uploadPanel.classList.toggle("hidden", isCamera);
  cameraPanel.classList.toggle("hidden", !isCamera);
});

async function runIdentify(fileOrBlob) {
  const resultsEl = document.getElementById("identify-results");
  resultsEl.classList.remove("empty-state");
  resultsEl.innerHTML = '<span class="spinner"></span><p class="mt-sm">Processing signal...</p>';

  const imgURL = URL.createObjectURL(fileOrBlob);
  const img = new Image();
  img.onload = async () => {
    const form = new FormData();
    form.append("file", fileOrBlob, "capture.jpg");
    try {
      const res = await fetch(API_BASE + "/recognize", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Recognition failed.");
      drawCanvasWithBoxes(img, data.faces || []);
      renderIdentifyResults(data);
      loadDashboard();
    } catch (e) {
      resultsEl.innerHTML = `<div class="text-red">Signal processing error: ${e.message}</div>`;
      toast(e.message, true);
    }
  };
  img.src = imgURL;
}

function drawCanvasWithBoxes(img, faces) {
  const wrap = document.getElementById("identify-canvas-wrap");
  wrap.classList.remove("hidden");
  uploadPanel.classList.add("hidden");
  cameraPanel.classList.add("hidden");
  const canvas = document.getElementById("identify-canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  faces.forEach(f => {
    const { x1, y1, x2, y2 } = f.bbox;
    const color = f.status === "recognized" ? "#2DE0B3" : f.status === "unknown" ? "#F5A623" : "#FF5A79";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, img.naturalWidth / 250);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const label = f.name ? `${f.name.toUpperCase()} ${f.similarity !== null ? "(" + f.similarity.toFixed(2) + ")" : ""}` : "REJECTED";
    ctx.font = `600 ${Math.max(16, img.naturalWidth / 40)}px 'IBM Plex Mono', monospace`;
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = color;
    ctx.fillRect(x1, Math.max(0, y1 - 28), textW + 16, 28);
    ctx.fillStyle = "#000";
    ctx.fillText(label, x1 + 8, Math.max(18, y1 - 8));
  });
}

function renderIdentifyResults(data) {
  const el = document.getElementById("identify-results");
  if (!data.faces || data.faces.length === 0) {
    el.innerHTML = `<div class="empty-state-content text-muted">No face signal detected in input.</div>`;
    el.classList.add("empty-state");
    return;
  }
  el.innerHTML = "";
  data.faces.forEach(f => {
    const div = document.createElement("div");
    div.className = "face-result";
    if (f.status === "rejected") {
      div.innerHTML = `<div class="fr-top"><span class="fr-name unknown">SIGNAL REJECTED</span></div>
        <p class="fr-meta">${f.reason}</p>`;
    } else {
      const pct = Math.max(0, Math.min(1, (f.similarity + 1) / 2)) * 100;
      div.innerHTML = `
        <div class="fr-top">
          <span class="fr-name ${f.status}">${f.name}</span>
          <span class="font-mono text-main">${f.similarity.toFixed(3)}</span>
        </div>
        <div class="sim-bar-track"><div class="sim-bar-fill ${f.status}" style="width:${pct}%"></div></div>
        <p class="fr-meta">status: ${f.status} · detector_conf: ${f.det_score} · active_thresh: ${f.threshold_used ?? "n/a"}</p>`;
    }
    el.appendChild(div);
  });
  const summary = document.createElement("p");
  summary.className = "fr-meta mt-sm border-t pt-sm";
  summary.textContent = `Scanned ${data.num_faces_detected} face(s) · embedding: ${data.timing_ms.detect_and_embed}ms · vector_match: ${data.timing_ms.matching}ms`;
  el.appendChild(summary);
}

// --------------------------------------------------------------- people --
async function loadPeople() {
  const el = document.getElementById("people-list");
  el.innerHTML = '<span class="spinner"></span>';
  try {
    const people = await apiFetch("/people");
    if (people.length === 0) {
      // FIX DESIGN: Remove people-grid class when empty so flexbox centering works perfectly
      el.className = "empty-state w-full";
      el.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-sm opacity-50"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h3 class="text-main">Directory is empty</h3>
        <p class="text-muted text-sm mt-xs">No identities enrolled. Go to "Enroll identity" to populate the database.</p>
      `;
      return;
    }
    el.className = "people-grid";
    el.innerHTML = "";
    for (const p of people) {
      const card = document.createElement("div");
      card.className = "person-card";
      const date = new Date(p.created_at * 1000).toLocaleDateString();
      card.innerHTML = `
        <h3>${p.name}</h3>
        <div class="pc-meta">${p.external_id ? "SYS: " + p.external_id + " · " : ""}${p.sample_count} vector(s) · ${date}</div>
        <div class="pc-thumbs" id="thumbs-${p.id}"></div>
        <div class="mt-sm pt-sm border-t">
          <button class="danger-btn w-full" data-del="${p.id}">Purge Identity</button>
        </div>`;
      el.appendChild(card);
      loadPersonThumbs(p.id);
    }
    el.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("CRITICAL WARNING: Permanently purge this identity and all associated biometric vectors from the local database?")) return;
        try {
          await apiFetch(`/people/${btn.dataset.del}`, { method: "DELETE" });
          toast("Identity purged successfully.");
          loadPeople();
          loadDashboard();
        } catch (e) {
          toast("Purge failed: " + e.message, true);
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state text-red">Connection error: ${e.message}</div>`;
  }
}

async function loadPersonThumbs(personId) {
  try {
    const detail = await apiFetch(`/people/${personId}`);
    const container = document.getElementById(`thumbs-${personId}`);
    if (!container) return;
    detail.thumbnails.forEach(t => {
      const img = document.createElement("img");
      img.src = `${API_BASE}/people/${personId}/thumbnail/${t.id}`;
      container.appendChild(img);
    });
  } catch (_) { }
}

// ----------------------------------------------------------- evaluation --
async function loadEvaluation() {
  const el = document.getElementById("evaluation-body");
  const chartPanel = document.getElementById("eval-charts-container");
  el.innerHTML = '<div class="empty-state-content"><span class="spinner mb-sm"></span><p>Loading telemetry...</p></div>';
  
  try {
    const data = await apiFetch("/evaluation");
    
    const tInput = document.getElementById("eval-threshold-input");
    if(tInput) tInput.value = data.threshold !== undefined ? data.threshold : (data.current_threshold || 0.38);

    // FIX UI STATE: Explicitly hide charts and render the empty banner if data is cleared
    if (data.status === "insufficient_data" || data.status === "genuine_only") {
        el.innerHTML = `
        <div class="pending-banner">
          <strong>INSUFFICIENT TELEMETRY DATA:</strong> ${data.message}
        </div>
        <p class="font-mono text-sm text-muted">Current default threshold in use: ${data.current_threshold || 0.38}</p>`;
        chartPanel.style.display = "none";
        return;
    }

    if (!data.available) {
      el.innerHTML = `
        <div class="empty-state-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-sm opacity-50"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <h4>No analysis executed</h4>
            <p>${data.message}</p>
        </div>`;
      chartPanel.style.display = "none";
      return;
    }
    
    // Draw the FAR/FRR Curve
    if (data.curve && data.curve.length > 0) {
        chartPanel.style.display = "grid";
        const ctx = document.getElementById('evalChart').getContext('2d');
        if (window.evalChartInstance) { window.evalChartInstance.destroy(); }
        
        window.evalChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.curve.map(c => c.threshold.toFixed(2)),
                datasets: [
                    { label: 'FAR', data: data.curve.map(c => c.far), borderColor: '#FF5A79', pointRadius: 0, tension: 0.2 },
                    { label: 'FRR', data: data.curve.map(c => c.frr), borderColor: '#2DE0B3', pointRadius: 0, tension: 0.2 }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { labels: { color: '#8295A9' } } },
                scales: {
                    x: { title: { display: true, text: 'Threshold', color: '#566B7D' }, ticks: { color: '#566B7D', maxTicksLimit: 15 }, grid: { color: '#1E2835' } },
                    y: { title: { display: true, text: 'Error Rate', color: '#566B7D' }, beginAtZero: true, max: 1.0, ticks: { color: '#566B7D' }, grid: { color: '#1E2835' } }
                }
            }
        });
    }

    // Draw the Similarity Distribution Histogram
    if (data.distribution) {
        chartPanel.style.display = "grid";
        const ctxDist = document.getElementById('distChart').getContext('2d');
        if (window.distChartInstance) { window.distChartInstance.destroy(); }
        
        window.distChartInstance = new Chart(ctxDist, {
            type: 'bar',
            data: {
                labels: data.distribution.labels,
                datasets: [
                    { label: 'Impostor Pairs (Different People)', data: data.distribution.impostor, backgroundColor: 'rgba(255, 90, 121, 0.7)', borderWidth: 0 },
                    { label: 'Genuine Pairs (Same Person)', data: data.distribution.genuine, backgroundColor: 'rgba(45, 224, 179, 0.7)', borderWidth: 0 }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#8295A9' } } },
                scales: {
                    x: { stacked: false, title: { display: true, text: 'Cosine Similarity', color: '#566B7D' }, ticks: { color: '#566B7D', maxTicksLimit: 15 }, grid: { color: '#1E2835' } },
                    y: { stacked: false, title: { display: true, text: 'Count', color: '#566B7D' }, ticks: { color: '#566B7D' }, grid: { color: '#1E2835' } }
                }
            }
        });
    }

    el.innerHTML = `
      <div class="eval-metric-grid">
        <div class="eval-metric"><div class="em-label">Optimal Threshold</div><div class="em-value">${data.threshold}</div></div>
        <div class="eval-metric"><div class="em-label">Accuracy</div><div class="em-value">${(data.accuracy*100).toFixed(1)}%</div></div>
        <div class="eval-metric"><div class="em-label">Precision</div><div class="em-value">${(data.precision*100).toFixed(1)}%</div></div>
        <div class="eval-metric"><div class="em-label">Recall</div><div class="em-value">${(data.recall*100).toFixed(1)}%</div></div>
        <div class="eval-metric"><div class="em-label">F1 Score</div><div class="em-value">${(data.f1*100).toFixed(1)}%</div></div>
        <div class="eval-metric"><div class="em-label">FAR @ Opt.</div><div class="em-value">${(data.far*100).toFixed(2)}%</div></div>
        <div class="eval-metric"><div class="em-label">FRR @ Opt.</div><div class="em-value">${(data.frr*100).toFixed(2)}%</div></div>
      </div>
      <p class="font-mono text-xs text-muted mt-sm border-t pt-sm">Total Identities: ${data.identities_enrolled.length} · Genuine pairwise comparisons: ${data.n_genuine} · Impostor pairwise comparisons: ${data.n_impostor}</p>
      <p class="font-mono text-xs text-muted mt-xs">Telemetry generated ${new Date(data.generated_at * 1000).toLocaleString()} directly from the Local DB.</p>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state text-red">Connection error: ${e.message}</div>`;
  }
}

document.getElementById("eval-threshold-submit").addEventListener("click", async () => {
  const val = document.getElementById("eval-threshold-input").value;
  try {
    await apiFetch(`/evaluation/threshold?value=${val}`, { method: "POST" });
    toast("Engine operating threshold successfully updated to " + val);
    loadDashboard();
    loadEvaluation();
  } catch (e) {
    toast("Configuration failure: " + e.message, true);
  }
});

// Run Evaluation from UI
document.getElementById("run-eval-btn").addEventListener("click", async () => {
  const btn = document.getElementById("run-eval-btn");
  const logDiv = document.getElementById("run-eval-log");
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Computing telemetry...';
  logDiv.classList.add("hidden");

  try {
    const res = await fetch(API_BASE + "/evaluation/run", { method: "POST" });
    const data = await res.json();
    
    logDiv.classList.remove("hidden");
    if (!res.ok) {
      let errorMsg = data.detail;
      if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
      logDiv.innerHTML = `<span class="text-red">Analysis aborted: ${errorMsg || 'Subprocess failure'}</span>`;
      toast("Pipeline failure", true);
    } else {
      logDiv.innerHTML = data.log;
      toast("Telemetry pipeline executed successfully.");
      loadEvaluation();
      loadDashboard();
    }
  } catch (e) {
    logDiv.classList.remove("hidden");
    logDiv.innerHTML = `<span class="text-red">Connection error: ${e.message}</span>`;
    toast("Pipeline connection failure", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Execute Evaluation';
  }
});

// ------------------------------------------------------------- initial --
loadDashboard();