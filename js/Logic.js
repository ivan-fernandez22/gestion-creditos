"use strict";

(function () {
    // Modulo central de negocio:
    // valida datos, persiste en localStorage y calcula estados/resumenes.
    if (!window.Datos) {
        throw new Error("Datos.js debe cargarse antes que Logic.js");
    }

    const { SCHEMA_VERSION, STORAGE_KEY, ADMIN_ID_DEFAULT } = window.Datos;

    const PLANES_CREDITO = {
        12: { cuotas: 12, multiplicador: 1.2 },
        17: { cuotas: 17, multiplicador: 1.258 },
        24: { cuotas: 24, multiplicador: 1.408 },
        30: { cuotas: 30, multiplicador: 1.6 }
    };

    const ESTADOS_CLIENTE = {
        ACTIVO: "activo",
        INACTIVO: "inactivo"
    };

    const ESTADOS_CREDITO = {
        ACTIVO: "activo",
        ATRASADO: "atrasado",
        FINALIZADO: "finalizado"
    };

    const ESTADOS_CUOTA = {
        PENDIENTE: "pendiente",
        PARCIAL: "parcial",
        PAGA: "paga",
        VENCIDA: "vencida"
    };

    const TIPOS_PAGO = {
        COMPLETO: "completo",
        PARCIAL: "parcial"
    };

    // -----------------------------
    // Helpers de uso general
    // -----------------------------

    // Tolerancia para considerar una cuota como cerrada por redondeos o residuos minimos.
    const TOLERANCIA_CIERRE_CUOTA = 1;
    // Tolerancia estricta para validar que no se pase del saldo al registrar pago.
    const TOLERANCIA_VALIDACION_PAGO = 0.01;

    function crearId() {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
        }
        return "id-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
    }

    function fechaActualISO() {
        return new Date().toISOString();
    }

    function texto(valor) {
        return String(valor || "").trim();
    }

    function numero(valor) {
        return Number(valor || 0);
    }

    function redondearMoneda(valor) {
        return Math.round((numero(valor) + Number.EPSILON) * 100) / 100;
    }

    function saldoConsideradoCerrado(saldo) {
        return Math.abs(redondearMoneda(saldo)) <= TOLERANCIA_CIERRE_CUOTA;
    }

    function normalizarDNI(dni) {
        return texto(dni).replace(/\D/g, "");
    }

    function normalizarTextoBusqueda(valor) {
        return texto(valor)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");
    }

    function esDomingo(fecha) {
        return fecha.getDay() === 0;
    }

    // Si la fecha cae domingo, la movemos al lunes siguiente.
    function normalizarFechaCobro(fechaISO) {
        const fecha = new Date(fechaISO + "T00:00:00");

        if (Number.isNaN(fecha.getTime())) {
            throw new Error("Fecha invalida.");
        }

        while (esDomingo(fecha)) {
            fecha.setDate(fecha.getDate() + 1);
        }

        return fecha;
    }

    // Suma "dias de cobro" (lunes a sabado), saltando domingos.
    // diasCobro = 0 devuelve la misma fecha normalizada (si era domingo, pasa a lunes).
    function sumarDiasCobro(fechaISO, diasCobro) {
        const fecha = normalizarFechaCobro(fechaISO);
        let diasSumados = 0;

        while (diasSumados < diasCobro) {
            fecha.setDate(fecha.getDate() + 1);
            if (!esDomingo(fecha)) {
                diasSumados += 1;
            }
        }

        return fecha.toISOString().slice(0, 10);
    }

    function compararFechasISO(a, b) {
        // Formato esperado: YYYY-MM-DD
        return String(a || "").localeCompare(String(b || ""));
    }

    function contarDiasCobroEntre(fechaInicioISO, fechaFinISO) {
        const inicio = normalizarFechaCobro(fechaInicioISO);
        const fin = normalizarFechaCobro(fechaFinISO);

        if (inicio > fin) return 0;

        const cursor = new Date(inicio);
        let contador = 0;

        while (cursor <= fin) {
            if (!esDomingo(cursor)) {
                contador += 1;
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        return contador;
    }

    function obtenerNumeroSemanaCobro(fechaInicioISO, fechaReferenciaISO, totalSemanas) {
        const diasCobroTranscurridos = contarDiasCobroEntre(fechaInicioISO, fechaReferenciaISO);
        if (diasCobroTranscurridos <= 0) return 1;

        const semana = Math.floor((diasCobroTranscurridos - 1) / 6) + 1;
        return Math.min(Math.max(1, semana), Math.max(1, totalSemanas));
    }

    // -----------------------------
    // Persistencia en localStorage
    // -----------------------------

    function crearDBVacia() {
        return {
            version: SCHEMA_VERSION,
            clientes: [],
            creditos: [],
            cuotas: [],
            pagos: []
        };
    }

    function cargarDB() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return crearDBVacia();

        try {
            const data = JSON.parse(raw);
            return {
                version: data.version || SCHEMA_VERSION,
                clientes: Array.isArray(data.clientes) ? data.clientes : [],
                creditos: Array.isArray(data.creditos) ? data.creditos : [],
                cuotas: Array.isArray(data.cuotas) ? data.cuotas : [],
                pagos: Array.isArray(data.pagos) ? data.pagos : []
            };
        } catch {
            return crearDBVacia();
        }
    }

    function guardarDB(db) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }

    function buscarClientePorDNI(db, adminID, dni) {
        const dniNormalizado = normalizarDNI(dni);
        return db.clientes.find(
            (cliente) => cliente.adminID === adminID && normalizarDNI(cliente.dni) === dniNormalizado
        );
    }

    function buscarClientesPorNombreApellido(db, adminID, nombre, apellido) {
        const nombreNorm = normalizarTextoBusqueda(nombre);
        const apellidoNorm = normalizarTextoBusqueda(apellido);

        if (!nombreNorm || !apellidoNorm) return [];

        return db.clientes.filter((cliente) => {
            return (
                cliente.adminID === adminID &&
                normalizarTextoBusqueda(cliente.nombre) === nombreNorm &&
                normalizarTextoBusqueda(cliente.apellido) === apellidoNorm
            );
        });
    }

    function listarCreditosPorNombreApellido(adminID, nombre, apellido) {
        const admin = texto(adminID || ADMIN_ID_DEFAULT);
        const db = cargarDB();
        const coincidencias = buscarClientesPorNombreApellido(db, admin, nombre, apellido);

        if (!coincidencias.length) {
            return { cliente: null, clientes: [], creditos: [], coincidencias: 0 };
        }

        if (coincidencias.length > 1) {
            return {
                cliente: null,
                clientes: coincidencias.map((c) => ({
                    id: c.id,
                    nombre: c.nombre,
                    apellido: c.apellido,
                    dni: c.dni,
                    telefono: c.telefono
                })),
                creditos: [],
                coincidencias: coincidencias.length
            };
        }

        const cliente = coincidencias[0];
        const creditos = db.creditos.filter(
            (credito) => credito.adminID === admin && credito.clienteId === cliente.id
        );

        return {
            cliente,
            clientes: [
                {
                    id: cliente.id,
                    nombre: cliente.nombre,
                    apellido: cliente.apellido,
                    dni: cliente.dni,
                    telefono: cliente.telefono
                }
            ],
            creditos,
            coincidencias: 1
        };
    }

    function listarCreditosPorClienteId(adminID, clienteId) {
        const admin = texto(adminID || ADMIN_ID_DEFAULT);
        const id = texto(clienteId);
        const db = cargarDB();

        if (!id) return [];

        return db.creditos.filter((credito) => credito.adminID === admin && credito.clienteId === id);
    }

    // Intenta resolver el cliente para un pago con prioridad:
    // 1) clienteId explicito, 2) dni, 3) nombre + apellido.
    function resolverClienteParaPago(db, adminID, payload) {
        const clienteId = texto(payload.clienteId);
        if (clienteId) {
            const clientePorId = db.clientes.find(
                (cliente) => cliente.adminID === adminID && cliente.id === clienteId
            );
            if (!clientePorId) throw new Error("No existe el cliente seleccionado para este administrador.");
            return clientePorId;
        }

        const dni = normalizarDNI(payload.dni);
        if (dni) {
            const clientePorDni = buscarClientePorDNI(db, adminID, dni);
            if (!clientePorDni) throw new Error("No existe cliente para ese DNI.");
            return clientePorDni;
        }

        const coincidencias = buscarClientesPorNombreApellido(
            db,
            adminID,
            payload.nombreCliente,
            payload.apellidoCliente
        );

        if (!coincidencias.length) {
            throw new Error("No existe cliente con ese nombre y apellido.");
        }

        if (coincidencias.length > 1) {
            throw new Error("Hay más de un cliente con ese nombre y apellido. Usa otro criterio para identificarlo.");
        }

        return coincidencias[0];
    }

    // Recalcula estado de cuotas segun saldo y vencimiento a fecha de hoy.
    function refrescarVencimientosCredito(db, creditoId, adminID) {
        const hoy = new Date().toISOString().slice(0, 10);

        db.cuotas.forEach((cuota) => {
            if (cuota.adminID !== adminID || cuota.creditoId !== creditoId) return;

            // Normaliza residuos de redondeo para que no quede "parcial" por centavos minimos.
            if (saldoConsideradoCerrado(cuota.saldoPendiente)) {
                cuota.saldoPendiente = 0;
                cuota.estado = ESTADOS_CUOTA.PAGA;
                return;
            }

            if (cuota.fechaVencimiento && cuota.fechaVencimiento < hoy) {
                cuota.estado = ESTADOS_CUOTA.VENCIDA;
            } else if (cuota.saldoPendiente > 0 && cuota.montoPagado > 0) {
                cuota.estado = ESTADOS_CUOTA.PARCIAL;
            } else {
                cuota.estado = ESTADOS_CUOTA.PENDIENTE;
            }
        });
    }

    // Recalcula estado general del credito a partir de sus cuotas.
    function actualizarEstadoCredito(db, creditoId, adminID) {
        refrescarVencimientosCredito(db, creditoId, adminID);

        const credito = db.creditos.find((item) => item.id === creditoId && item.adminID === adminID);
        if (!credito) return null;

        const cuotas = db.cuotas.filter((cuota) => cuota.creditoId === creditoId && cuota.adminID === adminID);

        const todasPagas = cuotas.length > 0 && cuotas.every((cuota) => cuota.estado === ESTADOS_CUOTA.PAGA);
        const tieneVencidas = cuotas.some((cuota) => cuota.estado === ESTADOS_CUOTA.VENCIDA);

        if (todasPagas) {
            credito.estado = ESTADOS_CREDITO.FINALIZADO;
        } else if (tieneVencidas) {
            credito.estado = ESTADOS_CREDITO.ATRASADO;
        } else {
            credito.estado = ESTADOS_CREDITO.ACTIVO;
        }

        return credito;
    }


    // -----------------------------
    // Operaciones de negocio
    // -----------------------------


// CREAR AL CLIENTE: valida que el DNI no exista para el mismo adminID.
    function crearCliente(payload) {
        const adminID = texto(payload.adminID || ADMIN_ID_DEFAULT);
        const dni = normalizarDNI(payload.dni);
        const nombre = texto(payload.nombre);
        const apellido = texto(payload.apellido);
        const telefono = texto(payload.telefono);
        const direccionReal = texto(payload.direccionReal);

        if (!dni) throw new Error("El DNI es obligatorio.");
        if (!nombre) throw new Error("El nombre es obligatorio.");
        if (!apellido) throw new Error("El apellido es obligatorio.");
        if (!telefono) throw new Error("El teléfono es obligatorio.");
        if (!direccionReal) throw new Error("La dirección real es obligatoria.");

        const db = cargarDB();
        const clienteExistente = buscarClientePorDNI(db, adminID, dni);

        if (clienteExistente) {
            throw new Error("Ya existe un cliente con ese DNI para este administrador.");
        }

        const cliente = {
            id: crearId(),
            adminID,
            nombre,
            apellido,
            dni,
            telefono,
            direccionReal,
            direccionComercio: texto(payload.direccionComercio),
            rubro: texto(payload.rubro),
            estado: ESTADOS_CLIENTE.ACTIVO,
            fechaAlta: fechaActualISO()
        };

        db.clientes.push(cliente);
        guardarDB(db);

        return cliente;
    }


// CREAR AL CREDITO: valida que el cliente exista y calcula montos y cuotas.
    function crearCredito(payload) {
        const adminID = texto(payload.adminID || ADMIN_ID_DEFAULT);
        const plan = numero(payload.plan);
        const montoSolicitado = redondearMoneda(payload.montoSolicitado);
        const nombreCredito = texto(payload.nombre);

        const planElegido = PLANES_CREDITO[plan];
        if (!planElegido) throw new Error("Plan invalido. Usa 12, 17, 24 o 30.");
        if (!nombreCredito) throw new Error("El nombre del crédito es obligatorio.");
        if (montoSolicitado <= 0) throw new Error("El monto solicitado debe ser mayor a 0.");
        if (!texto(payload.fechaInicio)) throw new Error("La fecha de inicio es obligatoria.");

        const db = cargarDB();
        const cliente = buscarClientePorDNI(db, adminID, payload.dniCliente);
        if (!cliente) throw new Error("No existe cliente para ese DNI.");

        const fechaInicioNormalizada = sumarDiasCobro(texto(payload.fechaInicio), 0);
        const montoTotal = redondearMoneda(montoSolicitado * planElegido.multiplicador);
        const cuotaBase = redondearMoneda(montoTotal / planElegido.cuotas);

        const credito = {
            id: crearId(),
            adminID,
            clienteId: cliente.id,
            nombre: nombreCredito,
            plan,
            tasaInteres: redondearMoneda((planElegido.multiplicador - 1) * 100),
            montoSolicitado,
            montoTotal,
            valorCuota: cuotaBase,
            cantidadCuotas: planElegido.cuotas,
            fechaInicio: fechaInicioNormalizada,
            fechaFin: sumarDiasCobro(fechaInicioNormalizada, planElegido.cuotas - 1),
            estado: ESTADOS_CREDITO.ACTIVO,
            fechaAlta: fechaActualISO()
        };

        const cuotas = [];
        let acumulado = 0;

        for (let i = 1; i <= planElegido.cuotas; i += 1) {
            const esUltima = i === planElegido.cuotas;
            const montoEsperado = esUltima
                ? redondearMoneda(montoTotal - acumulado)
                : cuotaBase;

            if (!esUltima) acumulado = redondearMoneda(acumulado + montoEsperado);

            cuotas.push({
                id: crearId(),
                adminID,
                creditoId: credito.id,
                numero: i,
                montoEsperado,
                montoPagado: 0,
                saldoPendiente: montoEsperado,
                fechaVencimiento: sumarDiasCobro(credito.fechaInicio, i - 1),
                estado: ESTADOS_CUOTA.PENDIENTE,
                fechaAlta: fechaActualISO()
            });
        }

        db.creditos.push(credito);
        db.cuotas.push(...cuotas);
        guardarDB(db);

        return { credito, cuotas };
    }



// REGISTRAR PAGO: valida que exista el cliente, credito y cuota. Actualiza montos y estados.
    function registrarPago(payload) {
        const adminID = texto(payload.adminID || ADMIN_ID_DEFAULT);
        const db = cargarDB();

        if (!texto(payload.creditoId)) throw new Error("Debes seleccionar un crédito para registrar el pago.");
        if (!texto(payload.fechaPago)) throw new Error("La fecha de pago es obligatoria.");

        const cliente = resolverClienteParaPago(db, adminID, payload);

        const creditoId = texto(payload.creditoId);
        const credito = db.creditos.find(
            (item) => item.id === creditoId && item.adminID === adminID && item.clienteId === cliente.id
        );

        if (!credito) throw new Error("No existe el credito seleccionado para este cliente.");
        if (credito.estado === ESTADOS_CREDITO.FINALIZADO) {
            throw new Error("Ese credito ya esta finalizado y no admite nuevos pagos.");
        }

        const nroCuotaIngresado = numero(payload.nroCuota);

        let cuota = null;
        if (nroCuotaIngresado > 0) {
            cuota = db.cuotas.find(
                (item) => item.adminID === adminID && item.creditoId === creditoId && item.numero === nroCuotaIngresado
            );
        } else {
            cuota = db.cuotas
                .filter((item) => item.adminID === adminID && item.creditoId === creditoId)
                .filter((item) => !saldoConsideradoCerrado(item.saldoPendiente))
                .sort((a, b) => numero(a.numero) - numero(b.numero))[0] || null;
        }

        if (!cuota) throw new Error("No existe una cuota pendiente para registrar el pago.");
        if (cuota.estado === ESTADOS_CUOTA.PAGA) throw new Error("Esa cuota ya esta paga.");

        const monto = redondearMoneda(payload.montoPagado);
        if (monto <= 0) throw new Error("El monto pagado debe ser mayor a 0.");
        const saldoAntes = redondearMoneda(cuota.saldoPendiente);
        if (monto > saldoAntes + TOLERANCIA_VALIDACION_PAGO) {
            throw new Error(
                `El monto supera el saldo pendiente de la cuota ${cuota.numero}. Saldo pendiente: $${saldoAntes.toFixed(2)}.`
            );
        }

        cuota.montoPagado = redondearMoneda(cuota.montoPagado + monto);
        cuota.saldoPendiente = redondearMoneda(saldoAntes - monto);
        if (saldoConsideradoCerrado(cuota.saldoPendiente)) {
            cuota.saldoPendiente = 0;
        }

        cuota.estado = cuota.saldoPendiente === 0 ? ESTADOS_CUOTA.PAGA : ESTADOS_CUOTA.PARCIAL;

        const pago = {
            id: crearId(),
            adminID,
            creditoId,
            cuotaId: cuota.id,
            monto,
            fechaPago: texto(payload.fechaPago),
            tipo: cuota.saldoPendiente === 0 ? TIPOS_PAGO.COMPLETO : TIPOS_PAGO.PARCIAL,
            observacion: texto(payload.observacion),
            fechaAlta: fechaActualISO()
        };

        db.pagos.push(pago);

        const creditoActualizado = actualizarEstadoCredito(db, creditoId, adminID);
        guardarDB(db);

        return { pago, cuota, credito: creditoActualizado };
    }

    // ELIMINAR CREDITO: borra el credito y sus cuotas/pagos asociados.
    function eliminarCredito(adminID, creditoId) {
        const admin = texto(adminID || ADMIN_ID_DEFAULT);
        const idCredito = texto(creditoId);
        const db = cargarDB();

        const credito = db.creditos.find(
            (item) => item.adminID === admin && item.id === idCredito
        );
        if (!credito) {
            throw new Error("No existe el crédito seleccionado para eliminar.");
        }

        const creditosAntes = db.creditos.length;
        const cuotasAntes = db.cuotas.length;
        const pagosAntes = db.pagos.length;

        db.creditos = db.creditos.filter(
            (item) => !(item.adminID === admin && item.id === idCredito)
        );
        db.cuotas = db.cuotas.filter(
            (cuota) => !(cuota.adminID === admin && cuota.creditoId === idCredito)
        );
        db.pagos = db.pagos.filter(
            (pago) => !(pago.adminID === admin && pago.creditoId === idCredito)
        );

        guardarDB(db);

        return {
            creditoId: idCredito,
            creditosEliminados: creditosAntes - db.creditos.length,
            cuotasEliminadas: cuotasAntes - db.cuotas.length,
            pagosEliminados: pagosAntes - db.pagos.length
        };
    }

    // ELIMINAR CLIENTE: borra cliente y todo lo que cuelga de sus creditos.
    function eliminarCliente(adminID, clienteId) {
        const admin = texto(adminID || ADMIN_ID_DEFAULT);
        const idCliente = texto(clienteId);
        const db = cargarDB();

        const cliente = db.clientes.find(
            (item) => item.adminID === admin && item.id === idCliente
        );
        if (!cliente) {
            throw new Error("No existe el cliente seleccionado para eliminar.");
        }

        const creditosClienteIds = db.creditos
            .filter((credito) => credito.adminID === admin && credito.clienteId === idCliente)
            .map((credito) => credito.id);

        const clientesAntes = db.clientes.length;
        const creditosAntes = db.creditos.length;
        const cuotasAntes = db.cuotas.length;
        const pagosAntes = db.pagos.length;

        db.clientes = db.clientes.filter(
            (item) => !(item.adminID === admin && item.id === idCliente)
        );
        db.creditos = db.creditos.filter(
            (credito) => !(credito.adminID === admin && credito.clienteId === idCliente)
        );
        db.cuotas = db.cuotas.filter(
            (cuota) => !(cuota.adminID === admin && creditosClienteIds.includes(cuota.creditoId))
        );
        db.pagos = db.pagos.filter(
            (pago) => !(pago.adminID === admin && creditosClienteIds.includes(pago.creditoId))
        );

        guardarDB(db);

        return {
            clienteId: idCliente,
            clientesEliminados: clientesAntes - db.clientes.length,
            creditosEliminados: creditosAntes - db.creditos.length,
            cuotasEliminadas: cuotasAntes - db.cuotas.length,
            pagosEliminados: pagosAntes - db.pagos.length
        };
    }



// -----------------------------------------------------------------------------
// LOGICA DE INTERACCION CON EL DOM
// -----------------------------------------------------------------------------

    function listarCreditosPorDni(adminID, dni) {
        const db = cargarDB();
        const cliente = buscarClientePorDNI(db, texto(adminID || ADMIN_ID_DEFAULT), dni);
        if (!cliente) return [];

        return db.creditos.filter(
        (credito) => credito.adminID === cliente.adminID && credito.clienteId === cliente.id
        );
    }

    function obtenerProximaCuotaPendiente(adminID, creditoId) {
        const admin = texto(adminID || ADMIN_ID_DEFAULT);
        const idCredito = texto(creditoId);
        const db = cargarDB();

        const cuotasPendientes = db.cuotas
            .filter((cuota) => cuota.adminID === admin && cuota.creditoId === idCredito)
            .filter((cuota) => !saldoConsideradoCerrado(cuota.saldoPendiente))
            .sort((a, b) => numero(a.numero) - numero(b.numero));

        return cuotasPendientes[0] || null;
    }

    function obtenerResumenCredito(db, credito) {
        // Arma un objeto resumen pensado para la UI (avance, semana, deudas, etc.).
        const cuotas = db.cuotas.filter(
            (cuota) => cuota.creditoId === credito.id && cuota.adminID === credito.adminID
        );

        const pagos = db.pagos.filter(
            (pago) => pago.creditoId === credito.id && pago.adminID === credito.adminID
        );

        const pagasCompletas = cuotas.filter((cuota) => cuota.estado === ESTADOS_CUOTA.PAGA).length;
        const pagas = cuotas.filter((cuota) => numero(cuota.montoPagado) > 0).length;
        const impagas = cuotas.length - pagas;
        const montoPagadoTotal = redondearMoneda(
            cuotas.reduce((total, cuota) => total + numero(cuota.montoPagado), 0)
        );
        const deuda = redondearMoneda(
            cuotas.reduce((total, cuota) => total + numero(cuota.saldoPendiente), 0)
        );
        const avancePorcentaje =
            numero(credito.montoTotal) > 0
                ? redondearMoneda((montoPagadoTotal / numero(credito.montoTotal)) * 100)
                : 0;

        const totalSemanas = Math.max(1, Math.ceil(numero(credito.cantidadCuotas) / 6));
        const hoyISO = new Date().toISOString().slice(0, 10);
        const semanaActual = obtenerNumeroSemanaCobro(credito.fechaInicio, hoyISO, totalSemanas);
        const inicioSemanaActual = sumarDiasCobro(credito.fechaInicio, (semanaActual - 1) * 6);
        const finSemanaActual = sumarDiasCobro(inicioSemanaActual, 5);

        const recaudadoSemanaActual = redondearMoneda(
            pagos
                .filter(
                    (pago) =>
                        pago.fechaPago &&
                        compararFechasISO(pago.fechaPago, inicioSemanaActual) >= 0 &&
                        compararFechasISO(pago.fechaPago, finSemanaActual) <= 0
                )
                .reduce((acc, pago) => acc + numero(pago.monto), 0)
        );

        const deudaSemanaActual = redondearMoneda(
            cuotas
                .filter(
                    (cuota) =>
                        cuota.fechaVencimiento &&
                        compararFechasISO(cuota.fechaVencimiento, inicioSemanaActual) >= 0 &&
                        compararFechasISO(cuota.fechaVencimiento, finSemanaActual) <= 0
                )
                .reduce((acc, cuota) => acc + numero(cuota.saldoPendiente), 0)
        );

        const gananciaSemanaActual = redondearMoneda(recaudadoSemanaActual * 0.15);

        const historialSemanal = [];
        let recaudadoAcumulado = 0;
        let gananciaAcumulada = 0;

        // Cada semana agrupa 6 dias de cobro (lunes a sabado).
        for (let semana = 1; semana <= totalSemanas; semana += 1) {
            const inicioSemana = sumarDiasCobro(credito.fechaInicio, (semana - 1) * 6);
            const finSemana = sumarDiasCobro(inicioSemana, 5);

            const recaudadoSemana = redondearMoneda(
                pagos
                    .filter(
                        (pago) =>
                            pago.fechaPago &&
                            compararFechasISO(pago.fechaPago, inicioSemana) >= 0 &&
                            compararFechasISO(pago.fechaPago, finSemana) <= 0
                    )
                    .reduce((acc, pago) => acc + numero(pago.monto), 0)
            );

            const pendienteSemana = redondearMoneda(
                cuotas
                    .filter(
                        (cuota) =>
                            cuota.fechaVencimiento &&
                            compararFechasISO(cuota.fechaVencimiento, inicioSemana) >= 0 &&
                            compararFechasISO(cuota.fechaVencimiento, finSemana) <= 0
                    )
                    .reduce((acc, cuota) => acc + numero(cuota.saldoPendiente), 0)
            );

            const gananciaSemana = redondearMoneda(recaudadoSemana * 0.15);
            recaudadoAcumulado = redondearMoneda(recaudadoAcumulado + recaudadoSemana);
            gananciaAcumulada = redondearMoneda(gananciaAcumulada + gananciaSemana);

            historialSemanal.push({
                semana,
                inicioSemana,
                finSemana,
                recaudado: recaudadoSemana,
                pendiente: pendienteSemana,
                ganancia: gananciaSemana,
                recaudadoAcumulado,
                gananciaAcumulada
            });
        }

        return {
            ...credito,
            cuotas,
            pagos,
            pagas,
            pagasCompletas,
            impagas,
            montoPagadoTotal,
            avancePorcentaje,
            semanaActual,
            totalSemanas,
            inicioSemanaActual,
            finSemanaActual,
            recaudadoSemanaActual,
            deudaSemanaActual,
            gananciaSemanaActual,
            historialSemanal,
            deuda
        };
    }

    // Devuelve clientes ya enriquecidos con resumenes de sus creditos.
    function obtenerClientesConResumen(adminID) {
        const admin = texto(adminID || ADMIN_ID_DEFAULT);
        const db = cargarDB();

        let huboAjustesPorRedondeo = false;
        db.cuotas.forEach((cuota) => {
            if (cuota.adminID !== admin) return;

            if (saldoConsideradoCerrado(cuota.saldoPendiente) && cuota.saldoPendiente !== 0) {
                cuota.saldoPendiente = 0;
                cuota.estado = ESTADOS_CUOTA.PAGA;
                huboAjustesPorRedondeo = true;
            }
        });

        if (huboAjustesPorRedondeo) {
            guardarDB(db);
        }

        return db.clientes
        .filter((cliente) => cliente.adminID === admin)
        .map((cliente) => {
            const creditos = db.creditos
                .filter((credito) => credito.adminID === admin && credito.clienteId === cliente.id)
                .map((credito) => obtenerResumenCredito(db, credito));

            const deudaTotal = redondearMoneda(
                creditos.reduce((acc, credito) => acc + credito.deuda, 0)
            );

            return {
                ...cliente,
                creditos,
                deudaTotal,
                totalCreditos: creditos.length
            };
        });
    }

    // Filtro textual simple por nombre/apellido.
    function buscarClientesPorNombre(adminID, textoBusqueda) {
        const clientes = obtenerClientesConResumen(adminID);
        const filtro = texto(textoBusqueda).toLowerCase();
        if (!filtro) return clientes;

        return clientes.filter((cliente) => {
            const nombreCompleto = (cliente.nombre + " " + cliente.apellido).toLowerCase();
            return nombreCompleto.includes(filtro);
        });
    }

    // API publica consumida por los modulos de interfaz.
    window.Logic = {
        PLANES_CREDITO,
        ESTADOS_CLIENTE,
        ESTADOS_CREDITO,
        ESTADOS_CUOTA,
        TIPOS_PAGO,
        redondearMoneda,
        normalizarDNI,
        cargarDB,
        guardarDB,
        crearCliente,
        crearCredito,
        registrarPago,
        eliminarCredito,
        eliminarCliente,
        listarCreditosPorDni,
        listarCreditosPorNombreApellido,
        listarCreditosPorClienteId,
        obtenerProximaCuotaPendiente,
        obtenerClientesConResumen,
        buscarClientesPorNombre
    };
})();
