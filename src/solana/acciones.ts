import { address, createNoopSigner, type Address } from '@solana/kit';
import type { Connection } from '@solana/web3.js';
import {
  getCrearBibliotecaInstruction, getCrearLibroInstruction,
  getRegistrarPrestamoInstruction, getCambiarDiasInstruction,
  getRegistrarDevolucionInstruction, getEliminarLibroInstruction,
} from '../../clients/js/src/generated';
import { cadena, cadenaLibro, pdaBiblioteca, pdaLibro } from './pdas';
import { siguienteId, comprobarCupoPrestamos } from './lecturas';
import { enviar, type WalletFirma, type OpcionesEnvio } from './tx';
import { comprobarConfiguracion } from './seguridad';
import { bibliotecaValida, tituloValido, autorValido, socioValido, notaValida, idValido, diasValidos } from './validaciones';

export function direccionDe(wallet: Pick<WalletFirma, 'publicKey'>): Address {
  if (!wallet.publicKey) throw new Error('Conecta tu wallet primero.');
  return address(wallet.publicKey.toBase58());
}

function firmante(wallet: WalletFirma) {
  comprobarConfiguracion();
  // Representa la identidad que la wallet firmará después; no contiene claves.
  // Los roles finales los establece el builder generado del cliente actual.
  return createNoopSigner(direccionDe(wallet));
}

export async function crearBiblioteca(wallet: WalletFirma, connection: Connection, nombreBiblioteca: string, opciones?: OpcionesEnvio): Promise<string> {
  nombreBiblioteca = bibliotecaValida(nombreBiblioteca);
  const owner = firmante(wallet);
  const biblioteca = pdaBiblioteca(nombreBiblioteca, owner.address);
  const ix = getCrearBibliotecaInstruction({ owner, biblioteca, nombreBiblioteca });
  return enviar(ix, wallet, connection, opciones);
}

// El id del libro lo asigna el programa (id_counter + 1): hay que leerlo ANTES de derivar la PDA.
export async function crearLibro(wallet: WalletFirma, connection: Connection, nombreBiblioteca: string, titulo: string, autor: string, opciones?: OpcionesEnvio): Promise<string> {
  nombreBiblioteca = bibliotecaValida(nombreBiblioteca);
  titulo = tituloValido(titulo);
  autor = autorValido(autor);
  const owner = firmante(wallet);
  const biblioteca = pdaBiblioteca(nombreBiblioteca, owner.address);
  const id = await siguienteId(nombreBiblioteca, owner.address); // tambien comprueba el cupo de libros
  const libro = pdaLibro(biblioteca, id);
  const ix = getCrearLibroInstruction({ owner, biblioteca, libro, titulo, autor });
  return enviar(ix, wallet, connection, opciones);
}

export async function registrarPrestamo(wallet: WalletFirma, connection: Connection, nombreBiblioteca: string, idLibro: number, socio: string, nota: string, dias: number, opciones?: OpcionesEnvio): Promise<string> {
  nombreBiblioteca = bibliotecaValida(nombreBiblioteca);
  idLibro = idValido(idLibro);
  socio = socioValido(socio);
  nota = notaValida(nota);
  dias = diasValidos(dias);
  const owner = firmante(wallet);
  const { biblioteca, libro, prestamo } = cadena(nombreBiblioteca, owner.address, idLibro, socio);
  await comprobarCupoPrestamos(libro);
  const ix = getRegistrarPrestamoInstruction({ owner, biblioteca, libro, prestamo, idLibro, socio, nota, dias });
  return enviar(ix, wallet, connection, opciones);
}

export async function cambiarDias(wallet: WalletFirma, connection: Connection, nombreBiblioteca: string, idLibro: number, socio: string, nuevosDias: number, opciones?: OpcionesEnvio): Promise<string> {
  nombreBiblioteca = bibliotecaValida(nombreBiblioteca);
  idLibro = idValido(idLibro);
  socio = socioValido(socio);
  nuevosDias = diasValidos(nuevosDias);
  const owner = firmante(wallet);
  const { biblioteca, libro, prestamo } = cadena(nombreBiblioteca, owner.address, idLibro, socio);
  const ix = getCambiarDiasInstruction({ owner, biblioteca, libro, prestamo, idLibro, socio, nuevosDias });
  return enviar(ix, wallet, connection, opciones);
}

export async function registrarDevolucion(wallet: WalletFirma, connection: Connection, nombreBiblioteca: string, idLibro: number, socio: string, opciones?: OpcionesEnvio): Promise<string> {
  nombreBiblioteca = bibliotecaValida(nombreBiblioteca);
  idLibro = idValido(idLibro);
  socio = socioValido(socio);
  const owner = firmante(wallet);
  const { biblioteca, libro, prestamo } = cadena(nombreBiblioteca, owner.address, idLibro, socio);
  const ix = getRegistrarDevolucionInstruction({ owner, biblioteca, libro, prestamo, idLibro, socio });
  return enviar(ix, wallet, connection, opciones);
}

export async function eliminarLibro(wallet: WalletFirma, connection: Connection, nombreBiblioteca: string, idLibro: number, opciones?: OpcionesEnvio): Promise<string> {
  nombreBiblioteca = bibliotecaValida(nombreBiblioteca);
  idLibro = idValido(idLibro);
  const owner = firmante(wallet);
  const { biblioteca, libro } = cadenaLibro(nombreBiblioteca, owner.address, idLibro);
  const ix = getEliminarLibroInstruction({ owner, biblioteca, libro, idLibro });
  return enviar(ix, wallet, connection, opciones);
}