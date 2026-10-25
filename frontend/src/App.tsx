import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import BeneficiaryPage from './pages/beneficiary/BeneficiaryPage';
import ScholarshipDetailPage from './pages/beneficiary/ScholarshipDetailPage';
import VerifierPage from './pages/verifier/VerifierPage';
import DonorPage from './pages/donor/DonorPage';

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Navigate to="/beneficiary" replace />} />
        <Route path="/donor" element={<DonorPage />} />
        <Route path="/beneficiary" element={<BeneficiaryPage />} />
        <Route path="/verifier" element={<VerifierPage />} />
        <Route path="/beneficiary/scholarship/:id" element={<ScholarshipDetailPage />}/>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
