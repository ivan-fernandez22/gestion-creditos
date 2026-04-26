const baseDeDatosClientes = [];

// Función PURA: Solo crea y retorna, no toca variables externas
const crearClienteData = (nombre, telefono) => {
    // Validación mínima (Un Senior no deja pasar basura)
    if (!nombre || !telefono) throw new Error("Datos incompletos");

    return {
        id: crypto.randomUUID(),
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        fechaRegistro: new Date().toISOString().split("T")[0],
        creditos: []
    };
};

// Lógica de "Estado": Esta función sí gestiona el array
const registrarCliente = (nombre, telefono) => {
    try {
        const nuevo = crearClienteData(nombre, telefono);
        baseDeDatosClientes.push(nuevo);
        return nuevo;
    } catch (error) {
        console.error(`Error al registrar: ${error.message}`);
    }
};


// /* Creá una segunda función: agregarCreditoACliente(clienteId, monto, cuotas).
// - Debe buscar al cliente por su ID en el array.
// - Crear un objeto "crédito" (con su propia estructura interna) y pushearlo al array de créditos de ese cliente.
// - Recordá: El crédito debe calcular automáticamente el totalADevolver (monto * 1.20) y el valorCuota. */

// const interes12Cuotas = 1.2;
// const interes17Cuotas = 1.258;
// const interes24Cuotas = 1.408;
// const interes30Cuotas = 1.6;

// // Función PURA: Solo construye el objeto crédito con sus cálculos
// const crearCreditoData = (monto, cuotas) => {
//     const tasas = {
//         12: interes12Cuotas,
//         17: interes17Cuotas,
//         24: interes24Cuotas,
//         30: interes30Cuotas,
//     };

//     const interes = tasas[cuotas];
//     if (!interes) throw new Error(`Cuotas inválidas: ${cuotas}`);

//     const totalADevolver = monto * interes;
//     const valorCuota = totalADevolver / cuotas;

//     return {
//         id: crypto.randomUUID(),
//         montoPedido: monto,
//         interesPorcentaje: interes,
//         totalADevolver: totalADevolver,
//         cuotasTotales: cuotas,
//         valorCuota: valorCuota,
//         pagosHistorial: []
//     };
// };

// // Lógica de "Estado": Busca el cliente y le pushea el crédito
// const agregarCreditoACliente = (clienteId, monto, cuotas) => {
//     try {
//         if (!clienteId || !monto || !cuotas) throw new Error("Datos incompletos");

//         const cliente = baseDeDatosClientes.find(c => c.id === clienteId);
//         if (!cliente) throw new Error("Cliente no encontrado");

//         const nuevoCredito = crearCreditoData(monto, cuotas);
//         cliente.creditos.push(nuevoCredito);
//         return nuevoCredito;

//     } catch (error) {
//         console.error(`Error al agregar crédito: ${error.message}`);
//     }
// };

// // PRUEBA
// const ivan = registrarCliente("Ivan Fernandez", "1170351516");
// agregarCreditoACliente(ivan.id, 100000, 12);
// console.log(baseDeDatosClientes);





// CODIGO MEJORADO:

// Configuración centralizada
const TASAS_INTERES = {
    12: 1.2,
    17: 1.258,
    24: 1.408,
    30: 1.6
};

const crearCreditoData = (monto, cuotas) => {
    const interes = TASAS_INTERES[cuotas];
    
    // Validaciones de negocio
    if (!interes) throw new Error(`El plan de ${cuotas} cuotas no existe.`);
    if (monto <= 0) throw new Error("El monto debe ser mayor a cero.");

    const totalADevolver = Math.round(monto * interes);
    const valorCuota = Math.round(totalADevolver / cuotas);

    return {
        id: `cred-${crypto.randomUUID().split('-')[0]}`, // ID más corto para la UI
        fechaInicio: new Date().toISOString().split("T")[0],
        montoPedido: monto,
        interesPorcentaje: (interes - 1) * 100, // Guardamos el % real (ej: 20)
        totalADevolver,
        cuotasTotales: cuotas,
        cuotasPagadas: 0,
        valorCuota,
        pagosHistorial: []
    };
};

const agregarCreditoACliente = (clienteId, monto, cuotas) => {
    try {
        if (!clienteId || !monto || !cuotas) throw new Error("Datos incompletos");

        const cliente = baseDeDatosClientes.find(c => c.id === clienteId);
        if (!cliente) throw new Error("Cliente no encontrado");

        const nuevoCredito = crearCreditoData(monto, cuotas);
        cliente.creditos.push(nuevoCredito);
        return nuevoCredito;

    } catch (error) {
        console.error(`Error al agregar crédito: ${error.message}`);
    }
};

const ivan = registrarCliente("Ivan Fernandez", "1170351516");
agregarCreditoACliente(ivan.id, 100000, 12);
console.log(baseDeDatosClientes);