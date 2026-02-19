import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout } from './layout/AdminLayout';
import { CustomerListPage } from './pages/CustomerListPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { CustomerConversationPage } from './pages/CustomerConversationPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { useAdminAuth } from './state/useAdminAuth';

export const AdminApp: React.FC = () => {
  const { isAuthenticated } = useAdminAuth();

  return (
    <Routes>
      <Route path="/login" element={<AdminLoginPage />} />
      <Route
        path="/*"
        element={
          isAuthenticated ? (
            <AdminLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/customers" replace />} />
                <Route path="/customers" element={<CustomerListPage />} />
                <Route path="/customers/:id" element={<CustomerDetailPage />} />
                <Route path="/customers/:id/conversations/:conversationId" element={<CustomerConversationPage />} />
                <Route path="/status" element={<SystemStatusPage />} />
              </Routes>
            </AdminLayout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
};

