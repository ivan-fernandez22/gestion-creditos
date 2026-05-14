"use strict";

(function () {
    // Modulo central de negocio:
    // valida datos, persiste en localStorage y calcula estados/resumenes.
    if (!window.Datos) {
        throw new Error("Datos.js debe cargarse antes que Logic.js");
    }

    const { SCHEMA_VERSION, STORAGE_KEY } = window.Datos;

    const PLANES_CREDITO = {
        12: { cuotas: 12, multiplicador: 1.2 },
        17: { cuotas: 17, multiplicador: 1.258 },
        24: { cuotas: 24, multiplicador: 1.408 },
        36: { cuotas: 36, multiplicador: 1.6 }
    };

    const ESTADOS_CLIENTE = {
        ACTIVO: "activo",
        INACTIVO: "inactivo"
    };

    const ESTADOS_CREDITO = {
        ACTIVO: "activo",
        URGENTE: "urgente",
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

    function validarAdminId(adminID) {
        const admin = texto(adminID);
        if (!admin) throw new Error("Sesion invalida. Inicia sesion nuevamente.");
        return admin;
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

    function sumarDiasCalendario(fechaISO, diasCalendario) {
        const fecha = new Date(fechaISO + "T00:00:00");

        if (Number.isNaN(fecha.getTime())) {
            throw new Error("Fecha invalida.");
        }

        fecha.setDate(fecha.getDate() + diasCalendario);
        return fecha.toISOString().slice(0, 10);
    }

    // Devuelve el lunes (inicio) de la semana calendario lunes-sabado.
    function inicioSemanaCobro(fechaISO) {
        const fecha = normalizarFechaCobro(fechaISO);
        const diaSemana = fecha.getDay();
        const offset = diaSemana - 1;

        fecha.setDate(fecha.getDate() - offset);
        return fecha.toISOString().slice(0, 10);
    }

    // Devuelve el sabado (fin) de la semana calendario lunes-sabado.
    function finSemanaCobro(fechaISO) {
        const inicio = inicioSemanaCobro(fechaISO);
        return sumarDiasCalendario(inicio, 5);
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

    function contarSemanasCobroCalendario(fechaInicioISO, fechaFinISO) {
        const inicio = inicioSemanaCobro(fechaInicioISO);
        const fin = inicioSemanaCobro(fechaFinISO);

        if (compararFechasISO(inicio, fin) > 0) return 1;

        const inicioDate = new Date(inicio + "T00:00:00");
        const finDate = new Date(fin + "T00:00:00");
        const diffDias = Math.floor((finDate - inicioDate) / 86400000);

        return Math.floor(diffDias / 7) + 1;
    }

    function obtenerNumeroSemanaCobro(fechaInicioISO, fechaReferenciaISO, totalSemanas) {
        const inicioSemana = inicioSemanaCobro(fechaInicioISO);
        const referenciaSemana = inicioSemanaCobro(fechaReferenciaISO);

        if (compararFechasISO(referenciaSemana, inicioSemana) < 0) return 1;

        const inicioDate = new Date(inicioSemana + "T00:00:00");
        const refDate = new Date(referenciaSemana + "T00:00:00");
        const diffDias = Math.floor((refDate - inicioDate) / 86400000);
        const semana = Math.floor(diffDias / 7) + 1;
        return Math.min(Math.max(1, semana), Math.max(1, totalSemanas));
    }

    // -----------------------------
    // Persistencia en Supabase
    // -----------------------------

    const CACHE_TTL_MS = 15000;
    let cacheAdminId = "";
    let cacheTimestamp = 0;
    let cacheData = null;

    function crearDBVacia() {
        return {
            version: SCHEMA_VERSION,
            clientes: [],
            creditos: [],
            cuotas: [],
            pagos: []
        };
    }

    function getSupabaseClient() {
        const supabase = window.SupabaseClient;
        if (!supabase) {
            throw new Error("Supabase no esta configurado. Revisa js/supabaseClient.js");
        }
        return supabase;
    }

    function describirErrorSupabase(error, contexto) {
        if (!error) return contexto;
        const mensaje = error.message || "Error inesperado en Supabase.";
        const codigo = error.code || "";
        const detalle = String(error.details || "").toLowerCase();
        const mensajeLower = mensaje.toLowerCase();

        if (codigo === "23505") {
            if (detalle.includes("clientes_admin_dni_unique") || mensajeLower.includes("dni")) {
                return `${contexto}. Ya existe un cliente con ese DNI.`;
            }
            return `${contexto}. Ya existe un registro con esos datos.`;
        }
        if (codigo === "42501") {
            return `${contexto}. No tienes permisos para esta accion.`;
        }
        if (mensajeLower.includes("jwt") || mensajeLower.includes("token")) {
            return `${contexto}. Tu sesion expiro, vuelve a iniciar sesion.`;
        }
        if (mensajeLower.includes("timeout") || mensajeLower.includes("time out")) {
            return `${contexto}. Se agoto el tiempo de espera. Intenta nuevamente.`;
        }
        if (mensajeLower.includes("network") || mensajeLower.includes("failed to fetch")) {
            return `${contexto}. Hay un problema de conexion. Verifica tu internet.`;
        }
        if (mensajeLower.includes("permission denied") || mensajeLower.includes("rls")) {
            return `${contexto}. Acceso denegado por permisos de seguridad.`;
        }
        if (mensajeLower.includes("foreign key") || mensajeLower.includes("violates foreign key")) {
            return `${contexto}. Hay referencias pendientes asociadas.`;
        }

        return `${contexto}. ${mensaje}`;
    }

    function setCache(adminId, data) {
        cacheAdminId = adminId;
        cacheTimestamp = Date.now();
        cacheData = data;
    }

    function invalidateCache(adminId) {
        if (!adminId || adminId === cacheAdminId) {
            cacheAdminId = "";
            cacheTimestamp = 0;
            cacheData = null;
        }
    }

    function mapClienteFromDb(row) {
        return {
            id: row.id,
            adminID: row.admin_id,
            nombre: row.nombre,
            apellido: row.apellido,
            dni: row.dni,
            telefono: row.telefono,
            direccionReal: row.direccion_real,
            direccionComercio: row.direccion_comercio,
            rubro: row.rubro,
            estado: row.estado,
            fechaAlta: row.fecha_alta
        };
    }

    function mapCreditoFromDb(row) {
        return {
            id: row.id,
            adminID: row.admin_id,
            clienteId: row.cliente_id,
            nombre: row.nombre,
            plan: row.plan,
            tasaInteres: row.tasa_interes,
            montoSolicitado: row.monto_solicitado,
            montoTotal: row.monto_total,
            valorCuota: row.valor_cuota,
            cantidadCuotas: row.cantidad_cuotas,
            fechaInicio: row.fecha_inicio,
            fechaFin: row.fecha_fin,
            estado: row.estado,
            fechaAlta: row.fecha_alta
        };
    }

    function mapCuotaFromDb(row) {
        return {
            id: row.id,
            adminID: row.admin_id,
            creditoId: row.credito_id,
            numero: row.numero,
            montoEsperado: row.monto_esperado,
            montoPagado: row.monto_pagado,
            saldoPendiente: row.saldo_pendiente,
            fechaVencimiento: row.fecha_vencimiento,
            estado: row.estado,
            fechaAlta: row.fecha_alta
        };
    }

    function mapPagoFromDb(row) {
        return {
            id: row.id,
            adminID: row.admin_id,
            creditoId: row.credito_id,
            cuotaId: row.cuota_id,
            monto: row.monto,
            fechaPago: row.fecha_pago,
            fechaPagoHora: row.fecha_pago_hora || row.fecha_alta || "",
            tipo: row.tipo,
            observacion: row.observacion,
            fechaAlta: row.fecha_alta
        };
    }

    function mapClienteToDb(cliente) {
        return {
            id: cliente.id,
            admin_id: cliente.adminID,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            dni: cliente.dni,
            telefono: cliente.telefono,
            direccion_real: cliente.direccionReal,
            direccion_comercio: cliente.direccionComercio,
            rubro: cliente.rubro,
            estado: cliente.estado,
            fecha_alta: cliente.fechaAlta
        };
    }

    function mapCreditoToDb(credito) {
        return {
            id: credito.id,
            admin_id: credito.adminID,
            cliente_id: credito.clienteId,
            nombre: credito.nombre,
            plan: credito.plan,
            tasa_interes: credito.tasaInteres,
            monto_solicitado: credito.montoSolicitado,
            monto_total: credito.montoTotal,
            valor_cuota: credito.valorCuota,
            cantidad_cuotas: credito.cantidadCuotas,
            fecha_inicio: credito.fechaInicio,
            fecha_fin: credito.fechaFin,
            estado: credito.estado,
            fecha_alta: credito.fechaAlta
        };
    }

    function mapCuotaToDb(cuota) {
        return {
            id: cuota.id,
            admin_id: cuota.adminID,
            credito_id: cuota.creditoId,
            numero: cuota.numero,
            monto_esperado: cuota.montoEsperado,
            monto_pagado: cuota.montoPagado,
            saldo_pendiente: cuota.saldoPendiente,
            fecha_vencimiento: cuota.fechaVencimiento,
            estado: cuota.estado,
            fecha_alta: cuota.fechaAlta
        };
    }

    function mapPagoToDb(pago) {
        return {
            id: pago.id,
            admin_id: pago.adminID,
            credito_id: pago.creditoId,
            cuota_id: pago.cuotaId,
            monto: pago.monto,
            fecha_pago: pago.fechaPago,
            tipo: pago.tipo,
            observacion: pago.observacion,
            fecha_alta: pago.fechaAlta
        };
    }

    async function cargarDB(adminID) {
        const admin = validarAdminId(adminID);

        if (cacheData && cacheAdminId === admin && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
            return cacheData;
        }

        const supabase = getSupabaseClient();
        const [clientesRes, creditosRes, cuotasRes, pagosRes] = await Promise.all([
            supabase.from("clientes").select("*").eq("admin_id", admin),
            supabase.from("creditos").select("*").eq("admin_id", admin),
            supabase.from("cuotas").select("*").eq("admin_id", admin),
            supabase.from("pagos").select("*").eq("admin_id", admin)
        ]);

        if (clientesRes.error) {
            throw new Error(describirErrorSupabase(clientesRes.error, "No se pudieron leer los clientes"));
        }
        if (creditosRes.error) {
            throw new Error(describirErrorSupabase(creditosRes.error, "No se pudieron leer los creditos"));
        }
        if (cuotasRes.error) {
            throw new Error(describirErrorSupabase(cuotasRes.error, "No se pudieron leer las cuotas"));
        }
        if (pagosRes.error) {
            throw new Error(describirErrorSupabase(pagosRes.error, "No se pudieron leer los pagos"));
        }

        const data = {
            version: SCHEMA_VERSION,
            clientes: (clientesRes.data || []).map(mapClienteFromDb),
            creditos: (creditosRes.data || []).map(mapCreditoFromDb),
            cuotas: (cuotasRes.data || []).map(mapCuotaFromDb),
            pagos: (pagosRes.data || []).map(mapPagoFromDb)
        };

        setCache(admin, data);
        return data;
    }

    function guardarDB() {
        invalidateCache();
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

    async function listarCreditosPorNombreApellido(adminID, nombre, apellido) {
        const admin = validarAdminId(adminID);
        const db = await cargarDB(admin);
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

    async function listarCreditosPorClienteId(adminID, clienteId) {
        const admin = validarAdminId(adminID);
        const id = texto(clienteId);
        const db = await cargarDB(admin);

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

            if (cuota.saldoPendiente > 0 && cuota.montoPagado > 0) {
                cuota.estado = ESTADOS_CUOTA.PARCIAL;
            } else if (cuota.fechaVencimiento && cuota.fechaVencimiento < hoy) {
                cuota.estado = ESTADOS_CUOTA.VENCIDA;
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
            credito.estado = ESTADOS_CREDITO.URGENTE;
        } else {
            credito.estado = ESTADOS_CREDITO.ACTIVO;
        }

        return credito;
    }


    // -----------------------------
    // Operaciones de negocio
    // -----------------------------


// CREAR AL CLIENTE: valida que el DNI no exista para el mismo adminID.
    async function crearCliente(payload) {
        const adminID = validarAdminId(payload.adminID);
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

        const supabase = getSupabaseClient();
        const { data: existente, error: errorExistente } = await supabase
            .from("clientes")
            .select("id")
            .eq("admin_id", adminID)
            .eq("dni", dni)
            .limit(1)
            .maybeSingle();

        if (errorExistente) {
            throw new Error(describirErrorSupabase(errorExistente, "No se pudo validar el DNI del cliente"));
        }

        if (existente) {
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

        const { error: errorInsert } = await supabase.from("clientes").insert(mapClienteToDb(cliente));
        if (errorInsert) {
            throw new Error(describirErrorSupabase(errorInsert, "No se pudo guardar el cliente"));
        }

        invalidateCache(adminID);
        return cliente;
    }

    async function actualizarCliente(adminID, clienteId, cambios) {
        const admin = validarAdminId(adminID);
        const id = texto(clienteId);

        if (!id) throw new Error("No existe el cliente seleccionado para editar.");

        const supabase = getSupabaseClient();
        const cambiosDb = {};

        if (Object.prototype.hasOwnProperty.call(cambios, "dni")) {
            const dni = normalizarDNI(cambios.dni);
            if (!dni) throw new Error("El DNI es obligatorio.");
            const { data: existente, error: errorExistente } = await supabase
                .from("clientes")
                .select("id")
                .eq("admin_id", admin)
                .eq("dni", dni)
                .neq("id", id)
                .limit(1)
                .maybeSingle();

            if (errorExistente) {
                throw new Error(describirErrorSupabase(errorExistente, "No se pudo validar el DNI"));
            }
            if (existente) {
                throw new Error("Ya existe un cliente con ese DNI para este administrador.");
            }
            cambiosDb.dni = dni;
        }

        if (Object.prototype.hasOwnProperty.call(cambios, "nombre")) {
            const nombre = texto(cambios.nombre);
            if (!nombre) throw new Error("El nombre es obligatorio.");
            cambiosDb.nombre = nombre;
        }

        if (Object.prototype.hasOwnProperty.call(cambios, "apellido")) {
            const apellido = texto(cambios.apellido);
            if (!apellido) throw new Error("El apellido es obligatorio.");
            cambiosDb.apellido = apellido;
        }

        if (Object.prototype.hasOwnProperty.call(cambios, "telefono")) {
            const telefono = texto(cambios.telefono);
            if (!telefono) throw new Error("El teléfono es obligatorio.");
            cambiosDb.telefono = telefono;
        }

        if (Object.prototype.hasOwnProperty.call(cambios, "direccionReal")) {
            const direccionReal = texto(cambios.direccionReal);
            if (!direccionReal) throw new Error("La dirección real es obligatoria.");
            cambiosDb.direccion_real = direccionReal;
        }

        if (Object.prototype.hasOwnProperty.call(cambios, "direccionComercio")) {
            cambiosDb.direccion_comercio = texto(cambios.direccionComercio);
        }

        if (Object.prototype.hasOwnProperty.call(cambios, "rubro")) {
            cambiosDb.rubro = texto(cambios.rubro);
        }

        const { error: errorUpdate } = await supabase
            .from("clientes")
            .update(cambiosDb)
            .eq("id", id)
            .eq("admin_id", admin);

        if (errorUpdate) {
            throw new Error(describirErrorSupabase(errorUpdate, "No se pudo actualizar el cliente"));
        }

        invalidateCache(admin);
        return { id, adminID: admin, ...cambios };
    }


// CREAR AL CREDITO: valida que el cliente exista y calcula montos y cuotas.
    async function crearCredito(payload) {
        const adminID = validarAdminId(payload.adminID);
        const plan = numero(payload.plan);
        const montoSolicitado = redondearMoneda(payload.montoSolicitado);
        const nombreCredito = texto(payload.nombre);

        const planElegido = PLANES_CREDITO[plan];
        if (!planElegido) throw new Error("Plan invalido. Usa 12, 17, 24 o 36.");
        if (!nombreCredito) throw new Error("El nombre del crédito es obligatorio.");
        if (montoSolicitado <= 0) throw new Error("El monto solicitado debe ser mayor a 0.");
        if (!texto(payload.fechaInicio)) throw new Error("La fecha de inicio es obligatoria.");

        const supabase = getSupabaseClient();
        const dni = normalizarDNI(payload.dniCliente);
        const { data: cliente, error: errorCliente } = await supabase
            .from("clientes")
            .select("id,admin_id,dni")
            .eq("admin_id", adminID)
            .eq("dni", dni)
            .limit(1)
            .maybeSingle();

        if (errorCliente) {
            throw new Error(describirErrorSupabase(errorCliente, "No se pudo validar el cliente"));
        }
        if (!cliente) throw new Error("No existe cliente para ese DNI.");

        const fechaInicioNormalizada = sumarDiasCobro(texto(payload.fechaInicio), 1);
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

        const { error: errorCredito } = await supabase.from("creditos").insert(mapCreditoToDb(credito));
        if (errorCredito) {
            throw new Error(describirErrorSupabase(errorCredito, "No se pudo guardar el credito"));
        }

        const { error: errorCuotas } = await supabase
            .from("cuotas")
            .insert(cuotas.map(mapCuotaToDb));
        if (errorCuotas) {
            throw new Error(describirErrorSupabase(errorCuotas, "No se pudieron guardar las cuotas"));
        }

        invalidateCache(adminID);

        return { credito, cuotas };
    }

    async function actualizarCredito(adminID, creditoId, cambios) {
        const admin = validarAdminId(adminID);
        const id = texto(creditoId);

        if (!id) throw new Error("No existe el crédito seleccionado para editar.");

        if (Object.prototype.hasOwnProperty.call(cambios, "nombre")) {
            const nombre = texto(cambios.nombre);
            if (!nombre) throw new Error("El nombre del crédito es obligatorio.");
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from("creditos")
                .update({ nombre })
                .eq("id", id)
                .eq("admin_id", admin);

            if (error) {
                throw new Error(describirErrorSupabase(error, "No se pudo actualizar el credito"));
            }

            invalidateCache(admin);
            return { id, adminID: admin, nombre };
        }

        return { id, adminID: admin };
    }



// REGISTRAR PAGO: valida que exista el cliente, credito y cuota. Actualiza montos y estados.
    async function registrarPago(payload) {
        const adminID = validarAdminId(payload.adminID);
        const db = await cargarDB(adminID);

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
            fechaPagoHora: fechaActualISO(),
            tipo: cuota.saldoPendiente === 0 ? TIPOS_PAGO.COMPLETO : TIPOS_PAGO.PARCIAL,
            observacion: texto(payload.observacion),
            fechaAlta: fechaActualISO()
        };

        db.pagos.push(pago);

        const creditoActualizado = actualizarEstadoCredito(db, creditoId, adminID);

        const supabase = getSupabaseClient();
        const cuotasCredito = db.cuotas.filter(
            (item) => item.adminID === adminID && item.creditoId === creditoId
        );

        const { error: errorCuotas } = await supabase
            .from("cuotas")
            .upsert(cuotasCredito.map(mapCuotaToDb), { onConflict: "id" });

        if (errorCuotas) {
            throw new Error(describirErrorSupabase(errorCuotas, "No se pudieron actualizar las cuotas"));
        }

        const { error: errorCredito } = await supabase
            .from("creditos")
            .update({ estado: creditoActualizado.estado })
            .eq("id", creditoId)
            .eq("admin_id", adminID);

        if (errorCredito) {
            throw new Error(describirErrorSupabase(errorCredito, "No se pudo actualizar el credito"));
        }

        const { error: errorPago } = await supabase.from("pagos").insert(mapPagoToDb(pago));
        if (errorPago) {
            throw new Error(describirErrorSupabase(errorPago, "No se pudo registrar el pago"));
        }

        setCache(adminID, db);
        return { pago, cuota, credito: creditoActualizado };
    }

    // ELIMINAR CREDITO: borra el credito y sus cuotas/pagos asociados.
    async function eliminarCredito(adminID, creditoId) {
        const admin = validarAdminId(adminID);
        const idCredito = texto(creditoId);
        const db = await cargarDB(admin);

        const credito = db.creditos.find(
            (item) => item.adminID === admin && item.id === idCredito
        );
        if (!credito) {
            throw new Error("No existe el crédito seleccionado para eliminar.");
        }

        const supabase = getSupabaseClient();
        const { error: errorPagos } = await supabase
            .from("pagos")
            .delete()
            .eq("admin_id", admin)
            .eq("credito_id", idCredito);

        if (errorPagos) {
            throw new Error(describirErrorSupabase(errorPagos, "No se pudieron eliminar los pagos"));
        }

        const { error: errorCuotas } = await supabase
            .from("cuotas")
            .delete()
            .eq("admin_id", admin)
            .eq("credito_id", idCredito);

        if (errorCuotas) {
            throw new Error(describirErrorSupabase(errorCuotas, "No se pudieron eliminar las cuotas"));
        }

        const { error: errorCredito } = await supabase
            .from("creditos")
            .delete()
            .eq("admin_id", admin)
            .eq("id", idCredito);

        if (errorCredito) {
            throw new Error(describirErrorSupabase(errorCredito, "No se pudo eliminar el credito"));
        }

        invalidateCache(admin);

        return {
            creditoId: idCredito,
            creditosEliminados: db.creditos.filter((item) => item.adminID === admin && item.id === idCredito).length,
            cuotasEliminadas: db.cuotas.filter((item) => item.adminID === admin && item.creditoId === idCredito).length,
            pagosEliminados: db.pagos.filter((item) => item.adminID === admin && item.creditoId === idCredito).length
        };
    }

    // ELIMINAR CLIENTE: borra cliente y todo lo que cuelga de sus creditos.
    async function eliminarCliente(adminID, clienteId) {
        const admin = validarAdminId(adminID);
        const idCliente = texto(clienteId);
        const db = await cargarDB(admin);

        const cliente = db.clientes.find(
            (item) => item.adminID === admin && item.id === idCliente
        );
        if (!cliente) {
            throw new Error("No existe el cliente seleccionado para eliminar.");
        }

        const creditosClienteIds = db.creditos
            .filter((credito) => credito.adminID === admin && credito.clienteId === idCliente)
            .map((credito) => credito.id);

        const supabase = getSupabaseClient();

        if (creditosClienteIds.length) {
            const { error: errorPagos } = await supabase
                .from("pagos")
                .delete()
                .eq("admin_id", admin)
                .in("credito_id", creditosClienteIds);

            if (errorPagos) {
                throw new Error(describirErrorSupabase(errorPagos, "No se pudieron eliminar los pagos"));
            }

            const { error: errorCuotas } = await supabase
                .from("cuotas")
                .delete()
                .eq("admin_id", admin)
                .in("credito_id", creditosClienteIds);

            if (errorCuotas) {
                throw new Error(describirErrorSupabase(errorCuotas, "No se pudieron eliminar las cuotas"));
            }

            const { error: errorCreditos } = await supabase
                .from("creditos")
                .delete()
                .eq("admin_id", admin)
                .in("id", creditosClienteIds);

            if (errorCreditos) {
                throw new Error(describirErrorSupabase(errorCreditos, "No se pudieron eliminar los creditos"));
            }
        }

        const { error: errorCliente } = await supabase
            .from("clientes")
            .delete()
            .eq("admin_id", admin)
            .eq("id", idCliente);

        if (errorCliente) {
            throw new Error(describirErrorSupabase(errorCliente, "No se pudo eliminar el cliente"));
        }

        invalidateCache(admin);

        return {
            clienteId: idCliente,
            clientesEliminados: db.clientes.filter((item) => item.adminID === admin && item.id === idCliente).length,
            creditosEliminados: db.creditos.filter((item) => item.adminID === admin && item.clienteId === idCliente).length,
            cuotasEliminadas: db.cuotas.filter((item) => item.adminID === admin && creditosClienteIds.includes(item.creditoId)).length,
            pagosEliminados: db.pagos.filter((item) => item.adminID === admin && creditosClienteIds.includes(item.creditoId)).length
        };
    }



// -----------------------------------------------------------------------------
// LOGICA DE INTERACCION CON EL DOM
// -----------------------------------------------------------------------------

    async function listarCreditosPorDni(adminID, dni) {
        const admin = validarAdminId(adminID);
        const db = await cargarDB(admin);
        const cliente = buscarClientePorDNI(db, admin, dni);
        if (!cliente) return [];

        return db.creditos.filter(
        (credito) => credito.adminID === cliente.adminID && credito.clienteId === cliente.id
        );
    }

    async function obtenerProximaCuotaPendiente(adminID, creditoId) {
        const admin = validarAdminId(adminID);
        const idCredito = texto(creditoId);
        const db = await cargarDB(admin);

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

        const cuotasPorId = new Map(cuotas.map((cuota) => [cuota.id, cuota]));

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

        const totalSemanas = Math.max(
            1,
            contarSemanasCobroCalendario(credito.fechaInicio, credito.fechaFin || credito.fechaInicio)
        );
        const hoyISO = new Date().toISOString().slice(0, 10);
        const semanaActual = obtenerNumeroSemanaCobro(credito.fechaInicio, hoyISO, totalSemanas);
        const inicioSemanaBase = inicioSemanaCobro(credito.fechaInicio);
        const inicioSemanaActual = sumarDiasCalendario(inicioSemanaBase, (semanaActual - 1) * 7);
        const finSemanaActual = sumarDiasCalendario(inicioSemanaActual, 5);

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

        function calcularDiferenciaContraSemana(inicioSemana, finSemana) {
            const pagosSemana = pagos.filter(
                (pago) =>
                    pago.fechaPago &&
                    compararFechasISO(pago.fechaPago, inicioSemana) >= 0 &&
                    compararFechasISO(pago.fechaPago, finSemana) <= 0
            );

            const pagosPorCuota = new Map();
            pagosSemana.forEach((pago) => {
                if (!cuotasPorId.has(pago.cuotaId)) return;
                const acumulado = numero(pagosPorCuota.get(pago.cuotaId)) + numero(pago.monto);
                pagosPorCuota.set(pago.cuotaId, acumulado);
            });

            let total = 0;
            pagosPorCuota.forEach((montoPagado, cuotaId) => {
                const cuota = cuotasPorId.get(cuotaId);
                if (!cuota) return;
                const diferencia = redondearMoneda(numero(cuota.montoEsperado) - numero(montoPagado));
                if (diferencia > 0) total += diferencia;
            });

            return redondearMoneda(total);
        }

        const diferenciaContraSemanaActual = calcularDiferenciaContraSemana(
            inicioSemanaActual,
            finSemanaActual
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
        let diferenciaContraAcumulada = 0;

        // Cada semana es calendario lunes a sabado.
        for (let semana = 1; semana <= totalSemanas; semana += 1) {
            const inicioSemana = sumarDiasCalendario(inicioSemanaBase, (semana - 1) * 7);
            const finSemana = sumarDiasCalendario(inicioSemana, 5);

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

            const diferenciaContraSemana = calcularDiferenciaContraSemana(inicioSemana, finSemana);

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
            diferenciaContraAcumulada = redondearMoneda(diferenciaContraAcumulada + diferenciaContraSemana);

            historialSemanal.push({
                semana,
                inicioSemana,
                finSemana,
                recaudado: recaudadoSemana,
                pendiente: pendienteSemana,
                ganancia: gananciaSemana,
                recaudadoAcumulado,
                gananciaAcumulada,
                diferenciaContra: diferenciaContraSemana,
                diferenciaContraAcumulada
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
            diferenciaContraSemanaActual,
            historialSemanal,
            deuda
        };
    }

    // Devuelve clientes ya enriquecidos con resumenes de sus creditos.
    async function obtenerClientesConResumen(adminID) {
        const admin = validarAdminId(adminID);
        const db = await cargarDB(admin);

        let huboAjustesPorRedondeo = false;
        let huboAjustesFechas = false;
        const cuotasAjustadas = [];
        const creditosAjustados = [];

        db.cuotas.forEach((cuota) => {
            if (cuota.adminID !== admin) return;

            if (saldoConsideradoCerrado(cuota.saldoPendiente) && cuota.saldoPendiente !== 0) {
                cuota.saldoPendiente = 0;
                cuota.estado = ESTADOS_CUOTA.PAGA;
                huboAjustesPorRedondeo = true;
                cuotasAjustadas.push(cuota);
            }
        });

        db.creditos.forEach((credito) => {
            if (credito.adminID !== admin) return;
            if (!credito.fechaAlta || !credito.fechaInicio) return;

            const fechaAltaISO = String(credito.fechaAlta).slice(0, 10);
            if (!fechaAltaISO) return;

            if (credito.fechaInicio === fechaAltaISO) {
                const nuevaFechaInicio = sumarDiasCobro(fechaAltaISO, 1);
                credito.fechaInicio = nuevaFechaInicio;
                credito.fechaFin = sumarDiasCobro(nuevaFechaInicio, Number(credito.cantidadCuotas || 1) - 1);

                creditosAjustados.push(credito);

                db.cuotas.forEach((cuota) => {
                    if (cuota.adminID !== admin || cuota.creditoId !== credito.id) return;
                    cuota.fechaVencimiento = sumarDiasCobro(credito.fechaInicio, Number(cuota.numero || 1) - 1);
                    cuotasAjustadas.push(cuota);
                });

                huboAjustesFechas = true;
            }
        });

        if (huboAjustesPorRedondeo || huboAjustesFechas) {
            const supabase = getSupabaseClient();

            if (cuotasAjustadas.length) {
                const { error: errorCuotas } = await supabase
                    .from("cuotas")
                    .upsert(cuotasAjustadas.map(mapCuotaToDb), { onConflict: "id" });

                if (errorCuotas) {
                    throw new Error(describirErrorSupabase(errorCuotas, "No se pudieron ajustar las cuotas"));
                }
            }

            if (creditosAjustados.length) {
                const { error: errorCreditos } = await supabase
                    .from("creditos")
                    .upsert(creditosAjustados.map(mapCreditoToDb), { onConflict: "id" });

                if (errorCreditos) {
                    throw new Error(describirErrorSupabase(errorCreditos, "No se pudieron ajustar los creditos"));
                }
            }

            setCache(admin, db);
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
    async function buscarClientesPorNombre(adminID, textoBusqueda) {
        const clientes = await obtenerClientesConResumen(adminID);
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
        actualizarCliente,
        crearCredito,
        actualizarCredito,
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
