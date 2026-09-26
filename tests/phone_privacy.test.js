const { serializeListing } = require('../backend/src/utils/securitySanitizer');

describe('Public listing phone privacy', () => {
  const base = { _id: 'listing_x', title: 'Room', suburb: 'Pimville', monthlyRent: 2000, phone: '+27821234567' };

  test('hides the number when the landlord never opted in', () => {
    const out = serializeListing({ ...base, landlordId: { _id: 'l1', fullName: 'A', showPhonePublicly: false } });
    expect(out.phone).toBeUndefined();
  });

  test('hides the number when no consent flag is present at all', () => {
    const out = serializeListing({ ...base, landlordId: 'l1' });
    expect(out.phone).toBeUndefined();
  });

  test('shows the number when the landlord opted in on their profile', () => {
    const out = serializeListing({ ...base, landlordId: { _id: 'l1', fullName: 'A', showPhonePublicly: true } });
    expect(out.phone).toBe('+27821234567');
  });

  test('shows the number when the listing itself is marked public', () => {
    const out = serializeListing({ ...base, showPhonePublicly: true });
    expect(out.phone).toBe('+27821234567');
  });

  test('admins always see the number', () => {
    const out = serializeListing({ ...base, landlordId: 'l1' }, true);
    expect(out.phone).toBe('+27821234567');
  });
});
