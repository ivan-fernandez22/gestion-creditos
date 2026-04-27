"use strict";

(function () {
    const SESSION_KEY = "capital_plus_session_v1";

    function guardarSesion(sesion) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(sesion || null));
    }

    function obtenerSesion() {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;

        try {
            const data = JSON.parse(raw);
            if (!data || typeof data !== "object") return null;
            if (!data.adminId) return null;
            return data;
        } catch {
            return null;
        }
    }

    function cerrarSesion() {
        localStorage.removeItem(SESSION_KEY);
    }

    window.Auth = {
        SESSION_KEY,
        guardarSesion,
        obtenerSesion,
        cerrarSesion
    };
})();
