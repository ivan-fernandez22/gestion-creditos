"use strict";

// -----------------------------------------------------------------------------
// DATOS.JS
// -----------------------------------------------------------------------------
// Este archivo centraliza constantes y estructuras base del sistema.
// No contiene logica de negocio: solo define "como se guarda" cada entidad.
// -----------------------------------------------------------------------------
window.Datos = {
    // Version de estructura para futuras migraciones.
    SCHEMA_VERSION: "1.0.0",
    // Clave unica usada en localStorage.
    STORAGE_KEY: "capital_plus_db_v1",
    // Admin por defecto para entorno actual.
    ADMIN_ID_DEFAULT: "admin-demo",

    // Estructura esperada para un cliente.
    ESTRUCTURA_CLIENTE: {
        id: "",
        adminID: "",
        nombre: "",
        apellido: "",
        dni: "",
        telefono: "",
        direccionReal: "",
        direccionComercio: "",
        rubro: "",
        estado: "activo",
        fechaAlta: ""
    },

    // Estructura esperada para un credito.
    ESTRUCTURA_CREDITO: {
        id: "",
        adminID: "",
        clienteId: "",
        nombre: "",
        plan: 0,
        tasaInteres: 0,
        montoSolicitado: 0,
        montoTotal: 0,
        valorCuota: 0,
        cantidadCuotas: 0,
        fechaInicio: "",
        fechaFin: "",
        estado: "activo",
        fechaAlta: ""
    },

    // Estructura esperada para una cuota.
    ESTRUCTURA_CUOTA: {
        id: "",
        adminID: "",
        creditoId: "",
        numero: 0,
        montoEsperado: 0,
        montoPagado: 0,
        saldoPendiente: 0,
        fechaVencimiento: "",
        estado: "pendiente",
        fechaAlta: ""
    },

    // Estructura esperada para un pago.
    ESTRUCTURA_PAGO: {
        id: "",
        adminID: "",
        creditoId: "",
        cuotaId: "",
        monto: 0,
        fechaPago: "",
        tipo: "parcial",
        observacion: "",
        fechaAlta: ""
    }
};
