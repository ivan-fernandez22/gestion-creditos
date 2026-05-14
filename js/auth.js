"use strict";

(function () {
    const SESSION_KEY = "capital_plus_session_v1";

    function guardarSesion(sesion) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(sesion || null));
    }

    function obtenerSesionLocal() {
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

    function mapearUsuarioSupabase(user) {
        if (!user) return null;
        return {
            adminId: user.id,
            usuario: user.email || "",
            nombre: (user.user_metadata && user.user_metadata.nombre) || user.email || "",
            fechaLogin: new Date().toISOString()
        };
    }

    async function obtenerSesion() {
        const supabase = window.SupabaseClient;
        if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== "function") {
            limpiarSesionLocal();
            return null;
        }

        const { data, error } = await supabase.auth.getSession();
        if (!error && data && data.session && data.session.user) {
            const sesion = mapearUsuarioSupabase(data.session.user);
            guardarSesion(sesion);
            return sesion;
        }

        limpiarSesionLocal();
        return null;
    }

    function cerrarSesion() {
        const supabase = window.SupabaseClient;
        if (supabase && supabase.auth && typeof supabase.auth.signOut === "function") {
            supabase.auth.signOut().catch(() => null);
        }
        localStorage.removeItem(SESSION_KEY);
    }

    function limpiarSesionLocal() {
        localStorage.removeItem(SESSION_KEY);
    }

    function iniciarVigilanciaSesion(onSignedOut) {
        const supabase = window.SupabaseClient;
        if (!supabase || !supabase.auth || typeof supabase.auth.onAuthStateChange !== "function") {
            return null;
        }

        const { data } = supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT" || event === "TOKEN_REFRESH_FAILED") {
                limpiarSesionLocal();
                if (typeof onSignedOut === "function") {
                    onSignedOut();
                }
            }
        });

        return data && data.subscription ? data.subscription : null;
    }

    window.Auth = {
        SESSION_KEY,
        guardarSesion,
        obtenerSesion,
        cerrarSesion,
        limpiarSesionLocal,
        iniciarVigilanciaSesion
    };
})();
