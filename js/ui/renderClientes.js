"use strict";

(function () {
    // Modulo de UI del listado: solo formatea y renderiza tarjetas de cliente/credito.

    // Formato moneda uniforme para toda la vista.
    function formatearMoneda(valor) {
        return new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            minimumFractionDigits: 2
        }).format(Number(valor || 0));
    }

    function colorEstado(estado) {
        if (estado === "finalizado") return "bg-slate-200 text-slate-700";
        if (estado === "atrasado") return "bg-rose-100 text-rose-700";
        return "bg-emerald-100 text-emerald-700";
    }

    function claseTarjetaCredito(estado) {
        if (estado === "finalizado") {
            return "bg-emerald-50 border-emerald-200 hover:border-emerald-300";
        }
        if (estado === "atrasado") {
            return "bg-rose-50 border-rose-200 hover:border-rose-300";
        }
        return "bg-slate-100 border-slate-200 hover:border-slate-300";
    }

    // Colores de la etiqueta de estado general de cliente.
    function colorEstadoCliente(estado) {
        if (estado === "finalizado") return "bg-slate-300 text-slate-700";
        if (estado === "atrasado") return "bg-rose-100 text-rose-700";
        if (estado === "activo") return "bg-emerald-100 text-emerald-700";
        return "bg-slate-100 text-slate-600";
    }

    // Estado visual calculado desde los creditos mostrados en pantalla.
    function obtenerEstadoVisualCliente(creditos) {
        if (!Array.isArray(creditos) || !creditos.length) return "inactivo";
        if (creditos.every((credito) => credito.estado === "finalizado")) return "finalizado";
        if (creditos.some((credito) => credito.estado === "atrasado")) return "atrasado";
        return "activo";
    }

    // Fallback de porcentaje usado si la API no trae avance precalculado.
    function porcentajeAvance(pagas, total) {
        if (!total) return 0;
        return Math.round((pagas / total) * 100);
    }

    function armarLinkWhatsApp(telefono) {
        const numero = String(telefono || "").replace(/\D/g, "");
        if (!numero) return "https://wa.me/";

        const completo = numero.startsWith("54") ? numero : "54" + numero;
        return "https://wa.me/" + completo;
    }

    function escaparHtml(valor) {
        return String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Aplica filtro por estado y orden por prioridad cuando se muestra "todos".
    function aplicarFiltroEstado(clientes, filtroEstado) {
        if (filtroEstado === "todos") {
            const prioridadEstado = {
                atrasado: 0,
                activo: 1,
                finalizado: 2,
                inactivo: 3
            };

            return [...clientes].sort((a, b) => {
                const estadoA = obtenerEstadoVisualCliente(a.creditos);
                const estadoB = obtenerEstadoVisualCliente(b.creditos);
                const prioridadA = prioridadEstado[estadoA] ?? 99;
                const prioridadB = prioridadEstado[estadoB] ?? 99;

                if (prioridadA !== prioridadB) return prioridadA - prioridadB;

                const nombreA = `${a.nombre || ""} ${a.apellido || ""}`.trim();
                const nombreB = `${b.nombre || ""} ${b.apellido || ""}`.trim();
                return nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
            });
        }

        const estadoObjetivo =
            filtroEstado === "activos"
                ? "activo"
                : filtroEstado === "urgentes"
                    ? "atrasado"
                    : "finalizado";

        return clientes
            .map((cliente) => {
                const creditosFiltrados = cliente.creditos.filter(
                    (credito) => credito.estado === estadoObjetivo
                );

                if (!creditosFiltrados.length) return null;

                return {
                    ...cliente,
                    creditos: creditosFiltrados,
                    totalCreditos: creditosFiltrados.length,
                    deudaTotal: creditosFiltrados.reduce((acc, credito) => acc + Number(credito.deuda || 0), 0)
                };
            })
            .filter(Boolean);
    }

            // Renderiza la grilla interna de creditos por cliente.
    function renderCreditos(creditos) {
        if (!creditos.length) {
            return `
                <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                    <p class="text-sm font-bold text-slate-600">Este cliente no tiene créditos cargados.</p>
                    <p class="text-xs text-slate-500 mt-1">Para empezar, crea un crédito desde el formulario <strong>Nuevo Crédito</strong> usando su DNI.</p>
                </div>
            `;
        }

        return creditos
            .map(
                (credito) => `
                    <div class="relative rounded-3xl border p-5 group transition-all ${claseTarjetaCredito(credito.estado)}">
                        <div class="absolute top-4 right-4 flex items-center gap-2 z-10">
                            <button data-action="eliminar-credito" data-credito-id="${credito.id}" data-credito-nombre="${credito.nombre}" class="p-2 bg-white text-rose-500 hover:text-rose-700 rounded-xl shadow-sm border border-slate-100 transition-all active:scale-90" title="Eliminar crédito">
                                <i data-lucide="trash-2" class="w-5 h-5"></i>
                            </button>
                            <button onclick="verDesglose()" class="p-2 bg-white text-slate-600 hover:text-oro rounded-xl shadow-sm border border-slate-100 transition-all active:scale-90" title="Ver desglose">
                                <i data-lucide="eye" class="w-5 h-5"></i>
                            </button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-3">
                                <div>
                                    <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre del Préstamo</p>
                                    <p class="text-sm font-bold text-slate-700 italic">"${credito.nombre}"</p>
                                </div>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase">Pidió</p>
                                        <p class="text-base font-black text-slate-700">${formatearMoneda(credito.montoSolicitado)}</p>
                                    </div>
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase text-oro">Devuelve</p>
                                        <p class="text-base font-black text-oro">${formatearMoneda(credito.montoTotal)}</p>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-3 border-y md:border-y-0 md:border-x border-slate-200 py-4 md:py-0 md:px-6">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="text-[12px] font-bold text-slate-500 uppercase italic">Plan ${credito.plan} días (${credito.tasaInteres}%)</p>
                                        <p class="text-[12px] font-bold text-slate-500 uppercase mt-1">Valor Cuota: <span class="text-slate-700 font-black">${formatearMoneda(credito.valorCuota)}</span></p>
                                    </div>
                                </div>

                                <div class="flex justify-between gap-2 border-t border-slate-100 pt-2">
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase">Inicio</p>
                                        <p class="text-[12px] font-bold text-slate-700">${credito.fechaInicio || "-"}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-[10px] font-bold text-slate-500 uppercase">Fin</p>
                                        <p class="text-[12px] font-bold text-emerald-800">${credito.fechaFin || "-"}</p>
                                    </div>
                                </div>

                                <div class="pt-1">
                                    <div class="flex justify-between text-[11px] font-bold uppercase mb-1">
                                        <span class="text-emerald-600">Pagas: ${credito.pagas}</span>
                                        <span class="text-rose-500">Impagas: ${credito.impagas}</span>
                                    </div>
                                    <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                        <div class="bg-emerald-500 h-1.5 rounded-full" style="width: ${Math.max(0, Math.min(100, Number(credito.avancePorcentaje ?? porcentajeAvance(credito.pagas, credito.cantidadCuotas))))}%"></div>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col justify-center space-y-3">
                                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                                    <span class="text-[10px] font-bold text-slate-500 uppercase">Semana actual</span>
                                    <span class="text-[11px] font-black text-slate-700">Semana ${credito.semanaActual} de ${credito.totalSemanas}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold text-slate-500 uppercase">Semanal</span>
                                    <span class="text-sm font-black text-slate-800">${formatearMoneda(credito.recaudadoSemanaActual)}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold text-emerald-600 uppercase">Ganancia (15%)</span>
                                    <span class="text-sm font-black text-emerald-700">+${formatearMoneda(credito.gananciaSemanaActual)}</span>
                                </div>
                                <div class="flex justify-between items-center border-t border-slate-50 pt-2">
                                    <span class="text-[11px] font-bold text-rose-500 uppercase tracking-tighter">Debe (Esta semana)</span>
                                    <span class="text-sm font-black text-rose-700">${formatearMoneda(credito.deudaSemanaActual)}</span>
                                </div>
                                <div class="pt-1">
                                    <span class="text-[10px] px-2 py-1 rounded-full font-bold uppercase ${colorEstado(credito.estado)}">${credito.estado}</span>
                                </div>

                                <div class="border-t border-slate-100 pt-2">
                                    <p class="text-[10px] font-bold text-slate-500 uppercase mb-2">Historial semanal acumulado</p>
                                    <div class="max-h-32 overflow-y-auto pr-1 space-y-1">
                                        ${(credito.historialSemanal || [])
                                            .map(
                                                (semana) => `
                                                    <div class="text-[11px] bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
                                                        <div class="flex justify-between items-center text-slate-600 font-semibold">
                                                            <span>Sem ${semana.semana}</span>
                                                            <span>${formatearMoneda(semana.recaudado)}</span>
                                                        </div>
                                                        <div class="flex justify-between items-center text-[10px] text-slate-500">
                                                            <span>Acum.</span>
                                                            <span>${formatearMoneda(semana.recaudadoAcumulado)}</span>
                                                        </div>
                                                    </div>
                                                `
                                            )
                                            .join("")}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `
            )
            .join("");
    }

            // Sincroniza apariencia de botones de filtro.
    function actualizarBotonesFiltro(botonesFiltro, filtroEstadoActual) {
        botonesFiltro.forEach((boton) => {
            const esActivo = boton.dataset.filtro === filtroEstadoActual;

            boton.classList.remove("bg-oro", "text-white", "shadow-md", "border", "border-slate-200", "bg-white", "text-slate-500", "text-rose-500");

            if (esActivo) {
                boton.classList.add("bg-oro", "text-white", "shadow-md");
            } else {
                boton.classList.add("bg-white", "border", "border-slate-200");
                if (boton.dataset.filtro === "urgentes") {
                    boton.classList.add("text-rose-500");
                } else {
                    boton.classList.add("text-slate-500");
                }
            }
        });
    }

    // Punto de entrada principal del modulo para pintar todo el listado.
    function renderClientes(params) {
        const {
            contenedorClientes,
            adminId,
            filtroTexto,
            filtroEstado
        } = params;

        if (!contenedorClientes) return;

        const clientesTotales = window.Logic.obtenerClientesConResumen(adminId);
        const clientesPorNombre = window.Logic.buscarClientesPorNombre(adminId, filtroTexto);
        const clientes = aplicarFiltroEstado(clientesPorNombre, filtroEstado);

        if (!clientes.length) {
            let titulo = "No hay clientes para mostrar";
            let detalle = "Prueba con otro filtro o cambia la búsqueda.";

            if (!clientesTotales.length) {
                titulo = "Todavía no tienes clientes cargados";
                detalle = "Completa el formulario \"Cargar Usuario\" para crear tu primer cliente.";
            } else if (filtroTexto && !clientesPorNombre.length) {
                titulo = "No se encontraron resultados para tu búsqueda";
                detalle = `No hay coincidencias para \"${escaparHtml(filtroTexto)}\". Revisa ortografía o prueba sin acentos.`;
            } else if (filtroEstado !== "todos") {
                const etiquetaFiltro =
                    filtroEstado === "activos"
                        ? "Activos"
                        : filtroEstado === "urgentes"
                            ? "Urgentes"
                            : "Finalizados";
                titulo = `No hay clientes en el filtro ${etiquetaFiltro}`;
                detalle = "Cambia al filtro \"Todos\" para ver el listado completo.";
            }

            contenedorClientes.innerHTML = `
                <div class="bg-white p-8 rounded-3xl border border-slate-200 text-center">
                    <p class="text-base font-bold text-slate-700">${titulo}</p>
                    <p class="text-sm text-slate-500 mt-2">${detalle}</p>
                </div>
            `;
            return;
        }

        contenedorClientes.innerHTML = clientes
            .map((cliente) => {
                const estadoVisual = obtenerEstadoVisualCliente(cliente.creditos);

                return `
                    <div class="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
                            <div>
                                <div class="flex items-center gap-3">
                                    <h3 class="text-xl font-bold text-slate-800">${cliente.nombre} ${cliente.apellido}</h3>
                                    <span class="text-[10px] ${colorEstadoCliente(estadoVisual)} px-2 py-0.5 rounded-full font-black uppercase">${estadoVisual}</span>
                                </div>
                                <p class="text-sm text-slate-400 font-medium">DNI: ${cliente.dni} • <span class="text-oro italic">Rubro: ${cliente.rubro || "-"}</span></p>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 mt-2">
                                    <p class="text-[11px] text-slate-500 flex items-center gap-1"><i data-lucide="home" class="w-3 h-3"></i> <strong>Real:</strong> ${cliente.direccionReal || "-"}</p>
                                    <p class="text-[11px] text-slate-500 flex items-center gap-1"><i data-lucide="store" class="w-3 h-3"></i> <strong>Comercio:</strong> ${cliente.direccionComercio || "-"}</p>
                                </div>
                            </div>
                            <div class="flex gap-2 w-full md:w-auto">
                                <a href="${armarLinkWhatsApp(cliente.telefono)}" target="_blank" rel="noopener noreferrer" class="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all">
                                    <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp
                                </a>
                                <button class="p-2 text-slate-400 hover:text-oro transition-all"><i data-lucide="pencil" class="w-5 h-5"></i></button>
                                <button data-action="eliminar-cliente" data-cliente-id="${cliente.id}" data-cliente-nombre="${cliente.nombre} ${cliente.apellido}" class="p-2 text-rose-500 hover:text-rose-700 transition-all" title="Eliminar cliente">
                                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <h4 class="text-[14px] flex justify-center items-center uppercase font-black text-slate-500 tracking-widest ml-2">Créditos Asociados</h4>
                            ${renderCreditos(cliente.creditos)}
                        </div>

                        <div class="grid grid-cols-2 gap-3 mt-4">
                            <button class="flex items-center justify-center gap-2 py-3 bg-emerald-100 text-emerald-700 rounded-2xl font-bold text-xs uppercase hover:bg-emerald-200 transition-all">
                                <i data-lucide="plus-circle" class="w-4 h-4"></i> Nuevo Crédito
                            </button>
                            <button class="flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-2xl font-bold text-xs uppercase hover:bg-black shadow-lg active:scale-95 transition-all">
                                <i data-lucide="circle-dollar-sign" class="w-4 h-4"></i> Registrar Pago
                            </button>
                        </div>
                    </div>
                `;
            })
            .join("");

        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
    }

    // API publica del modulo de interfaz de clientes.
    window.UIClientes = {
        actualizarBotonesFiltro,
        renderClientes
    };
})();
