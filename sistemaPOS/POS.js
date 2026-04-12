let db = [];
let cart = [];
let currentMethod = "";
let currentStep = 0;
let config = null;
let editingOrderId = null; // Almacena el ID del pedido que se está editando
let originalOrderSnapshot = null; // Almacenará el estado inicial del pedido para comparar
let isLoadingDomicilio = false; // Bandera para detectar si estamos cargando un domicilio inicial
let costoDomicilioOriginal = 0; // Guardar el costo original del domicilio para respetarlo
let pedidosCargados = []; // Almacenar todos los pedidos para filtrado
let mesasCargadas = []; // Almacenar todas las mesas para filtrado

let timeoutInactividad = null;
let sistemaSuspendido = false;

// Cantidades en edición (preview) por cartId — permite actualizar totales mientras se escribe
const previewQtys = {};

// // Función para aplicar los colores desde config.json
async function cargarConfiguracion() {
  try {
    const res = await fetch("../config.json");
    const config = await res.json();

    // // Verificamos si existe el objeto "colores" en el JSON
    if (config.colores) {
      // // Recorremos cada propiedad (llave) dentro de "colores"
      Object.keys(config.colores).forEach((propiedad) => {
        const valor = config.colores[propiedad];

        // // Aplicamos el valor directamente al :root del CSS
        document.documentElement.style.setProperty(propiedad, valor);
      });
    }
  } catch (error) {
    console.error("Error al cargar los colores del config:", error);
  }
}

// // Llamar a la función al iniciar
cargarConfiguracion();

// --- FUNCIONES DE VALIDACIÓN DE INPUTS ---
function validarSoloLetras(input) {
  // Permite letras, espacios y acentos
  const valorLimpio = input.value.replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ\s]/g, "");
  input.value = valorLimpio;
}

/**
 * Formatea el nombre capitalizando la primera letra de cada palabra.
 * Ej: "jorge daniel" -> "Jorge Daniel"
 */
function formatNombreCapitalizado(input) {
  if (!input) return;
  const el = input;
  const original = el.value || "";

  // Detectar borrado (Backspace/Delete): si la longitud actual es menor
  // que la anterior, asumimos que el usuario está borrando y no
  // forzamos el capitalizado en ese evento para no bloquear el borrado.
  const prevLen = parseInt(el.dataset.prevLen || "0", 10);
  if (original.length < prevLen) {
    el.dataset.prevLen = original.length;
    el.dataset.prevValue = original;
    return;
  }

  // Normalizar múltiples espacios a uno solo
  const normalized = original.replace(/\s+/g, " ");
  if (normalized === "") {
    el.value = "";
    el.dataset.prevLen = 0;
    el.dataset.prevValue = "";
    return;
  }
  const hadTrailingSpace = /\s$/.test(original);
  const words = normalized.split(" ");
  const capitalized = words.map((w) =>
    w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "",
  );
  let newVal = capitalized.join(" ");
  if (hadTrailingSpace) newVal += " ";

  // Mantener posición del cursor
  const selStart =
    typeof el.selectionStart === "number" ? el.selectionStart : original.length;
  const wasAtEnd = selStart === original.length;

  el.value = newVal;
  el.dataset.prevLen = el.value.length;
  el.dataset.prevValue = el.value;

  if (wasAtEnd) {
    el.setSelectionRange(el.value.length, el.value.length);
  } else {
    const pos = Math.min(selStart, el.value.length);
    el.setSelectionRange(pos, pos);
  }
}

// Formatea una cadena numérica o número a formato COP con puntos de miles.
function formatNumberCOP(val) {
  const s = String(val || "");
  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function validarTelefono(input) {
  // Permite solo números y el signo +
  const valorLimpio = input.value.replace(/[^0-9+]/g, "");
  input.value = valorLimpio;
}

function validarSoloNumeros(input) {
  // Permite solo números
  const valorLimpio = input.value.replace(/[^0-9]/g, "");
  input.value = valorLimpio;
}

function setMesaNumber(numero) {
  const inputMesa = document.getElementById("val-mesa");
  if (inputMesa) {
    inputMesa.value = numero;
    checkInputStatus("val-mesa");
    updateTitle();
    updateButtonState();
    updateStepIndicator();
  }
}

function autoRellenarCliente() {
  const inputNombre = document.getElementById("val-nombre");
  const inputTel = document.getElementById("val-tel");
  if (inputNombre) {
    inputNombre.value = "Consumidor Final";
    checkInputStatus("val-nombre");
  }
  if (inputTel) {
    inputTel.value = "3000000000";
    checkInputStatus("val-tel");
  }
  updateTitle();
  updateButtonState();
  updateStepIndicator();
}

function mostrarCampoMonto() {
  const metodoPago = document.getElementById("val-metodo-pago").value;
  const containerMonto = document.getElementById("container-monto-efectivo");
  const cambioInfo = document.getElementById("cambio-info");
  const inputMonto = document.getElementById("val-monto-efectivo");

  if (metodoPago === "Efectivo" || metodoPago === "Efectivo/Transferencia") {
    containerMonto.style.display = "block";
  } else {
    containerMonto.style.display = "none";
    inputMonto.value = "";
    cambioInfo.style.display = "none";
  }
}

function calcularCambio() {
  const inputMonto = document.getElementById("val-monto-efectivo");
  const cambioInfo = document.getElementById("cambio-info");
  const monto = parseFloat((inputMonto.value || "0").replace(/\./g, "")) || 0;

  // Obtener el total mostrado en pantalla (ya incluye domicilio si aplica)
  const totalText = document.getElementById("order-total").textContent;
  const total = parseFloat(totalText.replace(/[^0-9]/g, "")) || 0;

  if (monto > 0) {
    const cambio = monto - total;

    if (cambio >= 0) {
      cambioInfo.innerHTML = `<span>Cambio:</span><span style="color: #2ecc71;">$ ${cambio.toLocaleString("es-CO")}</span>`;
      cambioInfo.style.display = "flex";
    } else {
      cambioInfo.innerHTML = `<span>Falta:</span><span style="color: #e74c3c;">-$ ${Math.abs(cambio).toLocaleString("es-CO")}</span>`;
      cambioInfo.style.display = "flex";
    }
  } else {
    cambioInfo.style.display = "none";
  }
}

/**
 * Formatea el valor del input a moneda COP (puntos de miles) mientras se escribe.
 * @param {HTMLInputElement} input
 */
function formatearMontoColombiano(input) {
  // 1. Obtener solo los números del valor actual
  let valor = input.value.replace(/\D/g, "");

  // 2. Formatear con puntos cada 3 dígitos (COP)
  if (valor) {
    valor = new Number(valor).toLocaleString("es-CO").replace(/,/g, ".");
  }

  // 3. Asignar el valor formateado de vuelta al input
  input.value = valor;

  // 4. Actualizar cálculos inmediatamente
  if (input.id === "val-costo-domicilio") {
    actualizarTotalesConDomicilio();
  } else if (input.id === "val-monto-efectivo") {
    calcularCambio();
  }
}

// --- FUNCIONES DEL SPINNER ---
function showSpinner(text = "Cargando...") {
  const overlay = document.getElementById("spinner-overlay");
  const textEl = document.getElementById("spinner-text");
  if (overlay) {
    textEl.textContent = text;
    overlay.classList.add("show");
  }
}

function hideSpinner() {
  const overlay = document.getElementById("spinner-overlay");
  if (overlay) {
    overlay.classList.remove("show");
  }
}

// --- FUNCIONES DEL INDICADOR DE SIGUIENTE PASO ---
function updateStepIndicator() {
  const indicator = document.getElementById("step-indicator");
  const stepText = document.getElementById("step-text");

  // Lógica para determinar qué paso mostrar
  const hasProducts = cart.length > 0;
  const hasMethod = currentMethod !== "";
  const fieldsContainer = document.getElementById("fields-container");
  const hasFieldsContent =
    fieldsContainer &&
    fieldsContainer.innerHTML.trim() !== "" &&
    !fieldsContainer.innerHTML.includes("Seleccione un servicio");

  // Validar que los inputs requeridos estén llenos
  const inputNombre = document.getElementById("val-nombre")?.value.trim();
  const inputTel = document.getElementById("val-tel")?.value.trim();
  const inputMesa = document.getElementById("val-mesa")?.value.trim();
  const inputGoogleMaps = document
    .getElementById("val-google-maps")
    ?.value.trim();

  let allFieldsFilled = inputNombre && inputTel;
  if (currentMethod === "Mesa") {
    allFieldsFilled = inputNombre && inputTel && inputMesa;
  } else if (currentMethod === "Domicilio") {
    allFieldsFilled = inputNombre && inputTel && inputGoogleMaps;
  }

  // Paso 1: Mostrar indicador si no hay productos
  if (!hasProducts) {
    stepText.textContent = "Agrega productos";
    indicator.classList.add("show");
    return;
  }

  // Paso 2: Mostrar indicador si no hay método seleccionado
  if (!hasMethod) {
    stepText.textContent = "Selecciona un servicio";
    indicator.classList.add("show");
    return;
  }

  // Paso 3: Mostrar indicador si los campos no están completos
  if (hasMethod && !allFieldsFilled) {
    stepText.textContent = "Completa los datos";
    indicator.classList.add("show");
    return;
  }

  // Paso 4: Mostrar indicador si todos los datos están completos
  if (hasMethod && allFieldsFilled) {
    stepText.textContent = "Termina tu pedido";
    indicator.classList.add("show");
    return;
  }

  // Si llegamos aquí, algo está mal
  indicator.classList.remove("show");
}

// --- FUNCIÓN PARA IR AL SIGUIENTE PASO ---
function goNextStep() {
  const hasProducts = cart.length > 0;
  const hasMethod = currentMethod !== "";
  const inputNombre = document.getElementById("val-nombre")?.value.trim();
  const inputTel = document.getElementById("val-tel")?.value.trim();
  const inputMesa = document.getElementById("val-mesa")?.value.trim();
  const inputGoogleMaps = document
    .getElementById("val-google-maps")
    ?.value.trim();

  let allFieldsFilled = inputNombre && inputTel;
  if (currentMethod === "Mesa") {
    allFieldsFilled = inputNombre && inputTel && inputMesa;
  } else if (currentMethod === "Domicilio") {
    allFieldsFilled = inputNombre && inputTel && inputGoogleMaps;
  }

  // Si no hay productos, no hacer nada
  if (!hasProducts) {
    goStep(1);
    return;
  }

  // Si hay productos pero no hay servicio, ir a step 2 (servicios y datos)
  if (hasProducts && !hasMethod) {
    goStep(2);
    return;
  }

  // Si hay método pero datos incompletos, ir a step 3 (completa datos)
  if (hasMethod && !allFieldsFilled) {
    goStep(2);
    return;
  }

  // Si todos los datos están completos, ir a step 3 (enviar pedido)
  if (hasMethod && allFieldsFilled) {
    goStep(3);
    return;
  }
}

async function init() {
  // Iniciar mostrando Carta (paso 1) por defecto
  goStep(1);

  showSpinner();

  try {
    const response = await fetch("../config.json");
    config = await response.json();

    // 1. CARGAR PRODUCTOS DESDE LA API DE PRODUCTOS
    const pRes = await fetch(config.apiUrls.productos);
    const data = await pRes.json();
    db = data.productos || data;

    renderCats();
    renderItems(db);
    resetInactivityTimer();
    hideSpinner();
  } catch (err) {
    hideSpinner();
    console.error("Error inicializando:", err);
  }
}

// --- FUNCIONES DE FILTRADO Y VISTAS ---

async function showMesas() {
  goStep(2);
  const list = document.getElementById("mesas-list");
  const searchInput = document.getElementById("search-mesas");
  if (searchInput) {
    searchInput.value = ""; // Limpiar búsqueda
    const clearBtn = document.getElementById("clear-search-mesas");
    if (clearBtn) clearBtn.style.display = "none";
  }

  document.getElementById("service-content").style.display = "none";
  document.getElementById("view-pedidos").classList.remove("active");
  document.getElementById("view-mesas").classList.add("active");

  showSpinner();

  const res = await fetch(config.apiUrls.reciboBaseDatos);
  const data = await res.json();
  const activas = data
    .filter((item) => item.mesasActivas === true || item.q === true)
    .sort((a, b) => Number(a.mesa || 0) - Number(b.mesa || 0));

  hideSpinner();

  // Almacenar todas las mesas para el filtrado
  mesasCargadas = activas;

  // Renderizar las mesas
  renderizarMesas(activas);
}

function filtrarMesas() {
  const searchInput = document.getElementById("search-mesas");
  const query = (searchInput.value || "").toLowerCase().trim();

  if (!query) {
    // Si no hay búsqueda, mostrar todas
    renderizarMesas(mesasCargadas);
    return;
  }

  // Filtrar por nombre o número de mesa
  const filtrados = mesasCargadas.filter(
    (m) =>
      (m.nombre || "").toLowerCase().includes(query) ||
      (m.mesa || "").toString().includes(query),
  );

  renderizarMesas(filtrados);
}

function renderizarMesas(mesasAMostrar) {
  const list = document.getElementById("mesas-list");

  list.innerHTML = mesasAMostrar.length
    ? mesasAMostrar
        .map((m) => {
          // En esta lista siempre son mesas
          const badge = `<span class="badge-metodo badge-mesa">Mesa ${m.mesa}</span>`;

          // Convertimos el objeto a String para el botón de editar
          const mString = JSON.stringify(m).replace(/"/g, "&quot;");

          return `
            <div class="pedido-card">
                <div class="pedido-header" onclick="this.parentElement.classList.toggle('abierto')">
                    <div class="header-info">
                        ${badge}
                        <div class="header-top">
                            <span class="pedido-id">${m.numeroFactura}</span>
                        </div>
                        <strong class="pedido-nombre">${m.nombre || "Sin nombre"}</strong>
                    </div>
                    <div class="header-precio">
                        <div class="pedido-hora">${m.hora || ""} <i class="fas fa-chevron-down arrow-icon"></i></div>
                        <span class="pedido-total">$${Number(m.totalPagar).toLocaleString("es-CO")}</span>
                    </div>
                </div>
                
                <div class="pedido-detalle">
                    <div class="detalle-container">
                        
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Cel:</span>
                                <strong><i class="fas fa-phone"></i> ${m.telefono || "0"}</strong>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Pago:</span>
                                <strong><i class="fas fa-wallet"></i> ${m.metodoPago || "Pendiente"}</strong>
                            </div>
                        </div>

                        <div class="info-productos">
                            <strong class="productos-title">Producto(s) de la Mesa</strong>
                            <pre class="productos-lista">${m.productos}</pre>
                        </div>

                        ${
                          m.observaciones
                            ? `
                        <div class="info-notas">
                            <strong>Notas:</strong> ${m.observaciones}
                        </div>`
                            : ""
                        }

                        <button class="btn-edit" onclick="editExistingOrder(${mString})">
                            <i class="fas fa-external-link-alt"></i> EDITAR MESA ${m.mesa}
                        </button>
                    </div>
                </div>
            </div>`;
        })
        .join("")
    : "<p style='text-align:center; padding:20px; color:#666;'>No hay mesas activas.</p>";
}

function filtrarPedidos() {
  const searchInput = document.getElementById("search-pedidos");
  const query = (searchInput.value || "").toLowerCase().trim();
  const list = document.getElementById("pedidos-list");

  if (!query) {
    // Si no hay búsqueda, mostrar todos
    renderizarPedidos(pedidosCargados);
    return;
  }

  // Filtrar por nombre o número de factura
  const filtrados = pedidosCargados.filter(
    (p) =>
      p.nombre.toLowerCase().includes(query) ||
      p.numeroFactura.toLowerCase().includes(query),
  );

  renderizarPedidos(filtrados);
}

function onSearchPedidosInput() {
  const input = document.getElementById("search-pedidos");
  const clearBtn = document.getElementById("clear-search-pedidos");
  if (clearBtn)
    clearBtn.style.display =
      input && input.value && input.value.length ? "block" : "none";
  filtrarPedidos();
}

function clearSearchPedidos() {
  const input = document.getElementById("search-pedidos");
  if (input) input.value = "";
  filtrarPedidos();
  const clearBtn = document.getElementById("clear-search-pedidos");
  if (clearBtn) clearBtn.style.display = "none";
  if (input) input.focus();
}

function onSearchMesasInput() {
  const input = document.getElementById("search-mesas");
  const clearBtn = document.getElementById("clear-search-mesas");
  if (clearBtn)
    clearBtn.style.display =
      input && input.value && input.value.length ? "block" : "none";
  filtrarMesas();
}

function clearSearchMesas() {
  const input = document.getElementById("search-mesas");
  if (input) input.value = "";
  filtrarMesas();
  const clearBtn = document.getElementById("clear-search-mesas");
  if (clearBtn) clearBtn.style.display = "none";
  if (input) input.focus();
}

function renderizarPedidos(pedidosAMostrar) {
  const list = document.getElementById("pedidos-list");

  // Obtener fechas de hoy y ayer
  const hoyDate = new Date();
  const d0 = String(hoyDate.getDate()).padStart(2, "0");
  const m0 = String(hoyDate.getMonth() + 1).padStart(2, "0");
  const y0 = hoyDate.getFullYear();
  const fechaHoy = `${d0}/${m0}/${y0}`;

  const ayerDate = new Date();
  ayerDate.setDate(ayerDate.getDate() - 1);
  const d1 = String(ayerDate.getDate()).padStart(2, "0");
  const m1 = String(ayerDate.getMonth() + 1).padStart(2, "0");
  const y1 = ayerDate.getFullYear();
  const fechaAyer = `${d1}/${m1}/${y1}`;

  // Función para crear tarjeta HTML
  const crearTarjetaHTML = (p) => {
    let badge = `<span class="badge-metodo badge-recoger">Recoger</span>`;
    if (p.direccion)
      badge = `<span class="badge-metodo badge-domicilio">Domicilio</span>`;
    else if (p.mesa !== "" && p.mesa !== undefined)
      badge = `<span class="badge-metodo badge-mesa">Mesa ${p.mesa}</span>`;

    const pString = JSON.stringify(p).replace(/"/g, "&quot;");

    const lateralDerecho = `
            <div class="direccion-lateral">
                ${
                  Number(p.costoDomicilio) > 0
                    ? `
                    <div class="info-domicilio-valor">
                        <span class="info-label">Envío:</span>
                        <strong><i class="fas fa-motorcycle"></i> $${Number(p.costoDomicilio).toLocaleString()}</strong>
                    </div>
                `
                    : ""
                }
                ${
                  p.ubicacionGoogleMaps
                    ? `
                    <a href="${p.ubicacionGoogleMaps}" target="_blank" class="link-mapa">
                        <i class="fas fa-map-marker-alt"></i>Ver Mapa</a>
                `
                    : ""
                }
            </div>
        `;

    return `
            <div class="pedido-card">
                <div class="pedido-header" onclick="this.parentElement.classList.toggle('abierto')">
                    <div class="header-info">
                        ${badge}
                        <div class="header-top">
                            <span class="pedido-id">${p.numeroFactura}</span>
                        </div>
                        <strong class="pedido-nombre">${p.nombre}</strong>
                    </div>
                    <div class="header-precio">
                        <div class="pedido-hora">${p.hora} <i class="fas fa-chevron-down arrow-icon"></i></div>
                        <span class="pedido-total">$${Number(p.totalPagar).toLocaleString()}</span>
                    </div>
                </div>
                <div class="pedido-detalle">
                    <div class="detalle-container">
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Cel:</span>
                                <strong><i class="fas fa-phone"></i> ${p.telefono || "0"}</strong>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Pago:</span>
                                <strong><i class="fas fa-wallet"></i> ${p.metodoPago || "No definido"}</strong>
                            </div>
                        </div>
                        ${
                          p.direccion
                            ? `
                        <div class="info-direccion">
                            <div class="direccion-header">
                                <div class="direccion-texto">
                                    <span class="info-label">Dirección de entrega:</span>
                                    <strong>${p.direccion}</strong>
                                    ${p.puntoReferencia ? `<small>REFERENCIA: ${p.puntoReferencia}</small>` : ""}
                                </div>
                                ${lateralDerecho}
                            </div>
                        </div>`
                            : ""
                        }
                        <div class="info-productos">
                            <strong class="productos-title">Productos</strong>
                            <pre class="productos-lista">${p.productos}</pre>
                        </div>
                        <div class="acciones-footer">
                            <button class="btn-edit" onclick="editExistingOrder(${pString})">
                                <i class="fas fa-edit"></i> EDITAR
                            </button>
                            <button class="btn-print" onclick='imprimirFacturaPOS(${pString})'>
                                <i class="fas fa-print"></i> VER FACTURA
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
  };

  if (pedidosAMostrar.length === 0) {
    list.innerHTML = `<p style="text-align:center; padding:30px; color:#555;">No hay resultados.</p>`;
    return;
  }

  // Separar por fecha
  const pedidosHoy = pedidosAMostrar
    .filter((p) => p.fecha === fechaHoy)
    .reverse();
  const pedidosAyer = pedidosAMostrar
    .filter((p) => p.fecha === fechaAyer)
    .reverse();

  let htmlAcumulado = "";

  if (pedidosHoy.length > 0) {
    htmlAcumulado += `<div class="divisor-fecha">HOY (${fechaHoy})</div>`;
    htmlAcumulado += pedidosHoy.map((p) => crearTarjetaHTML(p)).join("");
  }

  if (pedidosAyer.length > 0) {
    htmlAcumulado += `<div class="divisor-fecha">AYER (${fechaAyer})</div>`;
    htmlAcumulado += pedidosAyer.map((p) => crearTarjetaHTML(p)).join("");
  }

  list.innerHTML = htmlAcumulado;
}

async function showPedidos() {
  goStep(2);
  const list = document.getElementById("pedidos-list");
  const searchInput = document.getElementById("search-pedidos");
  if (searchInput) {
    searchInput.value = ""; // Limpiar búsqueda
    const clearBtn = document.getElementById("clear-search-pedidos");
    if (clearBtn) clearBtn.style.display = "none";
  }

  document.getElementById("service-content").style.display = "none";
  document.getElementById("view-mesas").classList.remove("active");
  document.getElementById("view-pedidos").classList.add("active");

  showSpinner();

  try {
    const res = await fetch(config.apiUrls.reciboBaseDatos);
    const data = await res.json();

    // 1. Obtener fecha de HOY
    const hoyDate = new Date();
    const d0 = String(hoyDate.getDate()).padStart(2, "0");
    const m0 = String(hoyDate.getMonth() + 1).padStart(2, "0");
    const y0 = hoyDate.getFullYear();
    const fechaHoy = `${d0}/${m0}/${y0}`;

    // 2. Obtener fecha de AYER
    const ayerDate = new Date();
    ayerDate.setDate(ayerDate.getDate() - 1);
    const d1 = String(ayerDate.getDate()).padStart(2, "0");
    const m1 = String(ayerDate.getMonth() + 1).padStart(2, "0");
    const y1 = ayerDate.getFullYear();
    const fechaAyer = `${d1}/${m1}/${y1}`;

    // 3. Filtrar pedidos que coincidan con Hoy O con Ayer
    const filtrados = data.filter(
      (p) => p.fecha === fechaHoy || p.fecha === fechaAyer,
    );

    // // Se filtran por separado para poder crear los divisores
    const pedidosHoy = data.filter((p) => p.fecha === fechaHoy).reverse(); // // Filtrado Hoy
    const pedidosAyer = data.filter((p) => p.fecha === fechaAyer).reverse(); // // Filtrado Ayer

    hideSpinner();
    if (pedidosHoy.length === 0 && pedidosAyer.length === 0) {
      list.innerHTML = `<p style="text-align:center; padding:30px; color:#555;">No hay pedidos de hoy ni de ayer.</p>`;
      return;
    }

    // Almacenar todos los pedidos para el filtrado
    pedidosCargados = filtrados;

    // Renderizar los pedidos
    renderizarPedidos(filtrados);
  } catch (err) {
    hideSpinner();
    console.error("Error:", err);
    list.innerHTML = "<p>Error al cargar historial.</p>";
  }
}

function startNewOrder() {
  editingOrderId = null;
  cart = [];
  isLoadingDomicilio = false;
  costoDomicilioOriginal = 0;

  // Mostrar el contenedor de servicios y ocultar las listas de Mesas/Pedidos
  document.getElementById("service-content").style.display = "block";
  document.getElementById("view-mesas").classList.remove("active");
  document.getElementById("view-pedidos").classList.remove("active");

  // --- NUEVO: QUITAR SELECCIÓN DE BOTONES ---
  document.querySelectorAll(".btn-method").forEach((btn) => {
    btn.classList.remove("active");
  });

  // --- NUEVO: LIMPIAR EL CONTENEDOR DE INPUTS ---
  const fieldsContainer = document.getElementById("fields-container");
  if (fieldsContainer) {
    fieldsContainer.innerHTML =
      '<p style="text-align:center; color:#888; padding:20px;">Seleccione un servicio para continuar</p>';
  }

  // Resetear selector de pago
  const metodoPago = document.getElementById("val-metodo-pago");
  if (metodoPago) metodoPago.selectedIndex = 0;

  // ❌ ELIMINA ESTAS LÍNEAS QUE ESTABAN AL FINAL:
  // const btnMesa = document.querySelector('.btn-method[onclick*="Mesa"]');
  // setMethod(btnMesa, "Mesa");

  updateUI();
  updateTitle();
  updateButtonState();
  hideEditModeBanner();

  const btnCancel = document.getElementById("btn-cancel-edit");
  if (btnCancel) btnCancel.style.display = "none";

  showColumn(1);
  showToast("Nuevo pedido: seleccione un servicio");
}

// --- LÓGICA DE ENVÍO Y UI ---

async function finish() {
  // 1. VALIDACIÓN DE SERVICIO
  if (!currentMethod) {
    alert("⚠️ Selecciona un servicio (Mesa, Recoger o Domicilio)");
    document
      .querySelector(".btn-methods-group")
      ?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  // VALIDACIÓN DE CARRITO
  if (!cart.length) return alert("La comanda está vacía");

  // OBTENER VALORES DE LOS INPUTS
  const inputNombre = document.getElementById("val-nombre")?.value.trim() || "";
  const inputTel = document.getElementById("val-tel")?.value.trim() || "";
  const inputMesa = document.getElementById("val-mesa")?.value.trim() || "";
  const inputDireccion =
    document.getElementById("val-direccion")?.value.trim() || "";
  const inputGmaps =
    document.getElementById("val-google-maps")?.value.trim() || "";
  const metodoPago = document.getElementById("val-metodo-pago")?.value;

  // 2. VALIDACIONES ESTRICTAS SEGÚN EL MÉTODO
  if (currentMethod === "Mesa") {
    if (!inputNombre || !inputTel || !inputMesa) {
      return alert("⚠️ MESA: Debe llenar: Nombre, Teléfono y Número de Mesa.");
    }
  } else if (currentMethod === "Recoger en tienda") {
    if (!inputNombre || !inputTel) {
      return alert("⚠️ RECOGER: Debe llenar: Nombre y Teléfono.");
    }
  } else if (currentMethod === "Domicilio") {
    if (!inputNombre || !inputTel || !inputDireccion || !inputGmaps) {
      return alert(
        "⚠️ DOMICILIO: Debe llenar: Nombre, Teléfono, Dirección y Ubicación (Maps).",
      );
    }
  }

  if (!metodoPago) return alert("Seleccione un método de pago");

  // 3. PROCESAMIENTO DE LINK DE GOOGLE MAPS (NUEVO)
  // Si son coordenadas (lat, lng), las convertimos en un link real para la hoja de cálculo
  let gmapsFinalLink = inputGmaps;
  if (inputGmaps && !inputGmaps.startsWith("http")) {
    const coords = inputGmaps.split(",");
    if (coords.length === 2) {
      gmapsFinalLink = `https://www.google.com/maps?q=${coords[0].trim()},${coords[1].trim()}`;
    }
  }

  // 4. CÁLCULO DE TOTALES
  const totalProductos = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  // Si no es domicilio, el costo de domicilio es 0
  const costoEnvioParaAPI =
    currentMethod === "Domicilio" ? costoDomicilioActual : 0;
  const totalPagarFinal = totalProductos + costoEnvioParaAPI;

  const fecha = new Date();
  let facturaId = editingOrderId;

  if (!facturaId) {
    const nombreCodigo = inputNombre
      .substring(0, 3)
      .toUpperCase()
      .padEnd(3, "X");
    const telefonoCodigo = inputTel.slice(-3).padStart(3, "0");
    facturaId = `#${nombreCodigo}${telefonoCodigo}${fecha.getFullYear().toString().slice(-2)}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}${String(fecha.getHours()).padStart(2, "0")}${String(fecha.getMinutes()).padStart(2, "0")}${String(fecha.getSeconds()).padStart(2, "0")}`;
  }

  // 5. CONSTRUCCIÓN DEL PAYLOAD PARA LA API (Alineado con tu doPost de Apps Script)

  const d = fecha.getDate().toString().padStart(2, "0");
  const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const a = fecha.getFullYear().toString().slice(-2); // Toma los últimos 2 dígitos (26)

  const payload = {
    tipoEntrega: currentMethod,
    numeroFactura: facturaId,
    fecha: `${d}/${m}/${a}`,
    hora: fecha.toLocaleTimeString("it-IT"),
    nombre: inputNombre,
    telefono: inputTel,
    mesa: inputMesa || "",
    direccion: inputDireccion,
    puntoReferencia:
      document.getElementById("val-referencia")?.value.trim() || "",
    productos: cart
      .map(
        (i) =>
          `${i.nombre} x${i.qty} - $${i.precio}${i.nota ? ` (${i.nota})` : ""}`,
      )
      .join("\n"),
    totalProductos: totalProductos,
    costoDomicilio: costoEnvioParaAPI, // <--- SE ENVÍA A LA CELDA L
    totalPagar: totalPagarFinal, // <--- SE ENVÍA A LA CELDA M (Suma total)
    metodoPago: metodoPago,
    ubicacionGoogleMaps: gmapsFinalLink, // <--- ENVÍA EL LINK GENERADO A LA CELDA O
    observaciones:
      document.getElementById("val-observaciones")?.value.trim() || "",
    mesasActivas: currentMethod === "Mesa",
  };

  const btn = document.querySelector(".btn-action");
  btn.disabled = true;
  btn.innerText = editingOrderId ? "ACTUALIZANDO..." : "REGISTRANDO...";

  showSpinner();

  try {
    await fetch(config.apiUrls.envioBaseDatos, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });

    hideSpinner();

    // 1. PRIMERA ALERTA: Notificación de éxito
    alert(editingOrderId ? "✅ ¡Pedido actualizado!" : "🚀 ¡Pedido enviado!");

    // 2. SEGUNDA ALERTA: Pregunta de impresión
    if (confirm("¿Desea imprimir la factura ahora?")) {
      // Llamamos a la nueva función que pusiste al final
      ejecutarImpresionSilenciosa(payload);
    } else {
      // Si no quiere imprimir, solo refrescamos el POS
      location.reload();
    }
  } catch (err) {
    hideSpinner();
    alert("❌ Error de conexión.");
    btn.disabled = false;
    btn.innerText = editingOrderId ? "ACTUALIZAR PEDIDO" : "ENVIAR PEDIDO";
  }
}

// --- FUNCIÓN PARA CERRAR MESA ---
async function closeMesa() {
  if (!editingOrderId) {
    alert("No hay mesa abierta para cerrar");
    return;
  }

  if (
    !confirm(
      "¿Está seguro de que desea CERRAR esta mesa? No podrá editarla de nuevo.",
    )
  ) {
    return;
  }

  const btn = document.getElementById("btn-close-mesa");
  btn.disabled = true;
  btn.innerText = "CERRANDO...";

  showSpinner();

  try {
    const payload = {
      action: "closeMesa",
      numeroFactura: editingOrderId,
    };

    await fetch(config.apiUrls.envioBaseDatos, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });

    hideSpinner();
    alert("✅ ¡Mesa cerrada correctamente!");

    // Limpiar banner y reset
    const banner = document.getElementById("edit-mode-banner");
    if (banner) {
      banner.classList.remove("show", "active");
      banner.style.display = "none";
    }
    document.querySelector(".main-grid")?.classList.remove("edit-mode");
    editingOrderId = null;

    location.reload();
  } catch (err) {
    hideSpinner();
    alert("❌ Error al cerrar la mesa.");
    btn.disabled = false;
    btn.innerText = "🔐 CERRAR MESA";
  }
}

// --- FUNCIONES DE SOPORTE (TU LÓGICA ORIGINAL) ---

function updateButtonState() {
  const btn = document.querySelector(".btn-action");
  if (!btn) return;

  if (editingOrderId) {
    btn.innerText = "ACTUALIZAR PEDIDO";
    // Si aún no se ha creado el snapshot original (por ejemplo, estamos cargando
    // la ubicación inicial), mantenemos el botón deshabilitado hasta entonces.
    if (!originalOrderSnapshot) {
      btn.disabled = true;
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
      btn.style.background = "#ff6b35";
      return;
    }

    // Creamos la "foto" del estado actual
    const currentSnapshot = JSON.stringify({
      nombre: (document.getElementById("val-nombre")?.value || "").trim(),
      tel: (document.getElementById("val-tel")?.value || "").trim(),
      mesa: (document.getElementById("val-mesa")?.value || "").trim(),
      direccion: (document.getElementById("val-direccion")?.value || "").trim(),
      obs: (document.getElementById("val-observaciones")?.value || "").trim(),
      pago: document.getElementById("val-metodo-pago")?.value || "",
      referencia: (
        document.getElementById("val-referencia")?.value || ""
      ).trim(),
      metodo: currentMethod,
      // Incluir ubicacion y costo actual para detectar cambios en domicilios
      googleMaps: (
        document.getElementById("val-google-maps")?.value || ""
      ).trim(),
      costoDomicilio:
        typeof costoDomicilioActual !== "undefined" ? costoDomicilioActual : 0,
      items: cart.map((item) => ({
        id: item.id,
        qty: item.qty,
        nota: item.nota,
      })),
    });

    // Solo se habilita si hay cambios REALES
    const hayCambios = currentSnapshot !== originalOrderSnapshot;

    btn.disabled = !hayCambios;
    btn.style.opacity = hayCambios ? "1" : "0.4";
    btn.style.cursor = hayCambios ? "pointer" : "not-allowed";
    btn.style.background = "#ff6b35";
  } else {
    // Lógica para pedido nuevo
    btn.innerText = "ENVIAR PEDIDO";
    const tieneItems = cart.length > 0;
    btn.disabled = !tieneItems;
    btn.style.opacity = tieneItems ? "1" : "0.5";
  }
}
function cancelEdit() {
  if (confirm("¿Descartar cambios, limpiar campos y volver al inicio?")) {
    forceResetToNew(); // <--- Aquí ocurre toda la magia de limpieza
    showToast("Formulario limpio y listo");
  }
}

function forceResetToNew() {
  // 1. Limpieza de variables lógicas
  editingOrderId = null;
  originalOrderSnapshot = null;
  cart = [];
  isLoadingDomicilio = false;
  costoDomicilioOriginal = 0;

  // 2. Limpieza de todos los inputs (Nombre, Tel, etc.)
  const campos = [
    "val-nombre",
    "val-tel",
    "val-mesa",
    "val-direccion",
    "val-referencia",
    "val-google-maps",
    "val-observaciones",
    "val-monto-efectivo",
  ];
  campos.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });

  const payment = document.getElementById("val-metodo-pago");
  if (payment) payment.selectedIndex = 0;

  // Ocultar contenedor de monto y cambio
  const containerMonto = document.getElementById("container-monto-efectivo");
  if (containerMonto) containerMonto.style.display = "none";
  const cambioInfo = document.getElementById("cambio-info");
  if (cambioInfo) cambioInfo.style.display = "none";

  // 3. Limpiar Banner de edición y BOTÓN CERRAR MESA (Cambio Clave)
  const banner = document.getElementById("edit-mode-banner");
  if (banner) {
    banner.classList.remove("show", "active");
    banner.style.display = "none";
  }

  // Remover clase edit-mode del grid para que margin-top vuelva a 60px
  document.querySelector(".main-grid")?.classList.remove("edit-mode");

  // Aquí ocultamos el botón de cerrar mesa
  const btnCloseMesa = document.getElementById("btn-close-mesa");
  if (btnCloseMesa) btnCloseMesa.style.display = "none";

  const btnCancel = document.getElementById("btn-cancel-edit");
  if (btnCancel) btnCancel.style.display = "none";

  // 4. Resetear Servicios y Métodos
  document
    .querySelectorAll(".btn-method")
    .forEach((btn) => btn.classList.remove("active"));
  const serviceContent = document.getElementById("service-content");
  if (serviceContent) serviceContent.style.display = "none";
  currentMethod = "";

  // 5. Actualizar UI y VOLVER A CARTA (Cambio Clave)
  updateTitle();
  updateUI();
  updateButtonState();

  // goStep(1) activa visualmente el tab inferior y muestra la columna de productos
  goStep(1);

  // 6. Sincronización Menú Lateral y Buscador
  document
    .querySelectorAll(".nav-link")
    .forEach((btn) => btn.classList.remove("active"));
  const navNuevo = document.querySelector(".nav-link[onclick*='nuevo']");
  if (navNuevo) navNuevo.classList.add("active");

  // Limpiar buscador para que vea toda la carta
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.value = "";
    renderItems(db);
  }

  closeLists();
}

// Función para extraer coordenadas de diferentes formatos
function extractCoordinates(input) {
  if (!input) return null;

  // Formato 1: URL con @ (https://www.google.com/maps/place/...@10.3792124,-75.4804932,...)
  const atMatch = input.match(/@([\d.-]+),([\d.-]+)/);
  if (atMatch) return `${atMatch[1]},${atMatch[2]}`;

  // Formato 2: URL con ?q=lat,lng (https://www.google.com/maps?q=10.377106,-75.474624)
  const qMatch = input.match(/[?&]q=([\d.-]+),([\d.-]+)/);
  if (qMatch) return `${qMatch[1]},${qMatch[2]}`;

  // Formato 3: Coordenadas directas con paréntesis (10.379112, -75.475697) o ((10.379112, -75.475697))
  const parenMatch = input.match(/[\(]*([\d.-]+)\s*,\s*([\d.-]+)[\)]*$/);
  if (parenMatch) return `${parenMatch[1]},${parenMatch[2]}`;

  // Formato 4: Coordenadas con espacios variables (10.379112  -75.475697)
  const spaceMatch = input.match(/([\d.-]+)\s{2,}([\d.-]+)$/);
  if (spaceMatch) return `${spaceMatch[1]},${spaceMatch[2]}`;

  // Formato 5: Coordenadas simples separadas por coma (10.379112, -75.475697)
  const simpleMatch = input.match(/([\d.-]+)\s*,\s*([\d.-]+)/);
  if (simpleMatch) return `${simpleMatch[1]},${simpleMatch[2]}`;

  return null;
}

function setMethod(btn, method) {
  const container = document.getElementById("fields-container");

  if (btn.classList.contains("active")) {
    btn.classList.remove("active");
    container.innerHTML = "";
    currentMethod = "";
    costoDomicilioActual = 0;
    updateTitle();
    updateUI();
    return;
  }

  const nombreTemp = document.getElementById("val-nombre")?.value || "";
  const telTemp = document.getElementById("val-tel")?.value || "";
  const mesaTemp = document.getElementById("val-mesa")?.value || "";

  document
    .querySelectorAll(".btn-method")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  currentMethod = method;

  // --- FUNCIÓN PARA GENERAR INPUTS CON BOTÓN DINÁMICO ---
  const crearInputConAccion = (
    id,
    placeholder,
    type = "text",
    oninput = "",
  ) => {
    const commands = `checkInputStatus('${id}')${oninput ? "; " + oninput : ""}; updateButtonState()`;
    return `
        <div class="input-wrapper-pro">
          <input type="${type}" id="${id}" class="input-pro input-compact" 
               placeholder="${placeholder}" 
               oninput="${commands}">
          <span class="btn-input-helper" id="helper-${id}" onclick="handleInputHelper('${id}')">⎘</span>
        </div>`;
  };

  let html = `
    <button type="button" onclick="autoRellenarCliente()"
        style="width:100%; margin-bottom:6px; padding:8px 12px; background:transparent; color:#888; border:1px dashed #555; border-radius:8px; cursor:pointer; font-size:0.78rem; letter-spacing:0.5px;">
        Autocompletar
    </button>
  `;

  html += crearInputConAccion(
    "val-nombre",
    "Nombre cliente",
    "text",
    "validarSoloLetras(this); formatNombreCapitalizado(this); updateTitle()",
  );

  html += crearInputConAccion(
    "val-tel",
    "Teléfono",
    "tel",
    "validarTelefono(this); updateTitle()",
  );

  html += crearInputConAccion(
    "val-mesa",
    "Número mesa",
    "number",
    "validarSoloNumeros(this); updateTitle()",
  );

  // Agregar botones de números rápidos para mesa
  if (method === "Mesa") {
    html += `
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 10px;">
                ${Array.from(
                  { length: 10 },
                  (_, i) => `
                    <button type="button" onclick="setMesaNumber(${i})" 
                        style="padding: 8px 6px; background: var(--accent); color: black; border: none; border-radius: 25px; font-weight: bold; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">
                        ${i}
                    </button>
                `,
                ).join("")}
            </div>
        `;
  }

  if (method === "Domicilio") {
    html += crearInputConAccion(
      "val-google-maps",
      "Pega Link de Maps o Coordenadas",
      "text",
      "analizarEntradaMapa(this.value)",
    );
    html += crearInputConAccion("val-direccion", "Dirección");
    html += crearInputConAccion("val-referencia", "Punto de referencia");
    html += `
            <div id="map-pos" style="height: 350px; width: 100%; margin-top: 10px; border-radius: 8px;"></div>
            <div id="distancia-info" style="background: #111; font-size: 12px; color: var(--accent); margin-top: 10px; font-weight: bold;">
              <div style="display:flex; flex-direction:column; padding: 12px; border-radius: 8px; border-left: 5px solid var(--accent); box-shadow: 0 2px 6px rgba(0,0,0,0.1); font-size: 14px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span><b>Distancia:</b> 0 km</span>
                  <div style="display:flex; align-items:center; gap: 8px;">
                    <span style="font-size: 12px; color: #999;">$</span>
                    <input type="text" id="tarifa-domicilio-input" value="${(costoDomicilioActual || 0).toLocaleString("es-CO")}" style="width: 110px; padding: 6px 8px; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; color: #fff; background: #222; text-align: right;" oninput="formatearTarifaCOP(this)">
                  </div>
                </div>
                <div style="text-align:right; margin-top: 4px; color: #555;">
                  <small id="base-domicilio-display">Base: $ 0</small>
                </div>
              </div>
            </div>
        `;
    setTimeout(() => initMiniMap(), 100);
  }

  container.innerHTML = html;

  // Restaurar valores y configurar iconos iniciales
  document.getElementById("val-nombre").value = nombreTemp;
  document.getElementById("val-tel").value = telTemp;
  ["val-nombre", "val-tel", "val-mesa"].forEach((id) => checkInputStatus(id));

  const inputMesa = document.getElementById("val-mesa");
  if (method === "Mesa") {
    inputMesa.parentElement.style.display = "flex"; // Mostramos el wrapper
    inputMesa.value = mesaTemp;
  } else {
    inputMesa.parentElement.style.display = "none";
  }

  updateTitle();
  updateUI();
  updateStepIndicator();
}

function filterProducts() {
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search");
  const query = input.value.toLowerCase();

  // Mostrar/Ocultar la X según si hay texto
  clearBtn.style.display = query.length > 0 ? "block" : "none";

  // Filtrar la base de datos
  const filtered = db.filter((p) => {
    return (
      p.nombre.toLowerCase().includes(query) ||
      (p.descripcion || "").toLowerCase().includes(query)
    );
  });

  renderItems(filtered);
}

// Función específica para el botón X
function clearSearch() {
  const input = document.getElementById("search-input");
  input.value = ""; // Borrar texto
  filterProducts(); // Ejecutar filtro (esto ocultará la X y restaurará la lista)
  input.focus(); // Devolver el foco al input
}

function updateTitle() {
  const title = document.getElementById("order-title");
  const mesaValue = document.getElementById("val-mesa")?.value || "";
  const nombreValue = document.getElementById("val-nombre")?.value || "";

  if (currentMethod === "Mesa") {
    title.innerText = `Pedido: Mesa ${mesaValue} - ${nombreValue}`;
  } else {
    title.innerText = `Pedido: ${currentMethod} - ${nombreValue}`;
  }
}

function showEditModeBanner(mesaNumber) {
  const banner = document.getElementById("edit-mode-banner");
  banner.textContent = `✏️ EDITANDO MESA ${mesaNumber} - Haz clic aqui cancelar`;
  banner.classList.add("show");
  document.querySelector(".main-grid").classList.add("edit-mode");
}

function hideEditModeBanner() {
  const banner = document.getElementById("edit-mode-banner");
  banner.classList.remove("show");
  document.querySelector(".main-grid").classList.remove("edit-mode");
}

function renderCats() {
  const list = ["Todos", ...new Set(db.map((p) => p.categoria))];
  document.getElementById("v-cats").innerHTML = list
    .map(
      (c) =>
        `<button class="cat-btn" onclick="filterCat('${c}', this)">${c}</button>`,
    )
    .join("");
}

function filterCat(cat, btn) {
  document
    .querySelectorAll(".cat-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderItems(cat === "Todos" ? db : db.filter((p) => p.categoria === cat));
}

function renderItems(list) {
  const container = document.getElementById("v-prods");
  if (!container) return;

  container.innerHTML = list
    .map((p) => {
      const estaAgotado = p.activo === false;
      const precioFormateado = Number(p.precio).toLocaleString("es-CO");

      return `
    <div class="card-prod ${estaAgotado ? "agotado" : ""}" id="prod-card-${p.id}">
        
        ${estaAgotado ? '<span class="badge-agotado">AGOTADO</span>' : ""}
        
        <div class="card-top-section">
            <div class="prod-img-box">
                ${
                  p.imagen
                    ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy">`
                    : `<img src="https://mrgeorge2022.github.io/Uploader/imagenes/default.jpg" alt="Sin imagen" loading="lazy">`
                }
            </div>

            <div class="prod-info-box" onclick="toggleDesc(${p.id}, event)">
                <div class="title-row">
                    <h4>${p.nombre}</h4>
                    <span class="expand-icon" id="arrow-${p.id}">▼</span>
                </div>
                <div class="price-tag">$${precioFormateado}</div>
            </div>
        </div>

        <div class="prod-desc-text" id="desc-${p.id}" style="display: none;">
            ${p.descripcion || "Sin descripción disponible."}
        </div>

        <div class="card-actions">
            <button class="btn-add-fast" onclick="add(${p.id}, false)" ${estaAgotado ? "disabled" : ""}>
                ⚡ RÁPIDO
            </button>
            <button class="btn-add-note" onclick="add(${p.id}, true)" ${estaAgotado ? "disabled" : ""}>
                📝 NOTA
            </button>
        </div>
    </div>`;
    })
    .join("");

  // Al renderizar una nueva lista (filtrado o cambio de categoría),
  // hacer scroll hacia arriba del contenedor de productos.
  try {
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      container.scrollTop = 0;
    }
  } catch (e) {
    container.scrollTop = 0;
  }
}

// Función para mostrar/ocultar descripción
// Función para mostrar/ocultar descripción con giro de flecha
function toggleDesc(id, event) {
  event.stopPropagation();
  const desc = document.getElementById(`desc-${id}`);
  const arrow = document.getElementById(`arrow-${id}`);

  if (desc.style.display === "none") {
    desc.style.display = "block";
    arrow.style.transform = "rotate(180deg)";
  } else {
    desc.style.display = "none";
    arrow.style.transform = "rotate(0deg)";
  }
}

function add(id, conNota) {
  const p = db.find((x) => x.id == id);
  if (!p) return;

  let nota = "";
  if (conNota) {
    nota = prompt(`Instrucciones para ${p.nombre}:`, "");
    if (nota === null) return;
  }

  // --- EFECTO VISUAL ---
  const card = document.getElementById(`prod-card-${id}`);
  if (card) {
    card.classList.remove("anim-add");
    void card.offsetWidth; // Truco de JS para reiniciar la animación CSS
    card.classList.add("anim-add");
  }

  showToast(`+ ${p.nombre}`);

  // --- LÓGICA DE CARRITO ---
  const ex = cart.find((x) => x.id == id && x.nota === nota);
  if (ex) {
    ex.qty++;
  } else {
    cart.push({ ...p, qty: 1, nota: nota, cartId: Date.now() + Math.random() });
  }

  updateUI();
  updateButtonState();
  updateStepIndicator();

  // --- ANIMACIÓN DEL BADGE ---
  const badge = document.getElementById("badge-mobile");
  if (badge) {
    badge.classList.remove("badge-bounce");
    void badge.offsetWidth; // Reiniciar animación
    badge.classList.add("badge-bounce");
  }
}

// Función para mostrar la notificación
function showToast(text) {
  let toast = document.getElementById("main-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "main-toast";
    toast.className = "toast-msg";
    document.body.appendChild(toast);
  }
  toast.innerText = text;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1500);
}

function changeQty(cartId, delta) {
  const item = cart.find((i) => i.cartId === cartId);
  if (!item) return;

  const nuevaCant = item.qty + delta;

  if (nuevaCant <= 0) {
    // Si intenta bajar de 1 a 0, llama a la función de borrar
    remove(cartId);
  } else {
    item.qty = nuevaCant;
    updateUI();
    updateButtonState();
  }
}

// Cambia el nombre a 'remove' para que coincida con el onclick del HTML
function remove(cartId) {
  const item = cart.find((i) => i.cartId === cartId);
  if (!item) return;

  // Pregunta lo mismo que la caneca
  if (confirm(`¿Deseas eliminar "${item.nombre}" de la comanda?`)) {
    cart = cart.filter((i) => i.cartId !== cartId);
    updateUI(); // Refresca la vista del carrito
    updateButtonState();
  }
}

// NUEVA: Editar nota rápida
function editNote(cartId) {
  const item = cart.find((i) => i.cartId === cartId);
  const nuevaNota = prompt("Editar instrucciones:", item.nota);
  if (nuevaNota !== null) {
    item.nota = nuevaNota;
    updateUI();
    updateButtonState();
  }
}
// Actualizar cantidad en vivo mientras el usuario escribe (oninput)
function setQtyLive(cartId, rawValue) {
  const digits = String(rawValue || "").replace(/[^0-9]/g, "");
  // Permitir campo vacío (usuario borrando): guardamos '' para indicar edición pendiente
  if (digits === "") {
    previewQtys[cartId] = "";
    updateTotalsForPreview();
    // mostrar campo vacío también en el input
    try {
      const inpEmpty = document.querySelector(
        `.cart-item-qty-input[data-cartid="${cartId}"]`,
      );
      if (inpEmpty) inpEmpty.value = "";
    } catch (e) {}
    updateButtonState();
    return;
  }
  const n = parseInt(digits, 10) || 0;
  previewQtys[cartId] = n;
  updateTotalsForPreview();
  // Formatear y mostrar en el input con puntos mientras se escribe
  try {
    const inp = document.querySelector(
      `.cart-item-qty-input[data-cartid="${cartId}"]`,
    );
    const formatted = formatNumberCOP(digits);
    if (inp) {
      inp.value = formatted;
      // colocar cursor al final para facilitar tipeo continuo
      try {
        inp.setSelectionRange(inp.value.length, inp.value.length);
      } catch (e) {}
    }
    adjustQtyInputWidth(cartId, formatted);
  } catch (e) {}
  updateButtonState();
}

// Confirmar la cantidad al perder foco (blur) o al presionar Enter
function commitQty(cartId, rawValue) {
  const item = cart.find((i) => i.cartId === cartId);
  if (!item) return;
  const digits = String(rawValue || "").replace(/[^0-9]/g, "");
  let n = parseInt(digits, 10);
  if (Number.isNaN(n) || n < 1) {
    // Restaurar a 1 si el usuario dejó vacío o puso 0
    n = 1;
  }
  item.qty = n;
  if (previewQtys[cartId] !== undefined) delete previewQtys[cartId];
  updateUI();
  adjustQtyInputWidth(cartId, formatNumberCOP(n));
  updateButtonState();
}

// Actualiza solo los totales y subtotales en pantalla usando previewQtys (sin re-renderizar la lista)
function updateTotalsForPreview() {
  // Recalcular subtotal general
  const subtotalProductos = cart.reduce((s, i) => {
    const q =
      previewQtys[i.cartId] !== undefined && previewQtys[i.cartId] !== ""
        ? Number(previewQtys[i.cartId])
        : i.qty;
    return s + i.precio * q;
  }, 0);

  const esDomicilio = currentMethod === "Domicilio";
  const valorEnvio = esDomicilio ? costoDomicilioActual || 0 : 0;
  const totalFinal = subtotalProductos + valorEnvio;

  // Actualizar display total
  const totalDisplay = document.getElementById("order-total");
  if (totalDisplay)
    totalDisplay.innerText = `$ ${totalFinal.toLocaleString("es-CO")}`;

  // Actualizar subtotales por línea si existen en DOM
  cart.forEach((i) => {
    const elem = document.getElementById(`subtotal-${i.cartId}`);
    if (elem) {
      const q =
        previewQtys[i.cartId] !== undefined && previewQtys[i.cartId] !== ""
          ? Number(previewQtys[i.cartId])
          : i.qty;
      elem.textContent = (i.precio * q).toLocaleString("es-CO");
    }
    // También actualizar el subtotal visible dentro de la tarjeta si existe
    try {
      const inp = document.querySelector(
        `.cart-item-qty-input[data-cartid="${i.cartId}"]`,
      );
      if (inp) {
        const row = inp.closest(".cart-item-line");
        const visiblePrice = row ? row.querySelector(".cart-item-price") : null;
        if (visiblePrice) {
          const qv =
            previewQtys[i.cartId] !== undefined && previewQtys[i.cartId] !== ""
              ? Number(previewQtys[i.cartId])
              : i.qty;
          visiblePrice.textContent = `$${(i.precio * qv).toLocaleString("es-CO")}`;
        }
      }
    } catch (e) {
      /* silent */
    }
  });

  // Actualizar badge
  const badge = document.getElementById("badge-mobile");
  if (badge) {
    const totalItems = cart.reduce((sum, item) => {
      const q =
        previewQtys[item.cartId] !== undefined &&
        previewQtys[item.cartId] !== ""
          ? Number(previewQtys[item.cartId])
          : item.qty;
      return sum + q;
    }, 0);
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? "flex" : "none";
  }

  // Actualizar desglose de domicilio si aplica
  const displayCosto = document.getElementById("display-costo-domicilio");
  if (displayCosto)
    displayCosto.innerText = `$ ${valorEnvio.toLocaleString("es-CO")}`;

  // Recalcular vuelto si necesario
  calcularCambio();
}

// NUEVA: Vaciar comanda completa
function clearCart() {
  if (confirm("¿Estás seguro de vaciar TODA la comanda?")) {
    cart = [];
    updateUI();
  }
}

function updateUI() {
  const box = document.getElementById("cart-box");
  const subtotalProductos = cart.reduce((s, i) => {
    const q =
      previewQtys[i.cartId] !== undefined && previewQtys[i.cartId] !== ""
        ? Number(previewQtys[i.cartId])
        : i.qty;
    return s + i.precio * q;
  }, 0);
  const esDomicilio = currentMethod === "Domicilio";
  const valorEnvio = esDomicilio ? costoDomicilioActual || 0 : 0;
  const totalFinal = subtotalProductos + valorEnvio;

  if (cart.length === 0) {
    box.innerHTML =
      '<p style="text-align:center; color:#999; margin-top:50px;">Vacío</p>';
  } else {
    let htmlItems = `<button class="btn-empty-cart" onclick="clearCart()">🗑️ Vaciar</button>`;

    htmlItems += cart
      .map((i) => {
        // Precio Unitario Formateado
        const precioUnitario = Number(i.precio).toLocaleString("es-CO");
        // Subtotal de la línea (Precio * Cantidad)
        const qtyForCalc =
          previewQtys[i.cartId] !== undefined && previewQtys[i.cartId] !== ""
            ? Number(previewQtys[i.cartId])
            : i.qty;
        const subtotalItem = (i.precio * qtyForCalc).toLocaleString("es-CO");
        const displayQty =
          previewQtys[i.cartId] !== undefined && previewQtys[i.cartId] !== ""
            ? previewQtys[i.cartId]
            : i.qty;
        const formattedDisplayQty = formatNumberCOP(displayQty);

        return `
            <div class="cart-item-line">
                <div class="cart-item-row">
                    
                    <button class="btn-icon-action" onclick="remove(${i.cartId})" title="Eliminar" style="color:#ff4444;">
                        🗑️
                    </button>

                    ${
                      i.imagen
                        ? `<img src="${i.imagen}" alt="${i.nombre}" class="cart-item-image">`
                        : `<div class="cart-item-image" style="background:#222; display:flex; align-items:center; justify-content:center; font-size:10px;">🖼️</div>`
                    }
                    
                    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
                        
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                            <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                                <span class="cart-item-name">${i.nombre}</span>
                                <span style="font-size: 0.75rem; color: #777;">$${precioUnitario} c/u</span>
                            </div>
                            <span class="cart-item-price">$${subtotalItem}</span>
                        </div>

                        <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between; ">
                            <button class="btn-icon-action" onclick="editNote(${i.cartId})" title="Nota" style="opacity: 0.7;">
                                📝
                            </button>

                            <div class="qty-controls">
                              <button class="qty-btn" onclick="changeQty(${i.cartId}, -1)">−</button>
                              <input type="text" inputmode="numeric" pattern="\d*" data-cartid="${i.cartId}" class="cart-item-qty-input" value="${formattedDisplayQty}" min="0" oninput="setQtyLive(${i.cartId}, this.value)" onblur="commitQty(${i.cartId}, this.value)" onkeydown="if(event.key==='Enter'){ this.blur(); }">
                              <button class="qty-btn" onclick="changeQty(${i.cartId}, 1)">+</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                      ${
                        i.nota
                          ? `
                        <div class="cart-item-note">
                          <span>📌 ${i.nota}</span>
                        </div>
                      `
                          : ""
                      }
                
                      <!-- Subtotal por línea, usado para updates en vivo -->
                      <div style="display:none;" id="subtotal-${i.cartId}">${(i.precio * qtyForCalc).toLocaleString("es-CO")}</div>
            </div>
            `;
      })
      .join("");

    // Preservar foco y posición del cursor si estamos editando una cantidad
    const active = document.activeElement;
    let activeInfo = null;
    if (
      active &&
      active.classList &&
      active.classList.contains("cart-item-qty-input")
    ) {
      activeInfo = {
        cartId: active.dataset.cartid,
        selStart: active.selectionStart,
        value: active.value,
      };
    }

    box.innerHTML = htmlItems;

    // Restaurar foco y cursor si aplicable
    if (activeInfo) {
      const newInput = box.querySelector(
        `.cart-item-qty-input[data-cartid="${activeInfo.cartId}"]`,
      );
      if (newInput) {
        newInput.focus();
        const pos = Math.min(
          activeInfo.selStart || 0,
          (newInput.value || "").length,
        );
        try {
          newInput.setSelectionRange(pos, pos);
        } catch (e) {
          /* algunos navegadores pueden fallar */
        }
      }
    }
    // Ajustar ancho de inputs según dígitos existentes
    try {
      cart.forEach((ci) => {
        const inp = box.querySelector(
          `.cart-item-qty-input[data-cartid="${ci.cartId}"]`,
        );
        if (inp) adjustQtyInputWidth(ci.cartId, inp.value);
      });
    } catch (e) {
      /* silent */
    }
  }

  // Actualizar badge de número de productos en móvil
  const badge = document.getElementById("badge-mobile");
  if (badge) {
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? "flex" : "none";
  }

  // ... (resto del código del footer igual)
  actualizarFooter(subtotalProductos, esDomicilio, valorEnvio, totalFinal);
  // Asegurar que el estado del botón se recalcula cuando cambia la UI (incluye costo/ubicación)
  try {
    updateButtonState();
  } catch (e) {
    /* no bloquear si falla */
  }
}

// Función auxiliar para no repetir código del footer
function actualizarFooter(subtotal, esDomicilio, valorEnvio, totalFinal) {
  const footer = document.querySelector(".order-footer");
  if (!footer) return;

  let desgloseContainer = document.getElementById("desglose-dinamico");
  if (!desgloseContainer) {
    desgloseContainer = document.createElement("div");
    desgloseContainer.id = "desglose-dinamico";
    const totalRow = footer.querySelector(".order-total-row");
    footer.insertBefore(desgloseContainer, totalRow);
  }

  if (esDomicilio) {
    desgloseContainer.innerHTML = `
            <div class="order-total-row" style="font-size: 0.85rem; color: #777; margin-bottom: 2px; border-top: 1px dashed #333; padding-top: 5px;">
                <span>SUBTOTAL</span>
                <span>$ ${subtotal.toLocaleString("es-CO")}</span>
            </div>
            <div class="order-total-row" style="font-size: 0.85rem; color: var(--accent); margin-bottom: 5px;">
                <span>DOMICILIO</span>
                <span id="display-costo-domicilio">$ ${valorEnvio.toLocaleString("es-CO")}</span>
            </div>
        `;
  } else {
    desgloseContainer.innerHTML = "";
  }

  const totalDisplay = document.getElementById("order-total");
  if (totalDisplay) {
    totalDisplay.innerText = `$ ${totalFinal.toLocaleString("es-CO")}`;
  }

  // Recalcular el vuelto si el monto está ingresado
  calcularCambio();
}

// Ajusta el ancho del input de cantidad según la longitud de los dígitos
function adjustQtyInputWidth(cartId, value) {
  try {
    const v = String(value || "");
    const inp = document.querySelector(
      `.cart-item-qty-input[data-cartid="${cartId}"]`,
    );
    if (!inp) return;
    const len = Math.max(1, v.length);
    // Usar 'ch' para que el ancho dependa del número de caracteres
    inp.style.width = Math.min(12, len + 1) + "ch";
  } catch (e) {
    // no bloquear
  }
}

// FUNCIONES DE APOYO (Asegúrate de tenerlas)
function changeQty(cartId, delta) {
  // Si hay una edición en curso para este cartId, descartarla
  if (previewQtys[cartId] !== undefined) delete previewQtys[cartId];
  const item = cart.find((i) => i.cartId === cartId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter((i) => i.cartId !== cartId);
  }
  updateUI();
  updateButtonState();
}

function editNote(cartId) {
  const item = cart.find((i) => i.cartId === cartId);
  if (!item) return;
  const nuevaNota = prompt(`Editar nota para ${item.nombre}:`, item.nota || "");
  if (nuevaNota !== null) {
    item.nota = nuevaNota.trim();
    updateUI();
    updateButtonState();
  }
}
// goStep remapeado: sidebar (m-col-1) permanece fija; pasos 1..3 -> cols 2..4
function goStep(n) {
  // Limpiar estados
  document
    .querySelectorAll(".col")
    .forEach((c) => c.classList.remove("active-m"));

  // Sidebar siempre visible
  const sidebar = document.getElementById("m-col-1");
  if (sidebar) sidebar.classList.add("active-m");

  // Mapear paso n (1..3) a columna m-col-(n+1)
  const idx = Number(n);
  if (!isNaN(idx) && idx >= 1 && idx <= 3) {
    const targetCol = document.getElementById(`m-col-${idx + 1}`);
    if (targetCol) targetCol.classList.add("active-m");
    currentStep = idx;
  } else {
    currentStep = 0;
  }

  updateNavigationUI();
}

// Mostrar columna sin cambiar el estado de los tabs (no altera currentStep)
function showColumn(n) {
  // Limpiar estados
  document
    .querySelectorAll(".col")
    .forEach((c) => c.classList.remove("active-m"));

  // Sidebar siempre visible
  const sidebar = document.getElementById("m-col-1");
  if (sidebar) sidebar.classList.add("active-m");

  // Mapear paso n (1..3) a columna m-col-(n+1)
  const idx = Number(n);
  if (!isNaN(idx) && idx >= 1 && idx <= 3) {
    const targetCol = document.getElementById(`m-col-${idx + 1}`);
    if (targetCol) targetCol.classList.add("active-m");
  }
}

// updateNavigationUI: actualiza la barra de tabs inferior
function updateNavigationUI() {
  const tabs = document.querySelectorAll(".tab-item");
  if (currentStep === 0) {
    tabs.forEach((t) => {
      t.classList.remove("active");
      t.classList.add("disabled");
    });
    return;
  }

  tabs.forEach((t, idx) => {
    const stepNum = idx + 1; // 1..3
    t.classList.toggle("active", stepNum === currentStep);
    if (stepNum <= currentStep) t.classList.remove("disabled");
    else t.classList.add("disabled");
  });
}

function handleNavClick(btn, action) {
  // 1. CAMBIO VISUAL: Gestión de botones laterales
  document
    .querySelectorAll(".nav-link")
    .forEach((link) => link.classList.remove("active"));
  btn.classList.add("active");

  const tieneNombre = document.getElementById("val-nombre")?.value.length > 0;

  // 2. LÓGICA PARA "NUEVO"
  if (action === "nuevo") {
    if (cart.length > 0 || tieneNombre) {
      if (
        !confirm("Se borrarán los datos actuales. ¿Deseas empezar de nuevo?")
      ) {
        return;
      }
    }

    // Ejecutamos la limpieza
    forceResetToNew();

    // --- CLAVE: Forzamos el salto visual a la Carta ---
    goStep(1);

    return; // Finalizamos aquí para "nuevo"
  }

  // 3. LÓGICA PARA OTRAS PESTAÑAS
  if (action === "mesas") showMesas();
  if (action === "pedidos") showPedidos();
}

function editExistingOrder(mesaData) {
  if (
    !confirm(
      `¿Cargar el pedido ${
        mesaData.mesa ? ` de la Mesa ${mesaData.mesa}` : `de ${mesaData.nombre}`
      } para editarlo?`,
    )
  )
    return;

  // --- NUEVA LÓGICA DE LIMPIEZA DE VISTAS ---
  // 1. Cerramos las listas de Mesas Activas e Historial inmediatamente
  const viewMesas = document.getElementById("view-mesas");
  const viewPedidos = document.getElementById("view-pedidos");

  if (viewMesas) viewMesas.classList.remove("active");
  if (viewPedidos) viewPedidos.classList.remove("active");

  // 2. Aseguramos que el contenedor de inputs sea visible
  const serviceContent = document.getElementById("service-content");
  if (serviceContent) serviceContent.style.display = "block";
  // ------------------------------------------

  // 1. Guardamos el ID de edición
  editingOrderId = mesaData.numeroFactura;

  // 2. Control del Banner de Notificación
  const banner = document.getElementById("edit-mode-banner");
  if (banner) {
    // Forzamos visibilidad para que aparezca siempre (incluso en ediciones consecutivas)
    banner.style.display = "flex";
    banner.classList.add("show", "active");

    const mesaInfo = mesaData.mesa ? `Mesa ${mesaData.mesa} - ` : "";

    banner.textContent = `⚠️ Editando: ${mesaData.numeroFactura} - ${mesaInfo}${mesaData.nombre}`;
  }

  // 3. Activación visual del modo edición en la interfaz
  document.querySelector(".main-grid")?.classList.add("edit-mode");

  // 4. Limpiar y procesar productos
  cart = [];
  const lineas = mesaData.productos.split("\n");
  lineas.forEach((linea) => {
    const match = linea.match(/(.+) x(\d+) - \$[\d.]+ ?(?:\((.*)\))?/);
    if (match) {
      const [_, nombre, qty, nota] = match;
      const productoOriginal = db.find(
        (p) => p.nombre.trim() === nombre.trim(),
      );
      if (productoOriginal) {
        cart.push({
          ...productoOriginal,
          qty: parseInt(qty),
          nota: nota || "",
          cartId: Date.now() + Math.random(),
        });
      }
    }
  });

  // 5. Configurar Método y Llenar Campos
  let metodoAActivar = "Recoger en tienda"; // Por defecto iniciamos en recoger

  if (mesaData.direccion) {
    // Si tiene dirección, es un domicilio
    metodoAActivar = "Domicilio";
  } else if (mesaData.mesasActivas === true || mesaData.q === true) {
    // Si en la DB el campo de mesa activa es verdadero, forzamos "Mesa"
    // aunque el número de mesa sea "0"
    metodoAActivar = "Mesa";
  } else if (mesaData.mesa && mesaData.mesa !== "" && mesaData.mesa !== "0") {
    // Si tiene un número de mesa definido y no es cero, es Mesa
    metodoAActivar = "Mesa";
  }

  currentMethod = metodoAActivar;
  const botones = document.querySelectorAll(".btn-method");
  botones.forEach((btn) => {
    btn.style.display = "";
    if (
      btn.textContent
        .toUpperCase()
        .includes(metodoAActivar.split(" ")[0].toUpperCase())
    ) {
      setMethod(btn, metodoAActivar);
    }
  });

  setTimeout(() => {
    // 1. Llenado de inputs básicos
    if (document.getElementById("val-nombre"))
      document.getElementById("val-nombre").value = mesaData.nombre || "";
    if (document.getElementById("val-tel"))
      document.getElementById("val-tel").value = mesaData.telefono || "0";
    if (document.getElementById("val-mesa"))
      document.getElementById("val-mesa").value = mesaData.mesa || "0";
    if (document.getElementById("val-observaciones"))
      document.getElementById("val-observaciones").value =
        mesaData.observaciones || "";

    // --- SOLUCIÓN PARA EL MÉTODO DE PAGO ---
    const selectorPago = document.getElementById("val-metodo-pago");
    if (selectorPago && mesaData.metodoPago) {
      // Forzamos el valor de la base de datos
      selectorPago.value = mesaData.metodoPago;

      // Si por alguna razón el valor no coincide con las opciones,
      // esto imprimirá un error en la consola para que sepas cuál es el problema
      if (selectorPago.value === "" && mesaData.metodoPago !== "") {
        console.error(
          "El método de pago '" +
            mesaData.metodoPago +
            "' no coincide con ninguna opción del HTML.",
        );
      }

      // Mostrar el campo de monto si es efectivo
      mostrarCampoMonto();
    }

    // 2. Llenado de campos específicos si es Domicilio
    if (metodoAActivar === "Domicilio") {
      if (document.getElementById("val-direccion"))
        document.getElementById("val-direccion").value =
          mesaData.direccion || "";
      if (document.getElementById("val-referencia"))
        document.getElementById("val-referencia").value =
          mesaData.puntoReferencia || "";

      // ✅ GUARDAR COSTO ORIGINAL DEL DOMICILIO
      costoDomicilioOriginal = mesaData.costoDomicilio || 0;
      costoDomicilioActual = costoDomicilioOriginal;

      if (document.getElementById("val-google-maps")) {
        document.getElementById("val-google-maps").value =
          mesaData.ubicacionGoogleMaps || "";

        // ✅ NUEVA: Marcar que es carga inicial pero SIN RECALCULAR COSTOS
        if (mesaData.ubicacionGoogleMaps) {
          isLoadingDomicilio = true;
          setTimeout(() => {
            // Solo cargar el mapa visualmente, sin recalcular costos
            cargarMapaDesdeUbicacionGuardada(mesaData.ubicacionGoogleMaps);
            isLoadingDomicilio = false;
          }, 200);
        }
      }
    }

    updateTitle();
    updateUI();

    // Guardar snapshot de estado: si estamos cargando un domicilio inicial,
    // deferimos la creación del snapshot hasta que termine la carga del mapa
    const grabarSnapshot = () => {
      originalOrderSnapshot = JSON.stringify({
        nombre: (document.getElementById("val-nombre")?.value || "").trim(),
        tel: (document.getElementById("val-tel")?.value || "").trim(),
        mesa: (document.getElementById("val-mesa")?.value || "").trim(),
        direccion: (
          document.getElementById("val-direccion")?.value || ""
        ).trim(),
        obs: (document.getElementById("val-observaciones")?.value || "").trim(),
        pago: document.getElementById("val-metodo-pago")?.value || "",
        referencia: (
          document.getElementById("val-referencia")?.value || ""
        ).trim(),
        metodo: currentMethod,
        // Ubicación y costo original (para detectar cambios en domicilio)
        googleMaps: (
          document.getElementById("val-google-maps")?.value || ""
        ).trim(),
        costoDomicilio:
          typeof costoDomicilioOriginal !== "undefined"
            ? costoDomicilioOriginal
            : 0,
        // Guardamos los productos con su cantidad e ID
        items: cart.map((item) => ({
          id: item.id,
          qty: item.qty,
          nota: item.nota,
        })),
      });

      // Forzamos la actualización del botón (esto lo deshabilitará al inicio)
      updateButtonState();
    };

    // Si `isLoadingDomicilio` está activo, significa que hay un timeout pendiente
    // que cargará el mapa; en ese caso, esperamos a que termine.
    if (!isLoadingDomicilio) {
      grabarSnapshot();
    } else {
      // Reintentar hasta que isLoadingDomicilio sea false (máx 5 intentos)
      let intentos = 0;
      const espera = setInterval(() => {
        intentos++;
        if (!isLoadingDomicilio || intentos > 10) {
          clearInterval(espera);
          grabarSnapshot();
        }
      }, 200);
    }

    // Limpiar el monto recibido y el cambio cuando se edita un pedido
    const inputMonto = document.getElementById("val-monto-efectivo");
    if (inputMonto) inputMonto.value = "";
    const cambioInfo = document.getElementById("cambio-info");
    if (cambioInfo) cambioInfo.style.display = "none";

    if (document.getElementById("btn-cancel-edit"))
      document.getElementById("btn-cancel-edit").style.display = "block";

    // Mostrar botón "Cerrar mesa" solo si es una mesa
    const btnCloseMesa = document.getElementById("btn-close-mesa");
    if (btnCloseMesa) {
      // Verificamos que sea una mesa Y que la propiedad de actividad sea true
      const estaActiva = mesaData.mesasActivas === true || mesaData.q === true;

      if (metodoAActivar === "Mesa" && estaActiva) {
        btnCloseMesa.style.display = "block";
      } else {
        btnCloseMesa.style.display = "none";
      }
    }

    goStep(3);
    showColumn(3);
  }, 150);
}

function closeLists() {
  document.getElementById("view-mesas").classList.remove("active");
  document.getElementById("view-pedidos").classList.remove("active");
  document.getElementById("service-content").style.display = "block";

  // IMPORTANTE: Si cerramos las listas de mesas/pedidos,
  // significa que volvemos a la pantalla de "Nuevo/Datos"
  document
    .querySelectorAll(".sidebar-main .nav-link")
    .forEach((link) => link.classList.remove("active"));
  const btnNuevo = document.querySelector(".sidebar-main .nav-link");
  if (btnNuevo) btnNuevo.classList.add("active");
}

let miniMap, markerUsuarioPos;
let rutaPolylinesPOS = []; // capas del arco para limpiarlas
let costoDomicilioActual = 0;

/**
 * 1. INICIALIZAR EL MAPA
 * Igual que domicilio.js: tiles CARTO (más limpios), sin routing machine externo.
 */
function initMiniMap() {
  if (miniMap) miniMap.remove();
  miniMap = null;
  markerUsuarioPos = null;
  rutaPolylinesPOS = [];

  const tiendaCoords = config?.coordenadasSede || [10.37375, -75.47358];

  miniMap = L.map("map-pos").setView(tiendaCoords, 14);

  // Tiles CARTO (mismo que domicilio.js) — más rápidos y estéticos
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> | <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    },
  ).addTo(miniMap);

  miniMap.zoomControl.setPosition("bottomleft");

  const iconoNegocio = L.icon({
    iconUrl: config?.logo ? "../" + config.logo : "../img/icono_tienda.png",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
    className: "marker-logo-sede",
  });

  L.marker(tiendaCoords, { icon: iconoNegocio })
    .addTo(miniMap)
    .bindPopup(`<b>${config?.nombreRestaurante || "Nuestra Sede"}</b>`);

  miniMap.on("click", function (e) {
    const { lat, lng } = e.latlng;
    document.getElementById("val-google-maps").value =
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    actualizarPuntoYCostos(lat, lng);
  });
}

/**
 * ✅ FUNCIÓN: Dibujar arco Bézier (igual que domicilio.js) SIN recalcular costos
 * Se usa solo en carga inicial de pedidos existentes
 */
function dibujarRutaSinCostos(lat, lng) {
  _dibujarArcoPOS(lat, lng, /* soloVisual */ true);
}

/**
 * Núcleo del arco Bézier (extraído de domicilio.js)
 * @param {number} lat
 * @param {number} lng
 * @param {boolean} soloVisual  Si true, no actualiza costos ni el panel
 */
function _dibujarArcoPOS(lat, lng, soloVisual = false) {
  const tiendaCoords = config?.coordenadasSede || [10.37375, -75.47358];

  // Limpiar arco anterior
  rutaPolylinesPOS.forEach((l) => {
    try {
      miniMap.removeLayer(l);
    } catch (e) {}
  });
  rutaPolylinesPOS = [];

  const lat1 = tiendaCoords[0],
    lng1 = tiendaCoords[1];
  const lat2 = lat,
    lng2 = lng;

  // ─── Haversine ────────────────────────────────────────────────────────────
  const R = 6371;
  const dLatRad = ((lat2 - lat1) * Math.PI) / 180;
  const dLonRad = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLatRad / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLonRad / 2) ** 2;
  const distanciaLineal = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanciaKm = distanciaLineal * 1.35; // factor urbano

  // ─── Arco Bézier cuadrático ───────────────────────────────────────────────
  function generarArco(la1, ln1, la2, ln2, pasos = 80) {
    const dxLat = la2 - la1,
      dxLng = ln2 - ln1;
    const distBase = Math.sqrt(dxLat ** 2 + dxLng ** 2);
    const altura = Math.min(0.2, distBase * 0.3);
    const mLat = (la1 + la2) / 2,
      mLng = (ln1 + ln2) / 2;
    const len = distBase || 1;
    const perpLat = -dxLng / len,
      perpLng = dxLat / len;
    const sentido = dxLng >= 0 ? -1 : 1;
    const cpLat = mLat + perpLat * altura * sentido;
    const cpLng = mLng + perpLng * altura * sentido;
    const puntos = [];
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos;
      puntos.push([
        (1 - t) ** 2 * la1 + 2 * (1 - t) * t * cpLat + t ** 2 * la2,
        (1 - t) ** 2 * ln1 + 2 * (1 - t) * t * cpLng + t ** 2 * ln2,
      ]);
    }
    const vLat = 0.25 * la1 + 0.5 * cpLat + 0.25 * la2;
    const vLng = 0.25 * ln1 + 0.5 * cpLng + 0.25 * ln2;
    return { puntos, vLat, vLng };
  }

  const {
    puntos: puntosArco,
    vLat,
    vLng,
  } = generarArco(lat1, lng1, lat2, lng2);
  const colorLinea = config?.colores?.["--accent"] || "#ffc400";

  // Sombra recta
  const sombra = L.polyline([tiendaCoords, [lat2, lng2]], {
    color: "rgba(0,0,0,0.10)",
    weight: 6,
    lineCap: "round",
  }).addTo(miniMap);

  // Halo blanco
  const halo = L.polyline(puntosArco, {
    color: "rgba(255,255,255,0.55)",
    weight: 10,
    lineCap: "round",
  }).addTo(miniMap);

  // Línea principal
  const linea = L.polyline(puntosArco, {
    color: colorLinea,
    weight: 5,
    opacity: 0.95,
    lineCap: "round",
  }).addTo(miniMap);

  // Etiqueta de distancia
  const kmTexto =
    distanciaLineal >= 1
      ? `${distanciaLineal.toFixed(1)} km`
      : `${Math.round(distanciaLineal * 1000)} m`;

  const labelKm = L.marker([vLat, vLng], {
    icon: L.divIcon({
      className: "",
      html: `<div style="color:#111;font-size:13px;font-weight:800;padding:4px 10px;border-radius:20px;white-space:nowrap;pointer-events:none;">${kmTexto}</div>`,
      iconAnchor: [38, 14],
    }),
    interactive: false,
    zIndexOffset: 1000,
  }).addTo(miniMap);

  rutaPolylinesPOS = [sombra, halo, linea, labelKm];

  // Ajustar vista al arco
  try {
    const bounds = L.latLngBounds(puntosArco);
    miniMap.fitBounds(bounds, {
      paddingTopLeft: [10, 20],
      paddingBottomRight: [10, 60],
      maxZoom: 15,
    });
  } catch (e) {}

  if (soloVisual) return; // No actualizar costos — solo dibujar

  // ─── Calcular y mostrar costos ────────────────────────────────────────────
  const valorKM = config?.domicilio?.costoPorKilometro || 1500;
  const baseEnvio = config?.costoEnvioBase || 2000;
  const tarifaMinima = config?.domicilio?.tarifaMinima || 3000;
  const recargoActivo = config?.domicilio?.recargoNocturnoActivo !== false;
  const redondearACien = (v) => Math.ceil(v / 100) * 100;

  let calculoInicial = distanciaKm * valorKM + baseEnvio;
  let costoBase = Math.max(redondearACien(calculoInicial), tarifaMinima);
  const hora = new Date().getHours();
  let costoFinal = costoBase;
  let etiquetaNocturna = "";

  if (recargoActivo && (hora >= 22 || hora < 6)) {
    costoFinal = redondearACien(costoBase * 1.2);
    etiquetaNocturna = `<br><span style="color:#e74c3c;font-weight:bold;">🌙 Recargo Nocturno (+20%)</span>`;
  }

  costoDomicilioActual = costoFinal;
  updateUI();

  const infoDiv = document.getElementById("distancia-info");
  if (infoDiv) {
    infoDiv.innerHTML = `
          <div style="display:flex;flex-direction:column;padding:12px;border-radius:8px;border-left:5px solid var(--accent);box-shadow:0 2px 6px rgba(0,0,0,0.1);font-size:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span><b>Distancia:</b> ${distanciaLineal.toFixed(2)} km</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:12px;color:#999;">$</span>
                <input type="text" id="tarifa-domicilio-input"
                  value="${costoDomicilioActual.toLocaleString("es-CO")}"
                  style="width:110px;padding:6px 8px;border:none;border-radius:6px;font-size:16px;font-weight:bold;color:#fff;background:#222;text-align:right;"
                  oninput="formatearTarifaCOP(this)">
              </div>
            </div>
            <div style="text-align:right;margin-top:4px;color:#555;">
              <small>Base: $${costoBase.toLocaleString("es-CO")}</small>
              ${etiquetaNocturna}
            </div>
          </div>`;
  }
}

/**
 * ✅ FUNCIÓN: Cargar mapa desde ubicación guardada SIN recalcular costos
 * Usa la misma cascada de domicilio.js para parsear coords.
 */
function cargarMapaDesdeUbicacionGuardada(valor) {
  if (!valor || valor.trim() === "") return;

  if (!miniMap) {
    console.warn("Mapa no inicializado aún, reintentando...");
    setTimeout(() => cargarMapaDesdeUbicacionGuardada(valor), 300);
    return;
  }

  const coords = _parsearCoordsPos(valor);
  if (!coords) return;
  const { lat, lng } = coords;

  document.getElementById("val-google-maps").value =
    `${lat.toFixed(7)}, ${lng.toFixed(7)}`;

  // Colocar/mover marcador
  if (markerUsuarioPos) {
    markerUsuarioPos.setLatLng([lat, lng]);
  } else {
    markerUsuarioPos = L.marker([lat, lng], { draggable: true }).addTo(miniMap);
    markerUsuarioPos.on("dragend", (e) => {
      const p = e.target.getLatLng();
      document.getElementById("val-google-maps").value =
        `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
      actualizarPuntoYCostos(p.lat, p.lng);
    });
  }

  // Dibujar arco + calcular costos (igual que al cargar en domicilio.js)
  _dibujarArcoPOS(lat, lng, /* soloVisual */ false);
}

/**
 * Helper: parsea coords desde cualquier formato de Google Maps o texto plano.
 * Idéntica cascada a la de domicilio.js
 */
function _parsearCoordsPos(valor) {
  let s = valor.replace(/\(/g, "").replace(/\)/g, "").trim();
  let lat = null,
    lng = null;

  // Prioridad 1: !3d / !4d
  if (s.includes("!3d") && s.includes("!4d")) {
    const m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) {
      lat = parseFloat(m[1]);
      lng = parseFloat(m[2]);
    }
  }
  // Prioridad 2: @lat,lng
  if (lat === null && s.includes("@")) {
    const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) {
      lat = parseFloat(m[1]);
      lng = parseFloat(m[2]);
    }
  }
  // Prioridad 3: coordenadas planas (admite coma decimal regional)
  if (lat === null) {
    const norm = s.replace(/(\d+),(\d+)/g, "$1.$2");
    const m = norm.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (m) {
      lat = parseFloat(m[1]);
      lng = parseFloat(m[2]);
    }
  }

  return lat !== null && lng !== null ? { lat, lng } : null;
}

/**
 * 2. ANALIZAR ENTRADA DE MAPA
 * Delegamos al helper _parsearCoordsPos (misma cascada que domicilio.js)
 */

/**
 * 3. ACTUALIZAR PUNTO, DIRECCIÓN Y COSTOS
 * Incluye: Redondeo a centena, Tarifa mínima y Recargo Nocturno (20%)
 */
function analizarEntradaMapa(valor) {
  if (!valor || valor.trim() === "") return;
  const coords = _parsearCoordsPos(valor);
  if (!coords) return;
  const { lat, lng } = coords;
  document.getElementById("val-google-maps").value =
    `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
  if (miniMap) miniMap.setView([lat, lng], 16);
  actualizarPuntoYCostos(lat, lng);
}

/**
 * 3. ACTUALIZAR PUNTO, DIRECCIÓN Y COSTOS
 * Usa Haversine + arco Bézier (igual que domicilio.js) — SIN servidor externo.
 */
async function actualizarPuntoYCostos(lat, lng) {
  // Marcador del usuario
  if (markerUsuarioPos) {
    markerUsuarioPos.setLatLng([lat, lng]);
  } else {
    markerUsuarioPos = L.marker([lat, lng], { draggable: true }).addTo(miniMap);
    markerUsuarioPos.on("dragend", (e) => {
      const p = e.target.getLatLng();
      document.getElementById("val-google-maps").value =
        `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
      actualizarPuntoYCostos(p.lat, p.lng);
    });
  }

  // Reverse Geocoding para la dirección
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
    );
    const data = await res.json();
    const inputDir = document.getElementById("val-direccion");
    if (data?.display_name && inputDir) {
      const partes = data.display_name.split(",");
      inputDir.value = `${partes[0] || ""}, ${partes[1] || ""}`.trim();
    }
  } catch (err) {
    console.warn("Reverse geocoding no disponible:", err);
  }

  // Dibujar arco Bézier y calcular costos (sin routing machine externo)
  _dibujarArcoPOS(lat, lng, /* soloVisual */ false);
}

// Cambia el icono entre símbolo de pegar y símbolo de borrar
function checkInputStatus(id) {
  const input = document.getElementById(id);
  const helper = document.getElementById(`helper-${id}`);
  if (!input || !helper) return;

  if (input.value.trim() !== "") {
    helper.innerHTML = "×";
    helper.classList.add("is-delete");
  } else {
    helper.innerHTML = "⎘";
    helper.classList.remove("is-delete");
  }
  updateButtonState();
  updateStepIndicator();
}
// 📌 FUNCIÓN: Formatear tarifa en COP y actualizar total en tiempo real
function formatearTarifaCOP(input) {
  // Obtener solo los dígitos
  let valor = input.value.replace(/\D/g, "");

  // Si está vacío, dejar así
  if (valor === "") {
    input.value = "";
    costoDomicilioActual = 0;
    updateUI();
    return;
  }

  // Convertir a número
  let numValor = parseInt(valor);

  // Formatear en COP
  input.value = numValor.toLocaleString("es-CO");

  // Actualizar la tarifa y el total instantáneamente
  costoDomicilioActual = numValor;
  updateUI();
}

// ⎘ = PEGAR DIRECTO DEL PORTAPAPELES (ejecución inmediata al click)
// × = BORRAR contenido del input
async function handleInputHelper(id) {
  const input = document.getElementById(id);
  const helper = document.getElementById(`helper-${id}`);

  if (helper.classList.contains("is-delete")) {
    // ✂️ ACCIÓN: BORRAR contenido
    input.value = "";
    if (id === "val-google-maps") {
      if (marker) map.removeLayer(marker);
      costoDomicilioActual = 0;
      updateUI();
    }
  } else {
    // 📋 ACCIÓN: PEGAR - Lee portapapeles e inserta en el input INMEDIATAMENTE
    try {
      const text = await navigator.clipboard.readText();
      input.value = text;
      if (id === "val-google-maps") analizarEntradaMapa(text);
    } catch (err) {
      console.error("Error al acceder al portapapeles", err);
    }
  }

  checkInputStatus(id);
  updateTitle();
  updateButtonState();
}

function imprimirFacturaPOS(pedido) {
  let productosFinales = [];

  if (pedido.productos && typeof pedido.productos === "string") {
    const lineas = pedido.productos.split("\n");

    productosFinales = lineas.map((linea) => {
      try {
        // 1. Extraer instrucciones: lo que está entre ( )
        let instrucciones = "";
        const matchParentesis = linea.match(/\(([^)]+)\)/);
        if (matchParentesis) {
          instrucciones = matchParentesis[1]; // "Sin plátano amarillo"
        }

        // 2. Limpiar la línea de las instrucciones para procesar el resto
        const lineaLimpia = linea.replace(/\s*\([^)]+\)/, "").trim();

        // 3. Separar por el guion para el precio
        const partes = lineaLimpia.split(" - ");
        const precioTexto = partes[1]?.replace("$", "").trim() || "0";
        const precioUnitario = parseFloat(precioTexto);

        // 4. Separar por " x" para nombre y cantidad
        const nombreCant = partes[0];
        const subPartes = nombreCant.split(" x");
        const nombre = subPartes[0].trim();
        const cantidad = parseInt(subPartes[1]) || 1;

        return {
          nombre: nombre,
          cantidad: cantidad,
          precio: precioUnitario,
          instrucciones: instrucciones, // <-- AQUÍ SE GUARDAN LAS NOTAS
        };
      } catch (e) {
        return { nombre: linea, cantidad: 1, precio: 0, instrucciones: "" };
      }
    });
  }
  // SI ES UN PEDIDO NUEVO (Viene del carrito)
  else if (cart && cart.length > 0) {
    productosFinales = cart.map((item) => ({
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.precio,
      instrucciones: item.nota || "",
    }));
  }

  if (productosFinales.length === 0) {
    alert("No se encontraron productos para imprimir.");
    return;
  }

  const datosFactura = {
    cliente: {
      nombre: pedido.nombre || "Consumidor Final",
      telefono: pedido.telefono || "0",
      direccion: pedido.direccion || "",
      referencia: pedido.puntoReferencia || "",
    },
    pedido: {
      numero: pedido.numeroFactura,
      fecha: pedido.fecha,
      hora: pedido.hora,
      metodo: pedido.metodoPago,
      entrega: pedido.tipoEntrega,
      mesa: pedido.mesa || "0",
    },
    itemsPedido: productosFinales,
    costoDom: pedido.costoDomicilio || 0,
    total: pedido.totalPagar,
    resumen: {
      subtotal: pedido.totalProductos,
    },
    observaciones: pedido.observaciones || "",
    ubicacionGoogleMaps: pedido.ubicacionGoogleMaps || "",
  };

  localStorage.setItem("datosFacturaPOS", JSON.stringify(datosFactura));
  window.open("POSfactura.html", "_blank");
}
window.onload = init;

function ejecutarImpresionSilenciosa(pedido) {
  let productosFinales = [];

  if (typeof cart !== "undefined" && cart.length > 0) {
    productosFinales = cart.map((item) => {
      // Buscamos la cantidad en cualquiera de estos nombres comunes
      // Probamos con 'cant' que es el que usa tu función addToCart
      const cantidadReal = item.cant || item.cantidad || item.qty || 1;

      return {
        nombre: item.nombre || "Producto",
        cantidad: parseInt(cantidadReal),
        precio: parseFloat(item.precio) || 0,
        instrucciones: item.nota || "",
      };
    });
  }

  const datosFactura = {
    cliente: {
      nombre: pedido.nombre || "Consumidor Final",
      telefono: pedido.telefono || "0",
      direccion: pedido.direccion || "",
      referencia: pedido.puntoReferencia || "",
    },
    pedido: {
      numero: pedido.numeroFactura,
      fecha: pedido.fecha,
      hora: pedido.hora,
      metodo: pedido.metodoPago,
      entrega: pedido.tipoEntrega,
      mesa: pedido.mesa || "0",
    },
    itemsPedido: productosFinales,
    costoDom: pedido.costoDomicilio || 0,
    total: pedido.totalPagar,
    resumen: { subtotal: pedido.totalProductos },
    observaciones: pedido.observaciones || "",
    ubicacionGoogleMaps: pedido.ubicacionGoogleMaps || "",
  };

  // Guardar para que POSfactura.html lo lea
  localStorage.setItem("datosFacturaPOS", JSON.stringify(datosFactura));

  let iframe = document.getElementById("silent-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "silent-print-frame";
    iframe.style.display = "none";
    document.body.appendChild(iframe);
  }

  iframe.src = "POSfactura.html";

  iframe.onload = function () {
    setTimeout(() => {
      iframe.contentWindow.print();
      // Recargar después de imprimir
      setTimeout(() => {
        location.reload();
      }, 1000);
    }, 700); // Un poco más de tiempo para asegurar renderizado
  };
}

function resetInactivityTimer() {
  // Si el sistema ya está en pantalla negra, no hacemos nada aquí
  // (esperamos el clic para recargar)
  if (sistemaSuspendido) return;

  clearTimeout(timeoutInactividad);

  timeoutInactividad = setTimeout(
    () => {
      mostrarPantallaSuspension();
    },
    5 * 60 * 1000,
  ); // 5 Minutos
}

function mostrarPantallaSuspension() {
  sistemaSuspendido = true;
  const overlay = document.getElementById("overlay-suspension");
  if (overlay) {
    overlay.style.display = "flex";
  }
}

// Escuchar interacciones
["mousedown", "mousemove", "keypress", "scroll", "touchstart"].forEach(
  (evt) => {
    document.addEventListener(evt, resetInactivityTimer, true);
  },
);
