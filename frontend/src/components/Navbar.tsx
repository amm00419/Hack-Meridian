
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const user = {
    name: 'Adrián',
    initials: 'AM',
    role: 'Estudiante',
    wallet: 'GA46...K3XP',
  };

  return (
    <header className="ar-navbar">
      <div className="ar-navbar-inner">
        <NavLink to="/beneficiary" className="ar-brand">
          <span className="ar-brand-icon">✦</span>
          <span className="ar-brand-text">
            <strong>AidRelease</strong>
            <small>Powered by Stellar</small>
          </span>
        </NavLink>

        <nav className="ar-nav-links" aria-label="Navegación principal">
          <NavLink
            to="/beneficiary"
            className={({ isActive }) =>
              `ar-nav-link ${isActive ? 'ar-nav-link-active' : ''}`
            }
          >
            Estudiante
          </NavLink>

          <NavLink
            to="/donor"
            className={({ isActive }) =>
              `ar-nav-link ${isActive ? 'ar-nav-link-active' : ''}`
            }
          >
            Donante
          </NavLink>

          <NavLink
            to="/verifier"
            className={({ isActive }) =>
              `ar-nav-link ${isActive ? 'ar-nav-link-active' : ''}`
            }
          >
            Verificador
          </NavLink>
        </nav>

        <div className="ar-navbar-right">
          <span className="ar-testnet-badge">
            <span className="ar-online-dot" />
            Testnet
          </span>

          <div className="ar-user-container">
            <button
              type="button"
              className="ar-user-button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span className="ar-avatar">{user.initials}</span>

              <span className="ar-user-details">
                <strong>Bienvenido, {user.name}</strong>
                <small>{user.role}</small>
              </span>

              <span className="ar-chevron">{menuOpen ? '⌃' : '⌄'}</span>
            </button>

            {menuOpen && (
              <div className="ar-user-dropdown" role="menu">
                <div className="ar-dropdown-heading">
                  <strong>{user.name}</strong>
                  <small>Cuenta de demostración</small>
                </div>

                <div className="ar-dropdown-wallet">
                  <span>Wallet Stellar</span>
                  <code>{user.wallet}</code>
                </div>

                <div className="ar-dropdown-note">
                  Perfil de prueba. La conexión con Freighter estará
                  disponible cuando se integre la autenticación.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
