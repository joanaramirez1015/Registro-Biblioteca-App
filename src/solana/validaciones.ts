export function texto(valor: string, etiqueta: string, maxBytes: number): string {
  const limpio = valor.trim();
  if (!limpio) throw new Error(etiqueta + ' es obligatorio.');
  if (new TextEncoder().encode(limpio).length > maxBytes) {
    throw new Error(etiqueta + ' admite hasta ' + maxBytes + ' bytes UTF-8.');
  }
  return limpio;
}

export function entero(valor: number, etiqueta: string, maximo: number): number {
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > maximo) {
    throw new Error(etiqueta + ' debe ser un entero entre 1 y ' + maximo + '.');
  }
  return valor;
}

// Limites = #[max_len(...)] del lib.rs. Los textos que son semilla (biblioteca, socio) caben en 32 bytes.
export const bibliotecaValida = (valor: string) => texto(valor, 'El nombre de la biblioteca', 30);
export const tituloValido = (valor: string) => texto(valor, 'El título', 40);
export const autorValido = (valor: string) => texto(valor, 'El autor', 30);
export const socioValido = (valor: string) => texto(valor, 'El socio', 20);
// SUPUESTO: la nota es opcional (el programa acepta un texto vacio).
export const notaValida = (valor: string) => (valor.trim() ? texto(valor, 'La nota', 50) : '');
export const idValido = (valor: number) => entero(valor, 'El ID del libro', 65_535);
// SUPUESTO: el programa acepta 0 dias, pero la interfaz exige al menos 1.
export const diasValidos = (valor: number) => entero(valor, 'Los días', 255);