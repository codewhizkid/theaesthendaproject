export type BusinessStatus = "active" | "paused" | "archived";
export type ProfessionalStatus = "active" | "inactive";
export type ClientStatus = "active" | "lead" | "blocked" | "archived";

export type BusinessAccount = {
  id: string;
  name: string;
  status: BusinessStatus;
  ownerUserId: string;
  createdAt: string;
};

export type ProfessionalProfile = {
  id: string;
  businessId: string;
  userId: string;
  fullName: string;
  email: string;
  status: ProfessionalStatus;
  createdAt: string;
};

export type ClientRecord = {
  id: string;
  businessId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status: ClientStatus;
  createdAt: string;
};

export type ServiceRecord = {
  id: string;
  businessId: string;
  name: string;
  durationMinutes: number;
  price: number;
  isPublic: boolean;
  isActive: boolean;
  policyVersion: string;
  createdAt: string;
};
