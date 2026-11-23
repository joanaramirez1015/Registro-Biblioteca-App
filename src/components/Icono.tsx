export function Icono({ tipo }: { tipo: 'conexion' | 'biblioteca' | 'vacio' }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {tipo === 'conexion' ? <><path d="M7 17 17 7M7 7h10v10" /><path d="M5 12v7h7" /></> : tipo === 'biblioteca' ? <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /><path d="M9 8h6" /></> : <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>}
  </svg>;
}