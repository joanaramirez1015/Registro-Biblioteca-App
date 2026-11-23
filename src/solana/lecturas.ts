import type { Address } from "@solana/kit";

import {
  fetchAllLibro,
  fetchAllPrestamo,
  fetchMaybeBiblioteca,
  fetchMaybeLibro,
} from "../../clients/js/src/generated";
import { rpc } from "./conexion";
import { pdaBiblioteca } from "./pdas";

/*
LECTURAS

Leer no necesita wallet ni firma: solo el rpc.

fetchX devuelve { address, data, lamports... }: los campos de la cuenta estan
dentro de .data, nunca sueltos en la raiz.
*/

// #[max_len(10)] en Biblioteca.libros y en Libro.prestamos.
export const CUPO_LIBROS = 10;
export const CUPO_PRESTAMOS = 10;

export type PrestamoUI = {
  direccion: Address;
  socio: string;
  nota: string;
  dias: number;
};

export type LibroUI = {
  direccion: Address;
  idLibro: number;
  titulo: string;
  autor: string;
  totalPrestamos: number;
  prestamos: PrestamoUI[];
};

export type BibliotecaUI = {
  direccion: Address;
  nombreBiblioteca: string;
  idCounter: number;
  libros: LibroUI[];
};

/*
Tres niveles de cuentas, tres niveles de lectura: la biblioteca guarda las
direcciones de sus libros, y cada libro las de sus prestamos.

fetchMaybe... no lanza si la cuenta no existe: devuelve exists: false. Es lo
que quieres cuando el usuario todavia no ha creado su biblioteca.
*/
export async function leerBiblioteca(
  nombreBiblioteca: string,
  owner: Address
): Promise<BibliotecaUI | null> {
  const direccion = pdaBiblioteca(nombreBiblioteca, owner);
  const cuenta = await fetchMaybeBiblioteca(rpc, direccion);

  if (!cuenta.exists) return null;

  const libros = await fetchAllLibro(rpc, cuenta.data.libros);

  const conPrestamos = await Promise.all(
    libros.map(async (l) => {
      const prestamos = await fetchAllPrestamo(rpc, l.data.prestamos);
      return {
        direccion: l.address,
        idLibro: l.data.idLibro,
        titulo: l.data.titulo,
        autor: l.data.autor,
        totalPrestamos: l.data.totalPrestamos,
        prestamos: prestamos.map((p) => ({
          direccion: p.address,
          socio: p.data.socio,
          nota: p.data.nota,
          dias: p.data.dias,
        })),
      };
    })
  );

  return {
    direccion,
    nombreBiblioteca: cuenta.data.nombreBiblioteca,
    idCounter: cuenta.data.idCounter,
    libros: conPrestamos,
  };
}

/*
El id del libro nuevo sale del contador de la biblioteca.

El programa es quien lo asigna (id_counter + 1); esta lectura no se lo manda.
Hace falta porque el id entra en las semillas, y una transaccion de Solana
declara por adelantado todas las cuentas que va a tocar: hay que saber la
direccion ANTES de firmar.

Tambien comprueba el cupo de libros antes de firmar.
*/
export async function siguienteId(
  nombreBiblioteca: string,
  owner: Address
): Promise<number> {
  const cuenta = await fetchMaybeBiblioteca(rpc, pdaBiblioteca(nombreBiblioteca, owner));
  if (!cuenta.exists) throw new Error("Esa biblioteca no existe todavía.");
  if (cuenta.data.libros.length >= CUPO_LIBROS) {
    throw new Error("La biblioteca alcanzó el límite de " + CUPO_LIBROS + " libros.");
  }
  if (cuenta.data.idCounter >= 65_535) {
    throw new Error("Se agotaron los identificadores u16 de la biblioteca.");
  }
  return cuenta.data.idCounter + 1;
}

// Comprueba, antes de firmar, que el libro existe y que aun cabe un prestamo.
export async function comprobarCupoPrestamos(libro: Address): Promise<void> {
  const cuenta = await fetchMaybeLibro(rpc, libro);
  if (!cuenta.exists) throw new Error("Ese libro no existe. Revisa el ID del libro.");
  if (cuenta.data.prestamos.length >= CUPO_PRESTAMOS) {
    throw new Error("El libro alcanzó el límite de " + CUPO_PRESTAMOS + " préstamos activos.");
  }
}