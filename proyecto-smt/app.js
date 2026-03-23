// ============================================================
// SMT CHIAPAS â€” SISTEMA DE REPORTES CIUDADANOS
// app.js â€” VersiÃ³n PÃºblica (Sin Login)
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyt4IJgra_CeRcbv1j6KdIsB1B1ZNWwSfGzMgEpqx8ZiJLf6XuaYK_obAc9y5GZaXTOiw/exec';

// â”€â”€ Estado Global â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let reportMap   = null;
let reportMarker = null;
let currentStep = 1;
let lastFolio   = '';

// ============================================================
// INICIALIZACIÃ“N
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadPublicStats();
    initScrollAnimations();
    setupFormListeners();

    // Max date para fecha del incidente
    const dt = document.getElementById('fecha_incidente');
    if (dt) dt.max = new Date().toISOString().slice(0, 16);

    // Check URL params para ir directamente a folio
    const params = new URLSearchParams(window.location.search);
    if (params.get('folio')) {
        showFolioPage();
        document.getElementById('folio-input').value = params.get('folio');
        buscarFolio();
    }
});

// ============================================================
// NAVEGACIÃ“N
// ============================================================
function showLanding() {
    hide('page-create-report');
    hide('page-folio');
    show('page-landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showCreateReport() {
    hide('page-landing');
    hide('page-folio');
    show('page-create-report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    resetReportForm();
}

function showFolioPage() {
    hide('page-landing');
    hide('page-create-report');
    show('page-folio');
    hide('folio-result');
    hide('recover-result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startReportWithCategory(categoria) {
    showCreateReport();
    setTimeout(() => {
        const input = document.querySelector(`input[name="categoria"][value="${categoria}"]`);
        if (input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.closest('.radio-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        document.getElementById('titulo')?.focus();
    }, 120);
}

function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function toggle(id) { document.getElementById(id)?.classList.toggle('hidden'); }

function toggleMobileMenu() { toggle('mobile-menu'); }

// ============================================================
// ESTADÃSTICAS PÃšBLICAS
// ============================================================
async function loadPublicStats() {
    try {
        const res  = await apiCall({ action: 'getPublicStats' });
        if (!res.success) return;

        const d = res.data;
        animateNumber('stat-total',       d.total_reportes,   1200);
        animateNumber('stat-resueltos',    d.reportes_resueltos, 1400);

        // Tasa de efectividad con %
        const efectEl = document.getElementById('stat-efectividad');
        if (efectEl) {
            const target = d.efectividad || 0;
            animateNumberCustom(efectEl, 0, target, 1600, v => v + '%');
        }
    } catch (e) {
        // silencioso â€” stats no crÃ­ticas
    }
}

function animateNumber(id, target, duration) {
    const el = document.getElementById(id);
    if (!el) return;
    animateNumberCustom(el, 0, target, duration, v => v.toLocaleString('es-MX'));
}

function animateNumberCustom(el, from, to, duration, fmt) {
    const start = performance.now();
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
        el.textContent = fmt(Math.floor(from + (to - from) * ease));
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ============================================================
// FORMULARIO MULTI-PASO
// ============================================================
function resetReportForm() {
    currentStep = 1;
    document.getElementById('create-report-form')?.reset();
    showStep(1);

    // Limpiar mapa
    if (reportMap) { reportMap.remove(); reportMap = null; reportMarker = null; }
    hide('selected-location');
    document.getElementById('ubicacion_lat').value = '';
    document.getElementById('ubicacion_lng').value = '';
    document.getElementById('desc-count').textContent = '0';

    const overlay = document.getElementById('map-overlay');
    if (overlay) overlay.classList.remove('hidden');
    hide('address-suggestions');
}

function showStep(n) {
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById(`step-${i}`);
        if (el) el.classList.toggle('hidden', i !== n);
    }
    updateProgressUI(n);
    currentStep = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgressUI(active) {
    for (let i = 1; i <= 5; i++) {
        const step = document.getElementById(`prog-${i}`);
        const line = document.getElementById(`prog-line-${i}`);
        if (!step) continue;
        step.classList.remove('active', 'done');
        if (i < active)  step.classList.add('done');
        if (i === active) step.classList.add('active');
        if (line) line.classList.toggle('done', i < active);
    }
}

function goToStep(n) {
    if (n > currentStep && !validateCurrentStep()) return;
    if (n === 3) initReportMap();
    if (n === 5) buildConfirmSummary();
    showStep(n);
}

// â”€â”€â”€ ValidaciÃ³n por paso â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function validateCurrentStep() {
    const step = currentStep;

    if (step === 1) {
        const cat = document.querySelector('input[name="categoria"]:checked');
        if (!cat) { toast('Selecciona una categoría para el reporte', 'error'); return false; }

        const titulo = document.getElementById('titulo')?.value.trim();
        if (!titulo || titulo.length < 5) { toast('Escribe un título descriptivo (mínimo 5 caracteres)', 'error'); return false; }

        const fecha = document.getElementById('fecha_incidente')?.value;
        if (!fecha) { toast('Indica cuándo ocurrió el incidente', 'error'); return false; }

        const gravedad = document.getElementById('gravedad')?.value;
        if (!gravedad) { toast('Selecciona la gravedad del incidente', 'error'); return false; }

        return true;
    }

    if (step === 2) {
        const desc = document.getElementById('descripcion')?.value.trim();
        if (!desc || desc.length < 20) { toast('La descripción debe tener al menos 20 caracteres', 'error'); return false; }
        return true;
    }

    return true; // Pasos 3, 4 son opcionales
}

// â”€â”€â”€ Resumen de confirmaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildConfirmSummary() {
    const form = document.getElementById('create-report-form');
    const fd   = new FormData(form);

    const catLabels = {
        CONDUCTOR: 'Conductor', UNIDAD: 'Unidad/Vehículo',
        SERVICIO: 'Servicio/Cobro', DOCUMENTACION: 'Documentación',
        RUTA: 'Ruta', OTRO: 'Otro'
    };
    const gravLabels = { LEVE: 'Leve', MODERADO: 'Moderado', GRAVE: 'Grave', MUY_GRAVE: 'Muy Grave' };

    const items = [
        { label: 'Categoría',             value: catLabels[fd.get('categoria')] || fd.get('categoria') },
        { label: 'Gravedad',             value: gravLabels[fd.get('gravedad')] || fd.get('gravedad') },
        { label: 'Título',                value: fd.get('tipo_infraccion'),  full: true },
        { label: 'Fecha del Incidente',  value: formatDateLocal(fd.get('fecha_incidente')) },
        { label: 'Número de Ruta',        value: fd.get('numero_ruta') || '—' },
        { label: 'Número Económico',      value: fd.get('numero_economico') || '—' },
        { label: 'Ubicación',             value: fd.get('ubicacion_texto') || (fd.get('ubicacion_lat') ? `${parseFloat(fd.get('ubicacion_lat')).toFixed(4)}, ${parseFloat(fd.get('ubicacion_lng')).toFixed(4)}` : '—'), full: true },
        { label: 'Nombre',                value: fd.get('nombre_completo') || '— (Anónimo)' },
        { label: 'Teléfono',              value: fd.get('telefono') || '—' },
        { label: 'Email',                 value: fd.get('email') || '—' },
    ];

    const grid = document.getElementById('confirm-summary');
    if (!grid) return;
    grid.innerHTML = items.map(i => `
        <div class="confirm-item${i.full ? ' full-width' : ''}">
            <div class="confirm-item-label">${i.label}</div>
            <div class="confirm-item-value">${escHtml(i.value)}</div>
        </div>
    `).join('');
}

// â”€â”€â”€ EnvÃ­o del formulario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleCreateReport(event) {
    event.preventDefault();

    const veracidad = document.getElementById('veracidad');
    if (!veracidad?.checked) {
        toast('Debes aceptar la declaración de veracidad', 'error');
        return;
    }

    const fd = new FormData(event.target);
    const esAnonimo = fd.get('es_anonimo') === 'true';

    const payload = {
        action: 'createReport',
        // Datos bÃ¡sicos
        categoria:        fd.get('categoria'),
        tipo_infraccion:  fd.get('tipo_infraccion'),
        gravedad:         fd.get('gravedad'),
        fecha_incidente:  fd.get('fecha_incidente'),
        sigue_ocurriendo: fd.get('sigue_ocurriendo') === 'true',
        descripcion:      fd.get('descripcion'),
        // Transporte
        numero_ruta:      fd.get('numero_ruta') || null,
        numero_economico: fd.get('numero_economico') || null,
        placas:           fd.get('placas') || null,
        linea_transporte: fd.get('linea_transporte') || null,
        color_vehiculo:   fd.get('color_vehiculo') || null,
        hubo_testigos:    fd.get('hubo_testigos') === 'true',
        // UbicaciÃ³n
        ubicacion_texto:  fd.get('ubicacion_texto') || null,
        ubicacion_lat:    fd.get('ubicacion_lat') || null,
        ubicacion_lng:    fd.get('ubicacion_lng') || null,
        // Contacto (puede ser vacÃ­o si es anÃ³nimo)
        es_anonimo:       esAnonimo,
        nombre_completo:  esAnonimo ? null : (fd.get('nombre_completo') || null),
        email:            esAnonimo ? null : (fd.get('email') || null),
        telefono:         esAnonimo ? null : (fd.get('telefono') || null),
        horario_contacto: esAnonimo ? null : (fd.get('horario_contacto') || null),
    };

    showLoading();
    try {
        const res = await apiCall(payload);
        if (res.success) {
            lastFolio = res.folio || res.data?.folio || '';
            document.getElementById('success-folio').textContent = lastFolio;
            hide('page-create-report');
            show('success-modal');
        } else {
            toast(res.message || 'Ocurrió un error al enviar el reporte. Intenta de nuevo.', 'error');
        }
    } catch (e) {
        console.error(e);
        toast('Error de conexión. Verifica tu internet e intenta de nuevo.', 'error');
    } finally {
        hideLoading();
    }
}

// â”€â”€â”€ Listeners de validaciÃ³n en tiempo real â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setupFormListeners() {
    const descTextarea = document.getElementById('descripcion');
    if (descTextarea) {
        descTextarea.addEventListener('input', () => {
            const len = descTextarea.value.length;
            const counter = document.getElementById('desc-count');
            if (counter) {
                counter.textContent = len;
                counter.style.color = len >= 20 ? '#10b981' : '#ef4444';
            }
        });
    }

    const anonCheck = document.getElementById('es_anonimo');
    if (anonCheck) {
        anonCheck.addEventListener('change', () => {
            const fields = ['nombre_completo', 'telefono', 'email', 'horario_contacto'];
            fields.forEach(f => {
                const el = document.getElementById(f);
                if (el) {
                    el.disabled = anonCheck.checked;
                    el.style.opacity = anonCheck.checked ? '.4' : '1';
                    if (anonCheck.checked) el.value = '';
                }
            });
        });
    }

    const folioInput = document.getElementById('folio-input');
    if (folioInput) {
        folioInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    const recPhone = document.getElementById('recover-phone');
    if (recPhone) {
        recPhone.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^\d+()\-\s]/g, '');
        });
    }
}

// ============================================================
// MAPA INTERACTIVO
// ============================================================
function initReportMap() {
    if (reportMap) { setTimeout(() => reportMap.invalidateSize(), 200); return; }

    setTimeout(() => {
        const el = document.getElementById('report-map');
        if (!el) return;

        reportMap = L.map('report-map', {
            center: [16.7516, -93.1133],
            zoom: 13,
            zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(reportMap);

        reportMap.on('click', async (e) => {
            placeMarker(e.latlng.lat, e.latlng.lng);
            const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng);
            if (addr) updateLocationDisplay(addr, e.latlng.lat, e.latlng.lng);
        });

        [100, 300, 600].forEach(d => setTimeout(() => reportMap?.invalidateSize(), d));
        setupAddressSearch();
    }, 200);
}

function placeMarker(lat, lng) {
    if (reportMarker) reportMap.removeLayer(reportMarker);

    const icon = L.divIcon({
        className: '',
        html: `<div style="
            width:36px;height:36px;background:var(--primary);border-radius:50% 50% 50% 4px;
            transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
            box-shadow:0 4px 16px rgba(15,118,110,.45);border:3px solid white;
        "><span style="transform:rotate(45deg);font-size:15px">📍</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
    });

    reportMarker = L.marker([lat, lng], { icon }).addTo(reportMap);
    document.getElementById('ubicacion_lat').value = lat.toFixed(6);
    document.getElementById('ubicacion_lng').value = lng.toFixed(6);

    // Ocultar overlay del mapa
    document.getElementById('map-overlay')?.classList.add('hidden');
}

function updateLocationDisplay(address, lat, lng) {
    document.getElementById('selected-location-text').textContent = address;
    document.getElementById('ubicacion_texto').value = address;
    show('selected-location');
    if (reportMarker) reportMarker.bindPopup(`<strong>📍 Ubicación marcada</strong><br>${address}`).openPopup();
}

function clearLocation() {
    if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }
    document.getElementById('ubicacion_lat').value = '';
    document.getElementById('ubicacion_lng').value = '';
    document.getElementById('ubicacion_texto').value = '';
    hide('selected-location');
    document.getElementById('map-overlay')?.classList.remove('hidden');
}

// â”€â”€â”€ GeocodificaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'es' }
        });
        const d = await res.json();
        return d?.display_name || null;
    } catch { return null; }
}

let searchTimeout = null;
function setupAddressSearch() {
    const inp = document.getElementById('address-search');
    if (!inp) return;
    inp.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = inp.value.trim();
        if (q.length < 3) { hide('address-suggestions'); return; }
        searchTimeout = setTimeout(() => doAddressSearch(q), 450);
    });
}

async function searchAddress() {
    const q = document.getElementById('address-search')?.value.trim();
    if (!q) { toast('Escribe una dirección para buscar', 'warning'); return; }
    showLoading();
    await doAddressSearch(q);
    hideLoading();
}

async function doAddressSearch(query) {
    try {
        const full = query.toLowerCase().includes('chiapas') ? query : query + ', Chiapas, México';
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(full)}&limit=5&addressdetails=1`, {
            headers: { 'Accept-Language': 'es' }
        });
        const results = await res.json();
        showSuggestions(results);
    } catch { hide('address-suggestions'); }
}

function showSuggestions(results) {
    const box = document.getElementById('address-suggestions');
    if (!box || !results?.length) { hide('address-suggestions'); return; }

    box.innerHTML = results.map(r => `
        <div class="addr-suggestion-item" onclick="selectSuggestion(${r.lat}, ${r.lon}, ${JSON.stringify(r.display_name).replace(/'/g,"\\'")} )">
            <i class="fas fa-map-marker-alt"></i>
            <p>${escHtml(r.display_name)}</p>
        </div>
    `).join('');
    show('address-suggestions');
}

function selectSuggestion(lat, lng, address) {
    hide('address-suggestions');
    document.getElementById('address-search').value = '';
    if (!reportMap) { initReportMap(); setTimeout(() => { placeMarker(lat, lng); updateLocationDisplay(address, lat, lng); reportMap.setView([lat, lng], 16); }, 600); }
    else { placeMarker(lat, lng); updateLocationDisplay(address, lat, lng); reportMap.setView([lat, lng], 16); }
    toast('Ubicación seleccionada', 'success');
}

function getCurrentLocation() {
    if (!navigator.geolocation) { toast('Tu dispositivo no soporta geolocalización', 'error'); return; }
    showLoading();
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            if (!reportMap) { initReportMap(); await new Promise(r => setTimeout(r, 600)); }
            reportMap.setView([lat, lng], 16);
            placeMarker(lat, lng);
            const addr = await reverseGeocode(lat, lng);
            if (addr) updateLocationDisplay(addr, lat, lng);
            hideLoading();
            toast('Ubicación actual obtenida', 'success');
        },
        (err) => {
            hideLoading();
            const msgs = { 1: 'Debes permitir el acceso a tu ubicación', 2: 'Ubicación no disponible', 3: 'Tiempo agotado al obtener ubicación' };
            toast(msgs[err.code] || 'No se pudo obtener tu ubicación', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// ============================================================
// MODAL DE Ã‰XITO
// ============================================================
function copyFolio() {
    navigator.clipboard?.writeText(lastFolio).then(() => toast('Folio copiado al portapapeles', 'success'))
        .catch(() => { /* fallback */ });
}

function closeSuccessModal() {
    hide('success-modal');
    showLanding();
}

function buscarFolioFromModal() {
    hide('success-modal');
    showFolioPage();
    const inp = document.getElementById('folio-input');
    if (inp) { inp.value = lastFolio; buscarFolio(); }
}

// ============================================================
// CONSULTA POR FOLIO
// ============================================================
async function buscarFolio() {
    const rawFolio = document.getElementById('folio-input')?.value || '';
    const folio = normalizeFolio(rawFolio);
    if (!folio) { toast('Ingresa un número de folio', 'error'); return; }
    if (!isValidFolioFormat(folio)) {
        toast('Formato de folio no válido. Ejemplo: SMT-2099-9999', 'warning');
        return;
    }
    const folioInput = document.getElementById('folio-input');
    if (folioInput) folioInput.value = folio;

    showLoading();
    hide('folio-result');

    try {
        let res = await apiCall({ action: 'getFolioStatus', folio });
        const msg = String(res?.message || '').toLowerCase();
        if (!res?.success && (msg.includes('acción desconocida') || msg.includes('accion desconocida'))) {
            // Compatibilidad con backends antiguos
            res = await apiCall({ action: 'getReportByFolio', folio });
        }
        if (res.success) {
            renderFolioResult(res.data);
            show('folio-result');
        } else {
            document.getElementById('folio-result').innerHTML = `
                <div class="folio-result-card">
                    <div style="text-align:center;padding:2.5rem 1rem">
                        <i class="fas fa-search" style="font-size:3rem;color:var(--gray-300);margin-bottom:1rem"></i>
                        <h3 style="margin-bottom:.5rem">Reporte no encontrado</h3>
                        <p style="color:var(--gray-500)">Verifica que el folio esté escrito correctamente, respetando mayúsculas y guiones.</p>
                    </div>
                </div>`;
            show('folio-result');
        }
    } catch (e) {
        toast('Error de conexión. Intenta de nuevo.', 'error');
    } finally {
        hideLoading();
    }
}

function renderFolioResult(r) {
    const estadosMap = [
        { key: 'NUEVO',            label: 'Reporte Recibido',      icon: 'fa-inbox',        desc: 'Tu reporte fue recibido y está en cola para revisión.' },
        { key: 'EN_REVISION_1',    label: 'En Revisión',           icon: 'fa-search',       desc: 'El equipo de la SMT está revisando tu reporte.' },
        { key: 'VALIDO',           label: 'Reporte Validado',      icon: 'fa-check-circle', desc: 'Tu reporte fue validado como procedente.' },
        { key: 'SANCION_ASIGNADA', label: 'Sanción Asignada',      icon: 'fa-gavel',        desc: 'Se aplicó una sanción al responsable.' },
        { key: 'RECHAZADO',        label: 'Reporte No Procedente', icon: 'fa-circle-xmark', desc: 'Tu reporte fue revisado y marcado como no procedente.' },
        { key: 'CERRADO',          label: 'Caso Cerrado',          icon: 'fa-flag-checkered',desc: 'El caso fue resuelto satisfactoriamente.' },
    ];

    const estado   = r.estado_actual;
    const curIdxRaw = estadosMap.findIndex(e => e.key === estado);
    const curIdx = curIdxRaw >= 0 ? curIdxRaw : 0;
    const badgeClass = { NUEVO:'badge-nuevo', EN_REVISION_1:'badge-revision', VALIDO:'badge-valido', SANCION_ASIGNADA:'badge-sancion', CERRADO:'badge-cerrado', RECHAZADO:'badge-rechazado' }[estado] || 'badge-nuevo';

    const catLabels = { CONDUCTOR: 'Conductor', UNIDAD: 'Unidad/Vehículo', SERVICIO: 'Servicio/Cobro', DOCUMENTACION: 'Documentación', RUTA: 'Ruta', OTRO: 'Otro' };
    const titulo = r.tipo_infraccion || r.titulo || 'No especificado';
    const descripcion = r.descripcion || 'Sin descripción registrada.';
    const hasLatLng = r.ubicacion_lat && r.ubicacion_lng;
    const coordsTxt = hasLatLng ? `${r.ubicacion_lat}, ${r.ubicacion_lng}` : '';

    // Timeline
    const timelineHTML = estadosMap.map((s, i) => {
        const isDone    = i < curIdx;
        const isCurrent = i === curIdx;
        const isPending = i > curIdx;

        let dotClass = 'pending';
        if (isDone)    dotClass = 'done';
        if (isCurrent) dotClass = 'current';

        const histItem = r.historial?.find(h => h.estado_nuevo === s.key);
        const date     = histItem?.fecha_cambio ? formatDate(histItem.fecha_cambio) : '';

        return `
            <div class="tl-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">
                <div class="tl-dot-wrap">
                    <div class="tl-dot ${dotClass}">
                        ${isDone ? '<i class="fas fa-check"></i>' : `<i class="fas ${s.icon}"></i>`}
                    </div>
                </div>
                <div class="tl-content">
                    <div class="tl-title">${s.label}</div>
                    <div class="tl-desc">${s.desc}</div>
                    ${date ? `<div class="tl-date"><i class="fas fa-calendar-check" style="margin-right:.35rem"></i>${date}</div>` : ''}
                    ${isCurrent ? `<span class="tl-badge-current"><i class="fas fa-circle"></i> Estado Actual</span>` : ''}
                    ${isPending ? `<div class="tl-desc" style="color:var(--gray-400);margin-top:.25rem"><i class="fas fa-clock" style="margin-right:.35rem"></i>Pendiente</div>` : ''}
                </div>
            </div>`;
    }).join('');

    // Comentarios externos del Notificador
    const comentariosNotificador = (r.comentarios || []).filter(c => {
        const rol = String(c.usuario_rol || '').toUpperCase();
        return !rol || rol === 'NOTIFICADOR';
    });
    const comentariosHTML = (comentariosNotificador.length)
        ? comentariosNotificador.map(c => `
            <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-md);padding:1rem 1.125rem;margin-bottom:.75rem">
                <div style="display:flex;align-items:center;gap:.625rem;margin-bottom:.5rem">
                    <div style="width:36px;height:36px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:.8rem;font-weight:700;flex-shrink:0">${getInitials(c.usuario_nombre)}</div>
                    <div>
                        <div style="font-size:.875rem;font-weight:700;color:var(--gray-900)">${escHtml(c.usuario_nombre)}</div>
                        <div style="font-size:.78rem;color:var(--gray-400)">${formatDate(c.fecha_comentario)}</div>
                    </div>
                </div>
                <p style="font-size:.9rem;color:var(--gray-700);line-height:1.6">${escHtml(c.comentario)}</p>
            </div>`).join('')
        : '<p style="text-align:center;color:var(--gray-400);padding:1.5rem 0">Sin comentarios del notificador aún.</p>';

    document.getElementById('folio-result').innerHTML = `
        <div class="folio-result-card">
            <div class="folio-result-header">
                <div>
                    <div class="folio-result-folio">${r.folio}</div>
                    <div class="folio-result-date">Creado el ${formatDate(r.fecha_creacion)}</div>
                </div>
                <span class="badge ${badgeClass}">${getEstadoLabel(estado)}</span>
            </div>

            <!-- Info del reporte -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:2rem">
                <div style="background:var(--gray-50);border-radius:var(--radius-md);padding:1rem">
                    <div style="font-size:.75rem;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.35rem">Categoría</div>
                    <div style="font-weight:700;color:var(--gray-900)">${catLabels[r.categoria] || r.categoria}</div>
                </div>
                <div style="background:var(--gray-50);border-radius:var(--radius-md);padding:1rem">
                    <div style="font-size:.75rem;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.35rem">Fecha del Incidente</div>
                    <div style="font-weight:700;color:var(--gray-900)">${formatDate(r.fecha_incidente)}</div>
                </div>
                <div style="background:var(--gray-50);border-radius:var(--radius-md);padding:1rem;grid-column:1/-1">
                    <div style="font-size:.75rem;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.35rem">Resumen del reporte</div>
                    <div style="font-weight:700;color:var(--gray-900);margin-bottom:.35rem">${escHtml(titulo)}</div>
                    <div style="font-weight:500;color:var(--gray-700);line-height:1.55">${escHtml(descripcion)}</div>
                </div>
                ${r.ubicacion_texto ? `<div style="background:var(--gray-50);border-radius:var(--radius-md);padding:1rem;grid-column:1/-1">
                    <div style="font-size:.75rem;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.35rem">Ubicación</div>
                    <div style="font-weight:500;color:var(--gray-700)">${escHtml(r.ubicacion_texto)}</div>
                </div>` : ''}
                ${coordsTxt ? `<div style="background:var(--gray-50);border-radius:var(--radius-md);padding:1rem;grid-column:1/-1">
                    <div style="font-size:.75rem;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.35rem">Coordenadas</div>
                    <div style="font-weight:500;color:var(--gray-700)">${escHtml(coordsTxt)}</div>
                </div>` : ''}
            </div>

            <!-- Timeline -->
            <h3 style="font-size:1rem;font-weight:800;margin-bottom:1.5rem;display:flex;align-items:center;gap:.5rem">
                <i class="fas fa-route" style="color:var(--primary)"></i> Seguimiento del Reporte
            </h3>
            <div class="timeline">${timelineHTML}</div>

            <!-- Comentarios del notificador -->
            <h3 style="font-size:1rem;font-weight:800;margin-top:2rem;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem">
                <i class="fas fa-comments" style="color:var(--primary)"></i> Seguimiento del Notificador
            </h3>
            ${comentariosHTML}
        </div>
    `;
}

// ============================================================
// UTILIDADES
// ============================================================
async function apiCall(data) {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
}

function formatDate(str) {
    if (!str) return 'N/A';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateLocal(str) {
    if (!str) return 'N/A';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getEstadoLabel(estado) {
    const m = { NUEVO: '🆕 Nuevo', EN_REVISION_1: '🔍 En Revisión', VALIDO: '✅ Validado', SANCION_ASIGNADA: '⚖️ Sancionado', CERRADO: '🔒 Cerrado', RECHAZADO: '❌ Rechazado' };
    return m[estado] || estado;
}

async function recuperarFolios() {
    const email = (document.getElementById('recover-email')?.value || '').trim().toLowerCase();
    const telefono = (document.getElementById('recover-phone')?.value || '').trim();
    const out = document.getElementById('recover-result');

    if (!email && !telefono) {
        toast('Ingresa correo o teléfono para recuperar folios.', 'warning');
        return;
    }

    showLoading();
    if (out) {
        out.innerHTML = '';
        hide('recover-result');
    }

    try {
        const res = await apiCall({ action: 'recoverFolios', email, telefono });
        if (!res.success) {
            toast(res.message || 'No se pudieron recuperar folios.', 'error');
            return;
        }

        const items = res.data || [];
        if (!items.length) {
            if (out) {
                out.innerHTML = `<div class="recover-item"><div class="recover-meta"><strong>Sin resultados</strong><span>${escHtml(res.message || 'No encontramos folios para esos datos.')}</span></div></div>`;
                show('recover-result');
            }
            return;
        }

        if (out) {
            out.innerHTML = items.map(it => `
                <div class="recover-item">
                    <div class="recover-meta">
                        <strong>${escHtml(it.folio)}</strong>
                        <span>${escHtml(getEstadoLabel(it.estado_actual))} · ${escHtml(formatDate(it.fecha_creacion))}</span>
                    </div>
                    <button class="recover-go" onclick="usarFolioRecuperado('${escHtml(it.folio)}')">Consultar</button>
                </div>
            `).join('');
            show('recover-result');
        }
        toast('Folios recuperados correctamente.', 'success');
    } catch (_e) {
        toast('Error de conexión al recuperar folios.', 'error');
    } finally {
        hideLoading();
    }
}

function usarFolioRecuperado(folio) {
    const inp = document.getElementById('folio-input');
    if (!inp) return;
    inp.value = normalizeFolio(folio);
    buscarFolio();
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normalizeFolio(value) {
    if (!value) return '';
    return String(value)
        .toUpperCase()
        .trim()
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, '');
}

function isValidFolioFormat(folio) {
    return /^SMT-\d{4}-\d{1,8}$/.test(folio) || /^REP-\d{4}-\d{1,8}$/.test(folio);
}

// â”€â”€â”€ Toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function toast(message, type = 'info') {
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span style="flex:1">${escHtml(message)}</span>
        <i class="fas fa-times toast-close" onclick="this.closest('.toast').remove()"></i>`;
    container.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 5000);
}

// â”€â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showLoading() { document.getElementById('loading-overlay')?.classList.remove('hidden'); }
function hideLoading()  { document.getElementById('loading-overlay')?.classList.add('hidden'); }

// â”€â”€â”€ Scroll Animations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initScrollAnimations() {
    const els = document.querySelectorAll('[data-animate]');
    if (!els.length) return;

    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const delay = e.target.dataset.delay || 0;
            setTimeout(() => e.target.classList.add('animated'), +delay);
            io.unobserve(e.target);
        });
    }, { threshold: 0.12 });

    els.forEach(el => io.observe(el));
}
