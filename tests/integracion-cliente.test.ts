import '../src/polyfills';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { address, createNoopSigner } from '@solana/kit';
import {
  getCrearBibliotecaInstruction, getCrearLibroInstruction,
  getRegistrarPrestamoInstruction, getRegistrarPrestamoInstructionDataDecoder,
  getCambiarDiasInstruction, getRegistrarDevolucionInstruction, getEliminarLibroInstruction,
  BIBLIOTECA_PROGRAM_ADDRESS,
} from '../clients/js/src/generated';
import { pdaBiblioteca, pdaLibro, pdaPrestamo, cadena, cadenaLibro } from '../src/solana/pdas';
import { s } from '../src/solana/seeds';
import { aWeb3, confirmarEnvio, ErrorTransaccion, ErrorConfirmacionPendiente, traducir } from '../src/solana/tx';
import { comprobarDevnet, DEVNET_GENESIS } from '../src/solana/seguridad';
import {
  bibliotecaValida, tituloValido, autorValido, socioValido, notaValida, idValido, diasValidos,
} from '../src/solana/validaciones';
import idl from '../idl.json';
import { validarIdl, prepararIdl, REFERENCIA_ID } from '../scripts/contrato-idl.mjs';

// Direccion publica de fixture. No se crean wallets ni se envian transacciones.
const owner = address(new PublicKey(new Uint8Array(32).fill(7)).toBase58());

// Vista del IDL con solo los campos que usan las pruebas.
type IdlPrueba = {
  address?: string;
  metadata: Record<string, unknown>;
  instructions: {
    name: string;
    discriminator: number[];
    accounts: { name: string; signer?: boolean; writable?: boolean }[];
    args: { name: string; type: unknown }[];
  }[];
  accounts: { name: string; type?: { fields: unknown[] } }[];
  types?: { name: string; type: { fields: unknown[] } }[];
  errors: { code: number; name: string; msg: string }[];
};
const clonarIdl = () => structuredClone(idl) as unknown as IdlPrueba;
const idlPrueba = idl as unknown as IdlPrueba;

test('las semillas u16 conservan dos bytes little-endian y sus limites', () => {
  assert.deepEqual([...s.u16(256)], [0, 1]);
  assert.deepEqual([...s.u16(65_535)], [255, 255]);
  assert.throws(() => s.u16(65_536));
  assert.throws(() => s.u16(1.5));
});

test('Biblioteca, Libro y Prestamo coinciden con las semillas del programa Rust', () => {
  const programa = new PublicKey(BIBLIOTECA_PROGRAM_ADDRESS);
  const nombre = 'Biblioteca WayLearn';
  // seeds = [b"biblioteca", nombre_biblioteca.as_bytes(), owner.key().as_ref()]
  const [biblioteca] = PublicKey.findProgramAddressSync([Buffer.from('biblioteca'), Buffer.from(nombre), new PublicKey(owner).toBuffer()], programa);
  // seeds = [b"libro", biblioteca.key().as_ref(), id_libro.to_le_bytes()]
  const id = Buffer.alloc(2); id.writeUInt16LE(256);
  const [libro] = PublicKey.findProgramAddressSync([Buffer.from('libro'), biblioteca.toBuffer(), id], programa);
  // seeds = [b"prestamo", libro.key().as_ref(), socio.as_bytes()]
  const [prestamo] = PublicKey.findProgramAddressSync([Buffer.from('prestamo'), libro.toBuffer(), Buffer.from('Ana')], programa);
  assert.equal(pdaBiblioteca(nombre, owner), biblioteca.toBase58());
  assert.equal(pdaLibro(address(biblioteca.toBase58()), 256), libro.toBase58());
  assert.equal(pdaPrestamo(address(libro.toBase58()), 'Ana'), prestamo.toBase58());

  const completa = cadena(nombre, owner, 256, 'Ana');
  assert.equal(completa.biblioteca, biblioteca.toBase58());
  assert.equal(completa.libro, libro.toBase58());
  assert.equal(completa.prestamo, prestamo.toBase58());
  const hasta = cadenaLibro(nombre, owner, 256);
  assert.equal(hasta.biblioteca, biblioteca.toBase58());
  assert.equal(hasta.libro, libro.toBase58());
});

test('los textos que son semilla caben en 32 bytes', () => {
  const biblioteca = pdaBiblioteca(bibliotecaValida('a'.repeat(30)), owner);
  const libro = pdaLibro(biblioteca, 1);
  assert.doesNotThrow(() => pdaPrestamo(libro, socioValido('b'.repeat(20))));
});

// Un constructor por instruccion del IDL, con argumentos de ejemplo.
const nombreBiblioteca = 'Biblioteca WayLearn';
const firmante = createNoopSigner(owner);
const bibliotecaPda = pdaBiblioteca(nombreBiblioteca, owner);
const libroPda = pdaLibro(bibliotecaPda, 1);
const prestamoPda = pdaPrestamo(libroPda, 'Ana');
const constructores: Record<string, () => Parameters<typeof aWeb3>[0]> = {
  crear_biblioteca: () => getCrearBibliotecaInstruction({ owner: firmante, biblioteca: bibliotecaPda, nombreBiblioteca }),
  crear_libro: () => getCrearLibroInstruction({ owner: firmante, biblioteca: bibliotecaPda, libro: libroPda, titulo: 'Cien años de soledad', autor: 'Gabo' }),
  registrar_prestamo: () => getRegistrarPrestamoInstruction({ owner: firmante, biblioteca: bibliotecaPda, libro: libroPda, prestamo: prestamoPda, idLibro: 1, socio: 'Ana', nota: 'Buen estado', dias: 7 }),
  cambiar_dias: () => getCambiarDiasInstruction({ owner: firmante, biblioteca: bibliotecaPda, libro: libroPda, prestamo: prestamoPda, idLibro: 1, socio: 'Ana', nuevosDias: 14 }),
  registrar_devolucion: () => getRegistrarDevolucionInstruction({ owner: firmante, biblioteca: bibliotecaPda, libro: libroPda, prestamo: prestamoPda, idLibro: 1, socio: 'Ana' }),
  eliminar_libro: () => getEliminarLibroInstruction({ owner: firmante, biblioteca: bibliotecaPda, libro: libroPda, idLibro: 1 }),
};

test('cada instruccion del IDL tiene discriminador, cuentas y permisos correctos', () => {
  assert.equal(idlPrueba.instructions.length, Object.keys(constructores).length);
  for (const definicion of idlPrueba.instructions) {
    const construir = constructores[definicion.name];
    assert.ok(construir, 'Falta un constructor de prueba para ' + definicion.name);
    const ix = construir();
    // Discriminador = sha256("global:<nombre_snake_case>")[0..8], y es el mismo que trae el IDL.
    const esperado = createHash('sha256').update('global:' + definicion.name).digest().subarray(0, 8);
    assert.deepEqual(Buffer.from(ix.data!.subarray(0, 8)), esperado, 'discriminador de ' + definicion.name);
    assert.deepEqual([...esperado], definicion.discriminator, 'discriminador del IDL de ' + definicion.name);
    // Permisos de firma y escritura tal como los declara el IDL, en el mismo orden.
    const convertida = aWeb3(ix);
    assert.equal(convertida.programId.toBase58(), BIBLIOTECA_PROGRAM_ADDRESS);
    assert.deepEqual(
      convertida.keys.map((cuenta) => [cuenta.isSigner, cuenta.isWritable]),
      definicion.accounts.map((cuenta) => [!!cuenta.signer, !!cuenta.writable]),
      'permisos de ' + definicion.name,
    );
  }
});

test('Codama serializa registrar_prestamo y el puente conserva los datos', () => {
  const ix = constructores.registrar_prestamo();
  const datos = getRegistrarPrestamoInstructionDataDecoder().decode(ix.data!);
  assert.equal(datos.idLibro, 1);
  assert.equal(datos.socio, 'Ana');
  assert.equal(datos.nota, 'Buen estado');
  assert.equal(datos.dias, 7);
  assert.deepEqual(aWeb3(ix).data, Buffer.from(ix.data!));
});

test('una confirmacion con error nunca produce un resultado de exito', async () => {
  const estrategia = { signature: 'firma-de-prueba', blockhash: 'blockhash-de-prueba', lastValidBlockHeight: 123 };
  const connection = { confirmTransaction: async () => ({ context: { slot: 1 }, value: { err: { InstructionError: [0, { Custom: 6000 }] } } }) } as unknown as Pick<Connection, 'confirmTransaction'>;
  await assert.rejects(confirmarEnvio(connection, estrategia), (error: unknown) => error instanceof ErrorTransaccion && error.firma === estrategia.signature);
  const correcta = { confirmTransaction: async (_datos: unknown, commitment: string) => { assert.equal(commitment, 'confirmed'); return { context: { slot: 1 }, value: { err: null } }; } } as unknown as Pick<Connection, 'confirmTransaction'>;
  assert.equal(await confirmarEnvio(correcta, estrategia), estrategia.signature);
});

test('se exige el genesis completo de Devnet para escribir', async () => {
  await comprobarDevnet({ getGenesisHash: async () => DEVNET_GENESIS });
  await assert.rejects(comprobarDevnet({ getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' }), /solo permite escribir en Devnet/);
  await assert.rejects(comprobarDevnet({ getGenesisHash: async () => DEVNET_GENESIS.slice(0, 32) }));
});

test('una interrupcion del RPC conserva la firma y no afirma que la transaccion fallo', async () => {
  const estrategia = { signature: 'firma-ya-enviada', blockhash: 'blockhash', lastValidBlockHeight: 123 };
  const connection = { confirmTransaction: async () => { throw new Error('RPC timeout'); } } as unknown as Pick<Connection, 'confirmTransaction'>;
  await assert.rejects(confirmarEnvio(connection, estrategia), (error: unknown) => error instanceof ErrorConfirmacionPendiente && error.firma === estrategia.signature && /antes de repetirla/.test(error.message));
});

test('validaciones de UI respetan los max_len del programa y los rangos numericos', () => {
  // Textos: limite en bytes UTF-8 (30, 40, 30, 20, 50).
  assert.equal(bibliotecaValida(' Mi biblioteca '), 'Mi biblioteca');
  assert.equal(bibliotecaValida('a'.repeat(30)), 'a'.repeat(30));
  assert.throws(() => bibliotecaValida('a'.repeat(31)));
  assert.throws(() => bibliotecaValida('   '));
  assert.equal(tituloValido('t'.repeat(40)), 't'.repeat(40));
  assert.throws(() => tituloValido('t'.repeat(41)));
  assert.equal(autorValido('a'.repeat(30)), 'a'.repeat(30));
  assert.throws(() => autorValido('a'.repeat(31)));
  assert.equal(socioValido('ñ'.repeat(10)), 'ñ'.repeat(10)); // 20 bytes
  assert.throws(() => socioValido('ñ'.repeat(11)));          // 22 bytes
  assert.throws(() => socioValido('Ana☕'.repeat(6)));
  // La nota es opcional (SUPUESTO), con tope de 50 bytes.
  assert.equal(notaValida('   '), '');
  assert.equal(notaValida('n'.repeat(50)), 'n'.repeat(50));
  assert.throws(() => notaValida('n'.repeat(51)));
  // Numeros: id u16 y dias u8, ambos enteros positivos.
  assert.equal(idValido(65_535), 65_535);
  for (const invalido of [0, -1, 1.5, NaN, 65_536]) assert.throws(() => idValido(invalido));
  assert.equal(diasValidos(255), 255);
  for (const invalido of [0, -1, 1.5, NaN, 256]) assert.throws(() => diasValidos(invalido));
});

test('los errores distinguen cancelacion, propietario, semillas, cupo y RPC', () => {
  assert.match(traducir(new Error('User rejected the request')), /cancelada/);
  assert.match(traducir(new Error('custom program error: 0x1770')), /NoOwner/);              // 6000
  assert.match(traducir(new Error('custom program error: 0x1774')), /LibroConPrestamos/);    // 6004
  assert.match(traducir(new Error('custom program error: 0x7d6')), /ConstraintSeeds/);      // 2006
  assert.match(traducir(new Error('custom program error: 0x7d1')), /propietaria/);          // 2001
  assert.match(traducir(new Error('custom program error: 0xbbc')), /límite/);               // 3004
  assert.match(traducir(new Error('already in use')), /ya existe/);
  assert.match(traducir(new Error('429 Too Many Requests')), /RPC/);
});

test('el IDL real pasa el contrato y uno de otro programa se rechaza', () => {
  const datos = validarIdl(idl);
  assert.equal(datos.programId, BIBLIOTECA_PROGRAM_ADDRESS);
  assert.equal(datos.esReferencia, false);
  const otro = clonarIdl();
  otro.metadata = { ...otro.metadata, name: 'registro' };
  assert.throws(() => validarIdl(otro), /espera el programa/);
});

test('se valida el contrato IDL y la normalizacion no cambia el orden ni tipos', () => {
  const copia = clonarIdl();
  delete copia.address;
  copia.metadata = { ...copia.metadata, address: REFERENCIA_ID };
  assert.equal(validarIdl(copia).esReferencia, true);
  const ix = copia.instructions.find((item) => item.name.toLowerCase().replace(/_/g, '') === 'registrarprestamo')!;
  ix.args[0].name = '_id_libro';
  assert.equal(validarIdl(copia).programId, REFERENCIA_ID);
  const normalizada = prepararIdl(copia, REFERENCIA_ID);
  assert.equal(normalizada.instructions.find((item: { name: string }) => item.name === ix.name).args[0].name, 'id_libro');
  assert.equal(ix.args[0].name, '_id_libro');
  const invalida = structuredClone(copia); invalida.instructions = [];
  assert.throws(() => validarIdl(invalida), /Falta la instruccion/);
  const otroTipo = structuredClone(copia);
  otroTipo.instructions[0].args[0].type = 'u64';
  assert.throws(() => validarIdl(otroTipo), /tipos de los argumentos/);
  const otraCuenta = structuredClone(copia);
  const cuenta = otraCuenta.accounts[0];
  const esquema = cuenta.type ?? otraCuenta.types?.find((item) => item.name === cuenta.name)?.type;
  esquema!.fields.reverse();
  assert.throws(() => validarIdl(otraCuenta), /campos de la cuenta/);
  assert.throws(() => validarIdl(copia, new PublicKey(new Uint8Array(32).fill(9)).toBase58()), /no coinciden/);
});