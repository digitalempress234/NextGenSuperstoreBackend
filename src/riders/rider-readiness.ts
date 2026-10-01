type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface RiderReadinessSnapshot {
  areaOfOperation: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  onboardingStatus: string;
  documents: Array<{ type: string; documentNumber: string | null; status: ReviewStatus }>;
  licences: Array<{ number?: string | null; status: ReviewStatus }>;
  liveness: Array<{ status: ReviewStatus }>;
  vehicles: Array<{
    type: string;
    photoUrl: string | null;
    status?: string;
    ownershipType: string;
    documents: Array<{ type: string; status: ReviewStatus }>;
  }>;
  bankAccounts: Array<{ isPrimary: boolean; verificationStatus: ReviewStatus }>;
}

const IDENTITY_TYPES = new Set([
  'NIN',
  'NIN_SLIP',
  'NATIONAL_ID',
  'DRIVERS_LICENSE',
  'INTERNATIONAL_PASSPORT',
  'VOTERS_CARD',
]);
const NON_MOTORIZED_TYPES = new Set(['BICYCLE', 'FOOT', 'WALKER']);

export function assessRiderReadiness(profile: RiderReadinessSnapshot) {
  const identity = profile.documents.find(
    (document) => IDENTITY_TYPES.has(document.type.toUpperCase()) && document.documentNumber,
  );
  const verifiedLicence = profile.licences.find((licence) => licence.status === 'APPROVED');
  const licenceWithNumber = profile.licences.find((licence) => Boolean(licence.number));
  const hasVehiclePhoto = profile.vehicles.some((vehicle) => Boolean(vehicle.photoUrl));
  const hasMotorizedVehicle = profile.vehicles.some(
    (vehicle) => !NON_MOTORIZED_TYPES.has(vehicle.type.toUpperCase()),
  );
  const hasRegistration = profile.vehicles.some((vehicle) =>
    vehicle.documents.some((document) => document.type.toUpperCase() === 'VEHICLE_REGISTRATION'),
  );

  const missingApplicationRequirements: string[] = [];
  if (!profile.areaOfOperation?.trim()) missingApplicationRequirements.push('AREA_OF_OPERATION');
  if (!identity && !licenceWithNumber) missingApplicationRequirements.push('IDENTITY_DOCUMENT');
  if (!profile.liveness.length) missingApplicationRequirements.push('LIVENESS_SESSION');
  if (!profile.vehicles.length) missingApplicationRequirements.push('VEHICLE');
  if (profile.vehicles.length && !hasVehiclePhoto)
    missingApplicationRequirements.push('VEHICLE_PHOTO');
  if (!profile.emergencyContactName?.trim() || !profile.emergencyContactPhone?.trim())
    missingApplicationRequirements.push('EMERGENCY_CONTACT');
  if (hasMotorizedVehicle && !licenceWithNumber)
    missingApplicationRequirements.push('DRIVER_LICENSE_VERIFICATION');
  if (hasMotorizedVehicle && !hasRegistration)
    missingApplicationRequirements.push('VEHICLE_REGISTRATION');

  const missingOperationalRequirements = [...missingApplicationRequirements];
  if (identity?.status !== 'APPROVED' && !verifiedLicence)
    missingOperationalRequirements.push('APPROVED_IDENTITY');
  if (!profile.liveness.some((record) => record.status === 'APPROVED'))
    missingOperationalRequirements.push('APPROVED_LIVENESS');

  const hasOperationalVehicle = profile.vehicles.some((vehicle) => {
    if (!vehicle.photoUrl) return false;
    if (NON_MOTORIZED_TYPES.has(vehicle.type.toUpperCase())) return vehicle.status === 'APPROVED';
    const types = new Set(
      vehicle.documents
        .filter((document) => document.status === 'APPROVED')
        .map((document) => document.type.toUpperCase()),
    );
    const registrationApproved = types.has('VEHICLE_REGISTRATION');
    return vehicle.status === 'APPROVED' && registrationApproved && Boolean(verifiedLicence);
  });
  if (profile.vehicles.length && !hasOperationalVehicle)
    missingOperationalRequirements.push('OPERATIONALLY_APPROVED_VEHICLE');

  return {
    canSubmit:
      missingApplicationRequirements.length === 0 &&
      !['UNDER_REVIEW', 'APPROVED', 'SUSPENDED'].includes(profile.onboardingStatus),
    canAcceptDeliveries:
      profile.onboardingStatus === 'APPROVED' && missingOperationalRequirements.length === 0,
    missingApplicationRequirements: [...new Set(missingApplicationRequirements)],
    missingOperationalRequirements: [...new Set(missingOperationalRequirements)],
  };
}
