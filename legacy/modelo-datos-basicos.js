"use strict";

// Variante simplificada del modelo de datos para aprendizaje paso a paso.
// Se conserva como apoyo didactico frente al modelo completo.

// -----------------------------------------------------------------------------
// MODELO DE DATOS (VERSION BASICA)
// -----------------------------------------------------------------------------
// Objetivo de este archivo:
// - Que puedas entender rapido como crear objetos cliente, credito, cuota y pago.
// - Que veas calculos simples sin demasiadas funciones auxiliares.
// - Que lo uses para aprender y comparar con modelo-datos.js.
// -----------------------------------------------------------------------------

// Planes disponibles.
// multiplicador = montoFinal / montoPedido
// Ejemplo: 1.2 => devuelve 20% mas.
const PLANES = {
  12: 1.2,
  17: 1.258,
  24: 1.408,
  30: 1.6
};

// Funcion para redondear montos a 2 decimales.
function redondear(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

// Crea un ID simple.
// Para aprender alcanza; luego puedes usar crypto.randomUUID().
function crearIdSimple(prefijo) {
  return prefijo + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
}

// -----------------------------------------------------------------------------
// 1) CLIENTE
// -----------------------------------------------------------------------------
// Recibe datos basicos y devuelve un objeto cliente.
function crearClienteBasico(adminID, nombre, apellido, dni, telefono) {
  return {
    id: crearIdSimple("cli"),
    adminID: String(adminID || "").trim(),
    nombre: String(nombre || "").trim(),
    apellido: String(apellido || "").trim(),
    dni: String(dni || "").trim(),
    telefono: String(telefono || "").trim(),
    estado: "activo",
    fechaAlta: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// 2) CREDITO
// -----------------------------------------------------------------------------
// Calcula automaticamente monto total y valor de cuota.
function crearCreditoBasico(adminID, clienteId, nombreCredito, plan, montoPedido, fechaInicio) {
  const multiplicador = PLANES[plan];

  if (!multiplicador) {
    throw new Error("Plan invalido. Usa 12, 17, 24 o 30.");
  }

  const montoSolicitado = redondear(montoPedido);
  const montoTotal = redondear(montoSolicitado * multiplicador);
  const valorCuota = redondear(montoTotal / Number(plan));

  return {
    id: crearIdSimple("cre"),
    adminID: String(adminID || "").trim(),
    clienteId: String(clienteId || "").trim(),
    nombre: String(nombreCredito || "").trim(),
    plan: Number(plan),
    montoSolicitado: montoSolicitado,
    montoTotal: montoTotal,
    valorCuota: valorCuota,
    cantidadCuotas: Number(plan),
    fechaInicio: String(fechaInicio || "").trim(),
    estado: "activo",
    fechaAlta: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// 3) CUOTA
// -----------------------------------------------------------------------------
// Crea una cuota individual. Al inicio siempre esta pendiente.
function crearCuotaBasica(adminID, creditoId, numeroCuota, montoCuota, fechaVencimiento) {
  const montoEsperado = redondear(montoCuota);

  return {
    id: crearIdSimple("cuo"),
    adminID: String(adminID || "").trim(),
    creditoId: String(creditoId || "").trim(),
    numero: Number(numeroCuota),
    montoEsperado: montoEsperado,
    montoPagado: 0,
    saldoPendiente: montoEsperado,
    fechaVencimiento: String(fechaVencimiento || "").trim(),
    estado: "pendiente",
    fechaAlta: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// 4) PAGO
// -----------------------------------------------------------------------------
// Registra el pago realizado. No modifica cuota por si solo.
function crearPagoBasico(adminID, creditoId, cuotaId, monto, fechaPago) {
  const montoPago = redondear(monto);

  return {
    id: crearIdSimple("pag"),
    adminID: String(adminID || "").trim(),
    creditoId: String(creditoId || "").trim(),
    cuotaId: String(cuotaId || "").trim(),
    monto: montoPago,
    fechaPago: String(fechaPago || "").trim(),
    tipo: "parcial",
    fechaAlta: new Date().toISOString()
  };
}

// Exponemos funciones para usarlas desde otros scripts.
window.ModeloDatosBasico = {
  PLANES,
  redondear,
  crearClienteBasico,
  crearCreditoBasico,
  crearCuotaBasica,
  crearPagoBasico
};

// -----------------------------------------------------------------------------
// EJEMPLO RAPIDO DE USO (descomenta para probar)
// -----------------------------------------------------------------------------
// const cliente = ModeloDatosBasico.crearClienteBasico(
//   "dueno-001",
//   "Ivan",
//   "Fernandez",
//   "35123456",
//   "1170351516"
// );
//
// const credito = ModeloDatosBasico.crearCreditoBasico(
//   cliente.adminID,
//   cliente.id,
//   "Prestamo 1",
//   12,
//   100000,
//   "2026-04-22"
// );
//
// const cuota1 = ModeloDatosBasico.crearCuotaBasica(
//   cliente.adminID,
//   credito.id,
//   1,
//   credito.valorCuota,
//   "2026-04-23"
// );
//
// const pago1 = ModeloDatosBasico.crearPagoBasico(
//   cliente.adminID,
//   credito.id,
//   cuota1.id,
//   5000,
//   "2026-04-22"
// );
//
// console.log({ cliente, credito, cuota1, pago1 });
