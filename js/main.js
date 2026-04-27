"use strict";

(function () {
    // MAIN.JS actua como orquestador:
    // conecta DOM + modulos de UI + logica de negocio.
    if (!window.Auth) throw new Error("auth.js debe cargarse antes que Main.js");
    if (!window.Logic) throw new Error("Logic.js debe cargarse antes que Main.js");
    if (!window.UIClientes) throw new Error("renderClientes.js debe cargarse antes que Main.js");
    if (!window.UIPagos) throw new Error("pagosForm.js debe cargarse antes que Main.js");

    const sesionActiva = window.Auth.obtenerSesion();
    if (!sesionActiva || !sesionActiva.adminId) {
        window.location.href = "login.html";
        return;
    }

    const ADMIN_ID_ACTUAL = sesionActiva.adminId;

    // Referencias centralizadas del DOM para evitar buscar nodos repetidamente.
    const refs = {
        formCliente: document.getElementById("form-cliente"),
        formCredito: document.getElementById("form-credito"),
        formPago: document.getElementById("form-pago"),
        buscador: document.getElementById("buscador-clientes"),
        contenedorClientes: document.getElementById("contenedor-clientes"),
        usuarioActual: document.getElementById("usuario-actual"),
        usuarioActualTexto: document.getElementById("usuario-actual-texto"),
        btnLogout: document.getElementById("btn-logout"),
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

    function construirMensajeErrorAccionable(msg) {
        const texto = String(msg || "Ocurrió un error inesperado.");

        if (texto.includes("DNI es obligatorio")) {
            return `${texto}\n\nCómo resolverlo: completa el campo DNI con solo números.`;
        }
        if (texto.includes("nombre es obligatorio")) {
            return `${texto}\n\nCómo resolverlo: completa el nombre del cliente antes de guardar.`;
        }
        if (texto.includes("apellido es obligatorio")) {
            return `${texto}\n\nCómo resolverlo: completa el apellido del cliente antes de guardar.`;
        }
        if (texto.includes("teléfono es obligatorio")) {
            return `${texto}\n\nCómo resolverlo: ingresa un teléfono válido para poder contactar al cliente.`;
        }
        if (texto.includes("dirección real es obligatoria")) {
            return `${texto}\n\nCómo resolverlo: completa la dirección real del cliente para continuar.`;
        }
        if (texto.includes("nombre del crédito es obligatorio")) {
            return `${texto}\n\nCómo resolverlo: escribe un nombre identificable para el crédito (ej: Préstamo 1).`;
        }
        if (texto.includes("Ya existe un cliente con ese DNI")) {
            return `${texto}\n\nCómo resolverlo: verifica si ya cargaste ese cliente o usa el DNI correcto.`;
        }
        if (texto.includes("No existe cliente para ese DNI")) {
            return `${texto}\n\nCómo resolverlo: primero crea el cliente y luego vuelve a cargar el crédito.`;
        }
        if (texto.includes("Plan invalido")) {
            return `${texto}\n\nCómo resolverlo: selecciona un plan disponible (12, 17, 24 o 30 días).`;
        }
        if (texto.includes("fecha de inicio")) {
            return `${texto}\n\nCómo resolverlo: elige una fecha válida para continuar.`;
        }
        if (texto.includes("seleccionar un crédito")) {
            return `${texto}\n\nCómo resolverlo: elige un crédito en el selector antes de confirmar el pago.`;
        }
        if (texto.includes("fecha de pago")) {
            return `${texto}\n\nCómo resolverlo: selecciona la fecha en la que se realizó el pago.`;
        }
        if (texto.includes("No existe una cuota pendiente")) {
            return `${texto}\n\nCómo resolverlo: revisa el crédito/cuota elegida o selecciona otra cuota pendiente.`;
        }
        if (texto.includes("monto supera el saldo pendiente")) {
            return `${texto}\n\nCómo resolverlo: ingresa un monto menor o igual al saldo pendiente informado.`;
        }
        if (texto.includes("No existe el cliente seleccionado para eliminar")) {
            return `${texto}\n\nCómo resolverlo: actualiza la pantalla y vuelve a intentarlo.`;
        }
        if (texto.includes("No existe el crédito seleccionado para eliminar")) {
            return `${texto}\n\nCómo resolverlo: actualiza la pantalla y vuelve a intentarlo.`;
        }

        return `${texto}\n\nCómo resolverlo: revisa los datos ingresados e intenta nuevamente.`;
    }

    // Capa de notificaciones con fallback a alert nativo.
    function notificar(msg, tipo = "info", titulo = "Aviso") {
        const mensajeFinal = tipo === "error" ? construirMensajeErrorAccionable(msg) : msg;

        if (window.Swal && typeof window.Swal.fire === "function") {
            window.Swal.fire({
                icon: tipo,
                title: titulo,
                text: mensajeFinal,
                confirmButtonColor: "#c5a043"
            });
            return;
        }

        alert(mensajeFinal);
    }

    async function confirmarAccion({ titulo, texto, textoConfirmar }) {
        if (window.Swal && typeof window.Swal.fire === "function") {
            const resultado = await window.Swal.fire({
                icon: "warning",
                title: titulo,
                text: texto,
                showCancelButton: true,
                confirmButtonText: textoConfirmar || "Sí, eliminar",
                cancelButtonText: "Cancelar",
                confirmButtonColor: "#dc2626",
                cancelButtonColor: "#64748b"
            });

            return Boolean(resultado.isConfirmed);
        }

        return confirm(`${titulo}\n\n${texto}`);
    }

    // Render principal del listado de clientes.
    function renderClientes() {
        window.UIClientes.renderClientes({
            contenedorClientes: refs.contenedorClientes,
            adminId: ADMIN_ID_ACTUAL,
            filtroTexto: filtroTextoActual,
            filtroEstado: filtroEstadoActual
        });
    }

    function actualizarBotonesFiltro() {
        window.UIClientes.actualizarBotonesFiltro(refs.botonesFiltro, filtroEstadoActual);
    }

    function inicializarAccionesListado() {
        if (!refs.contenedorClientes) return;

        refs.contenedorClientes.addEventListener("click", async (event) => {
            const botonAccion = event.target.closest("button[data-action]");
            if (!botonAccion) return;

            const accion = botonAccion.dataset.action;

            try {
                if (accion === "eliminar-cliente") {
                    const clienteId = botonAccion.dataset.clienteId;
                    const clienteNombre = botonAccion.dataset.clienteNombre || "este cliente";
                    const confirmado = await confirmarAccion({
                        titulo: "¿Eliminar cliente?",
                        texto: `Se eliminará ${clienteNombre} junto con todos sus créditos, cuotas y pagos. Esta acción no se puede deshacer.`,
                        textoConfirmar: "Sí, eliminar cliente"
                    });

                    if (!confirmado) return;

                    window.Logic.eliminarCliente(ADMIN_ID_ACTUAL, clienteId);
                    renderClientes();
                    pagosController.cargarOpcionesCreditoPago();
                    notificar("Cliente eliminado correctamente (incluyendo créditos y pagos asociados).", "success", "Eliminado");
                    return;
                }

                if (accion === "eliminar-credito") {
                    const creditoId = botonAccion.dataset.creditoId;
                    const creditoNombre = botonAccion.dataset.creditoNombre || "este crédito";
                    const confirmado = await confirmarAccion({
                        titulo: "¿Eliminar crédito?",
                        texto: `Se eliminará ${creditoNombre} junto con todas sus cuotas y pagos. Esta acción no se puede deshacer.`,
                        textoConfirmar: "Sí, eliminar crédito"
                    });

                    if (!confirmado) return;

                    window.Logic.eliminarCredito(ADMIN_ID_ACTUAL, creditoId);
                    renderClientes();
                    pagosController.cargarOpcionesCreditoPago();
                    notificar("Crédito eliminado correctamente (incluyendo pagos asociados).", "success", "Eliminado");
                }
            } catch (error) {
                notificar(error.message, "error", "Error");
            }
        });
    }

    // Controlador de formulario de pagos (homonimos, cuota sugerida, validaciones visuales).
    const pagosController = window.UIPagos.crearControladorPagos({
        refs,
        adminId: ADMIN_ID_ACTUAL,
        notificar,
        confirmarAccion,
        onDatosActualizados: renderClientes,
        onCreditoFinalizado: () => {
            filtroEstadoActual = "finalizados";
            actualizarBotonesFiltro();
            renderClientes();
        }
    });

    // Inicializa todos los listeners de la pantalla principal.
    function iniciarEventos() {
        if (refs.usuarioActual) {
            const nombreMostrado = sesionActiva.nombre || sesionActiva.usuario || ADMIN_ID_ACTUAL;
            if (refs.usuarioActualTexto) {
                refs.usuarioActualTexto.textContent = `Usuario: ${nombreMostrado}`;
            } else {
                refs.usuarioActual.textContent = `Usuario: ${nombreMostrado}`;
            }
            refs.usuarioActual.classList.remove("hidden");
        }

        if (refs.btnLogout) {
            refs.btnLogout.addEventListener("click", async () => {
                const confirmado = await confirmarAccion({
                    titulo: "¿Cerrar sesión?",
                    texto: "Se cerrará la sesión actual y volverás al login.",
                    textoConfirmar: "Sí, salir"
                });

                if (!confirmado) return;

                window.Auth.cerrarSesion();
                window.location.href = "login.html";
            });
        }

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
            refs.formCredito.addEventListener("submit", async (event) => {
                event.preventDefault();

                try {
                    const montoCredito = Number(document.getElementById("monto-pedido").value || 0);
                    const planCredito = document.getElementById("plan-cuotas").value;
                    const confirmado = await confirmarAccion({
                        titulo: "¿Confirmar carga de crédito?",
                        texto: `Se cargará un crédito por ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(montoCredito)} en plan ${planCredito} días.`,
                        textoConfirmar: "Sí, cargar crédito"
                    });

                    if (!confirmado) return;

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
                    pagosController.cargarOpcionesCreditoPago();
                    notificar("Credito cargado correctamente.", "success", "Listo");
                } catch (error) {
                    notificar(error.message, "error", "Error");
                }
            });
        }

        inicializarAccionesListado();

        pagosController.inicializarEventos();

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

    // Expuesto para compatibilidad con llamadas globales antiguas.
    window.filtrarClientes = function filtrarClientes(valor) {
        filtroTextoActual = valor;
        renderClientes();
    };

    // Placeholder para funcionalidad futura de detalle por credito.
    window.verDesglose = function verDesglose() {
        notificar("El desglose detallado se implementara en el siguiente paso.", "info", "Próximamente");
    };

    // Secuencia de arranque de la SPA.
    iniciarEventos();
    actualizarBotonesFiltro();
    renderClientes();
    pagosController.actualizarInfoCuotaPendiente();
})();
