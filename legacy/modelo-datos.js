"use strict";

// -----------------------------------------------------------------------------
// MODELO DE DATOS
// -----------------------------------------------------------------------------
// Este archivo define la "forma" de los datos de tu app:
// - cliente
// - credito
// - cuota
// - pago
//
// Idea principal:
// 1) Tener objetos siempre con la misma estructura.
// 2) Evitar valores sucios (espacios, null, strings raros en montos).
// 3) Reutilizar funciones para que el codigo sea consistente.
// -----------------------------------------------------------------------------

// Version del esquema de datos. Sirve por si en el futuro cambias campos.
const SCHEMA_VERSION = "1.0.0";

// Planes de credito disponibles.
// "multiplicador" es el monto final a devolver sobre el capital pedido.
// Ejemplo: 1.2 significa devolver capital + 20%.
const PLANES_CREDITO = {
  12: { cuotas: 12, multiplicador: 1.2 },
  17: { cuotas: 17, multiplicador: 1.258 },
  24: { cuotas: 24, multiplicador: 1.408 },
  30: { cuotas: 30, multiplicador: 1.6 }
};

// Estados posibles de un cliente dentro del sistema.
const ESTADOS_CLIENTE = {
  ACTIVO: "activo",
  INACTIVO: "inactivo"
};

// Estados posibles de un credito.
const ESTADOS_CREDITO = {
  ACTIVO: "activo",
  ATRASADO: "atrasado",
  FINALIZADO: "finalizado"
};

// Estados posibles de una cuota.
const ESTADOS_CUOTA = {
  PENDIENTE: "pendiente",
  PARCIAL: "parcial",
  PAGA: "paga",
  VENCIDA: "vencida"
};

// Tipo de pago. Normalmente lo vas a determinar cuando apliques el pago.
const TIPOS_PAGO = {
  COMPLETO: "completo",
  PARCIAL: "parcial"
};

// Crea IDs unicos para cada registro.
// Si el navegador soporta crypto.randomUUID() lo usa.
// Si no, genera un id simple con fecha + numero aleatorio.
function crearId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

// Fecha y hora actual en formato ISO (ej: 2026-04-22T18:15:00.000Z).
function fechaActualISO() {
  return new Date().toISOString();
}

// Fuerza a string y quita espacios al inicio/final.
// Evita guardar undefined o null como tal.
function texto(valor) {
  return String(valor || "").trim();
}

// Convierte a numero. Si no viene valor, devuelve 0.
function numero(valor) {
  return Number(valor || 0);
}

// Redondea a 2 decimales para montos de dinero.
// Evita errores tipicos de coma flotante en JS.
function redondearMoneda(valor) {
  return Math.round((numero(valor) + Number.EPSILON) * 100) / 100;
}

// Fabrica de cliente: recibe data y devuelve un objeto cliente listo para guardar.
function crearCliente(data) {
  return {
    // Identificador unico del cliente.
    id: crearId(),
    // ID del usuario/dueno de los datos (clave para separar socios).
    adminID: texto(data.adminID),
    // Datos personales basicos.
    nombre: texto(data.nombre),
    apellido: texto(data.apellido),
    dni: texto(data.dni),
    telefono: texto(data.telefono),
    direccionReal: texto(data.direccionReal),
    direccionComercio: texto(data.direccionComercio),
    rubro: texto(data.rubro),
    // Al crear, el cliente queda activo por defecto.
    estado: ESTADOS_CLIENTE.ACTIVO,
    // Fecha de alta del registro en el sistema.
    fechaAlta: fechaActualISO()
  };
}

// Fabrica de credito: calcula automaticamente montos y cuotas segun el plan.
function crearCredito(data) {
  // Busca el plan que eligio el usuario (12, 17, 24 o 30).
  const planElegido = PLANES_CREDITO[data.plan];

  // Si el plan no existe, frenamos para evitar datos invalidos.
  if (!planElegido) {
    throw new Error("Plan de credito invalido. Usa 12, 17, 24 o 30.");
  }

  // Normalizamos y calculamos:
  // - monto solicitado
  // - monto total a devolver
  // - valor por cuota
  const montoSolicitado = redondearMoneda(data.montoSolicitado);
  const montoTotal = redondearMoneda(montoSolicitado * planElegido.multiplicador);
  const valorCuota = redondearMoneda(montoTotal / planElegido.cuotas);

  return {
    id: crearId(),
    adminID: texto(data.adminID),
    // Relacion con el cliente al que pertenece el credito.
    clienteId: texto(data.clienteId),
    // Nombre interno del credito (ej: "Prestamo Heladera").
    nombre: texto(data.nombre),
    // Plan elegido en numero.
    plan: numero(data.plan),
    // Interes en porcentaje para mostrar en UI (ej: 20).
    tasaInteres: redondearMoneda((planElegido.multiplicador - 1) * 100),
    // Campos monetarios calculados.
    montoSolicitado: montoSolicitado,
    montoTotal: montoTotal,
    valorCuota: valorCuota,
    // Cantidad de cuotas que genera este plan.
    cantidadCuotas: planElegido.cuotas,
    // Fechas del credito (pueden venir vacias si todavia no las definiste).
    fechaInicio: texto(data.fechaInicio),
    fechaFin: texto(data.fechaFin),
    // Al crear, el credito arranca activo.
    estado: ESTADOS_CREDITO.ACTIVO,
    fechaAlta: fechaActualISO()
  };
}

// Fabrica de cuota: crea una cuota individual.
// Suele usarse al generar todas las cuotas de un credito nuevo.
function crearCuota(data) {
  // Monto esperado total de la cuota.
  const montoEsperado = redondearMoneda(data.montoEsperado);
  // Si no se pasa monto pagado, empieza en 0.
  const montoPagado = redondearMoneda(data.montoPagado ?? 0);
  // Si no se pasa saldo, arranca igual al monto esperado.
  const saldoPendiente = redondearMoneda(data.saldoPendiente ?? montoEsperado);

  return {
    id: crearId(),
    adminID: texto(data.adminID),
    // Relacion con el credito padre.
    creditoId: texto(data.creditoId),
    // Numero de cuota (1, 2, 3...).
    numero: numero(data.numero),
    montoEsperado: montoEsperado,
    montoPagado: montoPagado,
    saldoPendiente: saldoPendiente,
    fechaVencimiento: texto(data.fechaVencimiento),
    // Al crear, queda pendiente hasta recibir pagos.
    estado: ESTADOS_CUOTA.PENDIENTE,
    // Fecha de alta de la cuota en el sistema.
    fechaAlta: fechaActualISO()
  };
}

// Fabrica de pago: crea un registro de pago.
// Ojo: esta funcion crea el objeto pago, pero no aplica el pago a la cuota.
// Esa logica (descontar saldo y cambiar estado) se hace en otra capa.
function crearPago(data) {
  const monto = redondearMoneda(data.monto);
  // Si viene "completo" o "parcial" lo respetamos; si no, por defecto parcial.
  const tipoIngresado = texto(data.tipo).toLowerCase();

  let tipoFinal = TIPOS_PAGO.PARCIAL;
  if (tipoIngresado === TIPOS_PAGO.COMPLETO || tipoIngresado === TIPOS_PAGO.PARCIAL) {
    tipoFinal = tipoIngresado;
  }

  return {
    id: crearId(),
    adminID: texto(data.adminID),
    creditoId: texto(data.creditoId),
    cuotaId: texto(data.cuotaId),
    monto: monto,
    fechaPago: texto(data.fechaPago),
    tipo: tipoFinal,
    observacion: texto(data.observacion),
    fechaAlta: fechaActualISO()
  };
}

// Exponemos todo en window para poder usarlo desde otros archivos JS.
// Ejemplo:
// const cliente = ModeloDatos.crearCliente({ ... });
window.ModeloDatos = {
  SCHEMA_VERSION,
  PLANES_CREDITO,
  ESTADOS_CLIENTE,
  ESTADOS_CREDITO,
  ESTADOS_CUOTA,
  TIPOS_PAGO,
  crearCliente,
  crearCredito,
  crearCuota,
  crearPago,
  redondearMoneda
};
