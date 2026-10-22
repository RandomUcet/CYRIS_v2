import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { EventProvider } from '@/contexts/EventContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';

export const metadata: Metadata = {
  title: 'CYRIS — Cybertron Registry & Intelligence System',
  description: 'Cybertron Registry & Intelligence System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <PreferencesProvider>
            <EventProvider>
              {children}
            </EventProvider>
          </PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
