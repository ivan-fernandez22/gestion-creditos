"use strict";

// Estructuras base del sistema. Este archivo define el "molde" de los datos.
window.Datos = {
    SCHEMA_VERSION: "1.0.0",
    STORAGE_KEY: "capital_plus_db_v1",
    ADMIN_ID_DEFAULT: "admin-demo",

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
