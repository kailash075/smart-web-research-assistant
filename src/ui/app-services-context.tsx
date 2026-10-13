import { createContext, useContext, type ReactNode } from 'react';
import type { AppServices } from '@/composition/app-services';

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <AppServicesContext value={services}>{children}</AppServicesContext>;
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error('useAppServices must be used inside <AppServicesProvider>');
  return services;
}
