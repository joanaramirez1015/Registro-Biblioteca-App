import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

// Nombre del programa en camelCase: así nombra Codama el archivo generado
// (clients/js/src/generated/programs/biblioteca.ts). Lo usa también verificar-contrato.mjs.
export const PROGRAMA = 'biblioteca';

export const REFERENCIA_ID = '38oTMyvUTmqkBQeMiuok5F2mPjp9dVadWdBeQTDNmTUY';
const normalizar = (valor) => String(valor).replace(/_/g, '').toLowerCase();

// Instrucción normalizada -> argumentos normalizados, en orden.
const requeridas = {
  crearbiblioteca: ['nombrebiblioteca'],
  crearlibro: ['titulo', 'autor'],
  registrarprestamo: ['idlibro', 'socio', 'nota', 'dias'],
  cambiardias: ['idlibro', 'socio', 'nuevosdias'],
  registrardevolucion: ['idlibro', 'socio'],
  eliminarlibro: ['idlibro'],
};
const tiposArgumentos = {
  crearbiblioteca: ['string'],
  crearlibro: ['string', 'string'],
  registrarprestamo: ['u16', 'string', 'string', 'u8'],
  cambiardias: ['u16', 'string', 'u8'],
  registrardevolucion: ['u16', 'string'],
  eliminarlibro: ['u16'],
};
// Cuenta -> pares [campo normalizado, tipo] en el orden del IDL.
const camposEsperados = {
  biblioteca: [['owner', 'pubkey'], ['nombrebiblioteca', 'string'], ['libros', 'vec:pubkey'], ['idcounter', 'u16']],
  libro: [['idlibro', 'u16'], ['titulo', 'string'], ['autor', 'string'], ['totalprestamos', 'u16'], ['prestamos', 'vec:pubkey']],
  prestamo: [['socio', 'string'], ['nota', 'string'], ['dias', 'u8']],
};

// Convierte cada tipo del IDL en una cadena estable para poder compararlo.
const tipo = (valor) => {
  if (typeof valor === 'string') return valor === 'publicKey' ? 'pubkey' : valor;
  if (valor?.vec) return 'vec:' + tipo(valor.vec);
  if (valor?.option) return 'option:' + tipo(valor.option);
  if (valor?.array) return 'array:' + tipo(valor.array[0]) + ':' + valor.array[1];
  if (valor?.defined) return 'defined:' + (typeof valor.defined === 'string' ? valor.defined : valor.defined.name);
  return JSON.stringify(valor);
};

export function validarIdl(idl, programIdOpcional) {
  if (!idl || typeof idl !== 'object' || !Array.isArray(idl.instructions)) {
    throw new Error('El archivo no tiene la estructura de un IDL de Anchor.');
  }
  const nombres = idl.name ?? idl.metadata?.name;
  if (normalizar(nombres) !== normalizar(PROGRAMA)) {
    throw new Error('Este frontend espera el programa ' + PROGRAMA + ' (biblioteca).');
  }
  for (const [nombre, argumentos] of Object.entries(requeridas)) {
    const instruccion = idl.instructions.find((item) => normalizar(item.name) === nombre);
    if (!instruccion || !Array.isArray(instruccion.args)) throw new Error('Falta la instruccion ' + nombre);
    const recibidos = instruccion.args.map((item) => normalizar(item.name));
    if (JSON.stringify(recibidos) !== JSON.stringify(argumentos)) {
      throw new Error('Los argumentos de ' + nombre + ' no coinciden con el programa de la biblioteca.');
    }
    if (JSON.stringify(instruccion.args.map((item) => tipo(item.type))) !== JSON.stringify(tiposArgumentos[nombre])) {
      throw new Error('Los tipos de los argumentos de ' + nombre + ' no coinciden con el programa de la biblioteca.');
    }
  }
  for (const cuenta of Object.keys(camposEsperados)) {
    if (!idl.accounts?.some((item) => normalizar(item.name) === cuenta)) {
      throw new Error('Falta el tipo de cuenta ' + cuenta);
    }
    const definicion = idl.accounts.find((item) => normalizar(item.name) === cuenta).type
      ?? idl.types?.find((item) => normalizar(item.name) === cuenta)?.type;
    const campos = definicion?.fields?.map((item) => [normalizar(item.name), tipo(item.type)]);
    if (definicion?.kind !== 'struct' || JSON.stringify(campos) !== JSON.stringify(camposEsperados[cuenta])) {
      throw new Error('Los campos de la cuenta ' + cuenta + ' no coinciden con el programa de la biblioteca.');
    }
  }
  const direccion = programIdOpcional ?? idl.address ?? idl.metadata?.address;
  if (!direccion) throw new Error('El IDL no incluye direccion. Agrega --program-id TU_PROGRAM_ID.');
  let programId;
  try { programId = new PublicKey(direccion).toBase58(); }
  catch { throw new Error('El Program ID no es una direccion valida de Solana.'); }
  if (programId === '11111111111111111111111111111111') {
    throw new Error('El System Program no es el programa de la biblioteca. Usa el ID de tu despliegue.');
  }
  if (programIdOpcional && (idl.address ?? idl.metadata?.address) && programId !== (idl.address ?? idl.metadata?.address)) {
    throw new Error('El --program-id y la direccion del IDL no coinciden. Exporta el IDL correcto.');
  }
  return { programId, esReferencia: programId === REFERENCIA_ID };
}

export function prepararIdl(idl, programId) {
  const copia = structuredClone(idl);
  if (copia.address) copia.address = programId;
  else copia.metadata = { ...copia.metadata, address: programId };
  // El guion bajo de un argumento Rust no cambia sus bytes ni su posicion.
  // Normalizamos solo esos nombres para mantener idCliente en el cliente TS.
  for (const instruccion of copia.instructions) {
    for (const argumento of instruccion.args ?? []) argumento.name = argumento.name.replace(/^_+/, '');
  }
  return copia;
}

export function huellaIdl(idl) {
  return createHash('sha256').update(JSON.stringify(idl)).digest('hex');
}