'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFirebaseAuthService } from './auth/firebase-auth';
import type { AuthService, AuthUser } from './auth/types';
import { webConfig } from './config';
import {
  checkDeviceKeySupport,
  createDeviceKey,
  deleteDeviceKey,
  loadDeviceKey,
  persistenceStatus,
  requestPersistentStorage,
  signWithDeviceKey,
  verifyDeviceKey,
  type PersistenceStatus,
  type StoredDeviceKey,
  type SupportResult,
} from './crypto/device-key';
import { createApiClient, type ApiClient } from './graphql/client';

export interface DeviceKeys {
  support(): Promise<SupportResult>;
  load(uid: string): Promise<StoredDeviceKey | null>;
  create(uid: string): Promise<StoredDeviceKey>;
  remove(uid: string): Promise<void>;
  verify(key: StoredDeviceKey): Promise<boolean>;
  sign(key: StoredDeviceKey, message: Uint8Array): Promise<Uint8Array>;
  requestPersistence(): Promise<PersistenceStatus>;
  persistence(): Promise<PersistenceStatus>;
}

export interface Platform {
  isIos(): boolean;
  isStandalone(): boolean;
}

export interface Services {
  auth: AuthService;
  api: ApiClient;
  device: DeviceKeys;
  platform: Platform;
  networkId: string;
  accountParent: string;
  supportEmail: string;
  siteUrl: string;
  payContract: string;
}

export const browserDeviceKeys: DeviceKeys = {
  support: checkDeviceKeySupport,
  load: loadDeviceKey,
  create: createDeviceKey,
  remove: deleteDeviceKey,
  verify: verifyDeviceKey,
  sign: signWithDeviceKey,
  requestPersistence: requestPersistentStorage,
  persistence: persistenceStatus,
};

export const browserPlatform: Platform = {
  isIos() {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  },
  isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  },
};

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ children, services }: { children: ReactNode; services?: Services }) {
  const value = useMemo<Services>(() => {
    if (services) return services;
    const cfg = webConfig();
    const auth = createFirebaseAuthService();
    return {
      auth,
      api: createApiClient({ url: cfg.apiUrl, tokens: auth, sendQueryText: cfg.sendQueryText }),
      device: browserDeviceKeys,
      platform: browserPlatform,
      networkId: cfg.nearNetwork,
      accountParent: cfg.accountParent,
      supportEmail: cfg.supportEmail,
      siteUrl: cfg.siteUrl,
      payContract: cfg.payContract,
    };
  }, [services]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('ServicesProvider is missing');
  return s;
}

export type SessionState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: AuthUser };

export function useSession(): SessionState {
  const { auth } = useServices();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    void auth.ready().then((u) => {
      if (alive) setState(u ? { status: 'signed-in', user: u } : { status: 'signed-out' });
    });
    const off = auth.onChange((u) => {
      if (alive) setState(u ? { status: 'signed-in', user: u } : { status: 'signed-out' });
    });
    return () => {
      alive = false;
      off();
    };
  }, [auth]);
  return state;
}
