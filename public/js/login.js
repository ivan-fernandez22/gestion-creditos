"use strict";

(function () {
    if (!window.Auth) {
        throw new Error("auth.js debe cargarse antes que login.js");
    }

    const supabase = window.SupabaseClient || null;

    const form = document.getElementById("form-login");
    const inputUser = document.getElementById("user");
    const inputPass = document.getElementById("pass");

    function avisarErrorLogin(mensaje) {
        if (window.Swal && typeof window.Swal.fire === "function") {
            window.Swal.fire({
                icon: "error",
                title: "Acceso denegado",
                text: mensaje || "No se pudo iniciar sesion. Revisa email y contrasena.",
                confirmButtonText: "Entendido",
                confirmButtonColor: "#c5a043"
            });
            return;
        }

        alert(mensaje || "No se pudo iniciar sesion. Revisa email y contrasena.");
    }

    async function inicializarLogin() {
        const sesionActual = await window.Auth.obtenerSesion();
        if (sesionActual) {
            window.location.href = "main.html";
            return;
        }

        if (!form || !inputUser || !inputPass) return;

        form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!supabase) {
            avisarErrorLogin("Supabase no esta configurado. Revisa js/supabaseClient.js.");
            return;
        }

        const email = String(inputUser.value || "").trim().toLowerCase();
        const password = String(inputPass.value || "");

        if (!email || !password) {
            avisarErrorLogin("Completa email y contrasena para continuar.");
            return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error || !data || !data.user) {
            const mensaje = error && error.message ? error.message : "Credenciales invalidas o usuario no confirmado.";
            avisarErrorLogin(mensaje);
            inputPass.value = "";
            inputPass.focus();
            return;
        }

        const user = data.user;

        window.Auth.guardarSesion({
            adminId: user.id,
            usuario: user.email || email,
            nombre: (user.user_metadata && user.user_metadata.nombre) || user.email || email,
            fechaLogin: new Date().toISOString()
        });

            window.location.href = "main.html";
        });

        window.Auth.iniciarVigilanciaSesion(() => {
            if (inputPass) inputPass.value = "";
        });
    }

    inicializarLogin();
})();
