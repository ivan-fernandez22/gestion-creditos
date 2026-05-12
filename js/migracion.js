"use strict";

(function () {
    const MIGRATION_FLAG_KEY = "capital_plus_migration_v1";
    const BATCH_SIZE = 200;

    function notificar(mensaje, tipo) {
        if (window.Swal && typeof window.Swal.fire === "function") {
            const icon = tipo === "error" ? "error" : "success";
            window.Swal.fire({
                icon,
                title: tipo === "error" ? "Migracion fallida" : "Migracion completa",
                text: mensaje,
                confirmButtonColor: "#c5a043"
            });
            return;
        }

        alert(mensaje);
    }

    function obtenerDBLocal() {
        const storageKey = window.Datos && window.Datos.STORAGE_KEY
            ? window.Datos.STORAGE_KEY
            : "capital_plus_db_v1";
        const raw = localStorage.getItem(storageKey);

        if (!raw) return { clientes: [], creditos: [], cuotas: [], pagos: [] };

        try {
            const data = JSON.parse(raw);
            return {
                clientes: Array.isArray(data.clientes) ? data.clientes : [],
                creditos: Array.isArray(data.creditos) ? data.creditos : [],
                cuotas: Array.isArray(data.cuotas) ? data.cuotas : [],
                pagos: Array.isArray(data.pagos) ? data.pagos : []
            };
        } catch {
            return { clientes: [], creditos: [], cuotas: [], pagos: [] };
        }
    }

    function chunkArray(items, size) {
        const resultado = [];
        for (let i = 0; i < items.length; i += size) {
            resultado.push(items.slice(i, i + size));
        }
        return resultado;
    }

    async function upsertBatches(supabase, table, rows, conflictColumns) {
        if (!rows.length) return 0;
        const lotes = chunkArray(rows, BATCH_SIZE);
        let total = 0;

        for (const lote of lotes) {
            const { error } = await supabase
                .from(table)
                .upsert(lote, { onConflict: conflictColumns || "id" });
            if (error) {
                throw new Error(`Fallo al migrar ${table}: ${error.message || error}`);
            }
            total += lote.length;
        }

        return total;
    }

    function normalizarDni(valor) {
        return String(valor || "").replace(/\D/g, "");
    }

    function mapClientes(clientes, adminId, idPorDni) {
        return clientes.map((item) => ({
            id: idPorDni[normalizarDni(item.dni)] || item.id,
            admin_id: adminId,
            nombre: item.nombre,
            apellido: item.apellido,
            dni: item.dni,
            telefono: item.telefono,
            direccion_real: item.direccionReal,
            direccion_comercio: item.direccionComercio,
            rubro: item.rubro,
            estado: item.estado,
            fecha_alta: item.fechaAlta
        }));
    }

    function dedupeClientesPorDni(clientes) {
        const mapa = new Map();

        clientes.forEach((cliente) => {
            const key = normalizarDni(cliente.dni) || `__id_${cliente.id}`;
            mapa.set(key, cliente);
        });

        return Array.from(mapa.values());
    }

    function mapCreditos(creditos, adminId, idClienteMap) {
        return creditos.map((item) => ({
            id: item.id,
            admin_id: adminId,
            cliente_id: idClienteMap[item.clienteId] || item.clienteId,
            nombre: item.nombre,
            plan: item.plan,
            tasa_interes: item.tasaInteres,
            monto_solicitado: item.montoSolicitado,
            monto_total: item.montoTotal,
            valor_cuota: item.valorCuota,
            cantidad_cuotas: item.cantidadCuotas,
            fecha_inicio: item.fechaInicio,
            fecha_fin: item.fechaFin,
            estado: item.estado,
            fecha_alta: item.fechaAlta
        }));
    }

    function mapCuotas(cuotas, adminId) {
        return cuotas.map((item) => ({
            id: item.id,
            admin_id: adminId,
            credito_id: item.creditoId,
            numero: item.numero,
            monto_esperado: item.montoEsperado,
            monto_pagado: item.montoPagado,
            saldo_pendiente: item.saldoPendiente,
            fecha_vencimiento: item.fechaVencimiento,
            estado: item.estado,
            fecha_alta: item.fechaAlta
        }));
    }

    function mapPagos(pagos, adminId) {
        return pagos.map((item) => ({
            id: item.id,
            admin_id: adminId,
            credito_id: item.creditoId,
            cuota_id: item.cuotaId,
            monto: item.monto,
            fecha_pago: item.fechaPago,
            tipo: item.tipo,
            observacion: item.observacion,
            fecha_alta: item.fechaAlta
        }));
    }

    async function ejecutarMigracion() {
        const flag = localStorage.getItem(MIGRATION_FLAG_KEY);
        if (flag) return;

        const supabase = window.SupabaseClient;
        if (!supabase) return;

        const { data, error } = await supabase.auth.getUser();
        if (error || !data || !data.user) {
            notificar("No se encontro un usuario logueado en Supabase.", "error");
            return;
        }

        const adminId = data.user.id;
        const db = obtenerDBLocal();
        const totalLocal =
            (db.clientes?.length || 0) +
            (db.creditos?.length || 0) +
            (db.cuotas?.length || 0) +
            (db.pagos?.length || 0);

        if (!totalLocal) {
            localStorage.setItem(MIGRATION_FLAG_KEY, "empty");
            return;
        }

        const { data: clientesExistentes, error: errorClientesExistentes } = await supabase
            .from("clientes")
            .select("id,dni")
            .eq("admin_id", adminId);

        if (errorClientesExistentes) {
            throw new Error(`No se pudieron leer clientes existentes: ${errorClientesExistentes.message || errorClientesExistentes}`);
        }

        const idPorDni = {};
        (clientesExistentes || []).forEach((cliente) => {
            const dniKey = normalizarDni(cliente.dni);
            if (dniKey) idPorDni[dniKey] = cliente.id;
        });

        const idClienteMap = {};
        (db.clientes || []).forEach((cliente) => {
            const dniKey = normalizarDni(cliente.dni);
            idClienteMap[cliente.id] = idPorDni[dniKey] || cliente.id;
        });

        const clientesLocales = dedupeClientesPorDni(db.clientes || []);
        const clientes = mapClientes(clientesLocales, adminId, idPorDni);
        const creditos = mapCreditos(db.creditos || [], adminId, idClienteMap);
        const cuotas = mapCuotas(db.cuotas || [], adminId);
        const pagos = mapPagos(db.pagos || [], adminId);

        const migradosClientes = await upsertBatches(supabase, "clientes", clientes, "admin_id,dni");
        const migradosCreditos = await upsertBatches(supabase, "creditos", creditos, "id");
        const migradosCuotas = await upsertBatches(supabase, "cuotas", cuotas, "id");
        const migradosPagos = await upsertBatches(supabase, "pagos", pagos, "id");

        localStorage.setItem(MIGRATION_FLAG_KEY, `done:${new Date().toISOString()}`);

        notificar(
            `Migracion completa. Clientes: ${migradosClientes}, Creditos: ${migradosCreditos}, Cuotas: ${migradosCuotas}, Pagos: ${migradosPagos}.`,
            "ok"
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            ejecutarMigracion().catch((error) => {
                notificar(error.message || "Error inesperado en migracion.", "error");
            });
        });
    } else {
        ejecutarMigracion().catch((error) => {
            notificar(error.message || "Error inesperado en migracion.", "error");
        });
    }
})();
