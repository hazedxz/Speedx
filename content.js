// SpeedX Route Copier v9 — con Google Maps

const BTN_ID    = 'speedx-copy-btn';
const PATRON_ID = /^\d{4}-[A-Z0-9]+-batch\d+/;

const FILTROS = [
  { key: 'on track',        emoji: '🚚', label: 'Rutas en camino'  },
  { key: 'completed',       emoji: '✅', label: 'Rutas completadas' },
  { key: 'amber',           emoji: '🟡', label: 'Rutas en Amber'    },
  { key: 'red',             emoji: '🔴', label: 'Rutas en Red'      },
  { key: 'not start route', emoji: '🚫', label: 'Rutas sin iniciar' },
];
const DEFAULT_FILTRO = { emoji: '📦', label: 'Reporte de Rutas' };

function crearBoton() {
  if (document.getElementById(BTN_ID)) return;
  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.title = 'Copiar reporte de rutas';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;
  document.body.appendChild(btn);
  btn.addEventListener('click', iniciarCopia);
}

function esColorActivo(color) {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return false;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const r = +m[1], g = +m[2], b = +m[3];
  if (b >= 240 && (b - r) >= 25 && (b - g) >= 10) return true;
  if (r >= 240 && g >= 200 && b <= 180 && r > b + 50) return true;
  if (r >= 240 && g <= 200 && b <= 200 && r > g + 40) return true;
  return false;
}

function detectarFiltroActivo() {
  let mejor = null, mejorDiff = 0;
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 8) continue;
    const bg = getComputedStyle(el).backgroundColor;
    if (!esColorActivo(bg)) continue;
    const txt = (el.textContent || '').toLowerCase().trim();
    for (const f of FILTROS) {
      if (txt.includes(f.key)) {
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          const diff = +m[3] - +m[1];
          if (diff > mejorDiff) { mejorDiff = diff; mejor = f; }
        }
        break;
      }
    }
  }
  return mejor || DEFAULT_FILTRO;
}

function leerTarjetasDOM() {
  const resultado = {};
  const inner = document.querySelector('.rc-virtual-list-holder-inner');
  if (!inner) return resultado;
  for (const hijo of inner.children) {
    const texto = hijo.innerText || '';
    if (!texto.trim()) continue;
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    let idRuta = null;
    for (const l of lineas.slice(0, 5)) {
      if (PATRON_ID.test(l)) { idRuta = l; break; }
    }
    if (!idRuta || resultado[idRuta]) continue;
    const limpias = limpiarLineas(lineas, idRuta);
    if (limpias.length >= 5) resultado[idRuta] = limpias;
  }
  return resultado;
}

const RUIDO = new Set(['GAS_CAR','ELECTRIC_CAR','ELECTRIC_...','Filter','GREEN','AMBER','RED']);
const PATRON_METROS = /^\d[\d,.]+\.\d{2} m$/;

function limpiarLineas(lineas, idRuta) {
  const out = [];
  let dentro = false;
  for (const l of lineas) {
    if (l === idRuta) dentro = true;
    if (!dentro) continue;
    if (RUIDO.has(l) || PATRON_METROS.test(l)) continue;
    out.push(l);
  }
  return out;
}

async function iniciarCopia() {
  const btn = document.getElementById(BTN_ID);
  btn.classList.add('cargando');
  try {
    const filtro = detectarFiltroActivo();
    const texto  = await capturarTodo(filtro);
    if (!texto) { mostrarFeedback('error'); return; }
    await copiarAlPortapapeles(texto);
    mostrarFeedback('ok');
  } catch(e) {
    console.error('[SpeedX]', e);
    mostrarFeedback('error');
  }
}

async function capturarTodo(filtro) {
  const holder = document.querySelector('.rc-virtual-list-holder');
  if (!holder) return null;
  const capturadas = {};
  const scrollOriginal = holder.scrollTop;
  holder.scrollTop = 0;
  await esperar(350);
  let sinNuevas = 0;
  while (sinNuevas < 4) {
    const ahora = leerTarjetasDOM();
    let nuevas = 0;
    for (const [id, lineas] of Object.entries(ahora)) {
      if (!capturadas[id]) { capturadas[id] = lineas; nuevas++; }
    }
    sinNuevas = nuevas > 0 ? 0 : sinNuevas + 1;
    const antes = holder.scrollTop;
    holder.scrollTop += holder.clientHeight * 0.6;
    await esperar(300);
    if (Math.abs(holder.scrollTop - antes) < 5) {
      const ultima = leerTarjetasDOM();
      for (const [id, l] of Object.entries(ultima)) {
        if (!capturadas[id]) capturadas[id] = l;
      }
      break;
    }
  }
  holder.scrollTop = scrollOriginal;
  await esperar(150);
  const rutas = Object.values(capturadas);
  if (!rutas.length) return null;
  return formatearReporte(rutas, filtro);
}

function formatearReporte(rutas, filtro) {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
  const hora  = ahora.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
  return [
    `${filtro.emoji} ${filtro.label} — ${fecha} ${hora}`,
    `Total: ${rutas.length} rutas`, '',
    ...rutas.flatMap(l => [...l, ''])
  ].join('\n').trim();
}

async function copiarAlPortapapeles(texto) {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: texto });
    ta.style.cssText = 'position:fixed;top:-9999px';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
}

function mostrarFeedback(tipo) {
  const btn = document.getElementById(BTN_ID);
  if (!btn) return;
  btn.classList.remove('cargando');
  btn.classList.add(tipo === 'ok' ? 'copiado' : 'error');
  setTimeout(() => btn.classList.remove('copiado','error'), 2500);
}

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(crearBoton, 900));
} else {
  setTimeout(crearBoton, 900);
}
new MutationObserver(() => {
  if (!document.getElementById(BTN_ID)) crearBoton();
}).observe(document.body, { childList: true, subtree: false });


// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO GOOGLE MAPS — solo en el dashboard de SpeedX
// ══════════════════════════════════════════════════════════════════════════════

// Este módulo SOLO corre en pos.speedx.io (dashboard de rutas)
// En pos.opsfleet.us la dirección la maneja el módulo QC con su propio <a>
if (location.hostname === 'pos.opsfleet.us') {
  // skip — el módulo QC tiene su propio link de Maps
} else {

const DIR_RE     = /\d+\s+[A-Za-z0-9 ,.'#-]{5,80}[A-Z]{2}\s+\d{5}/;
const EXCLUIR_RE = /\*{3,}|SPXPVD|batch|GAS_CAR|ELECTRIC/i;
const MAPS_ATTR  = 'data-spx-maps';

function inyectarCSS() {
  if (document.getElementById('spx-maps-css')) return;
  const s = document.createElement('style');
  s.id = 'spx-maps-css';
  s.textContent = `
    [data-spx-maps="activo"] {
      position: relative !important;
    }
    .spx-link {
      position: absolute;
      inset: 0;
      z-index: 9998;
      cursor: pointer !important;
      text-decoration: none;
      display: none;
    }
    .spx-link.visible {
      display: block;
    }
    /* Cuando el link está en hover, colorear el texto de la celda padre */
    .spx-link.visible:hover + .spx-text {
      color: #1677ff !important;
      text-decoration: underline !important;
      text-decoration-color: #1677ff !important;
    }
    .spx-text {
      transition: color 0.15s, text-decoration 0.15s;
    }
  `;
  document.head.appendChild(s);
}

function extraerDir(texto) {
  if (!texto || EXCLUIR_RE.test(texto)) return null;
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length < 12 || limpio.length > 300) return null;
  const m = limpio.match(DIR_RE);
  if (!m || m[0].length < 12) return null;
  return m[0].trim();
}

let _mapsAbierto = false;

// Guarda qué celda tiene el mouse encima ahora mismo
let _celdaBajoMouse = null;
document.addEventListener('mouseover', e => {
  const celda = e.target.closest(`[${MAPS_ATTR}]`);
  _celdaBajoMouse = celda || null;
}, { passive: true });

function procesarCelda(celda) {
  if (celda.getAttribute(MAPS_ATTR)) return;
  celda.setAttribute(MAPS_ATTR, 'inactivo');

  if (getComputedStyle(celda).position === 'static') {
    celda.style.setProperty('position', 'relative', 'important');
  }

  // Link invisible encima — cursor pointer nativo, no hay CSS que lo gane
  const link = document.createElement('a');
  link.className = 'spx-link';
  link.href      = '#';

  link.addEventListener('click', e => {
    e.preventDefault();
    const dir = extraerDir(celda.innerText || celda.textContent || '');
    if (!dir || _mapsAbierto) return;
    _mapsAbierto = true;
    setTimeout(() => { _mapsAbierto = false; }, 300);
    window.open(`https://www.google.com/maps/search/?q=${encodeURIComponent(dir)}`, '_blank');
  });

  // Span que envuelve el texto — para aplicar el color hover
  // No tocamos el contenido — solo añadimos una clase al elemento
  link.addEventListener('mouseenter', () => celda.classList.add('spx-hover'));
  link.addEventListener('mouseleave', () => celda.classList.remove('spx-hover'));

  celda.appendChild(link);
  celda._spxLink = link;

  // Estilo hover via JS directo — más confiable que CSS externo
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    [data-spx-id="${celda.dataset.spxId}"].spx-hover {
      color: #1677ff !important;
      text-decoration: underline !important;
      text-decoration-color: #1677ff !important;
      text-decoration-thickness: 1.5px !important;
      text-underline-offset: 2px !important;
    }
  `;
  celda.dataset.spxId = Math.random().toString(36).slice(2);
  document.head.appendChild(styleEl);
  celda._spxStyle = styleEl;
  // Actualizar el selector con el ID real
  styleEl.textContent = `
    [data-spx-id="${celda.dataset.spxId}"].spx-hover {
      color: #1677ff !important;
      text-decoration: underline !important;
      text-decoration-color: #1677ff !important;
      text-decoration-thickness: 1.5px !important;
      text-underline-offset: 2px !important;
    }
  `;
}

function actualizarEstados() {
  document.querySelectorAll(`[${MAPS_ATTR}]`).forEach(celda => {
    const tieneDir = !!extraerDir(celda.innerText || celda.textContent || '');
    celda.setAttribute(MAPS_ATTR, tieneDir ? 'activo' : 'inactivo');

    if (celda._spxLink) {
      if (tieneDir) {
        celda._spxLink.classList.add('visible');
        // Si el mouse ya está sobre esta celda, activar hover inmediatamente
        if (_celdaBajoMouse === celda || celda.contains(_celdaBajoMouse)) {
          celda.classList.add('spx-hover');
        }
      } else {
        celda._spxLink.classList.remove('visible');
        celda.classList.remove('spx-hover');
      }
    }
  });
}

function escanear() {
  actualizarEstados();

  const selectores = 'td, [class*="cell"], [class*="Cell"], [class*="address"], [class*="Address"]';
  for (const el of document.querySelectorAll(selectores)) {
    if (el.getAttribute(MAPS_ATTR)) continue;
    if (el.children.length > 5) continue;
    const txt = el.innerText || el.textContent || '';
    if (txt.length < 10 || txt.length > 300) continue;
    if (extraerDir(txt)) procesarCelda(el);
  }

  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.getAttribute?.(MAPS_ATTR))    return NodeFilter.FILTER_SKIP;
        if (node.children.length > 5)          return NodeFilter.FILTER_SKIP;
        const tag = node.tagName;
        if (['SCRIPT','STYLE','INPUT','BUTTON','SVG','A'].includes(tag))
          return NodeFilter.FILTER_SKIP;
        const txt = node.innerText || '';
        if (txt.length < 12 || txt.length > 300) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  const extras = [];
  let en;
  while ((en = walker.nextNode())) extras.push(en);
  for (const el of extras) {
    if (el.getAttribute(MAPS_ATTR)) continue;
    if (extraerDir(el.innerText || '')) procesarCelda(el);
  }
}

let scanTimer = null;
new MutationObserver(mutations => {
  const relevante = mutations.some(m => {
    if (m.type !== 'childList') return false;
    if (!m.addedNodes.length)   return false;
    if (m.target.closest?.('.rc-virtual-list')) return false;
    return true;
  });
  if (!relevante) return;
  actualizarEstados();
  clearTimeout(scanTimer);
  scanTimer = setTimeout(escanear, 400);
}).observe(document.body, {
  childList: true, subtree: true,
  attributes: false, characterData: false,
});

let ultimaUrl = location.href;
setInterval(() => {
  if (location.href !== ultimaUrl) {
    ultimaUrl = location.href;
    document.querySelectorAll(`[${MAPS_ATTR}]`).forEach(el => {
      el.removeAttribute(MAPS_ATTR);
      el.classList.remove('spx-hover');
    });
    setTimeout(escanear, 1000);
  }
}, 600);

inyectarCSS();
setTimeout(escanear, 1500);
setTimeout(escanear, 4000);
} // fin if hostname !== opsfleet (módulo Google Maps dashboard)

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO QC REVIEW
// SOLO actúa en: pos.opsfleet.us/pages/qc-package-review.php
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  // Verificar que estamos EXACTAMENTE en la página correcta
  const esPaginaPaquete = () =>
    location.hostname === 'pos.opsfleet.us' &&
    location.pathname === '/pages/qc-package-review.php';

  if (!esPaginaPaquete()) return;

  // CSS
  const style = document.createElement('style');
  style.textContent = `
    a.spx-qc-link {
      color: inherit;
      text-decoration: none;
      cursor: pointer !important;
      border-bottom: 1.5px solid transparent;
      transition: color 0.15s, border-color 0.15s;
      padding-bottom: 1px;
    }
    a.spx-qc-link:hover {
      color: #1677ff !important;
      border-bottom-color: #1677ff !important;
    }
  `;
  document.head.appendChild(style);

  // Regex: número + calle + estado abreviado + zip (ej: "6 Crandon Dr Apt A, ACUSHNET, MA 02743")
  const DIR_RE = /\d+\s+[A-Za-z0-9 ,.'#-]{5,80},\s*[A-Z]{2}\s+\d{5}/;

  function procesarDireccion() {
    if (document.querySelector('a.spx-qc-link')) return;

    // Buscar el span exacto que tiene el label "Address" dentro de qc-detail
    // La estructura es: span.text-muted "Address" + span con el valor
    let addressSpan = null;

    // Intento 1: buscar por el span label "Address" y tomar el siguiente span hermano
    for (const span of document.querySelectorAll('span.text-muted, span')) {
      if ((span.textContent || '').trim() === 'Address') {
        // El valor puede ser el siguiente hermano elemento
        let next = span.nextElementSibling;
        if (!next) {
          // O el padre tiene más hijos
          const parent = span.parentElement;
          if (parent) {
            const kids = [...parent.children];
            const idx = kids.indexOf(span);
            next = kids[idx + 1] || null;
          }
        }
        if (next) { addressSpan = next; break; }
      }
    }

    // Intento 2: buscar el span que tenga data-spx-maps (ya procesado por el módulo de Maps)
    if (!addressSpan) {
      addressSpan = document.querySelector('[data-spx-maps="activo"] span:not(.text-muted)');
    }

    // Intento 3: buscar cualquier nodo de texto que matchee el regex dentro de Package Data
    if (!addressSpan) {
      let packageData = null;
      for (const el of document.querySelectorAll('.card, .card-body, [class*="detail"]')) {
        if ((el.innerText || '').includes('Package Data')) { packageData = el; break; }
      }
      if (!packageData) return;

      const walker = document.createTreeWalker(packageData, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const txt = (node.textContent || '').trim();
          if (txt.length < 8) return NodeFilter.FILTER_SKIP;
          const p = node.parentElement;
          if (!p || p.closest('a.spx-qc-link')) return NodeFilter.FILTER_SKIP;
          if (['SCRIPT','STYLE','INPUT','TEXTAREA'].includes(p.tagName)) return NodeFilter.FILTER_SKIP;
          // Excluir nodos que sean solo labels (texto corto sin números)
          if (!/\d/.test(txt)) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let node;
      while ((node = walker.nextNode())) {
        if (DIR_RE.test(node.textContent || '')) {
          addressSpan = node.parentElement;
          break;
        }
      }
    }

    if (!addressSpan) return;

    // Obtener el texto completo del span (puede tener nodos hijos con partes de la dirección)
    const fullText = (addressSpan.innerText || addressSpan.textContent || '').trim();
    const m = fullText.match(DIR_RE);
    if (!m) return;

    const direccion = m[0].trim();

    // Limpiar el span y reemplazar su contenido con el link
    addressSpan.innerHTML = '';
    const link = document.createElement('a');
    link.className   = 'spx-qc-link';
    link.href        = '#';
    link.textContent = direccion;
    link.title       = 'Abrir en Google Maps';
    link.style.display = 'inline';
    link.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      window.open(
        `https://www.google.com/maps/search/?q=${encodeURIComponent(direccion)}`,
        '_blank'
      );
    });
    addressSpan.appendChild(link);
  }

  // Ejecutar cuando la página cargue
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(procesarDireccion, 800));
  } else {
    setTimeout(procesarDireccion, 800);
  }

  // Re-ejecutar si cambia el contenido (navegación entre paquetes)
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(procesarDireccion, 600);
  }).observe(document.body, {
    childList: true, subtree: true,
    attributes: false, characterData: false
  });
})();

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO ZOOM — lupitas dentro del visor POD de OpsFleet
// Selectores exactos: img#qcModalPhoto, div.qc-photo-stage, div#photoModal
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  if (location.hostname !== 'pos.opsfleet.us') return;
  if (!location.pathname.includes('qc-package-review')) return;

  // ── CSS de la barra ────────────────────────────────────────────────────────
  const st = document.createElement('style');
  st.textContent = `
    #spx-zoom-bar {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border-radius: 999px;
      padding: 5px 14px;
      z-index: 99999;
      pointer-events: all;
      user-select: none;
      white-space: nowrap;
    }
    .spx-zbtn {
      width: 28px; height: 28px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.25);
      background: rgba(255,255,255,0.08);
      color: #fff;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .spx-zbtn:hover { background: rgba(255,255,255,0.22); }
    .spx-zbtn svg { display: block; }
    #spx-zoom-pct {
      color: rgba(255,255,255,0.9);
      font: 500 12px/1 -apple-system, sans-serif;
      min-width: 38px;
      text-align: center;
    }
  `;
  document.head.appendChild(st);

  // ── SVGs de lupita ─────────────────────────────────────────────────────────
  const SVG_MINUS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>`;
  const SVG_PLUS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
  </svg>`;

  // ── Estado ─────────────────────────────────────────────────────────────────
  let zoom = 1, panX = 0, panY = 0;
  let dragging = false, dragStart = {};
  let img = null;
  let stage = null;
  let barInyectada = false;

  function applyTransform() {
    if (!img) return;
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    img.style.transformOrigin = 'center center';
    img.style.transition = dragging ? 'none' : 'transform 0.12s ease';
    const pct = document.getElementById('spx-zoom-pct');
    if (pct) pct.textContent = Math.round(zoom * 100) + '%';
  }

  function resetZoom() { zoom = 1; panX = 0; panY = 0; applyTransform(); }
  function doZoomIn()  { zoom = Math.min(zoom + 0.25, 5); applyTransform(); }
  function doZoomOut() { zoom = Math.max(zoom - 0.25, 0.5); applyTransform(); }

  // ── Inyectar barra en el visor ─────────────────────────────────────────────
  function inyectar() {
    // Selectores exactos del DOM de OpsFleet
    img   = document.getElementById('qcModalPhoto');
    stage = document.querySelector('.qc-photo-stage');

    if (!img || !stage) return false;

    // Evitar duplicar
    if (document.getElementById('spx-zoom-bar')) return true;

    // La stage necesita overflow visible y position relative para que la barra quede bien
    stage.style.setProperty('overflow', 'visible', 'important');
    stage.style.setProperty('position', 'relative', 'important');

    // Preparar imagen
    img.style.cursor = 'grab';
    img.draggable = false;
    img.style.setProperty('max-width', '100%', 'important');
    img.style.setProperty('max-height', '100%', 'important');
    img.style.setProperty('object-fit', 'contain', 'important');
    resetZoom();

    // Crear barra
    const bar = document.createElement('div');
    bar.id = 'spx-zoom-bar';
    bar.innerHTML = `
      <button class="spx-zbtn" id="spx-zout" title="Alejar">${SVG_MINUS}</button>
      <span id="spx-zoom-pct">100%</span>
      <button class="spx-zbtn" id="spx-zin" title="Acercar">${SVG_PLUS}</button>
    `;
    stage.appendChild(bar);
    bar.addEventListener('click', e => e.stopPropagation());

    // Botones
    document.getElementById('spx-zout').addEventListener('click', e => { e.stopPropagation(); doZoomOut(); });
    document.getElementById('spx-zin').addEventListener('click',  e => { e.stopPropagation(); doZoomIn(); });

    // Scroll del mouse = zoom
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      e.deltaY < 0 ? doZoomIn() : doZoomOut();
    }, { passive: false });

    // Drag para pan cuando hay zoom
    img.addEventListener('mousedown', e => {
      if (zoom <= 1) return;
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY, panX, panY };
      img.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panX = dragStart.panX + (e.clientX - dragStart.x);
      panY = dragStart.panY + (e.clientY - dragStart.y);
      applyTransform();
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      if (img) img.style.cursor = zoom > 1 ? 'grab' : 'default';
    });

    // Resetear zoom al navegar con flechas del teclado o botones ← →
    const onNav = () => setTimeout(resetZoom, 80);

    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onNav();
    });

    const prevBtn = document.getElementById('qcPrevPhoto');
    const nextBtn = document.getElementById('qcNextPhoto');
    if (prevBtn) prevBtn.addEventListener('click', onNav);
    if (nextBtn) nextBtn.addEventListener('click', onNav);

    barInyectada = true;
    return true;
  }

  // ── Limpiar cuando se cierra el modal ─────────────────────────────────────
  function limpiar() {
    const bar = document.getElementById('spx-zoom-bar');
    if (bar) bar.remove();
    if (stage) {
      stage.style.removeProperty('overflow');
    }
    barInyectada = false;
    img = null; stage = null;
    zoom = 1; panX = 0; panY = 0;
  }

  // ── Observer: detectar cuando el modal abre/cierra ─────────────────────────
  new MutationObserver(() => {
    const modal = document.getElementById('photoModal');

    if (!modal) return;

    // El modal de Bootstrap alterna display:block / display:none
    const visible = getComputedStyle(modal).display !== 'none';

    if (visible && !barInyectada) {
      // Pequeño delay para que la imagen esté en el DOM
      setTimeout(() => { if (!inyectar()) setTimeout(inyectar, 300); }, 80);
    }

    if (!visible && barInyectada) {
      limpiar();
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

  // Intento inicial (si el modal ya estaba abierto)
  setTimeout(inyectar, 800);

})();
