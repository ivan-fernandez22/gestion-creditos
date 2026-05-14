"use strict";

(function () {
    function formatearMoneda(valor) {
        return new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            minimumFractionDigits: 2
        }).format(Number(valor || 0));
    }

    function formatearFecha(valor) {
        if (!valor) return "-";
        const esISODate = /^\d{4}-\d{2}-\d{2}$/.test(String(valor));
        const fecha = esISODate ? new Date(`${valor}T00:00:00`) : new Date(valor);
        if (Number.isNaN(fecha.getTime())) return String(valor);
        return fecha.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    }

    function formatearHora(valor) {
        if (!valor) return "";
        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) return "";
        return fecha.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function sumarDiaCobro(fechaISO) {
        if (!fechaISO) return "";
        const fecha = new Date(`${fechaISO}T00:00:00`);
        if (Number.isNaN(fecha.getTime())) return fechaISO;

        fecha.setDate(fecha.getDate() + 1);
        while (fecha.getDay() === 0) {
            fecha.setDate(fecha.getDate() + 1);
        }

        return fecha.toISOString().slice(0, 10);
    }

    function clasesEstado(estado) {
        if (estado === "finalizado") return "bg-slate-400/20 text-slate-200 border border-slate-400/30";
        if (estado === "urgente") return "bg-rose-500/20 text-rose-200 border border-rose-500/40";
        if (estado === "atrasado") return "bg-rose-500/20 text-rose-200 border border-rose-500/40";
        return "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30";
    }

    function etiquetaEstado(estado) {
        if (estado === "finalizado") return "Finalizado";
        if (estado === "urgente") return "Urgente";
        if (estado === "atrasado") return "Urgente";
        return "En curso";
    }

    function clasesCuota(estado) {
        if (estado === "paga") {
            return {
                contenedor: "bg-emerald-50 border border-emerald-100",
                chip: "bg-emerald-500 text-white shadow-emerald-200"
            };
        }
        if (estado === "parcial") {
            return {
                contenedor: "cuota-parcial",
                chip: "cuota-parcial-chip"
            };
        }
        if (estado === "vencida") {
            return {
                contenedor: "bg-rose-50 border border-rose-100",
                chip: "bg-rose-500 text-white shadow-rose-200"
            };
        }
        return {
            contenedor: "bg-slate-50 border border-slate-200 border-dashed opacity-70",
            chip: "bg-slate-200 text-slate-500"
        };
    }

    function renderCuotas(cuotas, fechaAltaISO) {
        if (!Array.isArray(cuotas) || !cuotas.length) {
            return "";
        }

        const cuotasOrdenadas = [...cuotas].sort((a, b) => Number(a.numero) - Number(b.numero));

        return cuotasOrdenadas
            .map((cuota) => {
                const numero = String(cuota.numero || 0).padStart(2, "0");
                const hoyISO = (() => {
                    const hoy = new Date();
                    const year = hoy.getFullYear();
                    const month = String(hoy.getMonth() + 1).padStart(2, "0");
                    const day = String(hoy.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}`;
                })();
                const estadoBase = cuota.estado || "pendiente";
                const estado = estadoBase === "parcial" || estadoBase === "paga"
                    ? estadoBase
                    : cuota.fechaVencimiento && cuota.fechaVencimiento < hoyISO && Number(cuota.saldoPendiente || 0) > 0
                        ? "vencida"
                        : estadoBase;
                const clases = clasesCuota(estado);
                const fechaProgramada = cuota.numero === 1 && fechaAltaISO && cuota.fechaVencimiento === fechaAltaISO
                    ? sumarDiaCobro(fechaAltaISO)
                    : cuota.fechaVencimiento;
                const fechaPago = cuota.fechaPago || fechaProgramada || "";
                const horaPago = formatearHora(cuota.fechaPagoHora || cuota.fechaPago || "");

                const detalleFecha = estado === "pendiente"
                    ? `Programada para ${formatearFecha(fechaPago)}`
                    : `${formatearFecha(fechaPago)}${horaPago ? " - " + horaPago + " hs" : ""}`;

                const montoPagado = formatearMoneda(cuota.montoPagado || 0);
                const saldoCuota = formatearMoneda(cuota.saldoPendiente || 0);
                const observacion = String(cuota.observacion || "").trim();

                const tituloCuota = estado === "vencida"
                    ? "Cuota vencida"
                    : estado === "parcial"
                        ? "Pago parcial"
                        : cuota.titulo || "Cuota";

                return `
                    <div class="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-3xl gap-4 ${clases.contenedor}">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-lg ${clases.chip}">
                                ${numero}
                            </div>
                            <div>
                                <p class="text-sm font-black text-slate-800">${tituloCuota}</p>
                                <p class="text-[10px] text-slate-600 flex items-center gap-1">
                                    <i data-lucide="calendar" class="w-3 h-3"></i> ${detalleFecha}
                                </p>
                                ${observacion ? `<p class="text-[10px] text-slate-500 mt-1">Obs: ${observacion}</p>` : ""}
                            </div>
                        </div>
                        <div class="flex items-center gap-6 justify-between md:justify-end">
                            <div class="text-right">
                                <p class="text-[9px] font-bold text-slate-500 uppercase">Pago</p>
                                <p class="text-sm font-black text-emerald-600">${montoPagado}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[9px] font-bold text-slate-500 uppercase">Debe de cuota</p>
                                <p class="text-sm font-black text-rose-600">${saldoCuota}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[9px] font-bold text-slate-500 uppercase">Monto esperado</p>
                                <p class="text-sm font-black text-slate-700">${formatearMoneda(cuota.montoEsperado || 0)}</p>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    function renderDesglose(params) {
        const {
            contenedor,
            credito,
            cliente,
            cuotas,
            resumen
        } = params || {};

        if (!contenedor) return;

        const estado = credito?.estadoVisual || credito?.estado || "activo";
        const montoSolicitado = formatearMoneda(credito?.montoSolicitado || 0);
        const montoTotal = formatearMoneda(credito?.montoTotal || 0);
        const fechaInicio = formatearFecha(credito?.fechaInicio);
        const fechaFin = formatearFecha(credito?.fechaFin);
        const plan = credito?.plan || "-";
        const valorCuota = formatearMoneda(credito?.valorCuota || 0);
        const totalRecaudado = Number(resumen?.totalRecaudado || 0);
        const saldoRestante = Math.max(0, Number(credito?.montoTotal || 0) - totalRecaudado);
        const fechaAltaISO = credito?.fechaAlta ? String(credito.fechaAlta).slice(0, 10) : "";

        contenedor.innerHTML = `
            <div class="w-full bg-white">
                <div class="bg-slate-900 p-6 md:p-8 text-white">
                    <div class="flex flex-col gap-2 mb-6">
                        <div class="flex items-center justify-between w-full">
                            <span class="text-yellow-500 font-black text-[12px] uppercase tracking-[0.2em]">Historial Detallado</span>
                            <div class="flex items-center gap-2">
                                <button type="button" data-action="cerrar-desglose" class="p-2 rounded-full border border-white/10 bg-white/10 hover:bg-white/20 transition-all" title="Cerrar">
                                    <i data-lucide="x" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center justify-between w-full gap-4">
                            <h1 class="text-2xl md:text-3xl font-black leading-tight">${credito?.nombre || "Credito"}</h1>
                            <span class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${clasesEstado(estado)} mt-2">
                                <span class="w-1.5 h-1.5 rounded-full animate-pulse ${estado === "urgente" || estado === "atrasado" ? "bg-rose-400" : "bg-emerald-400"}"></span>
                                ${etiquetaEstado(estado)}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 text-slate-300">
                            <i data-lucide="user" class="w-4 h-4"></i>
                            <p class="text-sm font-medium italic">${cliente?.nombre || ""} ${cliente?.apellido || ""}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 border-t border-white/10 pt-6">
                        <div class="border-l-2 border-oro pl-3">
                            <p class="text-[9px] font-bold text-slate-300 uppercase mb-1">Total a Devolver</p>
                            <p class="text-base font-bold text-yellow-500">${montoTotal}</p>
                        </div>
                        <div class="border-l-2 border-emerald-400/60 pl-3">
                            <p class="text-[9px] font-bold text-slate-300 uppercase mb-1">Saldo Restante</p>
                            <p class="text-base font-bold text-emerald-300">${formatearMoneda(saldoRestante)}</p>
                        </div>
                        <div class="border-l-2 border-slate-700 pl-3">
                            <p class="text-[9px] font-bold text-slate-300 uppercase mb-1">Inicio</p>
                            <p class="text-xs font-bold text-slate-200">${fechaInicio}</p>
                        </div>
                        <div class="border-l-2 border-rose-500/50 pl-3">
                            <p class="text-[9px] font-bold text-slate-300 uppercase mb-1">Finaliza</p>
                            <p class="text-xs font-bold text-emerald-300">${fechaFin}</p>
                        </div>
                    </div>
                </div>

                <div class="p-4 md:p-8">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-[13px] font-black text-slate-800 uppercase tracking-widest">Seguimiento de Cuotas</h3>
                        <div class="text-[10px] font-bold bg-slate-100 px-3 py-1 rounded-full text-slate-600">
                            <span>PLAN ${plan} DIAS</span>
                            <span>- CUOTA: ${valorCuota}</span>
                        </div>
                    </div>

                    <div class="space-y-3">
                        ${renderCuotas(cuotas, fechaAltaISO)}
                    </div>
                </div>

                <div class="p-6 bg-slate-100 border-t border-slate-200 flex justify-end">
                    <button type="button" data-action="exportar-desglose" class="bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold text-xs hover:bg-black transition-all flex items-center gap-2">
                        <i data-lucide="download" class="w-4 h-4"></i> EXPORTAR
                    </button>
                </div>
            </div>
        `;

        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
    }

    window.UIDesglose = {
        renderDesglose
    };
})();
