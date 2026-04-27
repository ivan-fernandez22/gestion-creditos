"use strict";

(function () {
    // Modulo de UI para flujo de pagos:
    // autocompletado por nombre/apellido, homonimos, cuota sugerida y submit.
    function crearControladorPagos(config) {
        const {
            refs,
            adminId,
            notificar,
            confirmarAccion,
            onDatosActualizados,
            onCreditoFinalizado
        } = config;

        // Guarda el cliente exacto elegido para evitar ambiguedades en homonimos.
        let clientePagoSeleccionadoId = "";

        // Helpers internos de presentacion y consulta.
        function formatearMoneda(valor) {
            return new Intl.NumberFormat("es-AR", {
                style: "currency",
                currency: "ARS",
                minimumFractionDigits: 2
            }).format(Number(valor || 0));
        }

        function obtenerCuotaDeFormulario(creditoId, nroCuota) {
            const db = window.Logic.cargarDB();
            return (
                db.cuotas.find(
                    (cuota) =>
                        cuota.adminID === adminId &&
                        cuota.creditoId === creditoId &&
                        Number(cuota.numero) === Number(nroCuota)
                ) || null
            );
        }

        // Actualiza el texto informativo de saldo pendiente y su color.
        function setInfoCuota(texto, tipo) {
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

        // Lee credito + cuota del formulario y muestra saldo de forma dinamica.
        function actualizarInfoCuotaPendiente() {
            if (!refs.selectCreditoPago || !refs.nroCuota) return;

            const creditoId = refs.selectCreditoPago.value;
            const nroCuota = Number(refs.nroCuota.value);

            if (!creditoId) {
                setInfoCuota("Selecciona un crédito para ver el saldo pendiente de la cuota.", "normal");
                return;
            }

            if (!nroCuota || nroCuota <= 0) {
                setInfoCuota("Ingresa o usa la cuota sugerida para ver el saldo pendiente.", "normal");
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

        // Sugiere la proxima cuota pendiente segun el credito seleccionado.
        function actualizarCuotaSugerida() {
            if (!refs.nroCuota || !refs.selectCreditoPago) return;

            const creditoId = refs.selectCreditoPago.value;
            if (!creditoId) {
                refs.nroCuota.value = "";
                refs.nroCuota.placeholder = "N° Cuota (Auto sugerida)";
                actualizarInfoCuotaPendiente();
                return;
            }

            const proximaCuota = window.Logic.obtenerProximaCuotaPendiente(adminId, creditoId);
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

        // Cuando hay cliente seleccionado, carga solo sus creditos activos.
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
                .listarCreditosPorClienteId(adminId, clientePagoSeleccionadoId)
                .filter((credito) => credito.estado !== "finalizado");

            if (!creditos.length) {
                refs.selectCreditoPago.innerHTML = '<option value="">No hay créditos activos para ese cliente (carga uno nuevo para continuar)</option>';
                refs.selectCreditoPago.disabled = true;
                actualizarCuotaSugerida();
                actualizarInfoCuotaPendiente();
                return;
            }

            refs.selectCreditoPago.disabled = false;
            refs.selectCreditoPago.innerHTML = '<option value="">Selecciona un credito</option>';

            creditos.forEach((credito) => {
                const proximaCuota = window.Logic.obtenerProximaCuotaPendiente(adminId, credito.id);
                const option = document.createElement("option");
                option.value = credito.id;
                option.textContent = `${credito.nombre} | Plan ${credito.plan} dias | Próx. cuota: ${proximaCuota ? proximaCuota.numero : "-"}`;
                refs.selectCreditoPago.appendChild(option);
            });

            refs.selectCreditoPago.selectedIndex = 1;
            actualizarCuotaSugerida();
            actualizarInfoCuotaPendiente();
        }

        // Resuelve coincidencias de nombre/apellido y habilita selector para homonimos.
        function cargarOpcionesCreditoPago() {
            if (!refs.selectCreditoPago || !refs.nombrePago || !refs.apellidoPago) return;

            const nombre = refs.nombrePago.value;
            const apellido = refs.apellidoPago.value;

            const resultado = window.Logic.listarCreditosPorNombreApellido(
                adminId,
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

        // Vuelve el formulario de pagos al estado inicial.
        function resetearFormularioPago() {
            if (!refs.formPago) return;

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
        }

        // Submit principal: registra pago y refresca la pantalla via callbacks.
        function registrarEventoSubmitPago() {
            if (!refs.formPago) return;

            refs.formPago.addEventListener("submit", async (event) => {
                event.preventDefault();

                try {
                    const creditoSeleccionado = refs.selectCreditoPago.options[refs.selectCreditoPago.selectedIndex];
                    const montoPago = Number(document.getElementById("monto-pagado").value || 0);
                    const nroCuota = document.getElementById("nro-cuota").value;

                    if (typeof confirmarAccion === "function") {
                        const confirmado = await confirmarAccion({
                            titulo: "¿Confirmar registro de pago?",
                            texto: `Se registrará un pago de ${formatearMoneda(montoPago)} para la cuota ${nroCuota} del crédito ${creditoSeleccionado ? creditoSeleccionado.textContent : "seleccionado"}.`,
                            textoConfirmar: "Sí, registrar pago"
                        });

                        if (!confirmado) return;
                    }

                    const resultado = window.Logic.registrarPago({
                        adminID: adminId,
                        clienteId: clientePagoSeleccionadoId,
                        nombreCliente: document.getElementById("nombre-pago").value,
                        apellidoCliente: document.getElementById("apellido-pago").value,
                        creditoId: document.getElementById("select-credito-pago").value,
                        nroCuota: document.getElementById("nro-cuota").value,
                        montoPagado: document.getElementById("monto-pagado").value,
                        fechaPago: document.getElementById("fecha-pago").value
                    });

                    resetearFormularioPago();

                    if (typeof onDatosActualizados === "function") {
                        onDatosActualizados();
                    }

                    if (resultado.credito && resultado.credito.estado === "finalizado") {
                        if (typeof onCreditoFinalizado === "function") {
                            onCreditoFinalizado();
                        }
                        notificar(
                            "El crédito se finalizó correctamente y fue enviado al filtro Finalizados.",
                            "success",
                            "Crédito Finalizado"
                        );
                    } else {
                        notificar("Pago registrado correctamente.", "success", "Listo");
                    }
                } catch (error) {
                    notificar(error.message, "error", "Error");
                }
            });
        }

        // Enlaza todos los eventos de inputs/selects del bloque de pagos.
        function inicializarEventos() {
            registrarEventoSubmitPago();

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
        }

        // API usada desde main.js.
        return {
            inicializarEventos,
            cargarOpcionesCreditoPago,
            actualizarInfoCuotaPendiente
        };
    }

    // Exposicion global del modulo.
    window.UIPagos = {
        crearControladorPagos
    };
})();
