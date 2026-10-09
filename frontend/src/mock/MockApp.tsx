import { MedplumProvider } from '@medplum/react';
import { useEffect, useRef, useState } from 'react';
import { accounts, accountNames, createMockSession, roles } from './session';
import type { Account, MockSession, Role } from './session';
import './mock.css';
import { Logo } from '../components/Logo';

export function MockApp() {
  const [letterSize, setLetterSize] = useState(1);
  const [entered, setEntered] = useState(true);
  const accountControl = useRef<HTMLSelectElement>(null);
  const reenterControl = useRef<HTMLButtonElement>(null);
  const changedEntry = useRef(false);
  useEffect(() => {
    if (changedEntry.current) (entered ? accountControl.current : reenterControl.current)?.focus();
  }, [entered]);
  const [context, setContext] = useState<{ account: Account; role: Role; revision: number }>({
    account: 'carmen', role: 'self', revision: 0,
  });
  return (
    <main className="mock-start" lang="es" style={{ fontSize: `${letterSize}rem` }}>
      <p className="mock-notice"><strong>Modo provisional · datos sintéticos</strong><br />
        Sin conexión a Medplum real. Contrato y seed pendientes de aprobación.</p>
      <h1><Logo width={280} /></h1>
      <div className="mock-tools" role="group" aria-label="Tamaño de letra">
        <button type="button" disabled={letterSize <= 1} onClick={() => setLetterSize(size => Math.max(1, size - 0.25))}>Reducir letra</button>
        <button type="button" disabled={letterSize >= 1.5} onClick={() => setLetterSize(size => Math.min(1.5, size + 0.25))}>Aumentar letra</button>
      </div>
      {entered ? <>
      <button type="button" onClick={() => { changedEntry.current = true; setEntered(false); }}>Salir del ejemplo</button>
      <div className="mock-selectors">
        <label>Cuenta de
          <select ref={accountControl} value={context.account} onChange={(event) => {
            const account = event.target.value as Account;
            setContext({ account, role: roles[account][0], revision: context.revision + 1 });
          }}>
            {accounts.map(account => <option key={account} value={account}>{accountNames[account]}</option>)}
          </select>
        </label>
        <label>Rol
          <select value={context.role} onChange={(event) => setContext({
            ...context, role: event.target.value as Role, revision: context.revision + 1,
          })}>
            {roles[context.account].map(role => <option key={role} value={role}>
              {role === 'self' ? 'Mi salud' : 'Acceso delegado a Carmen'}
            </option>)}
          </select>
        </label>
      </div>
      <section aria-label="Contexto activo" aria-live="polite" aria-atomic="true">
        <MockContext key={context.revision} account={context.account} role={context.role} />
      </section>
      </> : <section aria-label="Salida simulada">
        <h2>Ha salido del ejemplo</h2>
        <p>Se retiró el contexto de esta pantalla. No había una sesión real iniciada. Recargar abre un ejemplo nuevo.</p>
        <button ref={reenterControl} type="button" onClick={() => {
          setContext({ account: 'carmen', role: 'self', revision: context.revision + 1 });
          setEntered(true);
        }}>Volver a entrar al ejemplo</button>
      </section>}
      <footer>PRPP · Prototipo local. Sin información clínica en este bloque.</footer>
    </main>
  );
}

function MockContext({ account, role }: { account: Account; role: Role }) {
  const [section, setSection] = useState('Mi visita');
  const [session, setSession] = useState<MockSession>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let client: MockSession['client'] | undefined;
    void createMockSession(account, role).then(next => {
      client = next.client;
      if (active) setSession(next);
      else client.clear();
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; client?.clear(); };
  }, [account, role]);
  if (failed) return <p role="alert">No pudimos cargar el ejemplo. Recargue la página.</p>;
  if (!session) return <p>Cargando contexto sintético…</p>;
  return (
    <MedplumProvider medplum={session.client}>
      <p>Información de</p>
      <h2>{session.patient.name?.[0].text}</h2>
      <p>Rol activo: <strong>{role === 'self' ? 'Paciente · Mi salud' : 'Cuidador · Acceso delegado'}</strong></p>
      <nav aria-label="Secciones del portal" className="mock-navigation">
        {['Mi visita', 'Resultados', 'Mi cuidado', 'Familia', 'Más'].map(name =>
          <button key={name} type="button" aria-current={section === name ? 'page' : undefined}
            disabled={name === 'Resultados' && session.permissions.estudios !== true}
            aria-describedby={name === 'Resultados' && session.permissions.estudios !== true ? 'results-access' : undefined}
            onClick={() => setSection(name)}>{name}</button>)}
      </nav>
      {session.permissions.estudios !== true && <p id="results-access">Resultados: acceso no habilitado para este rol en el ejemplo. No indica si existe información.</p>}
      <section className="mock-panel" aria-labelledby="section-heading">
        <h3 id="section-heading">{section}</h3>
        <p>Esta sección todavía no está implementada en este prototipo</p>
      </section>
    </MedplumProvider>
  );
}
