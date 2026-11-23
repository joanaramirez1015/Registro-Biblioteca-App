import { address, type Address } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";

import { BIBLIOTECA_PROGRAM_ADDRESS } from "../../clients/js/src/generated";
import { s } from "./seeds";

/*
DERIVACION DE PDAs

El Program ID sale del cliente generado, que a su vez lo saco de TU idl.json.
No hay ninguna direccion escrita a mano en el proyecto.

findProgramAddressSync devuelve un PublicKey (web3.js) y el cliente de Codama
espera un Address (@solana/kit). derivar() hace esa conversion en un solo lugar,
para que el resto del codigo trabaje con un solo tipo.
*/
const PROGRAM_ID = new PublicKey(BIBLIOTECA_PROGRAM_ADDRESS);

function derivar(semillas: Buffer[]): Address {
  const [pda] = PublicKey.findProgramAddressSync(semillas, PROGRAM_ID);
  return address(pda.toBase58());
}

// Rust: seeds = [b"biblioteca", nombre_biblioteca.as_bytes(), owner.key().as_ref()]
export function pdaBiblioteca(nombreBiblioteca: string, owner: Address) {
  return derivar([s.texto("biblioteca"), s.texto(nombreBiblioteca), s.cuenta(owner)]);
}

// Rust: seeds = [b"libro", biblioteca.key().as_ref(), id_libro.to_le_bytes().as_ref()]
export function pdaLibro(biblioteca: Address, idLibro: number) {
  return derivar([s.texto("libro"), s.cuenta(biblioteca), s.u16(idLibro)]);
}

// Rust: seeds = [b"prestamo", libro.key().as_ref(), socio.as_bytes()]
export function pdaPrestamo(libro: Address, socio: string) {
  return derivar([s.texto("prestamo"), s.cuenta(libro), s.texto(socio)]);
}

/*
Tres instrucciones (registrar_prestamo, cambiar_dias, registrar_devolucion)
necesitan la cadena completa biblioteca -> libro -> prestamo, porque el programa
valida las tres en el contexto. Derivarlas de una vez evita repetir el bloque.
*/
export function cadena(
  nombreBiblioteca: string,
  owner: Address,
  idLibro: number,
  socio: string
) {
  const biblioteca = pdaBiblioteca(nombreBiblioteca, owner);
  const libro = pdaLibro(biblioteca, idLibro);
  const prestamo = pdaPrestamo(libro, socio);
  return { biblioteca, libro, prestamo };
}

// eliminar_libro solo necesita biblioteca -> libro (no hay prestamo).
export function cadenaLibro(
  nombreBiblioteca: string,
  owner: Address,
  idLibro: number
) {
  const biblioteca = pdaBiblioteca(nombreBiblioteca, owner);
  const libro = pdaLibro(biblioteca, idLibro);
  return { biblioteca, libro };
}