/**
 * Utility functions for handling Peruvian phone numbers and WhatsApp links.
 * Country code for Peru is 51.
 */

export function cleanPhoneDigits(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Returns a valid phone string with country code 51 for WhatsApp URLs (wa.me/51XXXXXXXXX)
 */
export function formatPhoneForWhatsApp(phone?: string): string {
  if (!phone) return '';
  const digits = cleanPhoneDigits(phone);
  if (!digits) return '';

  // If already starts with 51 and has 11 digits (e.g. 51987654321)
  if (digits.startsWith('51') && digits.length >= 11) {
    return digits;
  }

  // Prepend 51
  return `51${digits}`;
}

/**
 * Formats a phone number for display with Peruvian country code (+51 987 654 321)
 */
export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return '';
  let digits = cleanPhoneDigits(phone);
  if (digits.startsWith('51') && digits.length >= 11) {
    digits = digits.substring(2);
  }
  if (digits.length === 9) {
    return `+51 ${digits.substring(0, 3)} ${digits.substring(3, 6)} ${digits.substring(6)}`;
  }
  return `+51 ${digits}`;
}
