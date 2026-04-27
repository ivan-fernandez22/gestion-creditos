"use strict";

(function () {
    if (!window.Auth) {
        throw new Error("auth.js debe cargarse antes que login.js");
    }

    const USUARIOS = [
        {
            usuario: "amigo",
            clave: "oro123",
            adminId: "admin-amigo",
            nombre: "Amigo"
        },
        {
            usuario: "socio",
            clave: "plata456",
            adminId: "admin-socio",
            nombre: "Socio"
        }
    ];

    const form = document.getElementById("form-login");
    const inputUser = document.getElementById("user");
    const inputPass = document.getElementById("pass");

    function avisarCredencialesIncorrectas() {
        if (window.Swal && typeof window.Swal.fire === "function") {
            window.Swal.fire({
                icon: "error",
                title: "Acceso denegado",
                text: "Las credenciales ingresadas no son correctas. Revisa usuario y contraseña.",
                confirmButtonText: "Entendido",
                confirmButtonColor: "#c5a043"
            });
            return;
        }

        alert("Las credenciales ingresadas no son correctas. Revisa usuario y contraseña.");
    }

    const sesionActual = window.Auth.obtenerSesion();
    if (sesionActual) {
        window.location.href = "main.html";
        return;
    }

    if (!form || !inputUser || !inputPass) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const usuarioIngresado = String(inputUser.value || "").trim().toLowerCase();
        const claveIngresada = String(inputPass.value || "");

        const usuario = USUARIOS.find(
            (item) => item.usuario === usuarioIngresado && item.clave === claveIngresada
        );

        if (!usuario) {
            avisarCredencialesIncorrectas();
            inputPass.value = "";
            inputPass.focus();
            return;
        }

        window.Auth.guardarSesion({
            adminId: usuario.adminId,
            usuario: usuario.usuario,
            nombre: usuario.nombre,
            fechaLogin: new Date().toISOString()
        });

        window.location.href = "main.html";
    });
})();
