/**
 * PBC (Provided by Client): shared DTO for service and repository.
 */

export interface PBCItem {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'provided' | 'partial';
  requestedAt?: string; // ISO
  providedAt?: string; // ISO
  documentId?: string;
  periodLabel?: string;
  createdAt: string;
  updatedAt: string;
}
