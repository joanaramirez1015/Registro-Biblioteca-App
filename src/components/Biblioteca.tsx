import { useEffect, useRef, useState } from 'react';
import { address } from '@solana/kit';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import programa from '../config/programa.json';
import { leerBiblioteca, type BibliotecaUI } from '../solana/lecturas';
import { bibliotecaValida } from '../solana/validaciones';
import { ErrorTransaccion, ErrorConfirmacionPendiente, enlaceTransaccion, traducir, type OpcionesEnvio } from '../solana/tx';
import { crearBiblioteca, crearLibro, registrarPrestamo, cambiarDias, registrarDevolucion, eliminarLibro } from '../solana/acciones';

const BIBLIOTECA_INICIAL = 'Biblioteca WayLearn';

type Operacion = 'biblioteca' | 'libro' | 'prestamo' | 'dias' | 'devolucion' | 'eliminar';
const operaciones: { id: Operacion; texto: string }[] = [
  { id: 'biblioteca', texto: 'Crear biblioteca' }, { id: 'libro', texto: 'Crear libro' },
  { id: 'prestamo', texto: 'Registrar préstamo' }, { id: 'dias', texto: 'Cambiar días' },
  { id: 'devolucion', texto: 'Devolución' }, { id: 'eliminar', texto: 'Eliminar libro' },
];

export function Biblioteca({ onCambio, onOcupado }: { onCambio: () => void; onOcupado: (valor: boolean) => void }) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const walletDireccion = wallet.publicKey?.toBase58() ?? '';
  const [nombreBiblioteca, setNombreBiblioteca] = useState(BIBLIOTECA_INICIAL);
  const [autoridad, setAutoridad] = useState(walletDireccion);
  const [biblioteca, setBiblioteca] = useState<BibliotecaUI | null>(null);
  const [consultado, setConsultado] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState('');
  const [op, setOp] = useState<Operacion>('biblioteca');
  const [titulo, setTitulo] = useState('Cien años de soledad');
  const [autor, setAutor] = useState('Gabriel García Márquez');
  const [idLibro, setIdLibro] = useState('1');
  const [socio, setSocio] = useState('Ana');
  const [nota, setNota] = useState('Devolver en buen estado');
  const [dias, setDias] = useState('7');
  const [ocupado, setOcupado] = useState(false);
  const [fase, setFase] = useState('');
  const [firma, setFirma] = useState('');
  const [firmaFallida, setFirmaFallida] = useState('');
  const [errorOperacion, setErrorOperacion] = useState('');
  const [aviso, setAviso] = useState('');
  const contexto = useRef('');
  const secuencia = useRef(0);
  contexto.current = nombreBiblioteca + '|' + autoridad;

  useEffect(() => { setAutoridad(walletDireccion); }, [walletDireccion]);
  useEffect(() => {
    secuencia.current += 1; setBiblioteca(null); setConsultado(false); setErrorLectura('');
    setLeyendo(false); setFirma(''); setFirmaFallida(''); setErrorOperacion(''); setAviso('');
  }, [nombreBiblioteca, autoridad]);
  useEffect(() => { onOcupado(ocupado); return () => onOcupado(false); }, [ocupado, onOcupado]);

  async function cargar(nombre = nombreBiblioteca, owner = autoridad) {
    const clave = nombre + '|' + owner;
    const turno = ++secuencia.current;
    setLeyendo(true); setErrorLectura('');
    try {
      const datos = await leerBiblioteca(bibliotecaValida(nombre), address(owner.trim()));
      if (turno === secuencia.current && contexto.current === clave) { setBiblioteca(datos); setConsultado(true); }
    } catch (error) {
      if (turno === secuencia.current) setErrorLectura(traducir(error));
      throw error;
    } finally { if (turno === secuencia.current) setLeyendo(false); }
  }

  async function ejecutar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true); setFase('Preparando operación…'); setFirma(''); setFirmaFallida(''); setErrorOperacion(''); setAviso('');
    const nombre = nombreBiblioteca.trim();
    const direccionWallet = walletDireccion;
    const opciones: OpcionesEnvio = { onEstado: (estado) => setFase(estado === 'firma' ? 'Revisa la solicitud en tu wallet…' : 'Esperando confirmación de la red…') };
    try {
      const id = Number(idLibro), numeroDias = Number(dias);
      let resultado: string;
      switch (op) {
        case 'biblioteca': resultado = await crearBiblioteca(wallet, connection, nombre, opciones); break;
        case 'libro': resultado = await crearLibro(wallet, connection, nombre, titulo, autor, opciones); break;
        case 'prestamo': resultado = await registrarPrestamo(wallet, connection, nombre, id, socio, nota, numeroDias, opciones); break;
        case 'dias': resultado = await cambiarDias(wallet, connection, nombre, id, socio, numeroDias, opciones); break;
        case 'devolucion': resultado = await registrarDevolucion(wallet, connection, nombre, id, socio, opciones); break;
        case 'eliminar': resultado = await eliminarLibro(wallet, connection, nombre, id, opciones); break;
      }
      setFirma(resultado); setFase('Operación confirmada correctamente.'); onCambio();
      try { await cargar(nombre, direccionWallet); }
      catch { setAviso('La operación se confirmó, pero no pudimos actualizar los datos. Pulsa Consultar biblioteca para volver a leerlos.'); }
    } catch (error) {
      setFase(''); setErrorOperacion(traducir(error));
      if (error instanceof ErrorTransaccion || error instanceof ErrorConfirmacionPendiente) setFirmaFallida(error.firma);
    } finally { setOcupado(false); }
  }

  const esOtraAutoridad = !!autoridad.trim() && autoridad.trim() !== walletDireccion;
  const permiteEscribir = !programa.esReferencia && !!wallet.publicKey && !esOtraAutoridad;
  const necesitaId = op === 'prestamo' || op === 'dias' || op === 'devolucion' || op === 'eliminar';
  const necesitaSocio = op === 'prestamo' || op === 'dias' || op === 'devolucion';
  return <>
    <div className="section-heading"><div><p className="eyebrow">BIBLIOTECA · LIBROS · PRÉSTAMOS</p><h2>Tu biblioteca</h2></div><span className="tag">Cuentas independientes</span></div>
    {programa.esReferencia && <aside className="notice information"><strong>Configura tu programa para comenzar.</strong><p>La aplicación incluye un IDL de referencia. Importa el exportado de tu despliegue para consultar la biblioteca y realizar operaciones. Las lecturas de saldo ya están disponibles en Conexión.</p></aside>}
    <section className="panel lookup-panel">
      <div className="panel-heading"><h3>Localizar la biblioteca</h3><span className="small-note">Lectura sin firma</span></div>
      <div className="lookup-fields"><label>Nombre exacto de la biblioteca<input value={nombreBiblioteca} disabled={ocupado} onChange={(e) => setNombreBiblioteca(e.target.value)} placeholder="Biblioteca WayLearn" /></label>
      <label>Dirección del propietario<input value={autoridad} disabled={ocupado} onChange={(e) => setAutoridad(e.target.value)} placeholder="Conecta tu wallet o pega una dirección pública" spellCheck={false} autoComplete="off" /></label>
      <button className="button secondary" disabled={leyendo || ocupado || programa.esReferencia || !nombreBiblioteca.trim() || !autoridad.trim()} onClick={() => void cargar().catch(() => {})}>{leyendo ? 'Consultando…' : 'Consultar biblioteca'}</button></div>
      <p className="help">El nombre y el propietario determinan la dirección de la biblioteca. Puedes consultar otro propietario en modo lectura.</p>
      {errorLectura && <p className="notice error" role="alert">{errorLectura}</p>}
    </section>
    <div className="workspace-grid">
      <section className="panel customers-panel"><div className="panel-heading"><h3>Libros y préstamos</h3>{biblioteca && <span className="count">{biblioteca.libros.length} libros</span>}</div>
        {!biblioteca ? <div className="empty-state"><span className="empty-symbol">◎</span><h4>{consultado ? 'La biblioteca todavía no existe' : 'La biblioteca aparecerá aquí'}</h4><p>{consultado ? 'Comprueba el nombre y el propietario, o crea una biblioteca con tu wallet conectada.' : 'Consulta la biblioteca para ver sus libros y los préstamos activos de cada uno.'}</p></div> : <>
          <div className="registry-summary"><div><span className="label">Biblioteca</span><strong>{biblioteca.nombreBiblioteca}</strong></div><div><span className="label">Último ID asignado</span><strong>{biblioteca.idCounter}</strong></div></div>
          <details className="technical-details"><summary>Dirección de la biblioteca</summary><code className="address">{biblioteca.direccion}</code></details>
          {biblioteca.libros.length === 0 ? <p className="empty-line">Todavía no hay libros. Puedes crear el primero desde Operaciones.</p> : biblioteca.libros.map((libro) => <article className="customer" key={libro.direccion}>
            <header><div><strong>{libro.titulo}</strong><span className="small-note">Libro #{libro.idLibro} · {libro.autor} · {libro.prestamos.length} préstamos activos</span></div><button className="text-button" disabled={ocupado} onClick={() => { setIdLibro(String(libro.idLibro)); setOp('prestamo'); }}>Seleccionar</button></header>
            {libro.prestamos.length === 0 ? <p className="empty-line">Sin préstamos activos.</p> : <div className="table-wrap"><table><thead><tr><th>Socio</th><th>Nota</th><th className="numeric">Días</th></tr></thead><tbody>{libro.prestamos.map((prestamo) => <tr key={prestamo.direccion} onClick={() => { if (!ocupado) { setIdLibro(String(libro.idLibro)); setSocio(prestamo.socio); setDias(String(prestamo.dias)); setOp('dias'); } }}><td><code>{prestamo.socio}</code></td><td>{prestamo.nota || '—'}</td><td className="numeric">{prestamo.dias} <small>días</small></td></tr>)}</tbody></table></div>}
          </article>)}
        </>}
      </section>
      <section className="panel operations-panel"><div className="panel-heading"><h3>Operaciones</h3><span className="small-note">Con firma</span></div>
        <div className="operation-tabs">{operaciones.map((item) => <button key={item.id} className={op === item.id ? 'active' : ''} disabled={ocupado} onClick={() => { setOp(item.id); setFirma(''); setErrorOperacion(''); setFirmaFallida(''); setFase(''); }}>{item.texto}</button>)}</div>
        <form onSubmit={ejecutar}>
          <fieldset disabled={ocupado || !permiteEscribir}>
            {op === 'biblioteca' && <p className="help">Crearás una biblioteca llamada <strong>{nombreBiblioteca || 'tu biblioteca'}</strong> con la wallet conectada como propietaria.</p>}
            {op === 'libro' && <><label>Título<input value={titulo} onChange={(e) => setTitulo(e.target.value)} required /></label><label>Autor<input value={autor} onChange={(e) => setAutor(e.target.value)} required /></label><p className="help">El ID del libro lo asigna el programa a partir del contador de la biblioteca.</p></>}
            {necesitaId && <div className="two-fields"><label>ID del libro<input type="number" min="1" max="65535" step="1" value={idLibro} onChange={(e) => setIdLibro(e.target.value)} required /></label>{necesitaSocio && <label>Socio<input value={socio} onChange={(e) => setSocio(e.target.value)} required /></label>}</div>}
            {op === 'prestamo' && <label>Nota (opcional)<input value={nota} onChange={(e) => setNota(e.target.value)} /></label>}
            {(op === 'prestamo' || op === 'dias') && <label>{op === 'dias' ? 'Nuevos días' : 'Días de préstamo'}<input type="number" min="1" max="255" step="1" value={dias} onChange={(e) => setDias(e.target.value)} required /></label>}
            {op === 'devolucion' && <p className="notice subtle">Esta operación quita el préstamo de la lista del libro y cierra su cuenta; la renta vuelve a tu wallet.</p>}
            {op === 'eliminar' && <p className="notice subtle">Solo se puede eliminar un libro sin préstamos activos. Su cuenta se cierra y el ID no se reutiliza.</p>}
            <button className="button primary" type="submit" disabled={!nombreBiblioteca.trim()}>{ocupado ? 'Operación en curso…' : operaciones.find((item) => item.id === op)!.texto}</button>
          </fieldset>
        </form>
        {!wallet.publicKey && <p className="help">Conecta tu wallet de práctica para realizar operaciones.</p>}
        {esOtraAutoridad && wallet.publicKey && <p className="notice subtle">Estás consultando otro propietario. Para escribir, utiliza la biblioteca de la wallet conectada.</p>}
        {ocupado && <p className="notice information" role="status">{fase}</p>}
        {firma && <p className="notice success" role="status"><strong>Operación confirmada.</strong><br/><a href={enlaceTransaccion(firma)} target="_blank" rel="noreferrer">Ver transacción en Explorer</a></p>}
        {errorOperacion && <p className="notice error" role="alert">{errorOperacion}{firmaFallida && <><br/><a href={enlaceTransaccion(firmaFallida)} target="_blank" rel="noreferrer">Revisar transacción en Explorer</a></>}</p>}
        {aviso && <p className="notice subtle">{aviso}</p>}
      </section>
    </div>
  </>;
}