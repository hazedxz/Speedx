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
// MÓDULO GOOGLE MAPS
// ══════════════════════════════════════════════════════════════════════════════

const DIR_RE     = /\d+\s+[A-Za-z0-9 ,.'#-]{5,80}[A-Z]{2}\s+\d{5}/;
const EXCLUIR_RE = /\*{3,}|SPXPVD|batch|GAS_CAR|ELECTRIC/i;
const MAPS_ATTR  = 'data-spx-maps';

function inyectarCSS() {
  if (document.getElementById('spx-maps-css')) return;
  const s = document.createElement('style');
  s.id = 'spx-maps-css';
  s.textContent = `
    .spx-addr {
      cursor: pointer;
      display: inline;
      background-image: linear-gradient(90deg, #1677ff, #1677ff);
      background-size: 0% 1.5px;
      background-repeat: no-repeat;
      background-position: left bottom;
      padding-bottom: 1px;
      transition: background-size 0.2s ease, color 0.15s ease;
    }
    .spx-addr:hover {
      background-size: 100% 1.5px;
      color: #1677ff !important;
    }
    .spx-addr:active { opacity: 0.75; }
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

// Flag global para evitar que el mismo click abra Maps múltiples veces
// cuando hay varios listeners anidados en contenedores padre/hijo
let _mapsAbierto = false;

function procesarCelda(celda) {
  if (celda.getAttribute(MAPS_ATTR)) return;

  const dir = extraerDir(celda.innerText || celda.textContent || '');
  if (!dir) return;

  celda.setAttribute(MAPS_ATTR, dir);
  celda.style.cursor = 'pointer';

  celda.addEventListener('mouseenter', () => {
    if (!extraerDir(celda.innerText || '')) return;
    celda.style.color                 = '#1677ff';
    celda.style.textDecoration        = 'underline';
    celda.style.textDecorationColor   = '#1677ff';
    celda.style.textDecorationThickness = '1.5px';
    celda.style.textUnderlineOffset   = '2px';
    celda.style.transition            = 'color 0.15s';
  });

  celda.addEventListener('mouseleave', () => {
    celda.style.color          = '';
    celda.style.textDecoration = '';
  });

  celda.addEventListener('click', e => {
    // No interferir con botones, SVGs ni links dentro de la celda
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    if (e.target.tagName === 'SVG'    || e.target.closest('svg'))    return;
    if (e.target.tagName === 'A'      || e.target.closest('a'))      return;

    // Verificar que la dirección sigue visible
    const dirActual = extraerDir(celda.innerText || celda.textContent || '');
    if (!dirActual) return;

    // Evitar múltiples aperturas por el mismo click en elementos anidados
    if (_mapsAbierto) return;
    _mapsAbierto = true;
    setTimeout(() => { _mapsAbierto = false; }, 300);

    window.open(
      `https://www.google.com/maps/search/?q=${encodeURIComponent(dirActual)}`,
      '_blank'
    );
  });
}

function escanear() {
  const selectores = 'td, [class*="cell"], [class*="Cell"], [class*="address"], [class*="Address"]';
  for (const el of document.querySelectorAll(selectores)) {
    if (el.getAttribute(MAPS_ATTR)) {
      const txt = el.innerText || el.textContent || '';
      if (EXCLUIR_RE.test(txt) || !extraerDir(txt)) {
        el.style.color = '';
        el.style.textDecoration = '';
        el.style.cursor = '';
      }
      continue;
    }
    if (el.children.length > 5) continue;
    const txt = el.innerText || el.textContent || '';
    if (txt.length < 10 || txt.length > 300) continue;
    if (extraerDir(txt)) procesarCelda(el);
  }

  // Búsqueda adicional por walker
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
      el.style.color = '';
      el.style.textDecoration = '';
      el.style.cursor = '';
    });
    setTimeout(escanear, 1000);
  }
}, 600);

inyectarCSS();
setTimeout(escanear, 1500);
setTimeout(escanear, 4000);
