"use strict";

(function () {
    if (!window.Logic) {
        throw new Error("Logic.js debe cargarse antes que Main.js");
    }

    const ADMIN_ID_ACTUAL = "admin-demo";

    const refs = {
        formCliente: document.getElementById("form-cliente"),
        formCredito: document.getElementById("form-credito"),
        formPago: document.getElementById("form-pago"),
        buscador: document.getElementById("buscador-clientes"),
        contenedorClientes: document.getElementById("contenedor-clientes"),
        nombrePago: document.getElementById("nombre-pago"),
        apellidoPago: document.getElementById("apellido-pago"),
        bloqueClienteHomonimo: document.getElementById("bloque-cliente-homonimo"),
        selectClientePago: document.getElementById("select-cliente-pago"),
        nroCuota: document.getElementById("nro-cuota"),
        infoCuotaPendiente: document.getElementById("info-cuota-pendiente"),
        selectCreditoPago: document.getElementById("select-credito-pago"),
        botonesFiltro: Array.from(document.querySelectorAll(".js-filtro-btn"))
    };

    let filtroTextoActual = "";
    let filtroEstadoActual = "todos";
    let clientePagoSeleccionadoId = "";

    function notificar(msg, tipo = "info", titulo = "Aviso") {
        if (window.Swal && typeof window.Swal.fire === "function") {
            window.Swal.fire({
                icon: tipo,
                title: titulo,
                text: msg,
                confirmButtonColor: "#c5a043"
            });
            return;
        }

        alert(msg);
    }

    function formatearMoneda(valor) {
        return new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            minimumFractionDigits: 2
        }).format(Number(valor || 0));
    }

    function colorEstado(estado) {
        if (estado === "finalizado") return "bg-emerald-100 text-emerald-700";
        if (estado === "atrasado") return "bg-rose-100 text-rose-700";
        return "bg-slate-100 text-slate-700";
    }

    function colorEstadoCliente(estado) {
        if (estado === "finalizado") return "bg-slate-300 text-slate-700";
        if (estado === "atrasado") return "bg-rose-100 text-rose-700";
        if (estado === "activo") return "bg-emerald-100 text-emerald-700";
        return "bg-slate-100 text-slate-600";
    }

    function obtenerEstadoVisualCliente(creditos) {
        if (!Array.isArray(creditos) || !creditos.length) return "inactivo";
        if (creditos.every((credito) => credito.estado === "finalizado")) return "finalizado";
        if (creditos.some((credito) => credito.estado === "atrasado")) return "atrasado";
        return "activo";
    }

    function porcentajeAvance(pagas, total) {
        if (!total) return 0;
        return Math.round((pagas / total) * 100);
    }

    function armarLinkWhatsApp(telefono) {
        const numero = String(telefono || "").replace(/\D/g, "");
        if (!numero) return "https://wa.me/";

        // Si no viene codigo de pais, usamos 54 por defecto para mantener la UX local.
        const completo = numero.startsWith("54") ? numero : "54" + numero;
        return "https://wa.me/" + completo;
    }

    function obtenerCuotaDeFormulario(creditoId, nroCuota) {
        const db = window.Logic.cargarDB();
        return (
            db.cuotas.find(
                (cuota) =>
                    cuota.adminID === ADMIN_ID_ACTUAL &&
                    cuota.creditoId === creditoId &&
                    Number(cuota.numero) === Number(nroCuota)
            ) || null
        );
    }

    function setInfoCuota(texto, tipo = "normal") {
        if (!refs.infoCuotaPendiente) return;

        refs.infoCuotaPendiente.textContent = texto;
        refs.infoCuotaPendiente.classList.remove("text-slate-500", "text-rose-600", "text-emerald-700");

        if (tipo === "error") {
            refs.infoCuotaPendiente.classList.add("text-rose-600");
        } else if (tipo === "ok") {
            refs.infoCuotaPendiente.classList.add("text-emerald-700");
        } else {
            refs.infoCuotaPendiente.classList.add("text-slate-500");
        }
    }

    function actualizarInfoCuotaPendiente() {
        if (!refs.selectCreditoPago || !refs.nroCuota) return;

        const creditoId = refs.selectCreditoPago.value;
        const nroCuota = Number(refs.nroCuota.value);

        if (!creditoId) {
            setInfoCuota("Selecciona un crédito para ver el saldo pendiente de la cuota.");
            return;
        }

        if (!nroCuota || nroCuota <= 0) {
            setInfoCuota("Ingresa o usa la cuota sugerida para ver el saldo pendiente.");
            return;
        }

        const cuota = obtenerCuotaDeFormulario(creditoId, nroCuota);
        if (!cuota) {
            setInfoCuota(`No existe la cuota ${nroCuota} para este crédito.`, "error");
            return;
        }

        if (Number(cuota.saldoPendiente) <= 0.01) {
            setInfoCuota(`La cuota ${cuota.numero} ya está cancelada.`, "ok");
            return;
        }

        setInfoCuota(
            `Saldo pendiente cuota ${cuota.numero}: ${formatearMoneda(cuota.saldoPendiente)}`,
            "ok"
        );
    }

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

    function actualizarBotonesFiltro() {
        refs.botonesFiltro.forEach((boton) => {
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

    function renderCreditos(creditos) {
        if (!creditos.length) {
            return '<p class="text-xs text-slate-400">Sin creditos cargados.</p>';
        }

        return creditos
            .map(
                (credito) => `
                    <div class="relative bg-slate-50 rounded-3xl border border-slate-100 p-5 group hover:border-oro/30 transition-all">
                        <button onclick="verDesglose()" class="absolute top-4 right-4 p-2 bg-white text-slate-600 hover:text-oro rounded-xl shadow-sm border border-slate-100 transition-all z-10 active:scale-90">
                            <i data-lucide="eye" class="w-5 h-5"></i>
                        </button>

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

    function renderClientes() {
        if (!refs.contenedorClientes) return;

        const clientesPorNombre = window.Logic.buscarClientesPorNombre(ADMIN_ID_ACTUAL, filtroTextoActual);
        const clientes = aplicarFiltroEstado(clientesPorNombre, filtroEstadoActual);

        if (!clientes.length) {
            refs.contenedorClientes.innerHTML = `
                <div class="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-500 font-semibold">
                    No hay clientes para mostrar.
                </div>
            `;
        return;
    }

    refs.contenedorClientes.innerHTML = clientes
        .map(
            (cliente) => {
                const estadoVisual = obtenerEstadoVisualCliente(cliente.creditos);
                let claseTarjeta = "bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm";

                if (estadoVisual === "finalizado") {
                    claseTarjeta = "bg-emerald-50 p-6 rounded-[2.5rem] border border-emerald-300 shadow-sm";
                } else if (estadoVisual === "atrasado") {
                    claseTarjeta = "bg-rose-50 p-6 rounded-[2.5rem] border border-rose-200 shadow-sm";
                }

                return `
                    <div class="${claseTarjeta}">
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
            }
        )
        .join("");

        if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
        }
    }

    function cargarOpcionesCreditoPago() {
        if (!refs.selectCreditoPago || !refs.nombrePago || !refs.apellidoPago) return;

        const nombre = refs.nombrePago.value;
        const apellido = refs.apellidoPago.value;

        const resultado = window.Logic.listarCreditosPorNombreApellido(
            ADMIN_ID_ACTUAL,
            nombre,
            apellido
        );

        refs.selectCreditoPago.innerHTML = "";
        clientePagoSeleccionadoId = "";

        if (!nombre.trim() || !apellido.trim()) {
            refs.selectCreditoPago.innerHTML = '<option value="">Ingrese nombre y apellido primero...</option>';
            refs.selectCreditoPago.disabled = true;
            if (refs.bloqueClienteHomonimo) refs.bloqueClienteHomonimo.classList.add("hidden");
            if (refs.selectClientePago) {
                refs.selectClientePago.disabled = true;
                refs.selectClientePago.innerHTML = '<option value="">Selecciona cliente por DNI/teléfono...</option>';
            }
            actualizarCuotaSugerida();
            actualizarInfoCuotaPendiente();
            return;
        }

        if (resultado.coincidencias > 1) {
            refs.selectCreditoPago.innerHTML = '<option value="">Selecciona primero el cliente correcto</option>';
            refs.selectCreditoPago.disabled = true;

            if (refs.bloqueClienteHomonimo && refs.selectClientePago) {
                refs.bloqueClienteHomonimo.classList.remove("hidden");
                refs.selectClientePago.disabled = false;
                refs.selectClientePago.innerHTML = '<option value="">Selecciona cliente por DNI/teléfono...</option>';

                resultado.clientes.forEach((cliente) => {
                    const option = document.createElement("option");
                    option.value = cliente.id;
                    option.textContent = `${cliente.nombre} ${cliente.apellido} | DNI ${cliente.dni || "-"} | Tel ${cliente.telefono || "-"}`;
                    refs.selectClientePago.appendChild(option);
                });
            }

            actualizarCuotaSugerida();
            actualizarInfoCuotaPendiente();
            return;
        }

        if (refs.bloqueClienteHomonimo) refs.bloqueClienteHomonimo.classList.add("hidden");
        if (refs.selectClientePago) {
            refs.selectClientePago.disabled = true;
            refs.selectClientePago.innerHTML = '<option value="">Selecciona cliente por DNI/teléfono...</option>';
        }

        clientePagoSeleccionadoId = resultado.cliente ? resultado.cliente.id : "";
        cargarCreditosPorClienteSeleccionado();
    }

    function cargarCreditosPorClienteSeleccionado() {
        refs.selectCreditoPago.innerHTML = "";

        if (!clientePagoSeleccionadoId) {
            refs.selectCreditoPago.innerHTML = '<option value="">Selecciona primero el cliente correcto</option>';
            refs.selectCreditoPago.disabled = true;
            actualizarCuotaSugerida();
            actualizarInfoCuotaPendiente();
            return;
        }

        const creditos = window.Logic
            .listarCreditosPorClienteId(ADMIN_ID_ACTUAL, clientePagoSeleccionadoId)
            .filter((credito) => credito.estado !== "finalizado");

        if (!creditos.length) {
            refs.selectCreditoPago.innerHTML = '<option value="">No hay créditos activos para ese cliente</option>';
            refs.selectCreditoPago.disabled = true;
            actualizarCuotaSugerida();
            actualizarInfoCuotaPendiente();
            return;
        }

        refs.selectCreditoPago.disabled = false;
        refs.selectCreditoPago.innerHTML = '<option value="">Selecciona un credito</option>';

        creditos.forEach((credito) => {
            const proximaCuota = window.Logic.obtenerProximaCuotaPendiente(ADMIN_ID_ACTUAL, credito.id);
            const option = document.createElement("option");
            option.value = credito.id;
            option.textContent = `${credito.nombre} | Plan ${credito.plan} dias | Próx. cuota: ${proximaCuota ? proximaCuota.numero : "-"}`;
            refs.selectCreditoPago.appendChild(option);
        });

        // Selecciona automaticamente el primer credito disponible y sugiere la cuota.
        refs.selectCreditoPago.selectedIndex = 1;
        actualizarCuotaSugerida();
        actualizarInfoCuotaPendiente();
    }

    function actualizarCuotaSugerida() {
        if (!refs.nroCuota || !refs.selectCreditoPago) return;

        const creditoId = refs.selectCreditoPago.value;
        if (!creditoId) {
            refs.nroCuota.value = "";
            refs.nroCuota.placeholder = "N° Cuota (Auto sugerida)";
            actualizarInfoCuotaPendiente();
            return;
        }

        const proximaCuota = window.Logic.obtenerProximaCuotaPendiente(ADMIN_ID_ACTUAL, creditoId);
        if (!proximaCuota) {
            refs.nroCuota.value = "";
            refs.nroCuota.placeholder = "Sin cuotas pendientes";
            actualizarInfoCuotaPendiente();
            return;
        }

        refs.nroCuota.value = String(proximaCuota.numero);
        refs.nroCuota.placeholder = "N° Cuota (Auto sugerida)";
        actualizarInfoCuotaPendiente();
    } 

    function iniciarEventos() {
        if (refs.formCliente) {
            refs.formCliente.addEventListener("submit", (event) => {
                event.preventDefault();

                try {
                    window.Logic.crearCliente({
                        adminID: ADMIN_ID_ACTUAL,
                        nombre: document.getElementById("nombre").value,
                        apellido: document.getElementById("apellido").value,
                        dni: document.getElementById("dni").value,
                        telefono: document.getElementById("telefono").value,
                        direccionReal: document.getElementById("direccion-real").value,
                        direccionComercio: document.getElementById("direccion-comercio").value,
                        rubro: document.getElementById("rubro").value
                    });

                    refs.formCliente.reset();
                    renderClientes();
                    notificar("Cliente cargado correctamente.", "success", "Listo");
                } catch (error) {
                    notificar(error.message, "error", "Error");
                }
            });
        }

        if (refs.formCredito) {
            refs.formCredito.addEventListener("submit", (event) => {
                event.preventDefault();

            try {
                window.Logic.crearCredito({
                    adminID: ADMIN_ID_ACTUAL,
                    dniCliente: document.getElementById("dni-credito").value,
                    nombre: document.getElementById("nombre-credito").value,
                    plan: document.getElementById("plan-cuotas").value,
                    montoSolicitado: document.getElementById("monto-pedido").value,
                    fechaInicio: document.getElementById("fecha-inicio-credito").value
                });

                refs.formCredito.reset();
                renderClientes();
                cargarOpcionesCreditoPago();
                notificar("Credito cargado correctamente.", "success", "Listo");
            } catch (error) {
                notificar(error.message, "error", "Error");
            }
        });
    }

    if (refs.formPago) {
        refs.formPago.addEventListener("submit", (event) => {
            event.preventDefault();

            try {
                const resultado = window.Logic.registrarPago({
                    adminID: ADMIN_ID_ACTUAL,
                    clienteId: clientePagoSeleccionadoId,
                    nombreCliente: document.getElementById("nombre-pago").value,
                    apellidoCliente: document.getElementById("apellido-pago").value,
                    creditoId: document.getElementById("select-credito-pago").value,
                    nroCuota: document.getElementById("nro-cuota").value,
                    montoPagado: document.getElementById("monto-pagado").value,
                    fechaPago: document.getElementById("fecha-pago").value
                });

                refs.formPago.reset();
                clientePagoSeleccionadoId = "";
                refs.selectCreditoPago.disabled = true;
                refs.selectCreditoPago.innerHTML = '<option value="">Ingrese nombre y apellido primero...</option>';
                if (refs.bloqueClienteHomonimo) refs.bloqueClienteHomonimo.classList.add("hidden");
                if (refs.selectClientePago) {
                    refs.selectClientePago.disabled = true;
                    refs.selectClientePago.innerHTML = '<option value="">Selecciona cliente por DNI/teléfono...</option>';
                }
                if (refs.nroCuota) {
                    refs.nroCuota.value = "";
                    refs.nroCuota.placeholder = "N° Cuota (Auto sugerida)";
                }
                actualizarInfoCuotaPendiente();

                if (resultado.credito && resultado.credito.estado === "finalizado") {
                    filtroEstadoActual = "finalizados";
                    actualizarBotonesFiltro();
                    renderClientes();
                    notificar("El crédito se finalizó correctamente y fue enviado al filtro Finalizados.", "success", "Crédito Finalizado");
                } else {
                    renderClientes();
                    notificar("Pago registrado correctamente.", "success", "Listo");
                }
            } catch (error) {
                notificar(error.message, "error", "Error");
            }
        });
    }

    if (refs.nombrePago) {
        refs.nombrePago.addEventListener("input", cargarOpcionesCreditoPago);
        refs.nombrePago.addEventListener("blur", cargarOpcionesCreditoPago);
    }

    if (refs.apellidoPago) {
        refs.apellidoPago.addEventListener("input", cargarOpcionesCreditoPago);
        refs.apellidoPago.addEventListener("blur", cargarOpcionesCreditoPago);
    }

    if (refs.selectClientePago) {
        refs.selectClientePago.addEventListener("change", () => {
            clientePagoSeleccionadoId = refs.selectClientePago.value || "";
            cargarCreditosPorClienteSeleccionado();
        });
    }

    if (refs.selectCreditoPago) {
        refs.selectCreditoPago.addEventListener("change", actualizarCuotaSugerida);
    }

    if (refs.nroCuota) {
        refs.nroCuota.readOnly = false;
        refs.nroCuota.addEventListener("input", actualizarInfoCuotaPendiente);
        refs.nroCuota.addEventListener("blur", actualizarInfoCuotaPendiente);
    }

    if (refs.buscador) {
        refs.buscador.addEventListener("input", (event) => {
            filtroTextoActual = event.target.value;
            renderClientes();
        });
    }

    refs.botonesFiltro.forEach((boton) => {
        boton.addEventListener("click", () => {
            filtroEstadoActual = boton.dataset.filtro || "todos";
            actualizarBotonesFiltro();
            renderClientes();
        });
    });
}

window.filtrarClientes = function filtrarClientes(valor) {
    filtroTextoActual = valor;
    renderClientes();
};

window.verDesglose = function verDesglose() {
    notificar("El desglose detallado se implementara en el siguiente paso.", "info", "Próximamente");
};

iniciarEventos();
actualizarBotonesFiltro();
renderClientes();
actualizarInfoCuotaPendiente();
})();
