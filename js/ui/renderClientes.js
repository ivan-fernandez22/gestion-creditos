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
        if (estado === "urgente") return "bg-rose-200 text-rose-800";
        if (estado === "atrasado") return "bg-rose-200 text-rose-800";
        return "bg-emerald-100 text-emerald-700";
    }

    function claseTarjetaCredito(estado) {
        if (estado === "finalizado") {
            return "bg-emerald-50 border-emerald-200 hover:border-emerald-300";
        }
        if (estado === "urgente") {
            return "bg-rose-100 border-2 border-rose-400 hover:border-rose-500 shadow-[0_0_0_3px_rgba(251,113,133,0.25)]";
        }
        if (estado === "atrasado") {
            return "bg-rose-100 border-2 border-rose-400 hover:border-rose-500 shadow-[0_0_0_3px_rgba(251,113,133,0.25)]";
        }
        return "bg-slate-100 border-slate-200 hover:border-slate-300";
    }

    // Colores de la etiqueta de estado general de cliente.
    function colorEstadoCliente(estado) {
        if (estado === "finalizado") return "bg-slate-300 text-slate-700";
        if (estado === "urgente") return "bg-rose-200 text-rose-800";
        if (estado === "atrasado") return "bg-rose-200 text-rose-800";
        if (estado === "activo") return "bg-emerald-100 text-emerald-700";
        return "bg-slate-100 text-slate-600";
    }

    function obtenerEstadoVisualCredito(credito) {
        const historial = credito?.historialSemanal || [];
        const totalDiferenciaContra = historial.length
            ? historial[historial.length - 1].diferenciaContraAcumulada
            : 0;
        const hoyISO = (() => {
            const hoy = new Date();
            const year = hoy.getFullYear();
            const month = String(hoy.getMonth() + 1).padStart(2, "0");
            const day = String(hoy.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        })();
        const diferenciaSemanaActual = Number(credito?.diferenciaContraSemanaActual || 0);
        const cuotas = Array.isArray(credito?.cuotas) ? credito.cuotas : [];
        const hayVencidas = cuotas.some((cuota) => {
            if (!cuota.fechaVencimiento) return false;
            if (cuota.estado === "parcial") return false;
            return cuota.fechaVencimiento < hoyISO && Number(cuota.saldoPendiente || 0) > 0;
        });
        const faltaPagoEnFecha = false;

        if (
            faltaPagoEnFecha ||
            diferenciaSemanaActual > 20000 ||
            Number(totalDiferenciaContra || 0) > 30000
        ) {
            return "urgente";
        }

        if (hayVencidas) {
            return "urgente";
        }

        return credito.estado === "atrasado" ? "urgente" : credito.estado;
    }

    // Estado visual calculado desde los creditos mostrados en pantalla.
    function obtenerEstadoVisualCliente(creditos) {
        if (!Array.isArray(creditos) || !creditos.length) return "inactivo";
        if (creditos.every((credito) => obtenerEstadoVisualCredito(credito) === "finalizado")) return "finalizado";
        if (creditos.some((credito) => obtenerEstadoVisualCredito(credito) === "urgente")) return "urgente";
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
                urgente: 0,
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
                    ? "urgente"
                    : "finalizado";

        return clientes
            .map((cliente) => {
                const creditosFiltrados = cliente.creditos.filter((credito) => {
                    const estadoCredito = obtenerEstadoVisualCredito(credito);
                    if (estadoObjetivo === "urgente") {
                        return estadoCredito === "urgente";
                    }
                    return estadoCredito === estadoObjetivo;
                });

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

        const prioridadEstado = {
            urgente: 0,
            activo: 1,
            finalizado: 2,
            inactivo: 3
        };

        const creditosOrdenados = [...creditos].sort((a, b) => {
            const estadoA = obtenerEstadoVisualCredito(a);
            const estadoB = obtenerEstadoVisualCredito(b);
            const prioridadA = prioridadEstado[estadoA] ?? 99;
            const prioridadB = prioridadEstado[estadoB] ?? 99;

            if (prioridadA !== prioridadB) return prioridadA - prioridadB;
            return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
        });

        return creditosOrdenados
            .map((credito) => {
                const historialSemanal = credito.historialSemanal || [];
                const totalRecaudado = historialSemanal.length
                    ? historialSemanal[historialSemanal.length - 1].recaudadoAcumulado
                    : 0;
                const totalGanancia = historialSemanal.length
                    ? historialSemanal[historialSemanal.length - 1].gananciaAcumulada
                    : 0;
                const quedaDevolver = Math.max(0, Number(credito.montoTotal || 0) - Number(totalRecaudado || 0));
                const totalDiferenciaContra = historialSemanal.length
                    ? historialSemanal[historialSemanal.length - 1].diferenciaContraAcumulada
                    : 0;
                const diferenciaContraUrgente = Number(totalDiferenciaContra || 0) > 20000;

                const estadoVisualCredito = obtenerEstadoVisualCredito(credito);

                return `
                    <div class="rounded-3xl border p-5 group transition-all credito-card ${claseTarjetaCredito(estadoVisualCredito)}">
                        <div class="flex items-center justify-between gap-2 credito-buttons mb-4 pb-4 border-b border-slate-100">
                            <div></div>
                            <div class="flex items-center gap-2">
                                <button data-action="editar-credito" data-credito-id="${credito.id}" data-credito-nombre="${credito.nombre}" class="p-2 bg-white text-slate-500 hover:text-slate-700 rounded-xl shadow-sm border border-slate-100 transition-all active:scale-90" title="Editar crédito">
                                    <i data-lucide="pencil" class="w-5 h-5"></i>
                                </button>
                                <button data-action="eliminar-credito" data-credito-id="${credito.id}" data-credito-nombre="${credito.nombre}" class="p-2 bg-white text-rose-500 hover:text-rose-700 rounded-xl shadow-sm border border-slate-100 transition-all active:scale-90" title="Eliminar crédito">
                                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                                </button>
                                <button data-action="ver-desglose" data-credito-id="${credito.id}" data-cliente-id="${credito.clienteId}" class="p-2 bg-white text-slate-600 hover:text-oro rounded-xl shadow-sm border border-slate-100 transition-all active:scale-90" title="Ver desglose">
                                    <i data-lucide="eye" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <div class="credito-top">
                            <div class="credito-top-left">
                                <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre del Préstamo</p>
                                <p class="text-lg font-black text-slate-800 italic mb-3">"${credito.nombre}"</p>
                                <div class="flex flex-wrap gap-4">
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase">Pidió</p>
                                        <p class="text-base font-black text-slate-700">${formatearMoneda(credito.montoSolicitado)}</p>
                                    </div>
                                    <div>
                                        <p class="text-[10px] font-bold text-oro uppercase">Devuelve</p>
                                        <p class="text-base font-black text-oro">${formatearMoneda(credito.montoTotal)}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="credito-top-right">
                                <div class="flex flex-wrap gap-4 mb-3">
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase">Plan</p>
                                        <p class="text-sm font-bold text-slate-700">${credito.plan} días (${credito.tasaInteres}%)</p>
                                    </div>
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase">Cuota</p>
                                        <p class="text-sm font-bold text-slate-700">${formatearMoneda(credito.valorCuota)}</p>
                                    </div>
                                </div>
                                <div class="flex gap-6">
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Inicio</p>
                                        <p class="text-sm font-black text-oro">${credito.fechaInicio || "-"}</p>
                                    </div>
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Fin</p>
                                        <p class="text-sm font-black text-emerald-600">${credito.fechaFin || "-"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="credito-body credito-grid">
                            <div class="space-y-3">
                                <div>
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
                                    <span class="text-[11px] font-bold text-oro uppercase">Queda devolver</span>
                                    <span class="text-sm font-black text-oro">${formatearMoneda(quedaDevolver)}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold text-slate-800 uppercase">Acumulado total</span>
                                    <span class="text-sm font-black text-slate-800">${formatearMoneda(totalRecaudado)}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold text-slate-800 uppercase">Acumulado esta semana</span>
                                    <span class="text-sm font-black text-slate-800">${formatearMoneda(credito.recaudadoSemanaActual)}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold text-emerald-700 uppercase">Ganancia total</span>
                                    <span class="text-sm font-black text-emerald-700">+${formatearMoneda(totalGanancia)}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold text-emerald-600 uppercase">Ganancia semanal(15%)</span>
                                    <span class="text-sm font-black text-emerald-700">+${formatearMoneda(credito.gananciaSemanaActual)}</span>
                                </div>
                                <div class="flex justify-between items-center border-t border-slate-50 pt-2">
                                    <span class="text-[11px] font-bold text-rose-500 uppercase tracking-tighter">Debe (Esta semana)</span>
                                    <span class="text-sm font-black text-rose-700">${formatearMoneda(credito.deudaSemanaActual)}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold text-rose-500 uppercase tracking-tighter">Diferencia en contra semanal</span>
                                    <span class="text-sm font-black text-rose-700">${formatearMoneda(credito.diferenciaContraSemanaActual || 0)}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[11px] font-bold ${diferenciaContraUrgente ? "text-rose-500" : "text-rose-500"} uppercase tracking-tighter">Diferencia en contra total</span>
                                    <span class="text-sm font-black ${diferenciaContraUrgente ? "text-rose-300" : "text-rose-700"}">
                                        ${formatearMoneda(totalDiferenciaContra || 0)}${diferenciaContraUrgente ? " · Urgente" : ""}
                                    </span>
                                </div>
                                <div class="pt-1">
                                    <span class="${estadoVisualCredito === "urgente" ? "text-[11px] px-3 py-1.5 shadow-sm" : "text-[10px] px-2 py-1"} rounded-full font-bold uppercase inline-flex items-center gap-1 ${colorEstado(estadoVisualCredito)}">
                                        ${estadoVisualCredito === "urgente" ? "<span class=\"w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse shadow-[0_0_0_6px_rgba(251,113,133,0.25)]\"></span>" : ""}
                                        ${estadoVisualCredito}
                                    </span>
                                </div>

                                <div class="border-t border-slate-100 pt-2">
                                    <p class="text-[10px] font-bold text-slate-500 uppercase mb-2">Historial semanal</p>
                                    <div class="max-h-32 overflow-y-auto pr-1 space-y-1 historial-semanal">
                                        ${historialSemanal
                                            .map(
                                                (semana) => `
                                                    <div class="text-[11px] bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 historial-item">
                                                        <div class="flex justify-between items-center text-slate-600 font-semibold">
                                                            <span>Sem ${semana.semana}</span>
                                                            <span>${formatearMoneda(semana.recaudado)}</span>
                                                        </div>
                                                        <div class="flex justify-between items-center text-[10px] text-rose-600">
                                                            <span>Dif. en contra</span>
                                                            <span>${formatearMoneda(semana.diferenciaContra || 0)}</span>
                                                        </div>
                                                        <div class="flex justify-between items-center text-[10px] text-emerald-700">
                                                            <span>Ganancia</span>
                                                            <span>+${formatearMoneda(semana.ganancia || 0)}</span>
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
                `;
            })
            .join("");
    }

            // Sincroniza apariencia de botones de filtro.
    function actualizarBotonesFiltro(botonesFiltro, filtroEstadoActual) {
        botonesFiltro.forEach((boton) => {
            const esActivo = boton.dataset.filtro === filtroEstadoActual;

            boton.classList.remove(
                "bg-oro",
                "text-white",
                "shadow-md",
                "border",
                "border-slate-200",
                "bg-white",
                "text-slate-500",
                "text-rose-500",
                "hover:bg-slate-50",
                "hover:bg-rose-50",
                "hover:bg-oro"
            );

            if (esActivo) {
                boton.classList.add("bg-oro", "text-white", "shadow-md", "hover:bg-oro");
            } else {
                boton.classList.add("bg-white", "border", "border-slate-200");
                if (boton.dataset.filtro === "urgentes") {
                    boton.classList.add("text-rose-500", "hover:bg-rose-50");
                } else {
                    boton.classList.add("text-slate-500", "hover:bg-slate-50");
                }
            }
        });
    }

    // Punto de entrada principal del modulo para pintar todo el listado.
    async function renderClientes(params) {
        const {
            contenedorClientes,
            adminId,
            filtroTexto,
            filtroEstado
        } = params;

        if (!contenedorClientes) return;

        const clientesTotales = await window.Logic.obtenerClientesConResumen(adminId);
        const clientesPorNombre = await window.Logic.buscarClientesPorNombre(adminId, filtroTexto);
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
                    <div class="p-6 rounded-[2.5rem] border shadow-sm cliente-card ${estadoVisual === "urgente" ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"}">
                        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-slate-100 cliente-header">
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
                                <button data-action="editar-cliente" data-cliente-id="${cliente.id}" data-cliente-dni="${cliente.dni}" data-cliente-nombre="${cliente.nombre}" data-cliente-apellido="${cliente.apellido}" data-cliente-telefono="${cliente.telefono}" data-cliente-direccion-real="${cliente.direccionReal || ""}" data-cliente-direccion-comercio="${cliente.direccionComercio || ""}" data-cliente-rubro="${cliente.rubro || ""}" class="p-2 text-slate-400 hover:text-oro transition-all" title="Editar cliente">
                                    <i data-lucide="pencil" class="w-5 h-5"></i>
                                </button>
                                <button data-action="eliminar-cliente" data-cliente-id="${cliente.id}" data-cliente-nombre="${cliente.nombre} ${cliente.apellido}" class="p-2 text-rose-500 hover:text-rose-700 transition-all" title="Eliminar cliente">
                                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <h4 class="text-[14px] uppercase font-black text-slate-500 tracking-widest">Créditos Asociados</h4>
                                <button type="button" data-action="toggle-creditos" data-target="creditos-${cliente.id}" class="btn-toggle-creditos inline-flex items-center gap-1 text-xs font-bold bg-slate-300 text-slate-800 hover:bg-slate-300 px-2.5 py-1.5 rounded-full whitespace-nowrap">
                                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform"></i>
                                    <span class="js-toggle-text">Ver mas</span>
                                </button>
                            </div>
                            <div id="creditos-${cliente.id}" class="hidden space-y-6 creditos-grid">
                                ${renderCreditos(cliente.creditos)}
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-3 mt-4">
                            <button data-action="agregar-credito" data-cliente-id="${cliente.id}" data-cliente-dni="${cliente.dni}" data-cliente-nombre="${cliente.nombre}" data-cliente-apellido="${cliente.apellido}" class="flex items-center justify-center gap-2 py-3 bg-emerald-100 text-emerald-700 rounded-2xl font-bold text-xs uppercase hover:bg-emerald-200 transition-all">
                                <i data-lucide="plus-circle" class="w-4 h-4"></i> Nuevo Crédito
                            </button>
                            <button data-action="agregar-pago" data-cliente-id="${cliente.id}" data-cliente-dni="${cliente.dni}" data-cliente-nombre="${cliente.nombre}" data-cliente-apellido="${cliente.apellido}" class="flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-2xl font-bold text-xs uppercase hover:bg-black shadow-lg active:scale-95 transition-all">
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
