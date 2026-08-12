import { useContext } from 'react';
import { PrivacyContext } from '../contexts/PrivacyContext';

export function usePrivacy() {
  return useContext(PrivacyContext);
}
