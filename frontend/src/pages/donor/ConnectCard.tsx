import { FREIGHTER_URL } from '../../wallet/freighter';
import type { WalletState } from '../../wallet/walletContext';

interface Props {
  wallet: WalletState;
  onDemo: () => void;
}

export default function ConnectCard({ wallet, onDemo }: Props) {
  const connecting = wallet.status === 'connecting';

  return (
    <section className="ar-donor-connect">
      <h1>Panel del donante</h1>
      <p className="ar-donor-muted">
        Conecta tu billetera Freighter para crear y gestionar becas. Todo ocurre en la red de pruebas
        (testnet): no se usa dinero real.
      </p>

      <div className="ar-donor-actions">
        <button type="button" className="ar-donor-btn" disabled={connecting} onClick={wallet.connect}>
          {connecting ? 'Esperando a Freighter…' : 'Conectar Freighter'}
        </button>
        <button type="button" className="ar-donor-btn ar-donor-btn-ghost" onClick={onDemo}>
          Ver con cuenta de demostración
        </button>
      </div>

      {wallet.error && (
        <p className="ar-donor-notice ar-donor-notice-error" role="alert">
          {wallet.error}
          {wallet.notInstalled && (
            <>
              {' '}
              <a href={FREIGHTER_URL} target="_blank" rel="noreferrer">
                Instalar Freighter
              </a>
              .
            </>
          )}
        </p>
      )}

      <p className="ar-donor-hint">
        Freighter guarda tu clave y firma por ti. Esta web nunca ve tu clave secreta ni tu frase de
        recuperación. Usa una cuenta creada solo para pruebas.
      </p>
    </section>
  );
}
