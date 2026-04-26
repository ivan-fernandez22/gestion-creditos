const clienteEjemplo = {
    id: Date.now(), // ID único temporal
    nombre: "Juan Pérez",
    telefono: "1122334455",
    fechaRegistro: "2026-04-20",
    creditos: [] // Aquí se guardarán los objetos de crédito
};

const creditoEjemplo = {
    id: "cred-" + Date.now(),
    tipo: "diario", // o "semanal"
    montoPedido: 100000,
    interesPorcentaje: 20,
    totalADevolver: 120000,
    cuotasTotales: 12,
    valorCuota: 10000,
    pagosHistorial: [] // { fecha: string, monto: number, deuda: number }
};

/* Implementá una función llamada crearNuevoCliente(nombre, telefono) que:
- Reciba esos dos datos.
- Retorne un objeto con la estructura que puse arriba (ID automático, fecha de hoy automática, array de créditos vacío).
- Guarde ese objeto en un array global llamado baseDeDatosClientes. */

const baseDeDatosClientes = [];

class Cliente {
    constructor (nombre, telefono) {
        this.id = Date.now();
        this.nombre = nombre;
        this.telefono = telefono;
        this.fechaRegistro = new Date().toISOString().split("T")[0];
        this.creditos = [];
    }

    mostrarCliente() {
        return `Nombre: ${this.nombre} - telefono: ${this.telefono} - fecha de registro: ${this.fechaRegistro} `
    }
}

const crearNuevoCliente = (nombre, telefono) => {
    const nuevoCliente = new Cliente (nombre, telefono);
    baseDeDatosClientes.push(nuevoCliente);
    return nuevoCliente;
}

// PRUEBA

const cliente1 = crearNuevoCliente("Ivan Fernandez", "1170351516");
const cliente2 = crearNuevoCliente("Juan Pérez", "1122334455");

console.log(cliente1.mostrarCliente());
console.log(baseDeDatosClientes); // ambos clientes en el array
