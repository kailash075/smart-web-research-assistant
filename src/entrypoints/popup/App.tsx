import { browser } from 'wxt/browser';

export function App() {
  const { name, version } = browser.runtime.getManifest();

  return (
    <main className="popup">
      <h1 className="popup__title">{name}</h1>
      <p className="popup__text">Extension is running. Saving features arrive in later phases.</p>
      <dl className="popup__meta">
        <dt>Version</dt>
        <dd>{version}</dd>
        <dt>Build</dt>
        <dd>
          {import.meta.env.BROWSER} · MV{import.meta.env.MANIFEST_VERSION}
        </dd>
      </dl>
    </main>
  );
}
