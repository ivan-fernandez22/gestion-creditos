"use strict";

(function () {
    function formatearMoneda(valor) {
        return new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            minimumFractionDigits: 2
        }).format(Number(valor || 0));
    }

    function formatearFechaCorta(fecha) {
        if (!fecha) return "-";
        return fecha.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit"
        });
    }

    function renderSemanas(semanas) {
        if (!Array.isArray(semanas) || !semanas.length) {
            return "<p class=\"text-xs text-slate-500\">Sin pagos registrados en este mes.</p>";
        }

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${semanas
                    .map(
                        (semana) => `
                            <div class="bg-white border border-slate-200 rounded-2xl p-4">
                                <div class="flex items-center justify-between">
                                    <p class="text-[11px] font-bold text-slate-500 uppercase">Semana ${semana.numero}</p>
                                    <p class="text-[11px] font-semibold text-slate-400">${formatearFechaCorta(semana.inicio)} - ${formatearFechaCorta(semana.fin)}</p>
                                </div>
                                <div class="mt-3 flex items-center justify-between">
                                    <div>
                                        <p class="text-[10px] font-bold text-slate-400 uppercase">Recaudado</p>
                                        <p class="text-sm font-black text-slate-700">${formatearMoneda(semana.recaudado)}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-[10px] font-bold text-emerald-600 uppercase">Ganancia</p>
                                        <p class="text-sm font-black text-emerald-700">${formatearMoneda(semana.ganancia)}</p>
                                    </div>
                                </div>
                            </div>
                        `
                    )
                    .join("")}
            </div>
        `;
    }

    function renderGanancias(params) {
        const {
            contenedor,
            year,
            months,
            yearOptions
        } = params || {};

        if (!contenedor) return;

        const opciones = (yearOptions || [])
            .map((opcion) => `
                <option value="${opcion}" ${Number(opcion) === Number(year) ? "selected" : ""}>${opcion}</option>
            `)
            .join("");

        contenedor.innerHTML = `
            <div class="w-full bg-white">
                <div class="bg-emerald-500 p-6 md:p-8 text-white">
                    <div class="flex items-center justify-between">
                        <span class="text-white font-black text-[12px] uppercase tracking-[0.2em]">Resumen de Ganancias</span>
                        <button type="button" data-action="cerrar-ganancias" class="p-2 rounded-full border border-white/10 bg-white/10 hover:bg-white/20 transition-all" title="Cerrar">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4">
                        <h1 class="text-2xl md:text-3xl font-black leading-tight">Ganancias ${year}</h1>
                        <div class="flex items-center gap-2">
                            <label class="text-[10px] font-bold text-slate-300 uppercase">Ano</label>
                            <select id="ganancias-year" class="text-xs bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-white">
                                ${opciones}
                            </select>
                        </div>
                    </div>
                    <p class="text-xs text-slate-300 mt-2">Ganancia calculada al 15% de pagos registrados.</p>
                </div>

                <div class="p-4 md:p-8 space-y-6">
                    ${(months || [])
                        .map(
                            (mes, index) => `
                                <div class="bg-slate-50 border border-slate-200 rounded-3xl p-4 md:p-6">
                                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                        <h3 class="text-lg font-black text-slate-800 capitalize">${mes.nombre}</h3>
                                        <div class="flex items-center gap-4 text-sm">
                                            <span class="text-slate-500">Total mes:</span>
                                            <span class="font-black text-emerald-700">${formatearMoneda(mes.gananciaMes)}</span>
                                        </div>
                                    </div>
                                    <div class="mt-3 flex items-center justify-end">
                                        <button type="button" data-action="toggle-semanas" data-target="semanas-${index}" class="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1.5 rounded-full">
                                            <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
                                            Ver mas
                                        </button>
                                    </div>
                                    <div id="semanas-${index}" class="mt-4 hidden">
                                        ${renderSemanas(mes.semanas)}
                                    </div>
                                </div>
                            `
                        )
                        .join("")}
                </div>

                <div class="p-6 bg-slate-100 border-t border-slate-200 flex justify-end">
                    <button type="button" data-action="exportar-ganancias" class="bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold text-xs hover:bg-black transition-all flex items-center gap-2">
                        <i data-lucide="download" class="w-4 h-4"></i> EXPORTAR
                    </button>
                </div>
            </div>
        `;

        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
    }

    window.UIGanancias = {
        renderGanancias
    };
})();
